'use client';
// Bausteine für «Gesundheit»: hochzählende Zahl, Kurven, Säulen, Schlafphasen, interaktiver Verlauf.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GarminNacht, GarminPunkt } from '@/lib/types';
import { komma, zahl } from '@/lib/format';
import { alsDatum, datumLang, dauer, SCHLAF_FARBEN, monatName } from '@/lib/garmin';
import type { Wert } from '@/lib/garmin';

const ruhig = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Zahl, die beim Erscheinen hochzählt.
export function Zaehler({ wert, stellen = 0, dauerMs = 900, format }: { wert: number | null; stellen?: number; dauerMs?: number; format?: (v: number) => string }) {
  const [anzeige, setAnzeige] = useState(0);
  const vorher = useRef(0);
  useEffect(() => {
    if (wert === null) return;
    const start = vorher.current;
    if (ruhig() || start === wert) { setAnzeige(wert); vorher.current = wert; return; }
    const t0 = performance.now();
    let id = 0;
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / dauerMs);
      setAnzeige(start + (wert - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) id = requestAnimationFrame(schritt);
      else vorher.current = wert;
    };
    id = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(id);
  }, [wert, dauerMs]);
  if (wert === null) return <>—</>;
  if (format) return <>{format(anzeige)}</>;
  return <>{stellen ? komma(anzeige, stellen) : zahl(anzeige)}</>;
}

// Kleine Kurve über die Zeit, mit Fläche und pulsierendem Endpunkt.
export function Linie({ punkte, farbe, hoehe = 90, min, max, verzoegerung = 0, hell = false }: { punkte: GarminPunkt[]; farbe: string; hoehe?: number; min?: number; max?: number; verzoegerung?: number; hell?: boolean }) {
  if (punkte.length < 2) return <div className="ges-leer" style={{ height: hoehe }}>Noch kein Verlauf</div>;
  const t0 = punkte[0].t, t1 = punkte.at(-1)!.t, dt = t1 - t0 || 1;
  const werte = punkte.map((p) => p.v);
  const lo = min ?? Math.min(...werte), hi = max ?? Math.max(...werte), r = hi - lo || 1;
  const xy = punkte.map((p) => [((p.t - t0) / dt) * 100, 96 - ((p.v - lo) / r) * 88] as const);
  const linie = 'M' + xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L');
  const [lx, ly] = xy.at(-1)!;
  const id = `g${farbe.replace(/[^a-z0-9]/gi, '')}${hell ? 'h' : ''}`;
  return (
    <div style={{ position: 'relative', height: hoehe }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={hoehe} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={farbe} stopOpacity={hell ? 0.45 : 0.28} />
            <stop offset="1" stopColor={farbe} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="area" d={`${linie} L100,100 L0,100 Z`} fill={`url(#${id})`} style={{ animationDelay: `${verzoegerung}ms` }} />
        <path className="spark" pathLength={1} d={linie} fill="none" stroke={farbe} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${verzoegerung}ms` }} />
      </svg>
      <span className="ges-endpunkt" style={{ left: `${lx}%`, top: `${(ly / 100) * hoehe}px`, background: farbe, animationDelay: `${verzoegerung + 900}ms`, ...(hell ? { boxShadow: '0 0 0 3px rgba(255,255,255,.9)' } : {}) }} />
    </div>
  );
}

export function SchlafPhasen({ n, hoehe = 14, legende = true }: { n: Pick<GarminNacht, 'tiefS' | 'leichtS' | 'remS' | 'wachS'>; hoehe?: number; legende?: boolean }) {
  const teile = [
    { k: 'Tief', s: n.tiefS, f: SCHLAF_FARBEN.tief },
    { k: 'Leicht', s: n.leichtS, f: SCHLAF_FARBEN.leicht },
    { k: 'REM', s: n.remS, f: SCHLAF_FARBEN.rem },
    { k: 'Wach', s: n.wachS, f: SCHLAF_FARBEN.wach },
  ];
  const total = teile.reduce((a, t) => a + t.s, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ges-phasen gx" style={{ height: hoehe }}>
        {teile.map((t) => (t.s > 0 ? <span key={t.k} style={{ width: `${(t.s / total) * 100}%`, background: t.f }} title={`${t.k}: ${dauer(t.s)}`} /> : null))}
      </div>
      {legende && (
        <div className="ges-legende">
          {teile.map((t) => <span key={t.k}><i style={{ background: t.f }} />{t.k} <b>{dauer(t.s)}</b> <small>{Math.round((t.s / total) * 100)} %</small></span>)}
        </div>
      )}
    </div>
  );
}

function useBreite<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [breite, setBreite] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBreite(el.clientWidth);
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, breite] as const;
}

// Interaktiver Verlauf: Tageswerte als Punkte, gleitender Schnitt als Linie, Antippen zeigt den Tag.
export function Verlauf({ werte, schnitt, farbe, format, hoehe = 220, ziel, zielText, punkteZeigen = true }: {
  werte: Wert[]; schnitt: Wert[]; farbe: string; format: (v: number) => string; hoehe?: number; ziel?: number; zielText?: string; punkteZeigen?: boolean;
}) {
  const [ref, breite] = useBreite<HTMLDivElement>();
  const [aktiv, setAktiv] = useState<number | null>(null);
  if (werte.length < 2) return <div className="ges-leer" style={{ height: hoehe }}>Zu wenig Daten für diesen Zeitraum</div>;
  const links = 58, rechts = 10, oben = 14, unten = 26;
  const b = Math.max(10, breite - links - rechts), h = hoehe - oben - unten;
  const t0 = alsDatum(werte[0].tag).getTime(), t1 = alsDatum(werte.at(-1)!.tag).getTime(), dt = t1 - t0 || 1;
  const alle = [...werte.map((w) => w.v), ...(ziel !== undefined ? [ziel] : [])];
  let lo = Math.min(...alle), hi = Math.max(...alle);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x = (tag: string) => links + ((alsDatum(tag).getTime() - t0) / dt) * b;
  const y = (v: number) => oben + (1 - (v - lo) / (hi - lo)) * h;
  const linie = schnitt.length > 1 ? 'M' + schnitt.map((p) => `${x(p.tag).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L') : '';
  const gitter = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  // Monats- bzw. Wochen-Beschriftung
  const tageSpanne = dt / 86400_000;
  const marken: { x: number; text: string }[] = [];
  if (tageSpanne > 75) {
    const d = alsDatum(werte[0].tag); d.setDate(1); d.setMonth(d.getMonth() + 1);
    const schritt = tageSpanne > 700 ? 6 : tageSpanne > 300 ? 2 : 1;
    let i = 0;
    while (d.getTime() <= t1) {
      if (i % schritt === 0) marken.push({ x: links + ((d.getTime() - t0) / dt) * b, text: tageSpanne > 300 ? monatName(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, false) + (d.getMonth() === 0 ? ` ${d.getFullYear()}` : '') : d.toLocaleDateString('de-CH', { month: 'short' }) });
      d.setMonth(d.getMonth() + 1); i++;
    }
  } else {
    for (let i = 0; i < werte.length; i += 7) marken.push({ x: x(werte[i].tag), text: alsDatum(werte[i].tag).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' }) });
  }
  function zeiger(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, abstand = Infinity;
    werte.forEach((w, i) => { const d = Math.abs(x(w.tag) - px); if (d < abstand) { abstand = d; best = i; } });
    setAktiv(best);
  }
  const a = aktiv !== null ? werte[aktiv] : null;
  const aSchnitt = a ? schnitt.find((s) => s.tag === a.tag) : null;
  const viele = werte.length > 160;
  return (
    <div ref={ref} className="ges-verlauf">
      {breite > 0 && (
        <svg width={breite} height={hoehe} onPointerMove={zeiger} onPointerDown={zeiger} onPointerLeave={() => setAktiv(null)} style={{ display: 'block', touchAction: 'pan-y' }} role="img" aria-label="Verlauf">
          {gitter.map((g, i) => (
            <g key={i}>
              <line x1={links} x2={breite - rechts} y1={y(g)} y2={y(g)} stroke="#eef1f6" />
              <text x={links - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#8a93a6">{format(g)}</text>
            </g>
          ))}
          {ziel !== undefined && (
            <g>
              <line x1={links} x2={breite - rechts} y1={y(ziel)} y2={y(ziel)} stroke="#c3cad8" strokeDasharray="5 5" strokeWidth={1.5} />
              <text x={breite - rechts} y={y(ziel) - 6} textAnchor="end" fontSize="11" fill="#8a93a6" fontWeight="600">{zielText}</text>
            </g>
          )}
          {marken.map((m, i) => <text key={i} x={m.x} y={hoehe - 6} textAnchor="middle" fontSize="11" fill="#8a93a6">{m.text}</text>)}
          {punkteZeigen && werte.map((w, i) => (
            <circle key={w.tag} cx={x(w.tag)} cy={y(w.v)} r={viele ? 1.6 : 3} fill={farbe} opacity={viele ? 0.28 : 0.35} className="ges-punkt" style={{ animationDelay: `${Math.min(600, i * (viele ? 0.6 : 8))}ms` }} />
          ))}
          {linie && <path className="spark" pathLength={1} d={linie} fill="none" stroke={farbe} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />}
          {a && (
            <g>
              <line x1={x(a.tag)} x2={x(a.tag)} y1={oben} y2={oben + h} stroke={farbe} strokeOpacity={0.35} />
              <circle cx={x(a.tag)} cy={y(a.v)} r={5} fill="#fff" stroke={farbe} strokeWidth={2.5} />
            </g>
          )}
        </svg>
      )}
      {a && (
        <div className="ges-tooltip" style={{ left: Math.min(Math.max(x(a.tag), 90), breite - 90) }}>
          <b>{format(a.v)}</b>
          <span>{datumLang(a.tag)}</span>
          {aSchnitt && <span>Ø gleitend {format(aSchnitt.v)}</span>}
        </div>
      )}
    </div>
  );
}

// Beschriftete Säulen (Monate, Wochentage …) mit optionaler Hervorhebung.
export function Balken({ werte, farbe, format, hoehe = 150, hervor, ziel, zielText, beschriftungJede = 1 }: {
  werte: { label: string; v: number | null; titel?: string; farbe?: string }[]; farbe: string; format: (v: number) => string; hoehe?: number; hervor?: number[]; ziel?: number; zielText?: string; beschriftungJede?: number;
}) {
  const max = Math.max(...werte.map((w) => w.v ?? 0), (ziel ?? 0) * 1.12) || 1;
  const min0 = Math.min(...werte.filter((w) => w.v !== null).map((w) => w.v as number));
  // Bei Werten weit weg von 0 (z. B. Ruhepuls) nicht bei 0 anfangen, sonst sieht man keine Unterschiede.
  const basis = min0 > max * 0.6 ? min0 - (max - min0) * 0.6 : 0;
  const skala = (v: number) => Math.max(3, ((v - basis) / (max - basis)) * 100);
  return (
    <div className="ges-balken">
      <div className="ges-balken-flaeche" style={{ height: hoehe }}>
        {ziel !== undefined && <div className="ges-ziel" style={{ bottom: `${skala(ziel)}%` }}><span>{zielText}</span></div>}
        {werte.map((w, i) => (
          <div key={i} className="ges-saeule" title={w.titel ?? `${w.label}: ${w.v === null ? '—' : format(w.v)}`}>
            {w.v !== null && <em className="ges-saeule-wert" style={{ animationDelay: `${300 + i * 25}ms` }}>{format(w.v)}</em>}
            <span className="gy" style={{ height: w.v === null ? 0 : `${skala(w.v)}%`, background: w.farbe ?? (hervor?.includes(i) ? farbe : farbe + '66'), animationDelay: `${i * 25}ms` }} />
          </div>
        ))}
      </div>
      <div className="ges-saeulen-achse">
        {werte.map((w, i) => <span key={i} style={{ fontWeight: hervor?.includes(i) ? 700 : 400 }}>{i % beschriftungJede === 0 || i === werte.length - 1 ? w.label : ''}</span>)}
      </div>
    </div>
  );
}

export function Kennzahl({ titel, wert, unter, farbe, icon }: { titel: string; wert: ReactNode; unter?: ReactNode; farbe?: string; icon?: ReactNode }) {
  return (
    <div className="ges-kennzahl">
      <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{titel}</span>
      <b style={{ color: farbe }}>{wert}</b>
      {unter && <span className="leise" style={{ fontSize: 12 }}>{unter}</span>}
    </div>
  );
}

// Veränderung mit Pfeil, grün = besser, orange = schlechter.
export function Veraenderung({ jetzt, vorher, besser, format, prozentZeigen = true }: { jetzt: number | null; vorher: number | null; besser: 'hoch' | 'tief'; format: (v: number) => string; prozentZeigen?: boolean }) {
  if (jetzt === null || vorher === null) return <span className="leise">kein Vergleich</span>;
  const d = jetzt - vorher;
  const p = vorher ? (d / Math.abs(vorher)) * 100 : 0;
  const gut = besser === 'hoch' ? d > 0 : d < 0;
  const gleich = Math.abs(p) < 1.5;
  const farbe = gleich ? 'var(--muted)' : gut ? '#15803d' : '#c2410c';
  return (
    <span style={{ color: farbe, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {gleich ? '● gleich' : <>{d > 0 ? '▲' : '▼'} {format(Math.abs(d))}{prozentZeigen ? ` (${p > 0 ? '+' : '−'}${Math.abs(Math.round(p))} %)` : ''}</>}
    </span>
  );
}
