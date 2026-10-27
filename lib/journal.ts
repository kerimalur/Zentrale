// Trading-Journal: Typen und alle Rechnungen (R, Kennzahlen, Drawdown, Serien, Monte Carlo).
// Grundsatz: Alles wird in R gerechnet (1 R = Anfangsrisiko des Trades), EUR kommt zusätzlich dazu.

export type JArt = 'live' | 'backtest';
export type JRichtung = 'long' | 'short';

export interface JTrade {
  id: string;
  art: JArt;
  pair: string;
  richtung: JRichtung;
  eroeffnet: string; // JJJJ-MM-TT oder JJJJ-MM-TTTHH:mm
  geschlossen: string | null;
  entry: number | null; // leer nur bei importierten Backtests, die nur R kennen
  sl: number | null; // Stop-Loss beim Einstieg (Anfangsrisiko)
  tp: number | null;
  exit: number | null; // Ausstiegskurs (bei Teilschliessungen Ø oder leer lassen und EUR eintragen)
  lots: number | null;
  risikoEur: number | null; // Anfangsrisiko in EUR
  ergebnisEur: number | null; // realisierter Gewinn/Verlust in EUR (inkl. Kosten)
  rManuell: number | null; // R von Hand, falls weder EUR noch Ausstieg passt
  tf: '3D' | 'W' | 'M' | null;
  gvaLevel: number | null;
  gefuehl: number | null; // 1–5
  tags: string[];
  fehler: string[];
  notiz: string;
  bild: string;
  bilder?: string[]; // Screenshots auf dem Pi (Backtest-Session)
  session?: string | null; // Backtest-Session
  checks: Record<string, boolean>;
  erstellt: number;
  geaendert: number;
}

export interface JEinstellungen {
  startkapital: number;
  waehrung: 'EUR';
  beSchwelle: number;
  risikoProzent: number;
  checkliste: string[];
}

export interface JournalZustand {
  trades: JTrade[];
  einstellungen: JEinstellungen;
  umrechnung: Record<string, number | null>; // 1 Einheit Quote-Währung = x EUR
  paare: string[];
}

// ---------- Ein Trade ----------
export const geplantesRR = (t: Pick<JTrade, 'entry' | 'sl' | 'tp'>) => (t.tp === null || t.entry === null || t.sl === null ? null : (t.tp - t.entry) / (t.entry - t.sl));
// Für Long und Short gleich: Nenner (entry − sl) ist bei Short negativ, Gewinn (exit − entry) dann auch.
export const rAusKurs = (t: Pick<JTrade, 'entry' | 'sl'>, exit: number) => (t.entry === null || t.sl === null ? null : (exit - t.entry) / (t.entry - t.sl));

export type RQuelle = 'eur' | 'manuell' | 'kurs' | null;
export function rVon(t: JTrade): { r: number | null; quelle: RQuelle } {
  if (t.ergebnisEur !== null && t.risikoEur && t.risikoEur > 0) return { r: t.ergebnisEur / t.risikoEur, quelle: 'eur' };
  if (t.rManuell !== null) return { r: t.rManuell, quelle: 'manuell' };
  if (t.exit !== null) { const r = rAusKurs(t, t.exit); if (r !== null) return { r, quelle: 'kurs' }; }
  return { r: null, quelle: null };
}
export const istGeschlossen = (t: JTrade) => rVon(t).r !== null;
export function eurVon(t: JTrade): number | null {
  if (t.ergebnisEur !== null) return t.ergebnisEur;
  const { r } = rVon(t);
  return r !== null && t.risikoEur ? r * t.risikoEur : null;
}

// Pip-Grösse und Risiko in EUR aus Lots und Stop-Abstand (1 Lot = 100'000 Einheiten der Basiswährung).
export const pipGroesse = (pair: string) => (pair.endsWith('JPY') ? 0.01 : 0.0001);
export function risikoEurBerechnen(pair: string, entry: number, sl: number, lots: number, umrechnung: Record<string, number | null>): number | null {
  const kurs = umrechnung[pair.slice(3)];
  if (!kurs || !(lots > 0)) return null;
  return Math.abs(entry - sl) * lots * 100_000 * kurs;
}
export function lotsBerechnen(pair: string, entry: number, sl: number, risikoEur: number, umrechnung: Record<string, number | null>): number | null {
  const kurs = umrechnung[pair.slice(3)];
  const abstand = Math.abs(entry - sl);
  if (!kurs || !(abstand > 0) || !(risikoEur > 0)) return null;
  return risikoEur / (abstand * 100_000 * kurs);
}

// ---------- Kennzahlen ----------
export interface JGeschlossen { t: JTrade; r: number; eur: number | null; datum: string }

export function geschlosseneTrades(trades: JTrade[]): JGeschlossen[] {
  return trades
    .map((t) => ({ t, r: rVon(t).r, eur: eurVon(t), datum: (t.geschlossen || t.eroeffnet).slice(0, 10) }))
    .filter((x): x is JGeschlossen => x.r !== null)
    .sort((a, b) => ((a.t.geschlossen || a.t.eroeffnet) < (b.t.geschlossen || b.t.eroeffnet) ? -1 : 1));
}

export interface JKennzahlen {
  n: number;
  gewinner: number;
  verlierer: number;
  be: number;
  trefferquote: number | null; // Gewinner / (Gewinner + Verlierer)
  trefferBereich: [number, number] | null; // 95 % (Wilson)
  schnittGewinn: number | null;
  schnittVerlust: number | null; // negativ
  erwartung: number | null; // Ø R pro Trade
  erwartungBereich: [number, number] | null; // 95 %
  streuung: number | null;
  profitFaktor: number | null;
  summeR: number;
  summeEur: number;
  eurVollstaendig: boolean;
  maxDdR: number; // positiv, in R
  maxDdProzent: number | null; // vom Höchststand der EUR-Kapitalkurve
  verlustSerie: number;
  gewinnSerie: number;
  sqn: number | null;
  geplantRR: number | null; // Ø geplantes RR (Trades mit TP)
  gewinnerHolen: number | null; // Ø R der Gewinner
  kurve: { datum: string; r: number; eur: number | null }[]; // kumuliert
}

const mittel = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function std(a: number[]) {
  if (a.length < 2) return null;
  const m = mittel(a)!;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
// Wilson-Intervall: bei kleinen Stichproben ehrlicher als p ± 1,96·√(p(1−p)/n).
export function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (n === 0) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const mitte = (p + (z * z) / (2 * n)) / d;
  const rand = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mitte - rand), Math.min(1, mitte + rand)];
}
// 97,5-%-Quantil der t-Verteilung (für den Bereich des Erwartungswerts bei kleinem n).
function tQuantil(df: number) {
  const tab = [12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];
  if (df < 1) return Infinity;
  if (df <= 20) return tab[df - 1];
  if (df <= 30) return 2.042 + ((30 - df) / 10) * (2.086 - 2.042);
  if (df <= 60) return 2.0 + ((60 - df) / 30) * (2.042 - 2.0);
  if (df <= 120) return 1.98 + ((120 - df) / 60) * (2.0 - 1.98);
  return 1.96;
}

export function kennzahlen(g: JGeschlossen[], e: Pick<JEinstellungen, 'beSchwelle' | 'startkapital'>): JKennzahlen {
  const rs = g.map((x) => x.r);
  const n = rs.length;
  const gew = rs.filter((r) => r > e.beSchwelle);
  const ver = rs.filter((r) => r < -e.beSchwelle);
  const be = n - gew.length - ver.length;
  const entschieden = gew.length + ver.length;
  const m = mittel(rs);
  const s = std(rs);
  const summePos = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const summeNeg = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);

  // Kapitalkurve und Drawdown in R (Start 0) und in EUR (Start = Startkapital)
  let kumR = 0, spitzeR = 0, maxDdR = 0;
  let kumEur = 0, eurVollstaendig = true;
  let kapital = e.startkapital, spitzeK = e.startkapital, maxDdP = 0;
  const kurve: JKennzahlen['kurve'] = [];
  let serieV = 0, serieG = 0, maxV = 0, maxG = 0;
  for (const x of g) {
    kumR += x.r;
    spitzeR = Math.max(spitzeR, kumR);
    maxDdR = Math.max(maxDdR, spitzeR - kumR);
    if (x.eur === null) eurVollstaendig = false;
    else {
      kumEur += x.eur;
      kapital += x.eur;
      spitzeK = Math.max(spitzeK, kapital);
      maxDdP = Math.max(maxDdP, spitzeK > 0 ? (spitzeK - kapital) / spitzeK : 0);
    }
    kurve.push({ datum: x.datum, r: kumR, eur: x.eur === null ? null : kumEur });
    if (x.r < -e.beSchwelle) { serieV++; serieG = 0; } else if (x.r > e.beSchwelle) { serieG++; serieV = 0; }
    maxV = Math.max(maxV, serieV); maxG = Math.max(maxG, serieG);
  }

  const mitTp = g.map((x) => geplantesRR(x.t)).filter((v): v is number => v !== null && v > 0);
  const tq = n >= 2 && s !== null && m !== null ? tQuantil(n - 1) * (s / Math.sqrt(n)) : null;
  return {
    n,
    gewinner: gew.length,
    verlierer: ver.length,
    be,
    trefferquote: entschieden ? gew.length / entschieden : null,
    trefferBereich: wilson(gew.length, entschieden),
    schnittGewinn: mittel(gew),
    schnittVerlust: mittel(ver),
    erwartung: m,
    erwartungBereich: tq !== null && m !== null ? [m - tq, m + tq] : null,
    streuung: s,
    profitFaktor: summeNeg > 0 ? summePos / summeNeg : summePos > 0 ? Infinity : null,
    summeR: kumR,
    summeEur: kumEur,
    eurVollstaendig,
    maxDdR,
    maxDdProzent: g.some((x) => x.eur !== null) ? maxDdP : null,
    verlustSerie: maxV,
    gewinnSerie: maxG,
    // SQN nach Van Tharp: √n · Ø R / Streuung, n höchstens 100
    sqn: m !== null && s && n >= 2 ? (Math.sqrt(Math.min(n, 100)) * m) / s : null,
    geplantRR: mittel(mitTp),
    gewinnerHolen: mittel(gew),
    kurve,
  };
}

// Aufschlüsselung nach einem Merkmal (Paar, Richtung, Zeitrahmen, Wochentag …)
export interface JGruppe { schluessel: string; n: number; summeR: number; erwartung: number; trefferquote: number | null }
export function gruppieren(g: JGeschlossen[], fn: (x: JGeschlossen) => string | null, beSchwelle: number): JGruppe[] {
  const m = new Map<string, number[]>();
  for (const x of g) { const k = fn(x); if (k === null) continue; const a = m.get(k) || []; a.push(x.r); m.set(k, a); }
  return [...m.entries()].map(([schluessel, rs]) => {
    const gw = rs.filter((r) => r > beSchwelle).length, vl = rs.filter((r) => r < -beSchwelle).length;
    return { schluessel, n: rs.length, summeR: rs.reduce((a, b) => a + b, 0), erwartung: rs.reduce((a, b) => a + b, 0) / rs.length, trefferquote: gw + vl ? gw / (gw + vl) : null };
  }).sort((a, b) => b.summeR - a.summeR);
}
export const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const wochentag = (iso: string) => WOCHENTAGE[new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay()];

// Verteilung der R-Werte in Schritten von 0,5 R (Ränder zusammengefasst)
export function verteilung(rs: number[]): { von: number; bis: number; n: number }[] {
  const kl = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
  const out = [{ von: -Infinity, bis: kl[0], n: 0 }];
  for (let i = 0; i < kl.length - 1; i++) out.push({ von: kl[i], bis: kl[i + 1], n: 0 });
  out.push({ von: kl[kl.length - 1], bis: Infinity, n: 0 });
  for (const r of rs) { const b = out.find((x) => r >= x.von && r < x.bis); if (b) b.n++; }
  return out;
}

// Backtest gegen live: Liegt der Unterschied der Erwartungswerte noch im Rahmen des Zufalls? (Welch, z-Näherung)
export function vergleich(a: number[], b: number[]): { diff: number; z: number; imRahmen: boolean } | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mittel(a)!, mb = mittel(b)!, sa = std(a)!, sb = std(b)!;
  const se = Math.sqrt((sa * sa) / a.length + (sb * sb) / b.length);
  const z = se > 0 ? (ma - mb) / se : 0;
  return { diff: ma - mb, z, imRahmen: Math.abs(z) < 1.96 };
}

// ---------- Monte Carlo ----------
// Zieht aus deinen echten R-Werten zufällig (mit Zurücklegen) die nächsten N Trades, viele Male.
// Kapital wächst multiplikativ: jeder Trade verändert das Konto um R × Risiko %.
export interface JMonteCarlo {
  laeufe: number;
  trades: number;
  risiko: number;
  ddP: { p50: number; p90: number; p95: number; p99: number };
  ergebnisP: { p5: number; p50: number; p95: number };
  chanceDd: { grenze: number; p: number }[];
  chanceVerlust: number;
}
function zufall(seed: number) { // reproduzierbar, damit sich die Zahlen beim Neuladen nicht ändern
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const quantil = (sortiert: number[], q: number) => sortiert[Math.min(sortiert.length - 1, Math.max(0, Math.floor(q * sortiert.length)))];
export function monteCarlo(rs: number[], risikoProzent: number, trades = 100, laeufe = 5000, grenzen = [5, 10, 20]): JMonteCarlo | null {
  if (rs.length < 10) return null;
  const rnd = zufall(rs.length * 7919 + Math.round(rs.reduce((a, b) => a + b, 0) * 1000));
  const risiko = risikoProzent / 100;
  const dds: number[] = [], endw: number[] = [];
  for (let l = 0; l < laeufe; l++) {
    let k = 1, spitze = 1, dd = 0;
    for (let i = 0; i < trades; i++) {
      k *= Math.max(0, 1 + rs[Math.floor(rnd() * rs.length)] * risiko);
      if (k > spitze) spitze = k;
      dd = Math.max(dd, (spitze - k) / spitze);
    }
    dds.push(dd * 100);
    endw.push((k - 1) * 100);
  }
  dds.sort((a, b) => a - b);
  endw.sort((a, b) => a - b);
  return {
    laeufe, trades, risiko: risikoProzent,
    ddP: { p50: quantil(dds, 0.5), p90: quantil(dds, 0.9), p95: quantil(dds, 0.95), p99: quantil(dds, 0.99) },
    ergebnisP: { p5: quantil(endw, 0.05), p50: quantil(endw, 0.5), p95: quantil(endw, 0.95) },
    chanceDd: grenzen.map((g) => ({ grenze: g, p: dds.filter((x) => x >= g).length / laeufe })),
    chanceVerlust: endw.filter((x) => x < 0).length / laeufe,
  };
}

// ---------- Formatierung ----------
export const rText = (r: number | null | undefined, stellen = 2) => (r === null || r === undefined || !Number.isFinite(r) ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(stellen).replace('.', ',')} R`);
export const eurText = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
export const prozent = (x: number | null | undefined, stellen = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(stellen).replace('.', ',')} %`);
