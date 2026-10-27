// Zwei-Faktor-Anmeldung für die Zentrale: 6-stelliger Code aus einer Authenticator-App (TOTP, RFC 6238)
// plus 8 Notfall-Codes zum einmaligen Gebrauch. Das Geheimnis liegt nur in data/zentrale.json auf dem Pi.
import crypto from 'node:crypto';
import { db, save } from './store.mjs';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SCHRITT = 30; // Sekunden pro Code

function zf() {
  const d = db();
  d.zweifaktor ||= { aktiv: false, secret: null, notfall: [], seit: null, letzterSchritt: 0, neu: null };
  return d.zweifaktor;
}

function base32(buf) {
  let bits = 0, wert = 0, out = '';
  for (const b of buf) {
    wert = (wert << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(wert >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(wert << (5 - bits)) & 31];
  return out;
}
function base32Bytes(s) {
  let bits = 0, wert = 0;
  const out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    wert = (wert << 5) | i; bits += 5;
    if (bits >= 8) { out.push((wert >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totp(secret, schritt) {
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(schritt));
  const h = crypto.createHmac('sha1', base32Bytes(secret)).update(zaehler).digest();
  const o = h[h.length - 1] & 15;
  const zahl = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(zahl % 1_000_000).padStart(6, '0');
}

// Prüft einen Code (±1 Zeitschritt für ungenaue Uhren). Gibt den Schritt zurück oder -1.
function codeSchritt(secret, code, jetzt = Date.now()) {
  if (!/^\d{6}$/.test(code)) return -1;
  const s = Math.floor(jetzt / 1000 / SCHRITT);
  for (const d of [0, -1, 1]) {
    const a = Buffer.from(totp(secret, s + d)), b = Buffer.from(code);
    if (crypto.timingSafeEqual(a, b)) return s + d;
  }
  return -1;
}

const hash = (x) => crypto.createHash('sha256').update(x).digest('hex');
const sauber = (c) => String(c || '').replace(/[\s-]/g, '').toUpperCase();

export const zweifaktorAktiv = () => !!zf().aktiv;

// Für den Login: true, wenn Code oder Notfall-Code stimmt. Jeder Code gilt nur einmal.
export function codePruefen(code) {
  const z = zf();
  if (!z.aktiv) return true;
  const c = sauber(code);
  if (/^\d{6}$/.test(c)) {
    const s = codeSchritt(z.secret, c);
    if (s < 0 || s <= z.letzterSchritt) return false; // gleicher Code nicht zweimal
    z.letzterSchritt = s;
    save();
    return true;
  }
  const h = hash(c);
  const i = z.notfall.indexOf(h);
  if (c.length === 10 && i >= 0) {
    z.notfall.splice(i, 1);
    save();
    return true;
  }
  return false;
}

function notfallErzeugen() {
  const codes = Array.from({ length: 8 }, () => {
    let s = '';
    const b = crypto.randomBytes(10);
    for (const x of b) s += B32[x & 31];
    return s;
  });
  zf().notfall = codes.map(hash);
  return codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`);
}

export function zweifaktorZustand() {
  const z = zf();
  return { aktiv: z.aktiv, seit: z.seit, notfallUebrig: z.notfall.length };
}

// Schritt 1: neues Geheimnis erzeugen (noch nicht aktiv, gilt 10 Minuten).
export function einrichtungStarten(name = 'kerim') {
  const z = zf();
  const secret = base32(crypto.randomBytes(20));
  z.neu = { secret, bis: Date.now() + 10 * 60_000 };
  save();
  const label = encodeURIComponent(`Zentrale:${name}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Zentrale&algorithm=SHA1&digits=6&period=${SCHRITT}` };
}

// Schritt 2: mit dem ersten Code aus der App bestätigen → aktiv, Notfall-Codes werden einmal angezeigt.
export function einrichtungBestaetigen(code) {
  const z = zf();
  if (!z.neu || z.neu.bis < Date.now()) throw Object.assign(new Error('Einrichtung abgelaufen, bitte neu starten'), { status: 400 });
  const s = codeSchritt(z.neu.secret, sauber(code));
  if (s < 0) throw Object.assign(new Error('Code stimmt nicht. Uhrzeit am Handy prüfen und den aktuellen Code eingeben.'), { status: 400 });
  z.secret = z.neu.secret;
  z.neu = null;
  z.aktiv = true;
  z.seit = Date.now();
  z.letzterSchritt = s;
  const codes = notfallErzeugen();
  save();
  return { ok: true, notfall: codes };
}

export function ausschalten(code) {
  if (!zf().aktiv) return { ok: true };
  if (!codePruefen(code)) throw Object.assign(new Error('Code stimmt nicht'), { status: 400 });
  Object.assign(zf(), { aktiv: false, secret: null, notfall: [], seit: null, letzterSchritt: 0, neu: null });
  save();
  return { ok: true };
}

export function notfallNeu(code) {
  if (!zf().aktiv) throw Object.assign(new Error('Zwei-Faktor ist nicht aktiv'), { status: 400 });
  if (!codePruefen(code)) throw Object.assign(new Error('Code stimmt nicht'), { status: 400 });
  const codes = notfallErzeugen();
  save();
  return { ok: true, notfall: codes };
}

export const _intern = { base32, base32Bytes, codeSchritt };
