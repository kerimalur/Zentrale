// Kleine Textfunktionen für den Zwischenbericht (Server-Seite, ohne Browser-Code).
export const dauer = (s) => {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} Min`;
};
