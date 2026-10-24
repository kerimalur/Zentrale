// Temperatur im Möbel über den DS18B20 (1-Wire an GPIO 4 / Pin 7, dtoverlay=w1-gpio).
// Der Kernel legt den Sensor unter /sys/bus/w1/devices/28-…/temperature an (Wert in tausendstel °C).
import fs from 'node:fs';
import path from 'node:path';
import { hostPath } from '../config.mjs';

const ORTE = ['/sys/bus/w1/devices', hostPath('/sys/bus/w1/devices')];

function sensorOrdner() {
  for (const basis of ORTE) {
    try {
      const id = fs.readdirSync(basis).filter((n) => n.startsWith('28-')).sort()[0];
      if (id) return { id, pfad: path.join(basis, id) };
    } catch {}
  }
  return null;
}

// Liefert { id, temp } oder null, wenn kein Sensor da ist.
// Wirft einen Fehler, wenn der Sensor da ist, aber keinen gültigen Wert liefert.
export async function moebelTemperatur() {
  const s = sensorOrdner();
  if (!s) return null;
  const roh = (await fs.promises.readFile(path.join(s.pfad, 'temperature'), 'utf8')).trim();
  const wert = Number(roh);
  // 85000 = Startwert des Sensors (noch keine echte Messung), 0/leer = Lesefehler.
  if (!roh || !Number.isFinite(wert) || wert === 85000 || wert < -55000 || wert > 125000) {
    throw new Error(`Möbel-Sensor lieferte ungültigen Wert (${roh || 'leer'})`);
  }
  return { id: s.id, temp: Math.round(wert / 100) / 10 };
}
