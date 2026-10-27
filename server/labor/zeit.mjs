// Schnelle Zeit-Helfer fürs Labor (werden pro Kerze aufgerufen, darum ohne Intl).
// Zürich: MEZ (UTC+1), Sommerzeit (UTC+2) vom letzten Sonntag im März 01:00 UTC bis letzten Sonntag im Oktober 01:00 UTC.
const TAG = 86_400;
const dstCache = new Map();
function euDst(jahr) {
  let v = dstCache.get(jahr);
  if (!v) {
    const letzterSonntag = (monat) => {
      const ende = Date.UTC(jahr, monat + 1, 0) / 1000; // letzter Tag des Monats 00:00
      const wt = new Date(ende * 1000).getUTCDay();
      return ende - wt * TAG;
    };
    v = [letzterSonntag(2) + 3600, letzterSonntag(9) + 3600];
    dstCache.set(jahr, v);
  }
  return v;
}

// Zürcher Ortszeit einer Unix-Sekunde: { stunde, minute, wochentag (0 = So), monat (1–12), tag, jahr }
export function zuerich(sek) {
  const j = new Date(sek * 1000).getUTCFullYear();
  const [a, b] = euDst(j);
  const lokal = new Date((sek + (sek >= a && sek < b ? 7200 : 3600)) * 1000);
  return { stunde: lokal.getUTCHours(), minute: lokal.getUTCMinutes(), wochentag: lokal.getUTCDay(), monat: lokal.getUTCMonth() + 1, tag: lokal.getUTCDate(), jahr: lokal.getUTCFullYear() };
}

// Sitzung nach Zürcher Stunde (wie Trading → Statistik)
export const sitzungVon = (h) => (h < 8 ? 'Asien' : h < 14 ? 'London' : h < 17 ? 'London + NY' : h < 22 ? 'New York' : 'Abend');
export const SITZUNGEN = ['Asien', 'London', 'London + NY', 'New York', 'Abend'];
export const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export const jahrVon = (sek) => new Date(sek * 1000).getUTCFullYear();
export const jahrStart = (j) => Date.UTC(j, 0, 1) / 1000;
