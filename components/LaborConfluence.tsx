'use client';
// Confluences im Labor-Ergebnis: Chips pro Trade und Auswertung «welche Confluence funktioniert?».
// Rechnet im Browser aus den Trades des Laufs (info.confAlle) – Auswahl und Mindestanzahl sind sofort einstellbar, ohne neu zu rechnen.
import { useMemo } from 'react';
import type { LTrade } from '@/lib/labor';
import { prozent, rText } from '@/lib/labor';
import { CONF_ARTEN, CONF_FARBE, confAuswertung, confFilter, confKurz, confName, confVon, stat, type CStat } from '@/lib/confluence';

const WENIG = 20; // darunter sind Quote und Ø R kaum aussagekräftig

export function ConfChips({ t, nurZaehlende = false }: { t: LTrade; nurZaehlende?: boolean }) {
  const c = confVon(t);
  if (!c) return <span className="leise">—</span>;
  const zaehlend = new Set(((t.info as { conf?: { art: string }[] }).conf || []).map((x) => x.art));
  const liste = nurZaehlende ? c.liste.filter((x) => zaehlend.has(x.art)) : c.liste;
  if (!liste.length) return <span style={{ color: 'var(--fehler)', fontWeight: 600 }}>keine</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {liste.map((x) => (
        <span key={x.art} title={`${confName(x.art, t.seite)} ${x.preis}${zaehlend.size && !zaehlend.has(x.art) ? ' (zählt nicht als Bedingung)' : ''}`}
          style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 999, border: `1px solid ${CONF_FARBE[x.art]}`, color: CONF_FARBE[x.art], opacity: zaehlend.size && !zaehlend.has(x.art) ? 0.55 : 1 }}>
          {confKurz(x.art, t.seite)}
        </span>
      ))}
    </span>
  );
}

const Zelle = ({ s }: { s: CStat }) => (
  <>
    <td style={{ textAlign: 'right', opacity: s.n < WENIG ? 0.55 : 1 }}>{s.n}{s.n > 0 && s.n < WENIG ? ' ⚠' : ''}</td>
    <td style={{ textAlign: 'right', opacity: s.n < WENIG ? 0.55 : 1 }}>{prozent(s.quote)}</td>
    <td style={{ textAlign: 'right', opacity: s.n < WENIG ? 0.55 : 1, color: (s.avg ?? 0) >= 0 ? 'var(--gruen)' : 'var(--fehler)', fontWeight: 600 }}>{rText(s.avg)}</td>
    <td style={{ textAlign: 'right', opacity: s.n < WENIG ? 0.55 : 1 }}>{rText(s.summe, 1)}</td>
  </>
);

export function ConfluencePanel({ trades, wahl, setWahl, min, setMin, nurAuswahl, setNurAuswahl, ausgeschieden }: {
  trades: LTrade[]; wahl: string[]; setWahl: (w: string[]) => void; min: number; setMin: (n: number) => void;
  nurAuswahl: boolean; setNurAuswahl: (b: boolean) => void; ausgeschieden: number;
}) {
  const A = useMemo(() => confAuswertung(trades, wahl), [trades, wahl]);
  const alle = useMemo(() => stat(trades), [trades]);
  const gefiltert = useMemo(() => stat(confFilter(trades, wahl, min)), [trades, wahl, min]);
  const umschalten = (a: string) => setWahl(wahl.includes(a) ? wahl.filter((x) => x !== a) : [...wahl, a]);
  return (
    <section className="karte in">
      <h2 className="karte-titel">Confluences <small>welche kam vor – und was brachte sie?</small></h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span className="leise">Zählen:</span>
        {CONF_ARTEN.map((a) => (
          <button key={a} className="knopf-klein press" aria-pressed={wahl.includes(a)} onClick={() => umschalten(a)}
            style={{ borderColor: CONF_FARBE[a], ...(wahl.includes(a) ? { background: CONF_FARBE[a], color: '#111', fontWeight: 700 } : { color: CONF_FARBE[a] }) }}>
            {a === 'va' ? 'Value Area' : confName(a)}
          </button>
        ))}
        <span className="leise" style={{ marginLeft: 8 }}>Mindestens</span>
        <select value={min} onChange={(x) => setMin(Number(x.target.value))}>
          {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="leise">davon</span>
        <button className="knopf-klein press" aria-pressed={nurAuswahl} onClick={() => setNurAuswahl(!nurAuswahl)}>{nurAuswahl ? 'Trade-Liste gefiltert' : 'Trade-Liste auch filtern'}</button>
      </div>

      <div className="lb-kacheln" style={{ marginBottom: 10 }}>
        <div className="lb-kachel"><div className="leise">Alle Trades</div><div style={{ fontSize: 20, fontWeight: 700 }}>{alle.n}</div><div className="leise">{prozent(alle.quote)} · {rText(alle.avg)} · Σ {rText(alle.summe, 1)}</div></div>
        <div className="lb-kachel"><div className="leise">Mit ≥ {min} der gewählten</div><div style={{ fontSize: 20, fontWeight: 700 }}>{gefiltert.n}</div><div className="leise">{prozent(gefiltert.quote)} · {rText(gefiltert.avg)} · Σ {rText(gefiltert.summe, 1)}</div></div>
      </div>

      <h4 className="nw-h">Pro Confluence <small className="leise">Trades, die sie hatten – gegen Trades ohne sie</small></h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="lb-tabelle">
          <thead><tr><th>Confluence</th><th style={{ textAlign: 'right' }}>Anteil Trades</th><th style={{ textAlign: 'right' }}>mit: Trades</th><th style={{ textAlign: 'right' }}>Treffer</th><th style={{ textAlign: 'right' }}>Ø R</th><th style={{ textAlign: 'right' }}>Σ R</th><th style={{ textAlign: 'right' }}>ohne: Trades</th><th style={{ textAlign: 'right' }}>Treffer</th><th style={{ textAlign: 'right' }}>Ø R</th></tr></thead>
          <tbody>
            {A.einzeln.map((z) => (
              <tr key={z.art}>
                <td><span style={{ color: CONF_FARBE[z.art], fontWeight: 700 }}>{z.art === 'va' ? 'Value Area Low (L) / High (S)' : confName(z.art)}</span></td>
                <td style={{ textAlign: 'right' }}>{prozent(z.haeufigkeit)}</td>
                <Zelle s={z.mit} />
                <td style={{ textAlign: 'right', opacity: z.ohne.n < WENIG ? 0.55 : 1 }}>{z.ohne.n}</td>
                <td style={{ textAlign: 'right', opacity: z.ohne.n < WENIG ? 0.55 : 1 }}>{prozent(z.ohne.quote)}</td>
                <td style={{ textAlign: 'right', opacity: z.ohne.n < WENIG ? 0.55 : 1 }}>{rText(z.ohne.avg)}</td>
              </tr>
            ))}
            {!A.einzeln.length && <tr><td colSpan={9} className="leise">Keine Confluence gewählt.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="gs-zwei" style={{ marginTop: 14 }}>
        <div>
          <h4 className="nw-h">Nach Anzahl <small className="leise">der gewählten Confluences</small></h4>
          <table className="lb-tabelle">
            <thead><tr><th>Anzahl</th><th style={{ textAlign: 'right' }}>Trades</th><th style={{ textAlign: 'right' }}>Treffer</th><th style={{ textAlign: 'right' }}>Ø R</th><th style={{ textAlign: 'right' }}>Σ R</th></tr></thead>
            <tbody>
              {A.anzahl.map((z) => <tr key={z.k}><td>{z.k === 3 ? '3 oder mehr' : z.k === 0 ? 'keine' : z.k}</td><Zelle s={z.stat} /></tr>)}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="nw-h">Kombinationen <small className="leise">genau diese Confluences zusammen</small></h4>
          <table className="lb-tabelle">
            <thead><tr><th>Kombination</th><th style={{ textAlign: 'right' }}>Trades</th><th style={{ textAlign: 'right' }}>Treffer</th><th style={{ textAlign: 'right' }}>Ø R</th><th style={{ textAlign: 'right' }}>Σ R</th></tr></thead>
            <tbody>
              {A.kombi.slice(0, 14).map((z) => (
                <tr key={z.key}><td>{z.key === '—' ? 'keine' : z.key.split('+').map((a) => confKurz(a)).join(' + ')}</td><Zelle s={z.stat} /></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="tr-hilfe" style={{ marginTop: 10 }}>
        ⚠ = weniger als {WENIG} Trades, Zahlen kaum aussagekräftig. Treffer = Anteil Trades mit Gewinn (R &gt; 0). Es wird vieles gleichzeitig verglichen – eine einzelne Kombination, die gut aussieht, kann reiner Zufall sein.
        VA = Value Area Low bei Long, High bei Short; Volumen-Confluences aus dem Profil vom GVA-Hit bis zum Hoch/Tief (Zeit auf Preis, siehe Hilfe der Strategie).
        {ausgeschieden > 0 && ` Im Lauf wurden ${ausgeschieden} Setups wegen zu weniger Confluences gar nicht gehandelt – für einen fairen Vergleich «mit/ohne» die Vorlage «Confluence-Auswertung» rechnen (Mindestens 0).`}
        {A.ohneVolumen > 0 && ` ${A.ohneVolumen} Trades stammen aus einem älteren Lauf ohne Volumen-Daten (POC/VA fehlen dort) – Lauf neu rechnen.`}
        {A.ohneConfDaten > 0 && ` ${A.ohneConfDaten} Trades ohne Confluence-Angaben.`}
      </p>
    </section>
  );
}
