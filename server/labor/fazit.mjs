// Fazit pro Ergebnis: Ampel, ein Satz, vier Kernzahlen, worauf achten, was würde das Urteil ändern, Handelsregel in einer Zeile.
// Gebaut aus dem fertigen Ergebnis (Strategie, Kurs-Hypothese, Fremddaten-Hypothese) – rechnet nichts neu und nutzt nur,
// was dort schon steht. Alte Ergebnisse bekommen das Fazit beim Laden.
import { STRATEGIE } from './strategien/index.mjs';
import { mitStandard } from './bausteine.mjs';

const AMPEL = { 'Bestätigt': 'gruen', 'Hinweis': 'gelb', 'Nicht bestätigt': 'rot', 'Zu wenig Daten': 'grau' };

const zahlText = (x, st) => x.toFixed(st).replace('.', ',');
const vorz = (x, st) => `${x >= 0 ? '+' : ''}${zahlText(x, st)}`;
const nn = (x) => x !== null && x !== undefined && Number.isFinite(x);
const pz = (x, st = 1) => (nn(x) ? `${vorz(x, st)} %` : '—');
const rt = (x, st = 2) => (nn(x) ? `${vorz(x, st)} R` : '—');
const at = (x) => (nn(x) ? `${vorz(x, 2)} ATR` : '—');
const proz = (x) => (nn(x) ? `${Math.round(x * 100)} %` : '—');
const pw = (p) => (nn(p) ? zahlText(p, 3) : '—');

const status = (e, id) => e.raster?.find((z) => z.id === id)?.status ?? null;
const richtungText = (r) => (r === 'short' ? 'Short' : r === 'long' ? 'Long' : 'Long und Short');

// Warnungen aus dem Robustheitsraster, wichtigste zuerst
function warnungen(e, nU, nGrenze) {
  const w = [];
  if (nU < nGrenze) w.push(`Nur ${nU} unabhängige Fälle – für ein belastbares Urteil sind ${nGrenze}+ nötig.`);
  const st = (id) => status(e, id);
  if (st('forward') === 'nein') w.push('Forward ist deutlich schwächer als der Backtest – Overfitting möglich.');
  if (st('haelften') === 'nein') w.push('Hält nur in einer Hälfte des Zeitraums.');
  if (st('pseudo') === 'nein') w.push('Das letzte Drittel (Pseudo-Forward) bestätigt es nicht.');
  if (st('saison') === 'nein') w.push('Kein Mehrwert über der Saison – der gleiche Kalendertag ohne Ereignis ist genauso gut.');
  if (st('zufall') === 'nein') w.push('Nicht klar besser als zufällige Einstiege (p ≥ 0,05).');
  if (st('handelbar') === 'nein') w.push('Nach Kosten nicht handelbar.');
  if (st('kosten') === 'nein') w.push('Kippt ins Minus, wenn der Spread doppelt so hoch ist.');
  if (st('nachbarn') === 'nein') w.push('Benachbarte Parameter kippen ins Minus – Verdacht auf Zufallstreffer.');
  if (st('ausreisser') === 'nein') w.push('Hängt an wenigen Ausreissern: ohne die besten und schlechtesten Fälle nicht mehr positiv.');
  if (st('placebo') === 'nein') w.push('Ein halbes Jahr verschoben wirkt es fast genauso – dann ist es kein Ereignis-Effekt.');
  if (st('spiegel') === 'nein') w.push('Die Gegenrichtung verliert nicht – das spricht für einen allgemeinen Drift, nicht für deine Regel.');
  if (st('jahre') === 'nein') w.push('Nur in wenigen Jahren positiv.');
  if (st('paare') === 'nein') w.push('Nur bei wenigen Paaren positiv.');
  if (st('bias') === 'nein') w.push('Das Bias-Fenster hilft nicht: ausserhalb ist das Entry-Model genauso gut.');
  if (st('bonferroni') === 'nein') w.push(`Besteht die strengere Grenze für ${e.varianten} getestete Varianten nicht.`);
  if (st('forward') === 'offen') w.push('Forward-Zeitraum noch gesperrt – erst der Forward-Test entscheidet.');
  if (e.schonGesehen) w.push('Der Forward wurde schon bei einer früheren Version angeschaut – nicht mehr unvoreingenommen.');
  for (const a of e.abdeckung || []) {
    if (a.veraltet) w.push(`${a.name}: ${a.veraltet}`);
    if (a.zuGrob) w.push(`${a.pair}: nur gröbere Kursdaten als nötig.`);
    if (a.fehlt) w.push(`${a.pair}: keine Kursdaten.`);
  }
  return w;
}

function aendernText(e) {
  if (e.aendern) return e.aendern;
  if (e.urteil === 'Zu wenig Daten') return 'Mehr unabhängige Fälle (mindestens 30): längere Historie, mehr Paare oder eine weniger strenge Regel.';
  if (e.urteil === 'Nicht bestätigt') return 'Ein Ergebnis klar über dem Zufall (p < 0,05), das in beiden Hälften und im Forward hält.';
  if (e.urteil === 'Bestätigt') return 'Ein deutlich schwächerer Forward oder ein Ergebnis, das nach höheren Kosten verschwindet.';
  return status(e, 'forward') === 'offen' ? 'Der Forward-Test: hält er, wird aus dem Hinweis ein «Bestätigt», wenn auch die übrigen Kernprüfungen stehen.' : 'Mehr Fälle und bestandene Kernprüfungen (Zufall, Hälften, Kosten, Mehrfachtests).';
}

function meta(e) {
  const k = e.karte || {};
  const forward = e.lauf?.art === 'forward';
  return `Version ${e.lauf?.v ?? '?'} · ${forward ? 'Backtest + Forward' : 'nur Backtest'} · ${k.backtest?.von}–${k.backtest?.bis}${forward ? `, Forward ab ${k.forward?.von}` : ''} · ${e.varianten} getestete Variante${e.varianten === 1 ? '' : 'n'}`;
}

// ---------- Fremddaten-Hypothese ----------
function fazitFremd(e) {
  const H = e.horizonte.find((h) => h.h === e.haupt) || e.horizonte[0];
  const nU = e.nUnabhaengig;
  const bonf = 0.05 / Math.max(1, e.varianten);
  const k = e.karte;
  const satz = `Nach ${e.haupt} Tagen im Schnitt ${pz(H?.mittel)} in der erwarteten Richtung, der gleiche Kalendertag ohne Ereignis brachte ${pz(H?.saison)} – Mehrwert ${pz(H?.mehrwert)}, ${H?.n ?? 0} Fälle.`;
  const zahlen = [
    { titel: 'Unabhängige Fälle', wert: String(nU), unter: `${e.n} Fälle gesamt`, gut: nU >= 30 ? true : nU >= 15 ? null : false },
    { titel: 'Mehrwert über Saison', wert: pz(H?.mehrwert), unter: `Ereignis ${pz(H?.mittel)} · Saison ${pz(H?.saison)}`, gut: nn(H?.mehrwert) ? H.mehrwert > 0 : null },
    { titel: 'p-Wert', wert: pw(H?.p), unter: `Grenze ${pw(bonf)} bei ${e.varianten} Variante${e.varianten === 1 ? '' : 'n'}`, gut: nn(H?.p) ? H.p < bonf : null },
    e.forward
      ? { titel: 'Forward', wert: pz(e.forward.mittel), unter: `${e.forward.n} Fälle`, gut: nn(e.forward.mittel) ? e.forward.mittel > 0 : null }
      : { titel: 'Forward', wert: 'gesperrt', unter: 'noch nicht geöffnet', gut: null },
  ];
  const markt = e.hauptmarkt?.name || e.marktNamen?.[k.maerkte?.[0]?.id] || 'Markt';
  const regel = `${richtungText(k.richtung)} ${markt}: Einstieg ${k.warten ?? 0} Tage nach «bekannt», ${e.haupt} Tage halten.`;
  return { satz, zahlen, regel, nGrenze: 30 };
}

// ---------- Strategie ----------
function regelStrategie(e) {
  const k = e.karte;
  const def = STRATEGIE[k.modell];
  if (k.modell === 'gva-bos-fib' && def) {
    const p = mitStandard(def.parameter, k.parameter || {});
    const ungueltig = p.ungueltigAn ? `, ungültig bei −${Math.round(-p.ungueltig * 100)} %` : '';
    return `GVA ${p.tfs.join('/')} erster Treffer → BOS auf ${p.swingTf === '30m' ? '30' : '15'} Min (${p.fenster} Handelstage) → Limit bei Fib ${String(p.fib).replace('.', ',')}, SL ${Math.round(p.sl * 100)} %, TP ${String(Math.round(p.tp * 100)).replace('-', '−')} %${ungueltig}.`;
  }
  return `${k.name}${k.bias ? ' im Bias-Fenster' : ''}: Einstieg, Stop-Loss und Ziel wie in der Vorab-Karte.`;
}

function fazitStrategie(e) {
  const k = e.kennzahlen;
  const nU = e.nUnabhaengig;
  const bonf = 0.05 / Math.max(1, e.varianten);
  const satz = `${k.n} Trades: im Schnitt ${rt(k.avgR)} pro Trade bei ${proz(k.quote)} Trefferquote, Zufall ${rt(e.zufall?.mittel)}.`;
  const zahlen = [
    { titel: 'Unabhängige Trades', wert: String(nU), unter: `${k.n} Trades gesamt`, gut: nU >= 30 ? true : nU >= 15 ? null : false },
    { titel: 'Ø pro Trade', wert: rt(k.avgR), unter: `Zufall ${rt(e.zufall?.mittel)} · Profit-Faktor ${nn(k.pf) ? zahlText(k.pf, 2) : '—'}`, gut: nn(k.avgR) ? k.avgR > (e.zufall?.mittel ?? 0) && k.avgR > 0 : null },
    { titel: 'p-Wert', wert: pw(e.zufall?.p), unter: `Grenze ${pw(bonf)} bei ${e.varianten} Variante${e.varianten === 1 ? '' : 'n'}`, gut: nn(e.zufall?.p) ? e.zufall.p < bonf : null },
    e.forward
      ? { titel: 'Forward', wert: rt(e.forward.kennzahlen.avgR), unter: `${e.forward.kennzahlen.n} Trades · Treffer ${proz(e.forward.kennzahlen.quote)}`, gut: nn(e.forward.kennzahlen.avgR) ? e.forward.kennzahlen.avgR > 0 : null }
      : { titel: 'Forward', wert: 'gesperrt', unter: 'noch nicht geöffnet', gut: null },
  ];
  const extra = [];
  if (e.monteCarlo && e.monteCarlo.dd95 >= 8) extra.push(`Drawdown (95 %) ${zahlText(e.monteCarlo.dd95, 1)} R – bei 1 % Risiko pro Trade wären das ${zahlText(e.monteCarlo.dd95, 1)} %, Prop-Firm-Grenzen im Auge behalten.`);
  if (e.trichter?.ungueltig > 0) extra.push(`${e.trichter.ungueltig} Setups wurden ungültig, weil der Kurs schon weggelaufen war, bevor die Fib-Zone erreicht wurde.`);
  return { satz, zahlen, regel: regelStrategie(e), nGrenze: 30, extra };
}

// ---------- Kurs-Hypothese ----------
function fazitHypothese(e) {
  const H = e.horizonte.find((h) => h.h === e.haupt) || e.horizonte[0];
  const nU = e.nUnabhaengig;
  const bonf = 0.05 / Math.max(1, e.varianten);
  const satz = `Nach ${e.haupt} Handelstagen im Schnitt ${at(H?.mittel)}, der gleiche Kalendertag ohne Ereignis ${at(H?.saison)} – Mehrwert ${at(H?.mehrwert)}, ${H?.n ?? 0} Fälle.`;
  const zahlen = [
    { titel: 'Unabhängige Fälle', wert: String(nU), unter: `${e.n} Fälle gesamt`, gut: nU >= 30 ? true : nU >= 15 ? null : false },
    { titel: 'Mehrwert über Saison', wert: at(H?.mehrwert), unter: `Ereignis ${at(H?.mittel)} · Saison ${at(H?.saison)}`, gut: nn(H?.mehrwert) ? H.mehrwert > 0 : null },
    { titel: 'p-Wert', wert: pw(H?.p), unter: `Grenze ${pw(bonf)} bei ${e.varianten} Variante${e.varianten === 1 ? '' : 'n'}`, gut: nn(H?.p) ? H.p < bonf : null },
    H?.forward
      ? { titel: 'Forward', wert: at(H.forward.mittel), unter: `${H.forward.n} Fälle`, gut: nn(H.forward.mittel) ? H.forward.mittel > 0 : null }
      : { titel: 'Forward', wert: 'gesperrt', unter: 'noch nicht geöffnet', gut: null },
  ];
  const regel = `${richtungText(e.karte.richtung)} nach dem Ereignis, ${e.haupt} Handelstage halten.`;
  return { satz, zahlen, regel, nGrenze: 30 };
}

export function fazitBauen(e) {
  if (!e || !e.urteil) return null;
  const teil = e.typ === 'fremd' ? fazitFremd(e) : e.typ === 'hypothese' ? fazitHypothese(e) : fazitStrategie(e);
  const achten = [...warnungen(e, e.nUnabhaengig, teil.nGrenze), ...(teil.extra || [])].slice(0, 7);
  const handeln = e.urteil === 'Bestätigt' ? teil.regel : e.urteil === 'Hinweis' ? `Noch nicht handeln. Würde so aussehen: ${teil.regel}` : null;
  return {
    ampel: AMPEL[e.urteil] || 'grau', urteil: e.urteil, warum: e.warum, satz: teil.satz, zahlen: teil.zahlen, achten,
    aendern: aendernText(e), regel: handeln, regelHinweis: handeln ? null : e.urteil === 'Zu wenig Daten' ? 'Noch keine Regel ableitbar – zu wenige Fälle.' : 'Keine Handelsregel – nicht bestätigt.', meta: meta(e),
  };
}

// Kurzform für die Bibliothek (steht in lauf.kurz): ein Satz und die wichtigste Warnung
export function fazitKurz(e) {
  const f = fazitBauen(e);
  return f ? { einzeiler: f.satz, achten1: f.achten[0] || null } : { einzeiler: null, achten1: null };
}
