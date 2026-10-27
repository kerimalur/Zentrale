// Klassische Vergleichs-Strategien. Sie sind bewusst einfach und bekannt: Sie zeigen, was «normale» Regeln auf denselben
// Daten schaffen – eine eigene Idee sollte mindestens so gut sein. Gebaut aus denselben Bausteinen wie der Baukasten.
import { param, AUSSTIEG, ereignisseAuswerten, setupsAusSignalen, mitStandard } from '../bausteine.mjs';
import { TF_OPTIONEN, RICHTUNG } from './baukasten.mjs';

const { zahl, auswahl } = param;
// Ausstieg mit eigenen Standardwerten
const aus = (std) => AUSSTIEG.map((s) => (s.key in std ? { ...s, standard: std[s.key] } : s));
const tfMit = (std) => auswahl('tf', 'Zeitrahmen', std, TF_OPTIONEN);

function klassiker({ id, name, beschreibung, tf, parameter, ausstieg, ereignisse, nachbarn }) {
  return {
    id, name, beschreibung,
    aufloesung: (p) => ({ '5m': 300, '15m': 900, '30m': 1800 }[p.tf] || 3600),
    parameter: [tfMit(tf), RICHTUNG, ...parameter, ...aus(ausstieg)],
    nachbarn,
    setups(ctx, p) {
      const { z, signale } = ereignisseAuswerten(ctx, p.tf, ereignisse(p), p.richtung, true);
      return { setups: setupsAusSignalen(ctx, z, signale, p), trichter: { signale: signale.length } };
    },
  };
}

export const donchian = klassiker({
  id: 'donchian', name: 'Donchian-Ausbruch', beschreibung: 'Schluss über dem Hoch der letzten n Kerzen → Long (Turtle-Idee). Short gespiegelt.',
  tf: 'D', parameter: [zahl('n', 'Kerzen', 20, 5, 200, 1)], ausstieg: { slArt: 'atr', sl: 2, tpArt: 'r', tp: 3, zeit: 20 },
  ereignisse: (p) => [{ id: 'ausbruch', p: { n: p.n } }],
  nachbarn: (p) => [{ ...p, n: Math.round(p.n * 0.8) }, { ...p, n: Math.round(p.n * 1.2) }],
});
export const maKreuz = klassiker({
  id: 'ma-kreuz', name: 'Gleitende Durchschnitte', beschreibung: 'Schneller SMA kreuzt den langsamen → in diese Richtung.',
  tf: '4H', parameter: [zahl('schnell', 'Schnell', 20, 2, 200, 1), zahl('langsam', 'Langsam', 50, 3, 400, 1)], ausstieg: { slArt: 'atr', sl: 1.5, tpArt: 'r', tp: 2, zeit: 0 },
  ereignisse: (p) => [{ id: 'ma_kreuz', p: { schnell: p.schnell, langsam: p.langsam } }],
  nachbarn: (p) => [{ ...p, schnell: Math.round(p.schnell * 0.8), langsam: Math.round(p.langsam * 0.8) }, { ...p, schnell: Math.round(p.schnell * 1.2), langsam: Math.round(p.langsam * 1.2) }],
});
export const rsiUmkehr = klassiker({
  id: 'rsi-umkehr', name: 'RSI-Umkehr', beschreibung: 'RSI kommt aus dem überverkauften Bereich zurück → Long (Short gespiegelt).',
  tf: 'D', parameter: [zahl('n', 'RSI-Länge', 14, 2, 50, 1), zahl('schwelle', 'Schwelle', 30, 5, 45, 1)], ausstieg: { slArt: 'atr', sl: 1.5, tpArt: 'r', tp: 1.5, zeit: 10 },
  ereignisse: (p) => [{ id: 'rsi', p: { n: p.n, schwelle: p.schwelle, modus: 'zurueck' } }],
  nachbarn: (p) => [{ ...p, schwelle: Math.max(5, p.schwelle - 5) }, { ...p, schwelle: Math.min(45, p.schwelle + 5) }],
});

export { mitStandard };
