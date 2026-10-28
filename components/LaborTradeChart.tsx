'use client';
// Chart eines einzelnen Labor-Trades zum Nachprüfen: Kerzen + alle Linien, die das Programm für diesen Trade benutzt hat.
import { useEffect, useMemo, useState } from 'react';
import { holen } from '@/lib/api';
import type { LTrade } from '@/lib/labor';

interface Kerze { t: number; o: number; h: number; l: number; c: number }
interface Antwort { pair: string; tf: string; zuGrob: boolean; quelle: string; kerzen: Kerze[] }
interface Linie { preis: number; text: string; farbe: string; strich?: string }

const TFS = ['5m', '15m', '30m', '1H'] as const;
const VORLAUF = [{ h: 24, text: '1 Tag' }, { h: 72, text: '3 Tage' }, { h: 168, text: '1 Woche' }] as const;
const zeit = (s: number) => new Date(s * 1000).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dez = (pair: string) => (pair.endsWith('JPY') ? 3 : 5);

export function TradeChart({ t, parameter }: { t: LTrade; parameter?: Record<string, unknown> }) {
  const [tf, setTf] = useState<(typeof TFS)[number]>('15m');
  const [vor, setVor] = useState(24);
  const [d, setD] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hover, setHover] = useState<Kerze | null>(null);

  const ende = (t.tAus && t.tAus > t.tEin ? t.tAus : t.tEin + 48 * 3600) + 6 * 3600;
  const von = Math.min(t.tSignal, t.tEin) - vor * 3600;

  useEffect(() => {
    let weg = false;
    setD(null); setFehler(null);
    holen<Antwort>(`/api/labor/trade-chart?pair=${encodeURIComponent(t.pair)}&von=${von}&bis=${ende}&tf=${tf}`)
      .then((r) => { if (!weg) setD(r); })
      .catch((e) => { if (!weg) setFehler(e instanceof Error ? e.message : 'Fehler'); });
    return () => { weg = true; };
  }, [t.pair, von, ende, tf]);

  const info = t.info as Record<string, number | string | undefined>;
  const linien = useMemo<Linie[]>(() => {
    const L: Linie[] = [];
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const lvl = num(info.lvl), swing = num(info.swing), f0 = num(info.fib0), f100 = num(info.fib100);
    if (lvl !== null) L.push({ preis: lvl, text: `GVA-Linie${info.tf ? ` (${info.tf})` : ''}`, farbe: '#a78bfa', strich: '6 4' });
    if (swing !== null) L.push({ preis: swing, text: 'Swing (BOS)', farbe: '#94a3b8', strich: '2 3' });
    if (f0 !== null && f100 !== null) {
      const fib = (f: number) => f0 + f * (f100 - f0);
      L.push({ preis: f0, text: 'Fib 0 %', farbe: '#d6a23a', strich: '4 3' });
      L.push({ preis: f100, text: 'Fib 100 % (SL)', farbe: '#d6a23a', strich: '4 3' });
      L.push({ preis: fib(0.618), text: 'Fib 0,618', farbe: '#60a5fa', strich: '2 2' });
      L.push({ preis: fib(0.786), text: 'Fib 0,786', farbe: '#60a5fa', strich: '2 2' });
      const u = num(parameter?.ungueltig);
      if (parameter?.ungueltigAn !== false && u !== null) L.push({ preis: fib(u), text: `Ungültig (${Math.round(u * 100)} %)`, farbe: '#f87171', strich: '1 3' });
    }
    L.push({ preis: t.ein, text: 'Einstieg', farbe: '#e5e7eb' });
    L.push({ preis: t.sl, text: 'SL', farbe: '#ef4444' });
    if (t.tp != null) L.push({ preis: t.tp, text: 'TP', farbe: '#22c55e' });
    return L;
  }, [t, info, parameter]);

  const B = 900, H = 380, rand = { l: 8, r: 150, o: 10, u: 26 };
  const geo = useMemo(() => {
    if (!d?.kerzen.length) return null;
    const k = d.kerzen;
    let lo = Math.min(...k.map((x) => x.l), t.ein, t.sl), hi = Math.max(...k.map((x) => x.h), t.ein, t.sl);
    if (t.tp != null) { lo = Math.min(lo, t.tp); hi = Math.max(hi, t.tp); }
    // Linien nur mitzoomen, wenn sie nicht extrem weit weg sind (Spanne der Kerzen + 50 %)
    const sp = hi - lo || 1;
    for (const l of linien) if (l.preis > lo - sp * 0.5 && l.preis < hi + sp * 0.5) { lo = Math.min(lo, l.preis); hi = Math.max(hi, l.preis); }
    const pad = (hi - lo) * 0.04 || 0.0001;
    lo -= pad; hi += pad;
    const t0 = k[0].t, t1 = k[k.length - 1].t, dt = k.length > 1 ? k[1].t - k[0].t : 900;
    const w = B - rand.l - rand.r, h = H - rand.o - rand.u;
    const x = (s: number) => rand.l + ((s - t0) / (t1 - t0 + dt)) * w;
    const y = (p: number) => rand.o + (1 - (p - lo) / (hi - lo)) * h;
    return { k, lo, hi, x, y, bw: Math.max(1, (w / k.length) * 0.7), dt };
  }, [d, linien, t]);

  const farbeR = t.r >= 0 ? 'var(--gruen)' : 'var(--fehler)';
  const de = dez(t.pair);
  return (
    <div style={{ padding: '10px 4px 14px' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {TFS.map((x) => <button key={x} className="knopf-klein press" style={x === tf ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setTf(x)}>{x}</button>)}
        <span className="leise" style={{ margin: '0 4px' }}>Vorlauf</span>
        {VORLAUF.map((x) => <button key={x.h} className="knopf-klein press" style={x.h === vor ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setVor(x.h)}>{x.text}</button>)}
        <span style={{ marginLeft: 'auto', color: farbeR, fontWeight: 600 }}>{t.pair} {t.seite > 0 ? 'Long' : 'Short'} · {t.r >= 0 ? '+' : ''}{t.r.toFixed(2).replace('.', ',')} R · {t.grund === 'tp' ? 'TP' : t.grund === 'sl' ? 'SL' : t.grund === 'zeit' ? 'Zeit' : 'offen'}</span>
      </div>
      {fehler && <div className="leise">{fehler}</div>}
      {!d && !fehler && <div className="leise">Lade Kerzen…</div>}
      {geo && d && (
        <>
          <svg viewBox={`0 0 ${B} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 8 }} onMouseLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((i) => {
              const p = geo.lo + ((geo.hi - geo.lo) * i) / 4;
              return <g key={i}><line x1={rand.l} x2={B - rand.r} y1={geo.y(p)} y2={geo.y(p)} stroke="var(--track)" strokeWidth={0.5} /><text x={B - rand.r + 4} y={geo.y(p) + 3} fontSize={10} fill="var(--muted)">{p.toFixed(de)}</text></g>;
            })}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const k = geo.k[Math.min(geo.k.length - 1, Math.floor((geo.k.length * i) / 6))];
              return <text key={i} x={geo.x(k.t)} y={H - 8} fontSize={10} fill="var(--muted)">{zeit(k.t)}</text>;
            })}
            {linien.length > 0 && (() => {
              const f = linien.filter((l) => l.text.startsWith('Fib 0,')).map((l) => l.preis);
              return f.length === 2 ? <rect x={rand.l} width={B - rand.l - rand.r} y={geo.y(Math.max(...f))} height={Math.abs(geo.y(f[0]) - geo.y(f[1]))} fill="#60a5fa" opacity={0.12} /> : null;
            })()}
            {geo.k.map((c) => {
              const hoch = c.c >= c.o, f = hoch ? '#22c55e' : '#ef4444', x = geo.x(c.t) + (geo.bw * 0.2);
              return (
                <g key={c.t} onMouseEnter={() => setHover(c)}>
                  <line x1={x + geo.bw / 2} x2={x + geo.bw / 2} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={f} strokeWidth={1} />
                  <rect x={x} width={geo.bw} y={geo.y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(geo.y(c.o) - geo.y(c.c)))} fill={f} />
                </g>
              );
            })}
            {linien.map((l, i) => geo.y(l.preis) >= 0 && geo.y(l.preis) <= H - rand.u && (
              <g key={i}>
                <line x1={rand.l} x2={B - rand.r} y1={geo.y(l.preis)} y2={geo.y(l.preis)} stroke={l.farbe} strokeWidth={1} strokeDasharray={l.strich} opacity={0.9} />
                <text x={B - rand.r + 4} y={geo.y(l.preis) + 3} fontSize={10} fill={l.farbe} fontWeight={600}>{l.text} {l.preis.toFixed(de)}</text>
              </g>
            ))}
            {([[t.tSignal, 'Signal', '#a78bfa'], [t.tEin, 'Einstieg', '#e5e7eb'], [t.tAus, 'Ausstieg', t.r >= 0 ? '#22c55e' : '#ef4444']] as [number, string, string][]).map(([s, n, f]) => s > 0 && s >= geo.k[0].t && (
              <g key={n}>
                <line x1={geo.x(s)} x2={geo.x(s)} y1={rand.o} y2={H - rand.u} stroke={f} strokeWidth={1} strokeDasharray="3 3" />
                <text x={geo.x(s) + 3} y={rand.o + 10} fontSize={10} fill={f} fontWeight={600}>{n}</text>
              </g>
            ))}
          </svg>
          <div className="tr-hilfe" style={{ marginTop: 6, minHeight: 18 }}>
            {hover ? `${zeit(hover.t)} · O ${hover.o.toFixed(de)} H ${hover.h.toFixed(de)} L ${hover.l.toFixed(de)} C ${hover.c.toFixed(de)}` : `Signal ${zeit(t.tSignal)} · Einstieg ${zeit(t.tEin)} · Ausstieg ${t.tAus ? zeit(t.tAus) : 'offen'} · Risiko ${t.risikoPips} Pips · Quelle ${d.quelle}`}
            {d.zuGrob && ' · Daten gröber als gewählter Zeitrahmen'}
          </div>
        </>
      )}
    </div>
  );
}
