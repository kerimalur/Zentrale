// Auswertung eines Laufs: Kennzahlen, unabhängige Fälle, Vergleich mit Zufall/Saison, Robustheits-Raster, Urteil, Monte Carlo.
// Urteil nach dem Hypothesen-Skill (Monty): Bestätigt nur mit genug unabhängigen Fällen, p unter der Bonferroni-Grenze,
// gleicher Richtung in beiden Hälften, besser als Zufall und gehaltenem Forward-Test.
import { zufall } from './simulation.mjs';

export const mittel = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export function quantil(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const p = (s.length - 1) * q, i = Math.floor(p);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i);
}
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const m = (p + (z * z) / (2 * n)) / d, w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, m - w), Math.min(1, m + w)];
}
const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

// Unabhängige Fälle: Ereignisse am selben Handelstag, deren Paare eine Währung teilen, zählen als EIN Fall
// (EURUSD und EURGBP am selben Tag sind kaum unabhängig).
export function unabhaengig(liste) {
  const proTag = new Map();
  for (const x of liste) { if (!proTag.has(x.sd)) proTag.set(x.sd, []); proTag.get(x.sd).push(x.pair); }
  let n = 0;
  for (const paare of proTag.values()) {
    const vater = paare.map((_, i) => i);
    const finde = (i) => (vater[i] === i ? i : (vater[i] = finde(vater[i])));
    for (let i = 0; i < paare.length; i++) for (let j = i + 1; j < paare.length; j++) {
      const a = paare[i], b = paare[j];
      if (a.slice(0, 3) === b.slice(0, 3) || a.slice(0, 3) === b.slice(3) || a.slice(3) === b.slice(0, 3) || a.slice(3) === b.slice(3)) vater[finde(i)] = finde(j);
    }
    n += new Set(paare.map((_, i) => finde(i))).size;
  }
  return n;
}

// Kennzahlen einer R-Liste (in zeitlicher Reihenfolge)
export function kennzahlen(rs) {
  const n = rs.length;
  if (!n) return { n: 0 };
  const gew = rs.filter((r) => r > 0), verl = rs.filter((r) => r < 0);
  const summe = rs.reduce((s, x) => s + x, 0);
  let kum = 0, spitze = 0, dd = 0, serie = 0, maxSerie = 0;
  for (const r of rs) {
    kum += r; spitze = Math.max(spitze, kum); dd = Math.max(dd, spitze - kum);
    if (r < 0) { serie++; maxSerie = Math.max(maxSerie, serie); } else serie = 0;
  }
  const avg = summe / n;
  const sd = Math.sqrt(rs.reduce((s, x) => s + (x - avg) ** 2, 0) / Math.max(1, n - 1));
  const gs = gew.reduce((s, x) => s + x, 0), vs = -verl.reduce((s, x) => s + x, 0);
  return {
    n, gewinner: gew.length, quote: gew.length / n, bereich: wilson(gew.length, n), avgR: r4(avg), summeR: r4(summe),
    avgGewinn: r4(mittel(gew)), avgVerlust: r4(mittel(verl)), pf: vs > 0 ? r4(gs / vs) : null, maxDD: r4(dd), verlustSerie: maxSerie,
    sqn: sd > 0 ? r4((avg / sd) * Math.sqrt(Math.min(n, 100))) : null, median: r4(quantil(rs, 0.5)), bester: r4(Math.max(...rs)), schlechtester: r4(Math.min(...rs)),
  };
}

// Kurve der kumulierten R (höchstens ~400 Punkte)
function kurve(trades, feld = 'r') {
  let kum = 0;
  const pkt = trades.map((t) => { kum += t[feld]; return [t.tEin, r4(kum)]; });
  if (pkt.length <= 400) return pkt;
  const schritt = pkt.length / 400;
  const out = [];
  for (let i = 0; i < 400; i++) out.push(pkt[Math.floor(i * schritt)]);
  out.push(pkt[pkt.length - 1]);
  return out;
}

// p-Wert (einseitig): Ist der Mittelwert der echten Fälle höher als der der Vergleichsgruppe?
// Welch-Test mit vorsichtigen Fallzahlen: echte Seite = unabhängige Fälle, Vergleichsseite = Anzahl Ziehungen / je Fall gezogene
// Vergleichswerte (die sind untereinander nicht unabhängig). So wird ein zufällig günstiger Vergleichs-Pool nicht zum «Treffer».
const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
function varianz(a) { const m = mittel(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1); }
function pWelch(echt, nEcht, pool, nPool) {
  if (echt.length < 3 || pool.length < 3 || nEcht < 2 || nPool < 2) return null;
  const se = Math.sqrt(varianz(echt) / nEcht + varianz(pool) / nPool);
  if (!(se > 0)) return null;
  return 1 - phi((mittel(echt) - mittel(pool)) / se);
}

function gruppen(liste, schluessel, wert) {
  const m = new Map();
  for (const x of liste) { const k = schluessel(x); if (!m.has(k)) m.set(k, []); m.get(k).push(wert(x)); }
  return [...m.entries()].map(([k, v]) => ({ schluessel: String(k), n: v.length, avg: r4(mittel(v)), quote: v.filter((x) => x > 0).length / v.length })).sort((a, b) => (a.schluessel < b.schluessel ? -1 : 1));
}

const zeile = (id, name, status, text) => ({ id, name, status, text });
const jahrVon = (t) => new Date(t * 1000).getUTCFullYear();
const ohneAusreisser = (rs) => { if (rs.length < 10) return null; const s = [...rs].sort((a, b) => a - b); return mittel(s.slice(3, -3)); };
const anteilPositiv = (gr) => { const g = gr.filter((x) => x.n >= 5); return g.length ? g.filter((x) => x.avg > 0).length / g.length : null; };

// Monte Carlo (nur Risiko): Trades 10'000-mal mit Zurücklegen neu ziehen → Drawdown-Verteilung in R
export function monteCarlo(rs, laeufe = 10_000, seed = 7) {
  if (rs.length < 10) return null;
  const rnd = zufall(seed);
  const n = Math.min(rs.length, 1000);
  const dds = new Float64Array(laeufe), serien = new Float64Array(laeufe);
  let grenze10 = 0;
  for (let l = 0; l < laeufe; l++) {
    let kum = 0, spitze = 0, dd = 0, serie = 0, ms = 0;
    for (let i = 0; i < n; i++) {
      const r = rs[Math.floor(rnd() * rs.length)];
      kum += r; if (kum > spitze) spitze = kum; if (spitze - kum > dd) dd = spitze - kum;
      if (r < 0) { serie++; if (serie > ms) ms = serie; } else serie = 0;
    }
    dds[l] = dd; serien[l] = ms;
    if (dd >= 10) grenze10++;
  }
  const a = Array.from(dds), s = Array.from(serien);
  return { trades: n, dd50: r4(quantil(a, 0.5)), dd95: r4(quantil(a, 0.95)), dd99: r4(quantil(a, 0.99)), serie95: Math.round(quantil(s, 0.95)), chance10R: grenze10 / laeufe };
}

// ---------- Strategie ----------
export function strategieAuswerten({ trades, forward, nachbarn, varianten, trichter }) {
  const rs = trades.map((t) => t.r);
  const k = kennzahlen(rs);
  const nU = unabhaengig(trades);
  const pool = trades.flatMap((t) => t.zufall);
  const zufallMittel = mittel(pool);
  const p = rs.length ? pWelch(rs, nU, pool, pool.length / 3) : null;
  const bonf = 0.05 / Math.max(1, varianten);
  const mitte = trades.length ? trades[Math.floor(trades.length / 2)].tEin : 0;
  const h1 = mittel(trades.filter((t) => t.tEin < mitte).map((t) => t.r)), h2 = mittel(trades.filter((t) => t.tEin >= mitte).map((t) => t.r));
  const proJahr = gruppen(trades, (t) => jahrVon(t.tEin), (t) => t.r);
  const proPaar = gruppen(trades, (t) => t.pair, (t) => t.r);
  const proSeite = gruppen(trades, (t) => (t.seite > 0 ? 'Long' : 'Short'), (t) => t.r);
  const kosten2 = mittel(trades.map((t) => t.r - t.spreadR));
  const ohne = ohneAusreisser(rs);
  const spiegel = mittel(trades.map((t) => t.spiegel));
  const fk = forward ? kennzahlen(forward.map((t) => t.r)) : null;
  const ok = (b) => (b === null || b === undefined ? 'offen' : b ? 'ja' : 'nein');
  const proz = (x) => (x === null ? '—' : `${Math.round(x * 100)} %`);
  const rf = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)} R`);
  const raster = [
    zeile('zufall', 'Besser als Zufall', ok(k.n ? k.avgR > (zufallMittel ?? 0) && p !== null && p < 0.05 : null), `Ø ${rf(k.avgR)} gegen Zufall ${rf(zufallMittel)} · p = ${p === null ? '—' : p.toFixed(3)}`),
    zeile('forward', 'Forward hält', fk ? ok(fk.n >= 10 && fk.avgR > 0 && fk.quote >= (k.quote * 2) / 3) : 'offen', fk ? `Forward ${fk.n} Trades, Ø ${rf(fk.avgR)}, Trefferquote ${proz(fk.quote)} (Backtest ${proz(k.quote)})` : 'Forward-Zeitraum noch gesperrt'),
    zeile('haelften', 'Beide Hälften positiv', ok(h1 !== null && h2 !== null ? h1 > 0 && h2 > 0 : null), `1. Hälfte ${rf(h1)} · 2. Hälfte ${rf(h2)}`),
    zeile('jahre', 'Die meisten Jahre positiv', ok(anteilPositiv(proJahr) === null ? null : anteilPositiv(proJahr) >= 0.6), `${proz(anteilPositiv(proJahr))} der Jahre mit ≥ 5 Trades`),
    zeile('paare', 'Die meisten Paare positiv', ok(anteilPositiv(proPaar) === null ? null : anteilPositiv(proPaar) >= 0.6), `${proz(anteilPositiv(proPaar))} der Paare mit ≥ 5 Trades`),
    zeile('nachbarn', 'Nachbar-Parameter ähnlich', ok(nachbarn?.length ? nachbarn.every((x) => x.avgR !== null && x.avgR > 0) : null), nachbarn?.length ? nachbarn.map((x) => `${x.text}: ${rf(x.avgR)} (${x.n})`).join(' · ') : 'keine Nachbarn gerechnet'),
    zeile('kosten', 'Hält doppelten Spread', ok(k.n ? kosten2 > 0 : null), `Ø mit doppeltem Spread ${rf(kosten2)}`),
    zeile('ausreisser', 'Ohne Ausreisser positiv', ok(ohne === null ? null : ohne > 0), `Ø ohne die 3 besten und 3 schlechtesten ${rf(ohne)} · Median ${rf(k.median)}`),
    zeile('spiegel', 'Gegenrichtung verliert', ok(spiegel === null ? null : spiegel < 0), `gleiche Einstiege in Gegenrichtung: Ø ${rf(spiegel)}`),
    zeile('bonferroni', 'Hält Mehrfachtests', ok(p === null ? null : p < bonf), `${varianten} getestete Variante${varianten === 1 ? '' : 'n'} → Grenze p < ${bonf.toFixed(4)}`),
  ];
  const st = Object.fromEntries(raster.map((z) => [z.id, z.status]));
  let urteil, warum;
  if (nU < 15) { urteil = 'Zu wenig Daten'; warum = `nur ${nU} unabhängige Fälle (mindestens 15, besser 30+)`; }
  else if (!(k.avgR > 0) || (p !== null && p >= 0.2)) { urteil = 'Nicht bestätigt'; warum = k.avgR > 0 ? 'nicht vom Zufall zu unterscheiden' : 'im Schnitt kein Gewinn nach Kosten'; }
  else if (nU >= 30 && st.bonferroni === 'ja' && st.haelften === 'ja' && st.zufall === 'ja' && st.kosten === 'ja' && st.forward === 'ja') { urteil = 'Bestätigt'; warum = 'alle Kernprüfungen bestanden, Forward hält'; }
  else { urteil = 'Hinweis'; warum = st.forward === 'offen' && st.zufall === 'ja' && st.haelften === 'ja' ? 'Backtest sieht gut aus – erst der Forward-Test entscheidet' : 'Richtung stimmt, aber nicht alle Kernprüfungen bestanden'; }
  return {
    typ: 'strategie', urteil, warum, n: k.n, nUnabhaengig: nU, varianten, kennzahlen: k, zufall: { mittel: r4(zufallMittel), p: r4(p), n: pool.length },
    raster, proJahr, proPaar, proSeite, kurve: kurve(trades), forward: fk ? { kennzahlen: fk, kurve: kurve(forward), nUnabhaengig: unabhaengig(forward) } : null,
    monteCarlo: monteCarlo(forward ? [...rs, ...forward.map((t) => t.r)] : rs), trichter, grundAusstieg: gruppen(trades, (t) => t.grund, (t) => t.r),
    mfeMedian: r4(quantil(trades.map((t) => t.mfe), 0.5)), maeMedian: r4(quantil(trades.map((t) => t.mae), 0.5)),
  };
}

// ---------- Hypothese ----------
// Ereignisse je Horizont ohne Überlappung pro Paar (Mindestabstand = Horizont), dann gegen Saison und Zufall.
export function hypotheseAuswerten({ ereignisse, spiegel, forward, horizonte, haupt, varianten }) {
  const proH = horizonte.map((h, x) => {
    const ohneUeberlapp = (liste) => {
      const out = [], letzte = new Map();
      for (const ev of [...liste].sort((a, b) => a.t - b.t)) {
        if (ev.r[x] === null) continue;
        const l = letzte.get(ev.pair);
        if (l !== undefined && ev.t - l < h * 86_400 * 1.4) continue;
        letzte.set(ev.pair, ev.t); out.push(ev);
      }
      return out;
    };
    const evs = ohneUeberlapp(ereignisse);
    const rs = evs.map((e) => e.r[x]);
    const saison = evs.map((e) => e.saison?.[x]).filter((v) => v !== null && v !== undefined);
    const pool = evs.flatMap((e) => e.zufall?.[x] || []);
    const m = mittel(rs);
    const sp = ohneUeberlapp(spiegel || []).map((e) => e.r[x]);
    const fw = forward ? ohneUeberlapp(forward).map((e) => e.r[x]) : null;
    const mitte = evs.length ? evs[Math.floor(evs.length / 2)].t : 0;
    return {
      h, n: evs.length, nUnabhaengig: unabhaengig(evs), mittel: r4(m), median: r4(quantil(rs, 0.5)), quote: rs.length ? rs.filter((v) => v > 0).length / rs.length : null,
      bereich: wilson(rs.filter((v) => v > 0).length, rs.length), saison: r4(mittel(saison)), mehrwert: m !== null && saison.length ? r4(m - mittel(saison)) : null,
      zufall: r4(mittel(pool)), p: m !== null ? r4(pWelch(rs, unabhaengig(evs), pool, pool.length / 10)) : null,
      h1: r4(mittel(evs.filter((e) => e.t < mitte).map((e) => e.r[x]))), h2: r4(mittel(evs.filter((e) => e.t >= mitte).map((e) => e.r[x]))),
      ohne: r4(ohneAusreisser(rs)), spiegel: sp.length ? r4(mittel(sp)) : null, spiegelN: sp.length, forward: fw ? { n: fw.length, mittel: r4(mittel(fw)), quote: fw.length ? fw.filter((v) => v > 0).length / fw.length : null } : null,
      proJahr: gruppen(evs, (e) => jahrVon(e.t), (e) => e.r[x]), proPaar: gruppen(evs, (e) => e.pair, (e) => e.r[x]),
      faelle: evs.map((e) => ({ pair: e.pair, t: e.t, seite: e.seite, r: e.r[x], s: e.saison?.[x] ?? null })),
    };
  });
  const H = proH[Math.max(0, horizonte.indexOf(haupt))];
  const bonf = 0.05 / Math.max(1, varianten);
  const ok = (b) => (b === null || b === undefined ? 'offen' : b ? 'ja' : 'nein');
  const a = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(3)} ATR`);
  const proz = (x) => (x === null ? '—' : `${Math.round(x * 100)} %`);
  const raster = [
    zeile('saison', 'Mehrwert über der Saison', ok(H.mehrwert === null ? null : H.mehrwert > 0), `Ereignis ${a(H.mittel)} · gleicher Kalendertag ohne Ereignis ${a(H.saison)}`),
    zeile('zufall', 'Besser als Zufall', ok(H.p === null ? null : H.p < 0.05), `Zufall gleicher Monat ${a(H.zufall)} · p = ${H.p ?? '—'}`),
    zeile('forward', 'Forward hält', H.forward ? ok(H.forward.n >= 10 && H.forward.mittel > 0 && H.forward.quote >= (H.quote * 2) / 3) : 'offen', H.forward ? `Forward ${H.forward.n} Fälle, ${a(H.forward.mittel)}, Treffer ${proz(H.forward.quote)}` : 'Forward-Zeitraum noch gesperrt'),
    zeile('haelften', 'Beide Hälften gleiche Richtung', ok(H.h1 === null || H.h2 === null ? null : H.h1 > 0 && H.h2 > 0), `1. Hälfte ${a(H.h1)} · 2. Hälfte ${a(H.h2)}`),
    zeile('jahre', 'Die meisten Jahre positiv', ok(anteilPositiv(H.proJahr) === null ? null : anteilPositiv(H.proJahr) >= 0.6), `${proz(anteilPositiv(H.proJahr))} der Jahre mit ≥ 5 Fällen`),
    zeile('paare', 'Die meisten Paare positiv', ok(anteilPositiv(H.proPaar) === null ? null : anteilPositiv(H.proPaar) >= 0.6), `${proz(anteilPositiv(H.proPaar))} der Paare mit ≥ 5 Fällen`),
    zeile('spiegel', 'Gegen-Ereignis wirkt gegenteilig', ok(H.spiegel === null ? null : H.spiegel > 0), H.spiegel === null ? 'nur bei einer Richtung prüfbar' : `Gegen-Ereignis (in seiner Richtung) ${a(H.spiegel)} bei ${H.spiegelN} Fällen`),
    zeile('ausreisser', 'Ohne Ausreisser positiv', ok(H.ohne === null ? null : H.ohne > 0), `Ø ohne die 3 besten/schlechtesten ${a(H.ohne)} · Median ${a(H.median)}`),
    zeile('bonferroni', 'Hält Mehrfachtests', ok(H.p === null ? null : H.p < bonf), `${varianten} getestete Variante${varianten === 1 ? '' : 'n'} → Grenze p < ${bonf.toFixed(4)}`),
  ];
  const st = Object.fromEntries(raster.map((z) => [z.id, z.status]));
  let urteil, warum;
  if (H.nUnabhaengig < 15) { urteil = 'Zu wenig Daten'; warum = `nur ${H.nUnabhaengig} unabhängige Fälle`; }
  else if (!(H.mittel > 0) || (H.p !== null && H.p >= 0.2)) { urteil = 'Nicht bestätigt'; warum = H.mittel > 0 ? 'nicht vom Zufall zu unterscheiden' : 'Wirkung geht nicht in die erwartete Richtung'; }
  else if (H.nUnabhaengig >= 30 && st.bonferroni === 'ja' && st.haelften === 'ja' && st.saison === 'ja' && st.forward === 'ja') { urteil = 'Bestätigt'; warum = 'genug Fälle, signifikant, beide Hälften, über der Saison, Forward hält'; }
  else { urteil = 'Hinweis'; warum = st.forward === 'offen' && st.saison === 'ja' && st.haelften === 'ja' && st.zufall === 'ja' ? 'Backtest sieht gut aus – erst der Forward-Test entscheidet' : 'Richtung stimmt, aber zu schwach oder nicht überall'; }
  return { typ: 'hypothese', urteil, warum, haupt, n: H.n, nUnabhaengig: H.nUnabhaengig, varianten, horizonte: proH, raster };
}
