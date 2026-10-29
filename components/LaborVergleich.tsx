'use client';
// Labor → Vergleich: 2–4 fertige Läufe nebeneinander. Was ist anders eingestellt (Spezifikation), was kam heraus
// (Kennzahlen, Kurven, Robustheit, Trichter), und welche Trades gibt es nur in einem Lauf?
import { useEffect, useMemo, useState } from 'react';
import { holen, senden } from '@/lib/api';
import { prozent, rText, type LKennzahlen } from '@/lib/labor';
import { UrteilChip } from './LaborTeile';

export interface VLauf { id: string; idee: string; name: string; typ: string; v: number; art: string; ende: string | null; kurz: { urteil?: string; n?: number; avgR?: number | null; quote?: number | null } | null }
interface VSpalte {
  id: string; idee: string | null; name: string; v: number; art: string; ende: string | null; typ: string; urteil: string; warum: string; n: number; nUnabhaengig: number; varianten: number;
  kennzahlen: LKennzahlen | null; forward: { kennzahlen: LKennzahlen } | null; kurve: [number, number][] | null; forwardKurve: [number, number][] | null;
  trichter: Record<string, number> | null; raster: { id: string; name: string; status: 'ja' | 'nein' | 'offen'; text: string }[];
  grundAusstieg: { schluessel: string; n: number; avg: number | null }[] | null; mfeMedian: number | null; maeMedian: number | null;
  monteCarlo: { dd95: number; serie95: number } | null; fazit: { ampel: string; satz: string } | null;
}
export interface VErgebnis { spalten: VSpalte[]; spezifikation: { schluessel: string; name: string; werte: string[]; verschieden: boolean }[]; trades: { gesamt: number; gemeinsam: number; nurHier: number }[] }

export const FARBEN = ['#60a5fa', '#f59e0b', '#a78bfa', '#34d399'];
export const TRICHTER_TEXT: Record<string, string> = {
  linien: 'GVA-Treffer', keinHoch: 'kein letztes Hoch', keinBos: 'kein BOS', bosNurUnterOpen: 'BOS nur unter Daily Open', bos: 'mit BOS', ungueltig: 'ungültig (weggelaufen)',
  gebrochen: 'Low gebrochen', verfallen: 'verfallen', zuWenigConf: 'zu wenig Confluences', gegenBos: 'Gegen-BOS-Regel', einstieg: 'Einstieg erreicht',
};
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const laufTitel = (s: { name: string; v: number; art: string }) => `${s.name} · v${s.v}${s.art === 'forward' ? ' · mit Forward' : ''}`;

// Kennzahlen-Zeilen: Wert holen, Text, und welche Richtung besser ist (für die Markierung)
export const KZ: { name: string; wert: (s: VSpalte) => number | null | undefined; text: (x: number | null | undefined) => string; besser: 'hoch' | 'tief' | null }[] = [
  { name: 'Trades', wert: (s) => s.kennzahlen?.n ?? s.n, text: (x) => (x ?? '—').toString(), besser: null },
  { name: 'Unabhängige Fälle', wert: (s) => s.nUnabhaengig, text: (x) => (x ?? '—').toString(), besser: null },
  { name: 'Ø R pro Trade', wert: (s) => s.kennzahlen?.avgR, text: (x) => rText(x), besser: 'hoch' },
  { name: 'Trefferquote', wert: (s) => s.kennzahlen?.quote, text: (x) => prozent(x), besser: 'hoch' },
  { name: 'Summe R', wert: (s) => s.kennzahlen?.summeR, text: (x) => rText(x, 1), besser: 'hoch' },
  { name: 'Profit-Faktor', wert: (s) => s.kennzahlen?.pf, text: (x) => (x === null || x === undefined ? '—' : x.toFixed(2).replace('.', ',')), besser: 'hoch' },
  { name: 'Max. Drawdown', wert: (s) => s.kennzahlen?.maxDD, text: (x) => (x === null || x === undefined ? '—' : `${x.toFixed(1).replace('.', ',')} R`), besser: 'tief' },
  { name: 'Längste Verlustserie', wert: (s) => s.kennzahlen?.verlustSerie, text: (x) => (x ?? '—').toString(), besser: 'tief' },
  { name: 'SQN', wert: (s) => s.kennzahlen?.sqn, text: (x) => (x === null || x === undefined ? '—' : x.toFixed(2).replace('.', ',')), besser: 'hoch' },
  { name: 'Median R', wert: (s) => s.kennzahlen?.median, text: (x) => rText(x), besser: 'hoch' },
  { name: 'Ø Gewinner', wert: (s) => s.kennzahlen?.avgGewinn, text: (x) => rText(x), besser: 'hoch' },
  { name: 'Ø Verlierer', wert: (s) => s.kennzahlen?.avgVerlust, text: (x) => rText(x), besser: 'hoch' },
  { name: 'MFE (Median)', wert: (s) => s.mfeMedian, text: (x) => (x === null || x === undefined ? '—' : `${x.toFixed(2).replace('.', ',')} R`), besser: 'hoch' },
  { name: 'Drawdown 95 % (Monte Carlo)', wert: (s) => s.monteCarlo?.dd95, text: (x) => (x === null || x === undefined ? '—' : `${x.toFixed(1).replace('.', ',')} R`), besser: 'tief' },
  { name: 'Forward Ø R', wert: (s) => s.forward?.kennzahlen.avgR, text: (x) => rText(x), besser: 'hoch' },
  { name: 'Forward Trades', wert: (s) => s.forward?.kennzahlen.n, text: (x) => (x ?? '—').toString(), besser: null },
];
export function bester(werte: (number | null | undefined)[], besser: 'hoch' | 'tief' | null) {
  const z = werte.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!besser || z.length < 2) return null;
  return besser === 'hoch' ? Math.max(...z) : Math.min(...z);
}

export function LaborVergleich({ startIds }: { startIds?: string[] }) {
  const [laeufe, setLaeufe] = useState<VLauf[] | null>(null);
  const [wahl, setWahl] = useState<string[]>(startIds || []);
  const [erg, setErg] = useState<VErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [alleZeilen, setAlleZeilen] = useState(false);
  const [suche, setSuche] = useState('');

  useEffect(() => { holen<{ laeufe: VLauf[] }>('/api/labor/laeufe-fertig').then((r) => setLaeufe(r.laeufe)).catch((e) => setFehler(e.message)); }, []);
  const vergleichen = (ids = wahl) => {
    setLaedt(true); setFehler(null);
    senden<VErgebnis>('/api/labor/vergleich', { ids }).then(setErg).catch((e) => setFehler(e.message)).finally(() => setLaedt(false));
  };
  useEffect(() => { if (startIds && startIds.length >= 2) vergleichen(startIds); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sichtbar = useMemo(() => (laeufe || []).filter((l) => !suche.trim() || l.name.toLowerCase().includes(suche.toLowerCase())), [laeufe, suche]);
  const umschalten = (id: string) => setWahl((w) => (w.includes(id) ? w.filter((x) => x !== id) : w.length >= 4 ? w : [...w, id]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in">
        <h2 className="karte-titel">Läufe vergleichen <small>2–4 fertige Läufe wählen</small></h2>
        <p className="tr-hilfe" style={{ margin: '0 0 10px' }}>Typisch: dieselbe Idee in zwei Versionen (z. B. 1 gegen 2 Confluences, mit gegen ohne Daily-Open-Bedingung). Gezeigt wird zuerst, was anders eingestellt ist, dann was herauskam.</p>
        <div className="lb-kopf" style={{ marginBottom: 8 }}>
          <input className="lb-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Läufe suchen …" aria-label="Läufe suchen" />
          <button className="knopf-akzent press" disabled={wahl.length < 2 || laedt} onClick={() => vergleichen()}>{laedt ? 'Lade …' : `Vergleichen (${wahl.length})`}</button>
          {wahl.length > 0 && <button className="knopf-klein press" onClick={() => { setWahl([]); setErg(null); }}>Auswahl leeren</button>}
        </div>
        {!laeufe && !fehler && <div className="leise">Lade Läufe …</div>}
        {laeufe && !laeufe.length && <div className="leise">Noch keine fertigen Läufe.</div>}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table className="lb-tabelle">
            <tbody>
              {sichtbar.map((l) => {
                const i = wahl.indexOf(l.id);
                return (
                  <tr key={l.id} onClick={() => umschalten(l.id)} style={{ cursor: 'pointer', background: i >= 0 ? `${FARBEN[i]}22` : undefined }}>
                    <td style={{ width: 28 }}><input type="checkbox" readOnly checked={i >= 0} aria-label={`${l.name} v${l.v} wählen`} /></td>
                    <td>{i >= 0 && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: FARBEN[i], marginRight: 6 }} />}<strong>{l.name}</strong> · v{l.v}{l.art === 'forward' ? ' · Forward' : ''}</td>
                    <td className="leise">{datum(l.ende)}</td>
                    <td>{l.kurz?.urteil ? <UrteilChip urteil={l.kurz.urteil} /> : '—'}</td>
                    <td>{l.kurz?.n ?? '—'} Trades</td>
                    <td>{l.kurz?.avgR !== null && l.kurz?.avgR !== undefined ? `Ø ${rText(l.kurz.avgR)}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fehler && <div className="fehlerbox" style={{ marginTop: 10 }}>{fehler}</div>}
      </section>
      {erg && (
        <div><a className="knopf-klein press" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/labor/pdf?vergleich=${erg.spalten.map((s) => s.id).join(',')}`} download>Vergleich als PDF</a></div>
      )}
      {erg && <VergleichErgebnis erg={erg} alleZeilen={alleZeilen} setAlleZeilen={setAlleZeilen} />}
    </div>
  );
}

function VergleichErgebnis({ erg, alleZeilen, setAlleZeilen }: { erg: VErgebnis; alleZeilen: boolean; setAlleZeilen: (b: boolean) => void }) {
  const S = erg.spalten;
  const zeilen = alleZeilen ? erg.spezifikation : erg.spezifikation.filter((z) => z.verschieden);
  const trichterKeys = [...new Set(S.flatMap((s) => Object.keys(s.trichter || {})))];
  const rasterIds = [...new Map(S.flatMap((s) => s.raster.map((r) => [r.id, r.name] as [string, string]))).entries()];
  const kopf = (
    <thead><tr><th></th>{S.map((s, i) => <th key={s.id} style={{ borderBottom: `3px solid ${FARBEN[i]}` }}>{laufTitel(s)}</th>)}</tr></thead>
  );
  return (
    <>
      <section className="karte in">
        <h2 className="karte-titel">Ergebnis</h2>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${S.length}, minmax(0, 1fr))`, gap: 10 }}>
          {S.map((s, i) => (
            <div key={s.id} className="karte" style={{ padding: 12, borderTop: `4px solid ${FARBEN[i]}` }}>
              <strong style={{ fontSize: 14 }}>{laufTitel(s)}</strong>
              <div style={{ margin: '6px 0' }}><UrteilChip urteil={s.urteil} /></div>
              <div className="tr-hilfe">{s.warum}</div>
              {s.fazit?.satz && <div className="tr-hilfe" style={{ marginTop: 6 }}>{s.fazit.satz}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Was ist anders eingestellt? <small>{erg.spezifikation.filter((z) => z.verschieden).length} Unterschiede</small></h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="lb-tabelle">
            {kopf}
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.schluessel} style={z.verschieden ? { background: 'rgba(245,158,11,.10)' } : undefined}>
                  <td>{z.name}</td>{z.werte.map((w, i) => <td key={i} style={{ whiteSpace: 'normal', fontWeight: z.verschieden ? 600 : 400 }}>{w}</td>)}
                </tr>
              ))}
              {!zeilen.length && <tr><td colSpan={S.length + 1} className="leise">Keine Unterschiede in der Einstellung.</td></tr>}
            </tbody>
          </table>
        </div>
        <button className="knopf-klein press" style={{ marginTop: 8 }} onClick={() => setAlleZeilen(!alleZeilen)}>{alleZeilen ? 'Nur Unterschiede' : 'Alle Einstellungen zeigen'}</button>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Kennzahlen <small>fett = bester Wert</small></h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="lb-tabelle">
            {kopf}
            <tbody>
              {KZ.map((z) => {
                const w = S.map(z.wert), b = bester(w, z.besser);
                if (w.every((x) => x === null || x === undefined)) return null;
                return <tr key={z.name}><td>{z.name}</td>{w.map((x, i) => <td key={i} style={{ fontWeight: b !== null && x === b ? 700 : 400 }}>{z.text(x)}</td>)}</tr>;
              })}
              <tr><td>Trades nur in diesem Lauf</td>{erg.trades.map((t, i) => <td key={i}>{t.nurHier} von {t.gesamt}</td>)}</tr>
              <tr><td>Trades in allen Läufen</td>{erg.trades.map((t, i) => <td key={i}>{t.gemeinsam}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Kumulierte R <small>gestrichelt = Forward</small></h2>
        <Kurven spalten={S} />
      </section>

      {trichterKeys.length > 0 && (
        <section className="karte in">
          <h2 className="karte-titel">Trichter <small>wo die Setups ausscheiden</small></h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-tabelle">
              {kopf}
              <tbody>{trichterKeys.map((k) => <tr key={k}><td>{TRICHTER_TEXT[k] || k}</td>{S.map((s, i) => <td key={i}>{s.trichter?.[k] ?? '—'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {rasterIds.length > 0 && (
        <section className="karte in">
          <h2 className="karte-titel">Robustheit</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-tabelle">
              {kopf}
              <tbody>
                {rasterIds.map(([id, name]) => (
                  <tr key={id}><td>{name}</td>{S.map((s, i) => { const r = s.raster.find((x) => x.id === id); return <td key={i} title={r?.text} style={{ color: r?.status === 'ja' ? 'var(--gruen)' : r?.status === 'nein' ? 'var(--fehler)' : 'var(--muted)', fontWeight: 600 }}>{r ? (r.status === 'ja' ? '✓ ja' : r.status === 'nein' ? '✗ nein' : 'offen') : '—'}</td>; })}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export function Kurven({ spalten }: { spalten: VSpalte[] }) {
  const B = 900, H = 260, rand = { l: 46, r: 10, o: 10, u: 22 };
  const alle = spalten.flatMap((s) => [...(s.kurve || []), ...(s.forwardKurve || [])]);
  if (!alle.length) return <div className="leise">Keine Kurven (Hypothesen haben keine Trade-Kurve).</div>;
  // Forward-Kurven beginnen beim Endstand des Backtests
  const fwVersatz = (s: VSpalte) => (s.kurve?.length ? s.kurve[s.kurve.length - 1][1] : 0);
  const werte = spalten.flatMap((s) => [...(s.kurve || []).map((p) => p[1]), ...(s.forwardKurve || []).map((p) => p[1] + fwVersatz(s))]);
  const t0 = Math.min(...alle.map((p) => p[0])), t1 = Math.max(...alle.map((p) => p[0]));
  let lo = Math.min(0, ...werte), hi = Math.max(0, ...werte);
  if (hi === lo) hi = lo + 1;
  const x = (t: number) => rand.l + ((t - t0) / Math.max(1, t1 - t0)) * (B - rand.l - rand.r);
  const y = (v: number) => rand.o + (1 - (v - lo) / (hi - lo)) * (H - rand.o - rand.u);
  const pfad = (pkt: [number, number][], plus = 0) => pkt.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1] + plus).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${B} ${H}`} style={{ width: '100%', height: 'auto', background: 'var(--bg)', borderRadius: 8 }}>
      {[0, 1, 2, 3, 4].map((i) => { const v = lo + ((hi - lo) * i) / 4; return <g key={i}><line x1={rand.l} x2={B - rand.r} y1={y(v)} y2={y(v)} stroke="var(--track)" strokeWidth={0.5} /><text x={4} y={y(v) + 3} fontSize={10} fill="var(--muted)">{v.toFixed(0)} R</text></g>; })}
      <line x1={rand.l} x2={B - rand.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={0.8} />
      {spalten.map((s, i) => (
        <g key={s.id}>
          {s.kurve && s.kurve.length > 0 && <path d={pfad(s.kurve)} fill="none" stroke={FARBEN[i]} strokeWidth={1.6} />}
          {s.forwardKurve && s.forwardKurve.length > 0 && <path d={pfad(s.forwardKurve, fwVersatz(s))} fill="none" stroke={FARBEN[i]} strokeWidth={1.6} strokeDasharray="5 3" />}
        </g>
      ))}
      <text x={rand.l} y={H - 6} fontSize={10} fill="var(--muted)">{new Date(t0 * 1000).getUTCFullYear()}</text>
      <text x={B - rand.r - 30} y={H - 6} fontSize={10} fill="var(--muted)">{new Date(t1 * 1000).getUTCFullYear()}</text>
    </svg>
  );
}
