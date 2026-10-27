// Hypothesen (Monty Stufe 1): Ereignis → erwartete Richtung über feste Horizonte (Handelstage).
// Gemessen ab dem Open nach dem Ereignis bis zum Tagesschluss h Handelstage später, in Tages-ATR (Vortag) – so sind alle
// Paare vergleichbar. Vergleichsgruppen pro Ereignis:
//   - Saison: gleiches Paar, gleicher Kalendertag (±3 Tage) und gleiche Uhrzeit in allen anderen Jahren des Zeitraums
//   - Zufall: 10 zufällige Zeitpunkte im gleichen Kalendermonat eines zufälligen Jahres (für den Permutationstest)
import { ereignisseAuswerten, filterAnwenden } from './bausteine.mjs';
import { indexAb } from './daten.mjs';

function rendite(ctx, iE, seite, h) {
  const b = ctx.basis, t = ctx.tag();
  if (iE >= b.n) return null;
  const dk = t.idx[iE] + h;
  if (dk >= t.D.n - 1) return null; // letzter Tag evtl. unvollständig
  const a = ctx.tagesAtr(iE);
  if (!(a > 0)) return null;
  return (seite * (b.c[t.D.en[dk]] - b.o[iE])) / a;
}

export function hypothesePaar(ctx, k, bereich, rnd) {
  const b = ctx.basis;
  const [von, bis] = bereich;
  const signale = (richtung) => {
    const { z, signale: s } = ereignisseAuswerten(ctx, k.tf, k.ereignisse || [], richtung, k.nurNeu !== false);
    const roh = s.map(({ k: kk, seite }) => ({ iSignal: z.en[kk], seite }));
    return filterAnwenden(ctx, roh, k.filter).filter((x) => b.t[x.iSignal] >= von && b.t[x.iSignal] < bis);
  };
  const H = k.horizonte;
  const jahre = [];
  for (let j = new Date(von * 1000).getUTCFullYear(); j <= new Date((bis - 1) * 1000).getUTCFullYear(); j++) jahre.push(j);

  const auswerten = (liste, mitVergleich) => liste.map((s) => {
    const iE = s.iSignal + 1;
    const r = H.map((h) => rendite(ctx, iE, s.seite, h));
    const ev = { pair: ctx.pair, t: b.t[s.iSignal], sd: b.sd[Math.min(iE, b.n - 1)], seite: s.seite, r };
    if (mitVergleich) {
      // Saison
      const d = new Date(b.t[iE] * 1000);
      const summe = H.map(() => [0, 0]);
      for (const j of jahre) {
        if (j === d.getUTCFullYear()) continue;
        for (const off of [-3, 0, 3]) {
          const sek = Date.UTC(j, d.getUTCMonth(), d.getUTCDate() + off, d.getUTCHours(), d.getUTCMinutes()) / 1000;
          if (sek < von || sek >= bis) continue;
          const iS = indexAb(b, sek);
          H.forEach((h, x) => { const v = rendite(ctx, iS, s.seite, h); if (v !== null) { summe[x][0] += v; summe[x][1]++; } });
        }
      }
      ev.saison = summe.map(([s2, n]) => (n ? s2 / n : null));
      // Zufall: gleicher Kalendermonat, zufälliges Jahr
      ev.zufall = H.map(() => []);
      for (let z = 0; z < 10; z++) {
        const j = jahre[Math.floor(rnd() * jahre.length)];
        const m0 = Date.UTC(j, d.getUTCMonth(), 1) / 1000, m1 = Date.UTC(j, d.getUTCMonth() + 1, 1) / 1000;
        const sek = m0 + Math.floor(rnd() * (m1 - m0));
        if (sek < von || sek >= bis) continue;
        const iZ = indexAb(b, sek);
        H.forEach((h, x) => { const v = rendite(ctx, iZ, s.seite, h); if (v !== null) ev.zufall[x].push(Number(v.toFixed(4))); });
      }
    }
    ev.r = ev.r.map((v) => (v === null ? null : Number(v.toFixed(4))));
    if (ev.saison) ev.saison = ev.saison.map((v) => (v === null ? null : Number(v.toFixed(4))));
    return ev;
  });

  const ereignisse = auswerten(signale(k.richtung), true);
  // Spiegel: das Gegen-Ereignis (nur sinnvoll, wenn nur eine Richtung getestet wird)
  const spiegel = k.richtung === 'beide' ? [] : auswerten(signale(k.richtung === 'long' ? 'short' : 'long'), false);
  return { ereignisse, spiegel };
}
