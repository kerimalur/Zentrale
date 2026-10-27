// Typen für den Tab «Trading» (GVA-Linien aus dem Pine-Script «GVA Linien — Pur»).

export type TTf = '3D' | 'W' | 'M';
export type TSeite = 'long' | 'short';

export interface TLinie {
  id: string;
  tf: TTf;
  seite: TSeite;
  lvl: number;
  entstanden: string; // Start der bildenden Kerze B (JJJJ-MM-TT)
  alt: boolean; // aus Tageskerzen gebaut (älter als ~2 Jahre) → Level auf wenige Pips genau
}
export interface TOffen extends TLinie { abstandPips: number; abstandAtr: number }
export interface TTreffer extends TLinie { t: number; ungefaehr: boolean; pair?: string }

export interface TEinstellungen {
  meldungen: boolean;
  tfs: Record<TTf, boolean>;
  tolPct: number;
  k2Pct: number;
  tolBasis: 'body' | 'atr';
  atrLen: number;
  docht: boolean;
  touchTol: number;
  filterAn: boolean;
  filterAbstand: number;
  anker3d: string;
  feiertageAus: boolean;
}

export interface TPaarKurz {
  pair: string;
  preis?: number;
  zeit?: number;
  pip?: number;
  atrTag?: number;
  naechste?: Record<TTf, { long: TOffen | null; short: TOffen | null }>;
  naechsteLinie?: TOffen | null;
  offen?: number;
  fehler: string | null;
  laedt?: boolean;
}

// Stundenkerzen von Dukascopy (ab 2003), werden im Hintergrund Monat für Monat geladen
export interface DatenStand {
  an: boolean; laeuft: boolean; paar: string | null; da: number; gesamt: number; fertig: boolean;
  paareFertig: number; fehler: string | null; gesperrtBis: number | null; bisMonat: string;
  art: 'h1' | 'm5' | null; m5: { da: number; gesamt: number; fertig: boolean; paareFertig: number };
}
export interface TradingZustand {
  einstellungen: TEinstellungen;
  marktOffen: boolean;
  laedt: boolean;
  fortschritt: number;
  gesamt: number;
  stand: number | null;
  meldungenBereit: boolean;
  daten: DatenStand;
  paare: TPaarKurz[];
  treffer: (TTreffer & { pair: string })[];
}

export interface TPaarDetail {
  pair: string;
  pip: number;
  preis: number;
  zeit: number;
  atrTag: number;
  offen: TOffen[];
  treffer: TTreffer[];
  verworfen: number;
  chart: { tag: string; o: number; h: number; l: number; c: number }[];
  fehler: string | null;
}

export const TF_TEXT: Record<TTf, string> = { '3D': '3 Tage', W: 'Woche', M: 'Monat' };
export const stellen = (pair: string) => (pair.endsWith('JPY') ? 3 : 5);
export const kurs = (pair: string, x: number) => x.toFixed(stellen(pair));
export const datumCh = (iso: string) => { const [j, m, t] = iso.split('-'); return `${t}.${m}.${j.slice(2)}`; };
