// Login mit Passwort, Sitzung per Cookie (30 Tage), Schutz gegen Durchprobieren.
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { zweifaktorAktiv, codePruefen } from './zweifaktor.mjs';

const COOKIE = 'zentrale_sitzung';
const DAUER = 7 * 24 * 3600 * 1000; // 7 Tage, danach neu anmelden
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

// Echte Client-IP: Nur wenn die Anfrage vom lokalen Proxy (tailscale serve) kommt, zählt X-Forwarded-For –
// und dann der LETZTE Eintrag (den hängt der Proxy selbst an). Frühere Einträge kann der Client fälschen.
export function clientIp(req) {
  const direkt = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const lokal = direkt === '127.0.0.1' || direkt === '::1';
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return lokal && xff.length ? xff[xff.length - 1] : direkt;
}

// Zusätzlich eine Grenze über alle IPs: höchstens 20 Fehlversuche in 10 Minuten.
const alleFehler = [];

export function login(req, passwort, code) {
  const ip = clientIp(req);
  const jetzt = Date.now();
  const liste = (versuche.get(ip) || []).filter((t) => jetzt - t < 60_000);
  while (alleFehler.length && jetzt - alleFehler[0] > 600_000) alleFehler.shift();
  if (liste.length >= 5) return { ok: false, fehler: 'Zu viele Versuche. Bitte 1 Minute warten.' };
  if (alleFehler.length >= 20) return { ok: false, fehler: 'Zu viele Fehlversuche. Login für einige Minuten gesperrt.' };
  liste.push(jetzt);
  versuche.set(ip, liste);

  if (!config.passwort) return { ok: false, fehler: 'Kein Passwort gesetzt (ZENTRALE_PASSWORT in .env).' };
  const a = Buffer.from(String(passwort || ''));
  const b = Buffer.from(config.passwort);
  const gleich = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!gleich) {
    alleFehler.push(jetzt);
    if (alleFehler.length === 20) console.warn('[login] 20 Fehlversuche in 10 Min – Login vorübergehend gesperrt');
    return { ok: false, fehler: 'Falsches Passwort.' };
  }
  // Zweiter Faktor: Code aus der Authenticator-App oder ein Notfall-Code.
  if (zweifaktorAktiv()) {
    if (!String(code || '').trim()) return { ok: false, codeNoetig: true, fehler: 'Code aus der Authenticator-App eingeben.' };
    if (!codePruefen(code)) {
      alleFehler.push(jetzt);
      return { ok: false, codeNoetig: true, fehler: 'Code stimmt nicht (oder wurde schon benutzt).' };
    }
  }

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

// Sitzungen: Anzahl und «alle anderen abmelden» (z. B. nach dem Einschalten von 2FA).
const aktuellerHash = (req) => { const t = parseCookies(req.headers.cookie)[COOKIE]; return t ? hash(t) : null; };
export function sitzungenZustand(req) {
  const jetzt = Date.now();
  const alle = Object.entries(db().sitzungen).filter(([, v]) => v.bis > jetzt);
  const eigene = aktuellerHash(req);
  return { anzahl: alle.length, andere: alle.filter(([k]) => k !== eigene).length };
}
export function andereAbmelden(req) {
  const eigene = aktuellerHash(req);
  const s = db().sitzungen;
  for (const k of Object.keys(s)) if (k !== eigene) delete s[k];
  save();
  return sitzungenZustand(req);
}
