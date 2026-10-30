// Fernseher-Box (TV-Tab): Koppeln ohne Tipperei am Fernseher.
// Ablauf: Die Box zeigt einen 6-stelligen Code. Du gibst ihn in der Zentrale ein (Einstellungen → Fernseher koppeln).
// Danach bekommt die Box ein eigenes Cookie. Dieses Cookie gilt NUR für /api/tv/* – nicht für den Rest der Zentrale.
import crypto from 'node:crypto';
import { db, save } from './store.mjs';
import { parseCookies } from './auth.mjs';

const COOKIE = 'zentrale_tv';
const DAUER = 365 * 24 * 3600 * 1000; // 1 Jahr, bis du das Gerät entfernst
const CODE_GUELTIG = 10 * 60 * 1000;
const offen = new Map(); // id -> { code, bis, token, name }
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function aufraeumen() {
  const jetzt = Date.now();
  for (const [id, k] of offen) if (k.bis < jetzt) offen.delete(id);
}

export function kopplungStarten() {
  aufraeumen();
  if (offen.size >= 8) throw Object.assign(new Error('Zu viele offene Kopplungen – bitte später nochmal'), { status: 429 });
  const id = crypto.randomBytes(16).toString('hex');
  let code;
  do code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  while ([...offen.values()].some((k) => k.code === code));
  offen.set(id, { code, bis: Date.now() + CODE_GUELTIG, token: null, name: null });
  return { id, code, gueltigS: CODE_GUELTIG / 1000 };
}

// Die Box fragt nach. Sobald der Code bestätigt ist, bekommt genau diese Anfrage das Cookie.
export function kopplungStatus(id) {
  aufraeumen();
  const k = offen.get(String(id || ''));
  if (!k) return { abgelaufen: true };
  if (!k.token) return { gekoppelt: false };
  offen.delete(id);
  return { gekoppelt: true, cookie: `${COOKIE}=${k.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAUER / 1000}` };
}

// Aus der Zentrale (angemeldet, mit 2FA): Code bestätigen.
export function kopplungBestaetigen(code, name) {
  aufraeumen();
  const c = String(code || '').replace(/\D/g, '');
  const k = [...offen.values()].find((x) => x.code === c && !x.token);
  if (!c || !k) throw Object.assign(new Error('Code unbekannt oder abgelaufen'), { status: 404 });
  const token = crypto.randomBytes(32).toString('hex');
  k.token = token;
  const liste = (db().tvGeraete ||= {});
  const id = crypto.randomBytes(6).toString('hex');
  liste[hash(token)] = { id, name: String(name || 'Fernseher').trim().slice(0, 40) || 'Fernseher', seit: Date.now(), zuletzt: null };
  save();
  return { ok: true, id };
}

export function tvAngemeldet(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const g = (db().tvGeraete || {})[hash(token)];
  if (!g) return false;
  if (!g.zuletzt || Date.now() - g.zuletzt > 60_000) { g.zuletzt = Date.now(); save(); }
  return true;
}

export const tvGeraeteListe = () => Object.values(db().tvGeraete || {}).map((g) => ({ id: g.id, name: g.name, seit: g.seit, zuletzt: g.zuletzt }));

export function tvGeraetEntfernen(id) {
  const liste = db().tvGeraete || {};
  const k = Object.keys(liste).find((x) => liste[x].id === id);
  if (!k) return false;
  delete liste[k];
  save();
  return true;
}
