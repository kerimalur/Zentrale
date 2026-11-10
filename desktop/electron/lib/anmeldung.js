// Anmeldung am Sperrbildschirm.
//
// Normalfall: Passwort (+ 2FA-Code) gehen an die Zentrale auf dem Pi. Klappt das,
// merkt sich die App lokal einen scrypt-Hash des Passworts.
// Pi offline: Anmeldung gegen diesen lokalen Hash, ohne 2FA (abschaltbar in den Einstellungen).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const pi = require('./pi');
const einstellungen = require('./einstellungen');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const datei = () => path.join(app.getPath('userData'), 'anmeldung.json');

function lesen() {
  try { return JSON.parse(fs.readFileSync(datei(), 'utf8')); } catch { return {}; }
}
function schreiben(d) {
  fs.mkdirSync(path.dirname(datei()), { recursive: true });
  const tmp = datei() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
  fs.renameSync(tmp, datei());
}

const hashen = (passwort, salz) => new Promise((ok, schief) => {
  crypto.scrypt(String(passwort), salz, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (e, k) => (e ? schief(e) : ok(k.toString('hex'))));
});

async function merken(passwort) {
  const salz = crypto.randomBytes(16).toString('hex');
  schreiben({ salz, hash: await hashen(passwort, salz), seit: Date.now() });
}

const gemerkt = () => !!lesen().hash;

async function lokalPruefen(passwort) {
  const d = lesen();
  if (!d.hash || !d.salz) return false;
  const h = await hashen(passwort, d.salz);
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(d.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function vergessen() {
  try { fs.unlinkSync(datei()); } catch {}
}

// Haupteinstieg vom Sperrbildschirm.
// Gibt { ok } oder { ok:false, fehler, codeNoetig, offline } zurück.
async function anmelden(passwort, code) {
  if (!String(passwort || '')) return { ok: false, fehler: 'Passwort eingeben.' };

  const r = await pi.anmelden(passwort, code);
  if (r.ok) {
    await merken(passwort).catch(() => {});
    return { ok: true, offline: false };
  }

  // Der Pi hat geantwortet (falsches Passwort / Code fehlt) – dann gilt seine Antwort.
  if (r.online) return { ok: false, fehler: r.fehler, codeNoetig: r.codeNoetig, offline: false };

  // Der Pi ist nicht erreichbar.
  const e = einstellungen.alle().anmeldung;
  if (!e.offlineErlauben) return { ok: false, fehler: 'Pi nicht erreichbar – Anmeldung ohne Pi ist ausgeschaltet.', offline: true };
  if (!gemerkt()) return { ok: false, fehler: 'Pi nicht erreichbar und noch keine Anmeldung gespeichert.', offline: true };
  if (await lokalPruefen(passwort)) return { ok: true, offline: true };
  return { ok: false, fehler: 'Falsches Passwort.', offline: true };
}

module.exports = { anmelden, gemerkt, vergessen, merken, lokalPruefen };
