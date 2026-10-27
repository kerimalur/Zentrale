'use client';
// Trading-Journal: Trades von Hand erfassen, alles in R auswerten (Kennzahlen, Kapitalkurve, Kalender, Aufschlüsselung,
// Verteilung, Backtest gegen live, Monte Carlo). Rechnungen in lib/journal.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { holen, senden } from '@/lib/api';
import {
  WOCHENTAGE, eurText, geplantesRR, geschlosseneTrades, gruppieren, istGeschlossen, kennzahlen, lotsBerechnen, monteCarlo, prozent,
  rAusKurs, rText, rVon, risikoEurBerechnen, vergleich, verteilung, wochentag,
  type JArt, type JEinstellungen, type JGeschlossen, type JTrade, type JournalZustand,
} from '@/lib/journal';
import { Icon } from './ui';
import { Popup } from './NetzBausteine';

type Filter = 'alle' | JArt;
type Zeitraum = 'alles' | 'jahr' | '90' | '30';
const ZEITRAUM_TEXT: Record<Zeitraum, string> = { alles: 'Alles', jahr: 'Dieses Jahr', '90': '90 Tage', '30': '30 Tage' };

const komma = (x: number | null | undefined, st = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(st).replace('.', ','));
const datumKurz = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j.slice(2)}`; };
const heuteIso = () => new Date().toLocaleDateString('sv-SE');
const jetztLokal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

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
  const [einheit, setEinheit] = useState<'r' | 'eur'>('r');
  const [gruppe, setGruppe] = useState<'pair' | 'richtung' | 'tf' | 'tag' | 'monat'>('pair');

  const laden = useCallback(async () => {
    try { setD(await holen<JournalZustand>('/api/journal')); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const gefiltert = useMemo(() => {
    if (!d) return [];
    const ab = zeitraum === 'alles' ? '' : zeitraum === 'jahr' ? `${new Date().getFullYear()}-01-01` : new Date(Date.now() - Number(zeitraum) * 86400_000).toLocaleDateString('sv-SE');
    return d.trades.filter((t) => (filter === 'alle' || t.art === filter) && (t.geschlossen || t.eroeffnet).slice(0, 10) >= ab);
  }, [d, filter, zeitraum]);
  const geschl = useMemo(() => geschlosseneTrades(gefiltert), [gefiltert]);
  const k = useMemo(() => (d ? kennzahlen(geschl, d.einstellungen) : null), [geschl, d]);
  const offen = gefiltert.filter((t) => !istGeschlossen(t));

  if (fehler && !d) return <div className="karte fehlerbox">Journal nicht ladbar: {fehler}</div>;
  if (!d || !k) return <div className="karte leise">Lade …</div>;

  const leer = d.trades.length === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in jr-leiste" aria-label="Filter">
        <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)', width: 'auto', minWidth: 230 }}>
          {(['alle', 'live', 'backtest'] as Filter[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'alle' ? 'Alle' : f === 'live' ? 'Live' : 'Backtest'}</button>)}
        </div>
        <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)', width: 'auto', minWidth: 300 }}>
          {(Object.keys(ZEITRAUM_TEXT) as Zeitraum[]).map((z) => <button key={z} aria-pressed={zeitraum === z} onClick={() => setZeitraum(z)}>{ZEITRAUM_TEXT[z]}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <button className="knopf-klein press tr-primaer" onClick={() => setTrade('neu')}>+ Trade erfassen</button>
        <button className="icon-knopf press" style={{ background: 'var(--bg)' }} onClick={() => setEinst(true)} aria-label="Journal-Einstellungen" title="Einstellungen"><Icon name="zahnrad" size={19} /></button>
      </section>

      {leer ? (
        <section className="karte in jr-held" aria-label="Noch keine Trades">
          <h2 style={{ margin: 0, fontSize: 22 }}>Dein Journal ist noch leer</h2>
          <p style={{ margin: '8px 0 16px', opacity: 0.8, maxWidth: 520, lineHeight: 1.5 }}>Trage deine Trades von Hand ein, auch die alten. Alles wird in R gerechnet: 1 R ist das Risiko beim Einstieg. So sind Trades mit verschiedenen Lots und Paaren vergleichbar.</p>
          <button className="knopf-klein press tr-primaer" onClick={() => setTrade('neu')}>+ Ersten Trade erfassen</button>
        </section>
      ) : (
        <>
          <Held k={k} einheit={einheit} setEinheit={setEinheit} e={d.einstellungen} offen={offen.length} />
          <Kacheln k={k} />
          <div className="jr-zwei">
            <Kalender g={geschl} />
            <TradeListe trades={gefiltert} onOpen={setTrade} />
          </div>
          <Auswertung g={geschl} alle={geschlosseneTrades(d.trades)} e={d.einstellungen} gruppe={gruppe} setGruppe={setGruppe} filter={filter} />
        </>
      )}

      {trade && <TradePopup t={trade === 'neu' ? null : trade} d={d} onClose={(neu) => { setTrade(null); if (neu) laden(); }} />}
      {einst && <EinstPopup e={d.einstellungen} onClose={(neu) => { setEinst(false); if (neu) laden(); }} />}
    </div>
  );
}

// ---------- Kapitalkurve ----------
function Held({ k, einheit, setEinheit, e, offen }: { k: ReturnType<typeof kennzahlen>; einheit: 'r' | 'eur'; setEinheit: (x: 'r' | 'eur') => void; e: JEinstellungen; offen: number }) {
  const eurMoeglich = k.kurve.some((p) => p.eur !== null);
  const modus = einheit === 'eur' && eurMoeglich ? 'eur' : 'r';
  const summe = useZaehler(modus === 'r' ? k.summeR : k.summeEur);
  const punkte = k.kurve.map((p) => (modus === 'r' ? p.r : p.eur)).filter((v): v is number => v !== null);
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
          <div className="jr-label">Ergebnis {modus === 'r' ? 'in R' : 'in EUR'} · {k.n} geschlossene Trades{offen ? ` · ${offen} offen` : ''}</div>
          <div className={`jr-gross tr-zahl ${positiv ? 'plus' : 'minus'}`}>{modus === 'r' ? rText(summe) : eurText(summe)}</div>
          {modus === 'eur' && <div className="jr-label">Konto {eurText(e.startkapital + k.summeEur).replace('+', '')} (Start {e.startkapital.toLocaleString('de-CH')} €)</div>}
        </div>
        <div className="segment jr-segment-dunkel" style={{ gridTemplateColumns: '1fr 1fr', width: 'auto', minWidth: 120 }}>
          <button aria-pressed={modus === 'r'} onClick={() => setEinheit('r')}>R</button>
          <button aria-pressed={modus === 'eur'} onClick={() => setEinheit('eur')} disabled={!eurMoeglich} title={eurMoeglich ? '' : 'Keine EUR-Werte erfasst'}>EUR</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="jr-kurve" role="img" aria-label={`Kapitalkurve ${modus === 'r' ? 'in R' : 'in EUR'}`} preserveAspectRatio="none">
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

function Kacheln({ k }: { k: ReturnType<typeof kennzahlen> }) {
  const erw = useZaehler(k.erwartung);
  const ton = (x: number | null) => (x === null ? undefined : x > 0 ? 'plus' : x < 0 ? 'minus' : undefined);
  const wenig = k.n < 30;
  return (
    <section className="karte in" aria-label="Kennzahlen">
      <h2 className="karte-titel">Kennzahlen <small>{wenig ? `noch wenige Trades (${k.n}) – Bereiche beachten` : `${k.n} Trades`}</small></h2>
      <div className="jr-kacheln">
        <Kachel titel="Erwartungswert" wert={rText(erw)} ton={ton(k.erwartung)} unter={k.erwartungBereich ? `95 %: ${rText(k.erwartungBereich[0])} bis ${rText(k.erwartungBereich[1])}` : 'ab 2 Trades'} />
        <Kachel titel="Trefferquote" wert={prozent(k.trefferquote)} unter={`${k.gewinner} G · ${k.verlierer} V · ${k.be} BE${k.trefferBereich ? ` · 95 %: ${prozent(k.trefferBereich[0])}–${prozent(k.trefferBereich[1])}` : ''}`} />
        <Kachel titel="Profit-Faktor" wert={k.profitFaktor === Infinity ? '∞' : komma(k.profitFaktor)} unter="Gewinne in R / Verluste in R" ton={k.profitFaktor === null ? undefined : k.profitFaktor >= 1 ? 'plus' : 'minus'} />
        <Kachel titel="Ø Gewinner / Verlierer" wert={`${rText(k.schnittGewinn, 1)} / ${rText(k.schnittVerlust, 1)}`} unter={k.geplantRR !== null ? `geplant Ø ${komma(k.geplantRR, 1)} R (mit TP)` : 'mit TP siehst du das geplante RR'} />
        <Kachel titel="Max. Drawdown" wert={`−${komma(k.maxDdR, 1)} R`} unter={k.maxDdProzent !== null ? `${prozent(k.maxDdProzent, 1)} vom Höchststand` : 'in % sobald EUR erfasst'} ton={k.maxDdR > 0 ? 'minus' : undefined} />
        <Kachel titel="Serien" wert={`${k.verlustSerie} V · ${k.gewinnSerie} G`} unter="längste Verlust- / Gewinnserie" />
        <Kachel titel="SQN" wert={komma(k.sqn)} unter={k.sqn === null ? 'ab 2 Trades' : k.sqn < 1.6 ? 'schwach (< 1,6)' : k.sqn < 2 ? 'durchschnittlich' : k.sqn < 3 ? 'gut' : 'sehr gut'} />
        <Kachel titel="Summe EUR" wert={eurText(k.summeEur)} ton={ton(k.summeEur)} unter={k.eurVollstaendig ? 'alle Trades mit EUR' : 'nicht alle Trades haben EUR'} />
      </div>
    </section>
  );
}

// ---------- Kalender ----------
function Kalender({ g }: { g: JGeschlossen[] }) {
  const [monat, setMonat] = useState(() => heuteIso().slice(0, 7));
  const proTag = useMemo(() => {
    const m = new Map<string, { r: number; n: number }>();
    for (const x of g) { const a = m.get(x.datum) || { r: 0, n: 0 }; a.r += x.r; a.n++; m.set(x.datum, a); }
    return m;
  }, [g]);
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
        <small className={`tr-zahl ${monatR > 0 ? 'jr-plus' : monatR < 0 ? 'jr-minus' : ''}`}>{rText(monatR, 1)}</small>
      </h2>
      <div className="jr-kal">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <div key={w} className="jr-kal-kopf">{w}</div>)}
        {Array.from({ length: versatz }, (_, i) => <div key={'l' + i} />)}
        {Array.from({ length: tage }, (_, i) => {
          const tag = `${monat}-${String(i + 1).padStart(2, '0')}`;
          const v = proTag.get(tag);
          const h = v ? 0.15 + 0.7 * Math.min(1, Math.abs(v.r) / maxAbs) : 0;
          return (
            <div key={tag} className="jr-kal-tag" style={{ background: v ? `rgba(${v.r >= 0 ? '21,128,61' : '180,35,24'},${h})` : undefined, color: v && h > 0.5 ? '#fff' : undefined, animationDelay: `${i * 12}ms` }} title={v ? `${datumKurz(tag)}: ${rText(v.r)} aus ${v.n} Trade(s)` : datumKurz(tag)}>
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
function TradeListe({ trades, onOpen }: { trades: JTrade[]; onOpen: (t: JTrade) => void }) {
  const [alle, setAlle] = useState(false);
  const sortiert = [...trades].sort((a, b) => {
    const oa = istGeschlossen(a) ? 1 : 0, ob = istGeschlossen(b) ? 1 : 0;
    if (oa !== ob) return oa - ob; // offene zuerst
    return (b.geschlossen || b.eroeffnet) < (a.geschlossen || a.eroeffnet) ? -1 : 1;
  });
  const sicht = alle ? sortiert : sortiert.slice(0, 12);
  return (
    <section className="karte in" aria-label="Trades">
      <h2 className="karte-titel">Trades <small>{trades.length}</small></h2>
      {sicht.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Keine Trades in diesem Filter.</div>}
      {sicht.map((t) => {
        const { r } = rVon(t);
        return (
          <button key={t.id} className="zeile press nw-zeile" onClick={() => onOpen(t)} style={{ width: '100%', background: 'transparent', textAlign: 'left' }}>
            <span className={`jr-richtung ${t.richtung}`}>{t.richtung === 'long' ? '▲' : '▼'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{t.pair}</b> <span className="leise" style={{ fontSize: 12 }}>{t.tf ? `${t.tf} · ` : ''}{t.art === 'backtest' ? 'Backtest' : 'Live'}</span>
              <div className="leise" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{datumKurz(t.eroeffnet)}{t.tags.length ? ` · ${t.tags.join(', ')}` : ''}</div>
            </span>
            {r === null ? <span className="pille tr-pille-aus">offen</span> : <b className={`tr-zahl ${r > 0 ? 'jr-plus' : r < 0 ? 'jr-minus' : ''}`}>{rText(r)}</b>}
          </button>
        );
      })}
      {sortiert.length > 12 && <button className="knopf-klein press" style={{ marginTop: 8 }} onClick={() => setAlle(!alle)}>{alle ? 'Weniger zeigen' : `Alle ${sortiert.length} zeigen`}</button>}
    </section>
  );
}

// ---------- Auswertung ----------
function Auswertung({ g, alle, e, gruppe, setGruppe, filter }: { g: JGeschlossen[]; alle: JGeschlossen[]; e: JEinstellungen; gruppe: 'pair' | 'richtung' | 'tf' | 'tag' | 'monat'; setGruppe: (x: 'pair' | 'richtung' | 'tf' | 'tag' | 'monat') => void; filter: Filter }) {
  const fn: Record<typeof gruppe, (x: JGeschlossen) => string | null> = {
    pair: (x) => x.t.pair,
    richtung: (x) => (x.t.richtung === 'long' ? 'Long' : 'Short'),
    tf: (x) => x.t.tf || 'ohne',
    tag: (x) => wochentag(x.t.eroeffnet),
    monat: (x) => x.datum.slice(0, 7),
  };
  let gr = gruppieren(g, fn[gruppe], e.beSchwelle);
  if (gruppe === 'tag') gr = gr.sort((a, b) => ((WOCHENTAGE.indexOf(a.schluessel) + 6) % 7) - ((WOCHENTAGE.indexOf(b.schluessel) + 6) % 7));
  if (gruppe === 'monat') gr = gr.sort((a, b) => (a.schluessel < b.schluessel ? 1 : -1));
  const maxAbs = Math.max(0.0001, ...gr.map((x) => Math.abs(x.summeR)));
  const vert = verteilung(g.map((x) => x.r));
  const maxV = Math.max(1, ...vert.map((v) => v.n));
  const [risiko, setRisiko] = useState(e.risikoProzent);
  const mc = useMemo(() => monteCarlo(g.map((x) => x.r), risiko), [g, risiko]);
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
              <span className="jr-gruppe-balken"><i className={x.summeR >= 0 ? 'plus' : 'minus'} style={{ width: `${(Math.abs(x.summeR) / maxAbs) * 50}%`, [x.summeR >= 0 ? 'left' : 'right']: '50%' } as CSSProperties} /></span>
              <span className="tr-zahl jr-gruppe-zahl">{rText(x.summeR, 1)}</span>
              <span className="leise jr-gruppe-n">{x.n}× · Ø {komma(x.erwartung)}{x.trefferquote !== null ? ` · ${prozent(x.trefferquote)}` : ''}</span>
            </div>
          ))}
        </section>
        <section className="karte in" aria-label="Verteilung">
          <h2 className="karte-titel">Verteilung der R <small>Schritte à 0,5 R</small></h2>
          <div className="jr-vert" role="img" aria-label="Wie viele Trades in welchem R-Bereich endeten">
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="leise" style={{ fontSize: 13 }}>Risiko pro Trade</span>
          <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)', width: 'auto', minWidth: 280 }}>
            {[0.25, 0.5, 1, 1.5, 2].map((r) => <button key={r} aria-pressed={risiko === r} onClick={() => setRisiko(r)}>{komma(r, r % 1 ? 2 : 0).replace(',00', '')} %</button>)}
          </div>
        </div>
        {!mc ? <div className="leise">Ab 10 geschlossenen Trades zieht die Zentrale aus deinen echten R-Werten zufällige Reihenfolgen und zeigt, welche Drawdowns realistisch sind.</div> : (
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
            <div className="leise" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>Prop-Firms erlauben oft 10 % Gesamt-Drawdown. Die Zeile «≥ 10 %» zeigt, wie oft du diese Grenze mit diesem Risiko reissen würdest. Basis: {g.length} Trades im aktuellen Filter{g.length < 30 ? ' – noch wenige, die Zahlen schwanken stark' : ''}.</div>
          </>
        )}
      </section>
    </>
  );
}

// ---------- Trade erfassen / bearbeiten ----------
type Form = Record<'pair' | 'eroeffnet' | 'geschlossen' | 'entry' | 'sl' | 'tp' | 'exit' | 'lots' | 'risikoEur' | 'ergebnisEur' | 'rManuell' | 'gvaLevel' | 'tags' | 'fehler' | 'notiz' | 'bild', string>
  & { art: JArt; richtung: 'long' | 'short'; tf: '3D' | 'W' | 'M' | ''; gefuehl: number | null };

const zuText = (v: number | null) => (v === null || v === undefined ? '' : String(v));
function formAus(t: JTrade | null): Form {
  return {
    art: t?.art || 'live', richtung: t?.richtung || 'long', tf: t?.tf || '', gefuehl: t?.gefuehl ?? null,
    pair: t?.pair || 'EURUSD', eroeffnet: t?.eroeffnet || jetztLokal(), geschlossen: t?.geschlossen || '',
    entry: zuText(t?.entry ?? null), sl: zuText(t?.sl ?? null), tp: zuText(t?.tp ?? null), exit: zuText(t?.exit ?? null),
    lots: zuText(t?.lots ?? null), risikoEur: zuText(t?.risikoEur ?? null), ergebnisEur: zuText(t?.ergebnisEur ?? null), rManuell: zuText(t?.rManuell ?? null),
    gvaLevel: zuText(t?.gvaLevel ?? null), tags: (t?.tags || []).join(', '), fehler: (t?.fehler || []).join(', '), notiz: t?.notiz || '', bild: t?.bild || '',
  };
}
const num = (s: string) => { const x = Number(String(s).replace(',', '.').trim()); return s.trim() === '' || !Number.isFinite(x) ? null : x; };

function TradePopup({ t, d, onClose }: { t: JTrade | null; d: JournalZustand; onClose: (neu: boolean) => void }) {
  const [f, setF] = useState<Form>(() => formAus(t));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);
  const [mehr, setMehr] = useState(!!(t && (t.rManuell !== null || t.gvaLevel !== null)));
  const s = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const entry = num(f.entry), sl = num(f.sl), tp = num(f.tp), exit = num(f.exit), lots = num(f.lots), risikoEur = num(f.risikoEur), ergebnisEur = num(f.ergebnisEur), rManuell = num(f.rManuell);
  const gueltig = entry !== null && sl !== null && entry !== sl;
  const rr = gueltig && tp !== null ? geplantesRR({ entry: entry!, sl: sl!, tp }) : null;
  const vorschlagRisiko = gueltig && lots !== null ? risikoEurBerechnen(f.pair, entry!, sl!, lots, d.umrechnung) : null;
  const vorschlagLots = gueltig && risikoEur !== null && lots === null ? lotsBerechnen(f.pair, entry!, sl!, risikoEur, d.umrechnung) : null;
  const rVorschau = ergebnisEur !== null && risikoEur ? ergebnisEur / risikoEur : rManuell !== null ? rManuell : exit !== null && gueltig ? rAusKurs({ entry: entry!, sl: sl! }, exit) : null;
  const pipsSl = gueltig ? Math.abs(entry! - sl!) / (f.pair.endsWith('JPY') ? 0.01 : 0.0001) : null;

  async function speichern() {
    setLaeuft(true); setFehler(null);
    try {
      await senden('/api/journal/trade', {
        id: t?.id, art: f.art, pair: f.pair, richtung: f.richtung, tf: f.tf || null, gefuehl: f.gefuehl,
        eroeffnet: f.eroeffnet, geschlossen: f.geschlossen || null,
        entry, sl, tp, exit, lots, risikoEur, ergebnisEur, rManuell, gvaLevel: num(f.gvaLevel),
        tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), fehler: f.fehler.split(',').map((x) => x.trim()).filter(Boolean),
        notiz: f.notiz, bild: f.bild.trim(),
      });
      onClose(true);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }
  async function weg() {
    setLaeuft(true);
    try { await senden('/api/journal/trade', { id: t!.id }, 'DELETE'); onClose(true); }
    catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  return (
    <Popup titel={t ? `${t.pair} ${t.richtung === 'long' ? 'Long' : 'Short'}` : 'Trade erfassen'} unter={t ? `eröffnet ${datumKurz(t.eroeffnet)}` : 'Pflicht: Paar, Richtung, Datum, Entry, Stop-Loss'} onClose={() => onClose(false)} breit>
      <div className="jr-form-reihe">
        <div className="segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button aria-pressed={f.art === 'live'} onClick={() => s('art', 'live')}>Live</button>
          <button aria-pressed={f.art === 'backtest'} onClick={() => s('art', 'backtest')}>Backtest</button>
        </div>
        <div className="segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button aria-pressed={f.richtung === 'long'} onClick={() => s('richtung', 'long')}>▲ Long</button>
          <button aria-pressed={f.richtung === 'short'} onClick={() => s('richtung', 'short')}>▼ Short</button>
        </div>
        <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {(['3D', 'W', 'M', ''] as const).map((x) => <button key={x || 'ohne'} aria-pressed={f.tf === x} onClick={() => s('tf', x)}>{x || 'ohne'}</button>)}
        </div>
      </div>
      <div className="jr-felder">
        <label className="nw-feld">Paar<select value={f.pair} onChange={(e) => s('pair', e.target.value)}>{d.paare.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="nw-feld">Eröffnet<input type="datetime-local" value={f.eroeffnet.length === 10 ? f.eroeffnet + 'T00:00' : f.eroeffnet} onChange={(e) => s('eroeffnet', e.target.value)} /></label>
        <label className="nw-feld">Entry<input inputMode="decimal" value={f.entry} onChange={(e) => s('entry', e.target.value)} placeholder="1.08450" /></label>
        <label className="nw-feld">Stop-Loss (beim Einstieg)<input inputMode="decimal" value={f.sl} onChange={(e) => s('sl', e.target.value)} placeholder={f.richtung === 'long' ? 'unter Entry' : 'über Entry'} /></label>
        <label className="nw-feld">Take-Profit (optional)<input inputMode="decimal" value={f.tp} onChange={(e) => s('tp', e.target.value)} /></label>
        <label className="nw-feld">Lots (optional)<input inputMode="decimal" value={f.lots} onChange={(e) => s('lots', e.target.value)} placeholder={vorschlagLots ? `≈ ${vorschlagLots.toFixed(2)}` : '0.10'} /></label>
        <label className="nw-feld">Risiko in EUR
          <input inputMode="decimal" value={f.risikoEur} onChange={(e) => s('risikoEur', e.target.value)} placeholder={vorschlagRisiko ? `≈ ${vorschlagRisiko.toFixed(2)}` : 'Verlust bei SL'} />
          {vorschlagRisiko !== null && risikoEur === null && <button type="button" className="jr-vorschlag" onClick={() => s('risikoEur', vorschlagRisiko.toFixed(2))}>≈ {vorschlagRisiko.toFixed(2)} € übernehmen (aus Lots und Stop, heutiger Kurs)</button>}
        </label>
        <div className="jr-info">
          <span>Stop: <b className="tr-zahl">{pipsSl !== null ? komma(pipsSl, 1) : '—'}</b> Pips</span>
          <span>Geplant: <b className="tr-zahl">{rr !== null ? `${komma(rr, 1)} R` : '—'}</b></span>
          {risikoEur && (d.einstellungen.startkapital > 0) ? <span>Risiko: <b className="tr-zahl">{prozent(risikoEur / d.einstellungen.startkapital, 2)}</b> vom Start</span> : null}
        </div>
      </div>

      <h4 className="nw-h">Ergebnis (leer lassen, solange offen)</h4>
      <div className="jr-felder">
        <label className="nw-feld">Geschlossen<input type="datetime-local" value={f.geschlossen.length === 10 ? f.geschlossen + 'T00:00' : f.geschlossen} onChange={(e) => s('geschlossen', e.target.value)} /></label>
        <label className="nw-feld">Ausstieg (Ø-Kurs)<input inputMode="decimal" value={f.exit} onChange={(e) => s('exit', e.target.value)} /></label>
        <label className="nw-feld">Ergebnis in EUR (vom Broker)<input inputMode="decimal" value={f.ergebnisEur} onChange={(e) => s('ergebnisEur', e.target.value)} placeholder="z. B. −48.20" /></label>
        <div className="jr-info jr-r-vorschau">
          <span>Ergebnis</span>
          <b className={`tr-zahl ${rVorschau !== null && rVorschau > 0 ? 'jr-plus' : rVorschau !== null && rVorschau < 0 ? 'jr-minus' : ''}`}>{rVorschau !== null ? rText(rVorschau) : 'offen'}</b>
          <small className="leise">{ergebnisEur !== null && risikoEur ? 'EUR ÷ Risiko' : rManuell !== null ? 'R von Hand' : exit !== null ? 'aus Ausstiegskurs' : ''}</small>
        </div>
      </div>
      <div className="leise" style={{ fontSize: 12, lineHeight: 1.5 }}>R = Ergebnis in EUR ÷ Risiko in EUR (genaueste Variante, enthält Kosten und Teilschliessungen). Ohne EUR rechnet die Zentrale aus dem Ausstiegskurs.</div>

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

      <button type="button" className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={() => setMehr(!mehr)}>{mehr ? 'Weniger' : 'Mehr Felder'}</button>
      {mehr && (
        <div className="jr-felder">
          <label className="nw-feld">R von Hand (nur wenn nötig)<input inputMode="decimal" value={f.rManuell} onChange={(e) => s('rManuell', e.target.value)} /></label>
          <label className="nw-feld">Level der GVA-Linie<input inputMode="decimal" value={f.gvaLevel} onChange={(e) => s('gvaLevel', e.target.value)} /></label>
        </div>
      )}

      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="knopf-klein press tr-primaer" onClick={speichern} disabled={laeuft}>{laeuft ? 'Speichere …' : 'Speichern'}</button>
        {t && !loeschen && <button className="knopf-klein press" onClick={() => setLoeschen(true)}>Löschen</button>}
        {t && loeschen && <button className="knopf-klein press" style={{ background: 'var(--fehler)', color: '#fff' }} onClick={weg} disabled={laeuft}>Wirklich löschen</button>}
      </div>
    </Popup>
  );
}

function EinstPopup({ e, onClose }: { e: JEinstellungen; onClose: (neu: boolean) => void }) {
  const [start, setStart] = useState(String(e.startkapital));
  const [be, setBe] = useState(String(e.beSchwelle));
  const [risiko, setRisiko] = useState(String(e.risikoProzent));
  const [fehler, setFehler] = useState<string | null>(null);
  async function speichern() {
    try { await senden('/api/journal/einstellungen', { startkapital: num(start), beSchwelle: num(be), risikoProzent: num(risiko) }); onClose(true); }
    catch (err) { setFehler((err as Error).message); }
  }
  return (
    <Popup titel="Journal-Einstellungen" unter="Konto in EUR" onClose={() => onClose(false)}>
      <label className="nw-feld">Startkapital (EUR)<input inputMode="decimal" value={start} onChange={(x) => setStart(x.target.value)} /><small className="tr-hilfe">Basis für die Kapitalkurve in EUR und den Drawdown in %.</small></label>
      <label className="nw-feld">Breakeven bis ± R<input inputMode="decimal" value={be} onChange={(x) => setBe(x.target.value)} /><small className="tr-hilfe">Trades zwischen −{be || '0,1'} und +{be || '0,1'} R zählen als Breakeven, nicht als Gewinn oder Verlust.</small></label>
      <label className="nw-feld">Risiko pro Trade (%)<input inputMode="decimal" value={risiko} onChange={(x) => setRisiko(x.target.value)} /><small className="tr-hilfe">Startwert für die Monte-Carlo-Rechnung.</small></label>
      <div className="leise" style={{ fontSize: 12.5 }}>Die Regel-Checkliste kommt dazu, sobald du die Punkte festgelegt hast.</div>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      <button className="knopf-klein press tr-primaer" style={{ alignSelf: 'flex-start' }} onClick={speichern}>Speichern</button>
    </Popup>
  );
}
