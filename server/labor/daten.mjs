// Kursdaten fürs Labor: Basis-Kerzen eines Paars (5 Min, sonst 1 Std) und daraus gebaute Zeitrahmen.
// Alles als Typed Arrays, Paar für Paar, damit der Pi wenig Speicher braucht.
// Die Daten enden HART am Ende des Testzeitraums: Was danach kommt, ist im Speicher gar nicht vorhanden (kein Blick in die Zukunft,
// und der gesperrte Forward-Zeitraum bleibt wirklich gesperrt).
import { dukascopyFuenfMinuten, dukascopyStunden } from '../dukascopy.mjs';
import { _intern } from '../trading.mjs';

const { sessionTag, keyFn, handelstageVor } = _intern;

export const TF_SEK = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14_400 };
export const TF_LISTE = ['5m', '15m', '30m', '1H', '4H', 'D', '3D', 'W', 'M'];
export const TF_TEXT = { '5m': '5 Min', '15m': '15 Min', '30m': '30 Min', '1H': '1 Std', '4H': '4 Std', D: 'Tag', '3D': '3 Tage', W: 'Woche', M: 'Monat' };
const mText = (sek) => { const d = new Date(sek * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

function ausListen(t, o, h, l, c) {
  const n = t.length;
  const b = { n, t: new Int32Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n) };
  for (let i = 0; i < n; i++) { b.t[i] = t[i]; b.o[i] = o[i]; b.h[i] = h[i]; b.l[i] = l[i]; b.c[i] = c[i]; }
  return b;
}

// Basis-Kerzen eines Paars bis (ausschliesslich) bisSek.
// Quelle: 5-Min-Kerzen, wenn sie die ganze Historie abdecken; sonst Stundenkerzen von Dukascopy; sonst Yahoo-Stunden (nur ~2 Jahre).
export function basisLaden(pair, { bisSek, e, yahoo = null, nurStunden = false }) {
  const h1 = dukascopyStunden(pair);
  let b = null, quelle = null, res = 3600;
  if (!nurStunden) {
    const m5 = dukascopyFuenfMinuten(pair, null, mText(bisSek - 1));
    if (m5 && m5.n && (!h1 || m5.t[0] * 1000 <= h1.t[0] + 31 * 86_400_000)) { b = m5; quelle = 'Dukascopy 5 Min'; res = 300; }
  }
  if (!b && h1) { b = ausListen(h1.t.map((x) => x / 1000), h1.o, h1.h, h1.l, h1.c); quelle = 'Dukascopy 1 Std'; }
  if (!b && yahoo && yahoo.t.length) { b = ausListen(Array.from(yahoo.t, (x) => Math.floor(x / 1000)), yahoo.o, yahoo.h, yahoo.l, yahoo.c); quelle = 'Yahoo 1 Std (nur ~2 Jahre)'; }
  if (!b) return null;
  // am Ende des Zeitraums abschneiden
  let n = b.n;
  while (n > 0 && b.t[n - 1] >= bisSek) n--;
  const basis = { pair, res, quelle, n, t: b.t.subarray(0, n), o: b.o.subarray(0, n), h: b.h.subarray(0, n), l: b.l.subarray(0, n), c: b.c.subarray(0, n), sd: new Int32Array(n), cache: new Map(), e };
  // Handelstag (17:00 New York) – ändert sich nur an vollen Stunden, darum pro Stunde einmal rechnen
  let altH = -1, altTag = 0;
  for (let i = 0; i < n; i++) {
    const hh = basis.t[i] - (basis.t[i] % 3600);
    if (hh !== altH) { altH = hh; altTag = sessionTag(hh * 1000, e); }
    basis.sd[i] = altTag;
  }
  return basis;
}

// Kerzen eines Zeitrahmens aus den Basis-Kerzen. Je Kerze: Start-Sekunde, erster und letzter Basis-Index, OHLC, Handelstag.
// Eine Kerze ist erst nach ihrem letzten Basis-Index bekannt (Signal frühestens dort, Einstieg ab dem nächsten Basis-Index).
export function zeitrahmen(basis, tf) {
  if (basis.cache.has(tf)) return basis.cache.get(tf);
  const { n, t, o, h, l, c, sd, e } = basis;
  const sek = TF_SEK[tf];
  let schluessel;
  if (sek) schluessel = (i) => Math.floor(t[i] / Math.max(sek, basis.res));
  else { const kf = keyFn(tf, e); let altTag = null, k = 0; schluessel = (i) => { if (sd[i] !== altTag) { altTag = sd[i]; k = kf(altTag); } return k; }; }
  const T = [], S = [], E = [], O = [], H = [], L = [], C = [], SD = [];
  let letzter = null;
  for (let i = 0; i < n; i++) {
    const k = schluessel(i);
    if (k === letzter) {
      const j = H.length - 1;
      if (h[i] > H[j]) H[j] = h[i];
      if (l[i] < L[j]) L[j] = l[i];
      C[j] = c[i]; E[j] = i;
    } else {
      letzter = k;
      T.push(t[i]); S.push(i); E.push(i); O.push(o[i]); H.push(h[i]); L.push(l[i]); C.push(c[i]); SD.push(sd[i]);
    }
  }
  const z = { tf, n: T.length, t: Int32Array.from(T), s: Int32Array.from(S), en: Int32Array.from(E), o: Float64Array.from(O), h: Float64Array.from(H), l: Float64Array.from(L), c: Float64Array.from(C), sd: Int32Array.from(SD) };
  // Ist der gewählte Zeitrahmen feiner als die Daten, gilt die Daten-Auflösung (wird im Ergebnis ausgewiesen)
  z.echt = !sek || sek >= basis.res;
  basis.cache.set(tf, z);
  return z;
}

// Stundenkerzen im Format von trading.mjs (für linienFinden). Zusätzlich je Stunde der Bereich in den Basis-Kerzen.
export function stundenFuerGva(basis) {
  if (basis.cache.has('gva-d')) return basis.cache.get('gva-d');
  const z = zeitrahmen(basis, '1H');
  const d = { t: new Array(z.n), o: Array.from(z.o), h: Array.from(z.h), l: Array.from(z.l), c: Array.from(z.c), sd: Array.from(z.sd), quelle: new Array(z.n).fill(1), s: z.s, en: z.en };
  for (let k = 0; k < z.n; k++) d.t[k] = z.t[k] * 1000;
  basis.cache.set('gva-d', d);
  return d;
}

// Handelstag-Nummer (durchgehend gezählt) – für Zeitfenster in Handelstagen
const htCache = new Map();
export function handelstagNr(tag, e) {
  const k = tag * 2 + (e.feiertageAus ? 1 : 0);
  let v = htCache.get(k);
  if (v === undefined) { v = handelstageVor(tag, e); if (htCache.size > 200_000) htCache.clear(); htCache.set(k, v); }
  return v;
}

// Erster Basis-Index mit t >= sek (binäre Suche)
export function indexAb(basis, sek) {
  let lo = 0, hi = basis.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (basis.t[m] < sek) lo = m + 1; else hi = m; }
  return lo;
}
