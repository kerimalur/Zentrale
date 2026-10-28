// Kursdaten von Dukascopy (Schweizer Bank, gratis, ab 2003) für alle 28 Paare – Grundlage für GVA-Statistik und Trading-Labor.
// Zwei Arten, beide nur für abgeschlossene Monate (der laufende Monat kommt von Yahoo):
//   h1 – Stundenkerzen: eine Datei pro Monat  …/<PAAR>/<JAHR>/<MONAT 00-11>/BID_candles_hour_1.bi5
//   m5 – 5-Minuten-Kerzen, gebaut aus Minutenkerzen: eine Datei pro Tag  …/<PAAR>/<JAHR>/<MONAT>/<TAG>/BID_candles_min_1.bi5
//        (wird erst geladen, wenn alle Stundenkerzen da sind; ein Monat wird gespeichert, sobald alle seine Tage da sind)
// .bi5 = LZMA-gepackt, je Kerze 24 Byte (Big Endian): Sekunden ab Datei-Beginn, Open, Close, Low, High (Ganzzahl in Punkten), Volumen (Float).
// Abgelegt in data/dukascopy/<PAAR>/<JJJJ-MM>.bin (h1) und data/dukascopy-m5/<PAAR>/<JJJJ-MM>.bin (m5):
//   je Kerze 5 × Int32 (Little Endian): Unix-Sekunden, Open, High, Low, Close in Punkten. Kerzen ohne Volumen (Wochenende) fallen weg.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.mjs';
import { holen } from './util.mjs';
import { lzmaEntpacken } from './lzma.mjs';

// Erster Monat mit Kerzen bei Dukascopy
const START = {
  EURGBP: '2003-08', EURAUD: '2005-10', EURNZD: '2006-01', EURUSD: '2003-05', EURCAD: '2004-10', EURCHF: '2003-08', EURJPY: '2003-08',
  GBPAUD: '2006-03', GBPNZD: '2006-01', GBPUSD: '2003-05', GBPCAD: '2006-01', GBPCHF: '2003-08', GBPJPY: '2003-08',
  AUDNZD: '2006-12', AUDUSD: '2003-08', AUDCAD: '2006-01', AUDCHF: '2006-03', AUDJPY: '2003-11',
  NZDUSD: '2003-08', NZDCAD: '2006-01', NZDCHF: '2006-01', NZDJPY: '2006-01',
  USDCAD: '2003-08', USDCHF: '2003-05', USDJPY: '2003-05', CADCHF: '2006-01', CADJPY: '2004-10', CHFJPY: '2003-08',
};
export const DUKA_PAARE = Object.keys(START);
export const faktor = (pair) => (pair.endsWith('JPY') ? 1e3 : 1e5);
const REC = 20;
const ARTEN = { h1: 'dukascopy', m5: 'dukascopy-m5' };

const ordner = (pair, art) => path.join(config.dataDir, ARTEN[art], pair);
const mIndex = (s) => { const [j, m] = s.split('-').map(Number); return j * 12 + m - 1; };
const mText = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const datei = (pair, i, art) => path.join(ordner(pair, art), `${mText(i)}.bin`);
const pad = (n) => String(n).padStart(2, '0');

// Letzter abgeschlossener Monat (ab dem 3. des Folgemonats, damit Dukascopy ihn sicher vollständig hat).
function letzterFertigerMonat(jetzt = new Date()) {
  const i = jetzt.getUTCFullYear() * 12 + jetzt.getUTCMonth();
  return jetzt.getUTCDate() >= 3 ? i - 1 : i - 2;
}

const zustand = { laeuft: false, art: null, paar: null, geladen: 0, offen: 0, fehler: null, letzterLauf: 0, gesperrtBis: 0, neu: 0, artStart: 0 };
let beiNeuenDaten = null;
export const dukascopyNachLaden = (fn) => { beiNeuenDaten = fn; };

export function dukascopyAn() { return config.dukascopy !== false; }

function vorhanden(pair, art) {
  try { return new Set(fs.readdirSync(ordner(pair, art)).filter((f) => f.endsWith('.bin')).map((f) => mIndex(f.slice(0, 7)))); }
  catch { return new Set(); }
}

function fehlend(pair, art, bis = letzterFertigerMonat()) {
  const da = vorhanden(pair, art);
  const out = [];
  for (let i = bis; i >= mIndex(START[pair]); i--) if (!da.has(i)) out.push(i); // neueste zuerst
  return out;
}

// .bi5 → Liste [Unix-Sekunden, o, h, l, c] (Punkte), ohne Kerzen ohne Handel
function kerzenLesen(roh, basisSek) {
  const daten = roh.length ? lzmaEntpacken(roh) : Buffer.alloc(0);
  const n = Math.floor(daten.length / 24);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = i * 24;
    if (!(daten.readFloatBE(p + 20) > 0)) continue; // Wochenende, Feiertag: flache Kerze ohne Handel
    const o = daten.readInt32BE(p + 4), c = daten.readInt32BE(p + 8);
    let l = daten.readInt32BE(p + 12), h = daten.readInt32BE(p + 16);
    if (o <= 0 || c <= 0 || l <= 0 || h <= 0) continue;
    h = Math.max(h, o, c); l = Math.min(l, o, c);
    out.push([basisSek + daten.readInt32BE(p), o, h, l, c]);
  }
  return out;
}

const zuBuffer = (kerzen) => {
  const b = Buffer.alloc(kerzen.length * REC);
  kerzen.forEach((k, i) => { for (let j = 0; j < 5; j++) b.writeInt32LE(k[j], i * REC + j * 4); });
  return b;
};

// Stunden-Datei eines Monats → eigenes Format (für Tests exportiert)
export function umwandeln(roh, monat) {
  return zuBuffer(kerzenLesen(roh, Date.UTC(Math.floor(monat / 12), monat % 12, 1) / 1000));
}

// Minutenkerzen → 5-Minuten-Kerzen
export function zuFuenfMinuten(minuten) {
  const out = [];
  for (const [t, o, h, l, c] of minuten) {
    const s = t - (t % 300);
    const letzte = out[out.length - 1];
    if (letzte && letzte[0] === s) { letzte[2] = Math.max(letzte[2], h); letzte[3] = Math.min(letzte[3], l); letzte[4] = c; }
    else out.push([s, o, h, l, c]);
  }
  return out;
}

function speichern(pair, monat, art, buf) {
  fs.mkdirSync(ordner(pair, art), { recursive: true });
  const ziel = datei(pair, monat, art);
  fs.writeFileSync(ziel + '.tmp', buf);
  fs.renameSync(ziel + '.tmp', ziel);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function holeDatei(url) {
  try {
    const { res } = await holen(url, { timeout: 20_000, headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) Zentrale' } });
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status };
    return { status: 200, roh: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    const c = err.cause;
    return { status: 0, fehler: c ? `${c.code || c.name || ""} ${c.message || ""}`.trim() : err.message };
  }
}

// Eine Datei holen. Alles ausser 200/404 (Bremse 429/503, Zeitüberschreitung, Netzfehler, 5xx) wird mit wachsender
// Pause erneut versucht (20 s, 40 s … höchstens 10 Min) – kein Monat wird übersprungen.
// Das Tempo passt sich an: nach einer Bremse länger warten zwischen den Dateien, nach vielen Erfolgen wieder schneller.
let warten = 0, tempo = 2000, erfolgeInFolge = 0;
async function holeGebremst(url, wo) {
  for (;;) {
    const r = await holeDatei(url);
    if (r.status === 200 || r.status === 404) {
      warten = 0;
      if (++erfolgeInFolge >= 100 && tempo > 1500) { tempo = Math.round(tempo * 0.9); erfolgeInFolge = 0; } // langsam wieder schneller
      return r;
    }
    erfolgeInFolge = 0;
    tempo = Math.min(Math.round(tempo * 1.6), 15_000); // Dukascopy-Grenze nicht mehr erreichen
    warten = Math.min(warten ? warten * 2 : 60_000, 10 * 60_000);
    const grund = r.status === 429 || r.status === 503 ? `Dukascopy bremst (HTTP ${r.status})` : r.status ? `HTTP ${r.status}` : `Netz: ${r.fehler || 'unbekannt'}`;
    zustand.fehler = grund;
    console.error(`[dukascopy] ${grund} bei ${wo} – neuer Versuch in ${Math.round(warten / 1000)} s, Tempo ${tempo} ms`);
    zustand.gesperrtBis = Date.now() + warten;
    await pause(warten);
    zustand.gesperrtBis = 0;
  }
}

const basisUrl = (pair, monat) => `https://datafeed.dukascopy.com/datafeed/${pair}/${Math.floor(monat / 12)}/${pad(monat % 12)}`;

// Liefert die Kerzen eines Monats (Liste). null = Monat (noch) nicht vorhanden.
async function monatHolen(pair, monat, art) {
  const jahr = Math.floor(monat / 12), mon = monat % 12;
  if (art === 'h1') {
    const r = await holeGebremst(`${basisUrl(pair, monat)}/BID_candles_hour_1.bi5`, `${pair} ${mText(monat)}`);
    await pause(tempo);
    if (r.status === 404) return null;
    return kerzenLesen(r.roh, Date.UTC(jahr, mon, 1) / 1000);
  }
  // m5: jeden Tag einzeln (Samstag hat nie Handel)
  const tage = new Date(Date.UTC(jahr, mon + 1, 0)).getUTCDate();
  const alle = [];
  for (let tag = 1; tag <= tage; tag++) {
    const basis = Date.UTC(jahr, mon, tag) / 1000;
    if (new Date(basis * 1000).getUTCDay() === 6) continue;
    const r = await holeGebremst(`${basisUrl(pair, monat)}/${pad(tag)}/BID_candles_min_1.bi5`, `${pair} ${mText(monat)}-${pad(tag)}`);
    await pause(tempo);
    if (r.status === 404) continue; // Tag ohne Datei (Feiertag, vor Start)
    for (const k of zuFuenfMinuten(kerzenLesen(r.roh, basis))) alle.push(k);
  }
  return alle;
}

// Lädt alle fehlenden Monate: zuerst alle Stundenkerzen, dann die 5-Minuten-Kerzen.
export async function dukascopyLauf() {
  if (!dukascopyAn() || zustand.laeuft) return;
  zustand.laeuft = true;
  zustand.neu = 0;
  let neuH1 = 0;
  const bis = letzterFertigerMonat();
  try {
    zustand.fehler = null;
    for (const art of ['h1', 'm5']) {
      const liste = DUKA_PAARE.map((pair) => [pair, fehlend(pair, art, bis)]);
      if (art === 'm5' && DUKA_PAARE.some((pair) => fehlend(pair, 'h1', bis).filter((m) => m < bis - 2).length)) break; // Stunden zuerst komplett
      zustand.art = art;
      zustand.offen = liste.reduce((s, [, m]) => s + m.length, 0);
      zustand.geladen = 0;
      zustand.artStart = Date.now();
      for (const [pair, monate] of liste) {
        zustand.paar = pair;
        for (const monat of monate) {
          const r = await monatHolen(pair, monat, art);
          zustand.fehler = null;
          if (r === null) { if (monat < bis - 2) speichern(pair, monat, art, Buffer.alloc(0)); } // alter Monat ohne Datei: leer merken
          else { speichern(pair, monat, art, zuBuffer(r)); zustand.neu++; if (art === 'h1') neuH1++; }
          zustand.geladen++;
        }
      }
    }
    zustand.letzterLauf = Date.now();
    zustand.fehler = null;
  } catch (err) {
    zustand.fehler = err.message;
  } finally {
    zustand.laeuft = false;
    zustand.paar = null;
    zustand.art = null;
    zCache.wert = null;
    if (neuH1 && beiNeuenDaten) beiNeuenDaten();
  }
}

// ---------- HistData.com (Hauptquelle seit 28.10.2026) ----------
// Dukascopy sperrt bei vielen Abfragen die Adresse (429/503, Verbindungsabbruch). HistData liefert dieselben Minutenkerzen
// (Bid, geprüft: identisch mit Dukascopy) als EIN ZIP pro Paar und Jahr (laufendes Jahr: pro Monat) → rund 700 Downloads statt 200'000.
// Zeit in den Dateien: EST ohne Sommerzeit (UTC−5). Daraus werden Stunden- und 5-Min-Kerzen im selben Format wie oben gespeichert
// (bestehende Dukascopy-Monate bleiben unangetastet).
const HD = 'https://www.histdata.com';
const HD_UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) Zentrale' };

// Einfacher ZIP-Leser: erste .csv-Datei entpacken.
export function zipCsv(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP: kein Verzeichnis');
  const anzahl = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < anzahl; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: kaputt');
    const methode = buf.readUInt16LE(p + 10), groesse = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), kl = buf.readUInt16LE(p + 32), lokal = buf.readUInt32LE(p + 42);
    const name = buf.toString('latin1', p + 46, p + 46 + nl);
    if (name.toLowerCase().endsWith('.csv')) {
      const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
      const daten = buf.subarray(start, start + groesse);
      return (methode === 8 ? zlib.inflateRawSync(daten) : daten).toString('latin1');
    }
    p += 46 + nl + xl + kl;
  }
  throw new Error('ZIP: keine CSV');
}

// CSV «20210103 170000;1.223960;1.223960;1.223730;1.223950;0» → Minuten [UTC-Sek, o, h, l, c] in Punkten
export function histdataMinuten(text, pair) {
  const f = faktor(pair);
  const out = [];
  for (const zeile of text.split('\n')) {
    if (zeile.length < 20) continue;
    const t = Date.UTC(+zeile.slice(0, 4), +zeile.slice(4, 6) - 1, +zeile.slice(6, 8), +zeile.slice(9, 11), +zeile.slice(11, 13), +zeile.slice(13, 15)) / 1000 + 5 * 3600;
    const w = zeile.slice(16).split(';');
    const o = Math.round(+w[0] * f), h = Math.round(+w[1] * f), l = Math.round(+w[2] * f), c = Math.round(+w[3] * f);
    if (!(o > 0 && h > 0 && l > 0 && c > 0) || !Number.isFinite(t)) continue;
    out.push([t, o, Math.max(h, o, c), Math.min(l, o, c), c]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

const zuStunden = (minuten) => {
  const out = [];
  for (const [t, o, h, l, c] of minuten) {
    const s = t - (t % 3600);
    const letzte = out[out.length - 1];
    if (letzte && letzte[0] === s) { letzte[2] = Math.max(letzte[2], h); letzte[3] = Math.min(letzte[3], l); letzte[4] = c; }
    else out.push([s, o, h, l, c]);
  }
  return out;
};

// Jahre (bzw. Monate im laufenden Jahr), die HistData für ein Paar anbietet → ab dem ersten Jahr
async function hdErstesJahr(pair) {
  const r = await hdHolen(`${HD}/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${pair.toLowerCase()}`);
  const jahre = [...r.toString('latin1').matchAll(new RegExp(`${pair.toLowerCase()}/(\\d{4})"`, 'g'))].map((m) => +m[1]);
  return jahre.length ? Math.min(...jahre) : null;
}

async function hdHolen(url, opts = {}) {
  for (;;) {
    let r;
    try {
      const { res } = await holen(url, { timeout: 120_000, ...opts, headers: { ...HD_UA, ...(opts.headers || {}) } });
      if (res.ok) { warten = 0; return Buffer.from(await res.arrayBuffer()); }
      if (res.status === 404) return null;
      r = `HTTP ${res.status}`;
    } catch (err) {
      const c = err.cause;
      r = `Netz: ${c ? `${c.code || c.name || ''} ${c.message || ''}`.trim() : err.message}`;
    }
    warten = Math.min(warten ? warten * 2 : 60_000, 15 * 60_000);
    zustand.fehler = `HistData: ${r}`;
    console.error(`[histdata] ${r} bei ${url} – neuer Versuch in ${Math.round(warten / 1000)} s`);
    zustand.gesperrtBis = Date.now() + warten;
    await pause(warten);
    zustand.gesperrtBis = 0;
  }
}

// Ein Paket (Jahr oder Monat) laden → Minutenkerzen oder null (nicht angeboten)
async function hdPaket(pair, jahr, monat = null) {
  const pfad = `${pair.toLowerCase()}/${jahr}${monat ? `/${monat}` : ''}`;
  const seite = `${HD}/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${pfad}`;
  const html = await hdHolen(seite);
  const tk = html?.toString('latin1').match(/name="tk" id="tk" value="([0-9a-f]+)"/)?.[1];
  if (!tk) return null;
  const formular = new URLSearchParams({ tk, date: String(jahr), datemonth: monat ? `${jahr}${pad(monat)}` : String(jahr), platform: 'ASCII', timeframe: 'M1', fxpair: pair });
  await pause(1500);
  const zip = await hdHolen(`${HD}/get.php`, { method: 'POST', body: formular, headers: { Referer: seite, 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!zip || zip.length < 100 || zip.readUInt32LE(0) !== 0x04034b50) return null;
  return histdataMinuten(zipCsv(zip), pair);
}

// Minuten → Monate speichern (nur fehlende). Liefert Anzahl neuer Stunden-Monate.
function hdSpeichern(pair, minuten, monate, bis) {
  const proMonat = new Map();
  for (const k of minuten) {
    const d = new Date(k[0] * 1000);
    const m = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!proMonat.has(m)) proMonat.set(m, []);
    proMonat.get(m).push(k);
  }
  let neuH1 = 0;
  const da = { h1: vorhanden(pair, 'h1'), m5: vorhanden(pair, 'm5') };
  for (const m of monate) {
    if (m > bis) continue;
    const ks = proMonat.get(m);
    if (!ks || !ks.length) {
      for (const art of ['h1', 'm5']) if (!da[art].has(m) && m < bis - 2) speichern(pair, m, art, Buffer.alloc(0)); // kein Handel / nicht angeboten
      continue;
    }
    if (!da.m5.has(m)) { speichern(pair, m, 'm5', zuBuffer(zuFuenfMinuten(ks))); zustand.neu++; }
    if (!da.h1.has(m)) { speichern(pair, m, 'h1', zuBuffer(zuStunden(ks))); zustand.neu++; neuH1++; }
  }
  return neuH1;
}

export async function histdataLauf() {
  if (!dukascopyAn() || zustand.laeuft) return;
  zustand.laeuft = true;
  zustand.neu = 0;
  let neuH1 = 0;
  const bis = letzterFertigerMonat();
  const jetztJahr = Math.floor(bis / 12);
  try {
    zustand.fehler = null;
    // Arbeitsliste: pro Paar die Jahre, in denen noch ein Monat (h1 oder m5) fehlt
    const auftraege = [];
    for (const pair of DUKA_PAARE) {
      const fehltM = new Set([...fehlend(pair, 'h1', bis), ...fehlend(pair, 'm5', bis)]);
      const jahre = [...new Set([...fehltM].map((m) => Math.floor(m / 12)))].sort((a, b) => a - b);
      if (jahre.length) auftraege.push([pair, jahre, fehltM]);
    }
    zustand.art = 'alle';
    zustand.offen = auftraege.reduce((s, [, j]) => s + j.length, 0);
    zustand.geladen = 0;
    zustand.artStart = Date.now();
    for (const [pair, jahre, fehltM] of auftraege) {
      zustand.paar = pair;
      const erstes = await hdErstesJahr(pair);
      await pause(1500);
      for (const jahr of jahre) {
        zustand.paar = `${pair} ${jahr}`;
        const monate = [...fehltM].filter((m) => Math.floor(m / 12) === jahr).sort((a, b) => a - b);
        if (erstes === null || jahr < erstes) {
          neuH1 += hdSpeichern(pair, [], monate, bis); // HistData hat dieses Jahr nicht → leer merken (wenn alt genug)
        } else if (jahr < jetztJahr) {
          const minuten = await hdPaket(pair, jahr);
          neuH1 += hdSpeichern(pair, minuten || [], monate, bis);
          await pause(3000);
        } else {
          // Laufendes Jahr: Monat für Monat. HistData-Monate laufen nach New-York-Zeit, die ersten 5 Stunden eines Monats (UTC)
          // stehen also in der Datei des Vormonats → den Vormonat mitladen.
          const laden = [...new Set(monate.flatMap((m) => (m % 12 > 0 ? [m - 1, m] : [m])))].sort((a, b) => a - b);
          const alle = [];
          for (const m of laden) {
            const minuten = await hdPaket(pair, jahr, (m % 12) + 1);
            if (minuten) for (const k of minuten) alle.push(k);
            await pause(3000);
          }
          alle.sort((a, b) => a[0] - b[0]);
          neuH1 += hdSpeichern(pair, alle, monate, bis);
        }
        zustand.geladen++;
      }
    }
    zustand.letzterLauf = Date.now();
    zustand.fehler = null;
  } catch (err) {
    zustand.fehler = err.message;
    console.error('[histdata]', err);
  } finally {
    zustand.laeuft = false;
    zustand.paar = null;
    zustand.art = null;
    zCache.wert = null;
    if (neuH1 && beiNeuenDaten) beiNeuenDaten();
  }
}

// Alle 5 Minuten aufrufen: läuft, solange etwas fehlt, danach einmal am Tag (neuer Monat). Quelle: HistData.
export function dukascopyTakt() {
  if (zustand.laeuft) return;
  if (zustand.letzterLauf && Date.now() - zustand.letzterLauf < 24 * 3_600_000) return;
  histdataLauf().catch((e) => console.error('[histdata]', e.message));
}

// Zusammenhängende gespeicherte Monate ab dem neuesten rückwärts
function lauf(pair, art) {
  const da = vorhanden(pair, art);
  if (!da.size) return null;
  const neuester = Math.max(...da);
  let erster = neuester;
  while (da.has(erster - 1)) erster--;
  return { erster, neuester };
}

// Stundenkerzen eines Paars: { t (ms), o, h, l, c, bis (ms, Ende des letzten Monats) } oder null.
export function dukascopyStunden(pair) {
  if (!dukascopyAn() || !START[pair]) return null;
  const m = lauf(pair, 'h1');
  if (!m) return null;
  const f = faktor(pair);
  const out = { t: [], o: [], h: [], l: [], c: [], bis: 0 };
  for (let i = m.erster; i <= m.neuester; i++) {
    let buf;
    try { buf = fs.readFileSync(datei(pair, i, 'h1')); } catch { return null; }
    for (let p = 0; p + REC <= buf.length; p += REC) {
      out.t.push(buf.readInt32LE(p) * 1000);
      out.o.push(buf.readInt32LE(p + 4) / f); out.h.push(buf.readInt32LE(p + 8) / f);
      out.l.push(buf.readInt32LE(p + 12) / f); out.c.push(buf.readInt32LE(p + 16) / f);
    }
  }
  if (!out.t.length) return null;
  out.bis = Date.UTC(Math.floor((m.neuester + 1) / 12), (m.neuester + 1) % 12, 1);
  return out;
}

// 5-Minuten-Kerzen eines Paars als kompakte Arrays (für das Labor): { n, t (Int32Array, Unix-Sekunden), o, h, l, c (Float64Array), bis (ms) }.
// von/bis optional als 'JJJJ-MM'.
export function dukascopyFuenfMinuten(pair, von = null, bisMonat = null) {
  if (!START[pair]) return null;
  const m = lauf(pair, 'm5');
  if (!m) return null;
  const a = Math.max(m.erster, von ? mIndex(von) : -Infinity), b = Math.min(m.neuester, bisMonat ? mIndex(bisMonat) : Infinity);
  const puffer = [];
  let n = 0;
  for (let i = a; i <= b; i++) {
    try { const buf = fs.readFileSync(datei(pair, i, 'm5')); puffer.push(buf); n += Math.floor(buf.length / REC); } catch { return null; }
  }
  const f = faktor(pair);
  const out = { n, t: new Int32Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), bis: Date.UTC(Math.floor((b + 1) / 12), (b + 1) % 12, 1) };
  let k = 0;
  for (const buf of puffer) {
    for (let p = 0; p + REC <= buf.length; p += REC, k++) {
      out.t[k] = buf.readInt32LE(p);
      out.o[k] = buf.readInt32LE(p + 4) / f; out.h[k] = buf.readInt32LE(p + 8) / f;
      out.l[k] = buf.readInt32LE(p + 12) / f; out.c[k] = buf.readInt32LE(p + 16) / f;
    }
  }
  return out;
}

let zCache = { zeit: 0, wert: null };
function stand(art, bis) {
  let da = 0, gesamt = 0, paareFertig = 0;
  for (const pair of DUKA_PAARE) {
    const soll = bis - mIndex(START[pair]) + 1;
    const ist = [...vorhanden(pair, art)].filter((i) => i <= bis && i >= mIndex(START[pair])).length;
    da += ist; gesamt += soll;
    if (ist >= soll) paareFertig++;
  }
  return { da, gesamt, fertig: da >= gesamt, paareFertig };
}
export function dukascopyZustand() {
  const live = () => {
    // Restzeit aus dem bisherigen Tempo dieses Laufs (erst nach ein paar Monaten aussagekräftig)
    const dauer = Date.now() - zustand.artStart;
    const restMin = zustand.laeuft && zustand.geladen >= 3 && dauer > 0
      ? Math.round(((zustand.offen - zustand.geladen) * (dauer / zustand.geladen)) / 60_000) : null;
    return { laeuft: zustand.laeuft, art: zustand.art, paar: zustand.paar, fehler: zustand.fehler, restMin, gesperrtBis: zustand.gesperrtBis > Date.now() ? zustand.gesperrtBis : null };
  };
  if (zCache.wert && Date.now() - zCache.zeit < 20_000) return { ...zCache.wert, ...live() };
  const bis = letzterFertigerMonat();
  const h1 = stand('h1', bis);
  zCache = { zeit: Date.now(), wert: { an: dukascopyAn(), ...h1, m5: stand('m5', bis), bisMonat: mText(bis) } };
  return { ...zCache.wert, ...live() };
}

// Für Tests
export const _hd = { hdPaket, hdErstesJahr, hdSpeichern, letzterFertigerMonat };
