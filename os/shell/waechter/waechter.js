// ZentraleOS-Wächter: eigener Systemdienst (root), läuft unabhängig von der Oberfläche.
//
// Sammelt, was auf diesem Rechner passiert, bewertet es und meldet es:
//   - Bot-Wächter: läuft der Bot (z. B. MetaTrader 5)? Sonst neu starten und melden.
//   - Netzwerk: neue Geräte im Heimnetz, neue lauschende Dienste, neue Ziele von Programmen.
//   - Portscans auf die Firewall (aus dem Kernel-Protokoll) → Adresse für 24 Stunden sperren.
//   - Anmeldungen und Fehlversuche (sudo, SSH, Konsole), Speicher-Notbremse (earlyoom).
//   - USB-Geräte (USBGuard sperrt Unbekanntes), Köder-Dateien, Viren in «Downloads» (falls ClamAV da ist).
//   - Plattengesundheit (SMART), voller Arbeitsspeicher, Hitze.
//   - Meldungen anderer Teile (Oberfläche, Wochenprüfung) aus den Eingangsordnern.
//   - Tägliches Backup auf den Pi.
//
// Ergebnisse:  /run/zentraleos/waechter.json (Zustand), /var/lib/zentraleos/ereignisse.json (Ereignisse).
// Melden:      an die Zentrale auf dem Pi (die schickt sie wie ihre eigenen Meldungen per Telegram/ntfy weiter)
//              und, falls eingetragen, direkt an eine eigene Adresse (ntfy).
//
// Gestartet über Electron im Node-Modus (ELECTRON_RUN_AS_NODE=1), braucht also kein eigenes Node.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const RUN = '/run/zentraleos';
const VAR = '/var/lib/zentraleos';
const EINGANG_ROOT = path.join(VAR, 'meldungen');
const TEST = /\bzos\.test\b/.test(lies('/proc/cmdline'));

function lies(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function liesJson(p, ersatz) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return ersatz; } }
function schreibeJson(p, d, modus = 0o644) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(d), { mode: modus }); fs.renameSync(t, p); } catch (e) { log('schreiben', p, e.message); } }
function log(...a) { console.log('[wächter]', ...a); }
function lauf(b, args = [], { timeout = 20000, env = null } = {}) {
  return new Promise((ok) => {
    execFile(b, args, { timeout, maxBuffer: 16 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env }, (e, aus, err) => ok({ ok: !e, aus: String(aus || ''), fehler: e ? String(err || e.message).trim().slice(0, 300) : '', fehlt: e && e.code === 'ENOENT' }));
  });
}

// ---------- Benutzer der Sitzung ----------
function benutzer() {
  for (const z of lies('/etc/passwd').split('\n')) {
    const t = z.split(':'); const uid = Number(t[2]);
    if (uid >= 1000 && uid < 60000 && t[6] && !/nologin|false/.test(t[6])) return { name: t[0], uid, gid: Number(t[3]), heim: t[5] };
  }
  return null;
}
let B = benutzer();
const konfig = () => path.join(B.heim, '.config/ZentraleOS');
const laufzeit = () => `/run/user/${B.uid}`;
const einstellungen = () => liesJson(path.join(konfig(), 'einstellungen.json'), {});
const sitzung = () => liesJson(path.join(laufzeit(), 'zos-zustand.json'), {});
const ichBin = (...a) => ['-u', B.name, '--', 'env', `HOME=${B.heim}`, `XDG_RUNTIME_DIR=${laufzeit()}`, 'WAYLAND_DISPLAY=wayland-0', ...a];

// ---------- Ereignisse und Meldungen ----------
const EREIGNISSE = path.join(VAR, 'ereignisse.json');
let ereignisse = liesJson(EREIGNISSE, []);
const zuletzt = new Map();
const zustand = { laeuft: true, seit: Date.now(), zeit: Date.now(), bot: { laeuft: null, geprueft: 0, neustarts: 0, protokoll: [] }, netz: { bekannt: 0 }, backup: {}, gesperrt: [], usb: [], ziele: {}, pruefungen: {} };

// art: info | warnung | alarm. Warnungen und Alarme gehen aufs Handy (gleiche Meldung höchstens alle 10 bzw. 2 Minuten).
function melden(art, quelle, text, { schluessel = null, aktion = null } = {}) {
  const e = { zeit: Date.now(), art, quelle, text };
  ereignisse.unshift(e); if (ereignisse.length > 400) ereignisse.length = 400;
  schreibeJson(EREIGNISSE, ereignisse);
  log(art, quelle, text);
  if (aktion) { try { aktion(); } catch (f) { log('aktion', f.message); } }
  if (art === 'info') return;
  const k = schluessel || `${quelle}:${text}`; const pause = art === 'alarm' ? 2 * 60_000 : 10 * 60_000;
  if (Date.now() - (zuletzt.get(k) || 0) < pause) return;
  zuletzt.set(k, Date.now());
  senden(art, text).catch((f) => log('senden', f.message));
}
async function senden(art, text) {
  const titel = os.hostname();
  // 1. An die Zentrale auf dem Pi (Gerätetoken legt die Oberfläche ab)
  const pi = liesJson(path.join(laufzeit(), 'zos-pi.json'), null);
  if (pi && pi.basis && pi.token) {
    try {
      const r = await fetch(pi.basis.replace(/\/$/, '') + '/api/hp/meldung', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Geraet-Token': pi.token }, body: JSON.stringify({ art: art === 'alarm' ? 'fehler' : 'warnung', text, rechner: titel }), signal: AbortSignal.timeout(10000) });
      zustand.gesendet = { zeit: Date.now(), ziel: 'zentrale', ok: r.ok, status: r.status };
      if (!r.ok) log('pi', r.status);
    } catch (f) { zustand.gesendet = { zeit: Date.now(), ziel: 'zentrale', ok: false, fehler: f.message }; log('pi', f.message); }
  }
  // 2. Eigene Adresse (z. B. ntfy), falls eingetragen
  const e = einstellungen(); const adr = String((e.meldung && e.meldung.adresse) || (e.bot && e.bot.meldeAdresse) || '');
  if (/^https?:\/\//i.test(adr)) {
    try { await fetch(adr, { method: 'POST', body: text, headers: { Title: `ZentraleOS · ${titel}`, Priority: art === 'alarm' ? '5' : '3', Tags: art === 'alarm' ? 'rotating_light' : 'warning' }, signal: AbortSignal.timeout(10000) }); } catch (f) { log('ntfy', f.message); }
  }
}
// Zur Oberfläche: Befehl an ihren Socket (z. B. sperren, bildschirmAus)
function anOberflaeche(befehl) {
  const c = net.createConnection(path.join(laufzeit(), 'zos.sock'), () => { c.end(befehl + '\n'); });
  c.on('error', () => {});
}

// ---------- Eingangsordner: Meldungen von Oberfläche und Prüfskripten ----------
function eingang() {
  for (const ordner of [EINGANG_ROOT, path.join(laufzeit(), 'zos-meldungen')]) {
    let dateien = []; try { dateien = fs.readdirSync(ordner).filter((n) => n.endsWith('.json')); } catch { continue; }
    for (const n of dateien) {
      const p = path.join(ordner, n); const d = liesJson(p, null); try { fs.rmSync(p, { force: true }); } catch {}
      if (!d || !d.text) continue;
      const art = ['info', 'warnung', 'alarm'].includes(d.art) ? d.art : 'info';
      melden(art, String(d.quelle || 'system').slice(0, 30), String(d.text).slice(0, 500), { schluessel: d.schluessel || null, aktion: d.sperren ? () => anOberflaeche('bildschirmAus') : null });
    }
  }
}

// ---------- Bot-Wächter ----------
async function bot() {
  const b = (einstellungen().bot) || {};
  if (!b.an || !b.muster) { zustand.bot.laeuft = null; return; }
  const r = await lauf('pgrep', ['-f', '-u', B.name, '--', String(b.muster)]);
  zustand.bot.geprueft = Date.now();
  const notiz = (t) => { zustand.bot.protokoll.unshift({ zeit: Date.now(), text: t }); zustand.bot.protokoll.length = Math.min(zustand.bot.protokoll.length, 40); };
  if (r.ok && r.aus.trim()) { if (zustand.bot.laeuft === false) { notiz(`${b.name} läuft wieder.`); melden('info', 'bot', `${b.name} läuft wieder.`); } zustand.bot.laeuft = true; return; }
  if (zustand.bot.laeuft !== false) { notiz(`${b.name} läuft nicht.`); melden('alarm', 'bot', `${b.name} läuft nicht.`, { schluessel: 'bot-weg' }); }
  zustand.bot.laeuft = false;
  if (!b.start) return;
  zustand.bot.versuche = (zustand.bot.versuche || []).filter((t) => Date.now() - t < 3600_000);
  if (zustand.bot.versuche.length >= 5) { if (!zustand.bot.aufgegeben) { zustand.bot.aufgegeben = true; melden('alarm', 'bot', `${b.name}: fünf Startversuche in einer Stunde ohne Erfolg.`); } return; }
  zustand.bot.aufgegeben = false; zustand.bot.versuche.push(Date.now()); zustand.bot.neustarts = zustand.bot.versuche.length; notiz(`Starte ${b.name} neu.`);
  const k = spawn('runuser', ichBin('sh', '-c', String(b.start)), { detached: true, stdio: 'ignore' }); k.on('error', () => {}); k.unref();
}

// ---------- Netzwerk: Nachbarn, lauschende Dienste, neue Ziele ----------
const BEKANNT = path.join(VAR, 'netz-bekannt.json');
let bekannt = liesJson(BEKANNT, null);
let lauscherVorher = null;
const ZIELE = path.join(VAR, 'ziele.json');
let ziele = liesJson(ZIELE, {});
async function netz() {
  if (!((einstellungen().netzwaechter || {}).an ?? true)) return;
  const [nb, l, v] = await Promise.all([lauf('ip', ['-j', 'neigh']), lauf('ss', ['-tulnpH']), lauf('ss', ['-tunpH'])]);
  let nachbarn = []; try { nachbarn = JSON.parse(nb.aus || '[]').filter((x) => x.lladdr && !(x.state || []).includes('FAILED')); } catch {}
  const erstes = bekannt === null; if (erstes) bekannt = {};
  let neu = false;
  for (const n of nachbarn) {
    if (bekannt[n.lladdr]) continue; bekannt[n.lladdr] = { ip: n.dst, seit: Date.now() }; neu = true;
    if (!erstes) melden('warnung', 'netz', `Neues Gerät im Netz: ${n.dst} (${n.lladdr})`);
  }
  if (neu) schreibeJson(BEKANNT, bekannt);
  zustand.netz.bekannt = Object.keys(bekannt).length;
  const prog = (z) => (z.match(/users:\(\("([^"]+)"/) || [])[1] || '';
  const jetzt = new Set((l.aus || '').split('\n').filter(Boolean).map((z) => { const t = z.trim().split(/\s+/); return { art: t[0], hier: t[4] || '', name: prog(z) }; })
    .filter((x) => x.hier && !/^(127\.|\[::1\]|::1)/.test(x.hier) && !/%lo:/.test(x.hier)).map((x) => `${x.art} ${x.hier.split(':').pop()} ${x.name}`.trim()));
  if (lauscherVorher) for (const x of jetzt) if (!lauscherVorher.has(x)) melden('warnung', 'netz', `Neuer Dienst wartet auf Verbindungen: ${x}`);
  lauscherVorher = jetzt;
  // Neue Ziele je Programm (nur gemerkt und angezeigt, nicht gemeldet – das wären zu viele)
  let geaendert = false;
  for (const z of (v.aus || '').split('\n')) {
    const t = z.trim().split(/\s+/); if (t.length < 6 || t[1] !== 'ESTAB') continue;
    const dort = t[5]; const ip = dort.replace(/:\d+$/, '').replace(/^\[|\]$/g, ''); if (/^(127\.|::1|::ffff:127\.)/.test(ip)) continue;
    const p = prog(z) || 'unbekannt'; const liste = (ziele[p] ||= []);
    if (!liste.some((x) => x.ip === ip)) { liste.unshift({ ip, port: dort.split(':').pop(), seit: Date.now() }); if (liste.length > 60) liste.length = 60; geaendert = true; }
  }
  if (geaendert) schreibeJson(ZIELE, ziele);
}

// ---------- Portscans aus dem Firewall-Protokoll ----------
const proSender = new Map(); // ip -> [{zeit, port}]
function istAusgenommen(ip) {
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;   // Tailscale-Geräte
  if (/^(127\.|0\.)/.test(ip)) return true;
  const gw = (lies('/proc/net/route').split('\n')[1] || '').split('\t')[2];
  if (gw && gw.length === 8) { const g = gw.match(/../g).reverse().map((x) => parseInt(x, 16)).join('.'); if (g === ip) return true; }
  return false;
}
async function sperren(ip, dauer = '24h') {
  const set = ip.includes(':') ? 'gesperrt6' : 'gesperrt4';
  const r = await lauf('nft', ['add', 'element', 'inet', 'zentraleos', set, `{ ${ip} timeout ${dauer} }`]);
  if (r.ok) { zustand.gesperrt = [{ ip, bis: Date.now() + 24 * 3600_000 }, ...zustand.gesperrt.filter((x) => x.ip !== ip && x.bis > Date.now())].slice(0, 50); }
  return r.ok;
}
function kernelZeile(z) {
  const m = z.match(/ZOS-VERWORFEN .*?SRC=(\S+) .*?PROTO=(\w+)(?:.*?DPT=(\d+))?/); if (!m) return;
  const [, ip, proto, port] = m; const jetzt = Date.now();
  const liste = (proSender.get(ip) || []).filter((x) => jetzt - x.zeit < 60_000); liste.push({ zeit: jetzt, port: `${proto}/${port || '-'}` }); proSender.set(ip, liste);
  const ports = new Set(liste.map((x) => x.port));
  if (ports.size >= 8 && !liste.gemeldet) {
    liste.gemeldet = true;
    const aus = istAusgenommen(ip);
    melden('alarm', 'firewall', `Portscan von ${ip}: ${ports.size} Ports in einer Minute probiert${aus ? ' (Adresse ist ausgenommen, nicht gesperrt)' : ' – für 24 Stunden gesperrt'}.`, { schluessel: 'scan:' + ip });
    if (!aus) sperren(ip);
  }
  if (proSender.size > 2000) proSender.clear();
}

// ---------- Anmeldungen, Fehlversuche, Speicher-Notbremse aus dem Journal ----------
function journalZeile(z) {
  let d; try { d = JSON.parse(z); } catch { return; }
  const t = String(d.MESSAGE || ''); const wer = String(d._COMM || d.SYSLOG_IDENTIFIER || '');
  if (wer === 'sudo' && /incorrect password attempt/i.test(t)) melden('warnung', 'anmeldung', 'Falsches Administrator-Passwort (sudo).', { schluessel: 'sudo-falsch' });
  else if (/^sshd/.test(wer) && /Failed (password|publickey)/.test(t)) melden('warnung', 'anmeldung', 'Fehlgeschlagene SSH-Anmeldung: ' + t.slice(0, 160), { schluessel: 'ssh-falsch' });
  else if (/^sshd/.test(wer) && /^Accepted /.test(t)) melden('alarm', 'anmeldung', 'SSH-Anmeldung: ' + t.slice(0, 160));
  else if (wer === 'login' && /FAILED LOGIN|authentication failure/i.test(t)) melden('warnung', 'anmeldung', 'Fehlversuch an der Textkonsole.', { schluessel: 'tty-falsch' });
  else if (wer === 'login' && /session opened/i.test(t)) melden('warnung', 'anmeldung', 'Anmeldung an der Textkonsole.');
  else if (wer === 'earlyoom' && /sending SIG(TERM|KILL)/i.test(t)) melden('warnung', 'speicher', 'Arbeitsspeicher voll – Notbremse hat ein Programm beendet: ' + t.replace(/.*process\s*/i, '').slice(0, 120));
  else if (wer === 'usbguard-daemon' && /block|reject/i.test(t) && /device/i.test(t)) melden('info', 'usb', t.slice(0, 200));
}
function folgen(befehl, args, jeZeile) {
  const start = () => {
    const k = spawn(befehl, args, { stdio: ['ignore', 'pipe', 'ignore'] }); let rest = '';
    k.stdout.on('data', (d) => { rest += d; const z = rest.split('\n'); rest = z.pop(); for (const x of z) if (x) { try { jeZeile(x); } catch (e) { log('zeile', e.message); } } });
    k.on('error', () => {}); k.on('exit', () => setTimeout(start, 5000));
  };
  start();
}

// ---------- USB ----------
async function usbListe() {
  const r = await lauf('usbguard', ['list-devices']);
  if (!r.ok) { zustand.usb = null; return; }
  zustand.usb = r.aus.split('\n').filter(Boolean).map((z) => { const m = z.match(/^(\d+): (allow|block|reject) id (\S+)(?: serial "([^"]*)")? name "([^"]*)"/); return m ? { id: Number(m[1]), regel: m[2], kennung: m[3], name: m[5] || m[3] } : null; }).filter(Boolean);
}
function usbZeile(z) {
  // udevadm monitor --property: Blöcke mit ACTION=, DEVTYPE=, ID_MODEL=…
  if (z.startsWith('UDEV')) usbBlock = {}; else if (z.includes('=')) { const i = z.indexOf('='); usbBlock[z.slice(0, i)] = z.slice(i + 1); }
  if (usbBlock.ACTION === 'add' && usbBlock.DEVTYPE === 'usb_device' && usbBlock.ID_MODEL && !usbBlock.gemeldet) {
    usbBlock.gemeldet = true; const name = `${usbBlock.ID_VENDOR_FROM_DATABASE || usbBlock.ID_VENDOR || ''} ${usbBlock.ID_MODEL_FROM_DATABASE || usbBlock.ID_MODEL}`.trim().replace(/_/g, ' ');
    setTimeout(async () => {
      await usbListe();
      const gerat = (zustand.usb || []).find((x) => x.name.replace(/_/g, ' ') === usbBlock.ID_MODEL.replace(/_/g, ' ') || x.kennung === `${usbBlock.ID_VENDOR_ID}:${usbBlock.ID_MODEL_ID}`);
      const gesperrt = gerat ? gerat.regel !== 'allow' : null; const bildschirmGesperrt = !!sitzung().gesperrt;
      melden(gesperrt || bildschirmGesperrt ? 'alarm' : 'warnung', 'usb', `USB-Gerät eingesteckt: ${name}${gesperrt === true ? ' – gesperrt, bis du es unter Sicherheit → USB-Geräte erlaubst' : gesperrt === false ? ' – erlaubt' : ''}${bildschirmGesperrt ? ' (der Bildschirm war gesperrt)' : ''}.`);
    }, 1200);
  }
}
let usbBlock = {};

// ---------- Köder-Dateien ----------
const KOEDER_NAME = 'Passwörter.xlsx';
function koederPfad() { return path.join(B.heim, 'Dokumente', KOEDER_NAME); }
function koederAnlegen() {
  const p = koederPfad();
  if (!fs.existsSync(p)) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'PK\u0003\u0004 Diese Datei ist ein Köder von ZentraleOS. Wird sie geöffnet, gibt es Alarm.\n');
      fs.chownSync(path.dirname(p), B.uid, B.gid); fs.chownSync(p, B.uid, B.gid);
    } catch (e) { log('köder', e.message); return null; }
  }
  return p;
}
function koederWachen() {
  if ((einstellungen().waechter || {}).koeder === false) return;
  const p = koederAnlegen(); if (!p) return;
  folgen('inotifywait', ['-m', '-q', '-e', 'open', '--format', '%e', p], () => {
    melden('alarm', 'koeder', `Die Köder-Datei «${KOEDER_NAME}» wurde geöffnet – Bildschirm gesperrt.`, { schluessel: 'koeder', aktion: () => anOberflaeche('bildschirmAus') });
  });
}

// ---------- Viren in «Downloads» (nur wenn ClamAV installiert ist) ----------
function downloadsWachen() {
  const ordner = ['Downloads', 'Heruntergeladen'].map((n) => path.join(B.heim, n)).find((p) => fs.existsSync(p)) || path.join(B.heim, 'Downloads');
  try { fs.mkdirSync(ordner, { recursive: true }); fs.chownSync(ordner, B.uid, B.gid); } catch {}
  folgen('inotifywait', ['-m', '-q', '-e', 'close_write,moved_to', '--format', '%w%f', ordner], async (datei) => {
    if (!fs.existsSync('/usr/bin/clamscan') || /\.(part|crdownload|tmp)$/i.test(datei)) return;
    const r = await lauf('clamscan', ['--no-summary', '--infected', datei], { timeout: 180000 });
    if (r.aus.includes('FOUND')) {
      const q = path.join(VAR, 'quarantaene'); fs.mkdirSync(q, { recursive: true, mode: 0o700 });
      try { fs.renameSync(datei, path.join(q, Date.now() + '-' + path.basename(datei))); } catch {}
      melden('alarm', 'viren', `Schadsoftware in «${path.basename(datei)}» gefunden und in Quarantäne verschoben: ${r.aus.split(':').pop().trim().slice(0, 80)}`);
    }
  });
}

// ---------- Platten, Speicher, Hitze ----------
let speicherKnapp = 0;
async function gesundheit() {
  const m = lies('/proc/meminfo'); const wert = (k) => Number((m.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')) || [])[1] || 0);
  const frei = wert('MemAvailable') / Math.max(1, wert('MemTotal'));
  speicherKnapp = frei < 0.05 ? speicherKnapp + 1 : 0;
  if (speicherKnapp === 3) melden('warnung', 'speicher', `Arbeitsspeicher fast voll (${Math.round(frei * 100)} % frei).`);
  let heiss = 0; try { for (const z of fs.readdirSync('/sys/class/thermal')) { const t = Number(lies(`/sys/class/thermal/${z}/temp`)) / 1000; if (t > heiss) heiss = t; } } catch {}
  zustand.temperatur = heiss || null;
  if (heiss > 92) melden('warnung', 'hitze', `Der Rechner ist sehr heiss: ${Math.round(heiss)} °C.`, { schluessel: 'hitze' });
}
async function smart() {
  const r = await lauf('lsblk', ['-dno', 'PATH,TYPE,TRAN']);
  for (const z of r.aus.split('\n')) {
    const [p, typ, tran] = z.trim().split(/\s+/); if (typ !== 'disk' || !p || tran === 'usb') continue;
    const s = await lauf('smartctl', ['-H', '-j', p]); let d = null; try { d = JSON.parse(s.aus); } catch {}
    if (d && d.smart_status && d.smart_status.passed === false) melden('alarm', 'platte', `Die Platte ${p} meldet einen Fehler (SMART). Daten sichern!`, { schluessel: 'smart:' + p });
  }
}

// ---------- Backup auf den Pi ----------
let backupLaeuft = false;
async function backup() {
  const b = (einstellungen().backup) || {};
  if (!b.taeglich || !b.ziel || backupLaeuft) return;
  const jetzt = new Date(); if (jetzt.getHours() !== Number(b.stunde ?? 3)) return;
  const heute = jetzt.toISOString().slice(0, 10); if ((zustand.backup.zuletzt || '').slice(0, 10) === heute || String(b.zuletzt || '').slice(0, 10) === heute) return;
  if (!/^[\w.-]+@[\w.-]+:[\w./~-]+$/.test(String(b.ziel))) return;
  const quellen = (b.ordner || []).map((o) => (path.isAbsolute(o) ? o : path.join(B.heim, o))).filter((p) => fs.existsSync(p));
  if (!quellen.length) return;
  backupLaeuft = true;
  const r = await lauf('runuser', ichBin('rsync', '-a', '--delete', '--timeout=60', '-e', 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15', ...quellen, String(b.ziel).replace(/\/?$/, '/')), { timeout: 4 * 3600_000 });
  backupLaeuft = false;
  zustand.backup = { zuletzt: new Date().toISOString(), ergebnis: r.ok ? 'ok' : (r.fehler || 'Fehler').slice(-200) };
  if (!r.ok) melden('warnung', 'backup', 'Backup auf den Pi fehlgeschlagen: ' + zustand.backup.ergebnis, { schluessel: 'backup' });
}

// ---------- Prüfungen (Ergebnisse der Wochenprüfung) ----------
function pruefungen() { zustand.pruefungen = liesJson(path.join(VAR, 'pruefung.json'), {}); }

// ---------- Systemstand für die Sicherheits-Zentrale (braucht root, darum hier) ----------
async function systemStand() {
  const aktiv = async (d) => (await lauf('systemctl', ['is-active', d])).aus.trim() === 'active';
  const s = {};
  s.lockdown = (lies('/sys/kernel/security/lockdown').match(/\[(\w+)\]/) || [])[1] || null;
  s.usbguard = await aktiv('usbguard'); s.earlyoom = await aktiv('earlyoom'); s.apparmor = (await lauf('aa-enabled')).aus.trim() === 'Yes';
  const ct = lies('/etc/crypttab'); s.verschluesselt = /\S/.test(ct.replace(/#.*$/gm, ''));
  if (s.verschluesselt) { const dev = (ct.match(/UUID=([\w-]+)/) || [])[1]; const l = dev ? await lauf('clevis', ['luks', 'list', '-d', `/dev/disk/by-uuid/${dev}`]) : { aus: '' }; s.tpm = /tpm2/.test(l.aus); }
  s.tpmChip = fs.existsSync('/dev/tpmrm0') || fs.existsSync('/dev/tpm0');
  try { const d = fs.readdirSync('/sys/firmware/efi/efivars').find((x) => x.startsWith('SecureBoot-')); s.secureBoot = d ? fs.readFileSync('/sys/firmware/efi/efivars/' + d)[4] === 1 : null; } catch { s.secureBoot = null; }
  const ts = await lauf('timeshift', ['--list', '--scripted'], { timeout: 30000 });
  const schnapp = (ts.aus.match(/\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d/g) || []);
  const liste = ts.aus.split('\n').map((z) => z.match(/^\s*\d+\s+>\s+(\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d)\s+(\S*)\s*(.*)$/)).filter(Boolean).map(([, name, tags, kommentar]) => ({ name, tags, kommentar: kommentar.trim() }));
  s.schnappschuesse = ts.fehlt ? null : { anzahl: schnapp.length, letzter: schnapp.sort().pop() || null, eingerichtet: fs.existsSync('/etc/timeshift/timeshift.json'), liste };
  s.live = /boot=live/.test(lies('/proc/cmdline'));
  zustand.system = s;
}

// ---------- Zustand schreiben ----------
function zustandSchreiben() { zustand.zeit = Date.now(); zustand.ziele = ziele; schreibeJson(path.join(RUN, 'waechter.json'), zustand); }

// ---------- Start ----------
async function start() {
  for (let n = 0; !B && n < 60; n++) { await new Promise((r) => setTimeout(r, 5000)); B = benutzer(); }
  if (!B) { log('kein Benutzer gefunden'); process.exit(1); }
  fs.mkdirSync(RUN, { recursive: true }); fs.mkdirSync(VAR, { recursive: true }); try { fs.chmodSync(VAR, 0o755); fs.chmodSync(RUN, 0o755); } catch {}
  fs.mkdirSync(EINGANG_ROOT, { recursive: true, mode: 0o700 });
  log('läuft für', B.name);
  melden('info', 'system', 'Wächter gestartet.');
  folgen('journalctl', ['-k', '-f', '-n', '0', '-o', 'cat', '--grep', 'ZOS-VERWORFEN'], kernelZeile);
  folgen('journalctl', ['-f', '-n', '0', '-o', 'json', '_COMM=sudo', '+', '_COMM=sshd', '+', '_COMM=sshd-session', '+', '_COMM=login', '+', 'SYSLOG_IDENTIFIER=earlyoom', '+', 'SYSLOG_IDENTIFIER=usbguard-daemon'], journalZeile);
  folgen('udevadm', ['monitor', '--udev', '--subsystem-match=usb', '--property'], usbZeile);
  setTimeout(koederWachen, 20_000);
  setTimeout(downloadsWachen, 25_000);
  const alle = (ms, fn) => { const lauf_ = () => Promise.resolve().then(fn).catch((e) => log(fn.name, e.message)); setTimeout(lauf_, 3000); setInterval(lauf_, ms); };
  alle(2_000, eingang);
  alle(30_000, bot);
  alle(30_000, netz);
  alle(30_000, gesundheit);
  alle(60_000, usbListe);
  alle(10 * 60_000, backup);
  alle(6 * 3600_000, smart);
  alle(10 * 60_000, pruefungen);
  alle(10 * 60_000, systemStand);
  alle(5_000, zustandSchreiben);
}
process.on('uncaughtException', (e) => log('Fehler', e.stack || e.message));
process.on('unhandledRejection', (e) => log('Fehler', String(e && e.stack || e)));
start();
