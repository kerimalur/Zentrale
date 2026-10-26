// Sammelt regelmässig alle Daten, erkennt Störungen, führt Zeitpläne aus und baut den Gesamtstand.
import net from 'node:net';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { sammleHost } from './collect/host.mjs';
import { container, details } from './collect/docker.mjs';
import { pruefeDienst, piholeDaten, syncthingDaten, jellyfinDaten, nextcloudDaten, vaultwardenDaten, kumaDaten } from './collect/services.mjs';
import { tsStatus } from './collect/tailscale.mjs';
import { energie } from './collect/energie.mjs';
import { speicherAktualisieren, speicherKategorien } from './collect/speicher.mjs';
import { ereignis, telegramBereit } from './ereignisse.mjs';
import { luefterRegeln, luefterStatus } from './luefter.mjs';
import { moebelTemperatur } from './collect/moebel.mjs';
import { moebelLuefterRegeln, moebelLuefterStatus } from './moebelLuefter.mjs';
import { cloudDaten } from './collect/cloud.mjs';
import { szeneSetzen, szenenListe } from './szenen.mjs';
import { backupStarten, backupEingerichtet, formatBytes } from './backup.mjs';
import { gaesteAbgleichen, gaesteStatus } from './gaeste.mjs';
import { aufHost, tagKey, uhrzeit, minutenJetzt, zuMinuten, eingehaengt } from './util.mjs';
import { abgleichen, ausgeschaltet, steuerungSnapshot } from './steuerung.mjs';
import { qbDaten, qbAllesStoppen, vpnPruefen, arrDaten, seerrDaten } from './collect/medien.mjs';
import { pcStatus } from './pc.mjs';
import { tvSnapshot } from './tv.mjs';
import { scrutinyDaten } from './collect/scrutiny.mjs';
import { wudDaten } from './collect/wud.mjs';

const z = {
  host: null,
  container: [],
  checks: {},
  pihole: null,
  sync: null,
  jf: null,
  nc: null,
  kuma: null,
  vw: null,
  ts: null,
  energie: null,
  ping: null,
  updates: null,
  sshNurSchluessel: null,
  gaeste: null,
  health: {}, // Container -> healthy | unhealthy | starting
  medien: { qb: null, vpn: null, arr: {}, seerr: null },
  moebel: null, // { id, temp, zeit } – letzter gültiger Wert des DS18B20
  cloud: null, // Nextcloud-Übersicht (Uploads, Ordner, Fehler)
  wud: null, // What's Up Docker: Container mit neuerem Image
  fehler: {}, // Quelle -> letzte Fehlermeldung
};
const fehlversuche = {};
const dienstZustand = {}; // id -> 'up' | 'down'
const neustarts = {};
const alarmAktiv = {};
let moebelGesehen = false; // Sensor seit dem Start mindestens einmal gefunden
let moebelAusfall = 0; // Runden ohne gültigen Wert

// Möbel-Temperatur nur verwenden, wenn sie frisch ist (höchstens 2 Min alt).
const moebelJetzt = () => (z.moebel && Date.now() - z.moebel.zeit < 120_000 ? z.moebel.temp : null);

const sicher = async (name, fn) => {
  try {
    const r = await fn();
    delete z.fehler[name];
    return r;
  } catch (e) {
    // Auch ins Log (docker logs zentrale) – aber nur, wenn sich der Fehler ändert.
    if (z.fehler[name] !== e.message) console.warn(`[${name}] ${e.message}`);
    z.fehler[name] = e.message;
    return undefined;
  }
};

// ---------- alle 15 Sekunden ----------
export async function schnell() {
  const [host, liste] = await Promise.all([sicher('pi', sammleHost), sicher('docker', container)]);
  if (host) z.host = host;
  if (liste) { z.container = liste; abgleichen(liste); }
  const ergebnisse = await Promise.all(config.dienste.map((d) => pruefeDienst(d)));
  config.dienste.forEach((d, i) => (z.checks[d.id] = ergebnisse[i]));
  z.energie = (await sicher('energie', () => energie({ cpu: z.host?.cpu, laufwerke: z.host?.laufwerke }))) || z.energie;
  luefterRegeln(z.host?.temp ?? null, db().szene.id);
  await moebelRunde();
  await moebelLuefterRegeln({ mt: moebelJetzt(), pt: z.host?.temp ?? null, szeneId: db().szene.id });

  const tag = tagKey();
  const verf = (db().verfuegbarkeit[tag] ||= {});
  for (const d of config.dienste) {
    const st = containerStatus(d.container);
    // Pausiert (Szene) oder bewusst ausgeschaltet (Notbetrieb/du) → kein Alarm, zählt nicht als Ausfall.
    if (st === 'paused' || (st !== 'running' && ausgeschaltet(d.container))) { fehlversuche[d.id] = 0; dienstZustand[d.id] = 'up'; continue; }
    const ok = !!z.checks[d.id]?.up;
    const v = (verf[d.id] ||= [0, 0]);
    v[0] += ok ? 1 : 0;
    v[1] += 1;
    fehlversuche[d.id] = ok ? 0 : (fehlversuche[d.id] || 0) + 1;
    const vorher = dienstZustand[d.id] || 'up';
    if (fehlversuche[d.id] >= 3 && vorher === 'up') {
      dienstZustand[d.id] = 'down';
      ereignis('fehler', `${d.name} ist nicht erreichbar`, { telegram: true, schluessel: 'down-' + d.id });
    } else if (ok && vorher === 'down') {
      dienstZustand[d.id] = 'up';
      ereignis('ok', `${d.name} ist wieder erreichbar`, { telegram: true, schluessel: 'up-' + d.id });
    }
  }
  const tage = Object.keys(db().verfuegbarkeit).sort();
  while (tage.length > 31) delete db().verfuegbarkeit[tage.shift()];

  // Backup-HDD: hat ein eigenes Netzteil und einen Schalter – ist sie aus, merkt man es sonst erst, wenn das Backup fehlt.
  if (backupEingerichtet() && config.backup.mount) {
    const m = config.backup.mount;
    if (!eingehaengt(m)) {
      // Ist sie wieder angeschlossen, selbst einhängen (fstab-Eintrag mit nofail), höchstens alle 2 Min versuchen.
      if (Date.now() - (alarmAktiv.backupMountVersuch || 0) > 120_000) {
        alarmAktiv.backupMountVersuch = Date.now();
        await aufHost('mount', [m], { timeout: 15_000 }).catch(() => {});
      }
    }
    const da = eingehaengt(m);
    z.backupHdd = da;
    if (!da && !alarmAktiv.backupHdd) { alarmAktiv.backupHdd = true; ereignis('warnung', `Backup-HDD (${m}) fehlt – ist sie ausgeschaltet? Gehäuse einschalten, die Zentrale hängt sie dann selbst ein.`, { telegram: true, schluessel: 'backup-hdd' }); }
    if (da && alarmAktiv.backupHdd) { alarmAktiv.backupHdd = false; ereignis('ok', 'Backup-HDD ist wieder da', { telegram: true, schluessel: 'backup-hdd-ok' }); }
  }

  // Pflicht-Laufwerke (z. B. EVO mit Nextcloud-Daten und Filmen)
  for (const m of config.pflichtMounts) {
    const k = 'mount-' + m;
    const da = eingehaengt(m);
    if (!da && !alarmAktiv[k]) { alarmAktiv[k] = true; ereignis('fehler', `${m} ist nicht eingehängt – Nextcloud/Filme nicht verfügbar. USB-Kabel prüfen, dann «sudo mount -a» und betroffene Container neu starten.`, { telegram: true, schluessel: k }); }
    if (da && alarmAktiv[k]) { alarmAktiv[k] = false; ereignis('ok', `${m} ist wieder eingehängt`, { telegram: true, schluessel: k + '-ok' }); }
  }

  // Temperatur und Spannung
  const t = z.host?.temp;
  if (t !== null && t !== undefined) {
    if (t >= 75 && !alarmAktiv.temp) { alarmAktiv.temp = true; ereignis('warnung', `Pi ist heiss: ${t.toFixed(0)} °C`, { telegram: true, schluessel: 'temp' }); }
    if (t < 68) alarmAktiv.temp = false;
  }
  // Unterspannung flackert oft im Sekundentakt – höchstens einmal pro Tag melden (überlebt auch Neustarts).
  if (z.host?.unterspannung && Date.now() - (db().voltGemeldet || 0) > 24 * 3600_000) {
    db().voltGemeldet = Date.now();
    save();
    ereignis('warnung', 'Unterspannung erkannt – Netzteil oder Kabel prüfen (nächste Meldung frühestens in 24 Std)', { telegram: true, schluessel: 'volt' });
  }
  save();
}

// Temperatursensor im Möbel lesen und bei Hitze oder Ausfall warnen.
async function moebelRunde() {
  const m = await sicher('moebel', moebelTemperatur); // null = kein Sensor, undefined = Lesefehler
  if (m) {
    z.moebel = { ...m, zeit: Date.now() };
    if (alarmAktiv.moebelWeg) ereignis('ok', 'Möbel-Temperatursensor liefert wieder Werte', { telegram: true, schluessel: 'moebel-ok' });
    moebelGesehen = true;
    moebelAusfall = 0;
    alarmAktiv.moebelWeg = false;
  } else if (moebelGesehen) {
    moebelAusfall += 1;
    // 4 Runden à 15 s = 1 Minute ohne Wert → einmal melden.
    if (moebelAusfall >= 4 && !alarmAktiv.moebelWeg) {
      alarmAktiv.moebelWeg = true;
      ereignis('warnung', 'Möbel-Temperatursensor antwortet nicht – Kabel am Pi und an der grünen Klemme prüfen', { telegram: true, schluessel: 'moebel-weg' });
    }
  }
  const t = moebelJetzt();
  if (t === null) return;
  const ab = db().einstellungen.moebelWarnAb ?? 40;
  if (t >= ab && !alarmAktiv.moebelHeiss) {
    alarmAktiv.moebelHeiss = true;
    ereignis('warnung', `Im Möbel ist es warm: ${t.toFixed(1)} °C (Grenze ${ab} °C) – Lüfter und Filter prüfen`, { telegram: true, schluessel: 'moebel-heiss' });
  }
  if (t < ab - 3 && alarmAktiv.moebelHeiss) {
    alarmAktiv.moebelHeiss = false;
    ereignis('ok', `Möbel wieder kühler: ${t.toFixed(1)} °C`, { schluessel: 'moebel-kuehl' });
  }
}

// ---------- jede Minute ----------
export async function mittel() {
  await Promise.all([
    sicher('pihole', async () => (z.pihole = await piholeDaten())),
    sicher('syncthing', async () => (z.sync = await syncthingDaten())),
    sicher('jellyfin', async () => (z.jf = await jellyfinDaten())),
    sicher('nextcloud', async () => (z.nc = await nextcloudDaten())),
    cloudJetzt(),
    sicher('kuma', async () => (z.kuma = await kumaDaten())),
    sicher('tailscale', async () => { z.ts = await tsStatus(); tsVerkehr(z.ts.peers); }),
    (async () => { z.vw = vaultwardenDaten(); })(),
    (async () => { z.ping = await ping('1.1.1.1', 443); })(),
  ]);
  // Neustarts erkennen
  for (const c of z.container) {
    const d = await details(c.name).catch(() => null);
    if (!d) continue;
    if (neustarts[c.name] !== undefined && d.restartCount > neustarts[c.name]) {
      ereignis('warnung', `${c.name} hat sich selbst neu gestartet`, { telegram: true, schluessel: 'restart-' + c.name });
    }
    neustarts[c.name] = d.restartCount;
    z.health[c.name] = d.health;
  }
  await medienMittel();
}

// Nextcloud-Übersicht neu laden (auch per Knopf in der Zentrale).
export const cloudJetzt = () => sicher('nextcloud-uebersicht', async () => (z.cloud = await cloudDaten()));

// ---------- Medien (Downloads, VPN, Seerr) ----------
let vpnRunde = 0;
const stalledSeit = {};
const gesehenNeu = new Set();
let neuInitialisiert = false;

async function medienMittel() {
  const m = config.medien;
  const laeuft = (n) => containerStatus(n) === 'running';
  if (laeuft(m.downloadContainer) && m.qbit.passwort) {
    await sicher('qbittorrent', async () => { z.medien.qb = await qbDaten(); haengendeDownloads(); });
  }
  // VPN alle 3 Minuten prüfen (aus dem Download-Container heraus)
  if (laeuft(m.downloadContainer) && containerStatus(m.vpnContainer) && vpnRunde++ % 3 === 0) {
    await sicher('vpn', async () => { z.medien.vpn = await vpnPruefen(); vpnAlarm(); });
  }
  if (laeuft(m.seerr.container) && m.seerr.key) await sicher('seerr', async () => (z.medien.seerr = await seerrDaten()));
}

function vpnAlarm() {
  const v = z.medien.vpn;
  if (!v) return;
  if (v.ok && v.geschuetzt === false) {
    if (!alarmAktiv.leck) {
      alarmAktiv.leck = true;
      qbAllesStoppen().catch(() => {});
      ereignis('fehler', `VPN-Leck: qBittorrent nutzt die IP des Pi (${v.ip}). Alle Downloads wurden gestoppt.`, { telegram: true, schluessel: 'vpn-leck' });
    }
  } else if (v.ok && v.geschuetzt) {
    if (alarmAktiv.leck || alarmAktiv.vpnweg) {
      ereignis('ok', `VPN wieder verbunden · ${v.land}${alarmAktiv.leck ? ' · gestoppte Downloads in qBittorrent wieder starten' : ''}`, { telegram: true, schluessel: 'vpn-ok' });
    }
    alarmAktiv.leck = false;
    alarmAktiv.vpnweg = false;
  } else if (!v.ok && !alarmAktiv.vpnweg) {
    alarmAktiv.vpnweg = true;
    ereignis('warnung', 'VPN getrennt – qBittorrent hat kein Internet, Downloads stehen still', { telegram: true, schluessel: 'vpn-weg' });
  }
}

function haengendeDownloads() {
  const jetzt = Date.now();
  const aktuell = new Set();
  for (const t of z.medien.qb?.torrents || []) {
    if (t.zustand !== 'stalledDL') continue;
    aktuell.add(t.hash);
    stalledSeit[t.hash] ||= jetzt;
    if (jetzt - stalledSeit[t.hash] > 6 * 3600_000 && !alarmAktiv['stall-' + t.hash]) {
      alarmAktiv['stall-' + t.hash] = true;
      ereignis('warnung', `Download hängt seit 6 Std: ${t.name.slice(0, 80)}`, { telegram: true, schluessel: 'stall-' + t.hash });
    }
  }
  for (const h of Object.keys(stalledSeit)) if (!aktuell.has(h)) { delete stalledSeit[h]; delete alarmAktiv['stall-' + h]; }
}

async function medienLangsam() {
  for (const app of config.medien.arr) {
    if (containerStatus(app.container) !== 'running' || !app.key) continue;
    const r = await sicher(app.id, () => arrDaten(app));
    if (!r) continue;
    z.medien.arr[app.id] = r;
    for (const w of r.warnungen.filter((x) => x.typ === 'error')) {
      const k = `arr-${app.id}-${w.text}`;
      if (!alarmAktiv[k]) { alarmAktiv[k] = true; ereignis('warnung', `${app.name}: ${w.text}`, { telegram: true, schluessel: k }); }
    }
    for (const n of r.neu) {
      if (!gesehenNeu.has(n.id)) {
        gesehenNeu.add(n.id);
        if (neuInitialisiert) ereignis('film', `Neu: ${n.titel}`);
      }
    }
  }
  neuInitialisiert = true;
}

// ---------- alle 5 Minuten ----------
export async function langsam() {
  const v = db().verlauf;
  v.push({ t: Date.now(), w: z.energie?.watt ?? null, cpu: z.host?.cpu ?? null, temp: z.host?.temp ?? null, mt: moebelJetzt(), rx: z.host?.netz.rx ?? null, tx: z.host?.netz.tx ?? null });
  const grenze = Date.now() - 24 * 3600_000;
  while (v.length && v[0].t < grenze) v.shift();

  for (const d of config.dienste) {
    const a = (db().antwortzeiten[d.id] ||= []);
    a.push(z.checks[d.id]?.ms ?? null);
    while (a.length > 12) a.shift();
  }

  for (const l of z.host?.laufwerke || []) {
    const p = l.gross ? l.benutzt / l.gross : 0;
    const k = 'disk-' + l.mount;
    if (p >= 0.9 && !alarmAktiv[k]) { alarmAktiv[k] = true; ereignis('warnung', `${l.name} ist zu ${Math.round(p * 100)} % voll`, { telegram: true, schluessel: k }); }
    if (p < 0.85) alarmAktiv[k] = false;
  }
  for (const o of z.sync?.ordner || []) {
    const k = 'sync-' + o.id;
    if (o.fehler > 0 && !alarmAktiv[k]) { alarmAktiv[k] = true; ereignis('warnung', `Syncthing „${o.label}": ${o.fehlerText || o.fehler + ' Fehler'}`, { telegram: true, schluessel: k }); }
    if (o.fehler === 0) alarmAktiv[k] = false;
    for (const p of o.partner) {
      const kk = `sync-off-${o.id}-${p.geraet}`;
      const offenSeit = p.zuletzt ? Date.now() - new Date(p.zuletzt).getTime() : 0;
      if (!p.verbunden && offenSeit > 6 * 3600_000 && !alarmAktiv[kk]) { alarmAktiv[kk] = true; ereignis('warnung', `Syncthing: ${p.geraet} seit über 6 Std nicht erreichbar`); }
      if (p.verbunden) alarmAktiv[kk] = false;
    }
  }
  // Plattengesundheit aus Scrutiny: melden, wenn eine Platte schlechter wird (nicht bei jedem Durchlauf).
  const sc = await sicher('scrutiny', scrutinyDaten);
  if (sc) {
    z.scrutiny = sc;
    const vorher = (db().plattenStatus ||= {});
    for (const p of sc) {
      const alt = vorher[p.wwn];
      if (alt !== undefined && p.status !== alt && p.status > alt) {
        ereignis(p.stufe === 'fehler' ? 'fehler' : 'warnung', `Platte ${p.modell || p.wwn}: ${p.text}`, { telegram: true, schluessel: 'platte-' + p.wwn });
      } else if (alt !== undefined && p.status === 0 && alt > 0) {
        ereignis('ok', `Platte ${p.modell || p.wwn} wieder gesund`);
      }
      vorher[p.wwn] = p.status;
    }
  }

  // Container-Updates aus What's Up Docker: jedes neue Update einmal als Ereignis melden.
  if (config.wud.token) {
    const w = await sicher('wud', wudDaten);
    if (w) {
      z.wud = w;
      const erstesMal = !db().wudBekannt; // beim ersten Abruf nicht alles auf einmal melden
      const bekannt = db().wudBekannt || {};
      const jetzt = {};
      for (const u of w.updates) {
        const k = `${u.name}|${u.nach}`;
        jetzt[k] = true;
        if (!erstesMal && !bekannt[k]) ereignis('info', `Update verfügbar: ${u.name} · ${u.art === 'image' ? 'neues Image (gleicher Tag)' : `${u.von} → ${u.nach}`}`);
      }
      db().wudBekannt = jetzt;
    }
  }

  await medienLangsam();
  await sicher('gaeste', gaesteAbgleichen);
  z.gaeste = await sicher('gaeste-status', () => gaesteStatus());
  z.sshNurSchluessel = await sshStatus();
  save();
}

// ---------- alle 6 Stunden ----------
export async function sehrLangsam() {
  const r = await aufHost('apt', ['list', '--upgradable'], { timeout: 60_000 });
  if (r.ok) z.updates = r.stdout.split('\n').filter((l) => l.includes('/') && !l.startsWith('Listing') && !l.startsWith('Auflistung')).length;
}

export const speicherLauf = () => speicherAktualisieren().catch((e) => (z.fehler.speicher = e.message));

// ---------- Zeitpläne (jede Minute) ----------
const erledigt = new Set();

function inNachtFenster(e, min = minutenJetzt()) {
  const von = zuMinuten(e.nachtVon), bis = zuMinuten(e.nachtBis);
  return von <= bis ? min >= von && min < bis : min >= von || min < bis;
}

// Wenn du nachts selbst eine Szene wählst, übersteuert die Automatik das nicht.
export const laufwerkeListe = () => z.host?.laufwerke || [];
export const tsPeers = () => z.ts?.peers || [];

export function manuelleSzene() {
  if (inNachtFenster(db().einstellungen)) { db().letzteAutoNacht = Date.now(); save(); }
}

export async function zeitplan() {
  const tag = tagKey();
  const min = minutenJetzt();
  const e = db().einstellungen;
  const einmal = async (key, fn) => {
    const k = `${tag}-${key}`;
    if (erledigt.has(k)) return;
    erledigt.add(k);
    if (erledigt.size > 50) erledigt.delete(erledigt.values().next().value);
    await fn();
  };
  if (e.nachtAuto) {
    const inNacht = inNachtFenster(e, min);
    const filmLaeuft = (z.jf?.laeuft || []).some((s) => !s.pausiert);
    // Nur aus "Normal" wechseln (Filmabend bleibt), und nicht mitten in einem Film.
    if (inNacht && db().szene.id === 'normal' && !filmLaeuft && Date.now() - (db().letzteAutoNacht || 0) > 12 * 3600_000) {
      db().letzteAutoNacht = Date.now();
      save();
      await szeneSetzen('nacht', { auto: true }).catch(() => {});
    }
    // Ausserhalb des Fensters automatische Nacht beenden – auch wenn der Pi genau um "bis" neu gestartet hat oder ein Lauf verpasst wurde.
    if (!inNacht && db().szene.id === 'nacht' && db().szene.auto) await szeneSetzen('normal', { auto: true }).catch(() => {});
  }
  if (backupEingerichtet() && db().einstellungen.backupAuto && min === zuMinuten(config.backup.zeit)) await einmal('backup', () => backupStarten().catch(() => {}));
}

// ---------- Hilfen ----------
function containerStatus(name) {
  return z.container.find((c) => c.name === name)?.state || null;
}

function tsVerkehr(peers) {
  const s = db().tsZaehler;
  const tag = tagKey();
  if (s.tag !== tag) {
    s.tag = tag;
    for (const e of Object.values(s.peers || {})) { e.heuteRx = 0; e.heuteTx = 0; }
  }
  s.peers ||= {};
  for (const p of peers) {
    const e = (s.peers[p.id] ||= { letzteRx: p.rx, letzteTx: p.tx, heuteRx: 0, heuteTx: 0 });
    e.heuteRx += p.rx >= e.letzteRx ? p.rx - e.letzteRx : p.rx;
    e.heuteTx += p.tx >= e.letzteTx ? p.tx - e.letzteTx : p.tx;
    e.letzteRx = p.rx;
    e.letzteTx = p.tx;
  }
  save();
}

function ping(host, port) {
  return new Promise((resolve) => {
    const start = performance.now();
    const s = net.connect({ host, port, timeout: 3000 }, () => { resolve(Math.round(performance.now() - start)); s.destroy(); });
    s.on('timeout', () => { s.destroy(); resolve(null); });
    s.on('error', () => resolve(null));
  });
}

async function sshStatus() {
  const r = await aufHost('sshd', ['-T'], { timeout: 10_000 });
  if (!r.ok) return null;
  const m = r.stdout.match(/^passwordauthentication\s+(\w+)/m);
  return m ? m[1] === 'no' : null;
}

export async function sshNurSchluesselSetzen(an) {
  const cmd = an
    ? "printf 'PasswordAuthentication no\\nKbdInteractiveAuthentication no\\n' > /etc/ssh/sshd_config.d/10-zentrale.conf && sshd -t && (systemctl reload ssh || systemctl reload sshd)"
    : 'rm -f /etc/ssh/sshd_config.d/10-zentrale.conf && (systemctl reload ssh || systemctl reload sshd)';
  const r = await aufHost('sh', ['-c', cmd], { timeout: 20_000 });
  if (!r.ok) throw new Error(r.stderr.slice(0, 200) || 'Fehler beim Ändern');
  z.sshNurSchluessel = await sshStatus();
  ereignis('info', an ? 'SSH: Passwort-Login ausgeschaltet, nur noch Schlüssel' : 'SSH: Passwort-Login wieder erlaubt');
  return z.sshNurSchluessel;
}

const zahl = new Intl.NumberFormat('de-CH');
const os2typ = (os) => {
  const o = (os || '').toLowerCase();
  if (o.includes('windows')) return 'pc';
  if (o.includes('android') || o.includes('ios')) return 'handy';
  if (o.includes('mac') || o.includes('linux')) return 'laptop';
  return 'geraet';
};

function bucket12(fn) {
  const jetzt = Date.now();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const von = jetzt - (12 - i) * 2 * 3600_000;
    out.push(fn(db().verlauf.filter((s) => s.t >= von && s.t < von + 2 * 3600_000)));
  }
  return out;
}

function dienstUrl(d) {
  const ov = process.env[`${d.id.toUpperCase()}_URL`];
  if (ov) return ov;
  if (d.id === 'vaultwarden') return `https://${config.hostName}/`;
  return `http://${config.hostName}:${d.port}${d.pfad || '/'}`;
}

function kennzahlen(d, kats) {
  const fehlt = (k) => ({ wert: '—', label: `${k} fehlt in .env` });
  switch (d.id) {
    case 'nextcloud': {
      const k = kats.find((x) => x.name === 'Nextcloud');
      if (z.nc) return { wert: k ? formatBytes(k.bytes) : zahl.format(z.nc.dateien ?? 0), label: `${zahl.format(z.nc.dateien ?? 0)} Dateien · ${z.nc.aktiv24h ?? 0} aktiv heute` };
      return k ? { wert: formatBytes(k.bytes), label: 'Fotos & Dateien' } : { wert: '—', label: 'Fotos & Dateien' };
    }
    case 'jellyfin': {
      if (!z.jf) return fehlt('JELLYFIN_API_KEY');
      if (z.jf.laeuft.length) return { wert: `${z.jf.laeuft.length} läuft`, label: z.jf.laeuft[0].titel + (z.jf.laeuft[0].pausiert ? ' (Pause)' : '') };
      return { wert: zahl.format(z.jf.filme), label: `Filme · ${z.jf.serien} Serien · ${z.jf.alben} Alben` };
    }
    case 'vaultwarden':
      return z.vw ? { wert: formatBytes(z.vw.dbGroesse), label: 'Tresor · verschlüsselt' } : { wert: '—', label: 'Tresor · verschlüsselt' };
    case 'pihole':
      if (!z.pihole) return config.pihole.passwort ? { wert: '—', label: 'Pi-hole antwortet nicht' } : fehlt('PIHOLE_PASSWORT');
      return { wert: zahl.format(z.pihole.geblockt ?? 0), label: `in 24 Std geblockt · ${Math.round(z.pihole.prozent ?? 0)} %` };
    case 'syncthing': {
      if (!z.sync) return fehlt('SYNCTHING_API_KEY');
      const g = z.sync.geraete;
      return { wert: `${g.filter((x) => x.verbunden).length}/${g.length}`, label: 'Geräte verbunden' };
    }
    case 'kuma': {
      if (z.kuma) return { wert: `${z.kuma.oben}/${z.kuma.gesamt}`, label: z.kuma.unten.length ? `Unten: ${z.kuma.unten.join(', ')}` : 'Monitore oben' };
      const v = verfuegbarkeit30();
      return { wert: v === null ? '—' : `${v.toFixed(2).replace('.', ',')} %`, label: 'verfügbar (eigene Messung)' };
    }
  }
  return { wert: '—', label: '' };
}

function verfuegbarkeit30() {
  let ok = 0, ges = 0;
  for (const tag of Object.values(db().verfuegbarkeit)) for (const [a, b] of Object.values(tag)) { ok += a; ges += b; }
  return ges ? (ok / ges) * 100 : null;
}

// ---------- Gesamtstand für die Oberfläche ----------
export function snapshot() {
  const s = db();
  const szene = config.szenen[s.szene.id] || config.szenen.normal;
  const kats = speicherKategorien().kategorien;
  const host = z.host;

  const dienste = config.dienste.map((d) => {
    const cs = containerStatus(d.container);
    const chk = z.checks[d.id] || {};
    let status = 'online';
    if (cs === 'paused') status = 'pausiert';
    else if (cs && cs !== 'running') status = 'offline';
    else if (dienstZustand[d.id] === 'down' || (!chk.up && (fehlversuche[d.id] || 0) >= 3)) status = 'gestoert';
    else if (chk.up === undefined) status = 'unbekannt';
    const k = kennzahlen(d, kats);
    const ab = cs !== 'running' ? ausgeschaltet(d.container) : null;
    return { id: d.id, name: d.name, status, ausGrund: ab ? (ab.durch === 'notbetrieb' ? 'Notbetrieb' : 'von dir ausgeschaltet') : null, ms: chk.ms ?? null, verlauf: (s.antwortzeiten[d.id] || []).map((x) => x ?? 0), kennzahl: k.wert, label: k.label, url: dienstUrl(d) };
  });

  const watt = z.energie?.watt ?? null;
  const pihClients = Object.fromEntries((z.pihole?.clients || []).map((c) => [c.ip, c.anzahl]));
  const namen = parseNamen();
  const peers = z.ts?.peers || [];
  const tsz = s.tsZaehler.peers || {};
  const geraete = peers
    .map((p) => ({
      name: namen[p.name.toLowerCase()] || p.name,
      typ: os2typ(p.os),
      os: p.os,
      ip: p.ip,
      online: p.online,
      zuletzt: p.zuletzt,
      download: tsz[p.id]?.heuteTx ?? 0,
      upload: tsz[p.id]?.heuteRx ?? 0,
      dns: pihClients[p.ip] ?? null,
      gast: p.istGast,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.download + b.upload - (a.download + a.upload));

  const verkehr = bucket12((sam) => {
    let down = 0, up = 0;
    for (let i = 1; i < sam.length; i++) {
      if (sam[i].rx === null || sam[i - 1].rx === null) continue;
      const dr = sam[i].rx - sam[i - 1].rx, dt = sam[i].tx - sam[i - 1].tx;
      if (dr > 0) down += dr;
      if (dt > 0) up += dt;
    }
    return { down, up };
  });
  const energieVerlauf = bucket12((sam) => {
    const w = sam.map((x) => x.w).filter((x) => x !== null);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });

  // Anschlüsse
  const anschluesse = [];
  const lw = host?.laufwerke || [];
  const gezeigt = new Set();
  for (const l of lw) {
    if (gezeigt.has(l.geraet)) continue; // eine SSD mit System + Daten nur einmal als Anschluss
    gezeigt.add(l.geraet);
    if (l.typ === 'sd') anschluesse.push({ port: 'SD', geraet: 'SD-Karte', info: `${formatBytes(l.gross)} · System`, ok: true });
    else if (l.usb) anschluesse.push({ port: l.usb.port, geraet: l.name, info: `${l.modell || l.usb.produkt}${l.usb.uasp ? ' · UASP' : ''}${l.typ === 'hdd' ? (l.schlaeft ? ' · schläft' : ' · wach') : ''}`, ok: l.typ === 'hdd' && l.schlaeft ? null : true });
  }
  const speicherProdukte = new Set(lw.map((l) => l.usb?.produkt).filter(Boolean));
  for (const g of host?.usb.geraete || []) {
    if (speicherProdukte.has(g.produkt)) continue;
    anschluesse.push({ port: g.speed >= 5000 ? 'USB 3.0' : 'USB 2.0', geraet: g.produkt, info: 'USB-Gerät', ok: true });
  }
  const frei = Math.max(0, 4 - (host?.usb.belegt || 0));
  if (host) anschluesse.push({ port: 'USB', geraet: `${frei} von 4 frei`, info: 'blau = USB 3.0', ok: null });
  if (host?.lan) anschluesse.push({ port: 'LAN', geraet: 'Ethernet', info: host.lan.verbunden ? `${host.lan.mbit >= 1000 ? host.lan.mbit / 1000 + ' Gbit/s' : host.lan.mbit + ' Mbit/s'}` : 'nicht verbunden', ok: host.lan.verbunden });
  const lf = luefterStatus();
  if (lf.vorhanden) anschluesse.push({ port: 'GPIO', geraet: 'Lüfter (PWM)', info: lf.prozent ? `${lf.prozent} %` : 'aus', ok: !!lf.prozent || null });
  else {
    const ml = moebelLuefterStatus();
    const modusText = ml.modus === 'auto' ? 'Auto' : ml.modus === 'an' ? 'dauernd an' : 'von Hand aus';
    anschluesse.push({ port: 'GPIO', geraet: 'Möbel-Lüfter (Relais)', info: !ml.vorhanden ? 'Relais nicht erreichbar' : ml.an === null ? 'wird geprüft' : `${ml.an ? 'laufen' : 'aus'} · ${modusText}`, ok: !ml.vorhanden ? false : ml.an === null ? null : ml.an || null });
  }
  const mtJetzt = moebelJetzt();
  if (z.moebel || moebelGesehen) anschluesse.push({ port: 'GPIO', geraet: 'Temperatursensor Möbel', info: mtJetzt === null ? 'keine Werte' : `${mtJetzt.toFixed(1).replace('.', ',')} °C`, ok: mtJetzt !== null });
  if (host) anschluesse.push({ port: 'USB-C', geraet: 'Netzteil', info: host.unterspannung ? 'Unterspannung!' : host.unterspannung === false ? 'Spannung ok' : 'keine Messung', ok: host.unterspannung ? false : true });

  // Synchronisation & Backup
  const sync = [];
  for (const o of z.sync?.ordner || []) {
    for (const p of o.partner) {
      const offen = !p.verbunden;
      sync.push({
        titel: `${o.label} ↔ ${p.geraet}`,
        unter: o.pausiert ? 'pausiert' : offen ? (p.zuletzt ? 'Gerät offline' : 'noch nie verbunden') : p.prozent === null || p.prozent >= 100 ? 'synchron' : `${p.prozent} % synchron`,
        t: offen ? p.zuletzt : o.letzteDatei?.at || p.zuletzt,
        art: offen && p.zuletzt && Date.now() - new Date(p.zuletzt).getTime() > 6 * 3600_000 ? 'warnung' : offen ? 'aus' : 'ok',
      });
    }
    if (o.fehler) sync.push({ titel: `${o.label}: Fehler`, unter: o.fehlerText || `${o.fehler} Dateien`, t: null, art: 'fehler' });
  }
  if (z.nc) sync.push({ titel: 'Nextcloud', unter: `${zahl.format(z.nc.dateien ?? 0)} Dateien · ${z.nc.aktiv24h ?? 0} Nutzer aktiv in 24 Std`, t: null, art: 'ok' });
  const b = s.backup;
  if (backupEingerichtet()) {
    sync.push(b.laeuft
      ? { titel: 'Backup → HDD', unter: 'läuft gerade …', t: null, art: 'info' }
      : b.letzte
        ? { titel: 'Backup → HDD', unter: b.letzte.ok ? `${formatBytes(b.letzte.bytes)} übertragen · ${Math.round(b.letzte.dauerS / 60)} Min` : `Fehler: ${b.letzte.fehler}`, t: new Date(b.letzte.zeit).toISOString(), art: b.letzte.ok ? 'ok' : 'fehler' }
        : { titel: 'Backup → HDD', unter: 'noch nie gelaufen', t: null, art: 'aus' });
    sync.push(s.einstellungen.backupAuto
      ? { titel: 'Nächstes Backup', unter: 'automatisch', t: null, art: 'aus', wann: `täglich ${config.backup.zeit}` }
      : { titel: 'Automatisches Backup', unter: 'ausgeschaltet – nur von Hand', t: null, art: 'aus' });
  } else {
    sync.push({ titel: 'Backup', unter: 'Noch nicht eingerichtet (BACKUP_ZIEL in .env)', t: null, art: 'aus' });
  }

  const hinweise = [];
  if (!config.pihole.passwort) hinweise.push('PIHOLE_PASSWORT fehlt – Pi-hole-Zahlen fehlen');
  if (!config.syncthing.apiKey) hinweise.push('SYNCTHING_API_KEY fehlt – Synchronisation fehlt');
  if (!config.jellyfin.apiKey) hinweise.push('JELLYFIN_API_KEY fehlt – Filme/Streams fehlen');
  if (!config.tailscale.apiKey) hinweise.push('TS_API_KEY fehlt – Gäste deaktiviert');
  if (!telegramBereit()) hinweise.push('NTFY_URL/NTFY_TOKEN (oder TELEGRAM_BOT_TOKEN/CHAT_ID) fehlen – keine Alarme aufs Handy');
  if (!config.energie.shellyUrl) hinweise.push('SHELLY_URL fehlt – Strom wird geschätzt');
  if (z.backupHdd === false) hinweise.push(`Backup-HDD (${config.backup.mount}) fehlt – Gehäuse eingeschaltet? Das nächste Backup fällt sonst aus`);
  const mc = config.medien;
  const gibt = (n) => z.container.some((c) => c.name === n);
  if (gibt(mc.downloadContainer) && !mc.qbit.passwort) hinweise.push('QBIT_PASSWORT fehlt – Downloads fehlen');
  for (const a of mc.arr) if (gibt(a.container) && !a.key) hinweise.push(`${a.id.toUpperCase()}_API_KEY fehlt – ${a.name} fehlt`);
  if (gibt(mc.seerr.container) && !mc.seerr.key) hinweise.push('SEERR_API_KEY fehlt – Anfragen fehlen');
  if (gibt('wud') && !config.wud.token) hinweise.push('WUD_TOKEN fehlt – Container-Updates fehlen');
  for (const [q, f] of Object.entries(z.fehler)) hinweise.push(`${q}: ${f}`);

  return {
    zeit: Date.now(),
    uhrzeit: uhrzeit(),
    szene: { id: s.szene.id, name: szene.name, seit: s.szene.seit, auto: s.szene.auto },
    szenen: szenenListe(),
    energie: { watt, quelle: z.energie?.quelle || 'schaetzung', chfMonat: watt === null ? null : (watt * 24 * 30) / 1000 * config.energie.strompreis, verlauf: energieVerlauf },
    dienste,
    verfuegbarkeit30: verfuegbarkeit30(),
    pi: host
      ? {
          cpu: host.cpu, ramBenutzt: host.ram.benutzt, ramTotal: host.ram.total, temp: host.temp, mhz: host.takt.mhz, maxMhz: host.takt.maxMhz, governor: host.takt.governor,
          unterspannung: host.unterspannung, uptimeS: host.info.uptimeS, last: host.info.last, modell: host.info.modell, os: host.info.os, kernel: host.info.kernel, hostname: host.info.hostname,
          kerne: host.info.kerne, updates: z.updates, container: { laufen: z.container.filter((c) => c.state === 'running').length, gesamt: z.container.length },
        }
      : null,
    luefter: lf,
    moebel: moebelSnapshot(),
    cloud: z.cloud || { bereit: false, grund: z.fehler['nextcloud-uebersicht'] || 'Wird geladen …' },
    anschluesse,
    laufwerke: lw.map((l) => {
      const g = (z.scrutiny || []).find((s) => s.geraet && s.geraet === l.geraet);
      return {
        name: l.name, modell: l.modell, mount: l.mount, typ: l.typ, gross: l.gross, benutzt: l.benutzt, frei: l.frei,
        port: l.usb?.port || (l.typ === 'sd' ? 'SD' : ''), schlaeft: l.schlaeft,
        gesundheit: g ? { stufe: g.stufe, text: g.text, temp: g.temp, stunden: g.stunden, zeit: g.zeit } : null,
      };
    }),
    scrutinyUrl: config.scrutiny.url || `http://${config.hostName}:${config.scrutiny.port}`,
    containerUpdates: containerUpdatesSnapshot(),
    speicher: { kategorien: kats, zeit: speicherKategorien().zeit },
    netz: {
      geraete,
      verkehr,
      heute: verkehr.slice(-12).reduce((a, x) => ({ down: a.down + x.down, up: a.up + x.up }), { down: 0, up: 0 }),
      lan: host?.lan || null,
      ping: z.ping,
      tailscale: z.ts ? { aktiv: true, ip: z.ts.selbst.ip, dns: z.ts.selbst.dns } : { aktiv: false, ip: '', dns: '' },
      pihole: z.pihole ? { anfragen: z.pihole.anfragen, geblockt: z.pihole.geblockt, prozent: z.pihole.prozent } : null,
    },
    sync,
    backup: { eingerichtet: backupEingerichtet(), laeuft: b.laeuft, letzte: b.letzte, auto: !!s.einstellungen.backupAuto, zeit: config.backup.zeit },
    ereignisse: s.ereignisse.slice(0, 30),
    gaeste: {
      bereit: !!z.gaeste?.bereit,
      grund: z.gaeste?.grund ?? (config.tailscale.apiKey ? 'Wird geprüft …' : 'TS_API_KEY fehlt in .env'),
      aclVorschlag: z.gaeste?.aclVorschlag || '',
      jellyfinUrl: `http://${config.hostName}:${config.dienste.find((d) => d.id === 'jellyfin').port}`,
      jellyfinBereit: !!config.jellyfin.apiKey,
      liste: s.gaeste.map((g) => ({ id: g.id, name: g.name, email: g.email, jellyfin: g.jellyfin, jfName: g.jf?.name || null, jfPasswort: g.jf?.passwort || null, erstellt: g.erstellt, bis: g.bis, status: g.status, geraete: g.geraete, inviteUrl: g.inviteUrl })),
    },
    einstellungen: s.einstellungen,
    faehigkeiten: {
      telegram: telegramBereit(),
      hddSchlaf: !!config.backup.disk,
      luefter: lf.vorhanden,
      moebel: !!z.moebel || moebelGesehen,
      sshNurSchluessel: z.sshNurSchluessel,
      backup: backupEingerichtet(),
      shelly: !!config.energie.shellyUrl,
    },
    medien: medienSnapshot(),
    steuerung: steuerungSnapshot(z.container, z.ts ? true : z.fehler.tailscale ? false : null),
    pc: pcStatus(z.ts?.peers),
    tv: tvSnapshot(),
    hostName: config.hostName,
    hinweise,
  };
}

function moebelSnapshot() {
  const temp = moebelJetzt();
  const werte = db().verlauf.map((x) => x.mt).filter((x) => typeof x === 'number');
  const mittel = (xs) => {
    const w = xs.map((x) => x.mt).filter((x) => typeof x === 'number');
    return w.length ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : null;
  };
  return {
    vorhanden: !!z.moebel || moebelGesehen,
    temp,
    zeit: z.moebel?.zeit ?? null,
    min24: werte.length ? Math.min(...werte) : null,
    max24: werte.length ? Math.max(...werte) : null,
    verlauf: bucket12(mittel),
    warnAb: db().einstellungen.moebelWarnAb ?? 40,
    luefter: moebelLuefterStatus(),
  };
}

function medienSnapshot() {
  const m = config.medien;
  const c = (n) => z.container.find((x) => x.name === n) || null;
  const url = (port) => `http://${config.hostName}:${port}`;
  const apps = [
    { id: 'qbittorrent', name: 'qBittorrent', container: m.downloadContainer, url: url(m.qbit.port) },
    { id: 'gluetun', name: 'Gluetun (VPN)', container: m.vpnContainer, url: null },
    ...m.arr.map((a) => ({ id: a.id, name: a.name, container: a.container, url: url(a.port) })),
    { id: 'seerr', name: 'Seerr', container: m.seerr.container, url: url(m.seerr.port) },
    ...m.weitere.map((n) => ({ id: n, name: n === 'flaresolverr' ? 'FlareSolverr' : n, container: n, url: null })),
  ]
    .filter((a) => c(a.container))
    .map((a) => {
      const k = c(a.container);
      const d = z.medien.arr[a.id];
      const health = z.health[a.container] || null;
      return {
        id: a.id,
        name: a.name,
        url: a.url,
        zustand: k.state === 'running' ? (health === 'unhealthy' ? 'gestoert' : 'online') : k.state === 'paused' ? 'pausiert' : 'offline',
        laufzeit: k.status,
        version: d?.version || null,
        warnungen: d?.warnungen || [],
        warteschlange: d?.warteschlange ?? null,
        anzahl: d?.anzahl ?? null,
        anzahlLabel: d?.anzahlLabel || '',
        vorhanden: d?.vorhanden ?? null,
        gesamt: d?.gesamt ?? null,
        detail: d?.detail || '',
        fehlt: d?.fehlt || [],
        fehler: z.fehler[a.id] || null,
        ausgeschaltet: k.state !== 'running' && !!ausgeschaltet(a.container),
      };
    });
  if (!apps.length) return null;
  const alle = Object.values(z.medien.arr);
  const v = z.medien.vpn;
  return {
    vpn: v ? { ...v, gluetun: c(m.vpnContainer)?.state || null, health: z.health[m.vpnContainer] || null, ausgeschaltet: c(m.vpnContainer)?.state !== 'running' && !!ausgeschaltet(m.vpnContainer) } : { ok: null, geschuetzt: null, gluetun: c(m.vpnContainer)?.state || null, health: z.health[m.vpnContainer] || null, ausgeschaltet: c(m.vpnContainer)?.state !== 'running' && !!ausgeschaltet(m.vpnContainer) },
    downloads: z.medien.qb,
    // Warum Downloads fehlen (statt pauschal "Passwort fehlt")
    downloadsGrund: z.medien.qb
      ? null
      : !m.qbit.passwort
        ? 'QBIT_PASSWORT fehlt in .env'
        : c(m.downloadContainer)?.state !== 'running'
          ? 'qBittorrent läuft nicht'
          : z.fehler.qbittorrent || 'Wird geladen …',
    arrGrund: m.arr.filter((a) => a.id !== 'prowlarr' && c(a.container)).map((a) => (!a.key ? `${a.id.toUpperCase()}_API_KEY fehlt` : z.fehler[a.id] ? `${a.name}: ${z.fehler[a.id]}` : !z.medien.arr[a.id] ? `${a.name} wird geladen …` : null)).filter(Boolean),
    apps,
    demnaechst: alle.flatMap((a) => a.demnaechst).filter((x) => x.wann).sort((a, b) => new Date(a.wann) - new Date(b.wann)).slice(0, 10),
    neu: alle.flatMap((a) => a.neu).filter((x) => x.wann).sort((a, b) => new Date(b.wann) - new Date(a.wann)).slice(0, 8),
    seerr: z.medien.seerr,
    filmabendDrosseln: m.filmabendDrosseln,
  };
}

function parseNamen() {
  try { return Object.fromEntries(Object.entries(JSON.parse(process.env.GERAETE_NAMEN || '{}')).map(([k, v]) => [k.toLowerCase(), v])); } catch { return {}; }
}

// Container-Updates für Oberfläche und Statusbericht (mit Compose-Ordner für den Update-Befehl).
function containerUpdatesSnapshot() {
  const url = config.wud.url || `http://${config.hostName}:${config.wud.port}`;
  if (!config.wud.token) return { bereit: false, grund: 'WUD_TOKEN fehlt in .env', url, liste: [], gesamt: 0, zeit: null, fehler: [] };
  if (!z.wud) return { bereit: false, grund: z.fehler.wud || 'Wird geladen …', url, liste: [], gesamt: 0, zeit: null, fehler: [] };
  const liste = z.wud.updates.map((u) => {
    const c = z.container.find((x) => x.name === u.name);
    return { ...u, ordner: c?.ordner || null, dienst: c?.dienst || null };
  });
  return { bereit: true, grund: z.fehler.wud || null, url, liste, gesamt: z.wud.gesamt, zeit: z.wud.zeit, fehler: z.wud.fehler };
}
