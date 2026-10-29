// Confluences eines Labor-Trades (Strategie «GVA → BOS → Fib»): welche Confluence in der Fib-Box lag, und Auswertung danach.
import type { LTrade } from './labor';

export const CONF_ARTEN = ['gva', 'd', 'w', 'm', 'poc', 'va'] as const;
export const CONF_TEXT: Record<string, string> = { gva: 'GVA-Linie', d: 'Daily Open', w: 'Weekly Open', m: 'Monthly Open', poc: 'Volumen-POC', va: 'Value Area' };
export const CONF_KURZ: Record<string, string> = { gva: 'GVA', d: 'DO', w: 'WO', m: 'MO', poc: 'POC', va: 'VA' };
export const CONF_FARBE: Record<string, string> = { gva: '#a78bfa', d: '#4ade80', w: '#fb923c', m: '#f43f5e', poc: '#facc15', va: '#38bdf8' };
// Value Area heisst bei Long «Low» (VAL), bei Short «High» (VAH)
export const confName = (art: string, seite?: number) => (art === 'va' && seite ? (seite > 0 ? 'Value Area Low' : 'Value Area High') : CONF_TEXT[art] || art);
export const confKurz = (art: string, seite?: number) => (art === 'va' && seite ? (seite > 0 ? 'VAL' : 'VAH') : CONF_KURZ[art] || art);

export interface ConfInfo { art: string; preis: number }
export interface VolProfil { art: string; tVon: number; tBis: number; lo: number; hoehe: number; v: number[]; poc: number; vah: number; val: number; zeilePoc: number; zeileVa: [number, number] }

// Alle Confluences des Trades (neu: info.confAlle inkl. Volumen). Ältere Läufe haben nur info.conf → vollstaendig = false.
export function confVon(t: LTrade): { liste: ConfInfo[]; vollstaendig: boolean } | null {
  const i = t.info as { conf?: ConfInfo[]; confAlle?: ConfInfo[] };
  if (Array.isArray(i.confAlle)) return { liste: i.confAlle, vollstaendig: true };
  if (Array.isArray(i.conf)) return { liste: i.conf, vollstaendig: false };
  return null;
}
export const hatConf = (trades: LTrade[]) => trades.some((t) => confVon(t) !== null);

export interface CStat { n: number; quote: number | null; avg: number | null; summe: number }
export function stat(trades: LTrade[]): CStat {
  const n = trades.length;
  const summe = trades.reduce((s, t) => s + t.r, 0);
  return { n, quote: n ? trades.filter((t) => t.r > 0).length / n : null, avg: n ? summe / n : null, summe };
}
const arten = (t: LTrade, wahl: string[]) => (confVon(t)?.liste || []).map((c) => c.art).filter((a) => wahl.includes(a));

// Auswertung für eine Auswahl von Confluence-Arten
export function confAuswertung(trades: LTrade[], wahl: string[]) {
  const mit = trades.filter((t) => confVon(t) !== null);
  const einzeln = wahl.map((a) => {
    const hat = mit.filter((t) => arten(t, [a]).length > 0), nicht = mit.filter((t) => arten(t, [a]).length === 0);
    return { art: a, mit: stat(hat), ohne: stat(nicht), haeufigkeit: mit.length ? hat.length / mit.length : 0 };
  });
  const proAnzahl = new Map<number, LTrade[]>();
  const proKombi = new Map<string, LTrade[]>();
  for (const t of mit) {
    const a = arten(t, wahl);
    const k = Math.min(a.length, 3);
    proAnzahl.set(k, [...(proAnzahl.get(k) || []), t]);
    const key = [...a].sort((x, y) => CONF_ARTEN.indexOf(x as never) - CONF_ARTEN.indexOf(y as never)).join('+') || '—';
    proKombi.set(key, [...(proKombi.get(key) || []), t]);
  }
  return {
    einzeln,
    anzahl: [0, 1, 2, 3].map((k) => ({ k, stat: stat(proAnzahl.get(k) || []) })),
    kombi: [...proKombi.entries()].map(([key, ts]) => ({ key, stat: stat(ts) })).sort((a, b) => b.stat.n - a.stat.n),
    ohneVolumen: mit.filter((t) => !confVon(t)?.vollstaendig).length,
    ohneConfDaten: trades.length - mit.length,
  };
}

// Trades, die mindestens `min` der gewählten Confluences hatten (zum Nachrechnen «was wäre, wenn …»)
export function confFilter<T extends LTrade>(trades: T[], wahl: string[], min: number): T[] {
  return trades.filter((t) => (confVon(t) === null ? min === 0 : arten(t, wahl).length >= min));
}
