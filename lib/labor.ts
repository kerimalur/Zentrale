// Typen für Trading → Labor (Strategien und Hypothesen testen).
export interface LParam { key: string; name: string; typ: 'zahl' | 'auswahl' | 'mehrfach' | 'schalter'; standard: unknown; min?: number; max?: number; schritt?: number; optionen?: { wert: string; text: string }[]; hilfe?: string }
export interface LBaustein { id: string; name: string; beschreibung: string; parameter: LParam[]; gerichtet?: boolean; mitEreignissen?: boolean }
export interface LTeil { id: string; p: Record<string, unknown> }
export interface LKarte {
  typ: 'strategie' | 'hypothese' | 'fremd'; name: string; beschreibung?: string; mechanismus?: string; erwartung?: string; erfolgskriterium?: string;
  geplanteVarianten?: number; paare?: string[]; backtest?: { von: number; bis: number }; forward?: { von: number };
  filter?: LTeil[];
  modell?: string; parameter?: Record<string, unknown>; ereignisse?: LTeil[];
  bias?: { tf?: string; richtung: string; tage: number; ereignisse: LTeil[]; quelle?: 'fremd'; idee?: string } | null;
  tf?: string; richtung?: string; nurNeu?: boolean; horizonte?: number[]; hauptHorizont?: number;
  // Fremddaten-Hypothese (typ 'fremd')
  modus?: 'bedingung' | 'liste'; start?: 'beginn' | 'jede'; saison?: { von: string; bis: string } | null; warten?: number;
  bedingungen?: LBedingung[]; liste?: { datum: string; text?: string; seite?: number | null }[]; maerkte?: LMarktWahl[];
  stufe2?: { aktiv: boolean; modell: 'woche' | 'ausbruch' | 'ruecksetzer'; n: number; halten: number } | null;
  kette?: LKette; bekanntAb?: string; wege?: string[];
}
export interface LKette { ereignis?: string; mechanismus?: string; wirkung?: string; markt?: string; zeitraum?: string }
export interface LBedingung {
  reihe: string; verz: number; agg: { art: 'roh' | 'rollend' | 'woche' | 'monat'; tage: number; fn: 'mittel' | 'summe' | 'min' | 'max' }; diff: number;
  mess: { art: 'wert' | 'aenderung' | 'aenderungProzent' | 'anomalie' | 'zscore' | 'perzentil'; perioden: number; vorjahre: number; fenster: number };
  vergleich: '>' | '<'; schwelle: number;
}
export interface LMarktWahl { id: string; kosten?: number; handelbar?: boolean }
export interface LMarkt { id: string; name: string; gruppe: string; handelbar: boolean; kosten: number; hinweis?: string }
export interface LFremdBausteine {
  maerkte: LMarkt[]; gruppen: string[]; reihen: { gruppe: string; id: string; name: string; verz: number; hinweis?: string }[];
  orte: { id: string; name: string; orte: string[] }[]; wetterGroessen: { wert: string; text: string }[]; cotMaerkte: { wert: string; text: string }[]; cotGroessen: { wert: string; text: string }[];
  wege: { id: string; name: string; text: string }[]; fallen: { stichworte: string[]; text: string }[]; leitfragen: string[]; jahre: { von: number; bis: number };
  eigene: { id: string; name: string; n: number; von: string | null; bis: string | null; quelle: string }[]; verzoegerung: Record<string, number>;
}
export interface LBausteine {
  strategien: LBaustein[]; ereignisse: LBaustein[]; filter: LBaustein[]; paare: string[];
  zeitrahmen: { wert: string; text: string }[]; vorlagen: { id: string; name: string; karte: LKarte }[]; jahre: { von: number; bis: number };
  fremd: LFremdBausteine;
}
export interface LLauf {
  id: string; idee: string; v: number; art: 'backtest' | 'forward'; status: 'wartet' | 'laeuft' | 'fertig' | 'fehler';
  erstellt: string; start: string | null; ende: string | null; fortschritt: { fertig: number; gesamt: number; paar: string | null } | null; fehler: string | null;
  kurz: { urteil: string; warum: string; n: number; nUnabhaengig: number; avgR: number | null; quote: number | null; dauerSek: number; mittelProzent?: number | null; mehrwertProzent?: number | null } | null;
}
export interface LExtern { id: string; datum: string; urteil: string | null; stufe: string; kernzahl: string; link: string; text: string; n: number | null; nUnabhaengig: number | null }
export interface LZettel {
  id: string; erstellt: string; geaendert: string; titel: string; text: string; tags: string[]; status: 'roh' | 'ausgearbeitet' | 'getestet' | 'verworfen';
  kette: LKette; spiegel: string; fragen: string; quellen: string; wege: string[]; links: string[]; idee: string | null; farbe: 'gelb' | 'blau' | 'gruen' | 'rot' | 'grau';
}
export interface LImportEintrag { nr: string; art: 'idee' | 'zettel' | 'ergebnis'; name: string; typ?: string; ziel: string; urteil?: string | null; kernzahl?: string; link?: string; ideeId?: string | null }
export interface LReiheVorschau { id: string; name: string; freq: string; quelle: string; link: string | null; hinweis: string | null; veraltet: string | null; von: string; bis: string; n: number; letzte: [string, number][]; verlauf: [number, number][]; fehler?: string }
export interface LIdeeKurz {
  id: string; name: string; typ: 'strategie' | 'hypothese' | 'fremd'; version: number; eingefroren: boolean; erstellt: string; geaendert: string;
  varianten: number; forwardOffen: boolean; forwardGeoeffnet: Record<string, string>; lauf: LLauf | null;
  ergebnis: ({ lauf: string; v: number; art: string } & NonNullable<LLauf['kurz']>) | null;
  tags: string[]; extern: LExtern | null; maerkte: string[] | null;
}
export interface LIdee extends LIdeeKurz { versionen: { v: number; karte: LKarte; erstellt: string; eingefroren: string | null }[]; laeufe: LLauf[]; notizen: string; externAlle: LExtern[] }

// Ergebnis einer Fremddaten-Hypothese (Renditen in %)
export interface LFHorizont { h: number; n: number; nUnabhaengig: number; mittel: number | null; median: number | null; quote: number | null; bereich: [number, number] | null; saison: number | null; mehrwert: number | null; zufall: number | null; p: number | null; gleichzeitig: number | null; gleichzeitigN: number }
export interface LFFall { markt: string; tag: number; en: number; ex: number; r: number; s: number | null; m: number | null; text?: string }
export interface LFJahr { jahr: string; start: number; laenge: number; pts: [number, number][]; baender: [number, number][]; trades: { en: number; ex: number; r: number; fw: boolean }[]; staerke: number | null }
export interface LFErgebnis {
  typ: 'fremd'; urteil: string; warum: string; aendern: string; haupt: number; n: number; nUnabhaengig: number; varianten: number; raster: LZeile[];
  horizonte: LFHorizont[]; faelle: LFFall[]; forward: { n: number; mittel: number | null; quote: number | null; mehrwert: number | null; faelle: LFFall[] } | null;
  proJahr: LGruppe[]; proJahrzehnt: LGruppe[]; proMarkt: { id: string; name: string; n: number; avg: number | null; mehrwert: number | null; quote: number | null }[];
  handelbar: { id: string; name: string; handelbar: boolean; n: number; netto: number | null; mehrwert: number | null; kosten: number }[];
  kennzahlen: { n: number; quote?: number; bereich?: [number, number] | null; avg?: number | null; median?: number | null; avgGewinn?: number | null; avgVerlust?: number | null; pf?: number | null; maxDD?: number | null; schlechtester?: number | null; bester?: number | null; summe?: number | null };
  monteCarlo: { trades: number; dd50: number; dd95: number; dd99: number; serie95: number; chance10R: number } | null;
  verluste: { markt: string; en: number; ex: number; r: number }[];
  dosis: { quintile: { q: number; n: number; avg: number | null; quote: number | null }[]; spearman: { rho: number; p: number; n: number } | null; n: number } | null;
  varianten_raster: { warten: number[]; horizonte: number[]; schwellen: { faktor: number; schwelle: number | null; zellen: { warten: number; h: number; n: number; mittel: number | null; mehrwert: number | null; quote: number | null }[] }[]; aktuell: { warten: number; h: number; faktor: number } };
  stufe2: { modell: string; halten: number; innen: { n: number; avg: number | null; quote: number | null }; aussen: { n: number; avg: number | null; quote: number | null }; gegen: { n: number; avg: number | null; quote: number | null }; forward: { n: number; avg: number | null; quote: number | null } | null; p: number | null } | null;
  proJahrGrafik: LFJahr[]; hauptmarkt: { id: string; name: string }; ereignisseGesamt: number;
  abdeckung: { id: string; name: string; quelle: string; link: string | null; von: string; bis: string; n: number; freq: string; veraltet: string | null; hinweis: string | null }[];
  marktNamen: Record<string, string>; dauerSek: number; karte: LKarte; lauf: { id: string; art: string; v: number; start: string; ende: string }; schonGesehen?: boolean;
}
export const pText = (x: number | null | undefined, st = 2) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(st).replace('.', ',')} %`);
export const tagDatum = (t: number) => new Date(t * 86_400_000).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
// Markdown als Datei herunterladen
export function mdHerunterladen(datei: string, md: string) {
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = datei; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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
