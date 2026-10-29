'use client';
// GVA-Prüfer: Für ein Paar und einen Zeitraum alle 3D-/Wochen-/Monatskerzen mit der Musterprüfung gegen die Vorkerze
// (Linie oder Grund, warum keine) und alle Linien mit Kerze A/B, Status und Treffer. Dazu Abgleich mit einem TradingView-Wert.
import { useEffect, useMemo, useState } from 'react';
import { holen } from '@/lib/api';
import { PAARE_LISTE, TF_TEXT, datumCh, type TEinstellungen, type TTf } from '@/lib/trading';

interface PKerze {
  start: string; ende: string; o: number; h: number; l: number; c: number; koerperPips: number; alt: boolean; fertig: boolean;
  pruefung: null | { vorStart: string; farbeA: string; farbeB: string; verhaeltnis: number | null; noetig: number; abstandPips: number | null; tolPips: number; linie: 'long' | 'short' | null; level: number | null; gruende: string[] };
}
interface PLinie {
  id: string; seite: 'long' | 'short'; lvl: number; entstanden: string; status: 'offen' | 'treffer' | 'verworfen'; alt: boolean;
  treffer: number | null; trefferUngefaehr: boolean; A: { start: string; o: number; c: number }; B: { start: string; o: number; c: number }; verhaeltnis: number; passungPips: number;
}
interface PAntwort { pair: string; tf: TTf; pip: number; von: string; bis: string; einstellungen: TEinstellungen; kerzen: PKerze[]; linien: PLinie[]; preis: number }

const STANDARD_TAGE: Record<TTf, number> = { '3D': 120, W: 400, M: 1500 };
const isoVor = (tage: number) => new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10);
const heute = () => new Date().toISOString().slice(0, 10);
const dez = (pair: string) => (pair.endsWith('JPY') ? 3 : 5);
const zeit = (ms: number) => new Date(ms).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<PLinie['status'], string> = { offen: 'offen', treffer: 'getroffen', verworfen: 'verworfen (Nachbar-Filter)' };

export function GvaPruefer() {
  const [pair, setPair] = useState('EURJPY');
  const [tf, setTf] = useState<TTf>('3D');
  const [von, setVon] = useState(isoVor(STANDARD_TAGE['3D']));
  const [bis, setBis] = useState(heute());
  const [tv, setTv] = useState('');
  const [d, setD] = useState<PAntwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [markiert, setMarkiert] = useState<string | null>(null); // Start der Kerze B

  const laden = () => {
    setLaedt(true); setFehler(null);
    holen<PAntwort>(`/api/trading/pruefer?p=${pair}&tf=${tf}&von=${von}&bis=${bis}`)
      .then((r) => { setD(r); setMarkiert(null); })
      .catch((e) => setFehler(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLaedt(false));
  };
  useEffect(() => { laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const de = d ? dez(d.pair) : 5;
  // Abgleich mit dem TradingView-Wert: nächste Linie und Abstand in Pips
  const abgleich = useMemo(() => {
    const x = Number(tv.replace(',', '.'));
    if (!d || !tv.trim() || !Number.isFinite(x) || x <= 0) return null;
    const alle = d.linien.map((l) => ({ l, pips: Math.abs(l.lvl - x) / d.pip })).sort((a, b) => a.pips - b.pips);
    const kerzen = d.kerzen.filter((k) => k.pruefung && !k.pruefung.linie && Math.abs(Math.min(k.o, k.c) - x) / d.pip < 15).slice(0, 3);
    return { x, naechste: alle[0] || null, kerzen };
  }, [tv, d]);

  const e = d?.einstellungen;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in">
        <h2 className="karte-titel">GVA-Prüfer <small>woher kommt welche Linie – und warum fehlt eine?</small></h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="nw-feld">Paar<select value={pair} onChange={(x) => setPair(x.target.value)}>{PAARE_LISTE.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="nw-feld">Zeitrahmen<select value={tf} onChange={(x) => { const t = x.target.value as TTf; setTf(t); setVon(isoVor(STANDARD_TAGE[t])); }}>{(['3D', 'W', 'M'] as TTf[]).map((t) => <option key={t} value={t}>{TF_TEXT[t]}</option>)}</select></label>
          <label className="nw-feld">Von<input type="date" value={von} onChange={(x) => setVon(x.target.value)} /></label>
          <label className="nw-feld">Bis<input type="date" value={bis} onChange={(x) => setBis(x.target.value)} /></label>
          <button className="knopf-klein press" onClick={laden} disabled={laedt}>{laedt ? 'Lade …' : 'Prüfen'}</button>
          <label className="nw-feld" style={{ marginLeft: 'auto' }}>Wert aus TradingView<input inputMode="decimal" placeholder="z. B. 176.694" value={tv} onChange={(x) => setTv(x.target.value)} /></label>
        </div>
        {fehler && <div className="fehlerbox" style={{ marginTop: 10 }}>{fehler}</div>}
        {e && (
          <p className="tr-hilfe" style={{ marginTop: 10 }}>
            Regeln (wie Pine «GVA Linien — Pur»): Kerze B mind. {e.k2Pct} % grösserer Körper als A · Böden/Tops innerhalb {e.tolPct} % {e.tolBasis === 'atr' ? 'ATR' : 'vom Körper A'} ·
            Docht {e.docht ? 'zählt' : 'zählt nicht'} als Treffer · Nachbar-Filter {e.filterAn ? `${e.filterAbstand} Kerze(n)` : 'aus'} · 3D-Anker {datumCh(e.anker3d)} · 25.12./1.1. {e.feiertageAus ? 'zählen nicht' : 'zählen mit (wie TradingView)'} ·
            Tageswechsel 17:00 New York, Open an Werktagen = Schluss davor. Vergleiche diese Werte mit den Einstellungen des Indikators in TradingView.
          </p>
        )}
        {abgleich && d && (
          <div className="karte" style={{ marginTop: 10, padding: 12 }}>
            {abgleich.naechste && abgleich.naechste.pips <= 15
              ? <>Nächste Linie: <strong>{abgleich.naechste.l.seite === 'long' ? 'Long' : 'Short'} {abgleich.naechste.l.lvl.toFixed(de)}</strong> (entstanden {datumCh(abgleich.naechste.l.entstanden)}) · Abstand <strong>{abgleich.naechste.pips.toFixed(1)} Pips</strong>{abgleich.naechste.pips > 2 ? ' – kleine Unterschiede kommen von den Kursdaten (OANDA ↔ HistData).' : ' – gleiche Linie.'}</>
              : <>Keine Linie innerhalb 15 Pips von {abgleich.x.toFixed(de)}.{abgleich.kerzen.length ? ` Kerzen mit Körper-Boden in der Nähe: ${abgleich.kerzen.map((k) => `${datumCh(k.start)} (${k.pruefung?.gruende.join('; ')})`).join(' · ')}` : ' Prüfe Zeitraum, Zeitrahmen und die Regeln oben.'}</>}
          </div>
        )}
      </section>

      {d && <PrueferChart d={d} markiert={markiert} />}

      {d && (
        <section className="karte in">
          <h2 className="karte-titel">Linien <small>{d.linien.length} im Zeitraum (entstanden oder getroffen)</small></h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-tabelle">
              <thead><tr><th>Level</th><th>Seite</th><th>Kerze A</th><th>Kerze B</th><th>B / A</th><th>Passung</th><th>Status</th><th>Erster Treffer</th></tr></thead>
              <tbody>
                {d.linien.map((l) => (
                  <tr key={l.id} onClick={() => setMarkiert(l.B.start)} style={{ cursor: 'pointer', background: markiert === l.B.start ? 'rgba(96,165,250,.12)' : undefined }}>
                    <td><strong>{l.lvl.toFixed(de)}</strong>{l.alt ? ' ≈' : ''}</td>
                    <td style={{ color: l.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)' }}>{l.seite === 'long' ? 'Long' : 'Short'}</td>
                    <td>{datumCh(l.A.start)} · O {l.A.o.toFixed(de)} C {l.A.c.toFixed(de)}</td>
                    <td>{datumCh(l.B.start)} · O {l.B.o.toFixed(de)} C {l.B.c.toFixed(de)}</td>
                    <td>{l.verhaeltnis.toFixed(2)}×</td>
                    <td>{l.passungPips.toFixed(1)} Pips</td>
                    <td>{STATUS[l.status]}</td>
                    <td>{l.treffer ? `${zeit(l.treffer)}${l.trefferUngefaehr ? ' (ungefähr)' : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tr-hilfe" style={{ marginTop: 6 }}>Level = Open von Kerze B (Long: Körper-Boden, Short: Körper-Top). ≈ = aus Tageskerzen (älter), auf wenige Pips genau. Zeile anklicken markiert A/B im Chart.</p>
        </section>
      )}

      {d && (
        <section className="karte in">
          <h2 className="karte-titel">Alle {TF_TEXT[d.tf]}-Kerzen <small>Prüfung mit der Kerze davor (A = Vorkerze, B = diese Kerze)</small></h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-tabelle">
              <thead><tr><th>Kerze</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Körper</th><th>Ergebnis</th></tr></thead>
              <tbody>
                {[...d.kerzen].reverse().map((k) => (
                  <tr key={k.start} onClick={() => setMarkiert(k.start)} style={{ cursor: 'pointer', background: markiert === k.start ? 'rgba(96,165,250,.12)' : undefined }}>
                    <td>{datumCh(k.start)}{k.ende !== k.start ? `–${datumCh(k.ende)}` : ''}{k.fertig ? '' : ' (läuft)'}</td>
                    <td>{k.o.toFixed(de)}</td><td>{k.h.toFixed(de)}</td><td>{k.l.toFixed(de)}</td><td>{k.c.toFixed(de)}</td>
                    <td style={{ color: k.koerperPips >= 0 ? 'var(--gruen)' : 'var(--fehler)' }}>{k.koerperPips > 0 ? '+' : ''}{k.koerperPips.toFixed(1)}</td>
                    <td style={{ whiteSpace: 'normal' }}>
                      {!k.pruefung ? '—' : k.pruefung.linie
                        ? <strong style={{ color: k.pruefung.linie === 'long' ? 'var(--gruen)' : 'var(--fehler)' }}>{k.pruefung.linie === 'long' ? 'Long' : 'Short'}-Linie {k.pruefung.level?.toFixed(de)} (B/A {k.pruefung.verhaeltnis}×, Abstand {k.pruefung.abstandPips} von {k.pruefung.tolPips} Pips)</strong>
                        : <span className="leise">{k.pruefung.gruende.join(' · ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// Kerzen des Zeitrahmens mit Linien (vom Entstehen bis zum Treffer bzw. bis heute) und markiertem Paar A/B
function PrueferChart({ d, markiert }: { d: PAntwort; markiert: string | null }) {
  const B = 900, H = 340, rand = { l: 8, r: 70, o: 10, u: 24 };
  const k = d.kerzen;
  if (!k.length) return <section className="karte in leise">Keine Kerzen im Zeitraum.</section>;
  let lo = Math.min(...k.map((x) => x.l)), hi = Math.max(...k.map((x) => x.h));
  for (const l of d.linien) if (l.lvl > lo - (hi - lo) * 0.3 && l.lvl < hi + (hi - lo) * 0.3) { lo = Math.min(lo, l.lvl); hi = Math.max(hi, l.lvl); }
  const pad = (hi - lo) * 0.04 || 0.001; lo -= pad; hi += pad;
  const w = (B - rand.l - rand.r) / k.length;
  const idx = new Map(k.map((x, i) => [x.start, i]));
  const x = (i: number) => rand.l + i * w;
  const y = (p: number) => rand.o + (1 - (p - lo) / (hi - lo)) * (H - rand.o - rand.u);
  // Index der Kerze, in die ein Zeitpunkt fällt (für Treffer)
  const kerzeVon = (ms: number) => { const tag = new Date(ms).toISOString().slice(0, 10); let i = k.length - 1; while (i > 0 && k[i].start > tag) i--; return i; };
  const de = dez(d.pair);
  const mi = markiert ? idx.get(markiert) : undefined;
  return (
    <section className="karte in">
      <h2 className="karte-titel">{d.pair} · {TF_TEXT[d.tf]} <small>{datumCh(d.von)}–{datumCh(d.bis)} · grün = Long-Linie, rot = Short-Linie, grau = verworfen</small></h2>
      <svg viewBox={`0 0 ${B} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => { const p = lo + ((hi - lo) * i) / 4; return <g key={i}><line x1={rand.l} x2={B - rand.r} y1={y(p)} y2={y(p)} stroke="var(--track)" strokeWidth={0.5} /><text x={B - rand.r + 4} y={y(p) + 3} fontSize={10} fill="var(--muted)">{p.toFixed(de)}</text></g>; })}
        {mi !== undefined && mi > 0 && <rect x={x(mi - 1)} width={w * 2} y={rand.o} height={H - rand.o - rand.u} fill="#60a5fa" opacity={0.12} />}
        {mi !== undefined && mi > 0 && <><text x={x(mi - 1) + w / 2 - 3} y={rand.o + 10} fontSize={10} fill="#60a5fa" fontWeight={700}>A</text><text x={x(mi) + w / 2 - 3} y={rand.o + 10} fontSize={10} fill="#60a5fa" fontWeight={700}>B</text></>}
        {k.map((c, i) => {
          const f = c.c >= c.o ? '#22c55e' : '#ef4444', bx = x(i) + w * 0.15, bw = Math.max(1, w * 0.7);
          return <g key={c.start}>
            <line x1={bx + bw / 2} x2={bx + bw / 2} y1={y(c.h)} y2={y(c.l)} stroke={f} strokeWidth={1} />
            <rect x={bx} width={bw} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={f} opacity={c.fertig ? 1 : 0.5} />
          </g>;
        })}
        {d.linien.map((l) => {
          const a = idx.has(l.B.start) ? (idx.get(l.B.start) as number) : 0;
          const b = l.treffer ? kerzeVon(l.treffer) + 1 : k.length;
          const farbe = l.status === 'verworfen' ? '#94a3b8' : l.seite === 'long' ? '#4ade80' : '#f87171';
          if (y(l.lvl) < rand.o || y(l.lvl) > H - rand.u) return null;
          return <g key={l.id}>
            <line x1={x(a)} x2={x(Math.max(a + 1, b))} y1={y(l.lvl)} y2={y(l.lvl)} stroke={farbe} strokeWidth={1.5} strokeDasharray={l.status === 'verworfen' ? '4 3' : undefined} />
            <text x={x(Math.max(a + 1, b)) + 2} y={y(l.lvl) + 3} fontSize={9} fill={farbe}>{l.lvl.toFixed(de)}</text>
          </g>;
        })}
        {[0, 1, 2, 3, 4, 5].map((i) => { const j = Math.min(k.length - 1, Math.floor((k.length * i) / 6)); return <text key={i} x={x(j)} y={H - 8} fontSize={10} fill="var(--muted)">{datumCh(k[j].start)}</text>; })}
      </svg>
    </section>
  );
}
