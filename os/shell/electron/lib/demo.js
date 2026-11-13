// Demo-Modus: ein kleiner lokaler Server, der die Schnittstellen der Zentrale auf dem
// Pi nachahmt – mit Testdaten. Die Shell spricht mit ihm genau wie mit dem echten Pi
// (gleiche Adressen, gleiche Antworten), darum werden im Demo-Modus dieselben
// Codepfade benutzt wie im Ernstfall. Nichts davon verlässt den Rechner.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let server = null;
let adresse = null;
let wurzel = null;          // Ordner, der im Demo-Modus «die Laufwerke des Pi» spielt
const befehle = [];         // Fernsteuer-Befehle an diesen Rechner (sperren usw.)
let letzteMeldung = null;
const freigaben = {};

const jetzt = () => Date.now();
const welle = (n, mitte, hub, phase = 0) => Array.from({ length: n }, (_, i) => Math.round((mitte + Math.sin(i / 3 + phase) * hub) * 10) / 10);

const zustand = {
  szene: { id: 'tag', name: 'Tag', seit: jetzt() - 3 * 3600e3, auto: true },
  szenen: [
    { id: 'tag', name: 'Tag', wirkung: ['Alle Dienste an'] },
    { id: 'nacht', name: 'Nacht', wirkung: ['Downloads gedrosselt', 'Lüfter leise'] },
    { id: 'filmabend', name: 'Filmabend', wirkung: ['Downloads pausiert', 'Fernseher an'] },
    { id: 'weg', name: 'Unterwegs', wirkung: ['Trading-PC aus', 'Fernseher aus'] },
  ],
  luefterModus: 'auto', notbetrieb: false, pcAn: true, tvAn: false, tvLaut: 12,
  container: { qbittorrent: true, sonarr: true, radarr: true, gluetun: true },
  backupLaeuft: false,
};

function state() {
  const t = jetzt();
  const dienst = (id, name, ms, kennzahl, label) => ({ id, name, status: zustand.notbetrieb && id !== 'pihole' ? 'pausiert' : 'online', ausGrund: null, ms, verlauf: welle(24, ms, ms / 4), kennzahl, label, url: '' });
  return {
    demo: true,
    zeit: t, uhrzeit: new Date(t).toTimeString().slice(0, 5), hostName: 'homelab-demo', hinweise: ['Demo-Modus: alle Werte sind Testdaten.'],
    szene: zustand.szene, szenen: zustand.szenen,
    energie: { watt: Math.round((11.4 + Math.sin(t / 60000)) * 10) / 10, quelle: 'schaetzung', chfMonat: 2.6, verlauf: welle(48, 11, 2) },
    dienste: [dienst('nextcloud', 'Nextcloud', 84, '412 GB', 'belegt'), dienst('jellyfin', 'Jellyfin', 41, '318', 'Filme'), dienst('vaultwarden', 'Vaultwarden', 22, '96', 'Einträge'),
      dienst('pihole', 'Pi-hole', 9, '18 %', 'geblockt'), dienst('syncthing', 'Syncthing', 15, '3', 'Geräte'), dienst('kuma', 'Uptime Kuma', 30, '99.9 %', '30 Tage')],
    verfuegbarkeit30: 99.87,
    pi: { cpu: 14 + Math.round(Math.abs(Math.sin(t / 20000)) * 20), ramBenutzt: 3.1e9, ramTotal: 7.8e9, temp: 47.5, mhz: 1500, maxMhz: 1800, governor: 'ondemand', unterspannung: false,
      uptimeS: 19 * 86400 + 4000, last: [0.42, 0.38, 0.35], modell: 'Raspberry Pi 4 Model B (Demo)', os: 'Raspberry Pi OS Lite', kernel: '6.12', hostname: 'homelab-demo', kerne: 4, updates: 3, container: { laufen: 21, gesamt: 23 } },
    luefter: { vorhanden: true, prozent: 35 },
    moebel: { vorhanden: true, temp: 27.4, zeit: t, min24: 23.9, max24: 29.8, verlauf: welle(48, 27, 2.4), warnAb: 38,
      luefter: { vorhanden: true, an: zustand.luefterModus !== 'aus', modus: zustand.luefterModus, grund: 'Demo', seit: t - 1800e3, anAb: 30, fehler: null } },
    cloud: { bereit: true, grund: null, nutzer: [{ name: 'kerim', belegt: 412e9 }], platz: { gross: 500e9, frei: 88e9 } },
    anschluesse: [],
    laufwerke: [
      { name: 'System', modell: 'SSD 128 GB', mount: '/', typ: 'ssd', gross: 128e9, benutzt: 41e9, frei: 87e9, port: 'USB 3', schlaeft: false, gesundheit: { stufe: 'ok', text: 'In Ordnung', temp: 34, stunden: 5120, zeit: null } },
      { name: 'Daten', modell: 'Samsung 860 EVO', mount: '/mnt/daten', typ: 'ssd', gross: 500e9, benutzt: 412e9, frei: 88e9, port: 'USB 3', schlaeft: false, gesundheit: { stufe: 'ok', text: 'In Ordnung', temp: 31, stunden: 20400, zeit: null } },
      { name: 'Backup', modell: 'HDD 1 TB', mount: '/mnt/backup', typ: 'hdd', gross: 1000e9, benutzt: 430e9, frei: 570e9, port: 'USB 3', schlaeft: true, gesundheit: { stufe: 'warnung', text: 'Alt, aber stabil', temp: null, stunden: 41200, zeit: null } },
    ],
    scrutinyUrl: '', containerUpdates: { bereit: true, grund: null, url: '', liste: [], gesamt: 0, zeit: t, fehler: [] },
    speicher: { kategorien: [{ name: 'Filme', bytes: 210e9 }, { name: 'Fotos', bytes: 96e9 }, { name: 'Musik', bytes: 44e9 }, { name: 'Dokumente', bytes: 12e9 }, { name: 'Sonstiges', bytes: 50e9 }], zeit: t },
    netz: { geraete: [
      { name: 'trading-pc', typ: 'pc', os: 'Windows', ip: '100.64.0.2', online: zustand.pcAn, zuletzt: null, download: 2.1e9, upload: 3.4e8, dns: 4210, gast: false },
      { name: 'pixel', typ: 'handy', os: 'Android', ip: '100.64.0.3', online: true, zuletzt: null, download: 6.2e8, upload: 9.1e7, dns: 1980, gast: false },
      { name: os.hostname(), typ: 'laptop', os: 'ZentraleOS', ip: '100.64.0.4', online: true, zuletzt: null, download: 1.1e8, upload: 2.2e7, dns: 320, gast: false }],
      verkehr: welle(30, 4e6, 3e6).map((d, i) => ({ down: Math.abs(d), up: Math.abs(d) / 6 + i * 1000 })), heute: { down: 8.4e9, up: 1.2e9 },
      lan: { name: 'eth0', mbit: 1000, verbunden: true }, ping: 9, tailscale: { aktiv: true, ip: '100.64.0.1', dns: 'homelab-demo.ts.net' }, pihole: { anfragen: 48211, geblockt: 8760, prozent: 18.2 } },
    sync: [{ titel: 'Obsidian-Vault', unter: '3 Geräte', t: 'vor 2 Min.', art: 'ok' }],
    backup: { eingerichtet: true, laeuft: zustand.backupLaeuft, auto: true, zeit: '03:30', letzte: { zeit: t - 9 * 3600e3, ok: true, bytes: 3.2e9, dauerS: 740, fehler: null } },
    ereignisse: [{ t: t - 600e3, art: 'ok', text: 'Backup abgeschlossen' }, { t: t - 4000e3, art: 'film', text: 'Neuer Film in Jellyfin' }, { t: t - 9000e3, art: 'info', text: 'Szene «Tag» gestartet' }],
    gaeste: { bereit: true, grund: null, aclVorschlag: '', jellyfinUrl: '', jellyfinBereit: true, liste: [] },
    einstellungen: { luefterModus: zustand.luefterModus },
    faehigkeiten: { telegram: true, hddSchlaf: true, luefter: true, moebel: true, sshNurSchluessel: true, backup: true, shelly: false },
    medien: { vpn: { ok: true, geschuetzt: true, ip: '185.0.0.1', land: 'Schweiz', stadt: 'Zürich', anbieter: 'Demo VPN', gluetun: 'running', health: 'healthy', ausgeschaltet: !zustand.container.gluetun },
      downloads: { down: 3.4e6, up: 2.1e5, verbindung: 'connected', gedrosselt: false, anzahl: { laden: 2, pausiert: 1, fehler: 0, fertig: 14 },
        torrents: [{ hash: 'a', name: 'Beispielfilm (2024) 1080p', fortschritt: 0.62, down: 2.2e6, up: 1e5, eta: 1400, zustand: 'downloading', groesse: 8.1e9, kategorie: 'radarr', hinzugefuegt: t - 3e6 },
          { hash: 'b', name: 'Beispielserie S02E05', fortschritt: 0.18, down: 1.2e6, up: 4e4, eta: 3800, zustand: 'downloading', groesse: 2.4e9, kategorie: 'sonarr', hinzugefuegt: t - 1e6 }] },
      downloadsGrund: null, arrGrund: [],
      apps: Object.entries({ qbittorrent: 'qBittorrent', sonarr: 'Sonarr', radarr: 'Radarr' }).map(([id, name]) => ({ id, name, url: null, zustand: zustand.container[id] ? 'online' : 'offline', laufzeit: '19 Tage', version: null, warnungen: [], warteschlange: 1, anzahl: 120, anzahlLabel: 'Titel', vorhanden: 110, gesamt: 120, detail: '', fehlt: [], fehler: null, ausgeschaltet: !zustand.container[id] })),
      demnaechst: [{ titel: 'Beispielserie S02E06', wann: 'Freitag', art: 'serie', hatDatei: false }], neu: [], seerr: { offen: 1, inArbeit: 2, verfuegbar: 40, gesamt: 43 }, filmabendDrosseln: true },
    steuerung: { notbetrieb: { an: zustand.notbetrieb }, container: Object.entries(zustand.container).map(([name, an]) => ({ name, an })) },
    pc: { eingerichtet: true, an: zustand.pcAn, online: zustand.pcAn, name: 'trading-pc', text: zustand.pcAn ? 'läuft' : 'aus' },
    tv: { eingerichtet: true, an: zustand.tvAn, lautstaerke: zustand.tvLaut, name: 'Fernseher', text: zustand.tvAn ? 'an' : 'aus' },
  };
}

const trading = () => ({ demo: true, konto: { name: 'Demo-Konto', saldo: 10432.18, equity: 10518.4, waehrung: 'USD' }, heute: { pnl: 86.22, trades: 2, treffer: 1 }, woche: { pnl: 311.5, trades: 7, treffer: 4 },
  offen: [{ paar: 'EURUSD', seite: 'long', lots: 0.3, einstieg: 1.0842, aktuell: 1.0871, pnl: 86.22 }],
  letzte: [{ paar: 'GBPJPY', seite: 'short', pnl: -42.1, zeit: jetzt() - 86400e3 }, { paar: 'AUDUSD', seite: 'long', pnl: 128.4, zeit: jetzt() - 2 * 86400e3 }], kurve: welle(30, 10200, 180).map((v, i) => v + i * 9) });
const heute = () => ({ demo: true, datum: new Date().toISOString().slice(0, 10), termine: [{ zeit: '09:00', titel: 'Marktvorbereitung' }, { zeit: '14:30', titel: 'US-Daten (CPI)' }, { zeit: '18:00', titel: 'Training' }],
  aufgaben: [{ titel: 'Journal nachtragen', erledigt: false }, { titel: 'ZentraleOS auf dem HP testen', erledigt: false }, { titel: 'Backup prüfen', erledigt: true }], wetter: { ort: 'Solothurn', temp: 7, text: 'bewölkt' } });
const garmin = () => ({ demo: true, schlaf: { stunden: 7.4, wert: 81 }, bodyBattery: 68, stress: 27, schritte: 6240, ruhepuls: 54, hrv: 62 });

// ---------- Dateien (echte Dateien in einem Demo-Ordner) ----------
const LAUFWERK = '/mnt/daten';
function saat() {
  if (fs.existsSync(wurzel)) return;
  const d = (p, inhalt) => { fs.mkdirSync(path.dirname(path.join(wurzel, p)), { recursive: true }); fs.writeFileSync(path.join(wurzel, p), inhalt); };
  d('Dokumente/Willkommen.md', '# Willkommen im Demo-Modus\n\nDiese Dateien liegen nur auf diesem Rechner und spielen die Laufwerke des Pi.\n');
  d('Dokumente/Trading/Regeln.txt', '1. Nur 3-Tages-Bias handeln\n2. Risiko 0.5 % pro Trade\n3. Nach zwei Verlusten Pause\n');
  d('Dokumente/Homelab/Meine Specs.md', '- Pi 4, 8 GB\n- SSD 500 GB (Daten)\n- HDD 1 TB (Backup)\n');
  d('Notizen/Einkauf.txt', 'Reis\nPoulet\nSkyr\n');
  d('Bilder/verlauf.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="320" cy="180" r="70" fill="none" stroke="#fff" stroke-width="10"/><circle cx="320" cy="180" r="22" fill="#fff"/></svg>');
  fs.mkdirSync(path.join(wurzel, 'Medien/Filme'), { recursive: true });
}
function pfadSicher(rel) {
  const teile = String(rel || '/').split('/').filter(Boolean);
  if (teile.some((t) => t === '..' || t === '.' || t.includes('\0'))) throw Object.assign(new Error('Ungültiger Pfad'), { status: 400 });
  return path.join(wurzel, ...teile);
}
function wurzelOk(w) { if (w !== LAUFWERK) throw Object.assign(new Error('Unbekanntes Laufwerk'), { status: 400 }); }
const ART = { bild: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'], video: ['mp4', 'mkv', 'webm', 'mov'], audio: ['mp3', 'flac', 'wav', 'ogg', 'm4a'], pdf: ['pdf'], text: ['txt', 'md', 'json', 'csv', 'log', 'js', 'ts', 'css', 'html', 'xml', 'yml', 'yaml', 'sh', 'py', 'conf', 'ini'] };
const dateiArt = (n) => { const e = path.extname(n).slice(1).toLowerCase(); for (const [a, l] of Object.entries(ART)) if (l.includes(e)) return a; return 'datei'; };
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', json: 'application/json' };
function freierName(ordner, name) {
  if (!fs.existsSync(path.join(ordner, name))) return name;
  const ext = path.extname(name); const b = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) if (!fs.existsSync(path.join(ordner, `${b} ${i}${ext}`))) return `${b} ${i}${ext}`;
  throw new Error('Kein freier Name');
}

const dateien = {
  laufwerke: () => ({ laufwerke: state().laufwerke.filter((l) => l.mount === LAUFWERK) }),
  liste(q) {
    wurzelOk(q.wurzel); const ordner = pfadSicher(q.pfad);
    const eintraege = fs.readdirSync(ordner, { withFileTypes: true }).filter((d) => q.versteckte || !d.name.startsWith('.')).map((d) => {
      const st = fs.statSync(path.join(ordner, d.name)); const typ = d.isDirectory() ? 'ordner' : 'datei';
      return { name: d.name, typ, art: typ === 'datei' ? dateiArt(d.name) : typ, groesse: typ === 'datei' ? st.size : null, geaendert: Math.round(st.mtimeMs), fremdesLaufwerk: false };
    }).sort((a, b) => (a.typ === 'ordner' ? 0 : 1) - (b.typ === 'ordner' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
    return { wurzel: q.wurzel, pfad: '/' + String(q.pfad || '/').split('/').filter(Boolean).join('/'), eintraege, anzahl: eintraege.length, gekuerzt: false, schreibbar: true };
  },
  text(q) { wurzelOk(q.wurzel); const p = pfadSicher(q.pfad); const st = fs.statSync(p); return { name: path.basename(p), inhalt: fs.readFileSync(p, 'utf8'), groesse: st.size, geaendert: Math.round(st.mtimeMs) }; },
  textSchreiben(b) { wurzelOk(b.wurzel); const p = pfadSicher(b.pfad); fs.writeFileSync(p, String(b.inhalt ?? '')); const st = fs.statSync(p); return { ok: true, groesse: st.size, geaendert: Math.round(st.mtimeMs) }; },
  neu(b) { wurzelOk(b.wurzel); const p = pfadSicher(b.pfad); if (fs.existsSync(p)) throw Object.assign(new Error('Gibt es schon'), { status: 409 }); if (b.ordner) fs.mkdirSync(p); else fs.writeFileSync(p, String(b.inhalt ?? '')); return { ok: true, pfad: b.pfad }; },
  umbenennen(b) { wurzelOk(b.wurzel); const p = pfadSicher(b.pfad); if (!b.name || /[\\/\0]/.test(b.name)) throw Object.assign(new Error('Ungültiger Name'), { status: 400 }); const z = path.join(path.dirname(p), b.name); if (fs.existsSync(z)) throw Object.assign(new Error('Gibt es schon'), { status: 409 }); fs.renameSync(p, z); return { ok: true, name: b.name }; },
  verschieben(b) { wurzelOk(b.wurzel); wurzelOk(b.zielWurzel); const q = pfadSicher(b.pfad); const z = pfadSicher(b.zielPfad); const name = freierName(z, path.basename(q)); if (b.kopieren) fs.cpSync(q, path.join(z, name), { recursive: true }); else fs.renameSync(q, path.join(z, name)); return { ok: true, name }; },
  loeschen(b) { wurzelOk(b.wurzel); const p = pfadSicher(b.pfad); if (b.endgueltig) { fs.rmSync(p, { recursive: true, force: true }); return { ok: true, endgueltig: true }; } const korb = path.join(wurzel, '.Papierkorb'); fs.mkdirSync(korb, { recursive: true }); fs.renameSync(p, path.join(korb, freierName(korb, path.basename(p)))); return { ok: true, endgueltig: false }; },
  papierkorb(b) { wurzelOk(b.wurzel); const korb = path.join(wurzel, '.Papierkorb'); const n = fs.existsSync(korb) ? fs.readdirSync(korb).length : 0; fs.rmSync(korb, { recursive: true, force: true }); return { ok: true, geloescht: n }; },
  teilen(b) { wurzelOk(b.wurzel); pfadSicher(b.pfad); const token = require('node:crypto').randomBytes(12).toString('hex'); const tage = Number(b.tage) || 7; freigaben[token] = { wurzel: b.wurzel, pfad: b.pfad, name: path.basename(b.pfad), bis: jetzt() + tage * 86400e3 }; return { ok: true, token, url: `${adresse}/teilen/${token}`, name: freigaben[token].name, bis: freigaben[token].bis, tage }; },
  freigaben: () => ({ freigaben: Object.entries(freigaben).map(([token, f]) => ({ token, ...f, url: `${adresse}/teilen/${token}` })) }),
  freigabeWeg(b) { delete freigaben[b.token]; return { ok: true }; },
};

// ---------- Steuerung ----------
function steuern(p, b) {
  if (p === '/api/pc/wecken') zustand.pcAn = true;
  else if (p === '/api/pc/ausschalten') zustand.pcAn = false;
  else if (p === '/api/tv/an') zustand.tvAn = true;
  else if (p === '/api/tv/taste') { if (b.taste === 'aus' || b.taste === 'power') zustand.tvAn = !zustand.tvAn; }
  else if (p === '/api/tv/lautstaerke') zustand.tvLaut = Number(b.wert) || 0;
  else if (p === '/api/szene') { const s = zustand.szenen.find((x) => x.id === b.id); if (!s) throw Object.assign(new Error('Unbekannte Szene'), { status: 400 }); zustand.szene = { id: s.id, name: s.name, seit: jetzt(), auto: false }; }
  else if (p.startsWith('/api/container/')) zustand.container[decodeURIComponent(p.split('/').pop())] = !!b.an;
  else if (p === '/api/notbetrieb') zustand.notbetrieb = !!b.an;
  else if (p === '/api/luefter') zustand.luefterModus = ['auto', 'an', 'aus'].includes(b.modus) ? b.modus : 'auto';
  else if (p === '/api/backup/start') { zustand.backupLaeuft = true; setTimeout(() => { zustand.backupLaeuft = false; }, 8000); }
  else if (/^\/api\/dienst\/.+\/neustart$/.test(p) || p === '/api/pi/neustart' || p === '/api/pi/ausschalten') { /* nur bestätigen */ }
  else return null;
  return { ok: true, demo: true };
}

// ---------- Die 13 Tabs als Demo-Seite ----------
const SEITE = fs.readFileSync(path.join(__dirname, 'demo-seite.html'), 'utf8');

function koerper(req) {
  return new Promise((ok) => { const t = []; req.on('data', (c) => t.push(c)); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(t).toString('utf8') || '{}')); } catch { ok({}); } }); });
}

async function bedienen(req, res) {
  const u = new URL(req.url, 'http://x'); const p = u.pathname; const m = req.method; const q = Object.fromEntries(u.searchParams);
  const json = (code, d) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(d)); };
  try {
    if (p === '/' && m === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(SEITE); }
    if (p === '/api/me') return json(200, { angemeldet: true, demo: true });
    if (p === '/api/login' && m === 'POST') { const b = await koerper(req); return b.passwort === 'demo' ? json(200, { ok: true }) : json(401, { fehler: 'Falsches Passwort (im Demo-Modus: demo)' }); }
    if (p === '/api/logout') return json(200, { ok: true });
    if (p === '/api/geraet/token' && m === 'POST') return json(200, { ok: true, token: 'demo-geraet-token', name: 'Demo', bis: jetzt() + 365 * 86400e3 });
    if (p === '/api/geraet/sitzung' && m === 'POST') return json(200, { ok: true, name: 'Demo' });
    if (p === '/api/geraete') return json(200, { geraete: [{ id: 'demo', name: os.hostname() + ' (ZentraleOS)', art: 'desktop', erstellt: jetzt() - 86400e3, zuletzt: jetzt(), bis: jetzt() + 364 * 86400e3 }] });
    if (p === '/api/geraete/weg') return json(200, { ok: true });
    if (p === '/api/hp/abholen' && m === 'POST') { letzteMeldung = { ...(await koerper(req)), zeit: jetzt() }; return json(200, { ok: true, befehle: befehle.splice(0) }); }
    if (p === '/api/hp' && m === 'GET') return json(200, { ok: true, meldung: letzteMeldung, erreichbar: !!letzteMeldung && jetzt() - letzteMeldung.zeit < 120e3 });
    if (p === '/api/hp/befehl' && m === 'POST') { const b = await koerper(req); if (!['sperren', 'bildschirmAus', 'bildschirmAn', 'schlafen'].includes(b.befehl)) return json(400, { fehler: 'Unbekannter Befehl' }); befehle.push(b.befehl); return json(200, { ok: true, befehl: b.befehl }); }
    if (p === '/api/state') return json(200, state());
    if (p === '/api/trading') return json(200, trading());
    if (p === '/api/heute') return json(200, heute());
    if (p === '/api/garmin') return json(200, garmin());

    if (p === '/api/dateien/laufwerke') return json(200, dateien.laufwerke());
    if (p === '/api/dateien' && m === 'GET') return json(200, dateien.liste(q));
    if (p === '/api/dateien/text' && m === 'GET') return json(200, dateien.text(q));
    if (p === '/api/dateien/teilen' && m === 'GET') return json(200, dateien.freigaben());
    if (p === '/api/dateien/inhalt') {
      wurzelOk(q.wurzel); const datei = pfadSicher(q.pfad); const st = fs.statSync(datei);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(datei).slice(1).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
      return fs.createReadStream(datei).pipe(res);
    }
    if (p === '/api/dateien/upload' && m === 'POST') {
      wurzelOk(q.wurzel); const ordner = pfadSicher(q.pfad); const name = freierName(ordner, path.basename(String(q.name || 'datei')));
      const aus = fs.createWriteStream(path.join(ordner, name)); req.pipe(aus);
      return aus.on('finish', () => json(200, { ok: true, name })).on('error', (e) => json(500, { fehler: e.message }));
    }
    if (m === 'POST' && p.startsWith('/api/dateien/')) {
      const b = await koerper(req);
      const karte = { text: 'textSchreiben', neu: 'neu', umbenennen: 'umbenennen', verschieben: 'verschieben', loeschen: 'loeschen', papierkorb: 'papierkorb', teilen: 'teilen', 'teilen/weg': 'freigabeWeg' };
      const fn = karte[p.slice('/api/dateien/'.length)];
      if (fn) return json(200, dateien[fn](b));
    }
    if (m === 'POST') { const r = steuern(p, await koerper(req)); if (r) return json(200, r); }
    json(404, { fehler: 'Im Demo-Modus nicht vorhanden: ' + p });
  } catch (e) {
    json(e.status || (e.code === 'ENOENT' ? 404 : 500), { fehler: e.code === 'ENOENT' ? 'Nicht gefunden' : String(e.message).slice(0, 200) });
  }
}

function starten(datenOrdner) {
  if (server) return Promise.resolve(adresse);
  wurzel = path.join(datenOrdner, 'demo-pi');
  saat();
  return new Promise((ok, schief) => {
    server = http.createServer(bedienen);
    server.on('error', schief);
    server.listen(0, '127.0.0.1', () => { adresse = `http://127.0.0.1:${server.address().port}`; ok(adresse); });
  });
}

function stoppen() { if (server) server.close(); server = null; adresse = null; }

module.exports = { starten, stoppen, url: () => adresse };
