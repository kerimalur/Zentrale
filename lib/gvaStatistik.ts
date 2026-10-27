// Typen für Trading → Statistik (wie funktionieren GVA-Linien beim ersten Treffer?).
import type { DatenStand } from './trading';

export interface GParameter { reaktion: number; durchstich: number; fenster: number; atrBasis: 'tag' | 'tf' | 'pips'; splitJahr: number }
export interface GFilter {
  tfs?: string[]; seite?: 'beide' | 'long' | 'short'; paare?: string[]; waehrung?: string;
  vonJahr?: number | null; bisJahr?: number | null; alterMin?: number | null; alterMax?: number | null;
  konfluenz?: 'egal' | 'mit' | 'ohne'; trend?: 'egal' | 'mit' | 'gegen'; sitzung?: string; nurStunden?: boolean;
}
export type Bereich = [number, number] | null;
export interface GGruppe { schluessel: string; n: number; quote: number; bereich: Bereich }
export interface GEreignis {
  id: string; pair: string; tf: string; seite: 'long' | 'short'; lvl: number; entstanden: string; t: number;
  art: 'erfolg' | 'spaet' | 'durch' | 'keine' | 'unklar'; durchstich: number | null; reaktion: number | null; dauer: number | null; tage: number | null;
  pips: number; stundengenau: boolean; konfluenz: boolean; trend: 'mit' | 'gegen' | null;
}
export interface GStatistik {
  parameter: GParameter; standard: GParameter; filterAnzahl: number;
  n: number; gesamtEreignisse: number; fehlend: string[]; daten: DatenStand;
  ergebnis: { erfolg: number; spaet: number; durch: number; keine: number; unklar: number };
  irgendwann: number | null; maxTage: number; ereignisseGesamt: number;
  quote: number | null; bereich: Bereich;
  zufall: { n: number; quote: number | null; bereich: Bereich };
  durchstich: { p50: number | null; p80: number | null; p90: number | null; hist: { von: number; bis: number; n: number }[] };
  reaktionMedian: number | null; dauerMedianStunden: number | null;
  faecher: { tag: number; p10: number; p25: number; p50: number; p75: number; p90: number; n: number }[];
  gruppen: Record<'tf' | 'seite' | 'pair' | 'jahr' | 'alter' | 'konfluenz' | 'trend' | 'sitzung' | 'wochentag', GGruppe[]>;
  oos: { vorher: { n: number; quote: number | null; bereich: Bereich }; nachher: { n: number; quote: number | null; bereich: Bereich } };
  ereignisse: GEreignis[];
}
export interface GKerze { o: number; h: number; l: number; c: number }
export interface GBeispiel {
  id: string; pair: string; tf: string; seite: 'long' | 'short'; lvl: number; lvlRoh: number; entstanden: string; t: number;
  atr: number; atrPips: number; stundengenau: boolean; alterTage: number; konfluenz: boolean; trend: 'mit' | 'gegen' | null;
  ergebnis: { art: 'erfolg' | 'spaet' | 'durch' | 'keine' | 'unklar' | 'offen'; durchstich: number | null; reaktion: number | null; dauer: number | null; tage: number | null };
  fensterEnde: number | null; entscheidung: number | null; kerzenStunden: number; einheitPips: number;
  grenzen: { reaktion: number; durchstich: number };
  htf: (GKerze & { tag: string })[]; A: string; B: string; trefferTag: string;
  verlauf: (GKerze & { t: number })[];
  parameter: GParameter;
}

export const ART_TEXT: Record<GEreignis['art'] | 'offen', string> = { erfolg: 'Umkehr', spaet: 'Umkehr später', durch: 'Durchgeschossen', keine: 'Nichts in 30 Tagen', unklar: 'Unklar', offen: 'Läuft noch' };
export const ART_FARBE: Record<GEreignis['art'] | 'offen', string> = { erfolg: 'var(--gruen)', spaet: '#7fbf98', durch: 'var(--fehler)', keine: '#9aa3b5', unklar: '#d6a23a', offen: '#9aa3b5' };
export const pz = (x: number | null | undefined, st = 1) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(st).replace('.', ',')} %`);
export const kz = (x: number | null | undefined, st = 2) => (x === null || x === undefined ? '—' : x.toFixed(st).replace('.', ','));

export const einheitText = (p: Pick<GParameter, 'atrBasis'>) => (p.atrBasis === 'pips' ? 'Pips' : 'ATR');
