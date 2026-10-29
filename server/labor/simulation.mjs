// Trades durchspielen: Einstieg, Ausstieg, Kosten – Kerze für Kerze auf den Basis-Kerzen (5 Min oder 1 Std).
// Regeln (vorsichtig, eher zu schlecht als zu gut):
//   - Einstieg frühestens nach dem Schluss der Signal-Kerze: «markt» = Open der nächsten Basis-Kerze, «limit» bei Berührung.
//   - In der Einstiegs-Kerze zählt nur der Stop-Loss (ob der TP danach kam, weiss man nicht).
//   - Berührt eine Kerze SL und TP, zählt der SL. Öffnet eine Kerze schon jenseits des SL, gilt dieses (schlechtere) Open.
//   - Kosten: typischer Spread (inkl. Kommission) pro Paar in Pips, einmal pro Trade. Ergebnis in R.
//   - Höchstens eine offene Position pro Paar; Setups, die während eines offenen Trades kommen, fallen weg.
export const SPREAD = {
  EURUSD: 0.8, GBPUSD: 1.0, USDJPY: 0.9, USDCHF: 1.2, AUDUSD: 1.0, NZDUSD: 1.4, USDCAD: 1.3,
  EURGBP: 1.1, EURJPY: 1.3, EURCHF: 1.4, EURAUD: 1.8, EURNZD: 2.6, EURCAD: 1.8,
  GBPJPY: 2.0, GBPCHF: 2.0, GBPAUD: 2.3, GBPNZD: 3.0, GBPCAD: 2.5,
  AUDNZD: 2.0, AUDCAD: 1.7, AUDCHF: 1.7, AUDJPY: 1.5, NZDCAD: 2.2, NZDCHF: 2.2, NZDJPY: 1.8,
  CADCHF: 1.8, CADJPY: 1.7, CHFJPY: 2.0,
};
const MAX_HALTEN_SEK = 90 * 86_400; // ohne TP/Zeit-Ausstieg spätestens nach 90 Tagen raus

// Ausstieg ab Einstiegs-Kerze iF
export function ausstieg(b, iF, F, seite, sl, tp, zeitEnde) {
  const lang = seite > 0;
  const risiko = Math.abs(F - sl);
  let mfe = 0, mae = 0;
  const grenze = b.t[iF] + MAX_HALTEN_SEK;
  for (let i = iF; i < b.n; i++) {
    if (i > iF) {
      if (lang ? b.o[i] <= sl : b.o[i] >= sl) return { i, preis: b.o[i], grund: 'sl', mfe, mae: Math.max(mae, Math.abs(F - b.o[i]) / risiko) };
      if (tp !== null && (lang ? b.o[i] >= tp : b.o[i] <= tp)) return { i, preis: b.o[i], grund: 'tp', mfe: Math.max(mfe, Math.abs(b.o[i] - F) / risiko), mae };
    }
    const fav = lang ? b.h[i] - F : F - b.l[i], adv = lang ? F - b.l[i] : b.h[i] - F;
    if (lang ? b.l[i] <= sl : b.h[i] >= sl) return { i, preis: sl, grund: 'sl', mfe: i > iF ? Math.max(mfe, fav / risiko) : mfe, mae: 1 };
    if (i > iF && tp !== null && (lang ? b.h[i] >= tp : b.l[i] <= tp)) return { i, preis: tp, grund: 'tp', mfe: Math.max(mfe, Math.abs(tp - F) / risiko), mae: Math.max(mae, adv / risiko) };
    if (i > iF) mfe = Math.max(mfe, fav / risiko);
    mae = Math.max(mae, adv / risiko);
    if ((zeitEnde !== null && zeitEnde !== undefined && i >= zeitEnde) || b.t[i] >= grenze) return { i, preis: b.c[i], grund: 'zeit', mfe, mae };
  }
  return { i: b.n - 1, preis: b.c[b.n - 1], grund: 'offen', mfe, mae };
}

// Ausstieg mit Management (Teilgewinn und/oder Break-Even), gleiche Vorsicht wie oben:
//   - In der Einstiegs-Kerze zählt nur der Stop-Loss.
//   - Berührt eine Kerze den Stop und ein Ziel (Teil/TP), zählt zuerst der Stop.
//   - Break-Even gilt erst ab der Kerze NACH dem Erreichen der BE-Marke.
//   - Öffnet eine Kerze jenseits einer Marke, gilt dieses Open.
// m = { teil: { preis, anteil } | undefined, be: { preis } | undefined }
// Ergebnis: preis = gewichteter Durchschnitt aller Teil-Ausstiege (damit rechnet simulieren() wie gewohnt das R),
// grund = 'tp' | 'sl' | 'be' | 'zeit' | 'offen' für den Rest der Position, teil = true, wenn der Teilgewinn genommen wurde.
export function ausstiegMitManagement(b, iF, F, seite, sl, tp, zeitEnde, m) {
  const lang = seite > 0;
  const risiko = Math.abs(F - sl);
  const ueber = (a, x) => (lang ? a >= x : a <= x);
  const unter = (a, x) => (lang ? a <= x : a >= x);
  let stop = sl, beAktiv = false, beBald = false, rest = 1, erloes = 0, teil = false, mfe = 0, mae = 0;
  const grenze = b.t[iF] + MAX_HALTEN_SEK;
  const fertig = (i, preis, grund) => ({ i, preis: erloes + rest * preis, grund, mfe, mae, teil });
  for (let i = iF; i < b.n; i++) {
    if (beBald) { beAktiv = true; beBald = false; stop = lang ? Math.max(stop, F) : Math.min(stop, F); }
    if (i > iF) {
      if (unter(b.o[i], stop)) { mae = Math.max(mae, Math.max(0, (lang ? F - b.o[i] : b.o[i] - F) / risiko)); return fertig(i, b.o[i], beAktiv ? 'be' : 'sl'); }
      if (m.teil && !teil && ueber(b.o[i], m.teil.preis)) { teil = true; erloes += m.teil.anteil * b.o[i]; rest -= m.teil.anteil; }
      if (tp !== null && ueber(b.o[i], tp)) { mfe = Math.max(mfe, Math.abs(b.o[i] - F) / risiko); return fertig(i, b.o[i], 'tp'); }
    }
    const fav = lang ? b.h[i] - F : F - b.l[i], adv = lang ? F - b.l[i] : b.h[i] - F;
    if (lang ? b.l[i] <= stop : b.h[i] >= stop) {
      if (i > iF) mfe = Math.max(mfe, fav / risiko);
      mae = Math.max(mae, beAktiv ? Math.max(0, adv) / risiko : 1);
      return fertig(i, stop, beAktiv ? 'be' : 'sl');
    }
    if (i > iF) {
      if (m.teil && !teil && (lang ? b.h[i] >= m.teil.preis : b.l[i] <= m.teil.preis)) { teil = true; erloes += m.teil.anteil * m.teil.preis; rest -= m.teil.anteil; }
      if (tp !== null && (lang ? b.h[i] >= tp : b.l[i] <= tp)) { mfe = Math.max(mfe, Math.abs(tp - F) / risiko); mae = Math.max(mae, adv / risiko); return fertig(i, tp, 'tp'); }
      if (m.be && !beAktiv && (lang ? b.h[i] >= m.be.preis : b.l[i] <= m.be.preis)) beBald = true;
      mfe = Math.max(mfe, fav / risiko);
    }
    mae = Math.max(mae, adv / risiko);
    if ((zeitEnde !== null && zeitEnde !== undefined && i >= zeitEnde) || b.t[i] >= grenze) return fertig(i, b.c[i], 'zeit');
  }
  return fertig(b.n - 1, b.c[b.n - 1], 'offen');
}

// Einstieg eines Setups: { iF, F } oder null
function einstieg(b, s) {
  const e = s.einstieg || { art: 'markt' };
  if (e.art === 'gefuellt') return { iF: e.idx, F: e.preis };
  if (e.art === 'markt') { const iF = s.iSignal + 1; return iF < b.n ? { iF, F: b.o[iF] } : null; }
  if (e.art === 'limit') {
    const ende = Math.min(b.n - 1, e.verfall ?? b.n - 1);
    for (let i = s.iSignal + 1; i <= ende; i++) {
      if (s.seite > 0 ? b.l[i] <= e.preis : b.h[i] >= e.preis) return { iF: i, F: s.seite > 0 ? Math.min(b.o[i], e.preis) : Math.max(b.o[i], e.preis) };
    }
  }
  return null;
}

// Zufallszahlen mit festem Startwert (gleiche Ergebnisse bei jedem Lauf)
export function zufall(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Alle Setups eines Paars durchspielen. bereich = [vonSek, bisSek): nur Signale darin zählen.
// Zusätzlich je Trade: Spiegel (gleicher Einstieg, Gegenrichtung) und 3 Zufalls-Einstiege (gleiches Paar und Jahr,
// gleiche Seite, gleicher SL-Abstand und gleiches Chance-Risiko-Verhältnis).
export function simulieren(b, pair, pip, setups, bereich, rnd) {
  const spread = SPREAD[pair] ?? 2;
  const sortiert = setups.filter((s) => b.t[s.iSignal] >= bereich[0] && b.t[s.iSignal] < bereich[1]).sort((a, c) => a.iSignal - c.iSignal);
  const trades = [];
  let frei = -1, uebersprungen = 0;
  // Indexbereich je Jahr für die Zufalls-Einstiege
  const jahrBereich = new Map();
  const jahrIdx = (j) => {
    if (!jahrBereich.has(j)) {
      const von = Math.max(bereich[0], Date.UTC(j, 0, 1) / 1000), bis = Math.min(bereich[1], Date.UTC(j + 1, 0, 1) / 1000);
      let a = 0, c = b.n;
      while (a < c) { const m = (a + c) >> 1; if (b.t[m] < von) a = m + 1; else c = m; }
      let d = a;
      while (d < b.n && b.t[d] < bis) d++;
      jahrBereich.set(j, [a, d - 1]);
    }
    return jahrBereich.get(j);
  };

  for (const s of sortiert) {
    const ein = einstieg(b, s);
    if (!ein) continue;
    const { iF, F } = ein;
    if (iF <= frei) { uebersprungen++; continue; }
    const sl = s.sl ?? F - s.seite * s.risiko;
    const risiko = Math.abs(F - sl);
    if (!(risiko > 0) || (s.seite > 0 ? sl >= F : sl <= F)) continue;
    const tp = s.tp ?? (s.rZiel ? F + s.seite * risiko * s.rZiel : null);
    const zeitEnde = s.zeitEnde ?? null;
    const a = s.management ? ausstiegMitManagement(b, iF, F, s.seite, sl, tp, zeitEnde, s.management) : ausstieg(b, iF, F, s.seite, sl, tp, zeitEnde);
    frei = a.i;
    const risikoPips = risiko / pip;
    const rRoh = (s.seite * (a.preis - F)) / risiko;
    const rr = tp !== null ? Math.abs(tp - F) / risiko : null;
    // Management in R (Abstand zum Einstieg), damit Spiegel und Zufall gleich behandelt werden
    const mR = s.management ? { teil: s.management.teil ? { r: Math.abs(s.management.teil.preis - F) / risiko, anteil: s.management.teil.anteil } : null, be: s.management.be ? { r: Math.abs(s.management.be.preis - F) / risiko } : null } : null;
    const mVon = (FF, seite) => (mR ? { teil: mR.teil ? { preis: FF + seite * risiko * mR.teil.r, anteil: mR.teil.anteil } : undefined, be: mR.be ? { preis: FF + seite * risiko * mR.be.r } : undefined } : null);
    const raus = (iX, FX, seite, slX, tpX, zeitX) => { const mm = mVon(FX, seite); return mm ? ausstiegMitManagement(b, iX, FX, seite, slX, tpX, zeitX, mm) : ausstieg(b, iX, FX, seite, slX, tpX, zeitX); };
    const dauer = zeitEnde !== null ? zeitEnde - iF : null;
    // Spiegel
    const sp = raus(iF, F, -s.seite, F + s.seite * risiko, rr !== null ? F - s.seite * risiko * rr : null, zeitEnde);
    const spiegel = (-s.seite * (sp.preis - F)) / risiko;
    // Zufall
    const zuf = [];
    const jr = jahrIdx(new Date(b.t[iF] * 1000).getUTCFullYear());
    for (let z = 0; z < 3 && jr[1] > jr[0] + 10; z++) {
      const iZ = jr[0] + Math.floor(rnd() * (jr[1] - jr[0] - 1)) + 1;
      const FZ = b.o[iZ];
      const slZ = FZ - s.seite * risiko, tpZ = rr !== null ? FZ + s.seite * risiko * rr : null;
      const az = raus(iZ, FZ, s.seite, slZ, tpZ, dauer !== null ? Math.min(b.n - 1, iZ + dauer) : null);
      zuf.push(Number(((s.seite * (az.preis - FZ)) / risiko - spread / risikoPips).toFixed(4)));
    }
    trades.push({
      pair, seite: s.seite, tSignal: b.t[s.iSignal], tEin: b.t[iF], tAus: b.t[a.i], sd: b.sd[iF],
      ein: F, sl, tp, aus: a.preis, grund: a.grund, teil: !!a.teil, risikoPips: Number(risikoPips.toFixed(1)),
      rRoh: Number(rRoh.toFixed(4)), r: Number((rRoh - spread / risikoPips).toFixed(4)), spreadR: Number((spread / risikoPips).toFixed(4)),
      mfe: Number(a.mfe.toFixed(3)), mae: Number(a.mae.toFixed(3)), spiegel: Number((spiegel - spread / risikoPips).toFixed(4)), zufall: zuf,
      info: s.info || {},
    });
  }
  return { trades, uebersprungen };
}
