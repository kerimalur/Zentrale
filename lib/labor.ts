// Typen für Trading → Labor (Strategien und Hypothesen testen).
export interface LParam { key: string; name: string; typ: 'zahl' | 'auswahl' | 'mehrfach' | 'schalter'; standard: unknown; min?: number; max?: number; schritt?: number; optionen?: { wert: string; text: string }[]; hilfe?: string }
export interface LBaustein { id: string; name: string; beschreibung: string; parameter: LParam[]; gerichtet?: boolean; mitEreignissen?: boolean }
export interface LTeil { id: string; p: Record<string, unknown> }
export interface LKarte {
  typ: 'strategie' | 'hypothese'; name: string; beschreibung?: string; mechanismus?: string; erwartung?: string; erfolgskriterium?: string;
  geplanteVarianten?: number; paare?: string[]; backtest?: { von: number; bis: number }; forward?: { von: number };
  filter?: LTeil[];
  modell?: string; parameter?: Record<string, unknown>; ereignisse?: LTeil[];
  bias?: { tf: string; richtung: string; tage: number; ereignisse: LTeil[] } | null;
  tf?: string; richtung?: string; nurNeu?: boolean; horizonte?: number[]; hauptHorizont?: number;
}
export interface LBausteine {
  strategien: LBaustein[]; ereignisse: LBaustein[]; filter: LBaustein[]; paare: string[];
  zeitrahmen: { wert: string; text: string }[]; vorlagen: { id: string; name: string; karte: LKarte }[]; jahre: { von: number; bis: number };
}
export interface LLauf {
  id: string; idee: string; v: number; art: 'backtest' | 'forward'; status: 'wartet' | 'laeuft' | 'fertig' | 'fehler';
  erstellt: string; start: string | null; ende: string | null; fortschritt: { fertig: number; gesamt: number; paar: string | null } | null; fehler: string | null;
  kurz: { urteil: string; warum: string; n: number; nUnabhaengig: number; avgR: number | null; quote: number | null; dauerSek: number } | null;
}
export interface LIdeeKurz {
  id: string; name: string; typ: 'strategie' | 'hypothese'; version: number; eingefroren: boolean; erstellt: string; geaendert: string;
  varianten: number; forwardOffen: boolean; forwardGeoeffnet: Record<string, string>; lauf: LLauf | null;
  ergebnis: ({ lauf: string; v: number; art: string } & NonNullable<LLauf['kurz']>) | null;
}
export interface LIdee extends LIdeeKurz { versionen: { v: number; karte: LKarte; erstellt: string; eingefroren: string | null }[]; laeufe: LLauf[] }

export interface LZeile { id: string; name: string; status: 'ja' | 'nein' | 'offen'; text: string }
export interface LGruppe { schluessel: string; n: number; avg: number | null; quote: number }
export interface LKennzahlen { n: number; gewinner?: number; quote?: number; bereich?: [number, number] | null; avgR?: number | null; summeR?: number | null; avgGewinn?: number | null; avgVerlust?: number | null; pf?: number | null; maxDD?: number | null; verlustSerie?: number; sqn?: number | null; median?: number | null; bester?: number | null; schlechtester?: number | null }
export interface LTrade { pair: string; seite: number; tSignal: number; tEin: number; tAus: number; ein: number; sl: number; tp: number | null; aus: number; grund: string; risikoPips: number; r: number; spreadR: number; mfe: number; mae: number; spiegel: number; info: Record<string, unknown> }
export interface LAbdeckung { pair: string; quelle: string | null; ab?: number; bis?: number; zuGrob?: boolean; fehlt?: boolean }
export interface LHorizont {
  h: number; n: number; nUnabhaengig: number; mittel: number | null; median: number | null; quote: number | null; bereich: [number, number] | null;
  saison: number | null; mehrwert: number | null; zufall: number | null; p: number | null; h1: number | null; h2: number | null; ohne: number | null;
  spiegel: number | null; spiegelN: number; forward: { n: number; mittel: number | null; quote: number | null } | null;
  proJahr: LGruppe[]; proPaar: LGruppe[]; faelle: { pair: string; t: number; seite: number; r: number; s: number | null }[];
}
export interface LErgebnis {
  typ: 'strategie' | 'hypothese'; urteil: string; warum: string; n: number; nUnabhaengig: number; varianten: number; raster: LZeile[];
  abdeckung: LAbdeckung[]; dauerSek: number; karte: LKarte; lauf: { id: string; art: string; v: number; start: string; ende: string }; schonGesehen?: boolean;
  // Strategie
  kennzahlen?: LKennzahlen; zufall?: { mittel: number | null; p: number | null; n: number }; proJahr?: LGruppe[]; proPaar?: LGruppe[]; proSeite?: LGruppe[];
  kurve?: [number, number][]; forward?: { kennzahlen: LKennzahlen; kurve: [number, number][]; nUnabhaengig: number } | null;
  monteCarlo?: { trades: number; dd50: number; dd95: number; dd99: number; serie95: number; chance10R: number } | null;
  trichter?: Record<string, number>; grundAusstieg?: LGruppe[]; mfeMedian?: number | null; maeMedian?: number | null; uebersprungen?: number;
  trades?: LTrade[]; forwardTrades?: LTrade[] | null; parameter?: Record<string, unknown>;
  // Hypothese
  haupt?: number; horizonte?: LHorizont[];
}

export const URTEIL_FARBE: Record<string, string> = { 'Bestätigt': 'var(--gruen)', 'Hinweis': '#d6a23a', 'Nicht bestätigt': 'var(--fehler)', 'Zu wenig Daten': 'var(--muted)' };
export const rText = (x: number | null | undefined, st = 2) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(st).replace('.', ',')} R`);
export const atrText = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(3).replace('.', ',')} ATR`);
export const prozent = (x: number | null | undefined, st = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(st).replace('.', ',')} %`);

// Standardwerte eines Parameter-Schemas
export function standardWerte(schema: LParam[], p: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const s of schema) out[s.key] = p[s.key] ?? s.standard;
  return out;
}
