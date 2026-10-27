// GVA-Statistik: Was passiert, wenn eine GVA-Linie das erste Mal getroffen wird?
// Ereignis = erster gültiger Treffer (nach Nachbar-Filter) einer Linie auf 3D, W oder M, seit 2004 für alle 28 Paare.
// Ergebnis eines Ereignisses (alles in ATR, frei einstellbar):
//   Erfolg          – der Preis läuft «reaktion» ATR in Umkehrrichtung, bevor er «durchstich» ATR durch die Linie geht
//   Durchgeschossen – zuerst mehr als «durchstich» ATR durch die Linie
//   Keine Reaktion  – innerhalb von «fenster» Handelstagen weder das eine noch das andere (Konsolidieren um die Linie)
//   Unklar          – beides in derselben Kerze (bei Tageskerzen vor ~2 Jahren möglich) → zählt vorsichtig als nicht erfolgreich
// In der Treffer-Kerze selbst zählt nur der Durchstich: ob der Preis davor schon höher war, weiss man nicht.
// Zufallsvergleich: dieselbe Regel an zufälligen Levels desselben Paars, die genau wie eine GVA zum ersten Mal von der richtigen Seite
// berührt werden (Kerze davor lag noch ganz auf der anderen Seite).
import { db, save } from './store.mjs';
import { PAARE, TFS, linienFinden, tradingDaten, tradingStand, tradingEinstellungen, pipVon, _intern } from './trading.mjs';

const { kerzenBauen, atrReihe, handelstageVor, tagIso } = _intern;
const TAG = 86_400_000;
const STUNDE = 3_600_000;

export const STAT_STANDARD = { reaktion: 1, durchstich: 0.5, fenster: 2, atrBasis: 'tag', splitJahr: 2019 };
const KONFLUENZ_ATR = 0.3; // andere offene Linie (gleiche Seite) näher als 0,3 Tages-ATR

function statEinst() {
  const d = db();
  d.trading ||= {};
  d.trading.statistik = { ...STAT_STANDARD, ...(d.trading.statistik || {}) };
  return d.trading.statistik;
}

// ---------- Ereignisse aufbauen (pro Paar zwischengespeichert, bis sich Kurse oder Regeln ändern) ----------
const cache = new Map(); // pair -> { stand, ereignisse }

function zuerichStunde(ms) {
  const h = Number(new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false }).format(new Date(ms)));
  return h === 24 ? 0 : h;
}
const sitzungVon = (h) => (h < 8 ? 'Asien' : h < 14 ? 'London' : h < 17 ? 'London + NY' : h < 22 ? 'New York' : 'Abend');

function ereignissePaar(pair) {
  const d = tradingDaten(pair);
  if (!d || d.t.length < 50) return [];
  const stand = `${tradingStand()}|${d.t.length}|${d.t[d.t.length - 1]}`;
  const c = cache.get(pair);
  if (c && c.stand === stand) return c.ereignisse;

  const e = tradingEinstellungen();
  const linien = linienFinden(pair, d, e, TFS);
  const tage = kerzenBauen(d, 'D', e).kerzen;
  const atrD = atrReihe(tage, 14);
  // Tages-Index pro Kerze (für ATR/SMA ohne Blick in die Zukunft) und SMA 200 der Tagesschlusskurse
  const tagIndex = new Map(tage.map((k, i) => [k.tag, i]));
  const sma = new Array(tage.length).fill(null);
  let summe = 0;
  for (let i = 0; i < tage.length; i++) {
    summe += tage[i].c;
    if (i >= 200) summe -= tage[i - 200].c;
    if (i >= 199) sma[i] = summe / 200;
  }
  const htIdx = (tag) => handelstageVor(tag, e);

  const ereignisse = [];
  for (const l of linien) {
    if (l.status !== 'treffer') continue;
    const j = l.j;
    const tag = d.sd[j];
    const ti = tagIndex.get(tag);
    if (ti === undefined || ti < 1) continue;
    const atrTag = atrD[ti - 1];
    if (!atrTag || !l.atrB) continue;
    const vorher = tage[ti - 1];
    const trend = sma[ti - 1] === null ? null : (vorher.c > sma[ti - 1]) === (l.seite === 'long') ? 'mit' : 'gegen';
    // Konfluenz: eine andere Linie derselben Seite war im Moment des Treffers offen und lag in der Nähe.
    const konfluenz = linien.some((o) => o !== l && o.seite === l.seite && o.B.e < j && (o.j === -1 || o.j >= j) && Math.abs(o.lvlRoh - l.lvlRoh) <= KONFLUENZ_ATR * atrTag);
    const stundengenau = d.quelle[j] === 1;
    ereignisse.push({
      id: l.id, pair, tf: l.tf, seite: l.seite, lvl: l.lvl, lvlRoh: l.lvlRoh, entstanden: l.entstanden,
      t: d.t[j], tag, jahr: new Date(tag * TAG).getUTCFullYear(), j, htStart: htIdx(tag),
      atrTag, atrTf: l.atrB, alterTage: tag - l.B.tag, trend, konfluenz, stundengenau,
      sitzung: stundengenau ? sitzungVon(zuerichStunde(d.t[j])) : null,
      verhaeltnis: l.verhaeltnis, passung: l.passung, bildungA: l.A.tag, bildungB: l.B.tag,
    });
  }
  cache.set(pair, { stand, ereignisse });
  return ereignisse;
}

// ---------- Ergebnis eines Ereignisses für bestimmte Parameter ----------
// Was kommt zuerst: Reaktion oder Durchstich? Beobachtet wird bis zu MAX_TAGE Handelstage.
// erfolg = Reaktion innerhalb des Zeitfensters · spaet = Reaktion erst danach (aber vor dem Durchstich)
// durch = zuerst Durchstich · keine = nach MAX_TAGE weder noch · unklar = beides in derselben Kerze · offen = Daten reichen noch nicht
export const MAX_TAGE = 30;
function bewerten(d, start, lvl, long, atr, p, htStart, e) {
  const X = p.reaktion * atr, Y = p.durchstich * atr;
  let maxAdv = 0, maxFav = 0;
  for (let k = start; k < d.t.length; k++) {
    const tage = htIdxCache(d.sd[k], e) - htStart;
    if (tage > MAX_TAGE) return { art: 'keine', maxAdv, maxFav, dauer: null, tage: null, ende: k - 1 };
    const adv = long ? lvl - d.l[k] : d.h[k] - lvl;
    const fav = long ? d.h[k] - lvl : lvl - d.l[k];
    const durch = adv > Y;
    const reakt = k > start && fav >= X;
    const dauer = (d.t[k] - d.t[start]) / STUNDE;
    if (durch && reakt) return { art: 'unklar', maxAdv: Math.max(maxAdv, adv), maxFav: Math.max(maxFav, fav), dauer, tage, ende: k };
    if (durch) return { art: 'durch', maxAdv: adv, maxFav, dauer, tage, ende: k };
    if (reakt) return { art: tage <= p.fenster ? 'erfolg' : 'spaet', maxAdv, maxFav: fav, dauer, tage, ende: k };
    maxAdv = Math.max(maxAdv, adv);
    if (k > start) maxFav = Math.max(maxFav, fav);
  }
  return { art: 'offen', maxAdv, maxFav, dauer: null, tage: null, ende: d.t.length - 1 }; // jüngste Treffer: noch nicht entschieden
}
const htCache = new Map();
function htIdxCache(tag, e) {
  const k = `${e.feiertageAus}|${tag}`;
  let v = htCache.get(k);
  if (v === undefined) { v = handelstageVor(tag, e); if (htCache.size > 100_000) htCache.clear(); htCache.set(k, v); }
  return v;
}

// Einheit, in der Reaktion und Durchstich gemessen werden: Tages-ATR, ATR der Linie oder 1 Pip.
const einheit = (p, ev) => (p.atrBasis === 'tf' ? ev.atrTf : p.atrBasis === 'pips' ? pipVon(ev.pair) : ev.atrTag);

// Kleiner, reproduzierbarer Zufall (gleiche Zahlen bei jedem Aufruf)
function zufall(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const mitte = (p + (z * z) / (2 * n)) / d;
  const rand = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mitte - rand), Math.min(1, mitte + rand)];
}
const quantil = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))] : null);
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

// ---------- Filter ----------
function passt(ev, f) {
  if (f.tfs?.length && !f.tfs.includes(ev.tf)) return false;
  if (f.seite && f.seite !== 'beide' && ev.seite !== f.seite) return false;
  if (f.paare?.length && !f.paare.includes(ev.pair)) return false;
  if (f.waehrung && !ev.pair.includes(f.waehrung)) return false;
  if (f.vonJahr && ev.jahr < f.vonJahr) return false;
  if (f.bisJahr && ev.jahr > f.bisJahr) return false;
  if (f.alterMin && ev.alterTage < f.alterMin) return false;
  if (f.alterMax && ev.alterTage > f.alterMax) return false;
  if (f.konfluenz === 'mit' && !ev.konfluenz) return false;
  if (f.konfluenz === 'ohne' && ev.konfluenz) return false;
  if (f.trend === 'mit' && ev.trend !== 'mit') return false;
  if (f.trend === 'gegen' && ev.trend !== 'gegen') return false;
  if (f.sitzung && f.sitzung !== 'alle' && ev.sitzung !== f.sitzung) return false;
  if (f.nurStunden && !ev.stundengenau) return false;
  return true;
}

function parameter(b) {
  const s = statEinst();
  const z = (v, min, max, fb) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fb; };
  return {
    reaktion: z(b.reaktion ?? s.reaktion, 0.1, 1000, s.reaktion),
    durchstich: z(b.durchstich ?? s.durchstich, 0, 1000, s.durchstich),
    fenster: Math.round(z(b.fenster ?? s.fenster, 1, 20, s.fenster)),
    atrBasis: ['tf', 'pips'].includes(b.atrBasis ?? s.atrBasis) ? (b.atrBasis ?? s.atrBasis) : 'tag',
    splitJahr: Math.round(z(b.splitJahr ?? s.splitJahr, 2005, 2030, s.splitJahr)),
  };
}

const ALTER = [[0, 7, '< 1 Woche'], [7, 30, '1–4 Wochen'], [30, 90, '1–3 Monate'], [90, 365, '3–12 Monate'], [365, 1e9, '> 1 Jahr']];
const alterGruppe = (t) => ALTER.find(([a, b]) => t >= a && t < b)[2];

// ---------- Hauptrechnung ----------
export function statistik(b = {}) {
  const p = parameter(b);
  const f = b.filter || {};
  const e = tradingEinstellungen();
  const alle = [];
  const fehlend = [];
  for (const pair of PAARE) {
    const evs = ereignissePaar(pair);
    if (!evs.length && !tradingDaten(pair)) fehlend.push(pair);
    for (const ev of evs) if (passt(ev, f)) alle.push(ev);
  }

  const rnd = zufall(4242);
  const ausgewertet = [];
  const zufallErg = { n: 0, erfolg: 0 };
  for (const ev of alle) {
    const d = tradingDaten(ev.pair);
    const long = ev.seite === 'long';
    const atr = einheit(p, ev);
    const r = bewerten(d, ev.j, ev.lvlRoh, long, atr, p, ev.htStart, e);
    if (r.art === 'offen') continue;
    ausgewertet.push({ ev, r, atr });
    // Zufallsvergleich: bis zu 4 zufällige Kerzen aus derselben Datenart (Stunde/Tag) im Umkreis von ±2 Jahren
    for (let z = 0; z < 4; z++) {
      const breite = ev.stundengenau ? 24 * 260 * 2 : 260 * 2;
      const k = Math.floor(ev.j - breite + rnd() * 2 * breite);
      if (k < 1 || k >= d.t.length - 1 || d.quelle[k] !== d.quelle[ev.j]) continue;
      // Wie bei einer GVA: Das Level wird in Kerze k zum ersten Mal von der richtigen Seite berührt
      // (Kerze davor lag noch ganz darüber bzw. darunter). Level zufällig zwischen den beiden Extremen.
      const u = rnd();
      if (long ? !(d.l[k - 1] > d.l[k]) : !(d.h[k - 1] < d.h[k])) continue;
      const lvlZ = long ? d.l[k] + u * (d.l[k - 1] - d.l[k]) : d.h[k] - u * (d.h[k] - d.h[k - 1]);
      const rz = bewerten(d, k, lvlZ, long, atr, p, htIdxCache(d.sd[k], e), e);
      if (rz.art === 'offen') continue;
      zufallErg.n++;
      if (rz.art === 'erfolg') zufallErg.erfolg++;
    }
  }

  const n = ausgewertet.length;
  const zaehle = (art) => ausgewertet.filter((x) => x.r.art === art).length;
  const erfolg = zaehle('erfolg');
  const erfolge = ausgewertet.filter((x) => x.r.art === 'erfolg');
  // Durchstich vor der Reaktion (bei Erfolgen) in ATR → Stop-Abstand
  const durchst = erfolge.map((x) => x.r.maxAdv / x.atr).sort((a, b) => a - b);
  const hist = [];
  const stufe = Math.max(0.05, Math.round((p.durchstich / 10) * 100) / 100 || 0.05);
  for (let v = 0; v <= p.durchstich + 1e-9; v += stufe) hist.push({ von: r2(v), bis: r2(v + stufe), n: 0 });
  for (const v of durchst) { const h = hist.find((x) => v >= x.von && v < x.bis) || hist[hist.length - 1]; h.n++; }
  const dauern = erfolge.map((x) => x.r.dauer).filter((x) => x !== null).sort((a, b) => a - b);
  const mfe = ausgewertet.map((x) => x.r.maxFav / x.atr).sort((a, b) => a - b);

  // Fächer: Tagesschluss 0–10 Handelstage nach dem Treffer, in ATR in Umkehrrichtung (+ = Reaktion)
  const faecher = [];
  const tageCache = new Map();
  const tagReihe = (pair) => {
    if (!tageCache.has(pair)) { const k = kerzenBauen(tradingDaten(pair), 'D', e).kerzen; tageCache.set(pair, { k, idx: new Map(k.map((x, i) => [x.tag, i])) }); }
    return tageCache.get(pair);
  };
  const reihen = Array.from({ length: 11 }, () => []);
  for (const { ev, atr } of ausgewertet) {
    const { k, idx } = tagReihe(ev.pair);
    const i0 = idx.get(ev.tag);
    if (i0 === undefined) continue;
    for (let o = 0; o <= 10 && i0 + o < k.length; o++) reihen[o].push(((k[i0 + o].c - ev.lvlRoh) * (ev.seite === 'long' ? 1 : -1)) / atr);
  }
  reihen.forEach((r, o) => {
    r.sort((a, b) => a - b);
    if (r.length >= 5) faecher.push({ tag: o, p10: r2(quantil(r, 0.1)), p25: r2(quantil(r, 0.25)), p50: r2(quantil(r, 0.5)), p75: r2(quantil(r, 0.75)), p90: r2(quantil(r, 0.9)), n: r.length });
  });

  // Aufschlüsselungen
  const gruppe = (fn, sortierung) => {
    const m = new Map();
    for (const x of ausgewertet) { const key = fn(x.ev); if (key === null || key === undefined) continue; const g = m.get(key) || { n: 0, erfolg: 0 }; g.n++; if (x.r.art === 'erfolg') g.erfolg++; m.set(key, g); }
    const out = [...m.entries()].map(([schluessel, g]) => ({ schluessel: String(schluessel), n: g.n, quote: g.erfolg / g.n, bereich: wilson(g.erfolg, g.n) }));
    return sortierung ? out.sort(sortierung) : out.sort((a, b) => b.n - a.n);
  };
  const nachSchluessel = (a, b) => (a.schluessel < b.schluessel ? -1 : 1);
  const vorher = ausgewertet.filter((x) => x.ev.jahr < p.splitJahr), nachher = ausgewertet.filter((x) => x.ev.jahr >= p.splitJahr);
  const quoteVon = (arr) => ({ n: arr.length, quote: arr.length ? arr.filter((x) => x.r.art === 'erfolg').length / arr.length : null, bereich: wilson(arr.filter((x) => x.r.art === 'erfolg').length, arr.length) });

  const pip = (pair) => pipVon(pair);
  const L = b.liste || {};
  const ab = Math.max(0, Math.round(Number(L.ab) || 0));
  const SORT = { neu: (a, c) => c.ev.t - a.ev.t, alt: (a, c) => a.ev.t - c.ev.t, reaktion: (a, c) => c.r.maxFav / c.atr - a.r.maxFav / a.atr, durchstich: (a, c) => c.r.maxAdv / c.atr - a.r.maxAdv / a.atr };
  const liste = ausgewertet.filter((x) => !L.art || L.art === 'alle' || x.r.art === L.art).sort(SORT[L.sortierung] || SORT.neu);
  return {
    parameter: p,
    standard: statEinst(),
    filterAnzahl: Object.values(f).filter((v) => v !== undefined && v !== null && v !== '' && v !== 'alle' && v !== 'beide' && !(Array.isArray(v) && !v.length) && v !== false).length,
    n,
    gesamtEreignisse: alle.length,
    fehlend,
    ergebnis: { erfolg, spaet: zaehle('spaet'), durch: zaehle('durch'), keine: zaehle('keine'), unklar: zaehle('unklar') },
    irgendwann: n ? (erfolg + zaehle('spaet')) / n : null,
    maxTage: MAX_TAGE,
    quote: n ? erfolg / n : null,
    bereich: wilson(erfolg, n),
    zufall: { n: zufallErg.n, quote: zufallErg.n ? zufallErg.erfolg / zufallErg.n : null, bereich: wilson(zufallErg.erfolg, zufallErg.n) },
    durchstich: { p50: r2(quantil(durchst, 0.5)), p80: r2(quantil(durchst, 0.8)), p90: r2(quantil(durchst, 0.9)), hist },
    reaktionMedian: r2(quantil(mfe, 0.5)),
    dauerMedianStunden: dauern.length ? Math.round(quantil(dauern, 0.5)) : null,
    faecher,
    gruppen: {
      tf: gruppe((ev) => ev.tf, (a, b) => TFS.indexOf(a.schluessel) - TFS.indexOf(b.schluessel)),
      seite: gruppe((ev) => (ev.seite === 'long' ? 'Long' : 'Short')),
      pair: gruppe((ev) => ev.pair),
      jahr: gruppe((ev) => ev.jahr, nachSchluessel),
      alter: gruppe((ev) => alterGruppe(ev.alterTage), (a, b) => ALTER.findIndex((x) => x[2] === a.schluessel) - ALTER.findIndex((x) => x[2] === b.schluessel)),
      konfluenz: gruppe((ev) => (ev.konfluenz ? 'mit Konfluenz' : 'ohne Konfluenz')),
      trend: gruppe((ev) => (ev.trend === null ? null : ev.trend === 'mit' ? 'mit dem Trend' : 'gegen den Trend')),
      sitzung: gruppe((ev) => ev.sitzung),
      wochentag: gruppe((ev) => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(ev.tag * TAG).getUTCDay()], (a, b) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].indexOf(a.schluessel) - ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].indexOf(b.schluessel)),
    },
    oos: { vorher: quoteVon(vorher), nachher: quoteVon(nachher) },
    ereignisseGesamt: liste.length,
    ereignisse: liste.slice(ab, ab + 50).map(({ ev, r, atr }) => ({
      id: ev.id, pair: ev.pair, tf: ev.tf, seite: ev.seite, lvl: ev.lvl, entstanden: ev.entstanden, t: ev.t, art: r.art,
      durchstich: r2(r.maxAdv / atr), reaktion: r2(r.maxFav / atr), dauer: r.dauer === null ? null : Math.round(r.dauer), tage: r.tage,
      pips: Math.round(atr / pip(ev.pair)), stundengenau: ev.stundengenau, konfluenz: ev.konfluenz, trend: ev.trend,
    })),
  };
}

export function statistikStandardSetzen(b) {
  const p = parameter(b);
  db().trading.statistik = p;
  save();
  return p;
}

// ---------- Beispiel: ein Ereignis zum Anschauen ----------
export function beispiel(id, b = {}) {
  const pair = String(id || '').split('|')[0];
  if (!PAARE.includes(pair)) return null;
  const ev = ereignissePaar(pair).find((x) => x.id === id);
  if (!ev) return null;
  const p = parameter(b);
  const e = tradingEinstellungen();
  const d = tradingDaten(pair);
  const long = ev.seite === 'long';
  const atr = einheit(p, ev);
  const r = bewerten(d, ev.j, ev.lvlRoh, long, atr, p, ev.htStart, e);
  // Kerzen des Linien-Zeitrahmens rund um Bildung und Treffer
  const { kerzen } = kerzenBauen(d, ev.tf, e);
  const iB = kerzen.findIndex((k) => k.tag === ev.bildungB);
  const iT = kerzen.findIndex((k) => k.s <= ev.j && k.e >= ev.j);
  const htf = kerzen.slice(Math.max(0, iB - 12), Math.min(kerzen.length, Math.max(iT, iB) + 6)).map((k) => ({ tag: tagIso(k.tag), o: k.o, h: k.h, l: k.l, c: k.c }));
  // Verlauf nach dem Treffer: Stundenkerzen (oder Tageskerzen bei alten Ereignissen)
  // Verlauf vom Tag vor dem Treffer bis kurz nach der Entscheidung (bei «keine»: 30 Handelstage)
  const nachlauf = ev.stundengenau ? 24 : 3;
  const ende = Math.min(d.t.length, r.ende + 1 + nachlauf);
  const roh = [];
  for (let k = Math.max(0, ev.j - nachlauf); k < ende; k++) roh.push({ t: d.t[k], o: d.o[k], h: d.h[k], l: d.l[k], c: d.c[k] });
  // Viele Stundenkerzen zu 4-Std-Kerzen zusammenfassen, damit der Chart lesbar bleibt
  const gruppe = roh.length > 260 ? 4 : 1;
  const verlauf = [];
  for (let i = 0; i < roh.length; i += gruppe) {
    const g = roh.slice(i, i + gruppe);
    verlauf.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1].c });
  }
  let fensterEnde = null;
  for (let k = ev.j; k < d.t.length; k++) if (htIdxCache(d.sd[k], e) - ev.htStart > p.fenster) { fensterEnde = d.t[k]; break; }
  const entscheidung = r.art === 'offen' || r.art === 'keine' ? null : d.t[r.ende];
  return {
    ...ev, lvl: ev.lvl, atr, atrPips: Math.round(atr / pipVon(pair)), ergebnis: { ...r, durchstich: r2(r.maxAdv / atr), reaktion: r2(r.maxFav / atr) },
    grenzen: { reaktion: long ? ev.lvlRoh + p.reaktion * atr : ev.lvlRoh - p.reaktion * atr, durchstich: long ? ev.lvlRoh - p.durchstich * atr : ev.lvlRoh + p.durchstich * atr },
    htf, A: tagIso(ev.bildungA), B: tagIso(ev.bildungB), trefferTag: tagIso(ev.tag), verlauf, kerzenStunden: ev.stundengenau ? gruppe : 24,
    fensterEnde, entscheidung, parameter: p, einheitPips: Math.round(atr / pipVon(pair) * 10) / 10,
  };
}
