// Rechnet einen Labor-Lauf in einem eigenen Thread (der Server bleibt bedienbar). Paar für Paar, damit wenig Speicher nötig ist.
import { parentPort, workerData } from 'node:worker_threads';
import { basisLaden } from './daten.mjs';
import { kontext, filterAnwenden, mitStandard, ereignisseAuswerten } from './bausteine.mjs';
import { simulieren, zufall } from './simulation.mjs';
import { hypothesePaar } from './hypothese.mjs';
import { strategieAuswerten, hypotheseAuswerten, mittel } from './statistik.mjs';
import { STRATEGIE } from './strategien/index.mjs';
import { handelstagNr } from './daten.mjs';

const { karte, e, yahoo, paare, backtest, forward, varianten, biasFenster } = workerData;
const start = Date.now();
const melde = (x) => parentPort.postMessage({ typ: 'fortschritt', ...x });
const bisGesamt = forward ? forward[1] : backtest[1];

function parameterVon(k) {
  const mod = STRATEGIE[k.modell];
  if (!mod) throw new Error(`Unbekannte Strategie: ${k.modell}`);
  const p = mitStandard(mod.parameter, k.parameter || {});
  if (mod.mitEreignissen) p.ereignisse = k.ereignisse || [];
  return { mod, p };
}

// Stufe 2: Setups nur im Bias-Fenster (Ereignis + n Handelstage, gleiche Richtung); der Rest ist die Gegenprobe.
// Mit biasFenster (aus einer Fremddaten-Hypothese): Zeitfenster in Unix-Sekunden, seite 0 = beide Richtungen.
function biasTeilen(ctx, setups, bias) {
  if (biasFenster) {
    const innen = [], aussen = [];
    for (const s of setups) {
      const t = ctx.basis.t[s.iSignal];
      const drin = biasFenster.some((f) => t >= f.von && t < f.bis && (!f.seite || f.seite === s.seite));
      (drin ? innen : aussen).push(s);
    }
    return { innen, aussen };
  }
  if (!bias?.ereignisse?.length) return { innen: setups, aussen: null };
  const { z, signale } = ereignisseAuswerten(ctx, bias.tf || 'D', bias.ereignisse, bias.richtung || 'beide', true);
  const fenster = signale.map(({ k, seite }) => {
    const i0 = z.en[k];
    const ht0 = handelstagNr(ctx.basis.sd[i0], e);
    return { von: ctx.basis.t[i0], bisHt: ht0 + (bias.tage || 5), seite };
  });
  const innen = [], aussen = [];
  for (const s of setups) {
    const t = ctx.basis.t[s.iSignal], ht = handelstagNr(ctx.basis.sd[s.iSignal], e);
    const drin = fenster.some((f) => f.seite === s.seite && t > f.von && ht <= f.bisHt);
    (drin ? innen : aussen).push(s);
  }
  return { innen, aussen };
}

async function strategie() {
  const { mod, p } = parameterVon(karte);
  const nachbarP = (mod.nachbarn ? mod.nachbarn(p) : []).slice(0, 3);
  const rnd = zufall(4242);
  const alle = [], fw = [], gegen = [], nachbarTrades = nachbarP.map(() => []), abdeckung = [];
  const trichter = {};
  let uebersprungen = 0;
  const extra = { filter: 0, ausserBias: 0, ohneEinstieg: 0 }; // weitere Gründe, warum ein Setup nicht zum Trade wurde
  for (let x = 0; x < paare.length; x++) {
    const pair = paare[x];
    melde({ paar: pair, fertig: x, gesamt: paare.length });
    const basis = basisLaden(pair, { bisSek: bisGesamt, e, yahoo: yahoo?.[pair] });
    if (!basis || basis.n < 1000) { abdeckung.push({ pair, quelle: null, fehlt: true }); continue; }
    const ctx = kontext(basis, e, pair);
    ctx.bereich = backtest;
    const noetig = mod.aufloesung ? mod.aufloesung(p) : 3600;
    abdeckung.push({ pair, quelle: basis.quelle, ab: basis.t[0], bis: basis.t[basis.n - 1], zuGrob: basis.res > noetig });
    const lauf = (pp) => {
      const r = mod.setups(ctx, pp);
      const vorher = r.setups.filter((q) => ctx.imBereich(q.iSignal)).length;
      const setups = filterAnwenden(ctx, r.setups, karte.filter);
      return { setups, trichter: r.trichter, gefiltert: vorher - setups.filter((q) => ctx.imBereich(q.iSignal)).length };
    };
    const haupt = lauf(p);
    for (const [k, v] of Object.entries(haupt.trichter || {})) trichter[k] = (trichter[k] || 0) + v;
    extra.filter += haupt.gefiltert;
    const { innen, aussen } = biasTeilen(ctx, haupt.setups, karte.bias);
    if (aussen) extra.ausserBias += aussen.filter((q) => ctx.imBereich(q.iSignal)).length;
    const bt = simulieren(basis, pair, ctx.pip, innen, backtest, rnd);
    alle.push(...bt.trades); uebersprungen += bt.uebersprungen; extra.ohneEinstieg += bt.verworfen;
    if (aussen) gegen.push(...simulieren(basis, pair, ctx.pip, aussen, backtest, rnd).trades);
    if (forward) fw.push(...simulieren(basis, pair, ctx.pip, innen, forward, rnd).trades);
    nachbarP.forEach((np, i) => {
      const s = lauf(np).setups;
      nachbarTrades[i].push(...simulieren(basis, pair, ctx.pip, biasTeilen(ctx, s, karte.bias).innen, backtest, zufall(1)).trades);
    });
  }
  const zeitSort = (a, b) => a.tEin - b.tEin;
  alle.sort(zeitSort); fw.sort(zeitSort);
  const nachbarn = nachbarP.map((np, i) => ({
    text: Object.entries(np).filter(([k, v]) => k !== 'ereignisse' && JSON.stringify(v) !== JSON.stringify(p[k])).map(([k, v]) => `${k} ${v}`).join(', ') || 'Ereignis-Werte ±20 %',
    n: nachbarTrades[i].length, avgR: nachbarTrades[i].length ? Number(mittel(nachbarTrades[i].map((t) => t.r)).toFixed(4)) : null,
  }));
  const erg = strategieAuswerten({ trades: alle, forward: forward ? fw : null, nachbarn, varianten, trichter });
  if (karte.bias?.ereignisse?.length || biasFenster) {
    const g = mittel(gegen.map((t) => t.r));
    erg.raster.push({ id: 'bias', name: 'Bias-Fenster hilft', status: g === null || erg.kennzahlen.avgR === null ? 'offen' : erg.kennzahlen.avgR > g ? 'ja' : 'nein', text: `im Fenster Ø ${erg.kennzahlen.avgR ?? '—'} R (${alle.length}) · ausserhalb Ø ${g === null ? '—' : g.toFixed(2)} R (${gegen.length})` });
  }
  erg.uebersprungen = uebersprungen;
  erg.trichter = { ...(erg.trichter || {}), filter: extra.filter, ausserBias: extra.ausserBias, ohneEinstieg: extra.ohneEinstieg, positionOffen: uebersprungen };
  erg.parameter = p;
  return { ...erg, trades: alle, forwardTrades: forward ? fw : null, abdeckung };
}

async function hypothese() {
  const rnd = zufall(4242);
  const ev = [], sp = [], fw = [], abdeckung = [];
  for (let x = 0; x < paare.length; x++) {
    const pair = paare[x];
    melde({ paar: pair, fertig: x, gesamt: paare.length });
    const basis = basisLaden(pair, { bisSek: bisGesamt, e, yahoo: yahoo?.[pair] });
    if (!basis || basis.n < 1000) { abdeckung.push({ pair, quelle: null, fehlt: true }); continue; }
    const ctx = kontext(basis, e, pair);
    abdeckung.push({ pair, quelle: basis.quelle, ab: basis.t[0], bis: basis.t[basis.n - 1], zuGrob: basis.res > ({ '5m': 300, '15m': 900, '30m': 1800 }[karte.tf] || 3600) });
    const r = hypothesePaar(ctx, karte, backtest, rnd);
    ev.push(...r.ereignisse); sp.push(...r.spiegel);
    if (forward) fw.push(...hypothesePaar(ctx, karte, forward, rnd).ereignisse);
  }
  const erg = hypotheseAuswerten({ ereignisse: ev, spiegel: sp, forward: forward ? fw : null, horizonte: karte.horizonte, haupt: karte.hauptHorizont, varianten });
  return { ...erg, abdeckung };
}

try {
  const erg = karte.typ === 'hypothese' ? await hypothese() : await strategie();
  erg.dauerSek = Math.round((Date.now() - start) / 100) / 10;
  parentPort.postMessage({ typ: 'fertig', ergebnis: erg });
} catch (err) {
  parentPort.postMessage({ typ: 'fehler', fehler: err.stack || err.message });
}
