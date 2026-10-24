// Anzeige-Hilfen (Schweizer Format).

const zahlFmt = new Intl.NumberFormat('de-CH');

export const zahl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : zahlFmt.format(Math.round(n)));

export function bytes(b: number | null | undefined, stellen = 1): string {
  if (b === null || b === undefined) return '—';
  if (b < 1) return '0 B';
  const e = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(e.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(stellen).replace('.', ',')} ${e[i]}`;
}

export const komma = (n: number | null | undefined, stellen = 1) => (n === null || n === undefined ? '—' : n.toFixed(stellen).replace('.', ','));

export function relativ(t: string | number | null | undefined): string {
  if (!t) return '—';
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  if (!Number.isFinite(ms)) return '—';
  const d = Date.now() - ms;
  if (d < 60_000) return 'jetzt';
  if (d < 3600_000) return `vor ${Math.round(d / 60_000)} Min`;
  if (d < 24 * 3600_000) return `vor ${Math.round(d / 3600_000)} Std`;
  if (d < 48 * 3600_000) return 'gestern';
  return `vor ${Math.round(d / 86400_000)} Tagen`;
}

export function uhr(t: number): string {
  const d = new Date(t);
  const heute = new Date();
  const gestern = new Date(Date.now() - 86400_000);
  const hm = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === heute.toDateString()) return hm;
  if (d.toDateString() === gestern.toDateString()) return `gestern ${hm}`;
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
}

export function laufzeit(s: number): string {
  const t = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (t > 0) return `${t} ${t === 1 ? 'Tag' : 'Tage'} ${h} Std`;
  if (h > 0) return `${h} Std ${m} Min`;
  return `${m} Min`;
}

export function datumLang(): string {
  return new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ablauf(bis: number | null): { text: string; prozent: number } {
  if (!bis) return { text: 'ohne Ablauf', prozent: 100 };
  const rest = bis - Date.now();
  if (rest <= 0) return { text: 'läuft ab …', prozent: 0 };
  const tage = rest / 86400_000;
  const text = tage < 1 ? `läuft in ${Math.max(1, Math.round(rest / 3600_000))} Std ab` : tage < 2 ? 'läuft morgen ab' : `läuft in ${Math.round(tage)} Tagen ab`;
  return { text, prozent: Math.max(3, Math.min(100, (tage / 30) * 100)) };
}
