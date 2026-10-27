// Trading: GVA-Linien für alle 28 Major-Paare auf 3D, 1W und 1M.
// Die Regeln sind 1:1 aus Kerims Pine-Script «GVA Linien — Pur v1.1» übernommen:
//   - GVA = zwei HTF-Kerzen A (Gegenfarbe) und B, B mindestens X % grösserer Körper, Körper-Boden (bzw. -Top) von A und B
//     liegen innerhalb der Toleranz (Standard 5 % vom Körper von A). Level = Open von B (Boden bei Long, Top bei Short).
//   - Die Linie beginnt bei B, getroffen werden kann sie erst NACH dem Abschluss von B (die bildende Kerze zählt nie).
//   - Erster Treffer: Long-Linie, wenn ein Tief (Docht) das Level erreicht; Short-Linie, wenn ein Hoch es erreicht.
//   - Nachbar-Filter: Liegt zwischen B und der Treffer-Kerze nicht mindestens 1 ganze HTF-Kerze, wird die GVA verworfen.
//   - Nach dem ersten Treffer ist die Linie verbraucht.
// Kerzen werden wie bei TradingView-Forex gebaut: Handelstag endet um 17:00 New York, Woche So 17:00 – Fr 17:00,
// 3D = 3 Handelstage am Stück (Wochenende und 25.12./1.1. zählen nicht), Startpunkt über ein Ankerdatum einstellbar.
// Daten: Yahoo Finance (Stundenkerzen der letzten ~2 Jahre, davor Tageskerzen → ältere Linien auf wenige Pips genau).
import { db, save } from './store.mjs';
import { holen } from './util.mjs';
import { ereignis, nachrichtSenden, telegramBereit } from './ereignisse.mjs';
import { registrierePruefung } from './tagescheck.mjs';

const WAEHRUNGEN = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
export const PAARE = [];
for (let i = 0; i < WAEHRUNGEN.length; i++) for (let j = i + 1; j < WAEHRUNGEN.length; j++) PAARE.push(WAEHRUNGEN[i] + WAEHRUNGEN[j]);
export const TFS = ['3D', 'W', 'M'];

const STANDARD = {
  meldungen: true, // ntfy-Meldung beim ersten Treffer einer Linie
  tfs: { '3D': true, W: true, M: true },
  tolPct: 5, // Boden/Top-Toleranz (%)
  k2Pct: 40, // 2. Kerze mindestens X % grösser
  tolBasis: 'body', // 'body' = Body 1. Kerze, 'atr' = ATR (HTF)
  atrLen: 14,
  docht: true, // Docht zählt als Berührung
  touchTol: 0, // Touch-Toleranz (x ATR HTF)
  filterAn: true, // Nachbar-Filter
  filterAbstand: 1, // mindestens X HTF-Kerzen komplett dazwischen
  anker3d: '2026-10-01', // ein Handelstag, an dem eine 3D-Kerze beginnt
  feiertageAus: true, // 25.12. und 1.1. sind keine Handelstage (zählen nicht für 3D)
};

const TAG = 86_400_000;
const STUNDE = 3_600_000;
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) Zentrale' };

const zustand = {
  daten: new Map(), // pair -> { t, o, h, l, c, sd, quelle } (Arrays, sortiert)
  ergebnis: new Map(), // pair -> Ergebnis von rechnen()
  fehler: new Map(), // pair -> Text
  geladen: false,
  laedt: false,
  letzteVoll: 0,
  letzteLive: 0,
  fortschritt: 0,
};

export function tradingEinstellungen() {
  const d = db();
  d.trading ||= {};
  d.trading.einstellungen = { ...STANDARD, ...(d.trading.einstellungen || {}), tfs: { ...STANDARD.tfs, ...(d.trading.einstellungen?.tfs || {}) } };
  d.trading.bekannt ||= {}; // lineId -> Trefferzeit (bereits gemeldet bzw. beim Start schon vorhanden)
  d.trading.init ||= {}; // pair -> true, sobald einmal gerechnet (erste Rechnung meldet nichts)
  return d.trading.einstellungen;
}

// ---------- Zeit: New-York-Handelstage ----------
const dstCache = new Map();
function dst(jahr) {
  if (!dstCache.has(jahr)) {
    const sonntag = (monat, n) => { // n-ter Sonntag im Monat (UTC-Tag)
      const d = new Date(Date.UTC(jahr, monat, 1));
      const erster = 1 + ((7 - d.getUTCDay()) % 7);
      return Date.UTC(jahr, monat, erster + (n - 1) * 7);
    };
    dstCache.set(jahr, [sonntag(2, 2) + 7 * STUNDE, sonntag(10, 1) + 6 * STUNDE]); // 2:00 EST = 07:00 UTC, 2:00 EDT = 06:00 UTC
  }
  return dstCache.get(jahr);
}
const nyOffset = (ms) => { const [a, b] = dst(new Date(ms).getUTCFullYear()); return ms >= a && ms < b ? -4 * STUNDE : -5 * STUNDE; };
const wochentag = (tag) => (((tag + 4) % 7) + 7) % 7; // 0 = Sonntag (1.1.1970 war ein Donnerstag)
const mmtt = (tag) => new Date(tag * TAG).toISOString().slice(5, 10);
const istFeiertag = (tag, e) => e.feiertageAus && (mmtt(tag) === '12-25' || mmtt(tag) === '01-01');
const istHandelstag = (tag, e) => { const w = wochentag(tag); return w !== 0 && w !== 6 && !istFeiertag(tag, e); };
export const tagIso = (tag) => new Date(tag * TAG).toISOString().slice(0, 10);
const isoTag = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / TAG);

// Handelstag (Tagesnummer seit 1970) einer Stundenkerze: ab 17:00 New York zählt sie zum nächsten Tag.
function sessionTag(ms, e) {
  const lokal = ms + nyOffset(ms);
  let tag = Math.floor(lokal / TAG);
  if (Math.floor((lokal - tag * TAG) / STUNDE) >= 17) tag += 1;
  return naechsterHandelstag(tag, e);
}
// Wochenend- oder Feiertags-Daten werden dem nächsten Handelstag zugeschlagen.
function naechsterHandelstag(tag, e) {
  let t = tag;
  for (let i = 0; i < 5 && !istHandelstag(t, e); i++) t++;
  return t;
}
// Start eines Handelstags in UTC (17:00 New York am Vortag).
const tagStart = (tag) => { const ca = (tag - 1) * TAG + 22 * STUNDE; return (tag - 1) * TAG + 17 * STUNDE - nyOffset(ca); };

// Anzahl Handelstage vor einem Tag (für die durchgehende 3D-Zählung).
const htCache = new Map();
function handelstageVor(tag, e) {
  const key = `${e.feiertageAus}|${tag}`;
  if (htCache.has(key)) return htCache.get(key);
  const wochen = Math.floor(tag / 7);
  let n = wochen * 5;
  for (let t = wochen * 7; t < tag; t++) { const w = wochentag(t); if (w !== 0 && w !== 6) n++; }
  if (e.feiertageAus) {
    const bis = new Date(tag * TAG).getUTCFullYear();
    for (let j = 1970; j <= bis; j++) {
      for (const [m, d] of [[0, 1], [11, 25]]) {
        const ft = Date.UTC(j, m, d) / TAG;
        if (ft < tag) { const w = wochentag(ft); if (w !== 0 && w !== 6) n--; }
      }
    }
  }
  if (htCache.size > 200_000) htCache.clear();
  htCache.set(key, n);
  return n;
}

function keyFn(tf, e) {
  if (tf === 'W') return (tag) => Math.floor((tag - ((wochentag(tag) + 6) % 7)) / 7); // Wochennummer (Montag)
  if (tf === 'M') return (tag) => { const d = new Date(tag * TAG); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  if (tf === 'D') return (tag) => tag;
  const anker = handelstageVor(naechsterHandelstag(isoTag(e.anker3d), e), e);
  return (tag) => Math.floor((handelstageVor(tag, e) - anker) / 3);
}

// ---------- Daten von Yahoo ----------
async function yahoo(pair, query) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${pair}=X?${query}`;
  const { res } = await holen(url, { timeout: 20_000, headers: UA });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(j?.chart?.error?.description || 'Yahoo: keine Kurse');
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v === null || v === undefined || !isFinite(v) || v <= 0)) continue;
    out.push({ t: r.timestamp[i] * 1000, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c });
  }
  return out;
}

const leer = () => ({ t: [], o: [], h: [], l: [], c: [], sd: [], quelle: [] });

async function vollLaden(pair, e) {
  const jetzt = Math.floor(Date.now() / 1000);
  const [tage, stunden] = [await yahoo(pair, `interval=1d&period1=1072915200&period2=${jetzt}`), await yahoo(pair, 'interval=1h&range=730d')];
  const d = leer();
  const ersterStundenTag = stunden.length ? sessionTag(stunden[0].t, e) + 1 : Infinity; // erster vollständiger Tag
  for (const b of tage) {
    const tag = naechsterHandelstag(Math.floor((b.t + 3 * STUNDE) / TAG), e); // Yahoo-Tageskerze = Londoner Kalendertag
    if (tag >= ersterStundenTag) break;
    d.t.push(tagStart(tag)); d.o.push(b.o); d.h.push(b.h); d.l.push(b.l); d.c.push(b.c); d.sd.push(tag); d.quelle.push(0);
  }
  for (const b of stunden) {
    const tag = sessionTag(b.t, e);
    if (tag < ersterStundenTag) continue;
    einfuegen(d, Math.floor(b.t / STUNDE) * STUNDE, b, tag);
  }
  return d;
}

// Stundenkerze einfügen oder mit der vorhandenen derselben Stunde zusammenführen (Yahoo liefert die laufende Stunde
// als zusätzliche Zeile mit «krummem» Zeitstempel).
function einfuegen(d, t, b, tag) {
  const n = d.t.length;
  if (n && d.t[n - 1] === t) {
    d.h[n - 1] = Math.max(d.h[n - 1], b.h); d.l[n - 1] = Math.min(d.l[n - 1], b.l); d.c[n - 1] = b.c;
    return;
  }
  if (n && d.t[n - 1] > t) {
    // Ältere Stunde (Korrektur): an richtiger Stelle zusammenführen, falls vorhanden.
    let i = n - 1;
    while (i >= 0 && d.t[i] > t) i--;
    if (i >= 0 && d.t[i] === t) { d.h[i] = Math.max(d.h[i], b.h); d.l[i] = Math.min(d.l[i], b.l); if (i < n - 1) return; d.c[i] = b.c; }
    return;
  }
  d.t.push(t); d.o.push(b.o); d.h.push(b.h); d.l.push(b.l); d.c.push(b.c); d.sd.push(tag); d.quelle.push(1);
}

async function liveLaden(pair, e) {
  const d = zustand.daten.get(pair);
  if (!d) return;
  const neu = await yahoo(pair, 'interval=1h&range=2d');
  for (const b of neu) einfuegen(d, Math.floor(b.t / STUNDE) * STUNDE, b, sessionTag(b.t, e));
}

// ---------- Rechnen ----------
// Segmentbaum: erste Position ≥ s mit Tief ≤ x (bzw. Hoch ≥ x) in O(log n).
function baum(werte, istMin) {
  let n = 1;
  while (n < werte.length) n <<= 1;
  const t = new Float64Array(2 * n).fill(istMin ? Infinity : -Infinity);
  for (let i = 0; i < werte.length; i++) t[n + i] = werte[i];
  for (let i = n - 1; i >= 1; i--) t[i] = istMin ? Math.min(t[2 * i], t[2 * i + 1]) : Math.max(t[2 * i], t[2 * i + 1]);
  return { t, n, istMin };
}
function ersterTreffer(b, s, x) {
  const passt = (v) => (b.istMin ? v <= x : v >= x);
  const such = (k, lo, hi) => {
    if (hi < s || !passt(b.t[k])) return -1;
    if (lo === hi) return lo;
    const mid = (lo + hi) >> 1;
    const l = such(2 * k, lo, mid);
    return l >= 0 ? l : such(2 * k + 1, mid + 1, hi);
  };
  return such(1, 0, b.n - 1);
}

function kerzenBauen(d, tf, e) {
  const kf = keyFn(tf, e);
  const barKey = new Array(d.t.length);
  const kerzen = [];
  for (let i = 0; i < d.t.length; i++) {
    const k = kf(d.sd[i]);
    barKey[i] = k;
    const letzte = kerzen[kerzen.length - 1];
    if (letzte && letzte.k === k) {
      letzte.h = Math.max(letzte.h, d.h[i]); letzte.l = Math.min(letzte.l, d.l[i]); letzte.c = d.c[i]; letzte.e = i;
      if (d.quelle[i] === 0) letzte.alt = true;
    } else {
      kerzen.push({ k, o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], s: i, e: i, tag: d.sd[i], alt: d.quelle[i] === 0 });
    }
  }
  return { kerzen, barKey };
}

// ATR wie ta.atr (RMA, erster Wert = Durchschnitt der ersten N True Ranges).
function atrReihe(kerzen, len) {
  const out = new Array(kerzen.length).fill(null);
  let atr = null, summe = 0;
  for (let i = 0; i < kerzen.length; i++) {
    const k = kerzen[i];
    const tr = i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - kerzen[i - 1].c), Math.abs(k.l - kerzen[i - 1].c));
    if (i < len) { summe += tr; if (i === len - 1) atr = summe / len; }
    else atr = (atr * (len - 1) + tr) / len;
    out[i] = atr;
  }
  return out;
}

export const pipVon = (pair) => (pair.endsWith('JPY') ? 0.01 : 0.0001);
const runden = (pair, x) => Number(x.toFixed(pair.endsWith('JPY') ? 3 : 5));

// Alle GVA-Linien eines Paars mit ihrem Schicksal (offen / getroffen / verworfen). Wird vom Live-Tab und von der Statistik benutzt.
// tfs: welche Zeitrahmen (Standard: wie in den Einstellungen).
export function linienFinden(pair, d, e, tfs = TFS.filter((tf) => e.tfs[tf])) {
  const n = d.t.length;
  if (n < 50) throw new Error('zu wenige Kurse');
  const tiefe = new Float64Array(n), hoehe = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tiefe[i] = e.docht ? d.l[i] : Math.min(d.o[i], d.c[i]);
    hoehe[i] = e.docht ? d.h[i] : Math.max(d.o[i], d.c[i]);
  }
  const bMin = baum(tiefe, true), bMax = baum(hoehe, false);
  const linien = [];
  for (const tf of tfs) {
    const { kerzen, barKey } = kerzenBauen(d, tf, e);
    const atr = atrReihe(kerzen, e.atrLen);
    // C = i (existiert → B = i-1 ist abgeschlossen), A = i-2.
    for (let i = 2; i < kerzen.length; i++) {
      const A = kerzen[i - 2], B = kerzen[i - 1];
      const bodyA = Math.abs(A.c - A.o);
      if (!(bodyA > 0)) continue;
      const bodyB = Math.abs(B.c - B.o);
      const atrB = atr[i - 1] ?? 0;
      const matchTol = e.tolBasis === 'atr' ? atrB * (e.tolPct / 100) : bodyA * (e.tolPct / 100);
      const tTol = atrB * e.touchTol;
      const groesser = bodyB >= bodyA * (1 + e.k2Pct / 100);
      const bull = A.c < A.o && B.c > B.o && groesser && Math.abs(Math.min(A.o, A.c) - Math.min(B.o, B.c)) <= matchTol;
      const bear = A.c > A.o && B.c < B.o && groesser && Math.abs(Math.max(A.o, A.c) - Math.max(B.o, B.c)) <= matchTol;
      if (!bull && !bear) continue;
      const lvl = bull ? Math.min(B.o, B.c) : Math.max(B.o, B.c);
      const seite = bull ? 'long' : 'short';
      const j = ersterTreffer(bull ? bMin : bMax, B.e + 1, bull ? lvl + tTol : lvl - tTol);
      const getroffen = j >= 0 && j < n;
      const status = !getroffen ? 'offen' : e.filterAn && barKey[j] - B.k < e.filterAbstand + 1 ? 'verworfen' : 'treffer';
      linien.push({
        id: `${pair}|${tf}|${tagIso(B.tag)}|${seite}`, tf, seite, lvlRoh: lvl, lvl: runden(pair, lvl), entstanden: tagIso(B.tag), alt: B.alt,
        status, j: getroffen ? j : -1, A, B, atrB, verhaeltnis: bodyB / bodyA, passung: Math.abs(bull ? Math.min(A.o, A.c) - Math.min(B.o, B.c) : Math.max(A.o, A.c) - Math.max(B.o, B.c)) / bodyA,
      });
    }
  }
  return linien;
}

function rechnen(pair, d, e) {
  const n = d.t.length;
  const pip = pipVon(pair);
  const preis = d.c[n - 1];
  const tageK = kerzenBauen(d, 'D', e).kerzen;
  const atrD = atrReihe(tageK, 14);
  const atrTag = atrD[atrD.length - 1] || pip * 50;

  const offen = [], treffer = [];
  let verworfen = 0;
  for (const l of linienFinden(pair, d, e)) {
    const linie = { id: l.id, tf: l.tf, seite: l.seite, lvl: l.lvl, entstanden: l.entstanden, alt: l.alt };
    if (l.status === 'verworfen') verworfen++;
    else if (l.status === 'treffer') treffer.push({ ...linie, t: d.t[l.j], ungefaehr: d.quelle[l.j] === 0 });
    else {
      const abstand = Math.abs(preis - l.lvlRoh);
      offen.push({ ...linie, abstandPips: Number((abstand / pip).toFixed(1)), abstandAtr: Number((abstand / atrTag).toFixed(2)) });
    }
  }
  offen.sort((a, b) => a.abstandPips - b.abstandPips);
  treffer.sort((a, b) => b.t - a.t);

  // Pro Zeitrahmen die nächste Long- (unter dem Preis) und Short-Linie (über dem Preis).
  const naechste = {};
  for (const tf of TFS) {
    naechste[tf] = { long: offen.find((l) => l.tf === tf && l.seite === 'long') || null, short: offen.find((l) => l.tf === tf && l.seite === 'short') || null };
  }
  const chart = tageK.slice(-90).map((k) => ({ tag: tagIso(k.tag), o: k.o, h: k.h, l: k.l, c: k.c }));
  return { pair, pip, preis: runden(pair, preis), zeit: d.t[n - 1], atrTag: Number((atrTag / pip).toFixed(1)), offen, treffer, verworfen, naechste, chart };
}

// ---------- Treffer melden ----------
async function trefferPruefen(pair, r) {
  const d = db();
  const e = tradingEinstellungen();
  const bekannt = d.trading.bekannt;
  const erstesMal = !d.trading.init[pair];
  const neu = [];
  for (const t of r.treffer) {
    if (bekannt[t.id]) continue;
    bekannt[t.id] = t.t;
    if (!erstesMal && t.t > Date.now() - 12 * STUNDE) neu.push(t);
  }
  d.trading.init[pair] = true;
  // Alte Einträge aufräumen (nur die letzten 30 Tage sind für neue Meldungen relevant).
  const grenze = Date.now() - 30 * TAG;
  for (const [k, v] of Object.entries(bekannt)) if (v < grenze) delete bekannt[k];
  save();
  for (const t of neu.reverse()) {
    const text = `${pair} · ${t.seite === 'long' ? 'Long' : 'Short'} ${t.tf}-Linie das erste Mal getroffen\nLevel ${t.lvl} · entstanden ${datumCh(t.entstanden)} · Preis ${r.preis}`;
    ereignis('info', `🎯 ${text.replace('\n', ' · ')}`);
    if (e.meldungen && d.einstellungen.telegram && telegramBereit()) {
      try { await nachrichtSenden(`🎯 ${text}`, 'info', 'Trading'); } catch (err) { console.error('[trading]', err.message); }
    }
  }
}
const datumCh = (iso) => { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j}`; };

function allesNeuRechnen(meldungenZuruecksetzen = false) {
  const e = tradingEinstellungen();
  const d = db();
  if (meldungenZuruecksetzen) { d.trading.bekannt = {}; d.trading.init = {}; save(); }
  for (const [pair, daten] of zustand.daten) {
    try { const r = rechnen(pair, daten, e); zustand.ergebnis.set(pair, r); zustand.fehler.delete(pair); trefferPruefen(pair, r); }
    catch (err) { zustand.fehler.set(pair, err.message); }
  }
}

// ---------- Ablauf ----------
// Markt zu: Freitag 17:00 bis Sonntag 17:00 New York.
export function marktOffen(ms = Date.now()) {
  const lokal = ms + nyOffset(ms);
  const tag = Math.floor(lokal / TAG);
  const w = wochentag(tag), h = Math.floor((lokal - tag * TAG) / STUNDE);
  if (w === 6) return false;
  if (w === 5 && h >= 17) return false;
  if (w === 0 && h < 17) return false;
  return true;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function vollLauf() {
  if (zustand.laedt) return;
  zustand.laedt = true;
  zustand.fortschritt = 0;
  const e = tradingEinstellungen();
  try {
    for (const pair of PAARE) {
      try {
        const d = await vollLaden(pair, e);
        zustand.daten.set(pair, d);
        const r = rechnen(pair, d, e);
        zustand.ergebnis.set(pair, r);
        zustand.fehler.delete(pair);
        await trefferPruefen(pair, r);
      } catch (err) {
        zustand.fehler.set(pair, err.message);
      }
      zustand.fortschritt++;
      await pause(400);
    }
    zustand.geladen = true;
    zustand.letzteVoll = Date.now();
    zustand.letzteLive = Date.now();
  } finally {
    zustand.laedt = false;
  }
}

async function liveLauf() {
  const e = tradingEinstellungen();
  for (const pair of PAARE) {
    try {
      if (!zustand.daten.has(pair)) zustand.daten.set(pair, await vollLaden(pair, e));
      else await liveLaden(pair, e);
      const r = rechnen(pair, zustand.daten.get(pair), e);
      zustand.ergebnis.set(pair, r);
      zustand.fehler.delete(pair);
      await trefferPruefen(pair, r);
    } catch (err) {
      zustand.fehler.set(pair, err.message);
    }
    await pause(150);
  }
  zustand.letzteLive = Date.now();
}

// Wird jede Minute aufgerufen: einmal alles laden, danach alle 2 Min (Markt zu: alle 30 Min) die letzten Stunden nachladen.
// Einmal am Tag wird alles neu geladen (falls Yahoo Kerzen nachträglich korrigiert).
export async function tradingLauf() {
  if (zustand.laedt) return;
  const jetzt = Date.now();
  if (!zustand.geladen || jetzt - zustand.letzteVoll > 24 * STUNDE) return vollLauf();
  const takt = marktOffen() ? 2 * 60_000 : 30 * 60_000;
  if (jetzt - zustand.letzteLive >= takt - 5_000) await liveLauf();
}

export function tradingNeuLaden() {
  zustand.letzteVoll = 0;
  zustand.geladen = false;
  tradingLauf().catch((e) => console.error('[trading]', e.message));
}

// ---------- API ----------
export function tradingZustand() {
  const e = tradingEinstellungen();
  const paare = PAARE.map((pair) => {
    const r = zustand.ergebnis.get(pair);
    if (!r) return { pair, fehler: zustand.fehler.get(pair) || null, laedt: true };
    return { pair, preis: r.preis, zeit: r.zeit, pip: r.pip, atrTag: r.atrTag, naechste: r.naechste, naechsteLinie: r.offen[0] || null, offen: r.offen.length, fehler: zustand.fehler.get(pair) || null };
  });
  const seit = Date.now() - 14 * TAG;
  const treffer = [];
  for (const r of zustand.ergebnis.values()) for (const t of r.treffer) { if (t.t >= seit) treffer.push({ pair: r.pair, ...t }); else break; }
  treffer.sort((a, b) => b.t - a.t);
  return {
    einstellungen: e,
    marktOffen: marktOffen(),
    laedt: zustand.laedt,
    fortschritt: zustand.fortschritt,
    gesamt: PAARE.length,
    stand: zustand.letzteLive || null,
    meldungenBereit: telegramBereit() && !!db().einstellungen.telegram,
    paare,
    treffer,
  };
}

export function tradingPaar(pair) {
  const r = zustand.ergebnis.get(pair);
  if (!r) return null;
  return { ...r, treffer: r.treffer.slice(0, 40), fehler: zustand.fehler.get(pair) || null };
}

export function tradingEinstellungenSetzen(b) {
  const e = tradingEinstellungen();
  const zahl = (v, min, max, fallback) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback; };
  const neu = {
    ...e,
    meldungen: b.meldungen !== undefined ? !!b.meldungen : e.meldungen,
    tfs: { '3D': b.tfs?.['3D'] ?? e.tfs['3D'], W: b.tfs?.W ?? e.tfs.W, M: b.tfs?.M ?? e.tfs.M },
    tolPct: zahl(b.tolPct ?? e.tolPct, 0.1, 50, e.tolPct),
    k2Pct: zahl(b.k2Pct ?? e.k2Pct, 0, 500, e.k2Pct),
    tolBasis: b.tolBasis === 'atr' ? 'atr' : b.tolBasis === 'body' ? 'body' : e.tolBasis,
    atrLen: Math.round(zahl(b.atrLen ?? e.atrLen, 1, 50, e.atrLen)),
    docht: b.docht !== undefined ? !!b.docht : e.docht,
    touchTol: zahl(b.touchTol ?? e.touchTol, 0, 0.5, e.touchTol),
    filterAn: b.filterAn !== undefined ? !!b.filterAn : e.filterAn,
    filterAbstand: Math.round(zahl(b.filterAbstand ?? e.filterAbstand, 0, 20, e.filterAbstand)),
    anker3d: /^\d{4}-\d{2}-\d{2}$/.test(b.anker3d || '') ? b.anker3d : e.anker3d,
    feiertageAus: b.feiertageAus !== undefined ? !!b.feiertageAus : e.feiertageAus,
  };
  const regelnGeaendert = ['tfs', 'tolPct', 'k2Pct', 'tolBasis', 'atrLen', 'docht', 'touchTol', 'filterAn', 'filterAbstand', 'anker3d', 'feiertageAus']
    .some((k) => JSON.stringify(neu[k]) !== JSON.stringify(e[k]));
  db().trading.einstellungen = neu;
  save();
  if (regelnGeaendert) {
    htCache.clear();
    // Feiertags-Regel ändert die Zuordnung der Kerzen zu Handelstagen → dafür neu laden, sonst nur neu rechnen.
    if (neu.feiertageAus !== e.feiertageAus) { db().trading.bekannt = {}; db().trading.init = {}; save(); tradingNeuLaden(); }
    else allesNeuRechnen(true); // neue Regeln: bestehende Treffer gelten als bekannt (keine Meldungsflut)
  }
  return neu;
}

export async function tradingTestMeldung() {
  if (!telegramBereit()) return { ok: false, fehler: 'ntfy ist nicht eingerichtet' };
  const ok = await nachrichtSenden('🎯 Test: So sieht eine Trading-Meldung aus.\nEURUSD · Long 3D-Linie das erste Mal getroffen', 'info', 'Trading');
  return { ok: !!ok };
}

// Zwischenbericht: nur melden, wenn die Kurse im offenen Markt veraltet sind.
registrierePruefung('trading', async () => {
  if (!zustand.geladen || !marktOffen()) return [];
  const alt = Date.now() - (zustand.letzteLive || 0) > 30 * 60_000;
  const kaputt = zustand.fehler.size;
  const r = [];
  if (alt) r.push({ stufe: 'warnung', text: 'Trading: Kurse seit über 30 Min nicht aktualisiert' });
  if (kaputt > 3) r.push({ stufe: 'warnung', text: `Trading: ${kaputt} Paare ohne Kurse` });
  return r;
});

// Für Tests ohne Server.
export const _intern = { atrReihe, handelstageVorFn: (t, e) => handelstageVor(t, e), kerzenBauen, vollLaden, rechnen, sessionTag, keyFn, tagIso, handelstageVor, STANDARD };

// Aktueller Kurs eines Paars (für Umrechnungen im Journal), null wenn noch nicht geladen.
export function tradingKurs(pair) {
  return zustand.ergebnis.get(pair)?.preis ?? null;
}

// Für die Statistik: Rohdaten eines Paars und ein Stand, der sich bei jeder Änderung erhöht.
export const tradingDaten = (pair) => zustand.daten.get(pair) || null;
export const tradingStand = () => `${zustand.letzteVoll}|${zustand.letzteLive}|${JSON.stringify(tradingEinstellungen())}`;
