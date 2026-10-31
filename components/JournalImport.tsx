'use client';
// Import von Trades (CSV-Datei oder aus Excel/Sheets kopierte Tabelle). Spalten werden automatisch erkannt
// und können in der Vorschau angepasst werden. Jede Zeile wird auf dem Server gleich geprüft wie ein von Hand erfasster Trade.
// Pflicht sind Datum, Paar und das Ergebnis (€). Die Richtung ist freiwillig.
import { useMemo, useState } from 'react';
import { senden } from '@/lib/api';
import type { JKonto } from '@/lib/journal';
import { Popup } from './NetzBausteine';

const FELDER = [
  { id: 'datum', text: 'Datum', muss: true, namen: ['datum', 'date', 'eröffnet', 'eroeffnet', 'open time', 'opened', 'zeit', 'time', 'entry date'] },
  { id: 'geschlossen', text: 'Schliessdatum', namen: ['geschlossen', 'close time', 'closed', 'exit date', 'schliessung'] },
  { id: 'pair', text: 'Paar', muss: true, namen: ['pair', 'paar', 'symbol', 'instrument', 'markt'] },
  { id: 'richtung', text: 'Richtung', namen: ['richtung', 'direction', 'side', 'type', 'typ', 'long/short', 'buy/sell'] },
  { id: 'entry', text: 'Entry', namen: ['entry', 'einstieg', 'open price', 'open', 'eröffnungskurs'] },
  { id: 'sl', text: 'Stop-Loss', namen: ['sl', 'stop', 'stop loss', 'stoploss', 's/l'] },
  { id: 'tp', text: 'Take-Profit', namen: ['tp', 'take profit', 'target', 'ziel', 't/p'] },
  { id: 'exit', text: 'Ausstieg', namen: ['exit', 'ausstieg', 'close price', 'close', 'schlusskurs'] },
  { id: 'r', text: 'R', namen: ['r', 'r-multiple', 'rr', 'r multiple', 'ergebnis r', 'result r'] },
  { id: 'eur', text: 'Ergebnis €', muss: true, namen: ['ergebnis', 'profit', 'gewinn', 'pnl', 'p&l', 'eur', 'gewinn eur', 'ergebnis eur', 'ergebnis €'] },
  { id: 'risiko', text: 'Risiko €', namen: ['risiko', 'risk', 'risiko eur'] },
  { id: 'tf', text: 'Zeitrahmen', namen: ['tf', 'zeitrahmen', 'timeframe', 'gva_typ', 'gva'] },
  { id: 'tags', text: 'Confluences/Tags', namen: ['tags', 'confluences', 'confluence', 'setup'] },
  { id: 'fehler', text: 'Fehler', namen: ['fehler', 'mistakes', 'mistake', 'error'] },
  { id: 'notiz', text: 'Notiz', namen: ['notiz', 'note', 'notes', 'kommentar', 'comment'] },
] as const;
type FeldId = typeof FELDER[number]['id'];

function zerlegen(text: string): string[][] {
  const zeilen = text.replace(/\r\n?/g, '\n').split('\n').filter((z) => z.trim());
  if (!zeilen.length) return [];
  const kopf = zeilen[0];
  const trenner = kopf.includes('\t') ? '\t' : (kopf.match(/;/g) || []).length > (kopf.match(/,/g) || []).length ? ';' : ',';
  return zeilen.map((z) => {
    const out: string[] = [];
    let feld = '', inQ = false;
    for (let i = 0; i < z.length; i++) {
      const c = z[i];
      if (c === '"') { if (inQ && z[i + 1] === '"') { feld += '"'; i++; } else inQ = !inQ; }
      else if (c === trenner && !inQ) { out.push(feld.trim()); feld = ''; }
      else feld += c;
    }
    out.push(feld.trim());
    return out;
  });
}

function datumIso(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const j = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = `${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return m[4] ? `${d}T${m[4].padStart(2, '0')}:${m[5]}` : d;
  }
  return null;
}
const zahl = (s: string | undefined) => {
  if (!s || !s.trim()) return null;
  let t = s.replace(/[€$\s']/g, '');
  if (/,\d+$/.test(t) && !/\.\d+,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
};
const richtungVon = (s: string) => (/^(long|buy|kauf|l|b)$/i.test(s.trim()) ? 'long' : /^(short|sell|verkauf|s)$/i.test(s.trim()) ? 'short' : null);
const tfVon = (s: string) => { const x = s.toUpperCase(); return /3\s*-?\s*(D|T)/.test(x) ? '3D' : /\bW|WOCH|WEEK/.test(x) ? 'W' : /\bM\b|MONAT|MONTH/.test(x) ? 'M' : null; };
const liste = (s: string | undefined) => (s ? s.split(/[,|;]/).map((x) => x.trim()).filter(Boolean) : []);

export function ImportPopup({ paare, konten, onClose }: { paare: string[]; konten: JKonto[]; onClose: (neu: boolean) => void }) {
  const [text, setText] = useState('');
  const [art, setArt] = useState<'backtest' | 'live'>('live');
  const [konto, setKonto] = useState(konten[0]?.id || '');
  const [zuordnung, setZuordnung] = useState<Partial<Record<FeldId, number>>>({});
  const [ergebnis, setErgebnis] = useState<{ importiert: number; fehlerAnzahl: number; fehler: { zeile: number; text: string }[] } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const tabelle = useMemo(() => zerlegen(text), [text]);
  const kopf = tabelle[0] || [];
  const daten = tabelle.slice(1);
  // Automatische Zuordnung, wenn sich der Kopf ändert
  const auto = useMemo(() => {
    const z: Partial<Record<FeldId, number>> = {};
    const k = kopf.map((x) => x.toLowerCase().trim());
    for (const f of FELDER) { const i = k.findIndex((x) => (f.namen as readonly string[]).includes(x)); if (i >= 0) z[f.id] = i; }
    return z;
  }, [kopf.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = { ...auto, ...zuordnung };
  const wert = (zeile: string[], id: FeldId) => (map[id] === undefined || map[id]! < 0 ? undefined : zeile[map[id]!]);

  const trades = useMemo(() => daten.map((z, i) => {
    const eroeffnet = datumIso(wert(z, 'datum') || '');
    const geschlossenRoh = wert(z, 'geschlossen');
    const r = zahl(wert(z, 'r')), eur = zahl(wert(z, 'eur'));
    const exit = zahl(wert(z, 'exit'));
    const entry = zahl(wert(z, 'entry')), sl = zahl(wert(z, 'sl'));
    const hatErgebnis = r !== null || eur !== null || exit !== null;
    return {
      zeile: i + 2, art, konto: art === 'live' ? konto : null, pair: (wert(z, 'pair') || '').toUpperCase().replace(/[^A-Z]/g, ''), richtung: richtungVon(wert(z, 'richtung') || ''),
      eroeffnet, geschlossen: geschlossenRoh ? datumIso(geschlossenRoh) : hatErgebnis ? eroeffnet : null,
      entry, sl, tp: entry !== null ? zahl(wert(z, 'tp')) : null, exit: entry !== null ? exit : null,
      rManuell: r, ergebnisEur: eur, risikoEur: zahl(wert(z, 'risiko')), lots: null,
      tf: tfVon(wert(z, 'tf') || ''), tags: liste(wert(z, 'tags')), fehler: liste(wert(z, 'fehler')), notiz: wert(z, 'notiz') || '', bild: '', gefuehl: null, gvaLevel: null,
    };
  }), [daten, map, art, konto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ohne Ergebnis (€, R oder Kurse) wäre der Trade offen. Das lässt der Server nur mit Entry und Stop-Loss zu.
  const schlecht = (t: (typeof trades)[number]) => !t.eroeffnet || !paare.includes(t.pair) || (t.ergebnisEur === null && t.rManuell === null && (t.entry === null || t.sl === null));
  const unvollstaendig = trades.filter(schlecht).length;

  async function datei(f: File) { setText(await f.text()); setZuordnung({}); setErgebnis(null); }
  async function importieren() {
    setLaeuft(true); setInfo(null);
    try {
      let importiert = 0, fehlerAnzahl = 0;
      const fehler: { zeile: number; text: string }[] = [];
      for (let i = 0; i < trades.length; i += 500) {
        const r = await senden<{ importiert: number; fehlerAnzahl: number; fehler: { zeile: number; text: string }[] }>('/api/journal/import', { trades: trades.slice(i, i + 500) });
        importiert += r.importiert; fehlerAnzahl += r.fehlerAnzahl; fehler.push(...r.fehler);
      }
      setErgebnis({ importiert, fehlerAnzahl, fehler: fehler.slice(0, 50) });
    } catch (e) { setInfo((e as Error).message); }
    finally { setLaeuft(false); }
  }

  if (ergebnis) {
    return (
      <Popup titel="Import fertig" unter={`${ergebnis.importiert} Trades importiert`} onClose={() => onClose(ergebnis.importiert > 0)}>
        {ergebnis.fehlerAnzahl > 0 && (
          <>
            <div className="fehlerbox" style={{ fontSize: 13 }}>{ergebnis.fehlerAnzahl} Zeilen wurden nicht übernommen:</div>
            <div className="jr-import-fehler">{ergebnis.fehler.map((f) => <div key={f.zeile}>Zeile {f.zeile}: {f.text}</div>)}</div>
          </>
        )}
        <button className="knopf-klein press tr-primaer" style={{ marginTop: 10 }} onClick={() => onClose(ergebnis.importiert > 0)}>Fertig</button>
      </Popup>
    );
  }

  return (
    <Popup titel="Trades importieren" unter="CSV-Datei oder aus Excel/Google Sheets kopierte Tabelle (erste Zeile = Spaltennamen)" onClose={() => onClose(false)} breit>
      <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 280 }}>
        <button aria-pressed={art === 'backtest'} onClick={() => setArt('backtest')}>als Backtest</button>
        <button aria-pressed={art === 'live'} onClick={() => setArt('live')}>als Live</button>
      </div>
      {art === 'live' && konten.length > 1 && (
        <label className="nw-feld" style={{ marginTop: 10, maxWidth: 280 }}>Auf welches Konto?
          <select value={konto} onChange={(e) => setKonto(e.target.value)}>{konten.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
        </label>
      )}
      <label className="nw-feld" style={{ marginTop: 10 }}>Datei (.csv)<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => e.target.files?.[0] && datei(e.target.files[0])} /></label>
      <label className="nw-feld">… oder hier einfügen<textarea rows={4} className="jr-text" value={text} onChange={(e) => { setText(e.target.value); setErgebnis(null); }} placeholder={'Datum;Paar;Ergebnis\n21.05.2026;GBPAUD;12,50\n22.05.2026;EURUSD;-4,20'} /></label>

      {kopf.length > 0 && (
        <>
          <h4 className="nw-h">Spalten zuordnen</h4>
          <div className="jr-import-map">
            {FELDER.map((f) => (
              <label key={f.id} className="nw-feld">{f.text}{'muss' in f && f.muss ? ' *' : ''}
                <select value={map[f.id] ?? -1} onChange={(e) => setZuordnung((z) => ({ ...z, [f.id]: Number(e.target.value) }))}>
                  <option value={-1}>—</option>
                  {kopf.map((k, i) => <option key={i} value={i}>{k || `Spalte ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Pflicht sind Datum, Paar und Ergebnis €. Richtung, Entry, SL und TP sind freiwillig. Plus zählt als Take-Profit, Minus als Stop-Loss, 0 als Break-Even.
            Die Rendite in % braucht Einzahlungen, die du im Zahnrad einträgst. Backtests nur mit R (ohne Kurse) gehen auch.
          </div>
          <h4 className="nw-h">Vorschau · {trades.length} Zeilen{unvollstaendig ? ` · ${unvollstaendig} unvollständig` : ''}</h4>
          <div className="jr-import-vorschau">
            <table>
              <thead><tr><th>Zeile</th><th>Datum</th><th>Paar</th><th>Seite</th><th>Entry</th><th>SL</th><th>R</th><th>€</th><th>TF</th></tr></thead>
              <tbody>
                {trades.slice(0, 8).map((t) => {
                  return (
                    <tr key={t.zeile} className={schlecht(t) ? 'schlecht' : undefined}>
                      <td>{t.zeile}</td><td>{t.eroeffnet || '?'}</td><td>{t.pair || '?'}</td><td>{t.richtung || '–'}</td>
                      <td>{t.entry ?? ''}</td><td>{t.sl ?? ''}</td><td>{t.rManuell ?? ''}</td><td>{t.ergebnisEur ?? ''}</td><td>{t.tf ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {info && <div className="fehlerbox" style={{ fontSize: 13 }}>{info}</div>}
          <button className="knopf-klein press tr-primaer" style={{ marginTop: 10 }} onClick={importieren} disabled={laeuft || !trades.length}>{laeuft ? 'Importiere …' : `${trades.length} Trades importieren`}</button>
        </>
      )}
    </Popup>
  );
}
