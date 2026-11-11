// Anmeldung am Sperrbildschirm.
//
// Zwei Wege:
//  1. PIN (vierstellig, frei wählbar) – nur lokal geprüft, entsperrt den Bildschirm.
//  2. Zentrale-Passwort + 2FA-Code – immer möglich, auch wenn der PIN vergessen ist.
//
// Nach der ersten Anmeldung mit Passwort holt die App beim Pi ein langlebiges
// Geräte-Token. Damit frischt sie die Sitzung selbst auf. Weder Passwort noch
// 2FA-Geheimnis liegen auf dem HP; das Token selbst liegt verschlüsselt
// (unter Windows per DPAPI, also an dein Windows-Konto gebunden).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { app, safeStorage } = require('electron');
const pi = require('./pi');
const einstellungen = require('./einstellungen');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const datei = () => path.join(app.getPath('userData'), 'anmeldung.json');

let fehlversuche = [];   // Zeitstempel falscher PIN-Eingaben

function lesen() {
  try { return JSON.parse(fs.readFileSync(datei(), 'utf8')); } catch { return {}; }
}
function schreiben(d) {
  fs.mkdirSync(path.dirname(datei()), { recursive: true });
  const tmp = datei() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, datei());
}
function aendern(teil) {
  const d = { ...lesen(), ...teil };
  schreiben(d);
  return d;
}

const hashen = (wert, salz) => new Promise((ok, schief) => {
  crypto.scrypt(String(wert), salz, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (e, k) => (e ? schief(e) : ok(k.toString('hex'))));
});

const gleich = (a, b) => {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- Geräte-Token ----------

function tokenSpeichern(token) {
  let wert = String(token);
  let verschluesselt = false;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      wert = safeStorage.encryptString(String(token)).toString('base64');
      verschluesselt = true;
    }
  } catch { /* unten im Klartext, aber nur mit Benutzerrechten lesbar */ }
  aendern({ geraetToken: wert, tokenVerschluesselt: verschluesselt, tokenSeit: Date.now() });
  return verschluesselt;
}

function tokenLesen() {
  const d = lesen();
  if (!d.geraetToken) return null;
  if (!d.tokenVerschluesselt) return d.geraetToken;
  try { return safeStorage.decryptString(Buffer.from(d.geraetToken, 'base64')); } catch { return null; }
}

function tokenLoeschen() {
  const d = lesen();
  delete d.geraetToken;
  delete d.tokenVerschluesselt;
  delete d.tokenSeit;
  schreiben(d);
}

const gekoppelt = () => !!lesen().geraetToken;

// Holt ein Token und merkt es sich. Setzt eine angemeldete Sitzung voraus.
async function koppeln() {
  const name = `${os.hostname()} (Zentrale Desktop)`;
  const r = await pi.tokenHolen(name);
  if (!r.ok) return { ok: false, fehler: r.fehler };
  const verschluesselt = tokenSpeichern(r.token);
  return { ok: true, verschluesselt, bis: r.bis };
}

// Sorgt dafür, dass die Sitzung zum Pi gültig ist. Wird vor jedem Entsperren
// und danach regelmässig aufgerufen.
async function sitzungSichern() {
  const z = await pi.angemeldet();
  if (!z.online) return { ok: false, offline: true, fehler: z.fehler };
  if (z.angemeldet) return { ok: true };
  const token = tokenLesen();
  if (!token) return { ok: false, fehler: 'Gerät nicht gekoppelt' };
  const r = await pi.sitzungMitToken(token);
  if (!r.ok && r.status === 401) tokenLoeschen();   // in der Zentrale entkoppelt
  return r.ok ? { ok: true, erneuert: true } : { ok: false, fehler: r.fehler };
}

// ---------- PIN ----------

const pinGesetzt = () => !!lesen().pin;

async function pinSetzen(pin) {
  const p = String(pin || '').trim();
  if (p.length < 4) return { ok: false, fehler: 'Mindestens 4 Zeichen.' };
  if (p.length > 12) return { ok: false, fehler: 'Höchstens 12 Zeichen.' };
  const salz = crypto.randomBytes(16).toString('hex');
  aendern({ pin: { salz, hash: await hashen(p, salz), laenge: p.length, seit: Date.now() } });
  return { ok: true };
}

function pinEntfernen() {
  const d = lesen();
  delete d.pin;
  schreiben(d);
  return { ok: true };
}

const pinLaenge = () => lesen().pin?.laenge || 4;

async function pinPruefen(pin) {
  const d = lesen().pin;
  if (!d) return false;
  return gleich(await hashen(String(pin || ''), d.salz), d.hash);
}

// ---------- Rückfall: Passwort lokal merken ----------
// Damit du auch ohne Pi und ohne PIN an den HP kommst.

async function passwortMerken(passwort) {
  const salz = crypto.randomBytes(16).toString('hex');
  aendern({ passwort: { salz, hash: await hashen(passwort, salz), seit: Date.now() } });
}

async function passwortPruefenLokal(passwort) {
  const d = lesen().passwort;
  if (!d) return false;
  return gleich(await hashen(String(passwort || ''), d.salz), d.hash);
}

// ---------- Haupteinstieg ----------

function bremse() {
  const jetzt = Date.now();
  fehlversuche = fehlversuche.filter((t) => jetzt - t < 300_000);
  if (fehlversuche.length >= 10) return 'Zu viele Fehlversuche. Bitte 5 Minuten warten.';
  return null;
}

// modus: 'pin' | 'passwort'
async function anmelden(eingabe, code, modus = 'pin') {
  const gesperrt = bremse();
  if (gesperrt) return { ok: false, fehler: gesperrt };
  if (!String(eingabe || '')) return { ok: false, fehler: modus === 'pin' ? 'PIN eingeben.' : 'Passwort eingeben.' };

  // ---- Weg 1: PIN ----
  if (modus === 'pin' && pinGesetzt()) {
    if (!await pinPruefen(eingabe)) {
      fehlversuche.push(Date.now());
      return { ok: false, fehler: 'PIN stimmt nicht.' };
    }
    fehlversuche = [];
    const s = await sitzungSichern();
    return { ok: true, weg: 'pin', offline: !!s.offline, pi: s.ok, piFehler: s.ok ? null : s.fehler };
  }

  // ---- Weg 2: Zentrale-Passwort (+ 2FA) ----
  const r = await pi.anmelden(eingabe, code);
  if (r.ok) {
    fehlversuche = [];
    await passwortMerken(eingabe).catch(() => {});
    const k = await koppeln();                      // Token holen, damit es beim nächsten Mal ohne geht
    return { ok: true, weg: 'passwort', offline: false, pi: true, gekoppelt: k.ok, kopplungFehler: k.ok ? null : k.fehler, pinNoetig: !pinGesetzt() };
  }

  // Der Pi hat geantwortet: seine Antwort gilt.
  if (r.online) {
    fehlversuche.push(Date.now());
    return { ok: false, fehler: r.fehler, codeNoetig: r.codeNoetig, offline: false };
  }

  // Pi nicht erreichbar: lokal gemerktes Passwort prüfen.
  const e = einstellungen.alle().anmeldung;
  if (!e.offlineErlauben) return { ok: false, fehler: 'Pi nicht erreichbar – Anmeldung ohne Pi ist ausgeschaltet.', offline: true };
  if (!lesen().passwort) return { ok: false, fehler: 'Pi nicht erreichbar und noch keine Anmeldung gespeichert.', offline: true };
  if (await passwortPruefenLokal(eingabe)) {
    fehlversuche = [];
    return { ok: true, weg: 'passwort', offline: true, pi: false, pinNoetig: !pinGesetzt() };
  }
  fehlversuche.push(Date.now());
  return { ok: false, fehler: 'Falsches Passwort.', offline: true };
}

// Zustand für den Sperrbildschirm: womit kann man sich gerade anmelden?
function zustand() {
  return {
    pin: pinGesetzt(),
    pinLaenge: pinLaenge(),
    gekoppelt: gekoppelt(),
    passwortGemerkt: !!lesen().passwort,
    tokenVerschluesselt: !!lesen().tokenVerschluesselt,
  };
}

function alleszuruecksetzen() {
  try { fs.unlinkSync(datei()); } catch {}
}

module.exports = {
  anmelden, zustand, sitzungSichern, koppeln, gekoppelt, tokenLesen,
  pinGesetzt, pinSetzen, pinPruefen, pinEntfernen, pinLaenge,
  tokenLoeschen, alleszuruecksetzen,
};
