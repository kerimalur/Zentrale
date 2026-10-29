// Alle Strategie-Module. Neue Strategien: Datei in diesem Ordner anlegen (gleiche Form wie die anderen) und hier eintragen.
// Form: { id, name, beschreibung, parameter: [Schema], aufloesung(p) → nötige Daten-Auflösung (Sek.), nachbarn(p) → [p…],
//         setups(ctx, p) → { setups: [{ iSignal, seite, einstieg, sl | risiko, tp | rZiel, zeitEnde, info }], trichter } }
import gvaKerim from './gva-kerim.mjs';
import gvaBosFib from './gva-bos-fib.mjs';
import baukasten from './baukasten.mjs';
import openingRange from './opening-range.mjs';
import { donchian, maKreuz, rsiUmkehr } from './klassiker.mjs';

export const STRATEGIEN = [gvaKerim, gvaBosFib, baukasten, donchian, maKreuz, rsiUmkehr, openingRange];
export const STRATEGIE = Object.fromEntries(STRATEGIEN.map((s) => [s.id, s]));
