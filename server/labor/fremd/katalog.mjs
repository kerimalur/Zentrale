// Katalog für Fremddaten-Hypothesen: handelbare Märkte, Ereignis-Quellen (Wetter, Geopolitik, Makro, Positionierung …),
// Orts-Gruppen für Wetter und die Fallen aus dem Hypothesen-Skill. Alles hier ist nur Beschreibung – geholt wird in quellen.mjs.
//
// Eine Reihe wird überall mit einem Schlüssel beschrieben:
//   fred:<ID>            FRED-Serie (CSV)              yahoo:<Symbol>     Yahoo-Tageskurse (adjclose, sonst close)
//   nasa:<Orte>:<Grösse> NASA POWER Tageswetter        oni                El-Niño-Index (NOAA CPC, monatlich)
//   gpr:<Spalte>         Geopolitical Risk Index       eia:<Pfad>         EIA-Excel-Datei (z. B. ng/hist_xls/RNGC1d)
//   cot:<Code>:<Grösse>  CFTC-Positionierung           fx:<PAAR>          Tagesschlüsse aus den Kursdaten der Zentrale
//   roll:<gas|oel>       rollender Future aus EIA K1/K2 eigene:<id>        eigene Reihe (CSV eingefügt)

export const GRUPPEN = ['Energie', 'Metalle', 'Agrar', 'Devisen', 'Devisen (FRED, ab 1971)', 'Indizes'];

// Handelbare (oder als Vergleich nützliche) Zielmärkte. kosten = geschätzte Kosten pro Trade in % (Spread, Rollen, Gebühren).
export const MAERKTE = [
  { id: 'roll:gas', name: 'Erdgas-Future rollend', gruppe: 'Energie', handelbar: true, kosten: 0.15, hinweis: 'EIA Kontrakt 1/2 ab 1994, am Rolltag ohne Preislücke; nach dem Ende der EIA-Daten (April 2024) mit den Renditen von UNG fortgesetzt.' },
  { id: 'fred:DHHNGSP', name: 'Erdgas Henry Hub Spot', gruppe: 'Energie', handelbar: false, kosten: 0, hinweis: 'Spot zeigt Mechanismen, ist aber nicht direkt handelbar – Spot ≠ Future.' },
  { id: 'yahoo:UNG', name: 'UNG Erdgas-ETF', gruppe: 'Energie', handelbar: true, kosten: 0.05, hinweis: 'Verliert durch das Rollen ständig an Wert: Short gewinnt strukturell. Darum zählt nur der Mehrwert über der Saison.' },
  { id: 'fred:PNGASEUUSDM', name: 'Erdgas Europa (IMF, monatlich)', gruppe: 'Energie', handelbar: false, kosten: 0 },
  { id: 'fred:PNGASJPUSDM', name: 'LNG Asien (IMF, monatlich)', gruppe: 'Energie', handelbar: false, kosten: 0 },
  { id: 'roll:oel', name: 'WTI-Öl-Future rollend', gruppe: 'Energie', handelbar: true, kosten: 0.08, hinweis: 'EIA Cushing Kontrakt 1/2 ab 1983, rollend; nach dem Ende der EIA-Daten mit den Renditen von USO fortgesetzt.' },
  { id: 'fred:DCOILWTICO', name: 'WTI Spot', gruppe: 'Energie', handelbar: false, kosten: 0 },
  { id: 'fred:DCOILBRENTEU', name: 'Brent Spot', gruppe: 'Energie', handelbar: false, kosten: 0 },
  { id: 'yahoo:USO', name: 'USO Öl-ETF', gruppe: 'Energie', handelbar: true, kosten: 0.05, hinweis: 'Rollverluste wie bei UNG.' },
  { id: 'yahoo:BZ=F', name: 'Brent-Future (Yahoo, nicht rollbereinigt)', gruppe: 'Energie', handelbar: true, kosten: 0.08, hinweis: 'Yahoo-Futures (=F) sind nicht rollbereinigt: Rollsprünge zählen als Rendite.' },
  { id: 'yahoo:GC=F', name: 'Gold-Future (Yahoo)', gruppe: 'Metalle', handelbar: true, kosten: 0.05, hinweis: 'Nicht rollbereinigt; bei Gold sind die Rollsprünge klein.' },
  { id: 'yahoo:GLD', name: 'GLD Gold-ETF', gruppe: 'Metalle', handelbar: true, kosten: 0.03 },
  { id: 'yahoo:SI=F', name: 'Silber-Future (Yahoo)', gruppe: 'Metalle', handelbar: true, kosten: 0.08 },
  { id: 'yahoo:HG=F', name: 'Kupfer-Future (Yahoo)', gruppe: 'Metalle', handelbar: true, kosten: 0.08 },
  { id: 'fred:PCOPPUSDM', name: 'Kupfer (IMF, monatlich)', gruppe: 'Metalle', handelbar: false, kosten: 0 },
  { id: 'yahoo:ZW=F', name: 'Weizen-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.12, hinweis: 'Nicht rollbereinigt: Rollsprünge zählen als Rendite.' },
  { id: 'fred:PWHEAMTUSDM', name: 'Weizen (IMF, monatlich)', gruppe: 'Agrar', handelbar: false, kosten: 0 },
  { id: 'yahoo:WEAT', name: 'WEAT Weizen-ETF', gruppe: 'Agrar', handelbar: true, kosten: 0.08 },
  { id: 'yahoo:ZC=F', name: 'Mais-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.12 },
  { id: 'fred:PMAIZMTUSDM', name: 'Mais (IMF, monatlich)', gruppe: 'Agrar', handelbar: false, kosten: 0 },
  { id: 'yahoo:ZS=F', name: 'Soja-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.1 },
  { id: 'yahoo:KC=F', name: 'Kaffee-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.15 },
  { id: 'yahoo:CC=F', name: 'Kakao-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.15 },
  { id: 'yahoo:SB=F', name: 'Zucker-Future (Yahoo)', gruppe: 'Agrar', handelbar: true, kosten: 0.12 },
  { id: 'yahoo:^GSPC', name: 'S&P 500', gruppe: 'Indizes', handelbar: true, kosten: 0.03 },
  { id: 'yahoo:^GDAXI', name: 'DAX', gruppe: 'Indizes', handelbar: true, kosten: 0.03 },
  { id: 'yahoo:^N225', name: 'Nikkei 225', gruppe: 'Indizes', handelbar: true, kosten: 0.04 },
  // FRED-Devisen (lange Historie). dreh = true heisst: FRED notiert umgekehrt zum Paar, die Zentrale dreht den Kurs.
  { id: 'fred:DEXUSEU', name: 'EURUSD (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXUSUK', name: 'GBPUSD (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXUSAL', name: 'AUDUSD (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXUSNZ', name: 'NZDUSD (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.03 },
  { id: 'fred:DEXJPUS', name: 'USDJPY (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXSZUS', name: 'USDCHF (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXCAUS', name: 'USDCAD (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.02 },
  { id: 'fred:DEXNOUS', name: 'USDNOK (FRED)', gruppe: 'Devisen (FRED, ab 1971)', handelbar: true, kosten: 0.05 },
];

// Orts-Gruppen für Wetter (NASA POWER, Tageswerte ab 1981). Mittelwert über alle Orte.
export const ORTE = {
  'us-gas': { name: 'USA Heizgebiet (Gas)', orte: [['Chicago', 41.88, -87.63], ['New York', 40.71, -74.01], ['Boston', 42.36, -71.06], ['Philadelphia', 39.95, -75.17], ['Detroit', 42.33, -83.05], ['Pittsburgh', 40.44, -80.0], ['Minneapolis', 44.98, -93.27]] },
  'us-sued': { name: 'USA Süden (Kühlung/Strom)', orte: [['Houston', 29.76, -95.37], ['Dallas', 32.78, -96.8], ['Atlanta', 33.75, -84.39], ['Phoenix', 33.45, -112.07]] },
  'eu-gas': { name: 'Europa Heizgebiet', orte: [['Berlin', 52.52, 13.4], ['Paris', 48.86, 2.35], ['London', 51.51, -0.13], ['Mailand', 45.46, 9.19], ['Amsterdam', 52.37, 4.9], ['Warschau', 52.23, 21.01]] },
  'us-mais': { name: 'USA Maisgürtel', orte: [['Des Moines', 41.59, -93.62], ['Springfield IL', 39.78, -89.65], ['Indianapolis', 39.77, -86.16], ['Lincoln NE', 40.81, -96.7], ['Columbus OH', 39.96, -83.0]] },
  'us-weizen': { name: 'USA Winterweizen (Plains)', orte: [['Wichita', 37.69, -97.34], ['Dodge City', 37.75, -100.02], ['Oklahoma City', 35.47, -97.52], ['Amarillo', 35.22, -101.83]] },
  'schwarzmeer': { name: 'Schwarzmeer-Weizen (RU/UA)', orte: [['Krasnodar', 45.04, 38.98], ['Rostow', 47.24, 39.71], ['Stawropol', 45.04, 41.97], ['Odessa', 46.48, 30.72], ['Charkiw', 49.99, 36.23]] },
  'br-kaffee': { name: 'Brasilien Kaffee (Minas Gerais)', orte: [['Varginha', -21.55, -45.43], ['Patrocínio', -18.94, -46.99], ['Franca', -20.54, -47.4]] },
  'br-soja': { name: 'Brasilien Soja (Mato Grosso/Goiás)', orte: [['Sorriso', -12.55, -55.71], ['Rondonópolis', -16.47, -54.64], ['Rio Verde', -17.8, -50.92]] },
  'ar-pampa': { name: 'Argentinien Pampa', orte: [['Rosario', -32.95, -60.65], ['Pergamino', -33.89, -60.57], ['Córdoba', -31.42, -64.18]] },
  'au-weizen': { name: 'Australien Weizen', orte: [['Wagga Wagga', -35.12, 147.37], ['Dubbo', -32.25, 148.6], ['Northam', -31.65, 116.67]] },
  'westafrika': { name: 'Westafrika Kakao', orte: [['Soubré', 5.79, -6.61], ['Daloa', 6.88, -6.45], ['Kumasi', 6.69, -1.62]] },
  'indien': { name: 'Indien Monsun', orte: [['Nagpur', 21.15, 79.09], ['Indore', 22.72, 75.86], ['Pune', 18.52, 73.86]] },
  'japan': { name: 'Japan', orte: [['Tokio', 35.68, 139.69], ['Osaka', 34.69, 135.5]] },
};

export const WETTER_GROESSEN = [
  { wert: 'T2M', text: 'Temperatur Ø (°C)' }, { wert: 'T2M_MIN', text: 'Temperatur Minimum (°C)' }, { wert: 'T2M_MAX', text: 'Temperatur Maximum (°C)' },
  { wert: 'HDD', text: 'Heizgradtage (18 °C)' }, { wert: 'CDD', text: 'Kühlgradtage (18 °C)' }, { wert: 'PRECTOTCORR', text: 'Niederschlag (mm/Tag)' },
  { wert: 'RH2M', text: 'Luftfeuchtigkeit (%)' }, { wert: 'WS2M', text: 'Wind (m/s)' },
];

// CFTC-Codes (Legacy, nur Futures) – stabil, auch wenn sich die Marktnamen ändern
export const COT_MAERKTE = [
  ['023651', 'Erdgas (NYMEX)'], ['067651', 'WTI-Öl (NYMEX)'], ['088691', 'Gold (COMEX)'], ['084691', 'Silber (COMEX)'], ['085692', 'Kupfer (COMEX)'],
  ['001602', 'Weizen SRW (CBOT)'], ['002602', 'Mais (CBOT)'], ['005602', 'Soja (CBOT)'], ['083731', 'Kaffee (ICE)'], ['073732', 'Kakao (ICE)'], ['080732', 'Zucker (ICE)'],
  ['099741', 'Euro'], ['096742', 'Pfund'], ['097741', 'Yen'], ['092741', 'Franken'], ['090741', 'Kanada-Dollar'], ['232741', 'Australien-Dollar'], ['112741', 'Neuseeland-Dollar'],
];
export const COT_GROESSEN = [
  { wert: 'netto', text: 'Spekulanten netto (Kontrakte)' }, { wert: 'anteil', text: 'Spekulanten netto in % des Open Interest' }, { wert: 'kommerziell', text: 'Kommerzielle netto (Kontrakte)' },
];

// Vorlagen für Ereignis-Reihen (frei ergänzbar mit eigenem FRED-/Yahoo-Schlüssel). verz = Tage vom Periodenende bis bekannt.
export const REIHEN = [
  { gruppe: 'Wetter', id: 'nasa:us-gas:HDD', name: 'Heizgradtage USA Heizgebiet', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:eu-gas:HDD', name: 'Heizgradtage Europa', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:us-sued:CDD', name: 'Kühlgradtage USA Süden', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:us-mais:PRECTOTCORR', name: 'Regen USA Maisgürtel', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:us-mais:T2M_MAX', name: 'Hitze USA Maisgürtel', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:us-weizen:PRECTOTCORR', name: 'Regen USA Winterweizen', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:schwarzmeer:PRECTOTCORR', name: 'Regen Schwarzmeer', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:br-kaffee:T2M_MIN', name: 'Frost Brasilien Kaffee (Minimum)', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:br-soja:PRECTOTCORR', name: 'Regen Brasilien Soja', verz: 1 },
  { gruppe: 'Wetter', id: 'nasa:westafrika:PRECTOTCORR', name: 'Regen Westafrika Kakao', verz: 1 },
  { gruppe: 'Klima', id: 'oni', name: 'El Niño (ONI)', verz: 10 },
  { gruppe: 'Geopolitik', id: 'gpr:GPRD', name: 'Geopolitisches Risiko täglich (GPR)', verz: 1 },
  { gruppe: 'Geopolitik', id: 'gpr:GPRD_ACT', name: 'GPR – Taten (Krieg, Angriffe)', verz: 1 },
  { gruppe: 'Geopolitik', id: 'gpr:GPRD_THREAT', name: 'GPR – Drohungen', verz: 1 },
  { gruppe: 'Geopolitik', id: 'gpr:GPR', name: 'GPR monatlich (ab 1985)', verz: 5 },
  { gruppe: 'Energie', id: 'eia:ng/hist_xls/NW2_EPG0_SWO_R48_BCFw', name: 'Erdgas-Speicher USA (wöchentlich)', verz: 6 },
  { gruppe: 'Energie', id: 'fred:DHHNGSP', name: 'Erdgas Spot', verz: 1 },
  { gruppe: 'Energie', id: 'fred:DCOILBRENTEU', name: 'Brent Spot', verz: 1 },
  { gruppe: 'Makro', id: 'fred:VIXCLS', name: 'VIX (Angst)', verz: 1 },
  { gruppe: 'Makro', id: 'fred:DGS10', name: 'US-Zins 10 Jahre', verz: 1 },
  { gruppe: 'Makro', id: 'fred:T10Y2Y', name: 'Zinskurve 10J–2J', verz: 1 },
  { gruppe: 'Makro', id: 'fred:DTWEXBGS', name: 'Dollar-Index (breit)', verz: 1 },
  { gruppe: 'Makro', id: 'fred:BAMLH0A0HYM2', name: 'Risikoaufschlag Hochzins', verz: 1 },
  { gruppe: 'Makro', id: 'fred:CPIAUCSL', name: 'US-Inflation (CPI, monatlich)', verz: 15, hinweis: 'Stichtag ≠ Veröffentlichung: CPI kommt Mitte Folgemonat, Werte werden revidiert (ALFRED wäre genauer).' },
  { gruppe: 'Makro', id: 'fred:UNRATE', name: 'US-Arbeitslosigkeit (monatlich)', verz: 7 },
  { gruppe: 'Positionierung', id: 'cot:023651:anteil', name: 'COT Erdgas Spekulanten %', verz: 3 },
  { gruppe: 'Positionierung', id: 'cot:088691:anteil', name: 'COT Gold Spekulanten %', verz: 3 },
  { gruppe: 'Positionierung', id: 'cot:001602:anteil', name: 'COT Weizen Spekulanten %', verz: 3 },
  { gruppe: 'Positionierung', id: 'cot:099741:anteil', name: 'COT Euro Spekulanten %', verz: 3 },
];

// Standard-Verzögerung (Tage ab Periodenende bis bekannt) nach Quelle und Frequenz
export function standardVerzoegerung(id, freq) {
  const v = REIHEN.find((r) => r.id === id)?.verz;
  if (v !== undefined) return v;
  if (id.startsWith('cot:')) return 3;
  if (id === 'oni') return 10;
  if (freq === 'M') return 15;
  if (freq === 'W') return 6;
  return 1;
}

// Wege zu mehr Fällen (Skill, Abschnitt 4)
export const WEGE = [
  { id: 'feiner', name: 'Feinere Ereignisse', text: 'Tage/Wochen statt Monate (Kältewelle statt kalter Monat), nur nicht überlappende Fälle.' },
  { id: 'historie', name: 'Längere Historie', text: 'Proxies: Spot vor Futures, IMF-Monatspreise, FRED-Devisen ab 1971, NASA-Wetter ab 1981. Strukturbrüche nennen.' },
  { id: 'querschnitt', name: 'Mehr Märkte (Querschnitt)', text: 'Gleicher Mechanismus in mehreren Märkten/Regionen, pro Markt und gepoolt zeigen.' },
  { id: 'spiegel', name: 'Spiegel-Hypothese', text: 'Das Gegenereignis muss die Gegenwirkung zeigen (warm statt kalt).' },
  { id: 'dosis', name: 'Stetiges Signal (Dosis-Wirkung)', text: 'Alle Perioden in Quintile nach Stärke teilen – steigt die Wirkung mit der Stärke?' },
  { id: 'kette', name: 'Kette zerlegen', text: 'Jeden Zwischenschritt einzeln testen (Kälte → Speicher → Preis).' },
  { id: 'bias', name: 'Bias-Fenster + Entry-Model', text: 'Monty Stufe 2: im Fenster mit festem Entry-Model viele kleinere Trades.' },
];

// Fallen aus bisherigen Tests (Skill, Abschnitt 7) – werden im Brainstorm nach Stichworten angezeigt
export const FALLEN = [
  { stichworte: ['gas', 'erdgas', 'öl', 'oel', 'weizen', 'mais', 'future', 'rohstoff'], text: 'Spot ≠ Future: Erdgas nach kaltem Monat im Spot −15 %, im rollenden Future kaum Effekt.' },
  { stichworte: ['winter', 'kalt', 'kälte', 'saison', 'sommer', 'hitze', 'ernte', 'frühling'], text: 'Saison frisst den Effekt: Kältewelle-Short verdient Geld, aber fast nur, weil Gas vom Winter in den Frühling ohnehin fällt.' },
  { stichworte: ['ung', 'uso', 'etf'], text: 'ETF-Rollverlust: Short UNG gewinnt strukturell.' },
  { stichworte: ['usd', 'dollar', 'eurusd', 'währung', 'waehrung', 'fx'], text: 'Währungs-Verzerrung: Rohstoffe in USD gegen USD-Paare → Kreuzkurse nutzen. NOK/CAD hängen am Öl → Öl herausrechnen.' },
  { stichworte: ['norwegen', 'nok', 'exporteur', 'export'], text: 'Exporteur ≠ starke Währung: Norwegen legt Energie-Einnahmen über den Ölfonds im Ausland an.' },
  { stichworte: ['krieg', 'konflikt', 'angriff', 'schock', 'geopolit', 'gpr'], text: 'Zwei Kanäle bei Schocks: Rohstoff-Kanal (Exporteure gewinnen) und Angst-Kanal (USD, CHF, Gold gewinnen) laufen oft gegeneinander.' },
  { stichworte: ['aktie', 'firma', 'branche', 'hvac'], text: 'Branchen-Annahmen prüfen: US-HVAC-Firmen verdienen v. a. an Kühlung, nicht an Heizung.' },
  { stichworte: ['monat', 'monatlich'], text: 'Monatsdaten sind grob: kurze Effekte (Tage) werden unsichtbar.' },
  { stichworte: [], text: 'Frei verfügbare Daten sind oft schon eingepreist – der Markt kennt das Wetter auch.' },
];

// Leitfragen fürs Brainstormen (aus Skill-Abschnitt 1–4)
export const LEITFRAGEN = [
  'Welches messbare Ereignis genau? (Schwelle, gegen welche Vergleichsjahre?)',
  'Ab wann ist es bekannt? (Veröffentlichung, nicht Stichtag)',
  'Welcher Mechanismus verbindet Ereignis und Preis – in welchen Zwischenschritten?',
  'Welcher Markt ist handelbar (Future/ETF statt Spot)?',
  'Welche Saison steckt schon drin?',
  'Was wäre das Spiegel-Ereignis und seine Gegenwirkung?',
  'Wie kommen mehr unabhängige Fälle zusammen?',
  'Ist es wohl schon eingepreist? Wer weiss es vor dir?',
];
