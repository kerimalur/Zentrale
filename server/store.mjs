// Dauerhafter Speicher als JSON-Datei in /data/zentrale.json.
// Enthält Einstellungen, Szene, Ereignisse, Verlauf, Gäste und Sitzungen.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const datei = () => path.join(config.dataDir, 'zentrale.json');

const standard = () => ({
  version: 1,
  einstellungen: {
    nachtAuto: true,
    nachtVon: '23:00',
    nachtBis: '07:00',
    telegram: true,
    checkAn: true, // Tages-Check aufs Handy (ntfy/Telegram)
    checkZeiten: ['08:00', '13:00', '19:00'],
    hddSchlaf: true,
    luefterAusUnter: 50,
    moebelWarnAb: 40, // Warnung, wenn es im Möbel wärmer wird (°C)
    luefterModus: 'auto', // Möbel-Lüfter: auto | an | aus
    luefterAnAb: 30, // Auto: Möbel-Lüfter an ab dieser Möbel-Temperatur (°C)
    backupAuto: false, // automatisches nächtliches Backup (in der Zentrale ein-/ausschaltbar)
  },
  szene: { id: 'normal', seit: Date.now(), auto: false },
  standardGovernor: null,
  ereignisse: [],
  verlauf: [], // 5-Minuten-Werte der letzten 24 Std
  verfuegbarkeit: {}, // { tag: { dienstId: [ok, gesamt] } }
  antwortzeiten: {}, // { dienstId: [ms, ...] } letzte 12 Messungen
  tsZaehler: {}, // Tagesbasis für Tailscale-Verkehr pro Gerät
  netzBasis: null,
  gaeste: [],
  backup: { letzte: null, laeuft: false },
  sitzungen: {},
});

let daten = null;
let dirty = false;

export function load() {
  try {
    const roh = JSON.parse(fs.readFileSync(datei(), 'utf8'));
    const s = standard();
    daten = { ...s, ...roh, einstellungen: { ...s.einstellungen, ...(roh.einstellungen || {}) } };
  } catch {
    daten = standard();
  }
  return daten;
}

export function db() {
  if (!daten) load();
  return daten;
}

export function save() { dirty = true; }

export function flush() {
  if (!dirty || !daten) return;
  dirty = false;
  const tmp = datei() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(daten));
  fs.renameSync(tmp, datei());
}

setInterval(() => { try { flush(); } catch (e) { console.error('[store]', e.message); } }, 10_000).unref();
process.on('SIGTERM', () => { try { flush(); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { flush(); } catch {} process.exit(0); });
