'use client';
// 3D-Muster einer GVA-Linie: 5 Kerzen vor dem Muster, Kerze A, Kerze B, 5 Kerzen danach (= 12 Kerzen).
// Zeigt, woher die Linie kommt und von welchem Preis sie gemessen wird (Open von Kerze B), dazu die Berührungszone und – wenn bekannt –
// GVA-Hit, Einstieg und Ausstieg des Trades. Wird im Trade-Chart des Labors und im GVA-Prüfer benutzt.
import { useEffect, useState } from 'react';
import { holen } from '@/lib/api';
import { TF_TEXT, datumCh, type TTf } from '@/lib/trading';

interface MKerze { start: string; t: number; tEnde: number; o: number; h: number; l: number; c: number; rolle: 'A' | 'B' | null; fertig: boolean }
interface Muster {
  pair: string; tf: TTf; seite: 'long' | 'short'; tag: string; lvl: number; ziel: number; pip: number; kerzen: MKerze[];
  muster: {
    aTag: string; bTag: string; aOpen: number; aClose: number; bOpen: number; bClose: number; aFarbe: string; bFarbe: string; koerperAPips: number; koerperBPips: number;
    verhaeltnis: number | null; noetig: number; aKante: number; abstandPips: number; tolPips: number; messung: string; alt: boolean;
  };
}

const dez = (pair: string) => (pair.endsWith('JPY') ? 3 : 5);
const zeit = (s: number) => new Date(s * 1000).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function GvaMuster({ linie, hit, ein, aus }: { linie: string; hit?: number | null; ein?: number | null; aus?: number | null }) {
  const [d, setD] = useState<Muster | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let weg = false;
    setD(null); setFehler(null);
    holen<Muster>(`/api/labor/gva-muster?linie=${encodeURIComponent(linie)}&vor=5&nach=5`)
      .then((r) => { if (!weg) setD(r); })
      .catch((e) => { if (!weg) setFehler(e instanceof Error ? e.message : 'Fehler'); });
    return () => { weg = true; };
  }, [linie]);

  if (fehler) return <div className="leise">{fehler}</div>;
  if (!d) return <div className="leise">Lade 3D-Kerzen…</div>;

  const B = 900, H = 360, rand = { l: 8, r: 150, o: 30, u: 28 };
  const k = d.kerzen, m = d.muster, lang = d.seite === 'long', de = dez(d.pair);
  const alleP = [...k.flatMap((x) => [x.h, x.l]), d.lvl, d.ziel, m.aKante];
  let lo = Math.min(...alleP), hi = Math.max(...alleP);
  const pad = (hi - lo) * 0.06 || 0.001; lo -= pad; hi += pad;
  const w = (B - rand.l - rand.r) / k.length;
  const x = (i: number) => rand.l + i * w;
  const y = (p: number) => rand.o + (1 - (p - lo) / (hi - lo)) * (H - rand.o - rand.u);
  const iA = k.findIndex((c) => c.rolle === 'A'), iB = k.findIndex((c) => c.rolle === 'B');
  // Position eines Zeitpunkts im Chart (Kerze + Anteil darin)
  const xZeit = (s: number) => {
    const i = k.findIndex((c) => s >= c.t && s < c.tEnde);
    if (i < 0) return s < k[0].t ? null : s >= k[k.length - 1].tEnde ? null : null;
    return x(i) + ((s - k[i].t) / (k[i].tEnde - k[i].t)) * w;
  };
  const marken = [
    { t: hit, text: 'GVA-Hit', farbe: '#a78bfa' }, { t: ein, text: 'Einstieg', farbe: '#e5e7eb' }, { t: aus, text: 'Ausstieg', farbe: '#f59e0b' },
  ].filter((q): q is { t: number; text: string; farbe: string } => typeof q.t === 'number' && q.t > 0);
  const ausserhalb = marken.filter((q) => xZeit(q.t) === null);

  return (
    <div style={{ padding: '4px 0' }}>
      <svg viewBox={`0 0 ${B} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => { const p = lo + ((hi - lo) * i) / 4; return <g key={i}><line x1={rand.l} x2={B - rand.r} y1={y(p)} y2={y(p)} stroke="var(--track)" strokeWidth={0.5} /><text x={B - rand.r + 4} y={y(p) + 3} fontSize={10} fill="var(--muted)">{p.toFixed(de)}</text></g>; })}
        {iA >= 0 && iB >= 0 && <rect x={x(iA)} width={w * 2} y={rand.o} height={H - rand.o - rand.u} fill="#60a5fa" opacity={0.12} />}
        {iA >= 0 && <text x={x(iA) + w / 2 - 3} y={rand.o - 6} fontSize={12} fill="#60a5fa" fontWeight={700}>A</text>}
        {iB >= 0 && <text x={x(iB) + w / 2 - 3} y={rand.o - 6} fontSize={12} fill="#60a5fa" fontWeight={700}>B</text>}
        {k.map((c, i) => {
          const f = c.c >= c.o ? '#22c55e' : '#ef4444', bx = x(i) + w * 0.2, bw = Math.max(2, w * 0.6);
          return (
            <g key={c.start}>
              <title>{`${datumCh(c.start)} · O ${c.o.toFixed(de)} H ${c.h.toFixed(de)} L ${c.l.toFixed(de)} C ${c.c.toFixed(de)}${c.fertig ? '' : ' (läuft)'}`}</title>
              <line x1={bx + bw / 2} x2={bx + bw / 2} y1={y(c.h)} y2={y(c.l)} stroke={f} strokeWidth={1.5} />
              <rect x={bx} width={bw} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={f} opacity={c.fertig ? 1 : 0.5} />
              <text x={x(i) + w / 2} y={H - 10} fontSize={9.5} fill="var(--muted)" textAnchor="middle">{datumCh(c.start).slice(0, 5)}</text>
            </g>
          );
        })}
        {/* Körper-Kante von A (Long: Boden, Short: Top) – B muss auf gleicher Höhe liegen */}
        {iA >= 0 && iB >= 0 && (
          <g>
            <line x1={x(iA)} x2={x(iB) + w} y1={y(m.aKante)} y2={y(m.aKante)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <text x={B - rand.r + 4} y={y(m.aKante) + (Math.abs(y(m.aKante) - y(d.lvl)) < 12 ? 12 : 3)} fontSize={10} fill="#94a3b8">{lang ? 'Boden' : 'Top'} A {m.aKante.toFixed(de)}</text>
          </g>
        )}
        {/* Berührungszone und Linie */}
        {iB >= 0 && <line x1={x(iB)} x2={B - rand.r} y1={y(d.ziel)} y2={y(d.ziel)} stroke="#a78bfa" strokeWidth={1} strokeDasharray="1 3" opacity={0.8} />}
        {iB >= 0 && <line x1={x(iB)} x2={B - rand.r} y1={y(d.lvl)} y2={y(d.lvl)} stroke="#a78bfa" strokeWidth={2} />}
        <text x={B - rand.r + 4} y={y(d.lvl) - 5} fontSize={10.5} fill="#a78bfa" fontWeight={700}>GVA {d.lvl.toFixed(de)}</text>
        <text x={B - rand.r + 4} y={y(d.ziel) + (lang ? -3 : 11)} fontSize={9} fill="#a78bfa" opacity={0.85}>Treffer ab {d.ziel.toFixed(de)}</text>
        {/* Trade-Zeitpunkte */}
        {marken.map((q, i) => {
          const px = xZeit(q.t);
          if (px === null) return null;
          return (
            <g key={q.text}>
              <line x1={px} x2={px} y1={rand.o} y2={H - rand.u} stroke={q.farbe} strokeWidth={1} strokeDasharray="3 3" />
              <text x={px + 3} y={rand.o + 10 + i * 11} fontSize={10} fill={q.farbe} fontWeight={600}>{q.text}</text>
            </g>
          );
        })}
      </svg>
      <div className="tr-hilfe" style={{ marginTop: 6, lineHeight: 1.55 }}>
        <strong>{d.pair} · {d.seite === 'long' ? 'Long' : 'Short'} · {TF_TEXT[d.tf]}-Muster.</strong>{' '}
        Kerze A ({datumCh(m.aTag)}, {m.aFarbe}, Körper {m.koerperAPips} Pips) und Kerze B ({datumCh(m.bTag)}, {m.bFarbe}, Körper {m.koerperBPips} Pips{m.verhaeltnis !== null ? `, ${m.verhaeltnis.toFixed(2).replace('.', ',')}× A, nötig ${m.noetig.toFixed(2).replace('.', ',')}×` : ''}).
        {' '}{lang ? 'Körper-Böden' : 'Körper-Tops'} liegen {m.abstandPips} Pips auseinander (erlaubt {m.tolPips}).
        {' '}<strong>Die Linie wird vom {m.messung} gemessen: {d.lvl.toFixed(de)}.</strong>
        {m.alt ? ' Älteres Muster: aus Tageskerzen gerechnet, auf wenige Pips genau.' : ''}
        {ausserhalb.length > 0 && ` ${ausserhalb.map((q) => `${q.text} (${zeit(q.t)})`).join(', ')} liegt ausserhalb dieser 12 Kerzen.`}
        {k.length < 12 && ' Weniger als 12 Kerzen: Die Daten enden hier bzw. beginnen erst später.'}
      </div>
    </div>
  );
}
