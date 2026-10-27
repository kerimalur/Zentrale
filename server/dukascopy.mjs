// Stundenkerzen von Dukascopy (Schweizer Bank, gratis, ab 2003) für alle 28 Paare.
// Grundlage für die GVA-Statistik und das spätere Trading-Labor: so ist jeder Treffer seit 2003 stundengenau
// (Yahoo liefert Stundenkerzen nur für die letzten ~2 Jahre).
// Quelle: https://datafeed.dukascopy.com/datafeed/<PAAR>/<JAHR>/<MONAT 00-11>/BID_candles_hour_1.bi5
//   LZMA-gepackt, je Kerze 24 Byte (Big Endian): Sekunden ab Monatsbeginn, Open, Close, Low, High (Ganzzahl in Punkten), Volumen (Float).
// Abgelegt wird jeder fertige Monat einmal in data/dukascopy/<PAAR>/<JJJJ-MM>.bin (Kerzen ohne Volumen = Wochenende/Feiertag fallen weg):
//   je Kerze 5 × Int32 (Little Endian): Unix-Sekunden, Open, High, Low, Close in Punkten.
// Der laufende Monat kommt weiterhin von Yahoo.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { holen } from './util.mjs';
import { lzmaEntpacken } from './lzma.mjs';

// Erster Monat mit Stundenkerzen bei Dukascopy
const START = {
  EURGBP: '2003-08', EURAUD: '2005-10', EURNZD: '2006-01', EURUSD: '2003-05', EURCAD: '2004-10', EURCHF: '2003-08', EURJPY: '2003-08',
  GBPAUD: '2006-03', GBPNZD: '2006-01', GBPUSD: '2003-05', GBPCAD: '2006-01', GBPCHF: '2003-08', GBPJPY: '2003-08',
  AUDNZD: '2006-12', AUDUSD: '2003-08', AUDCAD: '2006-01', AUDCHF: '2006-03', AUDJPY: '2003-11',
  NZDUSD: '2003-08', NZDCAD: '2006-01', NZDCHF: '2006-01', NZDJPY: '2006-01',
  USDCAD: '2003-08', USDCHF: '2003-05', USDJPY: '2003-05', CADCHF: '2006-01', CADJPY: '2004-10', CHFJPY: '2003-08',
};
const faktor = (pair) => (pair.endsWith('JPY') ? 1e3 : 1e5);
const REC = 20;

const ordner = (pair) => path.join(config.dataDir, 'dukascopy', pair);
const mIndex = (s) => { const [j, m] = s.split('-').map(Number); return j * 12 + m - 1; };
const mText = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const datei = (pair, i) => path.join(ordner(pair), `${mText(i)}.bin`);

// Letzter abgeschlossener Monat (ab dem 3. des Folgemonats, damit Dukascopy ihn sicher vollständig hat).
function letzterFertigerMonat(jetzt = new Date()) {
  const i = jetzt.getUTCFullYear() * 12 + jetzt.getUTCMonth();
  return jetzt.getUTCDate() >= 3 ? i - 1 : i - 2;
}

const zustand = { laeuft: false, paar: null, geladen: 0, offen: 0, fehler: null, letzterLauf: 0, gesperrtBis: 0, neu: 0 };
let beiNeuenDaten = null;
export const dukascopyNachLaden = (fn) => { beiNeuenDaten = fn; };

export function dukascopyAn() { return config.dukascopy !== false; }

function vorhanden(pair) {
  try { return new Set(fs.readdirSync(ordner(pair)).filter((f) => f.endsWith('.bin')).map((f) => mIndex(f.slice(0, 7)))); }
  catch { return new Set(); }
}

function fehlend(pair, bis = letzterFertigerMonat()) {
  const da = vorhanden(pair);
  const out = [];
  for (let i = bis; i >= mIndex(START[pair]); i--) if (!da.has(i)) out.push(i); // neueste zuerst
  return out;
}

// .bi5 → eigenes Format
export function umwandeln(roh, monat) {
  const daten = roh.length ? lzmaEntpacken(roh) : Buffer.alloc(0);
  const basis = Date.UTC(Math.floor(monat / 12), monat % 12, 1) / 1000;
  const n = Math.floor(daten.length / 24);
  const out = Buffer.alloc(n * REC);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 24;
    const vol = daten.readFloatBE(p + 20);
    if (!(vol > 0)) continue; // Wochenende, Feiertag: flache Kerze ohne Handel
    const o = daten.readInt32BE(p + 4), c = daten.readInt32BE(p + 8);
    let l = daten.readInt32BE(p + 12), h = daten.readInt32BE(p + 16);
    if (o <= 0 || c <= 0 || l <= 0 || h <= 0) continue;
    h = Math.max(h, o, c); l = Math.min(l, o, c);
    const q = k * REC;
    out.writeInt32LE(basis + daten.readInt32BE(p), q);
    out.writeInt32LE(o, q + 4); out.writeInt32LE(h, q + 8); out.writeInt32LE(l, q + 12); out.writeInt32LE(c, q + 16);
    k++;
  }
  return out.subarray(0, k * REC);
}

function speichern(pair, monat, buf) {
  fs.mkdirSync(ordner(pair), { recursive: true });
  const ziel = datei(pair, monat);
  fs.writeFileSync(ziel + '.tmp', buf);
  fs.renameSync(ziel + '.tmp', ziel);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function monatLaden(pair, monat) {
  const url = `https://datafeed.dukascopy.com/datafeed/${pair}/${Math.floor(monat / 12)}/${String(monat % 12).padStart(2, '0')}/BID_candles_hour_1.bi5`;
  const { res } = await holen(url, { timeout: 30_000, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) Zentrale' } });
  if (res.status === 404) return { status: 404 };
  if (!res.ok) return { status: res.status };
  return { status: 200, roh: Buffer.from(await res.arrayBuffer()) };
}

// Lädt alle fehlenden Monate (ruhig, eine Datei alle 1,5 Sekunden). Bremst Dukascopy (429/503), wird gewartet
// (30 s, dann immer länger bis 15 Min) und derselbe Monat nochmals versucht.
export async function dukascopyLauf() {
  if (!dukascopyAn() || zustand.laeuft || Date.now() < zustand.gesperrtBis) return;
  zustand.laeuft = true;
  zustand.neu = 0;
  const bis = letzterFertigerMonat();
  try {
    const liste = Object.keys(START).map((pair) => [pair, fehlend(pair, bis)]);
    zustand.offen = liste.reduce((s, [, m]) => s + m.length, 0);
    zustand.geladen = 0;
    zustand.fehler = null;
    let fehlerInFolge = 0, warten = 0;
    for (const [pair, monate] of liste) {
      zustand.paar = pair;
      for (let k = 0; k < monate.length; k++) {
        const monat = monate[k];
        let r;
        try { r = await monatLaden(pair, monat); }
        catch (err) { r = { status: 0, fehler: err.message }; }
        if (r.status === 429 || r.status === 503) {
          warten = Math.min(warten ? warten * 2 : 30_000, 15 * 60_000);
          zustand.fehler = `Dukascopy bremst (HTTP ${r.status})`;
          zustand.gesperrtBis = Date.now() + warten;
          await pause(warten);
          zustand.gesperrtBis = 0;
          k--; // gleichen Monat nochmals
          continue;
        }
        warten = 0;
        if (r.status === 200) {
          speichern(pair, monat, umwandeln(r.roh, monat));
          zustand.neu++; fehlerInFolge = 0;
        } else if (r.status === 404) {
          if (monat < bis - 2) speichern(pair, monat, Buffer.alloc(0)); // alter Monat ohne Datei: leer merken
          fehlerInFolge = 0;
        } else {
          zustand.fehler = r.fehler || `HTTP ${r.status}`;
          if (++fehlerInFolge >= 10) { zustand.gesperrtBis = Date.now() + 30 * 60_000; return; } // Netz weg: später weiter
        }
        zustand.geladen++;
        await pause(1500);
      }
    }
    zustand.letzterLauf = Date.now();
    zustand.fehler = null;
  } catch (err) {
    zustand.fehler = err.message;
  } finally {
    zustand.laeuft = false;
    zustand.paar = null;
    if (zustand.neu && beiNeuenDaten) beiNeuenDaten();
  }
}

// Stündlich aufrufen: läuft, solange etwas fehlt, danach einmal am Tag (neuer Monat).
export function dukascopyTakt() {
  if (zustand.laeuft) return;
  if (zustand.letzterLauf && Date.now() - zustand.letzterLauf < 24 * 3_600_000) return;
  dukascopyLauf().catch((e) => console.error('[dukascopy]', e.message));
}

// Stundenkerzen eines Paars: zusammenhängende Monate ab dem neuesten gespeicherten rückwärts.
// Ergebnis: { t (ms), o, h, l, c, bis (ms, Ende des letzten Monats) } oder null.
export function dukascopyStunden(pair) {
  if (!dukascopyAn() || !START[pair]) return null;
  const da = vorhanden(pair);
  if (!da.size) return null;
  const neuester = Math.max(...da);
  let erster = neuester;
  while (da.has(erster - 1)) erster--;
  const f = faktor(pair);
  const out = { t: [], o: [], h: [], l: [], c: [], bis: 0 };
  for (let i = erster; i <= neuester; i++) {
    let buf;
    try { buf = fs.readFileSync(datei(pair, i)); } catch { return null; }
    for (let p = 0; p + REC <= buf.length; p += REC) {
      out.t.push(buf.readInt32LE(p) * 1000);
      out.o.push(buf.readInt32LE(p + 4) / f); out.h.push(buf.readInt32LE(p + 8) / f);
      out.l.push(buf.readInt32LE(p + 12) / f); out.c.push(buf.readInt32LE(p + 16) / f);
    }
  }
  if (!out.t.length) return null;
  out.bis = Date.UTC(Math.floor((neuester + 1) / 12), (neuester + 1) % 12, 1);
  return out;
}

let zCache = { zeit: 0, wert: null };
export function dukascopyZustand() {
  if (zCache.wert && Date.now() - zCache.zeit < 20_000) return { ...zCache.wert, laeuft: zustand.laeuft, paar: zustand.paar, fehler: zustand.fehler };
  const bis = letzterFertigerMonat();
  let da = 0, gesamt = 0;
  const paare = Object.keys(START).map((pair) => {
    const soll = bis - mIndex(START[pair]) + 1;
    const ist = [...vorhanden(pair)].filter((i) => i <= bis && i >= mIndex(START[pair])).length;
    da += ist; gesamt += soll;
    return { pair, ist, soll, ab: START[pair] };
  });
  zCache = { zeit: Date.now(), wert: null };
  return (zCache.wert = {
    an: dukascopyAn(), laeuft: zustand.laeuft, paar: zustand.paar, da, gesamt, fertig: da >= gesamt,
    paareFertig: paare.filter((p) => p.ist >= p.soll).length, fehler: zustand.fehler,
    gesperrtBis: zustand.gesperrtBis > Date.now() ? zustand.gesperrtBis : null, bisMonat: mText(bis),
  });
}
