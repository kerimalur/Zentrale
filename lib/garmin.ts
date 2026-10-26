// Hilfen und Auswertungen für den Tab «Gesundheit».
import type { IconName } from '@/components/ui';
import { komma, zahl } from './format';

export interface Wert { tag: string; v: number }

// ---------- Anzeige ----------
export const dauer = (s: number | null | undefined) => {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const neg = s < 0;
  const a = Math.abs(s);
  const h = Math.floor(a / 3600);
  const m = Math.round((a % 3600) / 60);
  return (neg ? '−' : '') + (h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} Min`);
};
export const zeitHM = (t: number) => new Date(t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
export const alsDatum = (tag: string) => new Date(tag + 'T12:00:00');
export const wochentag = (tag: string) => alsDatum(tag).toLocaleDateString('de-CH', { weekday: 'short' }).replace('.', '');
export const datumKurz = (tag: string) => alsDatum(tag).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' });
export const datumLang = (tag: string) => alsDatum(tag).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
export const monatName = (monat: string, jahr = true) => new Date(monat + '-15T12:00:00').toLocaleDateString('de-CH', jahr ? { month: 'long', year: 'numeric' } : { month: 'short' });
export const uhrzeitAusMinuten = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function bbFarbe(v: number | null) {
  if (v === null) return { a: '#64748b', b: '#94a3b8', text: 'keine Daten' };
  if (v >= 75) return { a: '#0f766e', b: '#14b8a6', text: 'voll geladen' };
  if (v >= 50) return { a: '#1d4ed8', b: '#3b82f6', text: 'gut' };
  if (v >= 25) return { a: '#c2410c', b: '#f59e0b', text: 'mittel' };
  return { a: '#9f1239', b: '#e11d48', text: 'leer – Erholung nötig' };
}
export function schlafStufe(score: number | null) {
  if (score === null) return { farbe: '#94a3b8', text: '—' };
  if (score >= 90) return { farbe: '#15803d', text: 'ausgezeichnet' };
  if (score >= 80) return { farbe: '#16a34a', text: 'gut' };
  if (score >= 60) return { farbe: '#d97706', text: 'okay' };
  return { farbe: '#dc2626', text: 'schlecht' };
}
export function stressFarbe(v: number) {
  if (v <= 25) return '#38bdf8';
  if (v <= 50) return '#f59e0b';
  if (v <= 75) return '#f97316';
  return '#dc2626';
}
export const SCHLAF_FARBEN = { tief: '#1e3a8a', leicht: '#60a5fa', rem: '#a855f7', wach: '#f472b6' };

const AKTIVITAET: { test: RegExp; name: string; icon: IconName; farbe: string }[] = [
  { test: /strength|weight/, name: 'Krafttraining', icon: 'hantel', farbe: '#7e3fd6' },
  { test: /treadmill|indoor_running/, name: 'Laufband', icon: 'lauf', farbe: '#2457f5' },
  { test: /run/, name: 'Laufen', icon: 'lauf', farbe: '#2457f5' },
  { test: /cycl|bik/, name: 'Velo', icon: 'velo', farbe: '#0e7490' },
  { test: /swim/, name: 'Schwimmen', icon: 'schwimmen', farbe: '#0284c7' },
  { test: /hik/, name: 'Wandern', icon: 'wandern', farbe: '#15803d' },
  { test: /walk/, name: 'Gehen', icon: 'schritte', farbe: '#16a34a' },
  { test: /yoga|pilates|breath/, name: 'Yoga', icon: 'welle', farbe: '#be185d' },
  { test: /hiit|cardio|fitness/, name: 'Cardio', icon: 'herz', farbe: '#dc2626' },
];
export const aktivitaetsArt = (typ: string) => AKTIVITAET.find((a) => a.test.test(typ)) || { name: 'Andere', icon: 'blitz' as IconName, farbe: '#475569' };

// ---------- Rechnen ----------
export const mittel = (a: (number | null | undefined)[]) => {
  const v = a.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
export const streuung = (a: number[]) => {
  const m = mittel(a);
  if (m === null || a.length < 2) return null;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export const tagVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const tagPlus = (tag: string, n: number) => { const d = alsDatum(tag); d.setDate(d.getDate() + n); return tagVon(d); };
export const heute = () => tagVon(new Date());

// Werte im Zeitraum (n Tage bis heute; null = alles)
export const imZeitraum = (r: Wert[], n: number | null) => (n === null ? r : r.filter((x) => x.tag > tagPlus(heute(), -n)));
// Der gleich lange Zeitraum davor
export const davor = (r: Wert[], n: number | null) => (n === null ? [] : r.filter((x) => x.tag > tagPlus(heute(), -2 * n) && x.tag <= tagPlus(heute(), -n)));

// Gleitender Schnitt über die letzten «fenster» Kalendertage
export function gleitend(r: Wert[], fenster: number): Wert[] {
  const out: Wert[] = [];
  let start = 0, summe = 0;
  for (let i = 0; i < r.length; i++) {
    summe += r[i].v;
    const grenze = tagPlus(r[i].tag, -fenster);
    while (r[start].tag <= grenze) { summe -= r[start].v; start++; }
    out.push({ tag: r[i].tag, v: summe / (i - start + 1) });
  }
  return out;
}

export function monatsMittel(r: Wert[]) {
  const m = new Map<string, number[]>();
  for (const x of r) { const k = x.tag.slice(0, 7); (m.get(k) || m.set(k, []).get(k)!).push(x.v); }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, v]) => ({ monat, v: mittel(v)!, n: v.length }));
}

export function monatsSumme(r: Wert[]) {
  const m = new Map<string, number>();
  for (const x of r) { const k = x.tag.slice(0, 7); m.set(k, (m.get(k) || 0) + x.v); }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, v]) => ({ monat, v }));
}

export function wochenSumme(r: Wert[]) {
  const m = new Map<string, number>();
  for (const x of r) {
    const d = alsDatum(x.tag);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = tagVon(d);
    m.set(k, (m.get(k) || 0) + x.v);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, v]) => ({ tag, v }));
}

export const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export function wochentagMittel(r: Wert[]) {
  const t: number[][] = [[], [], [], [], [], [], []];
  for (const x of r) t[(alsDatum(x.tag).getDay() + 6) % 7].push(x.v);
  return t.map((v, i) => ({ tag: WOCHENTAGE[i], v: mittel(v), n: v.length }));
}

// Lineare Steigung pro 30 Tage
export function trend30(r: Wert[]) {
  if (r.length < 10) return null;
  const t0 = alsDatum(r[0].tag).getTime();
  const xs = r.map((x) => (alsDatum(x.tag).getTime() - t0) / 86400_000);
  const mx = mittel(xs)!, my = mittel(r.map((x) => x.v))!;
  let zaehler = 0, nenner = 0;
  r.forEach((x, i) => { zaehler += (xs[i] - mx) * (x.v - my); nenner += (xs[i] - mx) ** 2; });
  return nenner ? (zaehler / nenner) * 30 : null;
}

// Zusammenhang: Ziel an Tag D gegen Faktor an Tag D+versatz (meist Vortag: −1).
// Teilt die Tage am Median des Faktors und vergleicht den Schnitt des Ziels.
export function zusammenhang(ziel: Wert[], faktor: Wert[], versatz = -1) {
  const f = new Map(faktor.map((x) => [x.tag, x.v]));
  const paare = ziel.map((z) => ({ z: z.v, f: f.get(tagPlus(z.tag, versatz)) })).filter((p): p is { z: number; f: number } => typeof p.f === 'number');
  if (paare.length < 30) return null;
  const grenze = median(paare.map((p) => p.f))!;
  const hoch = paare.filter((p) => p.f > grenze), tief = paare.filter((p) => p.f <= grenze);
  if (hoch.length < 10 || tief.length < 10) return null;
  const mh = mittel(hoch.map((p) => p.z))!, mt = mittel(tief.map((p) => p.z))!;
  const s = streuung(paare.map((p) => p.z)) || 1;
  return { grenze, mittelHoch: mh, mittelTief: mt, diff: mh - mt, staerke: Math.abs(mh - mt) / s, n: paare.length };
}

// Prozentuale Veränderung
export const prozent = (jetzt: number | null, vorher: number | null) => (jetzt === null || vorher === null || vorher === 0 ? null : ((jetzt - vorher) / Math.abs(vorher)) * 100);

export const fmtZahl = (v: number | null, stellen = 0) => (v === null ? '—' : stellen ? komma(v, stellen) : zahl(v));
