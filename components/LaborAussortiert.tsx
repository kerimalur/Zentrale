'use client';
// Aussortierte Setups: wie viele GVA-Treffer es gab, wie viele davon nicht zum Trade wurden – und warum nicht.
// Zahlen kommen aus dem Trichter des Laufs (nur Testzeitraum). Reihenfolge = Reihenfolge der Prüfschritte in der Strategie.
const GRUENDE: { key: string; text: string; hilfe: string }[] = [
  { key: 'keinHoch', text: 'Kein letztes Hoch vor dem Hit', hilfe: 'Vor dem GVA-Hit gab es kein bestätigtes Swing-Hoch (Short: Tief) in passendem Alter über (unter) der Linie.' },
  { key: 'keinBos', text: 'Kein BOS im Zeitfenster', hilfe: 'Der Kurs hat das letzte Hoch (Short: Tief) im erlaubten Zeitfenster nicht mit einem Schluss gebrochen.' },
  { key: 'bosNurUnterOpen', text: 'BOS nur unter dem Daily Open', hilfe: 'Das Hoch wurde gebrochen, aber der Schluss lag nicht über (Short: unter) dem Daily Open.' },
  { key: 'ungueltig', text: 'Ungültig: Kurs schon weggelaufen', hilfe: 'Der Kurs lief vor dem Einstieg bis zur «Ungültig»-Marke, ohne die Fib-Stufe zu erreichen.' },
  { key: 'gebrochen', text: 'Low vor dem Einstieg gebrochen', hilfe: 'Der Kurs fiel unter das Low (Fib 100 %), bevor der Einstieg erreicht wurde.' },
  { key: 'verfallen', text: 'Verfallen (kein Einstieg)', hilfe: 'Die Fib-Stufe wurde bis zum Verfall (Stundenlimit, Tagesende oder Datenende) nicht erreicht.' },
  { key: 'zuWenigConf', text: 'Zu wenig Confluences in der Box', hilfe: 'Der Kurs erreichte die Fib-Stufe, aber in der Box 0,618–0,786 lagen weniger Confluences als verlangt.' },
  { key: 'gegenBos', text: 'Wegen Gegen-BOS-Regel', hilfe: 'Ein Gegen-BOS vor dem Einstieg widersprach der gewählten Regel.' },
  { key: 'filter', text: 'Von einem Filter ausgeschlossen', hilfe: 'Setup bestand die Filter der Idee nicht (Sitzung, Wochentag, Trend, Volatilität …).' },
  { key: 'ausserBias', text: 'Ausserhalb des Bias-Fensters', hilfe: 'Das Setup lag nicht in einem Bias-Fenster (Ereignis + Tage) und wird nur als Gegenprobe gerechnet.' },
  { key: 'ohneEinstieg', text: 'Kein gültiger Einstieg / Risiko', hilfe: 'In der Simulation ergab sich kein Einstiegspreis oder ein ungültiger Stop-Loss.' },
  { key: 'positionOffen', text: 'Übersprungen: Position noch offen', hilfe: 'Auf demselben Paar lief noch ein Trade; es wird immer nur ein Trade pro Paar gehalten.' },
];

const fmt = (n: number) => n.toLocaleString('de-CH');
const pro = (n: number, g: number) => (g > 0 ? `${((n / g) * 100).toFixed(1).replace('.', ',')} %` : '—');

export function Aussortiert({ trichter, trades }: { trichter: Record<string, number>; trades: number }) {
  const gesamt = trichter.linien ?? 0;
  if (!gesamt) return null;
  const zeilen = GRUENDE.filter((g) => (trichter[g.key] ?? 0) > 0).map((g) => ({ ...g, n: trichter[g.key] }));
  const bekannt = new Set([...GRUENDE.map((g) => g.key), 'linien', 'bos', 'einstieg']);
  // Gründe anderer Strategien, die hier nicht beschrieben sind, trotzdem zeigen
  const fremd = Object.entries(trichter).filter(([k, v]) => !bekannt.has(k) && v > 0).map(([k, v]) => ({ key: k, text: k, hilfe: '', n: v }));
  const alle = [...zeilen, ...fremd];
  const summe = alle.reduce((s, z) => s + z.n, 0);
  return (
    <section className="karte in">
      <h2 className="karte-titel">Aussortierte Setups <small>{fmt(gesamt)} GVA-Treffer → {fmt(trades)} Trades</small></h2>
      <p className="tr-hilfe" style={{ margin: '0 0 8px' }}>
        {fmt(trichter.bos ?? 0)} Setups hatten einen BOS, bei {fmt(trichter.einstieg ?? 0)} wurde der Einstieg erreicht. Alles andere wurde nicht genommen – das sind die Gründe (nur Testzeitraum, jedes Setup zählt beim ersten Grund, der es stoppt):
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="lb-tabelle">
          <thead><tr><th>Grund</th><th style={{ textAlign: 'right' }}>Anzahl</th><th style={{ textAlign: 'right' }}>Anteil der GVA-Treffer</th><th>Bedeutung</th></tr></thead>
          <tbody>
            {alle.map((z) => (
              <tr key={z.key}>
                <td><strong>{z.text}</strong></td>
                <td style={{ textAlign: 'right' }}>{fmt(z.n)}</td>
                <td style={{ textAlign: 'right' }}>{pro(z.n, gesamt)}</td>
                <td style={{ whiteSpace: 'normal' }} className="leise">{z.hilfe}</td>
              </tr>
            ))}
            {alle.length > 0 && (
              <tr style={{ borderTop: '1px solid var(--track)' }}>
                <td><strong>Nicht genommen insgesamt</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{fmt(summe)}</strong></td>
                <td style={{ textAlign: 'right' }}>{pro(summe, gesamt)}</td>
                <td className="leise">Rest sind die {fmt(trades)} Trades</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!alle.length && <div className="leise">Keine Setups aussortiert.</div>}
    </section>
  );
}
