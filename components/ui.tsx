'use client';
// Kleine Bausteine: Icons, Ring, Verlaufskurve, Schalter.
import type { CSSProperties, ReactNode } from 'react';

export const ICONS = {
  nextcloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 5 19z',
  jellyfin: 'M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  vaultwarden: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z',
  pihole: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  syncthing: 'M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M18.5 2v4h-4M5.5 22v-4h4',
  kuma: 'M3 12h4l3-8 4 16 3-8h4',
  zahnrad: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  kalender: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  chip: 'M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3',
  sonne: 'M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  mond: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  ok: 'M20 6L9 17l-5-5',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  fehler: 'M12 8v4M12 16h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  gast: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  pc: 'M3 4h18v12H3zM8 20h8M12 16v4',
  tv: 'M2 6h20v12H2zM8 21h8M9 2l3 3 3-3',
  lautAus: 'M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6',
  lautMinus: 'M11 5L6 9H2v6h4l5 4zM16 12h6',
  lautPlus: 'M11 5L6 9H2v6h4l5 4zM16 12h6M19 9v6',
  handy: 'M7 2h10v20H7zM11 18h2',
  laptop: 'M3 5h18v11H3zM1 19h22',
  geraet: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20',
  neustart: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  schloss: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z',
  x: 'M6 6l12 12M18 6L6 18',
  kopieren: 'M9 9h11v11H9zM5 15H4V4h11v1',
  abmelden: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  ordner: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  datei: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  verknuepfung: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  zurueck: 'M15 18l-6-6 6-6',
  weiter: 'M9 18l6-6-6-6',
  laufwerk: 'M3 13h18v6H3zM5 13l2-8h10l2 8M7 16h.01M11 16h.01',
  herz: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  batterie: 'M2 7h16v10H2zM22 11v2M6 10v4M10 10v4',
  schritte: 'M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0zM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0z',
  flamme: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  treppe: 'M3 21h4v-4h4v-4h4V9h4V5',
  blitz: 'M13 2L3 14h9l-1 8 10-12h-9z',
  welle: 'M3 12h4l3-8 4 16 3-8h4',
  hantel: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  velo: 'M5.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM18.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2',
  lauf: 'M14 4a1.5 1.5 0 1 0 0-.01M7 21l3-6 3 2v4M9 10l3-3 3 3 3 1M10 15l-4 1',
  schwimmen: 'M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 13l4-4 3 3M16 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  wandern: 'M13 4a1.5 1.5 0 1 0 0-.01M10 21l2-7 3 3v4M8 11l2-3 4 1 2 3M18 9v12',
  musik: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ziel: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, stroke = 2, style, className }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Ring({ wert, groesse, dicke = 3, farbe, spur = '#e8ebf2', label, children }: { wert: number; groesse: number; dicke?: number; farbe: string; spur?: string; label: string; children?: ReactNode }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(wert) ? wert : 0));
  return (
    <div className="ringbox" style={{ width: groesse, height: groesse }}>
      <svg viewBox="0 0 36 36" width={groesse} height={groesse} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={label}>
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke={spur} strokeWidth={dicke} />
        <circle className="ring arc" cx="18" cy="18" r="15.9155" fill="none" stroke={farbe} strokeWidth={dicke} strokeLinecap="round" strokeDasharray={`${v} 100`} />
      </svg>
      <div className="ringbox-mitte">{children}</div>
    </div>
  );
}

export function Verlauf({ werte, verzoegerung = 0 }: { werte: number[]; verzoegerung?: number }) {
  const v = werte.length >= 2 ? werte : [5, 5];
  const mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const pts = v.map((x, i) => `${((i * 100) / (v.length - 1)).toFixed(1)},${(27 - ((x - mn) / r) * 22).toFixed(1)}`);
  const linie = 'M' + pts.join(' L');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="44" aria-hidden="true" style={{ display: 'block' }}>
      <path className="area" d={`${linie} L100,30 L0,30 Z`} fill="currentColor" opacity=".14" style={{ animationDelay: `${verzoegerung}ms` }} />
      <path className="spark" pathLength={1} d={linie} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${verzoegerung}ms` }} />
    </svg>
  );
}

export function Schalter({ an, onClick, titel, unter, deaktiviert, children }: { an: boolean; onClick: () => void; titel: string; unter?: ReactNode; deaktiviert?: boolean; children?: ReactNode }) {
  return (
    <button className="press schalter" role="switch" aria-checked={an} onClick={onClick} disabled={deaktiviert}>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{titel}</span>
        {unter && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{unter}</span>}
        {children}
      </span>
      <span className="spur" style={{ background: an ? 'var(--accent)' : '#cdd3df' }}>
        <span className="knopf" style={{ transform: `translateX(${an ? 20 : 0}px)` }} />
      </span>
    </button>
  );
}

// Reiter innerhalb eines Tabs (z. B. «Pi & Dienste» / «Netz»).
export function Unterreiter<T extends string>({ label, aktiv, waehlen, punkte }: { label: string; aktiv: T; waehlen: (t: T) => void; punkte: { id: T; text: string }[] }) {
  return (
    <div className="unterreiter" role="tablist" aria-label={label}>
      {punkte.map((p) => (
        <button key={p.id} role="tab" aria-selected={p.id === aktiv} aria-pressed={p.id === aktiv} className="press" onClick={() => waehlen(p.id)}>{p.text}</button>
      ))}
    </div>
  );
}
