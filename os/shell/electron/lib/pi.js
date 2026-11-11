// Alle Anfragen an die Zentrale auf dem Pi.
// Läuft im Hauptprozess, darum kein CORS. Die Sitzung (Cookie) liegt in der
// Partition "persist:zentrale" – dieselbe benutzt das eingebettete Zentrale-Fenster,
// darum muss man sich nur einmal anmelden.
const { session } = require('electron');
const einstellungen = require('./einstellungen');

const PARTITION = 'persist:zentrale';

const sitzung = () => session.fromPartition(PARTITION);
// Im Demo-Modus zeigt alles auf den lokalen Demo-Server (siehe demo.js).
const basis = () => String(global.zosDemoUrl || einstellungen.alle().zentraleUrl || '').replace(/\/+$/, '');

function url(pfad) {
  if (/^https?:\/\//i.test(pfad)) return pfad;
  return basis() + (pfad.startsWith('/') ? pfad : '/' + pfad);
}

// Eine Anfrage an die Zentrale. Gibt { ok, status, daten, fehler } zurück – wirft nie.
async function anfrage(pfad, { method = 'GET', daten, kopf = {}, timeout = 15000, roh = false, duplex = false } = {}) {
  const ctrl = new AbortController();
  // timeout 0 = kein Zeitlimit (für grosse Dateien)
  const t = timeout > 0 ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const headers = { Accept: 'application/json', ...kopf };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['X-Zentrale'] = '1';              // Schutz der Zentrale gegen fremde Seiten
      if (daten !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    const koerper = daten === undefined ? undefined
      : (typeof daten === 'string' || Buffer.isBuffer(daten) || daten instanceof ReadableStream) ? daten
        : JSON.stringify(daten);
    const res = await sitzung().fetch(url(pfad), {
      method,
      headers,
      body: koerper,
      signal: ctrl.signal,
      ...(duplex ? { duplex: 'half' } : {}),
    });
    if (roh) return { ok: res.ok, status: res.status, res };
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { fehler: text.slice(0, 200) }; }
    if (!res.ok) return { ok: false, status: res.status, fehler: json?.fehler || `HTTP ${res.status}`, daten: json };
    return { ok: true, status: res.status, daten: json };
  } catch (e) {
    const abbruch = e.name === 'AbortError';
    return { ok: false, status: 0, fehler: abbruch ? 'Zeitüberschreitung – Pi antwortet nicht' : piFehlerText(e) };
  } finally {
    if (t) clearTimeout(t);
  }
}

function piFehlerText(e) {
  const m = String(e?.message || e);
  if (/ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED/i.test(m)) return 'Pi nicht gefunden – läuft Tailscale?';
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(m)) return 'Pi antwortet nicht – läuft die Zentrale?';
  if (/ERR_CONNECTION_RESET|ECONNRESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/i.test(m)) return 'Verbindung zum Pi wurde abgebrochen';
  if (/ETIMEDOUT|ERR_CONNECTION_TIMED_OUT|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE/i.test(m)) return 'Keine Verbindung zum Pi';
  if (/ERR_CERT|CERT_|SSL|ERR_SSL/i.test(m)) return 'Zertifikat des Pi wird abgelehnt';
  if (/ERR_PROXY|ERR_TUNNEL/i.test(m)) return 'Verbindung wird von einem Proxy blockiert';
  // Unbekannte Chromium-Fehler lesbar machen: "net::ERR_FOO_BAR" -> "Pi nicht erreichbar (ERR_FOO_BAR)"
  const net = m.match(/ERR_[A-Z0-9_]+/);
  if (net) return `Pi nicht erreichbar (${net[0]})`;
  return m.slice(0, 160);
}

// Schneller Erreichbarkeitstest (kurzes Zeitlimit, damit der Anmeldebildschirm nicht hängt).
async function erreichbar(timeout = 4000) {
  const r = await anfrage('/api/me', { timeout });
  return r.status > 0;
}

async function angemeldet() {
  const r = await anfrage('/api/me', { timeout: 6000 });
  return { online: r.status > 0, angemeldet: !!r.daten?.angemeldet, fehler: r.ok ? null : r.fehler };
}

async function anmelden(passwort, code) {
  const r = await anfrage('/api/login', { method: 'POST', daten: { passwort, code }, timeout: 15000 });
  if (r.ok) return { ok: true };
  return { ok: false, fehler: r.fehler || 'Anmeldung fehlgeschlagen', codeNoetig: !!r.daten?.codeNoetig, online: r.status > 0 };
}

// Ein langlebiges Geräte-Token holen (nur aus einer angemeldeten Sitzung heraus).
async function tokenHolen(name) {
  const r = await anfrage('/api/geraet/token', { method: 'POST', daten: { name, art: 'desktop' }, timeout: 15000 });
  return r.ok ? { ok: true, token: r.daten.token, bis: r.daten.bis } : { ok: false, fehler: r.fehler };
}

// Token gegen eine frische Sitzung tauschen. Danach ist auch das eingebettete
// Zentrale-Fenster angemeldet, weil es dieselbe Partition benutzt.
async function sitzungMitToken(token) {
  const r = await anfrage('/api/geraet/sitzung', { method: 'POST', daten: { token }, timeout: 15000 });
  return r.ok ? { ok: true, name: r.daten.name } : { ok: false, fehler: r.fehler, status: r.status };
}

// Offene Befehle vom Pi abholen und dabei den eigenen Zustand melden.
// Ausweis ist das Geräte-Token, keine Sitzung nötig – klappt also auch im
// gesperrten Zustand und wenn die Sitzung gerade abgelaufen ist.
async function hpAbholen(token, meldung) {
  const r = await anfrage('/api/hp/abholen', {
    method: 'POST', daten: meldung, kopf: { 'X-Geraet-Token': token }, timeout: 10000,
  });
  return r.ok ? { ok: true, befehle: r.daten.befehle || [] } : { ok: false, fehler: r.fehler, status: r.status };
}

async function geraeteListe() {
  const r = await anfrage('/api/geraete', { timeout: 10000 });
  return r.ok ? { ok: true, geraete: r.daten.geraete || [] } : { ok: false, fehler: r.fehler };
}

async function geraetEntkoppeln(id) {
  const r = await anfrage('/api/geraete/weg', { method: 'POST', daten: { id }, timeout: 10000 });
  return r.ok ? { ok: true } : { ok: false, fehler: r.fehler };
}

async function abmelden() {
  await anfrage('/api/logout', { method: 'POST', timeout: 6000 });
  try { await sitzung().clearStorageData({ storages: ['cookies'] }); } catch {}
  return { ok: true };
}

// ---------- Dateien auf dem Pi ----------
const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

const dateien = {
  laufwerke: () => anfrage('/api/dateien/laufwerke'),
  liste: (wurzel, pfad, versteckte) => anfrage('/api/dateien?' + q({ wurzel, pfad, versteckte: versteckte ? '1' : '' })),
  text: (wurzel, pfad) => anfrage('/api/dateien/text?' + q({ wurzel, pfad })),
  textSchreiben: (wurzel, pfad, inhalt) => anfrage('/api/dateien/text', { method: 'POST', daten: { wurzel, pfad, inhalt }, timeout: 30000 }),
  neu: (wurzel, pfad, ordner, inhalt) => anfrage('/api/dateien/neu', { method: 'POST', daten: { wurzel, pfad, ordner, inhalt } }),
  umbenennen: (wurzel, pfad, name) => anfrage('/api/dateien/umbenennen', { method: 'POST', daten: { wurzel, pfad, name } }),
  verschieben: (a) => anfrage('/api/dateien/verschieben', { method: 'POST', daten: a, timeout: 300000 }),
  loeschen: (wurzel, pfad, endgueltig) => anfrage('/api/dateien/loeschen', { method: 'POST', daten: { wurzel, pfad, endgueltig }, timeout: 120000 }),
  papierkorb: (wurzel) => anfrage('/api/dateien/papierkorb', { method: 'POST', daten: { wurzel }, timeout: 120000 }),
  teilen: (wurzel, pfad, tage) => anfrage('/api/dateien/teilen', { method: 'POST', daten: { wurzel, pfad, tage } }),
  freigaben: () => anfrage('/api/dateien/teilen'),
  freigabeWeg: (token) => anfrage('/api/dateien/teilen/weg', { method: 'POST', daten: { token } }),
  // Datei vom HP auf den Pi laden. Grosse Dateien werden gestreamt; klappt das
  // nicht (ältere Electron-Versionen können das nicht), wird gepuffert.
  hochladenVon: async (wurzel, zielPfad, name, quelleHost) => {
    const fs = require('node:fs');
    const { Readable } = require('node:stream');
    const ziel = '/api/dateien/upload?' + q({ wurzel, pfad: zielPfad, name });
    const kopf = { 'Content-Type': 'application/octet-stream' };
    try {
      const strom = Readable.toWeb(fs.createReadStream(quelleHost));
      const r = await anfrage(ziel, { method: 'POST', daten: strom, kopf, timeout: 0, duplex: true });
      if (r.ok || r.status > 0) return r;
    } catch { /* unten gepuffert versuchen */ }
    const st = fs.statSync(quelleHost);
    if (st.size > 512 * 1024 * 1024) return { ok: false, fehler: 'Datei zu gross für den Upload (über 512 MB) – bitte über Syncthing oder Nextcloud auf den Pi legen.' };
    return anfrage(ziel, { method: 'POST', daten: fs.readFileSync(quelleHost), kopf, timeout: 0 });
  },
  // Datei vom Pi direkt in eine Datei auf dem HP streamen (ohne alles in den Speicher zu laden).
  herunterladenNach: async (wurzel, pfad, zielHost) => {
    const fs = require('node:fs');
    const { Readable } = require('node:stream');
    const { pipeline } = require('node:stream/promises');
    const r = await anfrage('/api/dateien/inhalt?' + q({ wurzel, pfad, download: '1' }), { roh: true, timeout: 0 });
    if (!r.ok) return { ok: false, fehler: r.fehler || `HTTP ${r.status}` };
    const tmp = zielHost + '.zentrale-download';
    try {
      if (r.res.body) await pipeline(Readable.fromWeb(r.res.body), fs.createWriteStream(tmp));
      else fs.writeFileSync(tmp, Buffer.from(await r.res.arrayBuffer()));
      fs.renameSync(tmp, zielHost);
      return { ok: true, groesse: fs.statSync(zielHost).size };
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      return { ok: false, fehler: String(e.message).slice(0, 160) };
    }
  },
};

// ---------- Steuerung (PC, TV, Szenen, Dienste) ----------
const steuerung = {
  status: () => anfrage('/api/state', { timeout: 12000 }),
  // Zusatzdaten für Widgets (fehlen sie, zeigt das Widget das einfach an)
  trading: () => anfrage('/api/trading', { timeout: 12000 }),
  heute: () => anfrage('/api/heute', { timeout: 15000 }),
  garmin: () => anfrage('/api/garmin', { timeout: 15000 }),
  pcWecken: () => anfrage('/api/pc/wecken', { method: 'POST', timeout: 20000 }),
  pcAus: () => anfrage('/api/pc/ausschalten', { method: 'POST', daten: { bestaetigt: true }, timeout: 30000 }),
  tvAn: () => anfrage('/api/tv/an', { method: 'POST', timeout: 20000 }),
  tvTaste: (taste) => anfrage('/api/tv/taste', { method: 'POST', daten: { taste }, timeout: 15000 }),
  tvLautstaerke: (wert) => anfrage('/api/tv/lautstaerke', { method: 'POST', daten: { wert }, timeout: 15000 }),
  szene: (id) => anfrage('/api/szene', { method: 'POST', daten: { id }, timeout: 120000 }),
  container: (name, an) => anfrage('/api/container/' + encodeURIComponent(name), { method: 'POST', daten: { an }, timeout: 120000 }),
  dienstNeustart: (id) => anfrage(`/api/dienst/${encodeURIComponent(id)}/neustart`, { method: 'POST', timeout: 120000 }),
  notbetrieb: (an) => anfrage('/api/notbetrieb', { method: 'POST', daten: { an }, timeout: 120000 }),
  luefter: (modus) => anfrage('/api/luefter', { method: 'POST', daten: { modus }, timeout: 20000 }),
  backupStart: () => anfrage('/api/backup/start', { method: 'POST', timeout: 30000 }),
  piNeustart: () => anfrage('/api/pi/neustart', { method: 'POST', daten: { bestaetigt: true }, timeout: 20000 }),
  piAus: () => anfrage('/api/pi/ausschalten', { method: 'POST', daten: { bestaetigt: true }, timeout: 20000 }),
};

module.exports = { PARTITION, sitzung, basis, url, anfrage, erreichbar, angemeldet, anmelden, abmelden, tokenHolen, sitzungMitToken, hpAbholen, geraeteListe, geraetEntkoppeln, dateien, steuerung };
