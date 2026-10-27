// Tab «Heute»: Google-Anbindung (Gmail, Kalender, Aufgaben) – bewusst klein.
// - Anmeldung per OAuth (Webanwendung). Der Schlüssel (Refresh-Token) liegt nur auf dem Pi in data/google.json (Rechte 600).
// - Mail: wichtige ungelesene Mails, Aufräumen nach Absender (archivieren, löschen, abmelden, Regel), Werbefilter als echter
//   Gmail-Filter mit Ausnahmen (z. B. digitec/Galaxus für Bestellung, Versand, Rechnung).
// - Kalender: heute + 7 Tage aus allen sichtbaren Kalendern, neuer Termin.
// - Aufgaben: Google Tasks (Standardliste) anzeigen, hinzufügen, abhaken.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { holen } from './util.mjs';

const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/gmail.modify', // lesen, archivieren, Papierkorb, Abmelde-Mail senden
  'https://www.googleapis.com/auth/gmail.settings.basic', // Gmail-Filter anlegen
  'https://www.googleapis.com/auth/calendar.readonly', // Kalenderliste
  'https://www.googleapis.com/auth/calendar.events', // Termine lesen und eintragen
  'https://www.googleapis.com/auth/tasks', // Google Tasks
];
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TZ = 'Europe/Zurich';

const tokenDatei = () => path.join(config.dataDir, 'google.json');
const rueckUrl = () => `https://${config.hostName}:8443/api/google/zurueck`;
let tok = null; // { refresh, access, bis, email }
const offeneStates = new Map(); // state -> Ablauf

function tokLaden() {
  if (tok) return tok;
  try { tok = JSON.parse(fs.readFileSync(tokenDatei(), 'utf8')); } catch { tok = null; }
  return tok;
}
function tokSpeichern(t) {
  tok = t;
  fs.writeFileSync(tokenDatei(), JSON.stringify(t), { mode: 0o600 });
  try { fs.chmodSync(tokenDatei(), 0o600); } catch {}
}

function hz() {
  const d = db();
  d.heute ||= {};
  d.heute.werbefilter = {
    an: false,
    aktion: 'archivieren', // archivieren | loeschen
    absenderAusnahmen: ['digitec.ch', 'galaxus.ch'],
    woerterAusnahmen: ['Bestellung', 'Versand', 'Rechnung', 'Lieferung', 'Sendung', 'Paket', 'Bestätigung', 'Zahlung', 'Quittung', 'Rücksendung', 'Abholung', 'Termin', 'Konto', 'Passwort', 'Sicherheit', 'Code'],
    filterId: null,
    ...(d.heute.werbefilter || {}),
  };
  d.heute.behalten ||= []; // Absender, die nie aufgeräumt werden
  d.heute.regeln ||= {}; // email -> { filterId, aktion }
  return d.heute;
}

export const googleEingerichtet = () => !!(config.google.clientId && config.google.clientSecret);
export const googleVerbunden = () => !!tokLaden()?.refresh;

// ---------- Anmeldung ----------
export function anmeldeUrl() {
  if (!googleEingerichtet()) throw new Error('GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET fehlen in der .env');
  const state = crypto.randomBytes(24).toString('hex');
  const jetzt = Date.now();
  for (const [k, v] of offeneStates) if (v < jetzt) offeneStates.delete(k);
  offeneStates.set(state, jetzt + 10 * 60_000);
  const q = new URLSearchParams({
    client_id: config.google.clientId, redirect_uri: rueckUrl(), response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenAnfrage(params) {
  const { res } = await holen('https://oauth2.googleapis.com/token', {
    method: 'POST', timeout: 15_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...params }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || `Google HTTP ${res.status}`);
  return j;
}

// Rückkehr von Google (ohne Zentrale-Cookie, weil die Weiterleitung von einer fremden Seite kommt) → geschützt über «state».
export async function rueckkehr(url) {
  const state = url.searchParams.get('state') || '';
  const gueltig = offeneStates.get(state);
  offeneStates.delete(state);
  if (!gueltig || gueltig < Date.now()) throw new Error('Anmeldung abgelaufen oder ungültig. Bitte in der Zentrale neu starten.');
  if (url.searchParams.get('error')) throw new Error(`Google: ${url.searchParams.get('error')}`);
  const j = await tokenAnfrage({ code: url.searchParams.get('code') || '', grant_type: 'authorization_code', redirect_uri: rueckUrl() });
  if (!j.refresh_token) throw new Error('Google hat keinen dauerhaften Schlüssel geliefert. Zugriff unter myaccount.google.com/permissions entfernen und neu verbinden.');
  let email = null;
  try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email || null; } catch {}
  tokSpeichern({ refresh: j.refresh_token, access: j.access_token, bis: Date.now() + (j.expires_in - 60) * 1000, email, seit: Date.now() });
  cache.clear();
}

export async function trennen() {
  const t = tokLaden();
  if (t?.refresh) { try { await holen(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh)}`, { method: 'POST', timeout: 10_000 }); } catch {} }
  tok = null;
  try { fs.unlinkSync(tokenDatei()); } catch {}
  cache.clear();
}

async function accessToken() {
  const t = tokLaden();
  if (!t?.refresh) throw Object.assign(new Error('Nicht mit Google verbunden'), { status: 409 });
  if (t.access && t.bis > Date.now()) return t.access;
  try {
    const j = await tokenAnfrage({ refresh_token: t.refresh, grant_type: 'refresh_token' });
    tokSpeichern({ ...t, access: j.access_token, bis: Date.now() + (j.expires_in - 60) * 1000 });
    return j.access_token;
  } catch (e) {
    if (/invalid_grant/i.test(e.message)) throw Object.assign(new Error('Google-Zugang abgelaufen oder entzogen – bitte neu verbinden'), { status: 409 });
    throw e;
  }
}

async function g(method, url, body) {
  for (let versuch = 0; versuch < 2; versuch++) {
    const token = await accessToken();
    const { res } = await holen(url, {
      method, timeout: 20_000,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && versuch === 0) { tok.access = null; continue; }
    if (res.status === 204) return {};
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error?.message || `Google HTTP ${res.status}`), { status: res.status >= 500 ? 502 : 400 });
    return j;
  }
}

// Mehrere Aufrufe gleichzeitig, aber nicht zu viele (Google-Limits).
async function parallel(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { fehler: e.message }; } }
  }));
  return out;
}

const cache = new Map(); // key -> { t, wert }
async function gecacht(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ms) return c.wert;
  const wert = await fn();
  cache.set(key, { t: Date.now(), wert });
  return wert;
}

// ---------- Mail ----------
const kopf = (m, name) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
function absender(von) {
  const m = von.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  const email = (m ? m[2] : von).trim().toLowerCase();
  return { name: (m ? m[1] : '').trim() || email, email };
}
async function idsListen(q, max) {
  const ids = [];
  let token = '';
  while (ids.length < max) {
    const r = await g('GET', `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(Math.min(500, max - ids.length)), ...(token ? { pageToken: token } : {}) })}`);
    for (const m of r.messages || []) ids.push(m.id);
    if (!r.nextPageToken) break;
    token = r.nextPageToken;
  }
  return ids;
}
const metaUrl = (id) => `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`;

async function wichtigeMails() {
  const ids = await idsListen('in:inbox is:unread -category:promotions -category:social -category:forums', 8);
  const mails = await parallel(ids, 8, (id) => g('GET', metaUrl(id)));
  return mails.filter((m) => m && !m.fehler).map((m) => {
    const a = absender(kopf(m, 'From'));
    return { id: m.id, thread: m.threadId, von: a.name, email: a.email, betreff: kopf(m, 'Subject') || '(ohne Betreff)', zeit: Number(m.internalDate), vorschau: m.snippet || '' };
  });
}

export async function mailAktion(id, aktion) {
  if (!/^[a-zA-Z0-9]+$/.test(id)) throw Object.assign(new Error('Ungültige Mail'), { status: 400 });
  if (aktion === 'gelesen') await g('POST', `${GMAIL}/messages/${id}/modify`, { removeLabelIds: ['UNREAD'] });
  else if (aktion === 'archivieren') await g('POST', `${GMAIL}/messages/${id}/modify`, { removeLabelIds: ['INBOX', 'UNREAD'] });
  else if (aktion === 'loeschen') await g('POST', `${GMAIL}/messages/${id}/trash`);
  else throw Object.assign(new Error('Unbekannte Aktion'), { status: 400 });
  cache.delete('wichtig');
  return { ok: true };
}

// Aufräumen: Posteingang durchgehen und nach Absender gruppieren (läuft im Hintergrund, max. 3000 Mails).
const scan = { laeuft: false, fortschritt: 0, gesamt: 0, zeit: null, fehler: null, absender: [] };
export function scanStarten() {
  if (scan.laeuft) return scanZustand();
  scan.laeuft = true; scan.fehler = null; scan.fortschritt = 0; scan.gesamt = 0;
  (async () => {
    try {
      const ids = await idsListen('in:inbox', 3000);
      scan.gesamt = ids.length;
      const gruppen = new Map();
      await parallel(ids, 8, async (id) => {
        const m = await g('GET', metaUrl(id));
        scan.fortschritt++;
        const a = absender(kopf(m, 'From'));
        const lu = kopf(m, 'List-Unsubscribe');
        const x = gruppen.get(a.email) || { email: a.email, name: a.name, n: 0, ungelesen: 0, werbung: 0, letzte: 0, betreff: '', http: null, mailto: null, einKlick: false };
        x.n++;
        if ((m.labelIds || []).includes('UNREAD')) x.ungelesen++;
        if ((m.labelIds || []).includes('CATEGORY_PROMOTIONS') || lu) x.werbung++;
        const t = Number(m.internalDate);
        if (t > x.letzte) { x.letzte = t; x.betreff = kopf(m, 'Subject'); x.name = a.name; }
        if (lu) {
          const http = lu.match(/<(https:[^>]+)>/); const mailto = lu.match(/<(mailto:[^>]+)>/);
          if (http) x.http = http[1];
          if (mailto) x.mailto = mailto[1];
          if (/One-Click/i.test(kopf(m, 'List-Unsubscribe-Post'))) x.einKlick = true;
        }
        gruppen.set(a.email, x);
      });
      scan.absender = [...gruppen.values()].sort((a, b) => b.n - a.n).slice(0, 150);
      scan.zeit = Date.now();
    } catch (e) {
      scan.fehler = e.message;
    } finally {
      scan.laeuft = false;
    }
  })();
  return scanZustand();
}
export function scanZustand() {
  const behalten = new Set(hz().behalten);
  const regeln = hz().regeln;
  return {
    laeuft: scan.laeuft, fortschritt: scan.fortschritt, gesamt: scan.gesamt, zeit: scan.zeit, fehler: scan.fehler,
    absender: scan.absender.map((a) => ({ email: a.email, name: a.name, n: a.n, ungelesen: a.ungelesen, werbung: a.werbung, letzte: a.letzte, betreff: a.betreff, abmelden: a.einKlick ? 'einklick' : a.mailto ? 'mail' : a.http ? 'link' : null, link: a.http && !a.einKlick ? a.http : null, behalten: behalten.has(a.email), regel: regeln[a.email]?.aktion || null })),
  };
}

const gueltigeEmail = (e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e);
const domainVon = (e) => e.split('@')[1] || '';

async function alleVerschieben(q, aktion, max = 2000) {
  const ids = await idsListen(q, max);
  if (aktion === 'archivieren') {
    for (let i = 0; i < ids.length; i += 1000) await g('POST', `${GMAIL}/messages/batchModify`, { ids: ids.slice(i, i + 1000), removeLabelIds: ['INBOX', 'UNREAD'] });
  } else {
    await parallel(ids, 8, (id) => g('POST', `${GMAIL}/messages/${id}/trash`));
  }
  return ids.length;
}

// Abmelde-Links kommen aus fremden Mails: nur öffentliche Adressen aufrufen (nichts im Heim- oder Tailscale-Netz).
function oeffentlicheUrl(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    if (x.protocol !== 'https:') return false;
    if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;
    if (/(^|\.)(localhost|local|lan|home|internal|intranet|ts\.net)$/.test(h)) return false;
    return true;
  } catch { return false; }
}

// Zusätzlich die Adresse auflösen: Ein Name, der auf eine private IP zeigt, wird nicht aufgerufen.
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') || x.startsWith('ff');
}
async function oeffentlichAufgeloest(u) {
  if (!oeffentlicheUrl(u)) return false;
  try {
    const adressen = await dns.lookup(new URL(u).hostname, { all: true });
    return adressen.length > 0 && adressen.every((a) => !privateIp(a.address));
  } catch { return false; }
}

async function abmelden(a) {
  if (a.http && !(await oeffentlichAufgeloest(a.http))) throw new Error('Abmelde-Link zeigt auf keine öffentliche Adresse – aus Sicherheitsgründen nicht aufgerufen.');
  if (a.einKlick && a.http) {
    // RFC 8058: Ein-Klick-Abmeldung per POST, ohne Seite zu öffnen. Weiterleitungen werden nicht verfolgt.
    const { res } = await holen(a.http, { method: 'POST', timeout: 15_000, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    if (!res.ok && !(res.status >= 300 && res.status < 400)) throw new Error(`Abmelden fehlgeschlagen (HTTP ${res.status})`);
    return { art: 'einklick' };
  }
  if (a.mailto) {
    const u = new URL(a.mailto);
    const an = decodeURIComponent(u.pathname);
    if (!gueltigeEmail(an)) throw new Error('Abmelde-Adresse ungültig');
    const betreff = u.searchParams.get('subject') || 'unsubscribe';
    const roh = `To: ${an}\r\nSubject: ${betreff.replace(/[\r\n]/g, ' ')}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${(u.searchParams.get('body') || 'unsubscribe').replace(/\r?\n/g, '\r\n')}`;
    await g('POST', `${GMAIL}/messages/send`, { raw: Buffer.from(roh).toString('base64url') });
    return { art: 'mail', an };
  }
  if (a.http) return { art: 'link', link: a.http };
  throw new Error('Dieser Absender bietet keine Abmeldung an. Nutze «Immer weg».');
}

async function filterAnlegen(criteria, aktion) {
  const archiv = { removeLabelIds: ['INBOX', 'UNREAD'] };
  if (aktion === 'loeschen') {
    try { return (await g('POST', `${GMAIL}/settings/filters`, { criteria, action: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] } })).id; }
    catch (e) { console.warn('[google] Filter «löschen» abgelehnt, lege «archivieren» an:', e.message); }
  }
  return (await g('POST', `${GMAIL}/settings/filters`, { criteria, action: archiv })).id;
}
async function filterLoeschen(id) {
  if (!id) return;
  try { await g('DELETE', `${GMAIL}/settings/filters/${encodeURIComponent(id)}`); } catch (e) { if (!/not found|404/i.test(e.message)) throw e; }
}

export async function absenderAktion(email, aktion) {
  email = String(email || '').toLowerCase();
  if (!gueltigeEmail(email)) throw Object.assign(new Error('Ungültiger Absender'), { status: 400 });
  const h = hz();
  const a = scan.absender.find((x) => x.email === email) || { email };
  const q = `from:${email}`;
  let info = {};
  if (aktion === 'archivieren') info.anzahl = await alleVerschieben(`${q} in:inbox`, 'archivieren');
  else if (aktion === 'loeschen') info.anzahl = await alleVerschieben(`${q} -in:trash`, 'loeschen');
  else if (aktion === 'abmelden') { info = await abmelden(a); info.anzahl = await alleVerschieben(`${q} in:inbox`, 'archivieren'); }
  else if (aktion === 'immerWeg' || aktion === 'immerLoeschen') {
    const art = aktion === 'immerLoeschen' ? 'loeschen' : 'archivieren';
    await filterLoeschen(h.regeln[email]?.filterId);
    h.regeln[email] = { filterId: await filterAnlegen({ from: email }, art), aktion: art };
    h.behalten = h.behalten.filter((x) => x !== email);
    info.anzahl = await alleVerschieben(art === 'loeschen' ? `${q} -in:trash` : `${q} in:inbox`, art);
  } else if (aktion === 'regelWeg') {
    await filterLoeschen(h.regeln[email]?.filterId);
    delete h.regeln[email];
  } else if (aktion === 'behalten') {
    if (!h.behalten.includes(email)) h.behalten.push(email);
    await filterLoeschen(h.regeln[email]?.filterId);
    delete h.regeln[email];
    if (h.werbefilter.an) await werbefilterAnwenden();
  } else if (aktion === 'nichtBehalten') {
    h.behalten = h.behalten.filter((x) => x !== email);
    if (h.werbefilter.an) await werbefilterAnwenden();
  } else throw Object.assign(new Error('Unbekannte Aktion'), { status: 400 });
  save();
  if (['archivieren', 'loeschen', 'abmelden', 'immerWeg', 'immerLoeschen'].includes(aktion)) {
    const i = scan.absender.findIndex((x) => x.email === email);
    if (i >= 0 && aktion !== 'abmelden') scan.absender[i] = { ...scan.absender[i], n: 0, ungelesen: 0 };
    if (i >= 0 && aktion === 'abmelden') scan.absender[i] = { ...scan.absender[i], n: 0, ungelesen: 0, http: null, mailto: null, einKlick: false };
  }
  cache.delete('wichtig');
  return { ok: true, ...info, scan: scanZustand() };
}

// Werbefilter: ein einziger Gmail-Filter, den die Zentrale verwaltet.
function werbeQuery(w, behalten) {
  const domains = [...new Set([...w.absenderAusnahmen, ...behalten])].filter(Boolean);
  const teile = ['category:promotions'];
  if (domains.length) teile.push(`-from:(${domains.join(' OR ')})`);
  if (w.woerterAusnahmen.length) teile.push(`-subject:(${w.woerterAusnahmen.map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' OR ')})`);
  return teile.join(' ');
}
async function werbefilterAnwenden() {
  const h = hz();
  const w = h.werbefilter;
  await filterLoeschen(w.filterId);
  w.filterId = null;
  if (w.an) w.filterId = await filterAnlegen({ query: werbeQuery(w, h.behalten) }, w.aktion);
  save();
}
export async function werbefilterSetzen(b) {
  const h = hz();
  const w = h.werbefilter;
  const liste = (x, f) => (Array.isArray(x) ? [...new Set(x.map((s) => String(s).trim()).filter(Boolean).map((s) => s.slice(0, 60)))].slice(0, 40) : f);
  h.werbefilter = {
    ...w,
    an: b.an !== undefined ? !!b.an : w.an,
    aktion: b.aktion === 'loeschen' ? 'loeschen' : b.aktion === 'archivieren' ? 'archivieren' : w.aktion,
    absenderAusnahmen: liste(b.absenderAusnahmen, w.absenderAusnahmen).map((s) => s.toLowerCase().replace(/^@/, '')),
    woerterAusnahmen: liste(b.woerterAusnahmen, w.woerterAusnahmen),
  };
  save();
  await werbefilterAnwenden();
  let anzahl = 0;
  if (h.werbefilter.an && b.bestehende) anzahl = await alleVerschieben(`${werbeQuery(h.werbefilter, h.behalten)} in:inbox`, h.werbefilter.aktion);
  cache.delete('wichtig');
  return { werbefilter: oeffentlicherFilter(), anzahl };
}
const oeffentlicherFilter = () => { const { filterId, ...rest } = hz().werbefilter; return { ...rest, aktiv: !!filterId, query: werbeQuery(hz().werbefilter, hz().behalten) }; };

// ---------- Kalender ----------
async function termine() {
  const liste = await g('GET', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader');
  const kalender = (liste.items || []).filter((k) => k.selected !== false && !k.hidden);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const ende = new Date(start.getTime() + 8 * 86400_000);
  const alle = await parallel(kalender, 4, async (k) => {
    const r = await g('GET', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(k.id)}/events?${new URLSearchParams({ timeMin: start.toISOString(), timeMax: ende.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })}`);
    return (r.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
      id: e.id, titel: e.summary || '(ohne Titel)', ort: e.location || null, link: e.htmlLink || null,
      ganztaegig: !!e.start?.date, start: e.start?.dateTime || e.start?.date, ende: e.end?.dateTime || e.end?.date,
      kalender: k.summaryOverride || k.summary, farbe: k.backgroundColor || '#2457f5',
    }));
  });
  return alle.flat().filter((x) => x && !x.fehler).sort((a, b) => (a.start < b.start ? -1 : 1));
}
export async function terminNeu(b) {
  const titel = String(b.titel || '').trim().slice(0, 200);
  if (!titel) throw Object.assign(new Error('Titel fehlt'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.datum || ''))) throw Object.assign(new Error('Datum fehlt'), { status: 400 });
  let ev;
  if (b.ganztaegig) {
    const bis = new Date(b.datum + 'T12:00:00Z'); bis.setUTCDate(bis.getUTCDate() + 1);
    ev = { summary: titel, start: { date: b.datum }, end: { date: bis.toISOString().slice(0, 10) } };
  } else {
    const zeit = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
    if (!zeit(b.von)) throw Object.assign(new Error('Startzeit fehlt'), { status: 400 });
    const bis = zeit(b.bis) ? b.bis : `${String(Math.min(23, Number(b.von.slice(0, 2)) + 1)).padStart(2, '0')}:${b.von.slice(3)}`;
    ev = { summary: titel, start: { dateTime: `${b.datum}T${b.von}:00`, timeZone: TZ }, end: { dateTime: `${b.datum}T${bis}:00`, timeZone: TZ } };
  }
  if (b.ort) ev.location = String(b.ort).slice(0, 200);
  await g('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', ev);
  cache.delete('termine');
  return { ok: true };
}

// ---------- Aufgaben ----------
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
async function aufgaben() {
  const r = await g('GET', `${TASKS}/lists/@default/tasks?showCompleted=false&showHidden=false&maxResults=100`);
  return (r.items || []).filter((t) => t.title).map((t) => ({ id: t.id, titel: t.title, notiz: t.notes || null, faellig: t.due ? t.due.slice(0, 10) : null }))
    .sort((a, b) => (a.faellig || '9999') < (b.faellig || '9999') ? -1 : (a.faellig || '9999') > (b.faellig || '9999') ? 1 : 0);
}
export async function aufgabeNeu(b) {
  const titel = String(b.titel || '').trim().slice(0, 300);
  if (!titel) throw Object.assign(new Error('Titel fehlt'), { status: 400 });
  const t = { title: titel };
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.faellig || ''))) t.due = `${b.faellig}T00:00:00.000Z`;
  await g('POST', `${TASKS}/lists/@default/tasks`, t);
  cache.delete('aufgaben');
  return { ok: true };
}
export async function aufgabeErledigt(id) {
  if (!/^[\w-]+$/.test(String(id || ''))) throw Object.assign(new Error('Ungültige Aufgabe'), { status: 400 });
  await g('PATCH', `${TASKS}/lists/@default/tasks/${id}`, { status: 'completed' });
  cache.delete('aufgaben');
  return { ok: true };
}

// ---------- Zustand für die Seite ----------
export async function heuteZustand(frisch = false) {
  if (frisch) cache.clear();
  const basis = { eingerichtet: googleEingerichtet(), verbunden: googleVerbunden(), email: tokLaden()?.email || null, rueckUrl: rueckUrl() };
  if (!basis.verbunden) return basis;
  const teil = async (key, ms, fn) => { try { return { daten: await gecacht(key, ms, fn) }; } catch (e) { return { fehler: e.message, status: e.status }; } };
  const [w, t, a] = await Promise.all([teil('wichtig', 60_000, wichtigeMails), teil('termine', 120_000, termine), teil('aufgaben', 60_000, aufgaben)]);
  const abgelaufen = [w, t, a].some((x) => x.status === 409);
  return {
    ...basis,
    abgelaufen,
    wichtig: w.daten || null, wichtigFehler: w.fehler || null,
    termine: t.daten || null, termineFehler: t.fehler || null,
    aufgaben: a.daten || null, aufgabenFehler: a.fehler || null,
    werbefilter: oeffentlicherFilter(),
    behalten: hz().behalten,
    scan: scanZustand(),
  };
}
