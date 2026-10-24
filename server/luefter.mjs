// Lüftersteuerung über Hardware-PWM (GPIO 18 / Pin 12, dtoverlay=pwm).
// Regelt stufenlos nach Temperatur; in der Nacht-Szene gedrosselt.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { db } from './store.mjs';
import { existiert, lesen } from './util.mjs';

const PERIODE = 40_000; // 40 µs = 25 kHz, Standard für PC-/PWM-Lüfter
let kanal = null; // Pfad zu .../pwm0
let prozent = null;

function finden() {
  if (!config.luefter.pwmPfad) return null;
  if (config.luefter.pwmPfad !== 'auto') return config.luefter.pwmPfad;
  try {
    for (const chip of fs.readdirSync('/sys/class/pwm').sort()) {
      const basis = path.join('/sys/class/pwm', chip);
      if (Number(lesen(path.join(basis, 'npwm'), '0')) > 0) return path.join(basis, 'pwm0');
    }
  } catch {}
  return null;
}

function schreiben(datei, wert) {
  fs.writeFileSync(datei, String(wert));
}

export function luefterInit() {
  const p = finden();
  if (!p) return false;
  try {
    if (!existiert(p)) schreiben(path.join(path.dirname(p), 'export'), 0);
    // Kurz warten, bis der Kernel den Kanal angelegt hat.
    for (let i = 0; i < 20 && !existiert(path.join(p, 'period')); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    schreiben(path.join(p, 'period'), PERIODE);
    schreiben(path.join(p, 'duty_cycle'), 0);
    schreiben(path.join(p, 'enable'), 1);
    kanal = p;
    return true;
  } catch (e) {
    console.warn('[lüfter] PWM nicht nutzbar:', e.message);
    kanal = null;
    return false;
  }
}

// Kurve: unter Schwelle aus, dann 30 % → 100 % bis 70 °C.
export function luefterRegeln(temp, szeneId) {
  if (!kanal || temp === null) return;
  const unter = db().einstellungen.luefterAusUnter ?? 50;
  let p;
  if (temp < unter) p = 0;
  else if (temp >= 70) p = 100;
  else p = Math.round(30 + ((temp - unter) / Math.max(1, 70 - unter)) * 70);
  const max = config.szenen[szeneId]?.luefterMax;
  if (max !== undefined && temp < 65) p = Math.min(p, max);
  if (p === prozent) return;
  try {
    schreiben(path.join(kanal, 'duty_cycle'), Math.round((PERIODE * p) / 100));
    prozent = p;
  } catch (e) {
    console.warn('[lüfter]', e.message);
  }
}

export const luefterStatus = () => ({ vorhanden: !!kanal, prozent });
