// Eigene Strategie aus Bausteinen: Ereignisse (UND-verknüpft) auf einem Zeitrahmen → Einstieg zum Open der nächsten Kerze,
// Ausstieg mit SL/TP/Zeit wie eingestellt. Damit lassen sich beliebige neue Ideen ohne Programmieren testen.
import { param, AUSSTIEG, EREIGNIS, ereignisseAuswerten, setupsAusSignalen, mitStandard } from '../bausteine.mjs';
import { TF_LISTE, TF_TEXT } from '../daten.mjs';

const { auswahl, schalter } = param;
export const TF_OPTIONEN = TF_LISTE.map((t) => ({ wert: t, text: TF_TEXT[t] }));
export const RICHTUNG = auswahl('richtung', 'Richtung', 'beide', [{ wert: 'long', text: 'nur Long' }, { wert: 'short', text: 'nur Short' }, { wert: 'beide', text: 'beide' }]);

export default {
  id: 'baukasten',
  name: 'Eigene Regel (Baukasten)',
  beschreibung: 'Ereignisse frei kombinieren (UND), Einstieg zum nächsten Open, Ausstieg mit SL/TP/Zeit.',
  mitEreignissen: true,
  aufloesung: (p) => ({ '5m': 300, '15m': 900, '30m': 1800 }[p.tf] || 3600),
  parameter: [auswahl('tf', 'Zeitrahmen', '1H', TF_OPTIONEN), RICHTUNG, schalter('nurNeu', 'Nur wenn neu', true, 'Ereignis zählt nur, wenn es bei der Kerze davor noch nicht galt'), ...AUSSTIEG],
  // Nachbarn: jede Zahl der Ereignisse um ±20 % (auf ihr Raster gerundet) – Robustheit, kein Aussuchen
  nachbarn(p) {
    const out = [];
    for (const f of [0.8, 1.2]) {
      let geaendert = false;
      const ereignisse = (p.ereignisse || []).map(({ id, p: ep }) => {
        const def = EREIGNIS[id];
        const v = mitStandard(def.parameter, ep);
        for (const s of def.parameter) if (s.typ === 'zahl') {
          const neu = Math.min(s.max, Math.max(s.min, Math.round((v[s.key] * f) / s.schritt) * s.schritt));
          if (neu !== v[s.key]) { v[s.key] = Number(neu.toFixed(4)); geaendert = true; }
        }
        return { id, p: v };
      });
      if (geaendert) out.push({ ...p, ereignisse });
    }
    return out;
  },
  setups(ctx, p) {
    const { z, signale } = ereignisseAuswerten(ctx, p.tf, p.ereignisse || [], p.richtung, p.nurNeu);
    return { setups: setupsAusSignalen(ctx, z, signale, p), trichter: { signale: signale.filter((s) => ctx.imBereich(z.en[s.k])).length } };
  },
};
