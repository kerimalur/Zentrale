export type FKategorie = 'produktiv' | 'neutral' | 'ablenkung';
export interface FGeraet { id: string; name: string; art: 'android' | 'windows' | 'linux' | 'browser'; zuletzt: number | null; online: boolean; ips: string[]; jetzt: { art: string; name: string; seit: number } | null; websperre: boolean; version: string | null; erstellt: number }
export interface FEintrag { key: string; name: string; art: 'app' | 'prog' | 'web'; sek: number; geraete: Record<string, number>; kategorie: FKategorie; manuell: boolean }
export interface FSperre { id: string; typ: 'domain' | 'app' | 'bereich'; wert: string; modus: 'immer' | 'zeit' | 'limit'; von: string; bis: string; limitMin: number; geraete: 'alle' | string[]; an: boolean; aktiv: boolean; nutzungMin: number | null }
export type FSumme = Record<FKategorie, number>;
export interface FokusZustand {
  zeit: number; tag: string; heute: string;
  geraete: FGeraet[];
  proGeraet: Record<string, FSumme & { gesamt: number }>;
  gesamt: FSumme;
  eintraege: FEintrag[];
  stunden: number[];
  verlauf: ({ tag: string } & FSumme)[];
  sperren: FSperre[];
  bereiche: Record<string, string>;
  pihole: { gruppe: number | null; fehler: string | null; zeit: number; domains: number; clients: number };
  code: { bis: number } | null;
}
