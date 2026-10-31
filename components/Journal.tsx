'use client';
// Trading-Journal: Trades von Hand erfassen (Pflicht: Paar, Datum, Ergebnis in EUR), Rendite in % mit Ein-/Auszahlungen,
// Kennzahlen, Kapitalkurve, Kalender, Aufschlüsselung, Verteilung, Backtest gegen live, Monte Carlo. Rechnungen in lib/journal.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { holen, senden } from '@/lib/api';
import {
  AUSGANG_TEXT, GRENZEN_PROZENT, WOCHENTAGE, ausgangAuto, ausgangVon, datumVon, eurOhneVz, eurText, geldAuswertung, geplantesRR, geschlosseneTrades, gruppieren, gruppierenGeld,
  istGeschlossen, kennzahlen, lotsBerechnen, monteCarlo, monteCarloProzent, pText, prozent,
  rAusKurs, rText, rVon, risikoEurBerechnen, vergleich, verteilung, wochentag,
  type JArt, type JAusgang, type JEinstellungen, type JGeld, type JGeschlossen, type JPosten, type JTrade, type JournalZustand,
} from '@/lib/journal';
import { Icon } from './ui';
import { Popup } from './NetzBausteine';
import { BacktestStart } from './BacktestSession';
import { ImportPopup } from './JournalImport';
import { EinstPopup } from './JournalGeld';

type Einheit = 'prozent' | 'eur' | 'r';

type Filter = 'alle' | JArt;
type Zeitraum = 'alles' | 'jahr' | '90' | '30';
const ZEITRAUM_TEXT: Record<Zeitraum, string> = { alles: 'Alles', jahr: 'Dieses Jahr', '90': '90 Tage', '30': '30 Tage' };

const komma = (x: number | null | undefined, st = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(st).replace('.', ','));
const datumKurz = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j.slice(2)}`; };
const heuteIso = () => new Date().toLocaleDateString('sv-SE');
const prozentZahl = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')} %`; // v schon in Prozent

// Zahl, die beim ersten Anzeigen hochzählt (aus bei «Bewegung reduzieren»).
function useZaehler(ziel: number | null, ms = 700) {
  const [wert, setWert] = useState(ziel);
  const vorher = useRef<number | null>(null);
  useEffect(() => {
    if (ziel === null || !Number.isFinite(ziel)) { setWert(ziel); return; }
    const ruhig = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = vorher.current ?? 0;
    vorher.current = ziel;
    if (ruhig || start === ziel) { setWert(ziel); return; }
    let raf = 0;
    const t0 = performance.now();
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setWert(start + (ziel - start) * e);
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [ziel, ms]);
  return wert;
}

export function Journal() {
  const [d, setD] = useState<JournalZustand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [zeitraum, setZeitraum] = useState<Zeitraum>('alles');
  const [trade, setTrade] = useState<JTrade | 'neu' | null>(null);
  const [einst, setEinst] = useState(false);
  const [einheit, setEinheit] = useState<Einheit>('prozent');
  const [konto, setKonto] = useState<'alle' | string>('alle');
  const [gruppe, setGruppe] = useState<'pair' | 'richtung' | 'tf' | 'tag' | 'monat'>('pair');
  const [session, setSession] = useState(false);
  const [importOffen, setImportOffen] = useState(false);

  const laden = useCallback(async () => {
    try { setD(await holen<JournalZustand>('/api/journal')); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const ab = useMemo(() => (zeitraum === 'alles' ? '' : zeitraum === 'jahr' ? `${new Date().getFullYear()}-01-01` : new Date(Date.now() - Number(zeitraum) * 86400_000).toLocaleDateString('sv-SE')), [zeitraum]);
  // Das Konto filtert nur Live-Trades. Backtests gehören zu keinem Konto.
  const gefiltert = useMemo(() => {
    if (!d) return [];
    return d.trades.filter((t) => (filter === 'alle' || t.art === filter) && (konto === 'alle' || t.art === 'backtest' || t.konto === konto) && datumVon(t) >= ab);
  }, [d, filter, konto, ab]);
  const geschl = useMemo(() => geschlosseneTrades(gefiltert), [gefiltert]);
  const k = useMemo(() => (d ? kennzahlen(geschl, d.einstellungen) : null), [geschl, d]);
  // Geld und Rendite: nur Live-Trades mit Ergebnis in EUR. Der Kontostand davor nutzt die ganze Historie, auch ausserhalb des Zeitraums.
  const geld = useMemo(() => {
    if (!d || filter === 'backtest') return null;
    const trades = d.trades.filter((t) => t.art === 'live' && t.ergebnisEur !== null && (konto === 'alle' || t.konto === konto));
    const cashflows = d.cashflows.filter((c) => konto === 'alle' || c.konto === konto);
    return geldAuswertung(trades, cashflows, ab);
  }, [d, filter, konto, ab]);
  const offen = gefiltert.filter((t) => !istGeschlossen(t) && t.ausgang !== 'skip');

  if (fehler && !d) return <div className="karte fehlerbox">Journal nicht ladbar: {fehler}</div>;
  if (!d || !k) return <div className="karte leise">Lade …</div>;

  const leer = d.trades.length === 0;
  const hatGeld = !!geld && geld.n > 0;
  const hatR = k.n > 0;
  const modus: Einheit = einheit === 'prozent' && hatGeld ? 'prozent' : einheit === 'eur' && hatGeld ? 'eur' : einheit === 'r' && hatR ? 'r' : hatGeld ? 'prozent' : 'r';
  const prozentVon = new Map<string, number | null>((geld?.alle ?? []).map((p) => [p.t.id, p.prozent]));
  // Werte pro Tag für den Kalender, passend zur gewählten Einheit
  const tageswerte: { datum: string; v: number }[] = modus === 'r' ? geschl.map((x) => ({ datum: x.datum, v: x.r }))
    : modus === 'eur' ? (geld?.posten ?? []).map((p) => ({ datum: p.datum, v: p.eur }))
      : (geld?.posten ?? []).map((p) => ({ datum: p.datum, v: (p.prozent ?? 0) * 100 }));
  const tagFormat = (v: number) => (modus === 'r' ? rText(v) : modus === 'eur' ? eurText(v) : prozentZahl(v));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in jr-leiste" aria-label="Filter">
        <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)', width: 'auto', minWidth: 230 }}>
          {(['alle', 'live', 'backtest'] as Filter[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'alle' ? 'Alle' : f === 'live' ? 'Live' : 'Backtest'}</button>)}
        </div>
        <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)', width: 'auto', minWidth: 300 }}>
          {(Object.keys(ZEITRAUM_TEXT) as Zeitraum[]).map((z) => <button key={z} aria-pressed={zeitraum === z} onClick={() => setZeitraum(z)}>{ZEITRAUM_TEXT[z]}</button>)}
        </div>
        {d.konten.length > 1 && (
          <select className="jr-konto-wahl" value={konto} onChange={(e) => setKonto(e.target.value)} aria-label="Konto">
            <option value="alle">Alle Konten</option>
            {d.konten.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <span style={{ flex: 1 }} />
        <button className="knopf-klein press" onClick={() => setImportOffen(true)}>Import</button>
        <button className="knopf-klein press" onClick={() => setSession(true)}>Backtest-Session</button>
        <button className="knopf-klein press tr-primaer" onClick={() => setTrade('neu')}>+ Trade erfassen</button>
        <button className="icon-knopf press" style={{ background: 'var(--bg)' }} onClick={() => setEinst(true)} aria-label="Journal-Einstellungen" title="Einstellungen"><Icon name="zahnrad" size={19} /></button>
      </section>

      {leer ? (
        <section className="karte in jr-held" aria-label="Noch keine Trades">
          <h2 style={{ margin: 0, fontSize: 22 }}>Dein Journal ist noch leer</h2>
          <p style={{ margin: '8px 0 16px', opacity: 0.8, maxWidth: 560, lineHeight: 1.5 }}>Trage deine Trades von Hand ein, auch die alten. Pflicht sind nur Paar, Datum und das Ergebnis in EUR. Trage im Zahnrad zuerst deine Einzahlungen ein, dann rechnet die Zentrale deine Rendite in % aus.</p>
          <button className="knopf-klein press tr-primaer" onClick={() => setTrade('neu')}>+ Ersten Trade erfassen</button>
        </section>
      ) : (
        <>
          <Held k={k} geld={geld} modus={modus} setEinheit={setEinheit} offen={offen.length} />
          {hatGeld && geld && <GeldKacheln geld={geld} />}
          {hatR && <Kacheln k={k} titel={hatGeld ? 'Kennzahlen in R' : 'Kennzahlen'} />}
          <div className="jr-zwei">
            <Kalender werte={tageswerte} format={tagFormat} />
            <TradeListe trades={gefiltert} prozentVon={prozentVon} onOpen={setTrade} onGeaendert={laden} />
          </div>
          <Auswertung g={geschl} geld={geld} modus={modus} alle={geschlosseneTrades(d.trades)} e={d.einstellungen} gruppe={gruppe} setGruppe={setGruppe} filter={filter} />
        </>
      )}

      {trade && <TradePopup t={trade === 'neu' ? null : trade} d={d} kontoVorgabe={konto === 'alle' ? null : konto} onNeu={laden} onClose={(neu) => { setTrade(null); if (neu) laden(); }} />}
      {session && <BacktestStart d={d} onClose={(neu) => { setSession(false); if (neu) laden(); }} />}
      {importOffen && <ImportPopup paare={d.paare} konten={d.konten} onClose={(neu) => { setImportOffen(false); if (neu) laden(); }} />}
      {einst && <EinstPopup d={d} neuladen={laden} onClose={() => setEinst(false)} />}
    </div>
  );
}

// ---------- Kapitalkurve ----------
function Held({ k, geld, modus, setEinheit, offen }: { k: ReturnType<typeof kennzahlen>; geld: JGeld | null; modus: Einheit; setEinheit: (x: Einheit) => void; offen: number }) {
  const hatGeld = !!geld && geld.n > 0;
  const hatR = k.n > 0;
  const ziel = modus === 'r' ? k.summeR : modus === 'eur' ? (geld?.summeEur ?? 0) : geld?.rendite === null || geld?.rendite === undefined ? null : geld.rendite * 100;
  const summe = useZaehler(ziel);
  const punkte = modus === 'r' ? k.kurve.map((p) => p.r) : modus === 'eur' ? (geld?.kurve ?? []).map((p) => p.kumEur) : (geld?.kurve ?? []).map((p) => p.kumProzent * 100);
  const optionen = ([['prozent', '%', hatGeld], ['eur', 'EUR', hatGeld], ['r', 'R', hatR]] as const).filter(([, , ok]) => ok);
  const anzahl = modus === 'r' ? k.n : (geld?.n ?? 0);
  const W = 640, H = 190;
  const werte = [0, ...punkte];
  const lo = Math.min(...werte), hi = Math.max(...werte);
  const sp = hi - lo || 1;
  const x = (i: number) => (werte.length < 2 ? 0 : (i / (werte.length - 1)) * W);
  const y = (v: number) => H - 10 - ((v - lo) / sp) * (H - 20);
  const linie = werte.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${W},${H} L0,${H} Z`;
  const positiv = (werte[werte.length - 1] ?? 0) >= 0;
  return (
    <section className="karte in jr-held" aria-label="Kapitalkurve">
      <div className="jr-held-kopf">
        <div>
          <div className="jr-label">{modus === 'prozent' ? 'Rendite' : modus === 'eur' ? 'Ergebnis in EUR' : 'Ergebnis in R'} · {anzahl} {modus === 'r' ? 'geschlossene ' : ''}Trades{offen ? ` · ${offen} offen` : ''}</div>
          <div className={`jr-gross tr-zahl ${positiv ? 'plus' : 'minus'}`}>{summe === null ? '—' : modus === 'r' ? rText(summe) : modus === 'eur' ? eurText(summe) : pText(summe / 100)}</div>
          {modus === 'prozent' && geld && <div className="jr-label">{geld.rendite === null ? 'Noch keine Einzahlung vor den Trades: im Zahnrad eintragen' : `zeitgewichtet · Konto ${eurOhneVz(geld.kontostand)} · eingezahlt ${eurOhneVz(geld.einzahlungen)}`}</div>}
          {modus === 'eur' && geld && <div className="jr-label">Konto {eurOhneVz(geld.kontostand)} · eingezahlt {eurOhneVz(geld.einzahlungen)}{geld.auszahlungen > 0 ? ` · ausgezahlt ${eurOhneVz(geld.auszahlungen)}` : ''}</div>}
        </div>
        {optionen.length > 1 && (
          <div className="segment jr-segment-dunkel" style={{ gridTemplateColumns: `repeat(${optionen.length}, 1fr)`, width: 'auto', minWidth: 60 * optionen.length }}>
            {optionen.map(([id, text]) => <button key={id} aria-pressed={modus === id} onClick={() => setEinheit(id)}>{text}</button>)}
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="jr-kurve" role="img" aria-label={`Kurve ${modus === 'r' ? 'in R' : modus === 'eur' ? 'in EUR' : 'in Prozent'}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="jrVerlauf" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={positiv ? '#4ade80' : '#f87171'} stopOpacity=".35" />
            <stop offset="1" stopColor={positiv ? '#4ade80' : '#f87171'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.18)" strokeDasharray="4 5" />
        <path key={modus + werte.length} d={flaeche} fill="url(#jrVerlauf)" className="area" />
        <path key={'l' + modus + werte.length} d={linie} fill="none" stroke={positiv ? '#4ade80' : '#f87171'} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" className="spark" pathLength={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </section>
  );
}

function Kachel({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: 'plus' | 'minus' }) {
  return (
    <div className="jr-kachel">
      <div className="jr-kachel-titel">{titel}</div>
      <div className={`jr-kachel-wert tr-zahl ${ton || ''}`}>{wert}</div>
      {unter && <div className="leise" style={{ fontSize: 12, lineHeight: 1.4 }}>{unter}</div>}
    </div>
  );
}

// Kennzahlen in Geld und % (Live-Trades mit Ergebnis in EUR)
function GeldKacheln({ geld }: { geld: JGeld }) {
  const ton = (x: number | null) => (x === null ? undefined : x > 0 ? 'plus' : x < 0 ? 'minus' : undefined);
  const wenig = geld.n < 30;
  return (
    <section className="karte in" aria-label="Kennzahlen in Geld">
      <h2 className="karte-titel">Kennzahlen <small>{wenig ? `noch wenige Trades (${geld.n}) – Bereiche beachten` : `${geld.n} Trades`}</small></h2>
      {geld.ohneKapital > 0 && (
        <div className="jr-hinweis" style={{ marginBottom: 10 }}>
          Bei {geld.ohneKapital} Trade{geld.ohneKapital === 1 ? '' : 's'} war noch kein Geld auf dem Konto eingetragen, deshalb fehlt dort die Rendite in %. Trage im Zahnrad die Einzahlung mit Datum ein.
        </div>
      )}
      <div className="jr-kacheln">
        <Kachel titel="Ergebnis" wert={eurText(geld.summeEur)} ton={ton(geld.summeEur)} unter={`Konto ${eurOhneVz(geld.kontostand)} · eingezahlt ${eurOhneVz(geld.einzahlungen)}${geld.auszahlungen > 0 ? ` · ausgezahlt ${eurOhneVz(geld.auszahlungen)}` : ''}`} />
        <Kachel titel="Rendite" wert={pText(geld.rendite)} ton={ton(geld.rendite)} unter={geld.rendite === null ? 'braucht eine Einzahlung vor den Trades' : 'Ein- und Auszahlungen herausgerechnet'} />
        <Kachel titel="Ø Gewinn pro Gewinn-Trade" wert={eurText(geld.schnittGewinnEur)} ton="plus" unter={`${pText(geld.schnittGewinnProzent)} vom Konto · ${geld.gewinner} Gewinner`} />
        <Kachel titel="Ø Verlust pro Verlust-Trade" wert={eurText(geld.schnittVerlustEur)} ton="minus" unter={`${pText(geld.schnittVerlustProzent)} vom Konto · ${geld.verlierer} Verlierer`} />
        <Kachel titel="Ø Gewinn zu Ø Verlust" wert={geld.verhaeltnis === null ? '—' : `${komma(geld.verhaeltnis, 2)} : 1`} unter="so viel gewinnst du im Schnitt pro 1 verlorenem Betrag" ton={geld.verhaeltnis === null ? undefined : geld.verhaeltnis >= 1 ? 'plus' : 'minus'} />
        <Kachel titel="Trefferquote" wert={prozent(geld.trefferquote)} unter={`${geld.gewinner} G · ${geld.verlierer} V · ${geld.be} BE${geld.trefferBereich ? ` · 95 %: ${prozent(geld.trefferBereich[0])}–${prozent(geld.trefferBereich[1])}` : ''}`} />
        <Kachel titel="Erwartungswert pro Trade" wert={eurText(geld.erwartungEur)} ton={ton(geld.erwartungEur)} unter={`${pText(geld.erwartungProzent)} vom Konto im Schnitt`} />
        <Kachel titel="Profit-Faktor" wert={geld.profitFaktor === Infinity ? '∞' : komma(geld.profitFaktor)} unter="Gewinne / Verluste in EUR" ton={geld.profitFaktor === null ? undefined : geld.profitFaktor >= 1 ? 'plus' : 'minus'} />
        <Kachel titel="Max. Drawdown" wert={geld.maxDdProzent === null ? '—' : `−${komma(geld.maxDdProzent * 100, 1)} %`} unter="grösster Rückgang vom Höchststand" ton={geld.maxDdProzent ? 'minus' : undefined} />
        <Kachel titel="Serien" wert={`${geld.verlustSerie} V · ${geld.gewinnSerie} G`} unter="längste Verlust- / Gewinnserie" />
      </div>
    </section>
  );
}

function Kacheln({ k, titel = 'Kennzahlen' }: { k: ReturnType<typeof kennzahlen>; titel?: string }) {
  const erw = useZaehler(k.erwartung);
  const ton = (x: number | null) => (x === null ? undefined : x > 0 ? 'plus' : x < 0 ? 'minus' : undefined);
  const wenig = k.n < 30;
  return (
    <section className="karte in" aria-label={titel}>
      <h2 className="karte-titel">{titel} <small>{wenig ? `noch wenige Trades (${k.n}) – Bereiche beachten` : `${k.n} Trades`}</small></h2>
      <div className="jr-kacheln">
        <Kachel titel="Erwartungswert" wert={rText(erw)} ton={ton(k.erwartung)} unter={k.erwartungBereich ? `95 %: ${rText(k.erwartungBereich[0])} bis ${rText(k.erwartungBereich[1])}` : 'ab 2 Trades'} />
        <Kachel titel="Trefferquote" wert={prozent(k.trefferquote)} unter={`${k.gewinner} G · ${k.verlierer} V · ${k.be} BE${k.trefferBereich ? ` · 95 %: ${prozent(k.trefferBereich[0])}–${prozent(k.trefferBereich[1])}` : ''}`} />
        <Kachel titel="Profit-Faktor" wert={k.profitFaktor === Infinity ? '∞' : komma(k.profitFaktor)} unter="Gewinne in R / Verluste in R" ton={k.profitFaktor === null ? undefined : k.profitFaktor >= 1 ? 'plus' : 'minus'} />
        <Kachel titel="Ø Gewinner / Verlierer" wert={`${rText(k.schnittGewinn, 1)} / ${rText(k.schnittVerlust, 1)}`} unter={k.geplantRR !== null ? `geplant Ø ${komma(k.geplantRR, 1)} R (mit TP)` : 'mit TP siehst du das geplante RR'} />
        <Kachel titel="Max. Drawdown" wert={`−${komma(k.maxDdR, 1)} R`} unter="grösster Rückgang vom Höchststand in R" ton={k.maxDdR > 0 ? 'minus' : undefined} />
        <Kachel titel="Serien" wert={`${k.verlustSerie} V · ${k.gewinnSerie} G`} unter="längste Verlust- / Gewinnserie" />
        <Kachel titel="SQN" wert={komma(k.sqn)} unter={k.sqn === null ? 'ab 2 Trades' : k.sqn < 1.6 ? 'schwach (< 1,6)' : k.sqn < 2 ? 'durchschnittlich' : k.sqn < 3 ? 'gut' : 'sehr gut'} />
      </div>
    </section>
  );
}

// ---------- Kalender ----------
function Kalender({ werte, format }: { werte: { datum: string; v: number }[]; format: (v: number) => string }) {
  const [monat, setMonat] = useState(() => heuteIso().slice(0, 7));
  const proTag = useMemo(() => {
    const m = new Map<string, { r: number; n: number }>(); // r = Summe der Tageswerte in der gewählten Einheit
    for (const x of werte) { const a = m.get(x.datum) || { r: 0, n: 0 }; a.r += x.v; a.n++; m.set(x.datum, a); }
    return m;
  }, [werte]);
  const [j, mo] = monat.split('-').map(Number);
  const erster = new Date(Date.UTC(j, mo - 1, 1));
  const tage = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  const versatz = (erster.getUTCDay() + 6) % 7; // Montag zuerst
  const monatR = [...proTag.entries()].filter(([t]) => t.startsWith(monat)).reduce((s, [, v]) => s + v.r, 0);
  const schieben = (n: number) => { const d = new Date(Date.UTC(j, mo - 1 + n, 1)); setMonat(d.toISOString().slice(0, 7)); };
  const maxAbs = Math.max(1, ...[...proTag.values()].map((v) => Math.abs(v.r)));
  return (
    <section className="karte in" aria-label="Kalender">
      <h2 className="karte-titel">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="icon-knopf press" style={{ width: 34, height: 34, background: 'var(--bg)' }} onClick={() => schieben(-1)} aria-label="Vormonat"><Icon name="zurueck" size={16} /></button>
          {erster.toLocaleDateString('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          <button className="icon-knopf press" style={{ width: 34, height: 34, background: 'var(--bg)' }} onClick={() => schieben(1)} aria-label="Folgemonat"><Icon name="weiter" size={16} /></button>
        </span>
        <small className={`tr-zahl ${monatR > 0 ? 'jr-plus' : monatR < 0 ? 'jr-minus' : ''}`}>{format(monatR)}</small>
      </h2>
      <div className="jr-kal">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <div key={w} className="jr-kal-kopf">{w}</div>)}
        {Array.from({ length: versatz }, (_, i) => <div key={'l' + i} />)}
        {Array.from({ length: tage }, (_, i) => {
          const tag = `${monat}-${String(i + 1).padStart(2, '0')}`;
          const v = proTag.get(tag);
          const h = v ? 0.15 + 0.7 * Math.min(1, Math.abs(v.r) / maxAbs) : 0;
          return (
            <div key={tag} className="jr-kal-tag" style={{ background: v ? `rgba(${v.r >= 0 ? '21,128,61' : '180,35,24'},${h})` : undefined, color: v && h > 0.5 ? '#fff' : undefined, animationDelay: `${i * 12}ms` }} title={v ? `${datumKurz(tag)}: ${format(v.r)} aus ${v.n} Trade(s)` : datumKurz(tag)}>
              <span>{i + 1}</span>
              {v && <b className="tr-zahl">{komma(v.r, 1)}</b>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Trade-Liste ----------
function TradeListe({ trades, prozentVon, onOpen, onGeaendert }: { trades: JTrade[]; prozentVon: Map<string, number | null>; onOpen: (t: JTrade) => void; onGeaendert: () => void }) {
  const [alle, setAlle] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set());
  const [bestaetigen, setBestaetigen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const sortiert = [...trades].sort((a, b) => {
    const oa = istGeschlossen(a) || a.ausgang === 'skip' ? 1 : 0, ob = istGeschlossen(b) || b.ausgang === 'skip' ? 1 : 0;
    if (oa !== ob) return oa - ob; // offene zuerst
    return (b.geschlossen || b.eroeffnet) < (a.geschlossen || a.eroeffnet) ? -1 : 1;
  });
  // Im Bearbeiten-Modus immer alle zeigen, damit «Alle auswählen» nichts Unsichtbares erwischt.
  const sicht = alle || bearbeiten ? sortiert : sortiert.slice(0, 12);
  // Nur Trades zählen, die im aktuellen Filter noch da sind (Filter kann während der Auswahl wechseln).
  const gewaehlt = sortiert.filter((t) => auswahl.has(t.id)).map((t) => t.id);
  const alleGewaehlt = sortiert.length > 0 && gewaehlt.length === sortiert.length;

  const umschalten = (id: string) => {
    setBestaetigen(false);
    setAuswahl((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const alleUmschalten = () => { setBestaetigen(false); setAuswahl(alleGewaehlt ? new Set() : new Set(sortiert.map((t) => t.id))); };
  const beenden = () => { setBearbeiten(false); setAuswahl(new Set()); setBestaetigen(false); setFehler(null); };
  async function loeschen() {
    if (!gewaehlt.length) return;
    setLaeuft(true); setFehler(null);
    try {
      await senden('/api/journal/trade', { ids: gewaehlt }, 'DELETE');
      beenden();
      onGeaendert();
    } catch (e) { setFehler((e as Error).message); }
    setLaeuft(false);
  }

  return (
    <section className="karte in" aria-label="Trades">
      <h2 className="karte-titel">
        <span>Trades <small>{trades.length}</small></span>
        {trades.length > 0 && (bearbeiten
          ? <button className="knopf-klein press" onClick={beenden}>Fertig</button>
          : <button className="knopf-klein press" onClick={() => setBearbeiten(true)}>Bearbeiten</button>)}
      </h2>
      {bearbeiten && (
        <div className="jr-auswahl-leiste">
          <label className="jr-haken">
            <input type="checkbox" checked={alleGewaehlt} onChange={alleUmschalten} />
            <span>Alle auswählen</span>
          </label>
          <span className="leise" style={{ fontSize: 13 }}>{gewaehlt.length} von {sortiert.length} gewählt</span>
          <span style={{ flex: 1 }} />
          {!bestaetigen
            ? <button className="knopf-klein press" disabled={!gewaehlt.length || laeuft} onClick={() => setBestaetigen(true)}>{gewaehlt.length ? `${gewaehlt.length} löschen` : 'Löschen'}</button>
            : <button className="knopf-klein press" style={{ background: 'var(--fehler)', color: '#fff' }} disabled={laeuft} onClick={loeschen}>{laeuft ? 'Lösche …' : `Wirklich ${gewaehlt.length} löschen`}</button>}
        </div>
      )}
      {fehler && <div className="fehlerbox" style={{ marginBottom: 8 }}>{fehler}</div>}
      {sicht.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Keine Trades in diesem Filter.</div>}
      {sicht.map((t) => {
        const { r } = rVon(t);
        const eur = t.ergebnisEur;
        const pr = prozentVon.get(t.id) ?? null;
        const ausgang = ausgangVon(t);
        // Ohne erfasste Richtung zeigt das Symbol das Vorzeichen des Ergebnisses.
        const symbol = t.richtung ? (t.richtung === 'long' ? '▲' : '▼') : eur === null ? '•' : eur > 0 ? '+' : eur < 0 ? '−' : '=';
        const symbolKlasse = t.richtung || (eur === null || eur === 0 ? 'ohne' : eur > 0 ? 'long' : 'short');
        const inhalt = (
          <>
            <span className={`jr-richtung ${symbolKlasse}`}>{symbol}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{t.pair}</b> <span className="leise" style={{ fontSize: 12 }}>{t.tf ? `${t.tf} · ` : ''}{t.art === 'backtest' ? 'Backtest' : 'Live'}</span>
              <div className="leise" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{datumKurz(t.eroeffnet)}{ausgang ? ` · ${AUSGANG_TEXT[ausgang]}` : ''}{t.skipGrund ? `: ${t.skipGrund}` : ''}{t.tags.length ? ` · ${t.tags.join(', ')}` : ''}</div>
            </span>
            {eur !== null
              ? <span className="jr-ergebnis"><b className={`tr-zahl ${eur > 0 ? 'jr-plus' : eur < 0 ? 'jr-minus' : ''}`}>{eurText(eur)}</b>{pr !== null && <small className="leise tr-zahl">{pText(pr)}</small>}</span>
              : r === null ? <span className="pille tr-pille-aus">{t.ausgang === 'skip' ? 'Skip' : 'offen'}</span> : <b className={`tr-zahl ${r > 0 ? 'jr-plus' : r < 0 ? 'jr-minus' : ''}`}>{rText(r)}</b>}
          </>
        );
        return bearbeiten ? (
          <label key={t.id} className={`zeile press nw-zeile jr-wahl${auswahl.has(t.id) ? ' an' : ''}`}>
            <input type="checkbox" className="jr-haken-feld" checked={auswahl.has(t.id)} onChange={() => umschalten(t.id)} aria-label={`${t.pair} ${datumKurz(t.eroeffnet)} auswählen`} />
            {inhalt}
          </label>
        ) : (
          <button key={t.id} className="zeile press nw-zeile" onClick={() => onOpen(t)} style={{ width: '100%', background: 'transparent', textAlign: 'left' }}>
            {inhalt}
          </button>
        );
      })}
      {!bearbeiten && sortiert.length > 12 && <button className="knopf-klein press" style={{ marginTop: 8 }} onClick={() => setAlle(!alle)}>{alle ? 'Weniger zeigen' : `Alle ${sortiert.length} zeigen`}</button>}
    </section>
  );
}

// ---------- Auswertung ----------
function Auswertung({ g, geld, modus, alle, e, gruppe, setGruppe, filter }: { g: JGeschlossen[]; geld: JGeld | null; modus: Einheit; alle: JGeschlossen[]; e: JEinstellungen; gruppe: 'pair' | 'richtung' | 'tf' | 'tag' | 'monat'; setGruppe: (x: 'pair' | 'richtung' | 'tf' | 'tag' | 'monat') => void; filter: Filter }) {
  // Mit Live-Trades in Geld (EUR / %) rechnet alles in Geld und Rendite, sonst in R.
  const geldModus = modus !== 'r' && !!geld && geld.n > 0;
  const posten: JPosten[] = geldModus && geld ? geld.posten : [];
  const merkmal = (t: JTrade, datum: string): string => ({
    pair: t.pair,
    richtung: t.richtung === 'long' ? 'Long' : t.richtung === 'short' ? 'Short' : 'ohne',
    tf: t.tf || 'ohne',
    tag: wochentag(t.eroeffnet),
    monat: datum.slice(0, 7),
  })[gruppe];
  type Zeile = { schluessel: string; n: number; summe: number; schnitt: number; trefferquote: number | null };
  let gr: Zeile[] = geldModus
    ? gruppierenGeld(posten, (x) => merkmal(x.t, x.datum)).map((x) => ({ schluessel: x.schluessel, n: x.n, summe: x.summeEur, schnitt: x.schnittEur, trefferquote: x.trefferquote }))
    : gruppieren(g, (x) => merkmal(x.t, x.datum), e.beSchwelle).map((x) => ({ schluessel: x.schluessel, n: x.n, summe: x.summeR, schnitt: x.erwartung, trefferquote: x.trefferquote }));
  if (gruppe === 'tag') gr = gr.sort((a, b) => ((WOCHENTAGE.indexOf(a.schluessel) + 6) % 7) - ((WOCHENTAGE.indexOf(b.schluessel) + 6) % 7));
  if (gruppe === 'monat') gr = gr.sort((a, b) => (a.schluessel < b.schluessel ? 1 : -1));
  const maxAbs = Math.max(0.0001, ...gr.map((x) => Math.abs(x.summe)));
  const renditen = posten.map((p) => p.prozent).filter((x): x is number => x !== null);
  const vert = geldModus ? verteilung(renditen.map((x) => x * 100), GRENZEN_PROZENT) : verteilung(g.map((x) => x.r));
  const maxV = Math.max(1, ...vert.map((v) => v.n));
  const [risiko, setRisiko] = useState(e.risikoProzent);
  const mc = useMemo(() => (geldModus ? monteCarloProzent(renditen) : monteCarlo(g.map((x) => x.r), risiko)), [geldModus, geld, g, risiko]); // eslint-disable-line react-hooks/exhaustive-deps
  const mcBasis = geldModus ? renditen.length : g.length;
  const live = alle.filter((x) => x.t.art === 'live').map((x) => x.r);
  const bt = alle.filter((x) => x.t.art === 'backtest').map((x) => x.r);
  const vg = vergleich(live, bt);
  const mittel = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const randText = (v: { von: number; bis: number }) => (v.von === -Infinity ? `< ${komma(v.bis, 1)}` : v.bis === Infinity ? `≥ ${komma(v.von, 0)}` : `${komma(v.von, 1)}`);

  return (
    <>
      <div className="jr-zwei">
        <section className="karte in" aria-label="Aufschlüsselung">
          <h2 className="karte-titel">Aufschlüsselung</h2>
          <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 8 }}>
            {([['pair', 'Paar'], ['richtung', 'Seite'], ['tf', 'Linie'], ['tag', 'Wochentag'], ['monat', 'Monat']] as const).map(([k2, t]) => <button key={k2} aria-pressed={gruppe === k2} onClick={() => setGruppe(k2)}>{t}</button>)}
          </div>
          {gr.length === 0 && <div className="leise">Noch keine geschlossenen Trades.</div>}
          {gr.map((x) => (
            <div key={x.schluessel} className="jr-gruppe">
              <span className="jr-gruppe-name">{x.schluessel}</span>
              <span className="jr-gruppe-balken"><i className={x.summe >= 0 ? 'plus' : 'minus'} style={{ width: `${(Math.abs(x.summe) / maxAbs) * 50}%`, [x.summe >= 0 ? 'left' : 'right']: '50%' } as CSSProperties} /></span>
              <span className="tr-zahl jr-gruppe-zahl">{geldModus ? eurText(x.summe) : rText(x.summe, 1)}</span>
              <span className="leise jr-gruppe-n">{x.n}× · Ø {geldModus ? eurOhneVz(x.schnitt) : komma(x.schnitt)}{x.trefferquote !== null ? ` · ${prozent(x.trefferquote)}` : ''}</span>
            </div>
          ))}
        </section>
        <section className="karte in" aria-label="Verteilung">
          <h2 className="karte-titel">{geldModus ? 'Verteilung der Renditen' : 'Verteilung der R'} <small>{geldModus ? 'Schritte à 1 %' : 'Schritte à 0,5 R'}</small></h2>
          <div className="jr-vert" role="img" aria-label={geldModus ? 'Wie viele Trades in welchem Prozent-Bereich endeten' : 'Wie viele Trades in welchem R-Bereich endeten'}>
            {vert.map((v, i) => (
              <div key={i} className="jr-vert-spalte" title={`${randText(v)}: ${v.n} Trades`}>
                <span className="jr-vert-n tr-zahl">{v.n || ''}</span>
                <span className={`jr-vert-balken ${v.bis <= 0 ? 'minus' : 'plus'}`} style={{ height: `${(v.n / maxV) * 100}%`, animationDelay: `${i * 35}ms` }} />
                <span className="jr-vert-x">{randText(v)}</span>
              </div>
            ))}
          </div>
          <h2 className="karte-titel" style={{ marginTop: 18 }}>Live gegen Backtest</h2>
          <div className="jr-vergleich">
            <div><span className="leise">Live</span><b className="tr-zahl">{rText(mittel(live))}</b><small className="leise">{live.length} Trades</small></div>
            <div><span className="leise">Backtest</span><b className="tr-zahl">{rText(mittel(bt))}</b><small className="leise">{bt.length} Trades</small></div>
          </div>
          <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>
            {vg ? (vg.imRahmen ? `Der Unterschied von ${rText(vg.diff)} pro Trade liegt noch im Rahmen des Zufalls.` : `Der Unterschied von ${rText(vg.diff)} pro Trade ist grösser als Zufall – live läuft es ${vg.diff < 0 ? 'schlechter' : 'besser'} als im Backtest.`) : 'Für den Vergleich braucht es je mindestens 2 Live- und Backtest-Trades.'}
            {filter !== 'alle' && ' (Vergleich nutzt alle Trades, unabhängig vom Filter.)'}
          </div>
        </section>
      </div>

      <section className="karte in" aria-label="Monte Carlo">
        <h2 className="karte-titel">
          Was die nächsten 100 Trades bringen können
          <small>Monte Carlo · 5000 Durchläufe</small>
        </h2>
        {!geldModus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="leise" style={{ fontSize: 13 }}>Risiko pro Trade</span>
            <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)', width: 'auto', minWidth: 280 }}>
              {[0.25, 0.5, 1, 1.5, 2].map((r) => <button key={r} aria-pressed={risiko === r} onClick={() => setRisiko(r)}>{komma(r, r % 1 ? 2 : 0).replace(',00', '')} %</button>)}
            </div>
          </div>
        )}
        {!mc ? <div className="leise">{geldModus ? 'Ab 10 Trades mit berechneter Rendite zieht die Zentrale aus deinen echten Renditen zufällige Reihenfolgen und zeigt, welche Drawdowns realistisch sind. Dafür braucht jeder Trade eine Einzahlung davor.' : 'Ab 10 geschlossenen Trades zieht die Zentrale aus deinen echten R-Werten zufällige Reihenfolgen und zeigt, welche Drawdowns realistisch sind.'}</div> : (
          <>
            <div className="jr-kacheln">
              <Kachel titel="Typischer Drawdown" wert={`${komma(mc.ddP.p50, 1)} %`} unter="die Hälfte der Läufe hat weniger" />
              <Kachel titel="Schlechte Phase" wert={`${komma(mc.ddP.p95, 1)} %`} unter="nur 5 % der Läufe sind schlimmer" ton="minus" />
              <Kachel titel="Ergebnis Mitte" wert={`${mc.ergebnisP.p50 >= 0 ? '+' : ''}${komma(mc.ergebnisP.p50, 1)} %`} unter={`5–95 %: ${komma(mc.ergebnisP.p5, 1)} bis ${komma(mc.ergebnisP.p95, 1)} %`} ton={mc.ergebnisP.p50 >= 0 ? 'plus' : 'minus'} />
              <Kachel titel="Verlust nach 100 Trades" wert={prozent(mc.chanceVerlust)} unter="Anteil der Läufe im Minus" />
            </div>
            <div className="jr-chancen">
              {mc.chanceDd.map((c) => (
                <div key={c.grenze}>
                  <span>Drawdown ≥ {c.grenze} %</span>
                  <span className="jr-chance-balken"><i style={{ width: `${c.p * 100}%` }} /></span>
                  <b className="tr-zahl">{prozent(c.p)}</b>
                </div>
              ))}
            </div>
            <div className="leise" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>Prop-Firms erlauben oft 10 % Gesamt-Drawdown. Die Zeile «≥ 10 %» zeigt, wie oft du diese Grenze mit diesem Risiko reissen würdest. Basis: {mcBasis} Trades im aktuellen Filter{geldModus ? ', jeder mit seiner echten Rendite (kein festes Risiko)' : ''}{mcBasis < 30 ? ' – noch wenige, die Zahlen schwanken stark' : ''}.</div>
          </>
        )}
      </section>
    </>
  );
}

// ---------- Trade erfassen / bearbeiten ----------
// Pflicht sind nur Paar, Datum und das Ergebnis in EUR. Alles andere ist freiwillig und steckt unter «Mehr Felder».
type Form = Record<'konto' | 'pair' | 'eroeffnet' | 'geschlossen' | 'entry' | 'sl' | 'tp' | 'exit' | 'lots' | 'risikoEur' | 'ergebnisEur' | 'rManuell' | 'gvaLevel' | 'tags' | 'fehler' | 'notiz' | 'bild', string>
  & { art: JArt; richtung: 'long' | 'short' | ''; tf: '3D' | 'W' | 'M' | ''; gefuehl: number | null; ausgang: JAusgang | 'auto' };

const zuText = (v: number | null) => (v === null || v === undefined ? '' : String(v));
function formAus(t: JTrade | null, d: JournalZustand, kontoVorgabe: string | null): Form {
  const eur = t?.ergebnisEur ?? null;
  return {
    art: t?.art || 'live', richtung: t?.richtung || '', tf: t?.tf || '', gefuehl: t?.gefuehl ?? null,
    // Ein gespeicherter Ausgang gilt nur dann als von Hand gesetzt, wenn er vom automatischen Wert abweicht.
    ausgang: t?.ausgang && eur !== null && t.ausgang !== ausgangAuto(eur) ? t.ausgang : 'auto',
    konto: t?.konto || kontoVorgabe || d.konten[0]?.id || '',
    pair: t?.pair || 'EURUSD', eroeffnet: t?.eroeffnet || heuteIso(), geschlossen: t?.geschlossen || '',
    entry: zuText(t?.entry ?? null), sl: zuText(t?.sl ?? null), tp: zuText(t?.tp ?? null), exit: zuText(t?.exit ?? null),
    lots: zuText(t?.lots ?? null), risikoEur: zuText(t?.risikoEur ?? null), ergebnisEur: zuText(t?.ergebnisEur ?? null), rManuell: zuText(t?.rManuell ?? null),
    gvaLevel: zuText(t?.gvaLevel ?? null), tags: (t?.tags || []).join(', '), fehler: (t?.fehler || []).join(', '), notiz: t?.notiz || '', bild: t?.bild || '',
  };
}
const num = (s: string) => { const x = Number(String(s).replace('−', '-').replace(',', '.').replace(/[\s']/g, '')); return s.trim() === '' || !Number.isFinite(x) ? null : x; };
const hatDetails = (t: JTrade) => t.entry !== null || t.sl !== null || t.tp !== null || t.exit !== null || t.lots !== null || t.risikoEur !== null || t.rManuell !== null || t.gvaLevel !== null
  || !!t.richtung || !!t.tf || !!t.geschlossen || t.gefuehl !== null || t.tags.length > 0 || t.fehler.length > 0 || !!t.notiz || !!t.bild || !!t.bilder?.length;

function TradePopup({ t, d, kontoVorgabe, onNeu, onClose }: { t: JTrade | null; d: JournalZustand; kontoVorgabe: string | null; onNeu: () => void; onClose: (neu: boolean) => void }) {
  const [f, setF] = useState<Form>(() => formAus(t, d, kontoVorgabe));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);
  const [mehr, setMehr] = useState(() => !!t && hatDetails(t));
  const ergebnisRef = useRef<HTMLInputElement>(null);
  const s = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const live = f.art === 'live';
  const detailsOffen = mehr || !live; // Backtests brauchen Entry und Stop-Loss, dort ist alles offen

  const entry = num(f.entry), sl = num(f.sl), tp = num(f.tp), exit = num(f.exit), lots = num(f.lots), risikoEur = num(f.risikoEur), ergebnisEur = num(f.ergebnisEur), rManuell = num(f.rManuell);
  const gueltig = entry !== null && sl !== null && entry !== sl;
  const rr = gueltig && tp !== null ? geplantesRR({ entry: entry!, sl: sl!, tp }) : null;
  const vorschlagRisiko = gueltig && lots !== null ? risikoEurBerechnen(f.pair, entry!, sl!, lots, d.umrechnung) : null;
  const vorschlagLots = gueltig && risikoEur !== null && lots === null ? lotsBerechnen(f.pair, entry!, sl!, risikoEur, d.umrechnung) : null;
  const rVorschau = ergebnisEur !== null && risikoEur ? ergebnisEur / risikoEur : rManuell !== null ? rManuell : exit !== null && gueltig ? rAusKurs({ entry: entry!, sl: sl! }, exit) : null;
  const pipsSl = gueltig ? Math.abs(entry! - sl!) / (f.pair.endsWith('JPY') ? 0.01 : 0.0001) : null;
  const autoAusgang = ergebnisEur !== null ? ausgangAuto(ergebnisEur) : null;
  const effektiv: JAusgang | null = f.ausgang !== 'auto' ? f.ausgang : autoAusgang;
  const kannSpeichern = !!f.pair && !!f.eroeffnet && (ergebnisEur !== null || (entry !== null && sl !== null) || rManuell !== null);

  // Wie viel Prozent dieser Trade vom Kontostand ist (Kontostand = Einzahlungen und frühere Trades dieses Kontos)
  const vorschau = useMemo(() => {
    if (!live || ergebnisEur === null || !f.konto || !f.eroeffnet) return null;
    const virtuell = { id: '__neu__', art: 'live', konto: f.konto, ergebnisEur, eroeffnet: f.eroeffnet, geschlossen: f.geschlossen || null } as JTrade;
    const andere = d.trades.filter((x) => x.art === 'live' && x.ergebnisEur !== null && x.konto === f.konto && x.id !== t?.id);
    const g = geldAuswertung([...andere, virtuell], d.cashflows.filter((c) => c.konto === f.konto));
    return g.alle.find((p) => p.t.id === '__neu__') ?? null;
  }, [live, ergebnisEur, f.konto, f.eroeffnet, f.geschlossen, d, t]);

  async function speichern(weiter = false) {
    setLaeuft(true); setFehler(null); setHinweis(null);
    try {
      await senden('/api/journal/trade', {
        id: t?.id, art: f.art, konto: live ? f.konto : null, ausgang: live ? (f.ausgang !== 'auto' ? f.ausgang : null) : t?.ausgang ?? null, risikoProzent: t?.risikoProzent ?? null, skipGrund: t?.skipGrund ?? '',
        pair: f.pair, richtung: f.richtung || null, tf: f.tf || null, gefuehl: f.gefuehl,
        eroeffnet: f.eroeffnet, geschlossen: f.geschlossen || null,
        entry, sl, tp, exit, lots, risikoEur, ergebnisEur, rManuell, gvaLevel: num(f.gvaLevel),
        tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), fehler: f.fehler.split(',').map((x) => x.trim()).filter(Boolean),
        notiz: f.notiz, bild: f.bild.trim(), bilder: t?.bilder || [], session: t?.session || null,
      });
      if (weiter) {
        // Formular leeren, Konto, Art, Datum und Paar bleiben für den nächsten Trade stehen.
        onNeu();
        setF({ ...formAus(null, d, f.konto), art: f.art, konto: f.konto, eroeffnet: f.eroeffnet, pair: f.pair });
        setMehr(false); setLoeschen(false); setLaeuft(false);
        setHinweis(`${f.pair} ${ergebnisEur !== null ? eurText(ergebnisEur) : ''} gespeichert. Nächster Trade:`);
        setTimeout(() => ergebnisRef.current?.focus(), 0);
      } else onClose(true);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }
  async function weg() {
    setLaeuft(true);
    try { await senden('/api/journal/trade', { id: t!.id }, 'DELETE'); onClose(true); }
    catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  return (
    <Popup titel={t ? `${t.pair}${t.richtung ? (t.richtung === 'long' ? ' Long' : ' Short') : ''}` : 'Trade erfassen'} unter={t ? `eröffnet ${datumKurz(t.eroeffnet)}` : 'Pflicht: Paar, Datum und Ergebnis in EUR'} onClose={() => onClose(false)} breit>
      <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 280 }}>
        <button aria-pressed={f.art === 'live'} onClick={() => s('art', 'live')}>Live</button>
        <button aria-pressed={f.art === 'backtest'} onClick={() => s('art', 'backtest')}>Backtest</button>
      </div>
      {hinweis && <div className="jr-hinweis">{hinweis}</div>}
      <div className="jr-felder">
        {live && d.konten.length > 1 && <label className="nw-feld">Konto<select value={f.konto} onChange={(e) => s('konto', e.target.value)}>{d.konten.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label className="nw-feld">Paar<select value={f.pair} onChange={(e) => s('pair', e.target.value)}>{d.paare.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="nw-feld">Datum<input type={f.eroeffnet.length > 10 ? 'datetime-local' : 'date'} value={f.eroeffnet} onChange={(e) => s('eroeffnet', e.target.value)} /></label>
        {live && <label className="nw-feld">Ergebnis in EUR (Gewinn +, Verlust −)<input ref={ergebnisRef} inputMode="decimal" value={f.ergebnisEur} onChange={(e) => s('ergebnisEur', e.target.value)} placeholder="z. B. 10 oder −4,50" /></label>}
      </div>

      {live && (
        <>
          <div className="nw-feld">Ausgang
            <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <button type="button" aria-pressed={f.ausgang === 'auto'} onClick={() => s('ausgang', 'auto')}>Auto</button>
              {(['tp', 'sl', 'be', 'trail'] as const).map((x) => <button key={x} type="button" aria-pressed={f.ausgang === x} onClick={() => s('ausgang', x)}>{AUSGANG_TEXT[x]}</button>)}
            </div>
            <small className="tr-hilfe">Auto: Plus gilt als Take-Profit, Minus als Stop-Loss, genau 0 als Break-Even. Ändere es, wenn es anders war, zum Beispiel Break-Even bei +5 € oder SL in den Profit gezogen.</small>
          </div>
          <div className="jr-info">
            <span>Gewertet als: <b>{effektiv ? AUSGANG_TEXT[effektiv] : '—'}</b></span>
            <span>Rendite: <b className="tr-zahl">{vorschau === null ? '—' : vorschau.prozent === null ? 'Kontostand fehlt' : pText(vorschau.prozent)}</b>{vorschau && vorschau.vorher !== null ? <span className="leise"> von {eurOhneVz(vorschau.vorher)}</span> : null}</span>
          </div>
          {vorschau && vorschau.prozent === null && <div className="jr-hinweis">Vor diesem Datum ist noch keine Einzahlung eingetragen. Trage sie im Zahnrad (Ein- und Auszahlungen) ein, dann rechnet die Zentrale die Rendite in %.</div>}
        </>
      )}

      {live && <button type="button" className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={() => setMehr(!mehr)}>{mehr ? 'Weniger' : 'Mehr Felder (alles freiwillig)'}</button>}

      {detailsOffen && (
        <>
          <h4 className="nw-h">Details{live ? ' (freiwillig)' : ''}</h4>
          <div className="jr-form-reihe">
            <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {([['', 'keine'], ['long', '▲ Long'], ['short', '▼ Short']] as const).map(([x, text]) => <button key={x || 'keine'} aria-pressed={f.richtung === x} onClick={() => s('richtung', x)}>{text}</button>)}
            </div>
            <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {(['3D', 'W', 'M', ''] as const).map((x) => <button key={x || 'ohne'} aria-pressed={f.tf === x} onClick={() => s('tf', x)}>{x || 'ohne'}</button>)}
            </div>
          </div>
          <div className="jr-felder">
            <label className="nw-feld">Entry<input inputMode="decimal" value={f.entry} onChange={(e) => s('entry', e.target.value)} placeholder="1.08450" /></label>
            <label className="nw-feld">Stop-Loss (beim Einstieg)<input inputMode="decimal" value={f.sl} onChange={(e) => s('sl', e.target.value)} placeholder={f.richtung === 'short' ? 'über Entry' : 'unter Entry'} /></label>
            <label className="nw-feld">Take-Profit<input inputMode="decimal" value={f.tp} onChange={(e) => s('tp', e.target.value)} /></label>
            <label className="nw-feld">Lots<input inputMode="decimal" value={f.lots} onChange={(e) => s('lots', e.target.value)} placeholder={vorschlagLots ? `≈ ${vorschlagLots.toFixed(2)}` : '0.10'} /></label>
            <label className="nw-feld">Risiko in EUR
              <input inputMode="decimal" value={f.risikoEur} onChange={(e) => s('risikoEur', e.target.value)} placeholder={vorschlagRisiko ? `≈ ${vorschlagRisiko.toFixed(2)}` : 'Verlust bei SL'} />
              {vorschlagRisiko !== null && risikoEur === null && <button type="button" className="jr-vorschlag" onClick={() => s('risikoEur', vorschlagRisiko.toFixed(2))}>≈ {vorschlagRisiko.toFixed(2)} € übernehmen (aus Lots und Stop, heutiger Kurs)</button>}
            </label>
            <div className="jr-info">
              <span>Stop: <b className="tr-zahl">{pipsSl !== null ? komma(pipsSl, 1) : '—'}</b> Pips</span>
              <span>Geplant: <b className="tr-zahl">{rr !== null ? `${komma(rr, 1)} R` : '—'}</b></span>
            </div>
          </div>
          <div className="jr-felder">
            <label className="nw-feld">Geschlossen<input type="datetime-local" value={f.geschlossen.length === 10 ? f.geschlossen + 'T00:00' : f.geschlossen} onChange={(e) => s('geschlossen', e.target.value)} /></label>
            <label className="nw-feld">Ausstieg (Ø-Kurs)<input inputMode="decimal" value={f.exit} onChange={(e) => s('exit', e.target.value)} /></label>
            <label className="nw-feld">R von Hand (nur wenn nötig)<input inputMode="decimal" value={f.rManuell} onChange={(e) => s('rManuell', e.target.value)} /></label>
            <div className="jr-info jr-r-vorschau">
              <span>Ergebnis in R</span>
              <b className={`tr-zahl ${rVorschau !== null && rVorschau > 0 ? 'jr-plus' : rVorschau !== null && rVorschau < 0 ? 'jr-minus' : ''}`}>{rVorschau !== null ? rText(rVorschau) : live ? '—' : 'offen'}</b>
              <small className="leise">{ergebnisEur !== null && risikoEur ? 'EUR ÷ Risiko' : rManuell !== null ? 'R von Hand' : exit !== null ? 'aus Ausstiegskurs' : ''}</small>
            </div>
          </div>

          <h4 className="nw-h">Notizen</h4>
          <div className="nw-feld">Gefühl beim Trade (1 = angespannt, 5 = ruhig)
            <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {[1, 2, 3, 4, 5].map((g) => <button key={g} aria-pressed={f.gefuehl === g} onClick={() => s('gefuehl', f.gefuehl === g ? null : g)}>{g}</button>)}
            </div>
          </div>
          <div className="jr-felder">
            <label className="nw-feld">Tags (mit Komma)<input value={f.tags} onChange={(e) => s('tags', e.target.value)} placeholder="BOS, Fib 0.618, London" /></label>
            <label className="nw-feld">Fehler (mit Komma)<input value={f.fehler} onChange={(e) => s('fehler', e.target.value)} placeholder="zu früh raus, SL verschoben" /></label>
          </div>
          <label className="nw-feld">Notiz<textarea rows={3} value={f.notiz} onChange={(e) => s('notiz', e.target.value)} className="jr-text" /></label>
          <label className="nw-feld">Screenshot-Link (TradingView)<input value={f.bild} onChange={(e) => s('bild', e.target.value)} placeholder="https://www.tradingview.com/x/…" /></label>
          {t?.bild && <a href={t.bild} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Screenshot öffnen ↗</a>}
          {!!t?.bilder?.length && (
            <div className="bt-bilder">
              {t.bilder.map((b) => <a key={b} href={`/api/journal/bild/${b}`} target="_blank" rel="noreferrer"><img src={`/api/journal/bild/${b}`} alt="Screenshot aus der Backtest-Session" loading="lazy" /></a>)}
            </div>
          )}
          <label className="nw-feld">Level der GVA-Linie<input inputMode="decimal" value={f.gvaLevel} onChange={(e) => s('gvaLevel', e.target.value)} /></label>
        </>
      )}

      {fehler && <div className="fehlerbox">{fehler}</div>}
      {!kannSpeichern && <div className="leise" style={{ fontSize: 12.5 }}>{live ? 'Zum Speichern fehlt noch das Ergebnis in EUR.' : 'Zum Speichern fehlen Entry und Stop-Loss (oder R von Hand).'}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="knopf-klein press tr-primaer" onClick={() => speichern(false)} disabled={laeuft || !kannSpeichern}>{laeuft ? 'Speichere …' : 'Speichern'}</button>
        {!t && <button className="knopf-klein press" onClick={() => speichern(true)} disabled={laeuft || !kannSpeichern}>Speichern und nächster Trade</button>}
        {t && !loeschen && <button className="knopf-klein press" onClick={() => setLoeschen(true)}>Löschen</button>}
        {t && loeschen && <button className="knopf-klein press" style={{ background: 'var(--fehler)', color: '#fff' }} onClick={weg} disabled={laeuft}>Wirklich löschen</button>}
      </div>
    </Popup>
  );
}
