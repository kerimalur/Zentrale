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
  // «Zuletzt benutzt» für die Geräteliste – höchstens jede Minute neu schreiben.
  if (!s.zuletzt || Date.now() - s.zuletzt > 60_000) { s.zuletzt = Date.now(); s.ip = clientIp(req) || s.ip; save(); }
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
  sitzungen[hash(token)] = { bis: jetzt + DAUER, ip, erstellt: jetzt, zuletzt: jetzt, art: 'login', agent: agent(req) };
  save();
  return { ok: true, cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAUER / 1000}` };
}

// Eine Sitzung von Hand anlegen – für gekoppelte Geräte (Desktop-App auf dem HP),
// die sich mit einem Geräte-Token statt mit Passwort und Code ausweisen.
// Pro Gerät gibt es nur EINE Sitzung: die vorige wird ersetzt. (Früher legte die App alle
// 30 Minuten eine neue an – daher die vielen «angemeldeten Geräte».)
export function sitzungErzeugen(ip = '', { geraetId = '', geraetName = '', req = null } = {}) {
  const jetzt = Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const sitzungen = db().sitzungen;
  for (const [k, v] of Object.entries(sitzungen)) if (v.bis < jetzt || (geraetId && v.geraetId === geraetId)) delete sitzungen[k];
  sitzungen[hash(token)] = { bis: jetzt + DAUER, ip, erstellt: jetzt, zuletzt: jetzt, art: 'geraet', geraetId, geraetName, agent: req ? agent(req) : '' };
  save();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAUER / 1000}`;
}

export function logout(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) { delete db().sitzungen[hash(token)]; save(); }
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function hash(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

// Kurzer Gerätetext aus dem User-Agent, z. B. «Chrome · Windows».
function agent(req) { return String(req?.headers?.['user-agent'] || '').slice(0, 300); }
export function agentText(ua = '') {
  const u = String(ua);
  if (!u) return '';
  if (/ZentraleOS/i.test(u)) return 'ZentraleOS';
  if (/Electron/i.test(u)) return 'Desktop-App';
  const system = /Android/i.test(u) ? 'Android' : /iPhone|iPad/i.test(u) ? 'iPhone/iPad' : /Windows/i.test(u) ? 'Windows' : /Mac OS X/i.test(u) ? 'Mac' : /CrOS/i.test(u) ? 'ChromeOS' : /Linux/i.test(u) ? 'Linux' : '';
  const browser = /EdgA?\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Firefox\//.test(u) ? 'Firefox' : /OPR\//.test(u) ? 'Opera' : /Brave/.test(u) ? 'Brave' : /; wv\)/.test(u) ? 'App (WebView)' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /curl|okhttp|python|node/i.test(u) ? 'Programm' : '';
  return [browser, system].filter(Boolean).join(' · ');
}

// Sitzungen: Liste, einzeln abmelden, «alle anderen abmelden» (z. B. nach dem Einschalten von 2FA).
const aktuellerHash = (req) => { const t = parseCookies(req.headers.cookie)[COOKIE]; return t ? hash(t) : null; };
export function sitzungenZustand(req, geraetName = () => '') {
  const jetzt = Date.now();
  const alle = Object.entries(db().sitzungen).filter(([, v]) => v.bis > jetzt);
  const eigene = aktuellerHash(req);
  const liste = alle.map(([k, v]) => ({
    id: k.slice(0, 16),
    eigene: k === eigene,
    art: v.art || 'alt',
    name: v.geraetName || geraetName(v.ip) || '',
    geraet: agentText(v.agent),
    ip: v.ip || '',
    erstellt: v.erstellt || (v.bis - DAUER),
    zuletzt: v.zuletzt || null,
    bis: v.bis,
  })).sort((a, b) => (b.eigene - a.eigene) || ((b.zuletzt || b.erstellt) - (a.zuletzt || a.erstellt)));
  return { anzahl: alle.length, andere: alle.filter(([k]) => k !== eigene).length, liste };
}
export function sitzungAbmelden(req, id, geraetName) {
  const s = db().sitzungen; const eigene = aktuellerHash(req);
  const k = Object.keys(s).find((x) => x.slice(0, 16) === String(id || ''));
  if (!k) { const e = new Error('Sitzung nicht gefunden'); e.status = 404; throw e; }
  if (k === eigene) { const e = new Error('Die eigene Sitzung beendest du mit «Abmelden».'); e.status = 400; throw e; }
  delete s[k]; save();
  return sitzungenZustand(req, geraetName);
}
export function andereAbmelden(req, geraetName) {
  const eigene = aktuellerHash(req);
  const s = db().sitzungen;
  for (const k of Object.keys(s)) if (k !== eigene) delete s[k];
  save();
  return sitzungenZustand(req, geraetName);
}
