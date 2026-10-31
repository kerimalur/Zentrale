// Trading-Journal: Typen und alle Rechnungen (Rendite in %, Kennzahlen, Drawdown, Serien, Monte Carlo).
// Live-Trades zählen in Geld (Ergebnis in EUR) und in % vom Kontostand zum Zeitpunkt des Trades (Ein-/Auszahlungen
// werden herausgerechnet, siehe geldAuswertung). R (1 R = Anfangsrisiko) gibt es zusätzlich für Backtests und Trades mit Risiko.

export type JArt = 'live' | 'backtest';
export type JRichtung = 'long' | 'short';
export type JAusgang = 'tp' | 'sl' | 'be' | 'trail' | 'teiltp' | 'skip';
export const AUSGANG_TEXT: Record<JAusgang, string> = { tp: 'Take-Profit', sl: 'Stop-Loss', be: 'Break-Even', trail: 'SL im Profit', teiltp: 'Teil-TP + Break-Even', skip: 'Skip' };

export interface JKonto { id: string; name: string }
export interface JCashflow { id: string; konto: string; datum: string; betrag: number; art: 'einzahlung' | 'auszahlung' } // betrag immer positiv

export interface JTrade {
  id: string;
  art: JArt;
  konto?: string | null; // nur Live-Trades
  ausgang?: JAusgang | null; // wie der Trade endete (automatisch aus dem Vorzeichen, von Hand änderbar)
  pair: string;
  richtung: JRichtung | null; // leer, wenn nicht erfasst
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
  risikoProzent?: number | null; // fester Einsatz pro Trade in % vom Konto (Backtest-Session)
  skipGrund?: string; // nur bei Ausgang «Skip»: warum der Trade nicht genommen wurde
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
  konten: JKonto[];
  cashflows: JCashflow[];
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
// Geschlossen = ein Ergebnis ist da: Geld (Ergebnis in EUR) oder R.
export const istGeschlossen = (t: JTrade) => t.ergebnisEur !== null || rVon(t).r !== null;
export const ausgangAuto = (eur: number): JAusgang => (eur > 0 ? 'tp' : eur < 0 ? 'sl' : 'be');
export const ausgangVon = (t: JTrade): JAusgang | null => t.ausgang ?? (t.ergebnisEur !== null ? ausgangAuto(t.ergebnisEur) : null);
// Gewinner / Verlierer / Break-Even. Break-Even gilt bei Ergebnis genau 0 oder wenn du den Ausgang von Hand auf Break-Even gesetzt hast.
export type JKlasse = 'g' | 'v' | 'be';
export function klasseVon(t: JTrade): JKlasse | null {
  if (t.ergebnisEur === null) return null;
  if (t.ausgang === 'be') return 'be';
  return t.ergebnisEur > 0 ? 'g' : t.ergebnisEur < 0 ? 'v' : 'be';
}
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

// ---------- Geld und Rendite in % (Live-Trades mit Ergebnis in EUR) ----------
// Die Rendite eines Trades ist Ergebnis ÷ Kontostand direkt davor. Der Kontostand enthält alle Einzahlungen und Auszahlungen bis dahin.
// Die Gesamtrendite verkettet die Einzelrenditen (zeitgewichtet): Ein- und Auszahlungen verändern sie nicht.
// Beispiel: 100 € Konto, +10 € = +10 %. Dann 900 € eingezahlt (1010 €), +10 € = +0,99 %. Gesamt: 1,10 × 1,0099 − 1 = +11,09 %.
// Am selben Tag gilt: Einzahlungen zuerst, dann die Trades, dann Auszahlungen.
export interface JPosten { t: JTrade; eur: number; datum: string; klasse: JKlasse; vorher: number | null; prozent: number | null }
export interface JGeld {
  posten: JPosten[]; // im gewählten Zeitraum
  alle: JPosten[]; // gesamte Chronologie (für die Prozent je Trade)
  n: number; gewinner: number; verlierer: number; be: number;
  trefferquote: number | null;
  trefferBereich: [number, number] | null;
  summeEur: number;
  einzahlungen: number; auszahlungen: number; kontostand: number;
  rendite: number | null; // als Anteil: 0,1 = +10 %
  schnittGewinnEur: number | null; schnittVerlustEur: number | null; // Verlust negativ
  schnittGewinnProzent: number | null; schnittVerlustProzent: number | null;
  verhaeltnis: number | null; // Ø Gewinn ÷ Ø Verlust (Betrag)
  erwartungEur: number | null; erwartungProzent: number | null;
  profitFaktor: number | null;
  maxDdProzent: number | null;
  verlustSerie: number; gewinnSerie: number;
  ohneKapital: number; // Trades, vor denen noch keine Einzahlung eingetragen ist (Prozent nicht berechenbar)
  kurve: { datum: string; kumProzent: number; kumEur: number }[];
}

export const datumVon = (t: JTrade) => (t.geschlossen || t.eroeffnet).slice(0, 10);

export function geldAuswertung(trades: JTrade[], cashflows: JCashflow[], ab = ''): JGeld {
  type Ereignis = { datum: string; rang: number; zeit: string; trade?: JTrade; cf?: JCashflow };
  const ereignisse: Ereignis[] = [
    ...cashflows.map((c): Ereignis => ({ datum: c.datum.slice(0, 10), rang: c.art === 'einzahlung' ? 0 : 2, zeit: '', cf: c })),
    ...trades.filter((t) => t.ergebnisEur !== null).map((t): Ereignis => ({ datum: datumVon(t), rang: 1, zeit: t.geschlossen || t.eroeffnet, trade: t })),
  ].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.rang - b.rang || (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0)));

  let stand = 0, einz = 0, ausz = 0;
  const alle: JPosten[] = [];
  for (const ev of ereignisse) {
    if (ev.cf) {
      if (ev.cf.art === 'einzahlung') { stand += ev.cf.betrag; einz += ev.cf.betrag; }
      else { stand -= ev.cf.betrag; ausz += ev.cf.betrag; }
    } else if (ev.trade) {
      const eur = ev.trade.ergebnisEur as number;
      const vorher = stand > 0 ? stand : null;
      alle.push({ t: ev.trade, eur, datum: ev.datum, klasse: klasseVon(ev.trade) as JKlasse, vorher, prozent: vorher === null ? null : eur / vorher });
      stand += eur;
    }
  }

  const posten = alle.filter((p) => p.datum >= ab);
  const gew = posten.filter((p) => p.klasse === 'g'), ver = posten.filter((p) => p.klasse === 'v');
  const prozentVon = (a: JPosten[]) => a.map((p) => p.prozent).filter((x): x is number => x !== null);
  const eurs = posten.map((p) => p.eur);

  let index = 1, spitze = 1, maxDd = 0, kumEur = 0, ohneKapital = 0, serieV = 0, serieG = 0, maxV = 0, maxG = 0;
  const kurve: JGeld['kurve'] = [];
  for (const p of posten) {
    kumEur += p.eur;
    if (p.prozent === null) ohneKapital++;
    else { index *= 1 + p.prozent; spitze = Math.max(spitze, index); maxDd = Math.max(maxDd, (spitze - index) / spitze); }
    kurve.push({ datum: p.datum, kumProzent: index - 1, kumEur });
    if (p.klasse === 'v') { serieV++; serieG = 0; } else if (p.klasse === 'g') { serieG++; serieV = 0; }
    maxV = Math.max(maxV, serieV); maxG = Math.max(maxG, serieG);
  }
  const hatProzent = posten.some((p) => p.prozent !== null);
  const summePos = eurs.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const summeNeg = -eurs.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const sGew = mittel(gew.map((p) => p.eur)), sVer = mittel(ver.map((p) => p.eur));
  const entschieden = gew.length + ver.length;
  return {
    posten, alle,
    n: posten.length, gewinner: gew.length, verlierer: ver.length, be: posten.length - gew.length - ver.length,
    trefferquote: entschieden ? gew.length / entschieden : null,
    trefferBereich: wilson(gew.length, entschieden),
    summeEur: kumEur, einzahlungen: einz, auszahlungen: ausz, kontostand: stand,
    rendite: hatProzent ? index - 1 : null,
    schnittGewinnEur: sGew, schnittVerlustEur: sVer,
    schnittGewinnProzent: mittel(prozentVon(gew)), schnittVerlustProzent: mittel(prozentVon(ver)),
    verhaeltnis: sGew !== null && sVer !== null && sVer !== 0 ? sGew / Math.abs(sVer) : null,
    erwartungEur: mittel(eurs), erwartungProzent: mittel(prozentVon(posten)),
    profitFaktor: summeNeg > 0 ? summePos / summeNeg : summePos > 0 ? Infinity : null,
    maxDdProzent: hatProzent ? maxDd : null,
    verlustSerie: maxV, gewinnSerie: maxG,
    ohneKapital, kurve,
  };
}

export interface JGruppeGeld { schluessel: string; n: number; summeEur: number; schnittEur: number; trefferquote: number | null }
export function gruppierenGeld(p: JPosten[], fn: (x: JPosten) => string | null): JGruppeGeld[] {
  const m = new Map<string, JPosten[]>();
  for (const x of p) { const k = fn(x); if (k === null) continue; const a = m.get(k) || []; a.push(x); m.set(k, a); }
  return [...m.entries()].map(([schluessel, a]) => {
    const g = a.filter((x) => x.klasse === 'g').length, v = a.filter((x) => x.klasse === 'v').length;
    const summe = a.reduce((s, x) => s + x.eur, 0);
    return { schluessel, n: a.length, summeEur: summe, schnittEur: summe / a.length, trefferquote: g + v ? g / (g + v) : null };
  }).sort((a, b) => b.summeEur - a.summeEur);
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
export const GRENZEN_R = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
export const GRENZEN_PROZENT = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
export function verteilung(rs: number[], kl: number[] = GRENZEN_R): { von: number; bis: number; n: number }[] {
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
// Aus R-Werten: jeder Trade verändert das Konto um R × festes Risiko in %.
export function monteCarlo(rs: number[], risikoProzent: number, trades = 100, laeufe = 5000, grenzen = [5, 10, 20]): JMonteCarlo | null {
  return simuliere(rs.map((r) => r * (risikoProzent / 100)), risikoProzent, trades, laeufe, grenzen);
}
// Aus den echten Renditen deiner Trades (Anteil vom Kontostand, z. B. 0,012 = +1,2 %): kein festes Risiko nötig.
export function monteCarloProzent(renditen: number[], trades = 100, laeufe = 5000, grenzen = [5, 10, 20]): JMonteCarlo | null {
  return simuliere(renditen, 0, trades, laeufe, grenzen);
}
function simuliere(renditen: number[], risikoProzent: number, trades: number, laeufe: number, grenzen: number[]): JMonteCarlo | null {
  if (renditen.length < 10) return null;
  const rnd = zufall(renditen.length * 7919 + Math.round(renditen.reduce((a, b) => a + b, 0) * 100_000));
  const dds: number[] = [], endw: number[] = [];
  for (let l = 0; l < laeufe; l++) {
    let k = 1, spitze = 1, dd = 0;
    for (let i = 0; i < trades; i++) {
      k *= Math.max(0, 1 + renditen[Math.floor(rnd() * renditen.length)]);
      if (k > spitze) spitze = k;
      dd = Math.max(dd, (spitze - k) / spitze);
    }
    dds.push(dd * 100);
    endw.push((k - 1) * 100);
  }
  dds.sort((a, b) => a - b);
  endw.sort((a, b) => a - b);
  return {
    laeufe, trades, risiko: risikoProzent, // 0 = aus echten Renditen
    ddP: { p50: quantil(dds, 0.5), p90: quantil(dds, 0.9), p95: quantil(dds, 0.95), p99: quantil(dds, 0.99) },
    ergebnisP: { p5: quantil(endw, 0.05), p50: quantil(endw, 0.5), p95: quantil(endw, 0.95) },
    chanceDd: grenzen.map((g) => ({ grenze: g, p: dds.filter((x) => x >= g).length / laeufe })),
    chanceVerlust: endw.filter((x) => x < 0).length / laeufe,
  };
}

// ---------- Formatierung ----------
export const rText = (r: number | null | undefined, stellen = 2) => (r === null || r === undefined || !Number.isFinite(r) ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(stellen).replace('.', ',')} R`);
export const eurText = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
export const eurOhneVz = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
// Anteil als Prozent mit Vorzeichen: 0,1109 → «+11,09 %»
export const pText = (x: number | null | undefined, stellen = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(stellen).replace('.', ',')} %`);
export const prozent = (x: number | null | undefined, stellen = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(stellen).replace('.', ',')} %`);
