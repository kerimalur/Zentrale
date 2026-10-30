// Xiaomi TV Box (Android/Google TV) über ADB steuern: ein-/ausschalten, Fernbedienung, Status.
// Anders als die Fernseher-Steuerung (JointSpace, server/tv.mjs) läuft hier kein offenes HTTP, sondern ADB
// über WLAN (Einstellungen → Entwickleroptionen → Netzwerk-Debugging auf der Box). Beim allerersten Mal
// erscheint auf dem Fernseher eine Frage, ob dieser Computer zugelassen wird – das bestätigst du einmal
// mit der Fernbedienung, danach merkt sich die Box den Schlüssel.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.mjs';

const IP = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const tvboxEingerichtet = () => IP.test(config.tvbox.ip);

function fehler(text, status = 409) {
  const e = new Error(text);
  e.status = status;
  return e;
}

// Eigener Ordner für den ADB-Schlüssel, damit die Kopplung einen Neubau des Containers übersteht.
function adbHeim() {
  const p = path.join(config.dataDir, 'adb');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function adb(args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile('adb', args, { timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, HOME: adbHeim() } }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || err?.message || '') });
    });
  });
}

const ziel = () => `${config.tvbox.ip}:5555`;

let letzteVerbindung = 0;
async function verbinden() {
  if (!tvboxEingerichtet()) throw fehler('TVBOX_IP fehlt in der .env', 400);
  // Alle paar Sekunden neu verbinden reicht – ADB merkt sich eine bestehende Verbindung selbst.
  if (Date.now() - letzteVerbindung < 4000) return;
  const r = await adb(['connect', ziel()], 6000);
  if (!/connected to|already connected/i.test(r.stdout)) {
    throw fehler('Xiaomi-Box nicht erreichbar. Läuft sie, und ist «Netzwerk-Debugging» in den Entwickleroptionen an?');
  }
  letzteVerbindung = Date.now();
}

async function shell(args, timeout) {
  await verbinden();
  const r = await adb(['-s', ziel(), 'shell', ...args], timeout);
  if (!r.ok || /unauthorized|device offline|device still authorizing/i.test(r.stdout + r.stderr)) {
    letzteVerbindung = 0; // beim nächsten Versuch neu verbinden
    if (/unauthorized|device still authorizing/i.test(r.stdout + r.stderr)) {
      throw fehler('Auf dem Fernseher die Frage zum Netzwerk-Debugging noch nicht bestätigt – bitte mit der Fernbedienung zulassen.');
    }
    throw fehler('Xiaomi-Box antwortet nicht.');
  }
  return r.stdout;
}

let z = { an: null, fehler: null, geprueft: 0 };

// Alle paar Sekunden aus index.mjs: an/aus, für die Übersicht ohne Wartezeit.
export async function tvboxAbfragen() {
  if (!tvboxEingerichtet()) return;
  try {
    const roh = await shell(['dumpsys', 'power'], 5000);
    const wach = /mWakefulness=Awake/.test(roh) || /Display Power:\s*state=ON/.test(roh);
    z = { an: wach, fehler: null, geprueft: Date.now() };
  } catch (e) {
    z = { an: null, fehler: e.message, geprueft: Date.now() };
  }
}

export function tvboxSnapshot() {
  if (!tvboxEingerichtet()) return { eingerichtet: false, name: config.tvbox.name, an: null, fehler: null };
  return { eingerichtet: true, name: config.tvbox.name, an: z.geprueft ? z.an : null, fehler: z.fehler };
}

export async function tvboxEinschalten() {
  await shell(['input', 'keyevent', 'KEYCODE_WAKEUP']);
  return { ok: true };
}

export async function tvboxAusschalten() {
  await shell(['input', 'keyevent', 'KEYCODE_SLEEP']);
  return { ok: true };
}

const TASTEN = {
  hoch: 'KEYCODE_DPAD_UP', runter: 'KEYCODE_DPAD_DOWN', links: 'KEYCODE_DPAD_LEFT', rechts: 'KEYCODE_DPAD_RIGHT',
  ok: 'KEYCODE_DPAD_CENTER', zurueck: 'KEYCODE_BACK', home: 'KEYCODE_HOME', menu: 'KEYCODE_MENU',
  lauter: 'KEYCODE_VOLUME_UP', leiser: 'KEYCODE_VOLUME_DOWN', stumm: 'KEYCODE_VOLUME_MUTE', spielen: 'KEYCODE_MEDIA_PLAY_PAUSE',
};

export async function tvboxTaste(taste) {
  const code = TASTEN[String(taste || '')];
  if (!code) throw fehler('Unbekannte Taste', 400);
  await shell(['input', 'keyevent', code]);
  return { ok: true };
}

// Startet eine App, so wie ein Druck auf ihr Symbol im Launcher (funktioniert auch ohne das Paket genau zu kennen).
export async function tvboxAppStarten(paket) {
  const p = String(paket || '');
  if (!/^[a-zA-Z0-9._]+$/.test(p)) throw fehler('Ungültiges App-Paket', 400);
  await shell(['monkey', '-p', p, '-c', 'android.intent.category.LEANBACK_LAUNCHER', '1'], 6000);
  return { ok: true };
}
