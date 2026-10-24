// Login mit Passwort, Sitzung per Cookie (30 Tage), Schutz gegen Durchprobieren.
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { db, save } from './store.mjs';

const COOKIE = 'zentrale_sitzung';
const DAUER = 30 * 24 * 3600 * 1000;
const versuche = new Map(); // ip -> [zeitstempel]

export function parseCookies(header = '') {
  const out = {};
  for (const teil of header.split(';')) {
    const i = teil.indexOf('=');
    if (i > 0) out[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim());
  }
  return out;
}

export function istAngemeldet(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const s = db().sitzungen[hash(token)];
  if (!s) return false;
  if (s.bis < Date.now()) { delete db().sitzungen[hash(token)]; save(); return false; }
  return true;
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

export function login(req, passwort) {
  const ip = clientIp(req);
  const jetzt = Date.now();
  const liste = (versuche.get(ip) || []).filter((t) => jetzt - t < 60_000);
  if (liste.length >= 5) return { ok: false, fehler: 'Zu viele Versuche. Bitte 1 Minute warten.' };
  liste.push(jetzt);
  versuche.set(ip, liste);

  if (!config.passwort) return { ok: false, fehler: 'Kein Passwort gesetzt (ZENTRALE_PASSWORT in .env).' };
  const a = Buffer.from(String(passwort || ''));
  const b = Buffer.from(config.passwort);
  const gleich = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!gleich) return { ok: false, fehler: 'Falsches Passwort.' };

  versuche.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  const sitzungen = db().sitzungen;
  for (const [k, v] of Object.entries(sitzungen)) if (v.bis < jetzt) delete sitzungen[k];
  sitzungen[hash(token)] = { bis: jetzt + DAUER, ip };
  save();
  return { ok: true, cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAUER / 1000}` };
}

export function logout(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) { delete db().sitzungen[hash(token)]; save(); }
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function hash(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
