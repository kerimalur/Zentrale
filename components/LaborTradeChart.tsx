'use client';
// Chart eines einzelnen Labor-Trades zum Nachprüfen: Kerzen + alle Linien und Zeitpunkte, die das Programm für diesen Trade benutzt hat
// (GVA-Hit, letztes Hoch = BOS-Level, BOS, Daily/Weekly/Monthly Opens, Low/Hoch der Fib, Box mit Confluences, Teilgewinn, Break-Even, Ungültig).
import { useEffect, useMemo, useState } from 'react';
import { holen } from '@/lib/api';
import type { LTrade } from '@/lib/labor';
import { CONF_FARBE, confName, confVon, type VolProfil } from '@/lib/confluence';
import { ConfChips } from './LaborConfluence';
import { GvaMuster } from './GvaMuster';

interface Kerze { t: number; o: number; h: number; l: number; c: number }
interface POpen { t: number; o: number }
interface Antwort { pair: string; tf: string; zuGrob: boolean; quelle: string; kerzen: Kerze[]; dailyOpens?: POpen[]; weeklyOpens?: POpen[]; monthlyOpens?: POpen[] }
const OPEN_ARTEN = [['dailyOpens', 'DO', '#4ade80'], ['weeklyOpens', 'WO', '#fb923c'], ['monthlyOpens', 'MO', '#f43f5e']] as const;
interface Linie { preis: number; text: string; farbe: string; strich?: string; ab?: number }
interface Marke { t: number; text: string; farbe: string }

const TFS = ['5m', '15m', '30m', '1H'] as const;
const VORLAUF = [{ h: 6, text: '6 Std' }, { h: 24, text: '1 Tag' }, { h: 72, text: '3 Tage' }, { h: 168, text: '1 Woche' }] as const;
const zeit = (s: number) => new Date(s * 1000).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dez = (pair: string) => (pair.endsWith('JPY') ? 3 : 5);
export const grundText = (t: Pick<LTrade, 'grund' | 'teil'>) =>
  `${t.grund === 'tp' ? 'TP' : t.grund === 'sl' ? 'SL' : t.grund === 'be' ? 'Break-Even' : t.grund === 'zeit' ? 'Zeit' : 'offen'}${t.teil ? ' + Teil' : ''}`;

export function TradeChart({ t, parameter }: { t: LTrade; parameter?: Record<string, unknown> }) {
  const [tf, setTf] = useState<(typeof TFS)[number]>('15m');
  const [vor, setVor] = useState(6);
  const [d, setD] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hover, setHover] = useState<Kerze | null>(null);
  const [ansicht, setAnsicht] = useState<'trade' | 'muster'>('trade');

  const info = t.info as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  // Der Chart beginnt vor dem frühesten Schritt (letztes Hoch, Hit, Signal oder Einstieg)
  const frueheste = Math.min(...[num(info.tSwing), num(info.tTreffer), t.tSignal, t.tEin].filter((x): x is number => x !== null && x > 0));
  const ende = (t.tAus && t.tAus > t.tEin ? t.tAus : t.tEin + 48 * 3600) + 6 * 3600;
  const von = frueheste - vor * 3600;

  useEffect(() => {
    let weg = false;
    setD(null); setFehler(null);
    holen<Antwort>(`/api/labor/trade-chart?pair=${encodeURIComponent(t.pair)}&von=${von}&bis=${ende}&tf=${tf}`)
      .then((r) => { if (!weg) setD(r); })
      .catch((e) => { if (!weg) setFehler(e instanceof Error ? e.message : 'Fehler'); });
    return () => { weg = true; };
  }, [t.pair, von, ende, tf]);

  const neu = num(info.tTreffer) !== null; // Trades der Strategie nach Regelwerk (mit allen Schritten)
  const linien = useMemo<Linie[]>(() => {
    const L: Linie[] = [];
    const lvl = num(info.lvl), swing = num(info.swing), f0 = num(info.fib0), f100 = num(info.fib100);
    if (lvl !== null) L.push({ preis: lvl, text: `GVA-Linie${info.tf ? ` (${info.tf})` : ''}`, farbe: '#a78bfa', strich: '6 4' });
    if (swing !== null) L.push({ preis: swing, text: neu ? 'Letztes Hoch (BOS-Level)' : 'Swing (BOS)', farbe: '#2dd4bf', strich: neu ? undefined : '2 3', ab: num(info.tSwing) ?? undefined });
    if (f0 !== null && f100 !== null) {
      const fib = (f: number) => f0 + f * (f100 - f0);
      L.push({ preis: f0, text: 'Fib 0 % (Hoch)', farbe: '#d6a23a', strich: '4 3' });
      L.push({ preis: f100, text: 'Fib 100 % (Low = SL)', farbe: '#d6a23a', strich: '4 3' });
      L.push({ preis: fib(0.618), text: 'Fib 0,618', farbe: '#60a5fa', strich: '2 2' });
      L.push({ preis: fib(0.786), text: 'Fib 0,786', farbe: '#60a5fa', strich: '2 2' });
      const u = num(info.ungueltig) ?? (parameter?.ungueltigAn !== false && num(parameter?.ungueltig) !== null ? fib(num(parameter?.ungueltig) as number) : null);
      if (u !== null) L.push({ preis: u, text: 'Ungültig', farbe: '#f87171', strich: '1 3' });
    }
    const teil = num(info.teil), be = num(info.be);
    if (teil !== null) L.push({ preis: teil, text: 'Teilgewinn', farbe: '#86efac', strich: '3 3' });
    if (be !== null) L.push({ preis: be, text: 'Break-Even ab', farbe: '#cbd5e1', strich: '1 2' });
    const vol = info.vol as VolProfil | undefined;
    if (vol) {
      L.push({ preis: vol.poc, text: 'Vol-POC', farbe: CONF_FARBE.poc, strich: '6 3', ab: vol.tVon });
      L.push({ preis: t.seite > 0 ? vol.val : vol.vah, text: t.seite > 0 ? 'VA Low' : 'VA High', farbe: CONF_FARBE.va, strich: '6 3', ab: vol.tVon });
    }
    L.push({ preis: t.ein, text: 'Einstieg', farbe: '#e5e7eb' });
    L.push({ preis: t.sl, text: 'SL', farbe: '#ef4444' });
    if (t.tp != null) L.push({ preis: t.tp, text: 'TP', farbe: '#22c55e' });
    return L;
  }, [t, info, parameter, neu]);

  const marken = useMemo<Marke[]>(() => {
    const M: Marke[] = [];
    const tS = num(info.tSwing), tH = num(info.tTreffer), tB = num(info.tBos), tG = num(info.gegenBos);
    if (tS !== null) M.push({ t: tS, text: 'Hoch', farbe: '#2dd4bf' });
    if (tH !== null) M.push({ t: tH, text: 'GVA-Hit', farbe: '#a78bfa' });
    M.push({ t: tB ?? t.tSignal, text: neu ? 'BOS' : 'Signal', farbe: '#f59e0b' });
    if (tG !== null) M.push({ t: tG, text: 'Gegen-BOS', farbe: '#fb7185' });
    M.push({ t: t.tEin, text: 'Einstieg', farbe: '#e5e7eb' });
    if (t.tAus) M.push({ t: t.tAus, text: 'Ausstieg', farbe: t.r >= 0 ? '#22c55e' : '#ef4444' });
    return M;
  }, [t, info, neu]);

  const B = 960, H = 470, rand = { l: 8, r: 215, o: 44, u: 26 };
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
    const x = (s: number) => rand.l + Math.max(0, Math.min(1, (s - t0) / (t1 - t0 + dt))) * w;
    const y = (p: number) => rand.o + (1 - (p - lo) / (hi - lo)) * h;
    return { k, lo, hi, x, y, bw: Math.max(1, (w / k.length) * 0.7), dt, t0, t1 };
  }, [d, linien, t]);

  const conf = Array.isArray(info.conf) ? (info.conf as { art: string; preis: number }[]) : null;
  const box = Array.isArray(info.box) ? (info.box as number[]) : null;
  const farbeR = t.r >= 0 ? 'var(--gruen)' : 'var(--fehler)';
  const de = dez(t.pair);
  return (
    <div style={{ padding: '10px 4px 14px' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {typeof info.linie === 'string' && (
          <>
            <button className="knopf-klein press" style={ansicht === 'trade' ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setAnsicht('trade')}>Trade</button>
            <button className="knopf-klein press" style={ansicht === 'muster' ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setAnsicht('muster')}>3D-Muster</button>
            <span style={{ width: 8 }} />
          </>
        )}
        {ansicht === 'trade' && TFS.map((x) => <button key={x} className="knopf-klein press" style={x === tf ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setTf(x)}>{x}</button>)}
        {ansicht === 'trade' && <span className="leise" style={{ margin: '0 4px' }}>Vorlauf</span>}
        {ansicht === 'trade' && VORLAUF.map((x) => <button key={x.h} className="knopf-klein press" style={x.h === vor ? { fontWeight: 700, outline: '1px solid var(--akzent, #888)' } : undefined} onClick={() => setVor(x.h)}>{x.text}</button>)}
        <span style={{ marginLeft: 'auto', color: farbeR, fontWeight: 600 }}>{t.pair} {t.seite > 0 ? 'Long' : 'Short'} · {t.r >= 0 ? '+' : ''}{t.r.toFixed(2).replace('.', ',')} R · {grundText(t)}</span>
      </div>
      {confVon(t) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px', fontSize: 13 }}>
          <strong>Confluence:</strong> <ConfChips t={t} />
          <span className="leise">{confVon(t)?.liste.length ? confVon(t)?.liste.map((c) => `${confName(c.art, t.seite)} ${c.preis.toFixed(de)}`).join(' · ') : 'keine Confluence in der Box'}</span>
        </div>
      )}
      {ansicht === 'muster' && typeof info.linie === 'string' && <GvaMuster linie={info.linie} hit={num(info.tTreffer)} ein={t.tEin} aus={t.tAus || null} />}
      {ansicht === 'trade' && fehler && <div className="leise">{fehler}</div>}
      {ansicht === 'trade' && !d && !fehler && <div className="leise">Lade Kerzen…</div>}
      {ansicht === 'trade' && geo && d && (
        <>
          <svg viewBox={`0 0 ${B} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 8 }} onMouseLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((i) => {
              const p = geo.lo + ((geo.hi - geo.lo) * i) / 4;
              const frei = !linien.some((l) => Math.abs(geo.y(l.preis) - geo.y(p)) < 13);
              return <g key={i}><line x1={rand.l} x2={B - rand.r} y1={geo.y(p)} y2={geo.y(p)} stroke="var(--track)" strokeWidth={0.5} />{frei && <text x={B - rand.r + 4} y={geo.y(p) + 3} fontSize={9.5} fill="var(--muted)">{p.toFixed(de)}</text>}</g>;
            })}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const k = geo.k[Math.min(geo.k.length - 1, Math.floor((geo.k.length * i) / 6))];
              return <text key={i} x={geo.x(k.t)} y={H - 8} fontSize={10} fill="var(--muted)">{zeit(k.t)}</text>;
            })}
            {/* Box 0,618–0,786 (Fib-Zone) */}
            {(() => {
              const f0 = num(info.fib0), f100 = num(info.fib100);
              const b = box ?? (f0 !== null && f100 !== null ? [f0 + 0.618 * (f100 - f0), f0 + 0.786 * (f100 - f0)] : null);
              if (!b) return null;
              const xa = neu ? geo.x(num(info.tBos) ?? t.tSignal) : rand.l;
              return <rect x={xa} width={Math.max(0, B - rand.r - xa)} y={geo.y(Math.max(...b))} height={Math.abs(geo.y(b[0]) - geo.y(b[1]))} fill="#60a5fa" opacity={0.12} />;
            })()}
            {/* Daily/Weekly/Monthly Opens: je Periode (ab 17:00 New York) eine Linie */}
            {OPEN_ARTEN.map(([feld, kurz, farbe]) => (d[feld] || []).map((x, i, a) => {
              const xa = geo.x(Math.max(x.t, geo.t0)), xb = geo.x(a[i + 1]?.t ?? geo.t1 + geo.dt);
              if (geo.y(x.o) < rand.o || geo.y(x.o) > H - rand.u || xb <= xa) return null;
              return (
                <g key={`${kurz}-${x.t}`}>
                  <line x1={xa} x2={xb} y1={geo.y(x.o)} y2={geo.y(x.o)} stroke={farbe} strokeWidth={1} strokeDasharray="5 3" opacity={0.75} />
                  {xb - xa > 90 && <text x={xa + 2} y={geo.y(x.o) - 3} fontSize={8.5} fill={farbe} opacity={0.9}>{kurz} {x.o.toFixed(de)}</text>}
                </g>
              );
            }))}
            {/* Volumenprofil vom GVA-Hit bis zum Hoch (Short: Tief): POC gelb, Value Area blau */}
            {(() => {
              const vol = info.vol as VolProfil | undefined;
              if (!vol) return null;
              const x0 = geo.x(Math.max(vol.tVon, geo.t0)), maxB = (B - rand.l - rand.r) * 0.2;
              return vol.v.map((v, z) => {
                const pLo = vol.lo + z * vol.hoehe, pHi = pLo + vol.hoehe;
                const inVa = z >= vol.zeileVa[0] && z <= vol.zeileVa[1];
                return <rect key={`v${z}`} x={x0} width={Math.max(1, v * maxB)} y={geo.y(pHi)} height={Math.max(1, geo.y(pLo) - geo.y(pHi) - 1)} fill={z === vol.zeilePoc ? CONF_FARBE.poc : inVa ? CONF_FARBE.va : '#94a3b8'} opacity={z === vol.zeilePoc ? 0.5 : 0.25} />;
              });
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
            {(() => {
              // Beschriftungen rechts von oben nach unten mit Mindestabstand verteilen (Linie bleibt am echten Preis, kleiner Strich führt zum Text)
              const sicht = linien.map((l) => ({ l, y: geo.y(l.preis) })).filter((v) => v.y >= rand.o - 2 && v.y <= H - rand.u).sort((a, b) => a.y - b.y);
              const ABST = 12.5;
              let last = -Infinity;
              const ly = sicht.map((v) => { last = Math.max(v.y, last + ABST); return last; });
              for (let j = ly.length - 1; j >= 0; j--) ly[j] = Math.min(ly[j], j === ly.length - 1 ? H - rand.u : ly[j + 1] - ABST);
              return sicht.map((v, j) => (
                <g key={j}>
                  <line x1={v.l.ab ? geo.x(v.l.ab) : rand.l} x2={B - rand.r} y1={v.y} y2={v.y} stroke={v.l.farbe} strokeWidth={v.l.ab ? 1.5 : 1} strokeDasharray={v.l.strich} opacity={0.9} />
                  {Math.abs(ly[j] - v.y) > 1 && <line x1={B - rand.r} x2={B - rand.r + 6} y1={v.y} y2={ly[j]} stroke={v.l.farbe} strokeWidth={0.8} opacity={0.8} />}
                  <text x={B - rand.r + 8} y={ly[j] + 3} fontSize={10} fill={v.l.farbe} fontWeight={600}>{v.l.text} {v.l.preis.toFixed(de)}</text>
                </g>
              ));
            })()}
            {confVon(t)?.liste.map((c) => geo.y(c.preis) >= 0 && geo.y(c.preis) <= H - rand.u && (
              <g key={`c${c.art}`}>
                <title>{`${confName(c.art, t.seite)} ${c.preis.toFixed(de)}`}</title>
                <rect x={geo.x(t.tEin) - 4} y={geo.y(c.preis) - 4} width={8} height={8} transform={`rotate(45 ${geo.x(t.tEin)} ${geo.y(c.preis)})`} fill={CONF_FARBE[c.art]} stroke="var(--bg)" strokeWidth={1} />
              </g>
            ))}
            {(() => {
              // Beschriftungen oben in bis zu 3 Zeilen, damit sie sich nicht überdecken
              const sicht = marken.filter((m) => m.t > 0 && m.t >= geo.t0 && m.t <= geo.t1 + geo.dt).sort((a, b) => a.t - b.t);
              const ende: number[] = [];
              return sicht.map((m, i) => {
                const px = geo.x(m.t), breite = m.text.length * 6.2 + 8;
                let zeile = ende.findIndex((e) => e < px);
                if (zeile < 0) zeile = ende.length < 3 ? ende.length : 0;
                ende[zeile] = px + breite;
                return (
                  <g key={`${m.text}-${i}`}>
                    <line x1={px} x2={px} y1={rand.o - 4 - (2 - zeile) * 0} y2={H - rand.u} stroke={m.farbe} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
                    <text x={px + 3} y={12 + zeile * 12} fontSize={10} fill={m.farbe} fontWeight={600}>{m.text}</text>
                    <line x1={px} x2={px} y1={14 + zeile * 12} y2={rand.o} stroke={m.farbe} strokeWidth={1} opacity={0.5} />
                  </g>
                );
              });
            })()}
          </svg>
          <div className="tr-hilfe" style={{ marginTop: 6, minHeight: 18 }}>
            {hover ? `${zeit(hover.t)} · O ${hover.o.toFixed(de)} H ${hover.h.toFixed(de)} L ${hover.l.toFixed(de)} C ${hover.c.toFixed(de)}` : `Signal ${zeit(t.tSignal)} · Einstieg ${zeit(t.tEin)} · Ausstieg ${t.tAus ? zeit(t.tAus) : 'offen'} · Risiko ${t.risikoPips} Pips · Quelle ${d.quelle}`}
            {d.zuGrob && ' · Daten gröber als gewählter Zeitrahmen'}
          </div>
          {neu && (
            <div className="tr-hilfe" style={{ marginTop: 4 }}>
              Ablauf: GVA-Hit {zeit(num(info.tTreffer) as number)} · letztes Hoch {num(info.swing)?.toFixed(de)} ({zeit(num(info.tSwing) as number)})
              {' '}· BOS {zeit(num(info.tBos) as number)}{num(info.dailyOpen) !== null ? ` über Daily Open ${num(info.dailyOpen)?.toFixed(de)}` : ' (ohne Daily-Open-Bedingung)'}
              {' '}· Low {num(info.fib100)?.toFixed(de)} · Hoch {num(info.fib0)?.toFixed(de)}
              {' '}· Confluences in der Box: {conf && conf.length ? conf.map((c) => `${confName(c.art, t.seite)} ${c.preis.toFixed(de)}`).join(', ') : 'keine'}
              {(() => { const vol = info.vol as VolProfil | undefined; return vol ? ` · Volumenprofil ${zeit(vol.tVon)}–${zeit(vol.tBis)}: POC ${vol.poc.toFixed(de)}, Value Area ${vol.val.toFixed(de)}–${vol.vah.toFixed(de)} (Zeit auf Preis)` : ''; })()}
              {num(info.gegenBos) !== null ? ` · Gegen-BOS ${zeit(num(info.gegenBos) as number)}` : ' · kein Gegen-BOS'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
