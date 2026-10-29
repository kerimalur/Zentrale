'use client';
// Trading → Labor → Fremddaten-Hypothesen (Skill «hypothese-testen», Monty-Methode):
// Ereignis aus fremden Daten (Wetter, Geopolitik, Makro, Positionierung, eigene Liste) → Mechanismus → Wirkung auf Rohstoffe, Indizes, Devisen.
// Editor für die Vorab-Karte, Auswahl der Datenreihen mit Vorschau, eigene Reihen (CSV) und die Ergebnis-Seite.
import { useEffect, useMemo, useState } from 'react';
import { holen, senden } from '@/lib/api';
import {
  URTEIL_FARBE, pText, prozent, tagDatum,
  type LBausteine, type LBedingung, type LFErgebnis, type LFFall, type LFJahr, type LIdee, type LKarte, type LKette, type LMarktWahl, type LReiheVorschau,
} from '@/lib/labor';
import { Schalter } from './ui';
import { Popup } from './NetzBausteine';
import { Erweitert, Gruppenbalken, Kachel, Raster } from './LaborTeile';

type FB = LBausteine['fremd'];

// ---------- Texte ----------
const AGG_ART = [
  { wert: 'roh', text: 'wie veröffentlicht' }, { wert: 'rollend', text: 'rollend über Tage' }, { wert: 'woche', text: 'pro Kalenderwoche' }, { wert: 'monat', text: 'pro Monat' },
] as const;
const AGG_FN = [{ wert: 'mittel', text: 'Mittelwert' }, { wert: 'summe', text: 'Summe' }, { wert: 'min', text: 'Minimum' }, { wert: 'max', text: 'Maximum' }] as const;
const MESS = [
  { wert: 'anomalie', text: 'Anomalie gegen Vorjahre (Std.-Abw.)', hilfe: 'Wie ungewöhnlich ist der Wert für diese Jahreszeit? Gemessen nur gegen die Vorjahre – kein Blick in die Zukunft. Typisch: > 1 oder < −1.' },
  { wert: 'perzentil', text: 'Perzentil gegen Vorjahre (0–100)', hilfe: 'Rang des Werts unter den gleichen Jahreszeiten der Vorjahre. Typisch: > 90 oder < 10.' },
  { wert: 'zscore', text: 'z-Wert gegen die letzten Perioden', hilfe: 'Sprung gegenüber den letzten N Perioden (ohne Saison). Gut für Schocks wie den GPR-Index. Typisch: > 2.' },
  { wert: 'aenderung', text: 'Veränderung über Perioden', hilfe: 'Differenz zum Wert N Perioden davor (in der Einheit der Reihe).' },
  { wert: 'aenderungProzent', text: 'Veränderung in % über Perioden', hilfe: 'Prozentuale Veränderung zum Wert N Perioden davor.' },
  { wert: 'wert', text: 'Wert selbst', hilfe: 'Der Wert direkt, z. B. ONI > 1 = El Niño. Achtung: feste Schwellen kennen keine Saison.' },
] as const;
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const LEERE_BEDINGUNG = (reihe: string, verz: number): LBedingung => ({ reihe, verz, agg: { art: 'roh', tage: 7, fn: 'mittel' }, diff: 0, mess: { art: 'anomalie', perioden: 12, vorjahre: 10, fenster: 7 }, vergleich: '>', schwelle: 1 });

const zahl = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')));
const mmdd = (m: number, d: number) => `${String(m).padStart(2, '0')}-${String(Math.min(31, Math.max(1, d))).padStart(2, '0')}`;

export function reiheNameKlient(fb: FB, id: string): string {
  const m = fb.maerkte.find((x) => x.id === id); if (m) return m.name;
  const r = fb.reihen.find((x) => x.id === id); if (r) return r.name;
  const [q, a, b] = id.split(':');
  if (q === 'nasa') return `${fb.wetterGroessen.find((w) => w.wert === b)?.text || b} · ${fb.orte.find((o) => o.id === a)?.name || 'eigene Orte'}`;
  if (q === 'cot') return `COT ${fb.cotMaerkte.find((c) => c.wert === a)?.text || a} · ${fb.cotGroessen.find((g) => g.wert === b)?.text || b}`;
  if (q === 'eigene') return fb.eigene.find((x) => x.id === a)?.name || 'Eigene Reihe';
  if (q === 'oni') return 'El Niño (ONI)';
  if (q === 'fx') return a;
  return id;
}

export function bedingungSatz(fb: FB, x: LBedingung) {
  const agg = x.agg.art === 'rollend' ? `${AGG_FN.find((f) => f.wert === x.agg.fn)?.text} der letzten ${x.agg.tage} Tage` : x.agg.art === 'woche' ? `${AGG_FN.find((f) => f.wert === x.agg.fn)?.text} pro Woche` : x.agg.art === 'monat' ? `${AGG_FN.find((f) => f.wert === x.agg.fn)?.text} pro Monat` : 'Wert';
  const mess = x.mess.art === 'anomalie' ? `liegt mehr als ${Math.abs(x.schwelle)} Std.-Abw. ${x.vergleich === '>' ? 'über' : 'unter'} den ${x.mess.vorjahre} Vorjahren (±${x.mess.fenster} Tage)`
    : x.mess.art === 'perzentil' ? `ist ${x.vergleich === '>' ? 'höher' : 'tiefer'} als ${x.vergleich === '>' ? x.schwelle : 100 - x.schwelle} % der gleichen Jahreszeiten in ${x.mess.vorjahre} Vorjahren`
      : x.mess.art === 'zscore' ? `springt ${x.vergleich === '>' ? 'über' : 'unter'} ${x.schwelle} z-Werte gegen die letzten ${x.mess.perioden} Perioden`
        : x.mess.art === 'aenderung' ? `ändert sich in ${x.mess.perioden} Perioden um ${x.vergleich} ${x.schwelle}`
          : x.mess.art === 'aenderungProzent' ? `ändert sich in ${x.mess.perioden} Perioden um ${x.vergleich} ${x.schwelle} %`
            : `ist ${x.vergleich} ${x.schwelle}`;
  return `${reiheNameKlient(fb, x.reihe)}: ${agg}${x.diff ? ` (Differenz zu ${x.diff} Perioden davor)` : ''} ${mess} – bekannt ${x.verz} Tag${x.verz === 1 ? '' : 'e'} nach Periodenende`;
}

// ---------- Kleine Verlaufsgrafik ----------
function Sparkline({ punkte, hoehe = 60 }: { punkte: [number, number][]; hoehe?: number }) {
  if (punkte.length < 2) return null;
  const W = 600, H = hoehe;
  const t0 = punkte[0][0], t1 = punkte[punkte.length - 1][0];
  const vs = punkte.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label="Verlauf der Reihe" preserveAspectRatio="none" style={{ height: hoehe }}>
      <path d={punkte.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--accent)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ReiheVorschau({ id }: { id: string }) {
  const [v, setV] = useState<LReiheVorschau | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  useEffect(() => {
    setV(null); setFehler(null);
    if (!id) return;
    setLaedt(true);
    holen<LReiheVorschau>(`/api/labor/reihe?id=${encodeURIComponent(id)}`).then(setV).catch((e) => setFehler((e as Error).message)).finally(() => setLaedt(false));
  }, [id]);
  if (!id) return null;
  if (laedt) return <div className="leise lb-vorschau">Lade Vorschau … (beim ersten Mal kann das bei Wetterdaten bis zu einer Minute dauern)</div>;
  if (fehler) return <div className="fehlerbox lb-vorschau">Vorschau: {fehler}</div>;
  if (!v) return null;
  const FREQ: Record<string, string> = { D: 'täglich', W: 'wöchentlich', M: 'monatlich' };
  return (
    <div className="lb-vorschau">
      <Sparkline punkte={v.verlauf} />
      <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        {v.von} bis {v.bis} · {v.n.toLocaleString('de-CH')} Werte · {FREQ[v.freq] || v.freq} · {v.link ? <a href={v.link} target="_blank" rel="noopener noreferrer">{v.quelle}</a> : v.quelle}
        {v.hinweis && <><br />{v.hinweis}</>}
        {v.veraltet && <><br /><span style={{ color: '#b7791f' }}>{v.veraltet}</span></>}
        <br />Letzte Werte: {v.letzte.map(([d, w]) => `${d.slice(5)} ${Number(w).toLocaleString('de-CH', { maximumFractionDigits: 3 })}`).join(' · ')}
      </div>
    </div>
  );
}

// ---------- Reihe auswählen (Popup) ----------
type Reiter = 'vorlagen' | 'wetter' | 'fred' | 'yahoo' | 'cot' | 'geo' | 'eia' | 'kurse' | 'eigene';
export function ReihenWahl({ fb, titel, nurMaerkte, onWahl, onClose, onEigeneGeaendert }: { fb: FB; titel: string; nurMaerkte?: boolean; onWahl: (id: string) => void; onClose: () => void; onEigeneGeaendert: () => void }) {
  const [reiter, setReiter] = useState<Reiter>(nurMaerkte ? 'vorlagen' : 'vorlagen');
  const [wahl, setWahl] = useState('');
  const [ort, setOrt] = useState(fb.orte[0]?.id || '');
  const [eigeneOrte, setEigeneOrte] = useState('');
  const [groesse, setGroesse] = useState('T2M');
  const [fred, setFred] = useState('');
  const [yahoo, setYahoo] = useState('');
  const [eia, setEia] = useState('ng/hist_xls/NW2_EPG0_SWO_R48_BCFw');
  const [cotM, setCotM] = useState(fb.cotMaerkte[0]?.wert || '');
  const [cotG, setCotG] = useState('anteil');
  const [csv, setCsv] = useState({ name: '', quelle: '', text: '' });
  const [meldung, setMeldung] = useState<string | null>(null);

  const ortId = ort === 'eigen'
    ? 'eigen-' + eigeneOrte.split(/[;\n]+/).map((s) => s.split(/[,\s]+/).filter(Boolean).map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).slice(0, 10).map(([a, b2]) => `${a}_${b2}`).join('~')
    : ort;
  const kandidat = reiter === 'wetter' ? (ortId && ortId !== 'eigen-' ? `nasa:${ortId}:${groesse}` : '')
    : reiter === 'fred' ? (fred.trim() ? `fred:${fred.trim().toUpperCase()}` : '')
      : reiter === 'yahoo' ? (yahoo.trim() ? `yahoo:${yahoo.trim().toUpperCase()}` : '')
        : reiter === 'eia' ? (eia.trim() ? `eia:${eia.trim()}` : '')
          : reiter === 'cot' ? `cot:${cotM}:${cotG}` : wahl;

  const REITER: [Reiter, string][] = [['vorlagen', nurMaerkte ? 'Märkte' : 'Vorlagen'], ['wetter', 'Wetter'], ['geo', 'Geopolitik & Klima'], ['fred', 'FRED'], ['yahoo', 'Yahoo'], ['cot', 'Positionierung'], ['eia', 'EIA'], ['kurse', 'Devisen'], ['eigene', 'Eigene']];
  const gruppen = nurMaerkte ? fb.gruppen : [...new Set(fb.reihen.map((r) => r.gruppe))];

  const csvSpeichern = async () => {
    setMeldung(null);
    try {
      const r = await senden<{ ok: boolean; id: string; n: number; von: string; bis: string }>('/api/labor/reihe', { name: csv.name, quelle: csv.quelle, csv: csv.text });
      setMeldung(`Gespeichert: ${r.n} Werte von ${r.von} bis ${r.bis}`);
      setCsv({ name: '', quelle: '', text: '' });
      onEigeneGeaendert();
      setWahl(`eigene:${r.id}`);
    } catch (e) { setMeldung((e as Error).message); }
  };

  return (
    <Popup titel={titel} unter="Reihe wählen, Vorschau prüfen, dann übernehmen" onClose={onClose} breit>
      <div className="lb-chips" role="tablist" style={{ marginBottom: 12 }}>
        {REITER.map(([r, t]) => <button key={r} type="button" className="lb-wahl press" aria-pressed={reiter === r} onClick={() => { setReiter(r); setWahl(''); }}>{t}</button>)}
      </div>

      {reiter === 'vorlagen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gruppen.map((g) => (
            <div key={g}>
              <h4 className="nw-h">{g}</h4>
              <div className="lb-chips">
                {(nurMaerkte ? fb.maerkte.filter((m) => m.gruppe === g) : fb.reihen.filter((r) => r.gruppe === g)).map((r) => (
                  <button key={r.id} type="button" className="lb-wahl press" aria-pressed={wahl === r.id} onClick={() => setWahl(r.id)} title={'hinweis' in r ? r.hinweis : undefined}>{r.name}</button>
                ))}
              </div>
            </div>
          ))}
          {nurMaerkte && <p className="tr-hilfe">Andere Märkte: über die Reiter Yahoo (Futures mit «=F», ETFs, Indizes), FRED oder Eigene.</p>}
        </div>
      )}
      {reiter === 'wetter' && (
        <div className="lb-felder">
          <label className="nw-feld">Region
            <select value={ort} onChange={(e) => setOrt(e.target.value)}>
              {fb.orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="eigen">Eigene Orte (Koordinaten)</option>
            </select>
            {ort !== 'eigen' && <small className="tr-hilfe">Mittel über {fb.orte.find((o) => o.id === ort)?.orte.join(', ')}</small>}
          </label>
          <label className="nw-feld">Grösse
            <select value={groesse} onChange={(e) => setGroesse(e.target.value)}>{fb.wetterGroessen.map((w) => <option key={w.wert} value={w.wert}>{w.text}</option>)}</select>
            <small className="tr-hilfe">NASA POWER, Tageswerte ab 1981, für jeden Ort der Welt</small>
          </label>
          {ort === 'eigen' && (
            <label className="nw-feld lb-breit">Koordinaten (Breite, Länge – mehrere mit Semikolon, höchstens 10)
              <input value={eigeneOrte} onChange={(e) => setEigeneOrte(e.target.value)} placeholder="41.88, -87.63; 40.71, -74.01" />
            </label>
          )}
        </div>
      )}
      {reiter === 'geo' && (
        <div className="lb-chips">
          {fb.reihen.filter((r) => r.gruppe === 'Geopolitik' || r.gruppe === 'Klima').map((r) => <button key={r.id} type="button" className="lb-wahl press" aria-pressed={wahl === r.id} onClick={() => setWahl(r.id)}>{r.name}</button>)}
          {[['gpr:GPRD_MA7', 'GPR 7-Tage-Mittel'], ['gpr:GPRD_MA30', 'GPR 30-Tage-Mittel'], ['gpr:GPRT', 'GPR Drohungen (monatlich)'], ['gpr:GPRA', 'GPR Taten (monatlich)']].map(([id, t]) => (
            <button key={id} type="button" className="lb-wahl press" aria-pressed={wahl === id} onClick={() => setWahl(id)}>{t}</button>
          ))}
          <p className="tr-hilfe" style={{ width: '100%' }}>Für einzelne Kriege oder Ereignisse ohne Reihe: «Eigene Ereignis-Liste» im Editor verwenden.</p>
        </div>
      )}
      {reiter === 'fred' && (
        <label className="nw-feld">FRED-Serien-ID
          <input value={fred} onChange={(e) => setFred(e.target.value)} placeholder="z. B. DHHNGSP, VIXCLS, PWHEAMTUSDM, DEXUSEU" />
          <small className="tr-hilfe">Die ID steht auf <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer">fred.stlouisfed.org</a> oben neben dem Titel. Achtung bei Makrodaten: Stichtag ≠ Veröffentlichung – Verzögerung passend setzen.</small>
        </label>
      )}
      {reiter === 'yahoo' && (
        <label className="nw-feld">Yahoo-Symbol
          <input value={yahoo} onChange={(e) => setYahoo(e.target.value)} placeholder="z. B. NG=F, CL=F, ZW=F, UNG, ^VIX, ^GSPC, XLE" />
          <small className="tr-hilfe">Futures mit «=F» sind nicht rollbereinigt – Rollsprünge zählen als Rendite. Für Erdgas und Öl gibt es den rollenden EIA-Future unter «Märkte».</small>
        </label>
      )}
      {reiter === 'eia' && (
        <label className="nw-feld">EIA-Datei (Pfad ohne .xls)
          <input value={eia} onChange={(e) => setEia(e.target.value)} />
          <small className="tr-hilfe">Beispiele: ng/hist_xls/NW2_EPG0_SWO_R48_BCFw (Gas-Speicher wöchentlich), pet/hist_xls/WCESTUS1w (Rohöl-Lager), ng/hist_xls/RNGC1d (Gas-Future K1). Die Datei-Namen stehen auf eia.gov unter «Download Series History».</small>
        </label>
      )}
      {reiter === 'cot' && (
        <div className="lb-felder">
          <label className="nw-feld">Markt<select value={cotM} onChange={(e) => setCotM(e.target.value)}>{fb.cotMaerkte.map((c) => <option key={c.wert} value={c.wert}>{c.text}</option>)}</select></label>
          <label className="nw-feld">Grösse<select value={cotG} onChange={(e) => setCotG(e.target.value)}>{fb.cotGroessen.map((c) => <option key={c.wert} value={c.wert}>{c.text}</option>)}</select></label>
          <p className="tr-hilfe lb-breit">CFTC, wöchentlich ab 1986. Stichtag Dienstag, veröffentlicht Freitag → Verzögerung 3 Tage. Der erste Abruf lädt viele Jahresdateien und dauert.</p>
        </div>
      )}
      {reiter === 'kurse' && (
        <div className="lb-chips">
          {fb.maerkte.filter((m) => m.id.startsWith('fx:') || m.gruppe.startsWith('Devisen')).map((m) => <button key={m.id} type="button" className="lb-wahl press" aria-pressed={wahl === m.id} onClick={() => setWahl(m.id)}>{m.name}</button>)}
        </div>
      )}
      {reiter === 'eigene' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fb.eigene.length > 0 && (
            <div className="lb-chips">
              {fb.eigene.map((r) => (
                <span key={r.id} className="lb-eigene">
                  <button type="button" className="lb-wahl press" aria-pressed={wahl === `eigene:${r.id}`} onClick={() => setWahl(`eigene:${r.id}`)} title={`${r.n} Werte, ${r.von} bis ${r.bis}${r.quelle ? ` · ${r.quelle}` : ''}`}>{r.name}</button>
                  <button type="button" className="knopf-klein press" aria-label={`${r.name} löschen`} onClick={async () => { await senden('/api/labor/reihe', { id: r.id }, 'DELETE').catch(() => {}); onEigeneGeaendert(); }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="lb-teil">
            <strong style={{ fontSize: 14 }}>Neue Reihe einfügen</strong>
            <p className="tr-hilfe" style={{ margin: '4px 0 8px' }}>Eine Zeile pro Wert: «Datum;Wert» (2024-01-31;12,5 oder 31.01.2024;12.5). Kopf-Zeilen werden übersprungen. Gut für Drought Monitor, eigene Messungen oder Daten aus Excel.</p>
            <div className="lb-felder">
              <label className="nw-feld">Name<input value={csv.name} onChange={(e) => setCsv({ ...csv, name: e.target.value })} maxLength={80} /></label>
              <label className="nw-feld">Quelle (Link oder Text)<input value={csv.quelle} onChange={(e) => setCsv({ ...csv, quelle: e.target.value })} maxLength={200} /></label>
            </div>
            <textarea className="lb-text" rows={5} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12.5 }} value={csv.text} onChange={(e) => setCsv({ ...csv, text: e.target.value })} placeholder={'Datum;Wert\n2020-01-31;3.2\n2020-02-29;2.9'} aria-label="Werte" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
              <label className="knopf-klein press" style={{ cursor: 'pointer' }}>Datei wählen (.csv/.txt)
                <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv((c) => ({ ...c, name: c.name || f.name.replace(/\.[a-z]+$/i, ''), text: '' })); if (f) { const t = await f.text(); setCsv((c) => ({ ...c, text: t.slice(0, 3_500_000) })); } }} />
              </label>
              <button type="button" className="knopf-akzent press" disabled={!csv.text.trim()} onClick={csvSpeichern}>Reihe speichern</button>
              {meldung && <span className="leise" style={{ fontSize: 13 }}>{meldung}</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {kandidat && <div className="leise" style={{ fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 6 }}>{kandidat}</div>}
        <ReiheVorschau id={kandidat} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="knopf-akzent press" disabled={!kandidat} onClick={() => { onWahl(kandidat); onClose(); }}>Übernehmen</button>
          <button type="button" className="knopf-klein press" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </Popup>
  );
}

// ---------- Eine Bedingung bearbeiten ----------
function BedingungEditor({ fb, x, nr, setze, entfernen, wechseln }: { fb: FB; x: LBedingung; nr: number; setze: (b: LBedingung) => void; entfernen: () => void; wechseln: () => void }) {
  const [vorschau, setVorschau] = useState(false);
  const mess = MESS.find((m) => m.wert === x.mess.art);
  return (
    <div className="lb-teil">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{nr > 0 ? 'und ' : ''}{reiheNameKlient(fb, x.reihe)}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="knopf-klein press" onClick={() => setVorschau((v) => !v)}>{vorschau ? 'Vorschau zu' : 'Vorschau'}</button>
          <button type="button" className="knopf-klein press" onClick={wechseln}>Reihe ändern</button>
          <button type="button" className="knopf-klein press" onClick={entfernen}>Entfernen</button>
        </div>
      </div>
      {vorschau && <ReiheVorschau id={x.reihe} />}
      <div className="lb-felder" style={{ marginTop: 8 }}>
        <label className="nw-feld">Zusammenfassen
          <select value={x.agg.art} onChange={(e) => setze({ ...x, agg: { ...x.agg, art: e.target.value as LBedingung['agg']['art'] } })}>{AGG_ART.map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}</select>
        </label>
        {x.agg.art === 'rollend' && <label className="nw-feld">Tage<input type="number" min={1} max={365} value={x.agg.tage} onChange={(e) => setze({ ...x, agg: { ...x.agg, tage: zahl(e.target.value) } })} /></label>}
        {x.agg.art !== 'roh' && (
          <label className="nw-feld">Wie<select value={x.agg.fn} onChange={(e) => setze({ ...x, agg: { ...x.agg, fn: e.target.value as LBedingung['agg']['fn'] } })}>{AGG_FN.map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}</select></label>
        )}
        <label className="nw-feld">Messen
          <select value={x.mess.art} onChange={(e) => setze({ ...x, mess: { ...x.mess, art: e.target.value as LBedingung['mess']['art'] } })}>{MESS.map((m) => <option key={m.wert} value={m.wert}>{m.text}</option>)}</select>
        </label>
        {(x.mess.art === 'anomalie' || x.mess.art === 'perzentil') && (
          <>
            <label className="nw-feld">Vorjahre<input type="number" min={2} max={40} value={x.mess.vorjahre} onChange={(e) => setze({ ...x, mess: { ...x.mess, vorjahre: zahl(e.target.value) } })} /></label>
            <label className="nw-feld">Jahreszeit ± Tage<input type="number" min={0} max={60} value={x.mess.fenster} onChange={(e) => setze({ ...x, mess: { ...x.mess, fenster: zahl(e.target.value) } })} /></label>
          </>
        )}
        {(x.mess.art === 'zscore' || x.mess.art === 'aenderung' || x.mess.art === 'aenderungProzent') && (
          <label className="nw-feld">Perioden<input type="number" min={1} max={520} value={x.mess.perioden} onChange={(e) => setze({ ...x, mess: { ...x.mess, perioden: zahl(e.target.value) } })} /></label>
        )}
        <label className="nw-feld">Vergleich<select value={x.vergleich} onChange={(e) => setze({ ...x, vergleich: e.target.value as '>' | '<' })}><option value=">">grösser als</option><option value="<">kleiner als</option></select></label>
        <label className="nw-feld">Schwelle<input type="number" step="any" value={x.schwelle} onChange={(e) => setze({ ...x, schwelle: zahl(e.target.value) })} /></label>
        <label className="nw-feld">Bekannt nach (Tage)
          <input type="number" min={0} max={120} value={x.verz} onChange={(e) => setze({ ...x, verz: zahl(e.target.value) })} />
          <small className="tr-hilfe">ab Periodenende bis veröffentlicht</small>
        </label>
        <label className="nw-feld">Differenz zu (Perioden)
          <input type="number" min={0} max={52} value={x.diff} onChange={(e) => setze({ ...x, diff: zahl(e.target.value) })} />
          <small className="tr-hilfe">0 = aus; z. B. 52 bei Wochen = gegen Vorjahr</small>
        </label>
      </div>
      {mess && <p className="tr-hilfe" style={{ margin: '0 0 6px' }}>{mess.hilfe}</p>}
      <p style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.45 }}><b>Liest sich so:</b> {bedingungSatz(fb, x)}</p>
    </div>
  );
}

// Ereignis-Liste ⇄ Text
const listeZuText = (l: LKarte['liste']) => (l || []).map((x) => [x.datum, x.text || '', x.seite === 1 ? 'long' : x.seite === -1 ? 'short' : ''].filter((s, i) => s || i < 2).join('; ').replace(/;\s*$/, '')).join('\n');
function textZuListe(t: string) {
  const out: NonNullable<LKarte['liste']> = [];
  for (const z of t.split(/\r?\n/)) {
    const f = z.split(/[;\t]/).map((s) => s.trim());
    if (!f[0]) continue;
    let d = f[0];
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d);
    if (m) d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const seite = /^(long|kauf|\+)/i.test(f[2] || '') ? 1 : /^(short|verkauf|-)/i.test(f[2] || '') ? -1 : null;
    out.push({ datum: d, text: f[1] || '', seite });
  }
  return out;
}

// Fallen aus dem Skill passend zu den Stichworten der Idee
export function passendeFallen(fb: FB, k: Pick<LKarte, 'name' | 'mechanismus' | 'erwartung' | 'kette'> & { text?: string }) {
  const t = [k.name, k.mechanismus, k.erwartung, k.text, ...Object.values(k.kette || {})].join(' ').toLowerCase();
  return fb.fallen.filter((f) => !f.stichworte.length || f.stichworte.some((s) => t.includes(s)));
}

// ---------- Editor der Vorab-Karte ----------
export function FremdEditor({ b, start, id, basis, onZurueck, onGespeichert, onBausteine }: { b: LBausteine; start: LKarte; id?: string; basis?: string; onZurueck: () => void; onGespeichert: (id: string) => void; onBausteine: () => void }) {
  const fb = b.fremd;
  const [k, setK] = useState<LKarte>(() => ({
    modus: 'bedingung', start: 'beginn', richtung: 'long', warten: 0, horizonte: [7, 30, 60], hauptHorizont: 30, bedingungen: [], maerkte: [], liste: [], kette: {}, wege: [],
    backtest: { von: 1990, bis: Math.min(2022, fb.jahre.bis - 1) }, forward: { von: Math.min(2023, fb.jahre.bis) }, geplanteVarianten: 1, ...start, typ: 'fremd',
  }));
  const [horizText, setHorizText] = useState((start.horizonte || [7, 30, 60]).join(', '));
  const [listeText, setListeText] = useState(listeZuText(start.liste));
  const [wahl, setWahl] = useState<null | { art: 'bedingung'; index: number | null } | { art: 'markt' }>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const setz = <K extends keyof LKarte>(key: K, v: LKarte[K]) => setK((x) => ({ ...x, [key]: v }));
  const kette = k.kette || {};
  const setKette = (key: keyof LKette, v: string) => setz('kette', { ...kette, [key]: v });
  const bed = k.bedingungen || [];
  const maerkte = k.maerkte || [];
  const fallen = passendeFallen(fb, k);

  const speichern = async (starten: boolean) => {
    setLaeuft(true); setFehler(null);
    try {
      const horizonte = horizText.split(/[,;\s]+/).map(Number).filter((x) => x >= 1);
      const karte: LKarte = { ...k, horizonte, liste: k.modus === 'liste' ? textZuListe(listeText) : k.liste };
      const r = await senden<LIdee>('/api/labor/idee', { id, basis, karte });
      if (starten) await senden('/api/labor/start', { id: r.id });
      onGespeichert(r.id);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  };

  const reiheGewaehlt = (rid: string) => {
    if (!wahl) return;
    if (wahl.art === 'markt') {
      if (!maerkte.some((m) => m.id === rid)) {
        const kat = fb.maerkte.find((m) => m.id === rid);
        setz('maerkte', [...maerkte, { id: rid, kosten: kat?.kosten ?? 0.05, handelbar: kat ? kat.handelbar : true }]);
      }
    } else {
      const verz = fb.verzoegerung[rid] ?? (rid.startsWith('cot:') ? 3 : rid === 'oni' ? 10 : 1);
      if (wahl.index === null) setz('bedingungen', [...bed, LEERE_BEDINGUNG(rid, verz)]);
      else setz('bedingungen', bed.map((x, i) => (i === wahl.index ? { ...x, reihe: rid, verz } : x)));
    }
  };

  const saisonVon = (k.saison?.von || '11-01').split('-').map(Number), saisonBis = (k.saison?.bis || '03-15').split('-').map(Number);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><button className="knopf-klein press" onClick={onZurueck}>← Zurück</button></div>

      <section className="karte in">
        <h2 className="karte-titel">Vorab-Karte <small>Hypothese mit Fremddaten</small></h2>
        <p className="tr-hilfe" style={{ margin: '0 0 12px' }}>Nur das Wichtige ausfüllen: Name, ein Satz Mechanismus und ein Erfolgskriterium als Zahl. Der Name muss einmalig sein. Alles hier wird beim Start eingefroren; jede Änderung danach ist eine neue Version und zählt als getestete Variante (strengere Grenze für den p-Wert). Leere Felder sind in Ordnung.</p>
        <label className="nw-feld">Name<input value={k.name} onChange={(e) => setz('name', e.target.value)} maxLength={80} /></label>
        <label className="nw-feld">Mechanismus (warum sollte es wirken? Ein Satz genügt)<textarea className="lb-text" rows={2} value={k.mechanismus || ''} onChange={(e) => setz('mechanismus', e.target.value)} /></label>
        <label className="nw-feld">Erfolgskriterium (vorab als Zahl, z. B. «Mehrwert &gt; 0, p &lt; 0,05, beide Hälften gleiche Richtung»)<textarea className="lb-text" rows={2} value={k.erfolgskriterium || ''} onChange={(e) => setz('erfolgskriterium', e.target.value)} /></label>
        {fallen.length > 0 && (
          <div className="lb-fallen">
            <strong>Fallen aus bisherigen Tests</strong>
            <ul>{fallen.map((f) => <li key={f.text}>{f.text}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Ereignis</h2>
        <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 420, marginBottom: 12 }}>
          <button type="button" aria-pressed={k.modus !== 'liste'} onClick={() => setz('modus', 'bedingung')}>Aus Datenreihen</button>
          <button type="button" aria-pressed={k.modus === 'liste'} onClick={() => setz('modus', 'liste')}>Eigene Ereignis-Liste</button>
        </div>
        {k.modus === 'liste' ? (
          <>
            <p className="tr-hilfe" style={{ margin: '0 0 8px' }}>Eine Zeile pro Ereignis: «Datum; Text; long/short» (Richtung optional, sonst gilt die Richtung unten). Das Datum ist der Tag, an dem das Ereignis bekannt war.</p>
            <textarea className="lb-text" rows={8} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12.5 }} value={listeText} onChange={(e) => setListeText(e.target.value)} placeholder={'2022-02-24; Russland greift die Ukraine an\n2014-02-27; Krim'} aria-label="Ereignis-Liste" />
            <div className="leise" style={{ fontSize: 12.5 }}>{textZuListe(listeText).length} gültige Ereignisse erkannt</div>
          </>
        ) : (
          <>
            {!bed.length && <div className="leise" style={{ fontSize: 13, marginBottom: 8 }}>Noch keine Bedingung. Füge eine Datenreihe hinzu – alle Bedingungen müssen gleichzeitig gelten.</div>}
            {bed.map((x, i) => (
              <BedingungEditor key={i} fb={fb} x={x} nr={i} setze={(nb) => setz('bedingungen', bed.map((y, j) => (j === i ? nb : y)))} entfernen={() => setz('bedingungen', bed.filter((_, j) => j !== i))} wechseln={() => setWahl({ art: 'bedingung', index: i })} />
            ))}
            {bed.length < 4 && <button type="button" className="knopf-klein press" onClick={() => setWahl({ art: 'bedingung', index: null })}>+ Bedingung (Datenreihe)</button>}
            <div className="lb-felder" style={{ marginTop: 12 }}>
              <label className="nw-feld lb-breit">Was zählt als Ereignis?
                <select value={k.start} onChange={(e) => setz('start', e.target.value as 'beginn' | 'jede')}><option value="beginn">nur der Beginn (erster Tag, an dem alles gilt)</option><option value="jede">jede neue Periode, in der alles gilt</option></select>
              </label>
            </div>
          </>
        )}
        <div style={{ marginTop: 6 }}>
          <Schalter an={!!k.saison} onClick={() => setz('saison', k.saison ? null : { von: '11-01', bis: '03-15' })} titel="Nur in einer Jahreszeit" unter="Ereignisse ausserhalb dieses Fensters zählen nicht (z. B. Kältewellen nur im Winter)" />
          {k.saison && (
            <div className="lb-felder" style={{ marginTop: 8 }}>
              <div className="nw-feld">Von
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={1} max={31} value={saisonVon[1]} onChange={(e) => setz('saison', { von: mmdd(saisonVon[0], zahl(e.target.value)), bis: k.saison!.bis })} aria-label="Tag von" style={{ width: 70 }} />
                  <select value={saisonVon[0]} onChange={(e) => setz('saison', { von: mmdd(Number(e.target.value), saisonVon[1]), bis: k.saison!.bis })} aria-label="Monat von">{MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </div>
              </div>
              <div className="nw-feld">Bis
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" min={1} max={31} value={saisonBis[1]} onChange={(e) => setz('saison', { von: k.saison!.von, bis: mmdd(saisonBis[0], zahl(e.target.value)) })} aria-label="Tag bis" style={{ width: 70 }} />
                  <select value={saisonBis[0]} onChange={(e) => setz('saison', { von: k.saison!.von, bis: mmdd(Number(e.target.value), saisonBis[1]) })} aria-label="Monat bis">{MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Markt und Zeitraum</h2>
        <div className="nw-feld">Märkte <span className="tr-hilfe">(mehrere = Querschnitt: Ergebnis pro Markt und zusammen)</span>
          {!maerkte.length && <div className="leise" style={{ fontSize: 13 }}>Noch kein Markt gewählt.</div>}
          {maerkte.map((m, i) => (
            <div key={m.id} className="lb-markt">
              <strong>{reiheNameKlient(fb, m.id)}</strong>
              <label>Kosten % pro Trade<input type="number" step="0.01" min={0} max={10} value={m.kosten ?? 0} onChange={(e) => setz('maerkte', maerkte.map((x, j) => (j === i ? { ...x, kosten: zahl(e.target.value) } : x)))} /></label>
              <label className="lb-haken"><input type="checkbox" checked={m.handelbar !== false} onChange={(e) => setz('maerkte', maerkte.map((x, j) => (j === i ? { ...x, handelbar: e.target.checked } : x)))} /> handelbar</label>
              <button type="button" className="knopf-klein press" onClick={() => setz('maerkte', maerkte.filter((_, j) => j !== i))}>Entfernen</button>
              {fb.maerkte.find((x) => x.id === m.id)?.hinweis && <small className="tr-hilfe" style={{ gridColumn: '1 / -1' }}>{fb.maerkte.find((x) => x.id === m.id)?.hinweis}</small>}
            </div>
          ))}
          {maerkte.length < 8 && <div><button type="button" className="knopf-klein press" onClick={() => setWahl({ art: 'markt' })}>+ Markt</button></div>}
        </div>
        <div className="lb-felder">
          <label className="nw-feld">Erwartete Richtung<select value={k.richtung} onChange={(e) => setz('richtung', e.target.value)}><option value="long">steigt (Long)</option><option value="short">fällt (Short)</option></select></label>
          <label className="nw-feld">Wartezeit nach «bekannt» (Tage)<input type="number" min={0} max={365} value={k.warten ?? 0} onChange={(e) => setz('warten', zahl(e.target.value))} /></label>
          <label className="nw-feld">Horizonte (Kalendertage)<input value={horizText} onChange={(e) => setHorizText(e.target.value)} placeholder="7, 30, 60" /></label>
          <label className="nw-feld">Haupt-Horizont (für das Urteil)<input type="number" min={1} max={730} value={k.hauptHorizont ?? 30} onChange={(e) => setz('hauptHorizont', zahl(e.target.value))} /></label>
        </div>
        <p className="tr-hilfe" style={{ margin: '0 0 10px' }}>Gemessen wird ab dem ersten Kurs nach «bekannt + Wartezeit» bis Horizont-Tage später, ohne Überlappung pro Markt. Gleichzeitig (während der Ereignis-Periode) wird zusätzlich gezeigt – das ist nicht handelbar.</p>

        <Erweitert hilfe="Standardwerte passen meistens, leere Felder sind in Ordnung">
        <div className="nw-feld">Kette: Ereignis → Mechanismus → Wirkung → Markt → Zeitraum
          <div className="lb-kette">
            {([['ereignis', 'Ereignis (messbar)'], ['mechanismus', 'Mechanismus'], ['wirkung', 'Wirkung'], ['markt', 'Markt'], ['zeitraum', 'Zeitraum']] as [keyof LKette, string][]).map(([key, ph], i) => (
              <div key={key} className="lb-kette-glied">
                {i > 0 && <span aria-hidden="true">→</span>}
                <input value={kette[key] || ''} onChange={(e) => setKette(key, e.target.value)} placeholder={ph} aria-label={ph} maxLength={200} />
              </div>
            ))}
          </div>
        </div>
        <label className="nw-feld">Hypothese in einem Satz<textarea className="lb-text" rows={2} value={k.beschreibung || ''} onChange={(e) => setz('beschreibung', e.target.value)} /></label>
        <label className="nw-feld">Erwartete Wirkung (Richtung, Markt, Zeitraum)<textarea className="lb-text" rows={2} value={k.erwartung || ''} onChange={(e) => setz('erwartung', e.target.value)} /></label>
        <label className="nw-feld">Ab wann bekannt? (Notiz)<input value={k.bekanntAb || ''} onChange={(e) => setz('bekanntAb', e.target.value)} placeholder="z. B. EIA-Speicher Donnerstag 10:30 New York → ab Freitag" maxLength={300} /></label>
        <div className="lb-felder">
          <label className="nw-feld">Backtest von<input type="number" min={fb.jahre.von} max={fb.jahre.bis} value={k.backtest?.von ?? ''} onChange={(e) => setz('backtest', { von: zahl(e.target.value), bis: k.backtest?.bis ?? 2022 })} /></label>
          <label className="nw-feld">Backtest bis<input type="number" min={fb.jahre.von} max={fb.jahre.bis} value={k.backtest?.bis ?? ''} onChange={(e) => setz('backtest', { von: k.backtest?.von ?? 1990, bis: zahl(e.target.value) })} /></label>
          <label className="nw-feld">Forward ab (gesperrt)<input type="number" min={fb.jahre.von} max={fb.jahre.bis} value={k.forward?.von ?? ''} onChange={(e) => setz('forward', { von: zahl(e.target.value) })} /></label>
          <label className="nw-feld">Geplante Varianten<input type="number" min={1} max={100} value={k.geplanteVarianten ?? 1} onChange={(e) => setz('geplanteVarianten', zahl(e.target.value))} /></label>
        </div>
        <Schalter an={!!k.stufe2?.aktiv} onClick={() => setz('stufe2', k.stufe2?.aktiv ? null : { aktiv: true, modell: 'ausbruch', n: 10, halten: 5 })} titel="Stufe 2: Bias-Fenster + Entry-Model" unter="Im Fenster (bekannt + Wartezeit bis Haupt-Horizont) mit festem Entry-Model viele kleinere Trades; Gegenprobe ausserhalb und in Gegenrichtung" />
        {k.stufe2?.aktiv && (
          <div className="lb-felder" style={{ marginTop: 8 }}>
            <label className="nw-feld">Entry-Model
              <select value={k.stufe2.modell} onChange={(e) => setz('stufe2', { ...k.stufe2!, modell: e.target.value as 'woche' | 'ausbruch' | 'ruecksetzer' })}>
                <option value="ausbruch">Ausbruch über N-Tage-Hoch/-Tief</option><option value="ruecksetzer">Rücksetzer auf N-Tage-Tief/-Hoch</option><option value="woche">Einstieg zu Wochenbeginn</option>
              </select>
            </label>
            {k.stufe2.modell !== 'woche' && <label className="nw-feld">N Tage<input type="number" min={2} max={60} value={k.stufe2.n} onChange={(e) => setz('stufe2', { ...k.stufe2!, n: zahl(e.target.value) })} /></label>}
            <label className="nw-feld">Halten (Tage)<input type="number" min={1} max={60} value={k.stufe2.halten} onChange={(e) => setz('stufe2', { ...k.stufe2!, halten: zahl(e.target.value) })} /></label>
            <p className="tr-hilfe lb-breit">Für Kerims Fix Entry Model (GVA + BOS) auf Devisen: eine Strategie anlegen und dort als Bias-Fenster diese Hypothese wählen.</p>
          </div>
        )}
        <div className="nw-feld" style={{ marginTop: 12 }}>Wege zu mehr Fällen <span className="tr-hilfe">(nur eine Gedankenstütze, ändert die Rechnung nicht)</span>
          <div className="lb-wege">
            {fb.wege.map((w) => {
              const an = (k.wege || []).includes(w.id);
              return (
                <button key={w.id} type="button" className="lb-weg press" aria-pressed={an} onClick={() => setz('wege', an ? (k.wege || []).filter((x) => x !== w.id) : [...(k.wege || []), w.id])}>
                  <strong>{an ? '✓ ' : ''}{w.name}</strong><span>{w.text}</span>
                </button>
              );
            })}
          </div>
        </div>
        </Erweitert>
      </section>

      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="knopf-akzent press" disabled={laeuft} onClick={() => speichern(true)}>Speichern und Backtest starten</button>
        <button className="knopf-klein press" disabled={laeuft} onClick={() => speichern(false)}>Nur speichern</button>
      </div>

      {wahl && <ReihenWahl fb={fb} titel={wahl.art === 'markt' ? 'Markt wählen' : 'Datenreihe für die Bedingung'} nurMaerkte={wahl.art === 'markt'} onWahl={reiheGewaehlt} onClose={() => setWahl(null)} onEigeneGeaendert={onBausteine} />}
    </div>
  );
}

// ---------- Vorab-Karte anzeigen ----------
export function FremdVorabKarte({ k, b }: { k: LKarte; b: LBausteine }) {
  const fb = b.fremd;
  const kt = k.kette || {};
  const zeilen: [string, string][] = [
    ['Kette', [kt.ereignis, kt.mechanismus, kt.wirkung, kt.markt, kt.zeitraum].filter(Boolean).join(' → ') || '—'],
    ['Hypothese', k.beschreibung || '—'], ['Mechanismus', k.mechanismus || '—'], ['Erwartung', k.erwartung || '—'], ['Erfolgskriterium', k.erfolgskriterium || '—'],
    ['Ereignis', k.modus === 'liste' ? `eigene Liste mit ${(k.liste || []).length} Ereignissen` : (k.bedingungen || []).map((x) => bedingungSatz(fb, x)).join(' UND ') || '—'],
    ['Zählt', k.modus === 'liste' ? 'jedes Datum' : k.start === 'jede' ? 'jede neue Periode' : 'nur der Beginn'],
    ['Saison', k.saison ? `${k.saison.von.split('-').reverse().join('.')}. bis ${k.saison.bis.split('-').reverse().join('.')}.` : 'ganzes Jahr'],
    ['Bekannt ab', k.bekanntAb || 'Periodenende + Verzögerung'],
    ['Märkte', (k.maerkte || []).map((m: LMarktWahl) => `${reiheNameKlient(fb, m.id)}${m.handelbar === false ? ' (nicht handelbar)' : ''} · Kosten ${m.kosten ?? 0} %`).join(' · ') || '—'],
    ['Richtung', k.richtung === 'short' ? 'fällt (Short)' : 'steigt (Long)'],
    ['Zeitraum', `${k.warten ?? 0} Tage warten, Horizonte ${(k.horizonte || []).join(', ')} Tage (Haupt ${k.hauptHorizont})`],
    ['Stufe 2', k.stufe2?.aktiv ? `${k.stufe2.modell === 'woche' ? 'Wochenbeginn' : `${k.stufe2.modell === 'ausbruch' ? 'Ausbruch' : 'Rücksetzer'} ${k.stufe2.n} Tage`}, halten ${k.stufe2.halten} Tage` : '—'],
    ['Wege zu mehr Fällen', (k.wege || []).map((w) => fb.wege.find((x) => x.id === w)?.name || w).join(', ') || '—'],
    ['Backtest', `${k.backtest?.von}–${k.backtest?.bis}`], ['Forward', `ab ${k.forward?.von} (gesperrt bis geöffnet)`], ['Geplante Varianten', String(k.geplanteVarianten ?? 1)],
  ];
  return (
    <dl className="lb-karte">
      {zeilen.map(([a, w]) => <div key={a}><dt>{a}</dt><dd>{w}</dd></div>)}
      {k.modus === 'liste' && (k.liste || []).length > 0 && (
        <div><dt>Ereignisse</dt><dd>{(k.liste || []).map((x) => `${x.datum.split('-').reverse().join('.')}${x.text ? ` ${x.text}` : ''}${x.seite ? ` (${x.seite > 0 ? 'long' : 'short'})` : ''}`).join(' · ')}</dd></div>
      )}
    </dl>
  );
}

// ---------- Ergebnis ----------
function stufeText(e: LFErgebnis) {
  if (e.stufe2) return 'Monty-Stufe 2 · Bias-Fenster + Entry-Model';
  if (e.forward) return 'Monty-Stufe 3 · Backtest gegen Forward';
  return 'Monty-Stufe 1 · Grund-Hypothese';
}

function Horizontbalken({ e }: { e: LFErgebnis }) {
  const hs = e.horizonte;
  const werte = hs.flatMap((h) => [h.mittel, h.saison, h.zufall].map((v) => v ?? 0));
  const hi = Math.max(0, ...werte), lo = Math.min(0, ...werte);
  const spanne = Math.max(hi - lo, 0.5);
  const W = 900, H = 230, P = 56, gruppeW = (W - P - 10) / hs.length, bw = Math.min(46, gruppeW / 4.2);
  const y = (v: number) => 20 + ((hi - v) / spanne) * (H - 52);
  const farben = ['var(--accent)', '#9aa1ab', '#c9ced8'];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label="Ereignis gegen Saison und Zufall je Horizont" style={{ maxWidth: 900 }}>
      <line x1={P} x2={W - 6} y1={y(0)} y2={y(0)} stroke="var(--track)" />
      {hi > 0 && <text x={P - 6} y={y(hi) + 4} textAnchor="end" className="lb-achse">{pText(hi, 1)}</text>}
      {lo < 0 && <text x={P - 6} y={y(lo) + 4} textAnchor="end" className="lb-achse">{pText(lo, 1)}</text>}
      <text x={P - 6} y={y(0) + 4} textAnchor="end" className="lb-achse">0</text>
      {hs.map((h, gi) => {
        const x0 = P + gi * gruppeW + (gruppeW - bw * 3 - 8) / 2;
        return (
          <g key={h.h}>
            {[h.mittel, h.saison, h.zufall].map((v, i) => {
              const vv = v ?? 0;
              return (
                <g key={i}>
                  <rect x={x0 + i * (bw + 4)} width={bw} y={Math.min(y(vv), y(0))} height={Math.max(1, Math.abs(y(vv) - y(0)))} fill={farben[i]} rx={3}><title>{['Ereignis', 'gleicher Kalendertag', 'Zufall gleiche Monate'][i]}: {pText(v)}</title></rect>
                  {i === 0 && <text x={x0 + bw / 2} y={vv >= 0 ? y(vv) - 4 : y(vv) + 12} textAnchor="middle" className="lb-achse" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{pText(v, 1)}</text>}
                </g>
              );
            })}
            <text x={P + gi * gruppeW + gruppeW / 2} y={H - 8} textAnchor="middle" className="lb-achse">{h.h} Tage{h.h === e.haupt ? ' ★' : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FaelleGrafik({ faelle, fw, namen }: { faelle: LFFall[]; fw: LFFall[]; namen: Record<string, string> }) {
  const [tip, setTip] = useState<string | null>(null);
  const alle = [...faelle.map((f) => ({ ...f, fw: false })), ...fw.map((f) => ({ ...f, fw: true }))];
  if (!alle.length) return <div className="leise">Keine Fälle.</div>;
  const W = 640, H = 200, n = alle.length;
  const max = Math.max(...alle.map((f) => Math.abs(f.r)), 1);
  const bw = (W - 10) / n;
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 8);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label="Ergebnis je Fall">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--track)" />
        {alle.map((f, i) => (
          <g key={i} onMouseEnter={() => setTip(`${f.fw ? 'Forward · ' : ''}${namen[f.markt] || f.markt} · Ereignis ${tagDatum(f.tag)}${f.text ? ` (${f.text})` : ''} · Einstieg ${tagDatum(f.en)} → ${tagDatum(f.ex)} · ${pText(f.r)}${f.s !== null ? ` · Saison ${pText(f.s)}` : ''}${f.m !== null ? ` · Stärke ${f.m}` : ''}`)} onClick={() => setTip(`${namen[f.markt] || f.markt} · ${tagDatum(f.en)} → ${tagDatum(f.ex)} · ${pText(f.r)}`)}>
            <rect x={5 + i * bw} width={Math.max(0.8, bw - 0.6)} y={Math.min(y(f.r), H / 2)} height={Math.max(0.5, Math.abs(y(f.r) - H / 2))} fill={f.fw ? '#d6a23a' : f.r >= 0 ? 'var(--gruen)' : 'var(--fehler)'} opacity={0.88} />
            {f.s !== null && bw > 2.5 && <line x1={5 + i * bw} x2={5 + (i + 1) * bw - 0.6} y1={y(f.s)} y2={y(f.s)} stroke="var(--ink)" strokeWidth={1.4} />}
            <rect x={5 + i * bw} width={bw} y={0} height={H} fill="transparent" />
          </g>
        ))}
      </svg>
      <div className="leise" style={{ fontSize: 12.5, minHeight: 18 }}>{tip || 'Balken = Ergebnis des Falls (grün Gewinn, rot Verlust, gelb Forward), Strich = was der gleiche Kalendertag ohne Ereignis im Schnitt brachte. Über einen Balken fahren oder tippen.'}</div>
    </div>
  );
}

function JahrKarte({ j }: { j: LFJahr }) {
  const W = 280, H = 86;
  const vs = j.pts.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (t: number) => (t / Math.max(1, j.laenge)) * W;
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - 8);
  return (
    <div className="lb-jahr">
      <div className="lb-jahr-kopf">
        <b>{j.jahr}</b>
        {j.staerke !== null && <span className="lb-chip" title="Mittel des Messwerts der 1. Bedingung in diesem Jahr">Ø Stärke {j.staerke.toLocaleString('de-CH', { maximumFractionDigits: 2 })}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label={`Verlauf ${j.jahr}`}>
        {j.baender.map(([a, b2], i) => <rect key={`b${i}`} x={x(a)} width={Math.max(1.5, x(b2) - x(a) + 1)} y={0} height={H} fill="#dbe8f8" />)}
        {j.trades.map((t, i) => <rect key={`t${i}`} x={x(t.en)} width={Math.max(1, x(t.ex) - x(t.en))} y={H - 6} height={4} fill={t.fw ? '#d6a23a' : t.r >= 0 ? 'var(--gruen)' : 'var(--fehler)'} rx={2} />)}
        <path d={j.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--ink)" strokeWidth={1.3} />
      </svg>
      <div className="lb-jahr-trades">
        {j.trades.length ? j.trades.map((t, i) => <span key={i} className={t.r >= 0 ? 'w' : 'l'}>{pText(t.r, 1)}{t.fw ? ' F' : ''}</span>) : <span className="n">kein Fall</span>}
      </div>
    </div>
  );
}

function VariantenRaster({ e }: { e: LFErgebnis }) {
  const v = e.varianten_raster;
  const alle = v.schwellen.flatMap((s) => s.zellen.map((z) => Math.abs(z.mehrwert ?? 0)));
  const max = Math.max(...alle, 0.5);
  const farbe = (m: number | null) => {
    if (m === null) return 'transparent';
    const a = Math.min(1, Math.abs(m) / max);
    return m >= 0 ? `rgba(21,128,61,${0.1 + a * 0.55})` : `rgba(180,35,24,${0.1 + a * 0.55})`;
  };
  return (
    <div className="lb-heats">
      {v.schwellen.map((s) => (
        <div key={s.faktor}>
          <div className="leise" style={{ fontSize: 12.5, marginBottom: 4 }}>{s.schwelle === null ? 'Ereignis-Liste' : `Schwelle ${s.schwelle}`}{s.faktor === 1 ? ' (deine Regel)' : ''}</div>
          <table className="lb-heat">
            <thead><tr><th>Warten ↓ / Tage →</th>{v.horizonte.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {v.warten.map((w) => (
                <tr key={w}>
                  <th>{w} T.</th>
                  {v.horizonte.map((h) => {
                    const z = s.zellen.find((c) => c.warten === w && c.h === h);
                    const akt = s.faktor === v.aktuell.faktor && w === v.aktuell.warten && h === v.aktuell.h;
                    return <td key={h} className={akt ? 'akt' : ''} style={{ background: farbe(z?.mehrwert ?? null) }} title={z ? `${z.n} Fälle · Ø ${pText(z.mittel)} · Treffer ${prozent(z.quote)}` : ''}>{z ? pText(z.mehrwert, 1) : '—'}<small>{z?.n ?? 0}</small></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function ErgebnisFremd({ e }: { e: LFErgebnis }) {
  const H = e.horizonte.find((h) => h.h === e.haupt) || e.horizonte[0];
  const [jahrFilter, setJahrFilter] = useState<'alle' | 'mit' | 'stark'>('alle');
  const kt = e.karte.kette || {};
  const kette = [kt.ereignis, kt.mechanismus, kt.wirkung, kt.markt, kt.zeitraum].filter(Boolean);
  const jahre = useMemo(() => {
    const st = e.proJahrGrafik.map((j) => j.staerke).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const grenze = st.length ? st[Math.floor(st.length * 0.66)] : null;
    const orient = e.karte.bedingungen?.[0]?.vergleich === '<' ? -1 : 1;
    return e.proJahrGrafik.filter((j) => jahrFilter === 'alle' || (jahrFilter === 'mit' ? j.trades.length > 0 : grenze !== null && j.staerke !== null && orient * j.staerke >= orient * grenze));
  }, [e, jahrFilter]);
  const veraltet = e.abdeckung.filter((a) => a.veraltet);
  if (!H) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in" style={{ borderLeft: `6px solid ${URTEIL_FARBE[e.urteil] || 'var(--muted)'}` }}>
        <div className="leise" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{stufeText(e)}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="gs-gross" style={{ fontSize: 30, color: URTEIL_FARBE[e.urteil] }}>{e.urteil}</span>
          <span className="leise">{e.warum}</span>
        </div>
        {kette.length > 0 && <div className="lb-kette-anzeige">{kette.map((s, i) => <span key={i}>{i > 0 && <i aria-hidden="true">→</i>}{s}</span>)}</div>}
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, maxWidth: '75ch' }}>
          {e.ereignisseGesamt} Ereignisse im Backtest, davon {H.n} Fälle ohne Überlappung ({H.nUnabhaengig} unabhängige Ereignistage). Nach {e.haupt} Tagen im Schnitt <b>{pText(H.mittel)}</b> in der erwarteten Richtung; der gleiche Kalendertag in anderen Jahren brachte <b>{pText(H.saison)}</b>. Der Mehrwert des Ereignisses ist also <b>{pText(H.mehrwert)}</b>{H.p !== null ? ` (p = ${String(H.p).replace('.', ',')})` : ''}. Während der Ereignis-Periode selbst (gleichzeitig, nicht handelbar): {pText(H.gleichzeitig)}.
        </p>
        <div className="leise" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
          {e.lauf.art === 'forward' ? 'Backtest + Forward' : 'nur Backtest'} · {e.karte.backtest?.von}–{e.karte.backtest?.bis}{e.lauf.art === 'forward' ? `, Forward ab ${e.karte.forward?.von}` : ''} · {e.varianten} getestete Variante{e.varianten === 1 ? '' : 'n'} · gerechnet in {e.dauerSek} s
          {veraltet.length > 0 && <span style={{ color: '#b7791f' }}> · {veraltet.map((a) => `${a.name}: ${a.veraltet}`).join(' · ')}</span>}
          {e.schonGesehen && <span style={{ color: 'var(--fehler)' }}> · Achtung: Der Forward wurde schon bei einer früheren Version angeschaut</span>}
        </div>
      </section>

      <section className="karte in">
        <div className="lb-kacheln">
          <Kachel titel="Fälle" wert={String(H.n)} unter={`${H.nUnabhaengig} unabhängig · ${e.varianten} Variante${e.varianten === 1 ? '' : 'n'}`} />
          <Kachel titel={`Ø nach ${e.haupt} Tagen`} wert={pText(H.mittel, 1)} unter={`Median ${pText(H.median, 1)}`} />
          <Kachel titel="Gleicher Tag ohne Ereignis" wert={pText(H.saison, 1)} unter="Saison-Vergleich" />
          <Kachel titel="Mehrwert" wert={pText(H.mehrwert, 1)} unter={`p = ${H.p ?? '—'} · Zufall ${pText(H.zufall, 1)}`} />
          <Kachel titel="Treffer" wert={prozent(H.quote)} unter={H.bereich ? `${prozent(H.bereich[0])}–${prozent(H.bereich[1])}` : undefined} />
          {e.forward && <Kachel titel="Forward" wert={pText(e.forward.mittel, 1)} unter={`${e.forward.n} Fälle · Treffer ${prozent(e.forward.quote)}`} />}
        </div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Ereignis oder einfach Saison? <small>je Horizont</small></h2>
        <div className="lb-legende"><span><i style={{ background: 'var(--accent)' }} />mit Ereignis</span><span><i style={{ background: '#9aa1ab' }} />gleicher Kalendertag, andere Jahre</span><span><i style={{ background: '#c9ced8' }} />zufällige Tage aus denselben Monaten</span></div>
        <Horizontbalken e={e} />
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="lb-tabelle">
            <thead><tr><th>Tage</th><th>Fälle</th><th>unabh.</th><th>Ø Ereignis</th><th>Saison</th><th>Mehrwert</th><th>Zufall</th><th>p</th><th>Treffer</th><th>gleichzeitig</th></tr></thead>
            <tbody>
              {e.horizonte.map((h) => (
                <tr key={h.h} style={{ fontWeight: h.h === e.haupt ? 700 : 400 }}>
                  <td>{h.h}{h.h === e.haupt ? ' ★' : ''}</td><td>{h.n}</td><td>{h.nUnabhaengig}</td><td>{pText(h.mittel)}</td><td>{pText(h.saison)}</td>
                  <td style={{ color: (h.mehrwert ?? 0) > 0 ? 'var(--gruen)' : 'var(--fehler)' }}>{pText(h.mehrwert)}</td><td>{pText(h.zufall)}</td><td>{h.p ?? '—'}</td><td>{prozent(h.quote)}</td><td>{pText(h.gleichzeitig)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tr-hilfe" style={{ marginTop: 8 }}>★ = Haupt-Horizont aus der Vorab-Karte. Renditen in % in der erwarteten Richtung (bei Short: Gewinn, wenn der Preis fällt). p = Anteil von 4&apos;000 zufälligen Ziehungen aus denselben Monaten, die mindestens so gut waren.</p>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Jeder Fall <small>{e.haupt} Tage · {H.n} Backtest{e.forward ? ` + ${e.forward.n} Forward` : ''}</small></h2>
        <FaelleGrafik faelle={e.faelle} fw={e.forward?.faelle || []} namen={e.marktNamen} />
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Pro Jahr <small>{e.hauptmarkt.name}, auf 100 gesetzt</small></h2>
        <div className="lb-legende"><span><i style={{ background: '#dbe8f8' }} />Ereignis gilt</span><span><i style={{ background: 'var(--gruen)', height: 4 }} />gehalten (Gewinn)</span><span><i style={{ background: 'var(--fehler)', height: 4 }} />gehalten (Verlust)</span></div>
        <div className="lb-chips" role="group" aria-label="Jahre filtern" style={{ margin: '8px 0 10px' }}>
          {([['alle', 'Alle'], ['mit', 'Nur mit Fall'], ['stark', 'Starkes Ereignis (oberes Drittel)']] as const).map(([w, t]) => <button key={w} type="button" className="lb-wahl press" aria-pressed={jahrFilter === w} onClick={() => setJahrFilter(w)}>{t}</button>)}
        </div>
        <div className="lb-jahre">{jahre.map((j) => <JahrKarte key={j.jahr} j={j} />)}</div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Robustheit <small>Haupt-Horizont {e.haupt} Tage</small></h2>
        <Raster zeilen={e.raster} />
      </section>

      {e.dosis && (
        <section className="karte in">
          <h2 className="karte-titel">Dosis-Wirkung <small>alle Perioden nach Stärke der 1. Bedingung, {e.dosis.n} Fälle</small></h2>
          <Gruppenbalken einheit="%" gruppen={e.dosis.quintile.map((q) => ({ schluessel: `Q${q.q}`, n: q.n, avg: q.avg, quote: q.quote ?? 0 }))} />
          <p className="tr-hilfe" style={{ marginTop: 8 }}>
            {e.dosis.spearman ? `Rangkorrelation ${String(e.dosis.spearman.rho).replace('.', ',')} (p = ${String(e.dosis.spearman.p).replace('.', ',')}). ` : ''}
            Q1 = schwächste, Q5 = stärkste Ausprägung. Steigt die Wirkung von Q1 nach Q5, ist das ein starkes Indiz für den Mechanismus – auch wenn einzelne Ereignisse selten sind.
          </p>
        </section>
      )}

      <div className="gs-zwei">
        <section className="karte in">
          <h2 className="karte-titel">Pro Markt</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-tabelle">
              <thead><tr><th>Markt</th><th>Fälle</th><th>Ø</th><th>Mehrwert</th><th>netto</th></tr></thead>
              <tbody>
                {e.proMarkt.map((m) => {
                  const hb = e.handelbar.find((x) => x.id === m.id);
                  return <tr key={m.id}><td style={{ whiteSpace: 'normal' }}>{m.name}</td><td>{m.n}</td><td>{pText(m.avg)}</td><td>{pText(m.mehrwert)}</td><td>{hb?.handelbar ? pText(hb.netto) : 'nicht handelbar'}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="karte in"><h2 className="karte-titel">Pro Jahrzehnt</h2><Gruppenbalken gruppen={e.proJahrzehnt} einheit="%" /></section>
      </div>

      <section className="karte in">
        <h2 className="karte-titel">Varianten <small>Mehrwert über der Saison · nur Übersicht</small></h2>
        <VariantenRaster e={e} />
        <p className="tr-hilfe" style={{ marginTop: 8 }}>Umrandet ist deine Regel. Wer hier die beste Zelle aussucht und nur diese testet, betreibt Overfitting – jede neue Version zählt als Variante.</p>
      </section>

      {e.stufe2 && (
        <section className="karte in">
          <h2 className="karte-titel">Stufe 2 <small>{e.stufe2.modell}, halten {e.stufe2.halten} Tage, nach Kosten</small></h2>
          <div className="lb-kacheln">
            <Kachel titel="Im Bias-Fenster" wert={pText(e.stufe2.innen.avg)} unter={`${e.stufe2.innen.n} Trades · Treffer ${prozent(e.stufe2.innen.quote)}`} />
            <Kachel titel="Ausserhalb (Gegenprobe)" wert={pText(e.stufe2.aussen.avg)} unter={`${e.stufe2.aussen.n} Trades · Treffer ${prozent(e.stufe2.aussen.quote)}`} />
            <Kachel titel="Im Fenster, Gegenrichtung" wert={pText(e.stufe2.gegen.avg)} unter={`${e.stufe2.gegen.n} Trades`} />
            {e.stufe2.forward && <Kachel titel="Forward im Fenster" wert={pText(e.stufe2.forward.avg)} unter={`${e.stufe2.forward.n} Trades`} />}
            <Kachel titel="p (innen besser)" wert={e.stufe2.p === null ? '—' : String(e.stufe2.p).replace('.', ',')} />
          </div>
          <p className="tr-hilfe" style={{ marginTop: 8 }}>Der Bias hilft nur, wenn dasselbe Entry-Model im Fenster klar besser ist als ausserhalb und in Gegenrichtung.</p>
        </section>
      )}

      <section className="karte in">
        <h2 className="karte-titel">Als Handelsregel und Risiko <small>{e.haupt} Tage, alle Märkte nacheinander</small></h2>
        <div className="lb-kacheln">
          <Kachel titel="Trefferquote" wert={prozent(e.kennzahlen.quote)} unter={`${e.kennzahlen.n} Trades`} />
          <Kachel titel="Ø Gewinn / Verlust" wert={`${pText(e.kennzahlen.avgGewinn, 1)} / ${pText(e.kennzahlen.avgVerlust, 1)}`} />
          <Kachel titel="Profit-Faktor" wert={e.kennzahlen.pf === null || e.kennzahlen.pf === undefined ? '—' : e.kennzahlen.pf.toFixed(2).replace('.', ',')} />
          <Kachel titel="Schlechtester Fall" wert={pText(e.kennzahlen.schlechtester, 1)} />
          {e.monteCarlo && <Kachel titel="Drawdown 95 % (Monte Carlo)" wert={`${e.monteCarlo.dd95.toFixed(0)} %-Pkt.`} unter={`Summe bei voller Position je Fall · 99 %: ${e.monteCarlo.dd99.toFixed(0)} · Verlustserie 95 %: ${e.monteCarlo.serie95}`} />}
        </div>
        {e.verluste.length > 0 && (
          <p style={{ fontSize: 13.5, margin: '10px 0 0' }}>
            <b>Grösste Verluste:</b> {e.verluste.map((v) => `${e.marktNamen[v.markt] || v.markt} ${tagDatum(v.en)} ${pText(v.r, 1)}`).join(' · ')} – sie bestimmen das Risiko. Ohne Stop-Loss nicht handelbar.
          </p>
        )}
        <p className="tr-hilfe" style={{ marginTop: 8 }}>Monte Carlo zieht die Fall-Liste 10&apos;000-mal neu (Summe der Prozente bei voller Position, ohne Hebel). Es zeigt nur das Risiko – keinen Vorteil. Müll rein, Müll raus.</p>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Einordnung</h2>
        <p style={{ fontSize: 14, margin: '0 0 10px' }}><b>Was würde das Urteil ändern?</b> {e.aendern}</p>
        <details className="lb-details">
          <summary>Quellen</summary>
          <ul>
            {e.abdeckung.map((a) => (
              <li key={a.id}>{a.name}: {a.link ? <a href={a.link} target="_blank" rel="noopener noreferrer">{a.quelle}</a> : a.quelle}, {a.von} bis {a.bis} ({a.n.toLocaleString('de-CH')} Werte){a.hinweis ? ` – ${a.hinweis}` : ''}{a.veraltet ? ` – ${a.veraltet}` : ''}</li>
            ))}
          </ul>
        </details>
        <details className="lb-details">
          <summary>Methode und Look-ahead</summary>
          <ul>
            <li>Ein Ereignis gilt erst ab «bekannt» = Ende der Periode + Verzögerung. «Normal» wird nur gegen die Vorjahre gemessen, nie gegen die Zukunft.</li>
            <li>Einstieg zum ersten Kurs ab «bekannt + Wartezeit», Ausstieg Horizont-Tage später. Ein neuer Fall pro Markt erst nach dem Ende des vorigen (keine Überlappung).</li>
            <li>Saison: Ø des gleichen Kalendertags (±3 Tage) in allen anderen Jahren des Backtests. Mehrwert = Ereignis − Saison.</li>
            <li>p-Wert: 4&apos;000-mal gleich viele zufällige Einstiege aus denselben Monaten; gezählt wird, wie oft sie im Schnitt mindestens so gut waren. Bonferroni-Grenze = 0,05 / Anzahl Varianten.</li>
            <li>Pseudo-Forward: ältere zwei Drittel gegen das letzte Drittel. Placebo: alle Ereignisse ein halbes Jahr verschoben. Spiegel: das Gegen-Ereignis in Gegenrichtung.</li>
            <li>Der Forward-Zeitraum ist bis zum bewussten Öffnen nicht im Speicher – auch nicht für Grafiken.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
