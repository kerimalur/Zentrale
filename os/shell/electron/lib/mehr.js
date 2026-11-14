// Weitere Systemfunktionen von ZentraleOS: schnelle Befehle (Socket), Zwischenablage, Papierkorb, Fotos,
// Datenträger, Sicherheits-Zentrale, Netzwerkwächter, Bot-Wächter, Backup, «Schlafen gehen», Fokusmodus,
// Installation auf die Platte. Wie in system.js: bewährte Werkzeuge aufrufen, Root nur über den Helfer.
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, clipboard } = require('electron');
const system = require('./system');
const einstellungen = require('./einstellungen');
const protokoll = require('./protokoll');
const { lauf } = system;

let sag = () => {};                       // Hinweis an die Oberfläche: sag(text, art)
const HEIM = os.homedir();
const lies = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const jetztText = () => new Date().toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------- Schnelle Befehle: «zos <befehl>» schreibt in diesen Socket ----------
function socketStarten(aufBefehl) {
  const pfad = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), 'zos.sock');
  try { fs.unlinkSync(pfad); } catch {}
  const s = net.createServer((c) => { let t = ''; c.on('data', (d) => { t += d; }); c.on('end', () => { const b = t.trim().split('\n')[0]; if (/^[a-zA-Z-]{1,40}$/.test(b)) aufBefehl(b); }); c.on('error', () => {}); });
  s.on('error', () => {});
  s.listen(pfad, () => { try { fs.chmodSync(pfad, 0o600); } catch {} });
  return s;
}

// ---------- Zwischenablage-Verlauf (nur Text, nur im Speicher) ----------
const ablage = []; let ablageWache = null;
function ablageMerken(text) {
  const t = String(text || ''); if (!t.trim() || t.length > 20000) return;
  const i = ablage.findIndex((x) => x.text === t); if (i >= 0) ablage.splice(i, 1);
  ablage.unshift({ text: t, zeit: Date.now() }); if (ablage.length > 40) ablage.length = 40;
}
function ablageStarten() {
  if (ablageWache || process.platform !== 'linux') return;
  try {
    ablageWache = spawn('wl-paste', ['--type', 'text', '--watch', 'sh', '-c', 'echo x'], { stdio: ['ignore', 'pipe', 'ignore'] });
    ablageWache.stdout.on('data', async () => { const r = await lauf('wl-paste', ['-n', '--type', 'text'], { timeout: 3000 }); if (r.ok) ablageMerken(r.aus); });
    ablageWache.on('error', () => { ablageWache = null; }); ablageWache.on('exit', () => { ablageWache = null; });
  } catch { ablageWache = null; }
}
const ablageListe = () => ({ ok: true, liste: ablage.map((x, i) => ({ nr: i, text: x.text.slice(0, 400), lang: x.text.length, zeit: x.zeit })) });
function ablageNehmen(nr) { const x = ablage[Number(nr)]; if (!x) return { ok: false, fehler: 'Eintrag nicht gefunden' }; clipboard.writeText(x.text); ablageMerken(x.text); return { ok: true }; }
function ablageLeeren() { ablage.length = 0; return { ok: true }; }

// ---------- Papierkorb (Freedesktop-Standard: ~/.local/share/Trash) ----------
const KORB = path.join(HEIM, '.local/share/Trash');
function papierkorb() {
  const liste = [];
  let namen = []; try { namen = fs.readdirSync(path.join(KORB, 'files')); } catch {}
  for (const n of namen) {
    const info = lies(path.join(KORB, 'info', n + '.trashinfo'));
    let von = (info.match(/^Path=(.*)$/m) || [])[1] || ''; try { von = decodeURIComponent(von); } catch {}
    let st = null; try { st = fs.lstatSync(path.join(KORB, 'files', n)); } catch { continue; }
    liste.push({ name: n, von, geloescht: (info.match(/^DeletionDate=(.*)$/m) || [])[1] || '', ordner: st.isDirectory(), groesse: st.isDirectory() ? 0 : st.size, pfad: path.join(KORB, 'files', n) });
  }
  liste.sort((a, b) => String(b.geloescht).localeCompare(String(a.geloescht)));
  return { ok: true, liste };
}
const korbName = (n) => (/^[^/]+$/.test(String(n)) && n !== '.' && n !== '..' ? String(n) : null);
function papierkorbZurueck(name) {
  const n = korbName(name); if (!n) return { ok: false, fehler: 'Ungültiger Name' };
  const e = papierkorb().liste.find((x) => x.name === n); if (!e || !e.von) return { ok: false, fehler: 'Ursprünglicher Ort unbekannt' };
  if (fs.existsSync(e.von)) return { ok: false, fehler: 'Am ursprünglichen Ort liegt schon etwas mit diesem Namen' };
  fs.mkdirSync(path.dirname(e.von), { recursive: true });
  try { fs.renameSync(e.pfad, e.von); } catch { fs.cpSync(e.pfad, e.von, { recursive: true }); fs.rmSync(e.pfad, { recursive: true, force: true }); }
  fs.rmSync(path.join(KORB, 'info', n + '.trashinfo'), { force: true });
  return { ok: true, pfad: e.von };
}
function papierkorbLeeren(name) {
  if (name) { const n = korbName(name); if (!n) return { ok: false, fehler: 'Ungültiger Name' }; fs.rmSync(path.join(KORB, 'files', n), { recursive: true, force: true }); fs.rmSync(path.join(KORB, 'info', n + '.trashinfo'), { force: true }); return { ok: true }; }
  for (const u of ['files', 'info']) { fs.rmSync(path.join(KORB, u), { recursive: true, force: true }); fs.mkdirSync(path.join(KORB, u), { recursive: true }); }
  return { ok: true };
}

// ---------- Fotos ----------
const BILD = /\.(jpe?g|png|webp|gif|avif|bmp|heic)$/i;
function bilderOrdner() { for (const n of ['Bilder', 'Pictures']) { const p = path.join(HEIM, n); if (fs.existsSync(p)) return p; } const p = path.join(HEIM, 'Bilder'); fs.mkdirSync(p, { recursive: true }); return p; }
function fotos() {
  const wurzeln = [bilderOrdner(), ...((einstellungen.alle().fotos || {}).ordner || [])]; const liste = [];
  const geh = (ordner, tiefe) => {
    let e = []; try { e = fs.readdirSync(ordner, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      if (x.name.startsWith('.') || liste.length >= 3000) continue; const p = path.join(ordner, x.name);
      if (x.isDirectory()) { if (tiefe < 4) geh(p, tiefe + 1); } else if (BILD.test(x.name)) { try { const st = fs.statSync(p); liste.push({ pfad: p, name: x.name, ordner: path.basename(ordner), zeit: st.mtimeMs, groesse: st.size, url: protokoll.lokalUrl(p) }); } catch {} }
    }
  };
  for (const w of wurzeln) geh(w, 0);
  liste.sort((a, b) => b.zeit - a.zeit);
  return { ok: true, liste, ordner: wurzeln };
}

// ---------- Datenträger ----------
async function datentraeger() {
  const r = await lauf('lsblk', ['-J', '-b', '-o', 'NAME,PATH,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINTS,MODEL,SERIAL,TRAN,ROTA,RM,RO,FSUSED,FSAVAIL,UUID,PTTYPE']);
  if (!r.ok) return { ok: false, fehler: r.fehler };
  let d = {}; try { d = JSON.parse(r.aus); } catch { return { ok: false, fehler: 'lsblk-Ausgabe unlesbar' }; }
  const eben = (x) => ({ name: x.name, pfad: x.path, groesse: Number(x.size) || 0, typ: x.type, fs: x.fstype || '', label: x.label || '', orte: (x.mountpoints || []).filter(Boolean), modell: (x.model || '').trim(), serie: x.serial || '', bus: x.tran || '', dreht: !!x.rota, wechsel: !!x.rm, nurLesen: !!x.ro, benutzt: Number(x.fsused) || 0, frei: Number(x.fsavail) || 0, uuid: x.uuid || '', tabelle: x.pttype || '', teile: (x.children || []).map(eben) });
  return { ok: true, platten: (d.blockdevices || []).filter((x) => !/^(loop|ram|zram|sr)/.test(x.name)).map(eben) };
}
async function ordnerAnalyse(pfad) {
  const p = path.resolve(String(pfad || HEIM));
  // Kein -x: im Live-System (Overlay) liegen Dateien auf einem anderen Gerät als ihr Ordner und würden sonst nicht gezählt.
  const r = await lauf('du', ['-B1', '-d1', ...(p === '/' ? ['--exclude=/proc', '--exclude=/sys', '--exclude=/dev', '--exclude=/run', '--exclude=/mnt', '--exclude=/media'] : []), p], { timeout: 180000 });
  const zeilen = (r.aus || '').split('\n').filter(Boolean).map((z) => { const i = z.indexOf('\t'); return { groesse: Number(z.slice(0, i)), pfad: z.slice(i + 1) }; });
  const gesamt = (zeilen.find((z) => z.pfad === p) || {}).groesse || 0;
  const liste = zeilen.filter((z) => z.pfad !== p).sort((a, b) => b.groesse - a.groesse).slice(0, 60).map((z) => ({ ...z, name: path.basename(z.pfad) }));
  // Dateien direkt im Ordner zusammenfassen
  const inOrdnern = liste.reduce((a, z) => a + z.groesse, 0);
  return { ok: true, pfad: p, eltern: path.dirname(p), gesamt, liste, dateienHier: Math.max(0, gesamt - inOrdnern) };
}
const GERAET_OK = (g) => /^\/dev\/(sd[a-z]\d*|vd[a-z]\d*|nvme\d+n\d+(p\d+)?|mmcblk\d+(p\d+)?|dm-\d+|mapper\/[\w-]+)$/.test(String(g));
const einhaengen = (g) => (GERAET_OK(g) ? lauf('udisksctl', ['mount', '-b', g, '--no-user-interaction'], { timeout: 20000 }) : { ok: false, fehler: 'Ungültiges Gerät' });
const aushaengen = (g) => (GERAET_OK(g) ? lauf('udisksctl', ['unmount', '-b', g, '--no-user-interaction'], { timeout: 20000 }) : { ok: false, fehler: 'Ungültiges Gerät' });
const smart = (g, pw) => system.alsRoot('smart', [String(g)], { passwort: pw, timeout: 30000 });

// ---------- Sicherheits-Zentrale ----------
async function sicherheit(extra = {}) {
  const e = einstellungen.alle(); const punkte = [];
  const p = (id, name, zustand, text, bereich) => punkte.push({ id, name, zustand, text, bereich });
  const [fw, ssh, lauscher, upd, blk, ts] = await Promise.all([
    Promise.resolve().then(() => system.firewallLesen()).catch(() => ({})), lauf('systemctl', ['is-active', 'ssh']), lauf('ss', ['-tulnH']), lauf('sh', ['-c', 'apt list --upgradable 2>/dev/null | tail -n +2 | wc -l']),
    lauf('lsblk', ['-rno', 'TYPE']), system.tailscale().catch(() => ({})),
  ]);
  const fwAn = !!(fw && (fw.an ?? fw.konfig?.an));
  p('firewall', 'Firewall', fwAn ? 'gut' : 'schlecht', fwAn ? 'Eingehende Verbindungen werden verworfen, ausser den erlaubten.' : 'Die Firewall ist aus.', 'firewall');
  const offen = [...new Set((lauscher.aus || '').split('\n').map((z) => z.trim().split(/\s+/)).filter((t) => t.length > 4 && !/^(127\.|\[::1\]|::1)/.test(t[4]) && !/%lo:/.test(t[4])).map((t) => t[0] + ' ' + t[4].split(':').pop()))];
  p('ports', 'Lauschende Dienste', offen.length > 6 ? 'warnung' : 'gut', offen.length ? `${offen.length} Dienste hören auf Netzwerk-Adressen: ${offen.slice(0, 8).join(', ')}. Von aussen erreichbar ist nur, was die Firewall erlaubt.` : 'Kein Dienst hört auf Netzwerk-Adressen.', 'netzwaechter');
  const sshAn = (ssh.aus || '').trim() === 'active'; const nurTs = /ListenAddress 100\./.test(lies('/etc/ssh/sshd_config.d/zentraleos.conf'));
  p('ssh', 'Fernzugriff (SSH)', !sshAn ? 'gut' : nurTs ? 'gut' : 'warnung', !sshAn ? 'Aus.' : nurTs ? 'An, aber nur über Tailscale erreichbar.' : 'An und nicht auf Tailscale beschränkt.', 'fernzugriff');
  const n = Number((upd.aus || '0').trim()) || 0;
  p('updates', 'Updates', n > 25 ? 'warnung' : 'gut', n ? `${n} Pakete können aktualisiert werden.` : 'Alles aktuell (Stand der letzten Suche).', 'updates');
  const auto = /Unattended-Upgrade "1"/.test(lies('/etc/apt/apt.conf.d/20auto-upgrades'));
  p('auto', 'Automatische Sicherheitsupdates', auto ? 'gut' : 'warnung', auto ? 'An. Sie laufen im Wartungsfenster und nie bei offenen Positionen.' : 'Aus.', 'updates');
  const live = /boot=live/.test(lies('/proc/cmdline')); const krypt = /crypt/.test(blk.aus || '');
  if (live || !waechter()) p('platte', 'Plattenverschlüsselung', live ? 'info' : krypt ? 'gut' : 'warnung', live ? 'Live-System vom Stick: nichts wird dauerhaft gespeichert.' : krypt ? 'Die Systemplatte ist verschlüsselt.' : 'Die Systemplatte ist nicht verschlüsselt. Wer den Rechner mitnimmt, kann die Daten lesen.', 'datentraeger');
  p('pin', 'Sperre', extra.pinGesetzt ? 'gut' : 'schlecht', extra.pinGesetzt ? 'Ein Code ist gesetzt. Ohne ihn kommt niemand an die Oberfläche.' : 'Es ist kein Code gesetzt.', 'anmeldung');
  const aus = Number(e.ruhe?.bildschirmAusMin) || 0; const sperr = Number(e.anmeldung?.autoSperrenMin) || 0;
  p('auto-sperre', 'Automatisch sperren', aus || sperr ? 'gut' : 'warnung', aus || sperr ? `Nach ${Math.min(...[aus, sperr].filter(Boolean))} Minuten ohne Eingabe.` : 'Der Rechner sperrt sich nie von selbst.', 'ruhe');
  p('tailscale', 'Tailscale', ts && ts.angemeldet ? 'gut' : 'info', ts && ts.angemeldet ? 'Verbunden.' : 'Nicht verbunden. Die Zentrale auf dem Pi ist dann nicht erreichbar.', 'tailscale');
  let sb = null; try { const d = fs.readdirSync('/sys/firmware/efi/efivars').find((x) => x.startsWith('SecureBoot-')); if (d) sb = fs.readFileSync('/sys/firmware/efi/efivars/' + d)[4] === 1; } catch {}
  p('secureboot', 'Secure Boot', sb ? 'gut' : 'info', sb === null ? 'Nicht feststellbar.' : sb ? 'An.' : 'Aus. Für den Betrieb nicht nötig; es schützt gegen veränderte Startprogramme.', null);
  const sudoFrei = (await lauf('sudo', ['-n', 'true'], { timeout: 4000 })).ok;
  p('root', 'Administrator-Rechte', sudoFrei ? 'schlecht' : 'gut', sudoFrei ? 'Root-Rechte sind ohne Passwort möglich.' : 'Nur mit Passwort.', null);
  const w = waechter(); const sy = (w && w.system) || {};
  p('waechter', 'Wächter', w ? 'gut' : 'schlecht', w ? 'Läuft als eigener Dienst: meldet Portscans, neue Geräte, USB, Fehlversuche, Köder-Datei und Bot-Ausfälle aufs Handy.' : 'Der Wächter-Dienst läuft nicht.', null);
  if (w) {
    p('usb', 'USB-Schutz', sy.usbguard ? 'gut' : 'warnung', sy.usbguard ? 'Unbekannte USB-Geräte bleiben gesperrt, bis du sie erlaubst (Speichersticks sind erlaubt).' : 'USBGuard läuft nicht.', 'usb');
    p('oom', 'Speicher-Notbremse', sy.earlyoom ? 'gut' : 'warnung', sy.earlyoom ? 'Ist der Arbeitsspeicher voll, wird zuerst der Browser beendet – nie der Bot.' : 'earlyoom läuft nicht.', null);
    p('kern', 'Kern gehärtet', sy.lockdown && sy.lockdown !== 'none' ? 'gut' : 'warnung', sy.lockdown && sy.lockdown !== 'none' ? `Lockdown «${sy.lockdown}», AppArmor ${sy.apparmor ? 'an' : 'aus'}.` : 'Kernel-Lockdown ist aus.', null);
    if (!sy.live) {
      p('platte', 'Plattenverschlüsselung', sy.verschluesselt ? (sy.tpm ? 'gut' : 'warnung') : 'warnung', sy.verschluesselt ? (sy.tpm ? 'Verschlüsselt, entsperrt sich beim Start über den TPM-Chip. Ausgebaut ist die Platte unlesbar.' : 'Verschlüsselt, aber nicht an den TPM-Chip gebunden: jeder Start braucht das Passwort.') : 'Nicht verschlüsselt.', sy.verschluesselt && !sy.tpm && sy.tpmChip ? 'tpm' : 'datentraeger');
      p('schnapp', 'Schnappschüsse', sy.schnappschuesse && sy.schnappschuesse.anzahl ? 'gut' : 'warnung', sy.schnappschuesse ? (sy.schnappschuesse.anzahl ? `${sy.schnappschuesse.anzahl} vorhanden, letzter ${sy.schnappschuesse.letzter.replace('_', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1')}.` : 'Noch keiner.') : 'Nicht eingerichtet.', 'schnappschuesse');
    }
    if (sy.secureBoot !== undefined) { const i = punkte.findIndex((x) => x.id === 'secureboot'); if (i >= 0) punkte.splice(i, 1); p('secureboot', 'Secure Boot', sy.secureBoot ? 'gut' : 'info', sy.secureBoot === null ? 'Nicht feststellbar.' : sy.secureBoot ? 'An.' : 'Aus. Einschalten in der Firmware (HP: F10) – schützt gegen veränderte Startprogramme.', null); }
  }
  const fw2 = Promise.resolve().then(() => system.firewallLesen()).catch(() => ({}));
  const ks = (await fw2).killswitch;
  p('anonym', 'Anonymität', ks ? 'gut' : 'info', ks ? 'Kill-Switch an: ins Internet nur durch Tailscale (Exit-Node).' : 'Kill-Switch aus. Unter Anonymität einstellbar.', 'anonym');
  const note = punkte.filter((x) => x.zustand === 'schlecht').length ? 'schlecht' : punkte.filter((x) => x.zustand === 'warnung').length ? 'warnung' : 'gut';
  return { ok: true, punkte, note };
}

// ---------- Netzwerkwächter ----------
const netzEreignisse = []; let netzTimer = null; let bekannt = null; let lauscherVorher = null;
const netzDatei = () => path.join(app.getPath('userData'), 'netz-bekannt.json');
function netzEreignis(art, text) { netzEreignisse.unshift({ zeit: Date.now(), art, text }); if (netzEreignisse.length > 200) netzEreignisse.length = 200; }
async function netzStand() {
  const [v, l, nb] = await Promise.all([lauf('ss', ['-tunpH']), lauf('ss', ['-tulnpH']), lauf('ip', ['-j', 'neigh'])]);
  const prog = (z) => { const m = z.match(/users:\(\("([^"]+)",pid=(\d+)/); return m ? { name: m[1], pid: Number(m[2]) } : { name: '', pid: 0 }; };
  const verbindungen = (v.aus || '').split('\n').filter(Boolean).map((z) => { const t = z.trim().split(/\s+/); return { art: t[0], zustand: t[1], hier: t[4], dort: t[5], ...prog(z) }; }).filter((x) => x.dort && !/^(127\.|\[::1\]|\*|0\.0\.0\.0)/.test(x.dort) && x.zustand !== 'UNCONN');
  const lauscher = (l.aus || '').split('\n').filter(Boolean).map((z) => { const t = z.trim().split(/\s+/); return { art: t[0], hier: t[4], port: t[4].split(':').pop(), lokal: /^(127\.|\[::1\])/.test(t[4]), ...prog(z) }; });
  let nachbarn = []; try { nachbarn = JSON.parse(nb.aus || '[]').filter((x) => x.lladdr && !(x.state || []).includes('FAILED')).map((x) => ({ ip: x.dst, mac: x.lladdr, geraet: x.dev, zustand: (x.state || []).join(',') })); } catch {}
  return { ok: true, verbindungen, lauscher, nachbarn };
}
async function netzPruefen() {
  if (!(einstellungen.alle().netzwaechter || {}).an) return;
  const s = await netzStand();
  if (bekannt === null) { try { bekannt = JSON.parse(lies(netzDatei()) || '{}'); } catch { bekannt = {}; } }
  const erstes = !Object.keys(bekannt).length; let geaendert = false;
  for (const n of s.nachbarn) {
    if (bekannt[n.mac]) continue; bekannt[n.mac] = { ip: n.ip, seit: Date.now() }; geaendert = true;
    if (!erstes) { netzEreignis('geraet', `Neues Gerät im Netz: ${n.ip} (${n.mac})`); sag(`Neues Gerät im Netz: ${n.ip}`, 'warnung'); }
  }
  if (geaendert) { try { fs.writeFileSync(netzDatei(), JSON.stringify(bekannt)); } catch {} }
  const jetzt = new Set(s.lauscher.filter((x) => !x.lokal).map((x) => `${x.art} ${x.port} ${x.name}`.trim()));
  if (lauscherVorher) for (const x of jetzt) if (!lauscherVorher.has(x)) { netzEreignis('dienst', `Neuer lauschender Dienst: ${x}`); sag(`Neuer Dienst hört im Netz: ${x}`, 'warnung'); }
  lauscherVorher = jetzt;
}
const netz = async () => {
  const w = waechter(); const aus = meldungen().liste.filter((e) => ['netz', 'firewall', 'usb', 'anmeldung'].includes(e.quelle)).map((e) => ({ zeit: e.zeit, art: e.art, text: e.text }));
  return { ...(await netzStand()), ereignisse: [...aus, ...netzEreignisse].sort((a, b) => b.zeit - a.zeit).slice(0, 80), bekannt: w ? w.netz.bekannt : Object.keys(bekannt || {}).length, gesperrt: w ? (w.gesperrt || []).filter((x) => x.bis > Date.now()) : [], ziele: w ? w.ziele || {} : {} };
};
function netzVergessen() { bekannt = {}; try { fs.rmSync(netzDatei(), { force: true }); } catch {} return { ok: true }; }

// ---------- Bot-Wächter ----------
const bot = { laeuft: null, geprueft: 0, neustarts: [], protokoll: [] };
function botNotiz(t) { bot.protokoll.unshift({ zeit: Date.now(), text: t }); if (bot.protokoll.length > 60) bot.protokoll.length = 60; }
async function melden(text) {
  const adr = String((einstellungen.alle().bot || {}).meldeAdresse || '');
  if (!/^https?:\/\//i.test(adr)) return { ok: false, fehler: 'Keine Melde-Adresse hinterlegt' };
  try { const r = await fetch(adr, { method: 'POST', body: text, headers: { Title: 'ZentraleOS', 'Content-Type': 'text/plain; charset=utf-8' }, signal: AbortSignal.timeout(10000) }); return { ok: r.ok, fehler: r.ok ? '' : 'Antwort ' + r.status }; } catch (f) { return { ok: false, fehler: String(f.message || f) }; }
}
async function botPruefen() {
  const b = einstellungen.alle().bot || {}; if (!b.an || !b.muster) { bot.laeuft = null; return; }
  const r = await lauf('pgrep', ['-f', '--', String(b.muster)], { timeout: 5000 });
  const da = r.ok && r.aus.trim().split('\n').some((p) => Number(p) !== process.pid);
  bot.geprueft = Date.now();
  if (da) { if (bot.laeuft === false) { botNotiz(`${b.name} läuft wieder.`); melden(`${b.name} läuft wieder.`); } bot.laeuft = true; return; }
  if (bot.laeuft !== false) { botNotiz(`${b.name} läuft nicht.`); sag(`${b.name} läuft nicht.`, 'warnung'); melden(`${b.name} läuft nicht auf ${os.hostname()}.`); }
  bot.laeuft = false;
  if (!b.start) return;
  const stunde = Date.now() - 3600_000; bot.neustarts = bot.neustarts.filter((t) => t > stunde);
  if (bot.neustarts.length >= 5) { if (!bot.aufgegeben) { bot.aufgegeben = true; botNotiz('Fünf Startversuche in einer Stunde – ich warte.'); melden(`${b.name}: fünf Startversuche ohne Erfolg.`); } return; }
  bot.aufgegeben = false; bot.neustarts.push(Date.now()); botNotiz(`Starte ${b.name} neu.`); system.befehlStarten(String(b.start));
}
const botStand = () => { const w = waechter(); const q = w && w.bot && (w.bot.geprueft || 0) > (bot.geprueft || 0) ? { laeuft: w.bot.laeuft, geprueft: w.bot.geprueft, neustarts: w.bot.neustarts || 0, protokoll: w.bot.protokoll || [] } : { laeuft: bot.laeuft, geprueft: bot.geprueft, neustarts: bot.neustarts.length, protokoll: bot.protokoll.slice(0, 40) }; return { ok: true, ...q, waechter: !!w, positionenOffen: fs.existsSync(path.join(app.getPath('userData'), 'positionen-offen')) || fs.existsSync('/run/zentraleos/positionen-offen') }; };

// ---------- Backup auf den Pi ----------
let backupLaeuft = false;
async function backupSchluessel() {
  const d = path.join(HEIM, '.ssh'); const k = path.join(d, 'id_ed25519');
  if (!fs.existsSync(k)) { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); const r = await lauf('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', `zentraleos@${os.hostname()}`, '-f', k]); if (!r.ok) return { ok: false, fehler: r.fehler }; }
  return { ok: true, schluessel: lies(k + '.pub').trim() };
}
async function backupJetzt() {
  const b = einstellungen.alle().backup || {};
  if (!/^[\w.-]+@[\w.-]+:[\w./~-]+$/.test(String(b.ziel || ''))) return { ok: false, fehler: 'Ziel fehlt. Form: benutzer@rechner:/pfad' };
  if (backupLaeuft) return { ok: false, fehler: 'Ein Backup läuft schon' };
  const quellen = (b.ordner || []).map((o) => (path.isAbsolute(o) ? o : path.join(HEIM, o))).filter((p) => fs.existsSync(p));
  if (!quellen.length) return { ok: false, fehler: 'Keiner der gewählten Ordner existiert' };
  backupLaeuft = true;
  const r = await lauf('rsync', ['-a', '--delete', '--timeout=60', '-e', 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15', ...quellen, String(b.ziel).replace(/\/?$/, '/')], { timeout: 4 * 3600_000 });
  backupLaeuft = false;
  const ergebnis = r.ok ? 'ok' : (r.fehler || 'Fehler').split('\n').slice(-2).join(' ').slice(0, 240);
  einstellungen.setzen({ backup: { zuletzt: new Date().toISOString(), ergebnis } });
  if (!r.ok) sag('Backup fehlgeschlagen: ' + ergebnis, 'fehler');
  return { ok: r.ok, fehler: r.ok ? '' : ergebnis };
}
function backupPlan() {
  const b = einstellungen.alle().backup || {}; if (!b.taeglich || !b.ziel) return;
  const d = new Date(); if (d.getHours() !== Number(b.stunde)) return;
  if (String(b.zuletzt || '').slice(0, 10) === d.toISOString().slice(0, 10)) return;
  backupJetzt().catch(() => {});
}

// ---------- «Schlafen gehen»: alles beenden ausser den Ausnahmen ----------
async function allesBeenden() {
  const aus = ((einstellungen.alle().ruhe || {}).ausnahmen || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const bleibt = (t) => aus.some((a) => String(t).toLowerCase().includes(a));
  const f = await system.fremdeFenster(); const zu = []; const blieb = [];
  for (const x of f.liste || []) { if (bleibt(x.app) || bleibt(x.titel)) { blieb.push(x.app); continue; } if (!zu.includes(x.app)) zu.push(x.app); }
  for (const a of zu) await system.fensterZu(a);
  // Terminals der Oberfläche nur beenden, wenn darin keine Ausnahme läuft
  const ps = await lauf('ps', ['-u', String(process.getuid()), '-o', 'args=']);
  const ausnahmeLaeuft = (ps.aus || '').split('\n').some((z) => bleibt(z) && !z.includes('electron'));
  if (!ausnahmeLaeuft) system.alleTerminalsBeenden();
  return { ok: true, beendet: zu, geblieben: [...new Set(blieb)], terminalsGeblieben: ausnahmeLaeuft };
}

// ---------- Fokusmodus ----------
const fokus = { aktiv: false, bis: 0, streng: false, timer: null, wache: null };
async function fokusStart(pw) {
  const f = einstellungen.alle().fokus || {}; const min = Math.max(1, Math.min(600, Number(f.minuten) || 50));
  const seiten = (f.seiten || []).map((s) => String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter((s) => /^[a-z0-9.-]+$/.test(s));
  if (seiten.length) {
    const r = await system.alsRoot('fokus-sperre', [String(min * 60)], { passwort: pw, eingabe: seiten.join('\n') + '\n' });
    if (!r.ok) return r;
  }
  fokus.aktiv = true; fokus.bis = Date.now() + min * 60_000; fokus.streng = !!f.streng; fokus.seiten = seiten.length;
  clearTimeout(fokus.timer); fokus.timer = setTimeout(() => { fokusAus(); sag('Fokuszeit vorbei.', 'ok'); }, min * 60_000);
  clearInterval(fokus.wache);
  const prog = (f.programme || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  if (prog.length) fokus.wache = setInterval(async () => { const l = await system.fremdeFenster(); for (const x of l.liste || []) if (prog.some((p) => x.app.toLowerCase().includes(p) || x.titel.toLowerCase().includes(p))) system.fensterZu(x.app); }, 4000);
  return { ok: true, bis: fokus.bis };
}
function fokusAus() { fokus.aktiv = false; fokus.bis = 0; clearTimeout(fokus.timer); clearInterval(fokus.wache); }
async function fokusEnde(pw) {
  if (!fokus.aktiv) return { ok: true };
  if (fokus.streng) return { ok: false, fehler: 'Strenger Fokus: lässt sich nicht vorzeitig beenden.' };
  if (fokus.seiten) { const r = await system.alsRoot('fokus-sperre', [], { passwort: pw, eingabe: '\n' }); if (!r.ok) return r; }
  fokusAus(); return { ok: true };
}
const fokusStand = () => ({ ok: true, aktiv: fokus.aktiv, bis: fokus.bis, streng: fokus.streng });

// ---------- Installation auf die Platte ----------
async function installPlatten() {
  const r = await lauf('lsblk', ['-J', '-b', '-d', '-o', 'NAME,PATH,SIZE,MODEL,TRAN,RM,TYPE']); let d = {}; try { d = JSON.parse(r.aus); } catch {}
  const m = await lauf('sh', ['-c', 'lsblk -no PKNAME "$(findmnt -no SOURCE /run/live/medium 2>/dev/null)" 2>/dev/null | head -1']); const live = (m.aus || '').trim();
  const teile = await lauf('lsblk', ['-rno', 'PKNAME,FSTYPE,LABEL']);
  const platten = (d.blockdevices || []).filter((x) => x.type === 'disk' && !/^(loop|ram|zram|sr)/.test(x.name)).map((x) => ({ pfad: x.path, groesse: Number(x.size), modell: (x.model || '').trim() || x.name, bus: x.tran || '', wechsel: !!x.rm, live: x.name === live,
    inhalt: [...new Set((teile.aus || '').split('\n').map((z) => z.split(' ')).filter((t) => t[0] === x.name && t[1]).map((t) => (t[1] === 'ntfs' ? 'Windows (NTFS)' : t[1])))].join(', ') }));
  return { ok: true, platten, live: /boot=live/.test(lies('/proc/cmdline')), uefi: fs.existsSync('/sys/firmware/efi'), tpm: fs.existsSync('/dev/tpmrm0') || fs.existsSync('/dev/tpm0') };
}
function installieren(k, pw) {
  const z = (x) => String(x ?? '').replace(/[\r\n]/g, '');
  return system.alsRoot('installieren', [], { passwort: pw, eingabe: [z(k.geraet), z(k.name), z(k.passwort), z(k.verschluesselung), z(k.code)].join('\n') + '\n', timeout: 90 * 60_000 });
}
const installStand = () => ({ ok: true, zeilen: lies('/run/zos-installation.log').split('\n').filter(Boolean).slice(-12) });

// ---------- Neustart / Ausschalten: in der eigenen Sitzung ohne Passwort ----------
async function energie(was) {
  const b = was === 'neustart' ? 'reboot' : was === 'aus' ? 'poweroff' : null; if (!b) return { ok: false, fehler: 'Unbekannt' };
  const r = await lauf('systemctl', [b], { timeout: 20000 });
  return r.ok ? { ok: true } : { ok: false, passwortNoetig: true, fehler: r.fehler };
}

// ---------- Fernzugriff ----------
async function fernzugriff() {
  const [ssh, ts, rd] = await Promise.all([lauf('systemctl', ['is-active', 'ssh']), lauf('tailscale', ['ip', '-4'], { timeout: 5000 }), lauf('flatpak', ['info', 'com.rustdesk.RustDesk'], { timeout: 8000 })]);
  return { ok: true, ssh: (ssh.aus || '').trim() === 'active', nurTailscale: /ListenAddress 100\./.test(lies('/etc/ssh/sshd_config.d/zentraleos.conf')), tailscaleIp: (ts.aus || '').trim().split('\n')[0] || '', benutzer: os.userInfo().username, rechner: os.hostname(), rustdesk: rd.ok };
}

// ---------- Wächter (eigener Systemdienst, siehe shell/waechter) ----------
const waechter = () => { try { const d = JSON.parse(fs.readFileSync('/run/zentraleos/waechter.json', 'utf8')); return Date.now() - d.zeit < 60_000 ? d : null; } catch { return null; } };
function meldungen() { let l = []; try { l = JSON.parse(fs.readFileSync('/var/lib/zentraleos/ereignisse.json', 'utf8')); } catch {} return { ok: true, liste: l.slice(0, 150), waechter: !!waechter() }; }
const waechterStand = () => ({ ok: true, ...(waechter() || { laeuft: false }) });

// ---------- Nachtlicht (wlsunset) ----------
let nachtlichtProzess = null;
function nachtlicht() {
  const n = (einstellungen.alle().nachtlicht) || {};
  if (nachtlichtProzess) { try { nachtlichtProzess.kill(); } catch {} nachtlichtProzess = null; }
  if (!n.an || process.platform !== 'linux') return { ok: true, an: false };
  const z = (t) => (/^\d{1,2}:\d{2}$/.test(String(t)) ? String(t).padStart(5, '0') : null);
  const args = ['-t', String(Math.max(2500, Math.min(6000, Number(n.temperatur) || 3800))), '-T', '6500'];
  if (n.immer) args.push('-S', '00:00', '-s', '00:01'); else if (z(n.ab) && z(n.bis)) args.push('-s', z(n.ab), '-S', z(n.bis)); else args.push('-s', '20:00', '-S', '07:00');
  nachtlichtProzess = spawn('wlsunset', args, { stdio: 'ignore' }); nachtlichtProzess.on('error', () => { nachtlichtProzess = null; });
  return { ok: true, an: true };
}

// ---------- Standardprogramme ----------
const STANDARD_TYPEN = [['x-scheme-handler/http', 'Webbrowser'], ['application/pdf', 'PDF'], ['image/png', 'Bilder'], ['text/plain', 'Text'], ['video/mp4', 'Video'], ['audio/mpeg', 'Musik'], ['inode/directory', 'Ordner']];
async function standardApps() {
  const liste = [];
  for (const [typ, name] of STANDARD_TYPEN) { const r = await lauf('xdg-mime', ['query', 'default', typ], { timeout: 4000 }); liste.push({ typ, name, app: (r.aus || '').trim() }); }
  return { ok: true, liste };
}
async function standardAppSetzen(typ, app) {
  if (!STANDARD_TYPEN.some(([t]) => t === typ) || !/^[\w.-]+\.desktop$/.test(String(app))) return { ok: false, fehler: 'Ungültig' };
  const typen = typ === 'x-scheme-handler/http' ? ['x-scheme-handler/http', 'x-scheme-handler/https', 'text/html'] : typ === 'image/png' ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] : typ === 'video/mp4' ? ['video/mp4', 'video/x-matroska', 'video/webm'] : typ === 'audio/mpeg' ? ['audio/mpeg', 'audio/flac', 'audio/ogg'] : [typ];
  for (const t of typen) { const r = await lauf('xdg-mime', ['default', app, t], { timeout: 4000 }); if (!r.ok) return r; }
  return { ok: true };
}

// ---------- Rechte der Flatpak-Programme ----------
const RECHTE = { netz: ['--share=network', '--unshare=network'], ton: ['--socket=pulseaudio', '--nosocket=pulseaudio'], kamera: ['--device=all', '--nodevice=all'], dateien: ['--filesystem=home', '--nofilesystem=home'] };
async function appRechte() {
  const l = await lauf('flatpak', ['list', '--app', '--columns=application,name'], { timeout: 15000 });
  if (l.fehlt) return { ok: false, fehler: 'Flatpak fehlt' };
  const liste = [];
  for (const z of l.aus.split('\n').filter(Boolean)) {
    const [id, name] = z.split('\t'); const i = await lauf('flatpak', ['info', '--show-permissions', id], { timeout: 8000 }); const t = i.aus;
    liste.push({ id, name: name || id, netz: /shared=.*network/.test(t), ton: /sockets=.*pulseaudio/.test(t), kamera: /devices=.*(all|webcam)/.test(t), dateien: /filesystems=.*(home|host)/.test(t) });
  }
  return { ok: true, liste };
}
async function appRechtSetzen(id, recht, an) {
  if (!/^[\w.-]+$/.test(String(id)) || !RECHTE[recht]) return { ok: false, fehler: 'Ungültig' };
  return lauf('flatpak', ['override', '--user', RECHTE[recht][an ? 0 : 1], id], { timeout: 15000 });
}

// ---------- Lautstärke pro Programm (PipeWire) ----------
async function tonProgramme() {
  const r = await lauf('pw-dump', [], { timeout: 6000 }); let d = []; try { d = JSON.parse(r.aus); } catch {}
  const liste = d.filter((x) => x.type === 'PipeWire:Interface:Node' && x.info && x.info.props && x.info.props['media.class'] === 'Stream/Output/Audio').map((x) => {
    const p = x.info.props; const prm = (x.info.params && x.info.params.Props && x.info.params.Props[0]) || {};
    const vol = Array.isArray(prm.channelVolumes) && prm.channelVolumes.length ? Math.cbrt(prm.channelVolumes[0]) : 1;
    return { id: x.id, name: p['application.name'] || p['node.name'] || 'Programm', medien: p['media.name'] || '', lautstaerke: Math.round(vol * 100), stumm: !!prm.mute };
  });
  return { ok: true, liste };
}
const tonProgrammSetzen = (id, prozent) => (Number.isInteger(Number(id)) ? lauf('wpctl', ['set-volume', String(Number(id)), String(Math.max(0, Math.min(150, Number(prozent))) / 100)], { timeout: 4000 }) : { ok: false });

// ---------- Anonymität ----------
async function anonymCheck() {
  const holeJson = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'curl/8' } }); return r.ok ? await r.json() : null; } catch { return null; } };
  const [a, t] = await Promise.all([holeJson('https://am.i.mullvad.net/json'), system.tailscale().catch(() => ({}))]);
  const exit = ((t && t.geraete) || []).find((g) => g.exitAktiv) || null;
  const v6 = await holeJson('https://ipv6.am.i.mullvad.net/json');
  let resolv = ''; try { resolv = fs.readFileSync('/etc/resolv.conf', 'utf8'); } catch {}
  const dns = (resolv.match(/^nameserver\s+(\S+)/gm) || []).map((z) => z.split(/\s+/)[1]);
  return { ok: true, ip: a ? a.ip : null, land: a ? a.country : null, stadt: a ? a.city : null, anbieter: a ? a.organization : null, exitNode: exit ? exit.name : null, ipv6: v6 ? v6.ip : null, dns };
}

// ---------- Metadaten entfernen (mat2) ----------
async function metadatenWeg(pfad) {
  const p = String(pfad || ''); if (!path.isAbsolute(p) || !fs.existsSync(p)) return { ok: false, fehler: 'Datei nicht gefunden' };
  const r = await lauf('mat2', ['--inplace', p], { timeout: 60000 });
  return r.fehlt ? { ok: false, fehler: 'mat2 ist nicht installiert' } : r.ok ? { ok: true } : { ok: false, fehler: r.fehler || 'Nicht möglich (Dateityp?)' };
}

function starten({ hinweis }) {
  sag = hinweis || sag;
  ablageStarten();
  // Läuft der Wächter-Dienst, macht er das – sonst (z. B. Vorschau unter Windows) die Oberfläche selbst.
  const ohneWaechter = (fn) => () => { if (!waechter()) fn(); };
  setInterval(ohneWaechter(() => netzPruefen().catch(() => {})), 30_000); setTimeout(ohneWaechter(() => netzPruefen().catch(() => {})), 20_000);
  setInterval(ohneWaechter(() => botPruefen().catch(() => {})), 30_000); setTimeout(ohneWaechter(() => botPruefen().catch(() => {})), 25_000);
  setInterval(ohneWaechter(() => backupPlan()), 10 * 60_000);
  nachtlicht();
}

// Welche Version von ZentraleOS läuft (wird beim Bauen und bei jedem Update geschrieben)
async function osStand() {
  const z = lies('/opt/zentraleos/stand').split('\n');
  return { ok: true, kennung: (z[0] || '').slice(0, 7), datum: z[1] || '', text: z[2] || '' };
}

module.exports = {
  osStand,
  starten, socketStarten, ablageListe, ablageNehmen, ablageLeeren, papierkorb, papierkorbZurueck, papierkorbLeeren, fotos,
  datentraeger, ordnerAnalyse, einhaengen, aushaengen, smart, sicherheit, netz, netzVergessen, botStand, botPruefen, melden,
  backupSchluessel, backupJetzt, allesBeenden, fokusStart, fokusEnde, fokusStand, installPlatten, installieren, installStand, energie, fernzugriff,
  meldungen, waechterStand, nachtlicht, standardApps, standardAppSetzen, appRechte, appRechtSetzen, tonProgramme, tonProgrammSetzen, anonymCheck, metadatenWeg,
};
