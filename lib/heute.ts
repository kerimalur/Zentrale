// Typen für den Tab «Heute» (Google: Mail aufräumen, Kalender, Aufgaben).

export interface HMail { id: string; thread: string; von: string; email: string; betreff: string; zeit: number; vorschau: string }
export interface HTermin { id: string; titel: string; ort: string | null; link: string | null; ganztaegig: boolean; start: string; ende: string; kalender: string; farbe: string }
export interface HAufgabe { id: string; titel: string; notiz: string | null; faellig: string | null }
export interface HAbsender {
  email: string; name: string; n: number; ungelesen: number; werbung: number; letzte: number; betreff: string;
  abmelden: 'einklick' | 'mail' | 'link' | null; link: string | null; behalten: boolean; regel: 'archivieren' | 'loeschen' | null;
}
export interface HScan { laeuft: boolean; fortschritt: number; gesamt: number; zeit: number | null; fehler: string | null; absender: HAbsender[] }
export interface HWerbefilter { an: boolean; aktion: 'archivieren' | 'loeschen'; absenderAusnahmen: string[]; woerterAusnahmen: string[]; aktiv: boolean; query: string }

export interface HeuteZustand {
  eingerichtet: boolean;
  verbunden: boolean;
  email: string | null;
  rueckUrl: string;
  abgelaufen?: boolean;
  wichtig?: HMail[] | null; wichtigFehler?: string | null;
  termine?: HTermin[] | null; termineFehler?: string | null;
  aufgaben?: HAufgabe[] | null; aufgabenFehler?: string | null;
  werbefilter?: HWerbefilter;
  behalten?: string[];
  scan?: HScan;
}
