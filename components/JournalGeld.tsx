'use client';
// Journal-Einstellungen: Konten, Ein- und Auszahlungen und die Werte für die R-Auswertung (Backtests).
// Ein- und Auszahlungen zählen nicht als Gewinn. Sie bestimmen nur den Kontostand, damit die Rendite in % stimmt.
import { useState } from 'react';
import { senden } from '@/lib/api';
import { eurOhneVz, type JournalZustand } from '@/lib/journal';
import { Popup } from './NetzBausteine';

const num = (s: string) => { const x = Number(String(s).replace('−', '-').replace(',', '.').replace(/[\s']/g, '')); return s.trim() === '' || !Number.isFinite(x) ? null : x; };
const datumKurz = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j.slice(2)}`; };
const heute = () => new Date().toLocaleDateString('sv-SE');

export function EinstPopup({ d, neuladen, onClose }: { d: JournalZustand; neuladen: () => Promise<void>; onClose: () => void }) {
  const e = d.einstellungen;
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [weg, setWeg] = useState<string | null>(null); // Zeile, die gerade zur Bestätigung des Löschens ansteht

  // Konten
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [neuerName, setNeuerName] = useState('');

  // Ein- und Auszahlungen
  const [kid, setKid] = useState(d.konten[0]?.id || '');
  const [art, setArt] = useState<'einzahlung' | 'auszahlung'>('einzahlung');
  const [datum, setDatum] = useState(heute());
  const [betrag, setBetrag] = useState('');

  // R-Auswertung (Backtests)
  const [erweitert, setErweitert] = useState(false);
  const [be, setBe] = useState(String(e.beSchwelle));
  const [risiko, setRisiko] = useState(String(e.risikoProzent));

  const kontoName = (id: string) => d.konten.find((k) => k.id === id)?.name || '?';
  const cashflows = [...d.cashflows].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const eingezahlt = d.cashflows.filter((c) => c.art === 'einzahlung').reduce((s, c) => s + c.betrag, 0);
  const ausgezahlt = d.cashflows.filter((c) => c.art === 'auszahlung').reduce((s, c) => s + c.betrag, 0);

  async function tun(fn: () => Promise<unknown>) {
    setFehler(null); setLaeuft(true);
    try { await fn(); await neuladen(); }
    catch (err) { setFehler((err as Error).message); }
    setLaeuft(false);
  }
  const loeschenZweistufig = (id: string, ziel: () => Promise<unknown>) => {
    if (weg !== id) { setWeg(id); return; }
    setWeg(null);
    tun(ziel);
  };

  return (
    <Popup titel="Journal-Einstellungen" unter="Konten, Einzahlungen und Auszahlungen" onClose={onClose} breit>
      <h4 className="nw-h">Konten</h4>
      <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Zum Beispiel «Eigenkapital» und «Funded». Jeder Live-Trade gehört zu einem Konto, die Rendite wird pro Konto gerechnet.</div>
      {d.konten.map((k) => {
        const name = namen[k.id] ?? k.name;
        return (
          <div key={k.id} className="jr-konto-zeile">
            <input value={name} onChange={(x) => setNamen((n) => ({ ...n, [k.id]: x.target.value }))} aria-label="Kontoname" maxLength={40} />
            <button className="knopf-klein press" disabled={laeuft || name.trim() === k.name || !name.trim()}
              onClick={() => tun(async () => { await senden('/api/journal/konto', { id: k.id, name }); setNamen((n) => { const c = { ...n }; delete c[k.id]; return c; }); })}>Umbenennen</button>
            {d.konten.length > 1 && (
              <button className="knopf-klein press" disabled={laeuft} style={weg === 'k' + k.id ? { background: 'var(--fehler)', color: '#fff' } : undefined}
                onClick={() => loeschenZweistufig('k' + k.id, () => senden('/api/journal/konto', { id: k.id }, 'DELETE'))}>{weg === 'k' + k.id ? 'Wirklich löschen' : 'Löschen'}</button>
            )}
          </div>
        );
      })}
      <div className="jr-konto-zeile">
        <input value={neuerName} onChange={(x) => setNeuerName(x.target.value)} placeholder="Neues Konto, z. B. Funded" aria-label="Name des neuen Kontos" maxLength={40}
          onKeyDown={(x) => { if (x.key === 'Enter' && neuerName.trim() && !laeuft) tun(async () => { await senden('/api/journal/konto', { name: neuerName }); setNeuerName(''); }); }} />
        <button className="knopf-klein press tr-primaer" disabled={laeuft || !neuerName.trim()}
          onClick={() => tun(async () => { await senden('/api/journal/konto', { name: neuerName }); setNeuerName(''); })}>Konto hinzufügen</button>
      </div>

      <h4 className="nw-h">Ein- und Auszahlungen</h4>
      <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Trage ein, wann du wie viel eingezahlt oder ausgezahlt hast. Das zählt nicht als Gewinn. Die Zentrale rechnet damit die Rendite in %:
        10 € Gewinn bei 100 € Konto sind 10 %, bei 1000 € Konto nur 1 %.
      </div>
      <div className="jr-felder">
        {d.konten.length > 1 && (
          <label className="nw-feld">Konto
            <select value={kid} onChange={(x) => setKid(x.target.value)}>{d.konten.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
          </label>
        )}
        <div className="nw-feld">Art
          <div className="segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" aria-pressed={art === 'einzahlung'} onClick={() => setArt('einzahlung')}>Einzahlung</button>
            <button type="button" aria-pressed={art === 'auszahlung'} onClick={() => setArt('auszahlung')}>Auszahlung</button>
          </div>
        </div>
        <label className="nw-feld">Datum<input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} /></label>
        <label className="nw-feld">Betrag in EUR<input inputMode="decimal" value={betrag} onChange={(x) => setBetrag(x.target.value)} placeholder="z. B. 345" /></label>
      </div>
      <button className="knopf-klein press tr-primaer" style={{ alignSelf: 'flex-start' }} disabled={laeuft || num(betrag) === null || !(num(betrag)! > 0) || !datum || !kid}
        onClick={() => tun(async () => { await senden('/api/journal/cashflow', { konto: kid, art, datum, betrag: num(betrag) }); setBetrag(''); })}>{art === 'einzahlung' ? 'Einzahlung eintragen' : 'Auszahlung eintragen'}</button>

      {cashflows.length > 0 && (
        <>
          <div className="leise" style={{ fontSize: 12.5 }}>Eingezahlt {eurOhneVz(eingezahlt)}{ausgezahlt > 0 ? ` · ausgezahlt ${eurOhneVz(ausgezahlt)}` : ''}</div>
          <div className="jr-cf-liste">
            {cashflows.map((c) => (
              <div key={c.id} className="jr-cf-zeile">
                <span className="tr-zahl">{datumKurz(c.datum)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{c.art === 'einzahlung' ? 'Einzahlung' : 'Auszahlung'}{d.konten.length > 1 ? <span className="leise"> · {kontoName(c.konto)}</span> : null}</span>
                <b className={`tr-zahl ${c.art === 'einzahlung' ? 'jr-plus' : 'jr-minus'}`}>{c.art === 'einzahlung' ? '+' : '−'}{eurOhneVz(c.betrag)}</b>
                <button className="knopf-klein press" disabled={laeuft} style={weg === 'c' + c.id ? { background: 'var(--fehler)', color: '#fff' } : undefined}
                  onClick={() => loeschenZweistufig('c' + c.id, () => senden('/api/journal/cashflow', { id: c.id }, 'DELETE'))}>{weg === 'c' + c.id ? 'Wirklich?' : 'Löschen'}</button>
              </div>
            ))}
          </div>
        </>
      )}

      <button type="button" className="knopf-klein press" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setErweitert(!erweitert)}>{erweitert ? 'Erweitert ausblenden' : 'Erweitert (R-Auswertung für Backtests)'}</button>
      {erweitert && (
        <>
          <label className="nw-feld">Breakeven bis ± R<input inputMode="decimal" value={be} onChange={(x) => setBe(x.target.value)} /><small className="tr-hilfe">Nur für die R-Auswertung: Trades zwischen −{be || '0,1'} und +{be || '0,1'} R zählen dort als Breakeven. Live-Trades in Geld sind Break-Even bei genau 0 oder wenn du es beim Trade so setzt.</small></label>
          <label className="nw-feld">Risiko pro Trade (%)<input inputMode="decimal" value={risiko} onChange={(x) => setRisiko(x.target.value)} /><small className="tr-hilfe">Nur für die Monte-Carlo-Rechnung mit R-Werten. Mit Live-Trades in Geld rechnet die Zentrale aus deinen echten Renditen.</small></label>
          <button className="knopf-klein press" style={{ alignSelf: 'flex-start' }} disabled={laeuft}
            onClick={() => tun(() => senden('/api/journal/einstellungen', { beSchwelle: num(be), risikoProzent: num(risiko) }))}>Speichern</button>
        </>
      )}

      {fehler && <div className="fehlerbox">{fehler}</div>}
      <button className="knopf-klein press tr-primaer" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={onClose}>Fertig</button>
    </Popup>
  );
}
