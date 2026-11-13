// Gekoppelte Geräte: die Desktop-App auf dem HP meldet sich einmal mit Passwort und
// 2FA-Code an und bekommt danach ein langlebiges Token. Damit holt sie sich jederzeit
// eine frische Sitzung, ohne dass Passwort oder 2FA-Geheimnis auf dem HP liegen.
//
// Das Token steht nur gehasht in data/zentrale.json. Geht der HP verloren, löschst du
// das Gerät in der Zentrale und das Token ist sofort wertlos.
import crypto from 'node:crypto';
import { db, save } from './store.mjs';
import { sitzungErzeugen, clientIp } from './auth.mjs';

const GUELTIG_TAGE = 365;
const versuche = []; // Zeitstempel fehlgeschlagener Token-Anmeldungen

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function alle() {
  const d = db();
  d.geraete ||= {};
  const jetzt = Date.now();
  for (const [k, g] of Object.entries(d.geraete)) if (g.bis && g.bis < jetzt) delete d.geraete[k];
  return d.geraete;
}

function fehler(status, text) {
  const e = new Error(text);
  e.status = status;
  return e;
}

// Neues Token ausstellen. Nur aus einer bereits angemeldeten Sitzung heraus.
export function tokenAusstellen(req, { name, art = 'desktop' } = {}) {
  const sauber = String(name || '').trim().slice(0, 60) || 'Unbenanntes Gerät';
  const token = crypto.randomBytes(32).toString('base64url');
  alle()[hash(token)] = {
    name: sauber,
    art: String(art).slice(0, 20),
    erstellt: Date.now(),
    bis: Date.now() + GUELTIG_TAGE * 86400_000,
    zuletzt: null,
    ip: clientIp(req),
  };
  save();
  return { ok: true, token, name: sauber, bis: alle()[hash(token)].bis };
}

// Token gegen eine frische Sitzung tauschen. Ohne Anmeldung erreichbar,
// darum mit Bremse gegen Durchprobieren.
export function sitzungFuerToken(req, token) {
  const jetzt = Date.now();
  while (versuche.length && jetzt - versuche[0] > 600_000) versuche.shift();
  if (versuche.length >= 20) throw fehler(429, 'Zu viele Fehlversuche. Bitte später nochmal.');

  const k = hash(String(token || ''));
  const g = alle()[k];
  if (!g) {
    versuche.push(jetzt);
    throw fehler(401, 'Gerät nicht gekoppelt');
  }
  g.zuletzt = jetzt;
  g.ip = clientIp(req);
  save();
  return { cookie: sitzungErzeugen(g.ip, { geraetId: k.slice(0, 12), geraetName: g.name, req }), name: g.name };
}

export function geraeteListe() {
  return Object.entries(alle()).map(([k, g]) => ({
    id: k.slice(0, 12),
    name: g.name,
    art: g.art,
    erstellt: g.erstellt,
    zuletzt: g.zuletzt,
    bis: g.bis,
    ip: g.ip || null,
  }));
}

export function geraetEntkoppeln(id) {
  const g = alle();
  const schluessel = Object.keys(g).find((k) => k.slice(0, 12) === String(id));
  if (!schluessel) throw fehler(404, 'Gerät nicht gefunden');
  const name = g[schluessel].name;
  delete g[schluessel];
  // Auch die Sitzung des Geräts sofort beenden
  const s = db().sitzungen || {};
  for (const [k, v] of Object.entries(s)) if (v.geraetId === schluessel.slice(0, 12)) delete s[k];
  save();
  return { ok: true, name };
}

// Prüft ein Token, ohne eine Sitzung anzulegen – für die HP-Fernsteuerung.
export function geraetVonToken(token) {
  const g = alle()[hash(String(token || ''))];
  if (!g) return null;
  g.zuletzt = Date.now();
  save();
  return g;
}
