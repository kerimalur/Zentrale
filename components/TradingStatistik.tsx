'use client';
// Trading → Statistik: Wie reagiert der Preis beim ersten Treffer einer GVA-Linie? Alles einstellbar und filterbar.
import { useEffect, useRef, useState } from 'react';
import { senden } from '@/lib/api';
import { ART_FARBE, ART_TEXT, einheitText, kz, pz, type GBeispiel, type GEreignis, type GFilter, type GGruppe, type GParameter, type GStatistik } from '@/lib/gvaStatistik';
import { datumCh, kurs, type DatenStand } from '@/lib/trading';
import { Schalter } from './ui';
import { Popup } from './NetzBausteine';

const WAEHRUNGEN = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
const PAARE: string[] = [];
for (let i = 0; i < WAEHRUNGEN.length; i++) for (let j = i + 1; j < WAEHRUNGEN.length; j++) PAARE.push(WAEHRUNGEN[i] + WAEHRUNGEN[j]);
const GRUPPEN: { id: keyof GStatistik['gruppen']; text: string }[] = [
  { id: 'tf', text: 'Zeitrahmen' }, { id: 'seite', text: 'Seite' }, { id: 'pair', text: 'Paar' }, { id: 'jahr', text: 'Jahr' }, { id: 'alter', text: 'Alter der Linie' },
  { id: 'konfluenz', text: 'Konfluenz' }, { id: 'trend', text: 'Trend' }, { id: 'sitzung', text: 'Sitzung' }, { id: 'wochentag', text: 'Wochentag' },
];
const LEER: GFilter = { tfs: [], seite: 'beide', paare: [], waehrung: '', vonJahr: null, bisJahr: null, alterMin: null, alterMax: null, konfluenz: 'egal', trend: 'egal', sitzung: 'alle', nurStunden: false };
const zahlOderNull = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

export function TradingStatistik() {
  const [p, setP] = useState<GParameter | null>(null);
  const [f, setF] = useState<GFilter>(() => { try { return { ...LEER, ...JSON.parse(localStorage.getItem('zentrale-gva-filter') || '{}') }; } catch { return LEER; } });
  const [d, setD] = useState<GStatistik | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [varianten, setVarianten] = useState(0);
  const [gruppe, setGruppe] = useState<keyof GStatistik['gruppen']>('tf');
  const [beispielId, setBeispielId] = useState<string | null>(null);
  const [liste, setListe] = useState<{ sortierung: string; art: string }>({ sortierung: 'neu', art: 'alle' });
  const [eintraege, setEintraege] = useState<GEreignis[]>([]);
  const [laedtMehr, setLaedtMehr] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const anfrage = useRef(0);

  useEffect(() => {
    const nr = ++anfrage.current;
    const t = setTimeout(async () => {
      setLaedt(true);
      try {
        const r = await senden<GStatistik>('/api/trading/statistik', { ...(p || {}), filter: f, liste: { ...liste, ab: 0 } });
        if (nr !== anfrage.current) return;
        setD(r); setFehler(null); setEintraege(r.ereignisse);
        if (!p) setP(r.parameter); else setVarianten((v) => v + 1);
      } catch (e) { if (nr === anfrage.current) setFehler((e as Error).message); }
      finally { if (nr === anfrage.current) setLaedt(false); }
    }, p ? 400 : 0);
    try { localStorage.setItem('zentrale-gva-filter', JSON.stringify(f)); } catch {}
    return () => clearTimeout(t);
  }, [p, f, liste]);
  async function mehrLaden() {
    setLaedtMehr(true);
    try { const r = await senden<GStatistik>('/api/trading/statistik', { ...(p || {}), filter: f, liste: { ...liste, ab: eintraege.length } }); setEintraege((x) => [...x, ...r.ereignisse]); }
    catch (e) { setInfo((e as Error).message); }
    finally { setLaedtMehr(false); }
  }

  const setzP = <K extends keyof GParameter>(k: K, v: GParameter[K]) => setP((x) => (x ? { ...x, [k]: v } : x));
  // Beim Wechsel zwischen ATR und Pips sinnvolle Werte setzen
  const basis = (b: GParameter['atrBasis']) => setP((x) => {
    if (!x) return x;
    const zuPips = b === 'pips' && x.atrBasis !== 'pips', vonPips = b !== 'pips' && x.atrBasis === 'pips';
    return { ...x, atrBasis: b, reaktion: zuPips ? 50 : vonPips ? 1 : x.reaktion, durchstich: zuPips ? 25 : vonPips ? 0.5 : x.durchstich };
  });
  const E = p ? einheitText(p) : 'ATR';
  const setzF = <K extends keyof GFilter>(k: K, v: GFilter[K]) => setF((x) => ({ ...x, [k]: v }));
  const tfUmschalten = (tf: string) => setzF('tfs', f.tfs?.includes(tf) ? f.tfs.filter((x) => x !== tf) : [...(f.tfs || []), tf]);

  if (fehler && !d) return <div className="karte fehlerbox">Statistik nicht ladbar: {fehler}</div>;
  if (!d || !p) return <div className="karte leise">Rechne alle GVA-Linien seit 2003 durch …</div>;

  const urteil = (() => {
    if (!d.bereich || !d.zufall.bereich || d.n < 30) return { text: 'Zu wenige Treffer für ein Urteil', ton: 'neutral' };
    if (d.bereich[0] > d.zufall.bereich[1]) return { text: 'Besser als Zufall', ton: 'plus' };
    if (d.bereich[1] < d.zufall.bereich[0]) return { text: 'Schlechter als Zufall', ton: 'minus' };
    return { text: 'Nicht vom Zufall zu unterscheiden', ton: 'neutral' };
  })();
  const vorteil = d.quote !== null && d.zufall.quote !== null ? d.quote - d.zufall.quote : null;
  const geaendert = JSON.stringify(p) !== JSON.stringify(d.standard);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {d.daten && !d.daten.fertig && <DatenHinweis daten={d.daten} />}
      <div className="gs-oben">
        <section className="karte in" aria-label="Regel für eine Umkehr">
          <h2 className="karte-titel">Was zählt als Umkehr? <small>{laedt ? 'rechne …' : `${d.gesamtEreignisse} erste Treffer`}</small></h2>
          <div className="gs-felder">
            <label className="nw-feld">Reaktion ({E})<input type="number" step={p.atrBasis === 'pips' ? 5 : 0.1} min={0.1} max={1000} value={p.reaktion} onChange={(e) => setzP('reaktion', Number(e.target.value))} /></label>
            <label className="nw-feld">Max. Durchstich ({E})<input type="number" step={p.atrBasis === 'pips' ? 5 : 0.05} min={0} max={1000} value={p.durchstich} onChange={(e) => setzP('durchstich', Number(e.target.value))} /></label>
            <label className="nw-feld">Zeitfenster (Handelstage)<input type="number" step={1} min={1} max={20} value={p.fenster} onChange={(e) => setzP('fenster', Number(e.target.value))} /></label>
            <label className="nw-feld">Test ab Jahr<input type="number" step={1} min={2005} max={2030} value={p.splitJahr} onChange={(e) => setzP('splitJahr', Number(e.target.value))} /></label>
          </div>
          <div className="nw-feld">ATR gemessen an
            <div className="segment" style={{ gridTemplateColumns: '1fr 1.3fr 0.8fr' }}>
              <button aria-pressed={p.atrBasis === 'tag'} onClick={() => basis('tag')}>Tages-ATR</button>
              <button aria-pressed={p.atrBasis === 'tf'} onClick={() => basis('tf')}>ATR der Linie</button>
              <button aria-pressed={p.atrBasis === 'pips'} onClick={() => basis('pips')}>Pips</button>
            </div>
            <small className="tr-hilfe">ATR = durchschnittliche Bewegung pro Tag (14 Tage). Bei EURUSD etwa 60–80 Pips, bei GBPJPY etwa 150. Darum ist «1 ATR» bei jedem Paar gleich gross im Verhältnis – feste Pips sind bei ruhigen Paaren viel, bei wilden wenig.</small>
          </div>
          <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Es zählt, was zuerst passiert: {kz(p.reaktion, p.atrBasis === 'pips' ? 0 : 2)} {E} Reaktion oder mehr als {kz(p.durchstich, p.atrBasis === 'pips' ? 0 : 2)} {E} Durchstich.
            Kommt die Reaktion innerhalb von {p.fenster} Handelstagen, ist es eine <b>Umkehr</b>, danach eine <b>Umkehr später</b>. Konsolidieren um die Linie bleibt gültig. Beobachtet wird bis {d.maxTage} Handelstage.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <button className="knopf-klein press tr-primaer" disabled={!geaendert} onClick={async () => { await senden('/api/trading/statistik/standard', p); setInfo('Als Standard gespeichert.'); setD({ ...d, standard: p }); }}>Als Standard speichern</button>
            <button className="knopf-klein press" disabled={!geaendert} onClick={() => setP(d.standard)}>Standard</button>
            {info && <span className="leise" style={{ fontSize: 12.5 }}>{info}</span>}
          </div>
        </section>

        <section className="karte in" aria-label="Filter">
          <h2 className="karte-titel">Filter <small><button className="knopf-klein press" onClick={() => setF(LEER)}>Alle zurücksetzen</button></small></h2>
          <div className="gs-filter">
            <div className="nw-feld">Zeitrahmen
              <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {['3D', 'W', 'M'].map((tf) => <button key={tf} aria-pressed={!!f.tfs?.includes(tf)} onClick={() => tfUmschalten(tf)}>{tf}</button>)}
              </div>
            </div>
            <div className="nw-feld">Seite
              <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {(['beide', 'long', 'short'] as const).map((s) => <button key={s} aria-pressed={f.seite === s} onClick={() => setzF('seite', s)}>{s === 'beide' ? 'Beide' : s === 'long' ? 'Long' : 'Short'}</button>)}
              </div>
            </div>
            <label className="nw-feld">Paar
              <select value={f.paare?.[0] || ''} onChange={(e) => setzF('paare', e.target.value ? [e.target.value] : [])}>
                <option value="">Alle 28</option>
                {PAARE.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="nw-feld">Währung
              <select value={f.waehrung || ''} onChange={(e) => setzF('waehrung', e.target.value)}>
                <option value="">Alle</option>
                {WAEHRUNGEN.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="nw-feld">Jahre von<input type="number" placeholder="2004" value={f.vonJahr ?? ''} onChange={(e) => setzF('vonJahr', zahlOderNull(e.target.value))} /></label>
            <label className="nw-feld">bis<input type="number" placeholder="heute" value={f.bisJahr ?? ''} onChange={(e) => setzF('bisJahr', zahlOderNull(e.target.value))} /></label>
            <label className="nw-feld">Linie mind. … Tage alt<input type="number" min={0} value={f.alterMin ?? ''} onChange={(e) => setzF('alterMin', zahlOderNull(e.target.value))} /></label>
            <label className="nw-feld">höchstens … Tage alt<input type="number" min={0} value={f.alterMax ?? ''} onChange={(e) => setzF('alterMax', zahlOderNull(e.target.value))} /></label>
            <div className="nw-feld">Konfluenz (andere Linie in der Nähe)
              <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {(['egal', 'mit', 'ohne'] as const).map((s) => <button key={s} aria-pressed={f.konfluenz === s} onClick={() => setzF('konfluenz', s)}>{s === 'egal' ? 'Egal' : s === 'mit' ? 'Mit' : 'Ohne'}</button>)}
              </div>
            </div>
            <div className="nw-feld">Trend (200-Tage-Schnitt)
              <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {(['egal', 'mit', 'gegen'] as const).map((s) => <button key={s} aria-pressed={f.trend === s} onClick={() => setzF('trend', s)}>{s === 'egal' ? 'Egal' : s === 'mit' ? 'Mit' : 'Gegen'}</button>)}
              </div>
            </div>
            <label className="nw-feld">Sitzung beim Treffer
              <select value={f.sitzung || 'alle'} onChange={(e) => setzF('sitzung', e.target.value)}>
                {['alle', 'Asien', 'London', 'London + NY', 'New York', 'Abend'].map((x) => <option key={x} value={x}>{x === 'alle' ? 'Alle' : x}</option>)}
              </select>
            </label>
          </div>
          <Schalter an={!!f.nurStunden} onClick={() => setzF('nurStunden', !f.nurStunden)} titel="Nur stundengenaue Treffer" unter={d.daten?.fertig ? 'Alle Treffer sind stundengenau (Dukascopy ab 2003)' : 'Reihenfolge Reaktion/Durchstich sicher bekannt'} />
        </section>
      </div>

      <section className="karte in gs-held" aria-label="Ergebnis">
        <div className="gs-held-zahl">
          <div className="leise" style={{ fontSize: 13 }}>Umkehr-Quote · {d.n} Treffer</div>
          <div className="gs-gross tr-zahl">{pz(d.quote)}</div>
          <div className="leise" style={{ fontSize: 12.5 }}>95 %: {pz(d.bereich?.[0] ?? null, 0)} – {pz(d.bereich?.[1] ?? null, 0)}</div>
        </div>
        <div className="gs-held-zahl">
          <div className="leise" style={{ fontSize: 13 }}>Zufällige Levels (gleiche Regel)</div>
          <div className="gs-gross tr-zahl" style={{ color: 'var(--muted)' }}>{pz(d.zufall.quote)}</div>
          <div className="leise" style={{ fontSize: 12.5 }}>{d.zufall.n} Vergleichsfälle</div>
        </div>
        <div className="gs-held-zahl">
          <div className="leise" style={{ fontSize: 13 }}>Vorteil der GVA</div>
          <div className={`gs-gross tr-zahl gs-${urteil.ton}`}>{vorteil === null ? '—' : `${vorteil >= 0 ? '+' : '−'}${Math.abs(vorteil * 100).toFixed(1).replace('.', ',')} P.`}</div>
          <div className={`gs-urteil gs-${urteil.ton}`}>{urteil.text}</div>
        </div>
        <div className="gs-balken" role="img" aria-label="Verteilung der Ergebnisse">
          {(['erfolg', 'spaet', 'keine', 'unklar', 'durch'] as const).map((a) => d.ergebnis[a] > 0 && (
            <span key={a} style={{ flex: d.ergebnis[a], background: ART_FARBE[a] }} title={`${ART_TEXT[a]}: ${d.ergebnis[a]}`} />
          ))}
        </div>
        <div className="gs-legende">
          {(['erfolg', 'spaet', 'keine', 'unklar', 'durch'] as const).map((a) => (
            <span key={a}><i style={{ background: ART_FARBE[a] }} />{ART_TEXT[a]} {d.ergebnis[a]} ({pz(d.n ? d.ergebnis[a] / d.n : null, 0)})</span>
          ))}
        </div>
        <div className="leise" style={{ fontSize: 12.5 }}>Umkehr irgendwann (bis {d.maxTage} Handelstage, vor dem Durchstich): <b>{pz(d.irgendwann)}</b></div>
        {varianten >= 15 && <div className="leise" style={{ fontSize: 12.5 }}>Du hast {varianten} Varianten angeschaut. Je mehr man sucht, desto eher findet man eine gute Gruppe nur durch Zufall – prüfe sie im Test ab {p.splitJahr}.</div>}
      </section>

      <div className="gs-zwei">
        <section className="karte in" aria-label="Kennzahlen">
          <h2 className="karte-titel">Was man daraus lernt</h2>
          <div className="jr-kacheln">
            <Kachel titel="Durchstich vor Umkehr" wert={`${kz(d.durchstich.p80)} ${E}`} unter={`80 % der Umkehrungen gingen höchstens so weit durch (Median ${kz(d.durchstich.p50)}, 90 %: ${kz(d.durchstich.p90)})`} />
            <Kachel titel="Typische Reaktion" wert={`${kz(d.reaktionMedian)} ${E}`} unter="Median der grössten Bewegung in Umkehrrichtung bis zur Entscheidung" />
            <Kachel titel="Zeit bis zur Umkehr" wert={d.dauerMedianStunden === null ? '—' : d.dauerMedianStunden < 48 ? `${d.dauerMedianStunden} Std` : `${Math.round(d.dauerMedianStunden / 24)} Tage`} unter="Median, nur Umkehrungen" />
            <Kachel titel={`Vor ${p.splitJahr}`} wert={pz(d.oos.vorher.quote)} unter={`${d.oos.vorher.n} Treffer`} />
            <Kachel titel={`Ab ${p.splitJahr} (Test)`} wert={pz(d.oos.nachher.quote)} unter={`${d.oos.nachher.n} Treffer – hält das Ergebnis?`} />
          </div>
          <h4 className="nw-h" style={{ marginTop: 14 }}>Durchstich bei den Umkehrungen</h4>
          <Histogramm hist={d.durchstich.hist} p80={d.durchstich.p80} e={E} />
        </section>
        <section className="karte in" aria-label="Verlauf nach dem Treffer">
          <h2 className="karte-titel">Verlauf nach dem Treffer <small>Tagesschluss in {E}, + = Umkehr</small></h2>
          <Faecher f={d.faecher} p={p} />
          <div className="leise" style={{ fontSize: 12, marginTop: 6 }}>Dunkel: mittlere 50 % aller Treffer · hell: mittlere 80 % · Linie: Median.</div>
        </section>
      </div>

      <section className="karte in" aria-label="Aufschlüsselung">
        <h2 className="karte-titel">Aufschlüsselung</h2>
        <div className="gs-tabs">{GRUPPEN.map((g) => <button key={g.id} className="press" aria-pressed={gruppe === g.id} onClick={() => setGruppe(g.id)}>{g.text}</button>)}</div>
        <Gruppen g={d.gruppen[gruppe]} zufall={d.zufall.quote} />
      </section>

      <section className="karte in" aria-label="Einzelne Treffer">
        <h2 className="karte-titel">Einzelne Treffer <small>{d.ereignisseGesamt} · antippen zeigt das Beispiel</small></h2>
        <div className="gs-liste-kopf">
          <label className="nw-feld">Sortierung
            <select value={liste.sortierung} onChange={(e) => setListe((x) => ({ ...x, sortierung: e.target.value }))}>
              <option value="neu">Neueste zuerst</option><option value="alt">Älteste zuerst</option>
              <option value="reaktion">Grösste Reaktion</option><option value="durchstich">Grösster Durchstich</option>
            </select>
          </label>
          <label className="nw-feld">Ergebnis
            <select value={liste.art} onChange={(e) => setListe((x) => ({ ...x, art: e.target.value }))}>
              <option value="alle">Alle</option>
              {(['erfolg', 'spaet', 'durch', 'keine', 'unklar'] as const).map((a) => <option key={a} value={a}>{ART_TEXT[a]}</option>)}
            </select>
          </label>
        </div>
        <div className="gs-liste">
          {eintraege.map((e) => <EreignisZeile key={e.id} e={e} einheit={E} onClick={() => setBeispielId(e.id)} />)}
        </div>
        {eintraege.length < d.ereignisseGesamt && <button className="knopf-klein press" onClick={mehrLaden} disabled={laedtMehr}>{laedtMehr ? 'Lade …' : `Mehr laden (${eintraege.length} von ${d.ereignisseGesamt})`}</button>}
      </section>

      {beispielId && <BeispielPopup id={beispielId} p={p} onClose={() => setBeispielId(null)} />}
    </div>
  );
}

function Kachel({ titel, wert, unter }: { titel: string; wert: string; unter: string }) {
  return (
    <div className="jr-kachel">
      <div className="jr-kachel-titel">{titel}</div>
      <div className="jr-kachel-wert tr-zahl">{wert}</div>
      <div className="leise" style={{ fontSize: 12 }}>{unter}</div>
    </div>
  );
}

function Histogramm({ hist, p80, e }: { hist: GStatistik['durchstich']['hist']; p80: number | null; e: string }) {
  const max = Math.max(1, ...hist.map((h) => h.n));
  return (
    <div>
      <div className="gs-hist" role="img" aria-label="Verteilung des Durchstichs vor der Umkehr">
        {hist.map((h) => (
          <div key={h.von} title={`${kz(h.von)}–${kz(h.bis)} ${e}: ${h.n}`}>
            <span style={{ height: `${(h.n / max) * 100}%`, background: p80 !== null && h.von < p80 ? 'var(--gruen)' : '#c8d0dd' }} />
          </div>
        ))}
      </div>
      <div className="leise tr-zahl" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>0</span><span>{kz(hist[hist.length - 1]?.bis ?? 0)} {e}</span></div>
      {p80 !== null && <div className="leise" style={{ fontSize: 12.5, marginTop: 4 }}>Grün = bis zum 80-%-Wert. Ein Stop knapp hinter {kz(p80)} {e} hätte 80 % der späteren Umkehrungen überlebt.</div>}
    </div>
  );
}

function Faecher({ f, p }: { f: GStatistik['faecher']; p: GParameter }) {
  const W = 520, H = 230, L = 34, R = 10, T = 10, B = 24;
  if (f.length < 2) return <div className="leise">Zu wenige Daten.</div>;
  const lo = Math.min(-p.durchstich - 0.2, ...f.map((x) => x.p10)), hi = Math.max(p.reaktion + 0.2, ...f.map((x) => x.p90));
  const x = (t: number) => L + (t / (f[f.length - 1].tag || 1)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const band = (a: 'p10' | 'p25', b: 'p90' | 'p75') => `M${f.map((q) => `${x(q.tag)},${y(q[a])}`).join(' L')} L${[...f].reverse().map((q) => `${x(q.tag)},${y(q[b])}`).join(' L')} Z`;
  const ticks = [lo, 0, hi].map((v) => Math.round(v * 2) / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gs-faecher" role="img" aria-label="Preisverlauf nach dem Treffer in ATR">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e8ebf2" /><text x={L - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="var(--muted)">{kz(v, 1)}</text></g>)}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={1} opacity={0.5} />
      <line x1={L} x2={W - R} y1={y(p.reaktion)} y2={y(p.reaktion)} stroke="var(--gruen)" strokeDasharray="4 4" />
      <line x1={L} x2={W - R} y1={y(-p.durchstich)} y2={y(-p.durchstich)} stroke="var(--fehler)" strokeDasharray="4 4" />
      <path d={band('p10', 'p90')} fill="var(--accent)" opacity={0.12} />
      <path d={band('p25', 'p75')} fill="var(--accent)" opacity={0.22} />
      <path d={`M${f.map((q) => `${x(q.tag)},${y(q.p50)}`).join(' L')}`} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
      {f.map((q) => <text key={q.tag} x={x(q.tag)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--muted)">{q.tag}</text>)}
      <text x={W - R} y={y(p.reaktion) - 4} fontSize={10} textAnchor="end" fill="var(--gruen)">Reaktion</text>
      <text x={W - R} y={y(-p.durchstich) + 12} fontSize={10} textAnchor="end" fill="var(--fehler)">Durchstich</text>
    </svg>
  );
}

function Gruppen({ g, zufall }: { g: GGruppe[]; zufall: number | null }) {
  if (!g.length) return <div className="leise" style={{ padding: '8px 0' }}>Keine Daten für diese Ansicht.</div>;
  const max = Math.max(0.6, ...g.map((x) => x.bereich?.[1] ?? x.quote));
  const proz = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="gs-gruppen">
      {g.map((x) => (
        <div key={x.schluessel} className={`gs-gruppe${x.n < 30 ? ' wenig' : ''}`}>
          <span className="gs-g-name">{x.schluessel}</span>
          <span className="gs-g-spur">
            {zufall !== null && <i className="gs-g-zufall" style={{ left: proz(zufall) }} title={`Zufall ${pz(zufall)}`} />}
            {x.bereich && <i className="gs-g-ber" style={{ left: proz(x.bereich[0]), width: `calc(${proz(x.bereich[1])} - ${proz(x.bereich[0])})` }} />}
            <i className="gs-g-punkt" style={{ left: proz(x.quote) }} />
          </span>
          <span className="gs-g-wert tr-zahl">{pz(x.quote, 0)}</span>
          <span className="gs-g-n leise tr-zahl">n {x.n}</span>
        </div>
      ))}
      <div className="leise" style={{ fontSize: 12, marginTop: 6 }}>Punkt = Quote, Balken = 95-%-Bereich, Strich = Zufall. Ausgegraut: weniger als 30 Treffer.</div>
    </div>
  );
}

function EreignisZeile({ e, onClick, einheit }: { e: GEreignis; onClick: () => void; einheit: string }) {
  return (
    <button className="zeile press gs-ereignis" onClick={onClick}>
      <span className="fk-punkt" style={{ background: ART_FARBE[e.art] }} />
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <b>{e.pair}</b> <span className="leise" style={{ fontSize: 12.5 }}>{e.seite === 'long' ? 'Long' : 'Short'} {e.tf} · {kurs(e.pair, e.lvl)}</span>
        <div className="leise" style={{ fontSize: 12 }}>{new Date(e.t).toLocaleDateString('de-CH')} · entstanden {datumCh(e.entstanden)}{!e.stundengenau ? ' · Tageskerzen' : ''}</div>
      </span>
      <span style={{ textAlign: 'right', fontSize: 12.5 }}>
        <b style={{ color: ART_FARBE[e.art] }}>{ART_TEXT[e.art]}</b>
        <div className="leise tr-zahl" style={{ fontSize: 11.5 }}>durch {kz(e.durchstich)} · Reaktion {kz(e.reaktion)} {einheit}{e.tage !== null && e.tage !== undefined ? ` · Tag ${e.tage}` : ''}</div>
      </span>
    </button>
  );
}

// ---------- Beispiel: so sieht die Zentrale eine GVA ----------
function BeispielPopup({ id, p, onClose }: { id: string; p: GParameter; onClose: () => void }) {
  const [b, setB] = useState<GBeispiel | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => { senden<GBeispiel>('/api/trading/statistik/beispiel', { id, ...p }).then(setB).catch((e) => setFehler((e as Error).message)); }, [id, p]);
  return (
    <Popup titel={b ? `${b.pair} · ${b.seite === 'long' ? 'Long' : 'Short'} ${b.tf}-GVA` : 'Beispiel'} unter={b ? `Level ${kurs(b.pair, b.lvl)}${b.parameter.atrBasis !== 'pips' ? ` · 1 ATR = ${b.atrPips} Pips` : ''}` : undefined} onClose={onClose} breit>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      {!b && !fehler && <div className="leise">Lade …</div>}
      {b && (
        <>
          <h4 className="nw-h">So entsteht die Linie ({b.tf}-Kerzen)</h4>
          <HtfChart b={b} />
          <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '4px 0 10px' }}>
            Kerze A ({datumCh(b.A)}) und Kerze B ({datumCh(b.B)}): Gegenfarbe, B mindestens 40 % grösserer Körper, {b.seite === 'long' ? 'Körper-Böden' : 'Körper-Tops'} gleich hoch.
            Das Level ist das Open von B. Erster gültiger Treffer am {datumCh(b.trefferTag)}, {b.alterTage} Tage nach der Bildung{b.konfluenz ? ', mit Konfluenz' : ''}{b.trend ? `, ${b.trend === 'mit' ? 'mit' : 'gegen'} den Trend` : ''}.
          </div>
          <h4 className="nw-h">Nach dem Treffer ({b.kerzenStunden === 24 ? 'Tageskerzen' : b.kerzenStunden === 4 ? '4-Stunden-Kerzen' : 'Stundenkerzen'}, bis zur Entscheidung)</h4>
          <VerlaufChart b={b} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <span className="pille" style={{ background: 'var(--bg)', color: ART_FARBE[b.ergebnis.art] }}><b>{ART_TEXT[b.ergebnis.art]}</b></span>
            <span className="leise tr-zahl" style={{ fontSize: 12.5 }}>Durchstich {kz(b.ergebnis.durchstich)} {einheitText(b.parameter)} · Reaktion {kz(b.ergebnis.reaktion)} {einheitText(b.parameter)}{b.ergebnis.tage !== null && b.ergebnis.tage !== undefined ? ` · Entscheidung an Handelstag ${b.ergebnis.tage}` : ''}{b.ergebnis.dauer !== null && b.ergebnis.dauer < 72 ? ` (${Math.round(b.ergebnis.dauer)} Std)` : ''}</span>
          </div>
        </>
      )}
    </Popup>
  );
}

function Kerzen({ k, x, y, breite, hervor }: { k: { o: number; h: number; l: number; c: number }[]; x: (i: number) => number; y: (v: number) => number; breite: number; hervor?: (i: number) => string | null }) {
  return (
    <>
      {k.map((c, i) => {
        const auf = c.c >= c.o, farbe = auf ? '#2f9e5b' : '#c8463a';
        const h = hervor?.(i);
        return (
          <g key={i}>
            {h && <rect x={x(i) - breite * 0.75} width={breite * 1.5} y={0} height="100%" fill={h} opacity={0.14} />}
            <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={farbe} strokeWidth={1} />
            <rect x={x(i) - breite * 0.35} width={breite * 0.7} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={farbe} rx={0.6} />
          </g>
        );
      })}
    </>
  );
}

function HtfChart({ b }: { b: GBeispiel }) {
  const W = 640, H = 230, R = 60;
  const k = b.htf;
  const lo = Math.min(...k.map((c) => c.l)), hi = Math.max(...k.map((c) => c.h));
  const pad = (hi - lo) * 0.06;
  const y = (v: number) => ((hi + pad - v) / (hi - lo + 2 * pad)) * H;
  const s = (W - R) / k.length;
  const x = (i: number) => i * s + s / 2;
  const iA = k.findIndex((c) => c.tag === b.A), iB = k.findIndex((c) => c.tag === b.B);
  const iT = (() => { let t = -1; k.forEach((c, i) => { if (c.tag <= b.trefferTag) t = i; }); return t; })();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tr-chart" role="img" aria-label="Bildung der GVA mit Kerze A und B">
      <Kerzen k={k} x={x} y={y} breite={s} hervor={(i) => (i === iA ? '#7e3fd6' : i === iB ? '#2457f5' : null)} />
      {iB >= 0 && <line x1={x(iB)} x2={x(Math.max(iT, iB))} y1={y(b.lvlRoh)} y2={y(b.lvlRoh)} stroke={b.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)'} strokeWidth={2} />}
      {iT >= 0 && <circle cx={x(iT)} cy={y(b.lvlRoh)} r={5} fill="#fff" stroke="var(--ink)" strokeWidth={2} />}
      {iA >= 0 && <text x={x(iA)} y={12} fontSize={11} textAnchor="middle" fill="#7e3fd6" fontWeight={700}>A</text>}
      {iB >= 0 && <text x={x(iB)} y={12} fontSize={11} textAnchor="middle" fill="#2457f5" fontWeight={700}>B</text>}
      <text x={W - R + 4} y={y(b.lvlRoh) + 4} fontSize={10.5} fill="var(--ink)" fontFamily="var(--mono)">{kurs(b.pair, b.lvl)}</text>
    </svg>
  );
}

function VerlaufChart({ b }: { b: GBeispiel }) {
  const W = 640, H = 220, R = 58;
  const k = b.verlauf;
  const werte = [...k.flatMap((c) => [c.h, c.l]), b.grenzen.reaktion, b.grenzen.durchstich, b.lvlRoh];
  const lo = Math.min(...werte), hi = Math.max(...werte);
  const pad = (hi - lo) * 0.06;
  const y = (v: number) => ((hi + pad - v) / (hi - lo + 2 * pad)) * H;
  const s = (W - R) / k.length;
  const x = (i: number) => i * s + s / 2;
  const iT = k.findIndex((c) => c.t <= b.t && (k[k.indexOf(c) + 1]?.t ?? Infinity) > b.t);
  const idxZeit = (t: number | null) => (t === null ? -1 : k.reduce((best, c, i) => (c.t <= t ? i : best), -1));
  const iF = idxZeit(b.fensterEnde), iE = idxZeit(b.entscheidung);
  const linie = (v: number, farbe: string, text: string, strich?: string) => (
    <g>
      <line x1={0} x2={W - R} y1={y(v)} y2={y(v)} stroke={farbe} strokeWidth={1.4} strokeDasharray={strich} />
      <text x={W - R + 4} y={y(v) + 4} fontSize={10} fill={farbe}>{text}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tr-chart" role="img" aria-label="Preisverlauf nach dem Treffer mit Reaktions- und Durchstich-Grenze">
      {iT >= 0 && <rect x={x(iT) - s / 2} width={W - R - (x(iT) - s / 2)} y={0} height={H} fill="var(--accent)" opacity={0.05} />}
      {linie(b.grenzen.reaktion, 'var(--gruen)', 'Reaktion', '5 4')}
      {linie(b.grenzen.durchstich, 'var(--fehler)', 'Durchstich', '5 4')}
      {linie(b.lvlRoh, 'var(--ink)', 'GVA')}
      <Kerzen k={k} x={x} y={y} breite={s} />
      {iT >= 0 && <circle cx={x(iT)} cy={y(b.lvlRoh)} r={4.5} fill="#fff" stroke="var(--ink)" strokeWidth={2} />}
      {iF >= 0 && <g><line x1={x(iF) - s / 2} x2={x(iF) - s / 2} y1={0} y2={H} stroke="var(--muted)" strokeDasharray="3 4" /><text x={x(iF) - s / 2 + 4} y={12} fontSize={10} fill="var(--muted)">Ende Zeitfenster</text></g>}
      {iE >= 0 && <circle cx={x(iE)} cy={b.ergebnis.art === 'durch' ? y(b.grenzen.durchstich) : y(b.grenzen.reaktion)} r={5} fill={ART_FARBE[b.ergebnis.art]} stroke="#fff" strokeWidth={1.5} />}
    </svg>
  );
}

// Stand der Dukascopy-Daten: Stundenkerzen (Statistik) und 5-Minuten-Kerzen (Labor), beide ab 2003.
export function DatenHinweis({ daten }: { daten: DatenStand }) {
  const balken = (titel: string, da: number, gesamt: number, paare: number) => {
    const prozent = gesamt ? Math.floor((da / gesamt) * 100) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <strong>{titel}</strong>
          <span className="leise">{paare}/28 Paare · {prozent} %</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--linie, rgba(127,127,127,.25))', overflow: 'hidden' }}>
          <div style={{ width: `${prozent}%`, height: '100%', background: 'var(--gruen)' }} />
        </div>
      </div>
    );
  };
  const text = daten.gesperrtBis
    ? `Dukascopy bremst gerade – weiter um ${new Date(daten.gesperrtBis).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}.`
    : daten.laeuft
      ? `Lädt ${daten.art === 'm5' ? '5-Min-Kerzen' : 'Stundenkerzen'} ${daten.paar ?? ''}. ${daten.art === 'm5' ? 'Dauert beim ersten Mal einige Tage.' : 'Bis alles da ist, sind ältere Treffer nur auf Tageskerzen genau; danach rechnet die Statistik automatisch neu.'}`
      : daten.fertig && daten.m5?.fertig
        ? `Alles geladen: abgeschlossene Monate bis ${daten.bisMonat} von Dukascopy, danach Yahoo.`
        : 'Lädt im Hintergrund weiter (startet wenige Minuten nach einem Neustart).';
  return (
    <div className="karte" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {balken('Stundenkerzen seit 2003 (Statistik)', daten.da, daten.gesamt, daten.paareFertig)}
      {daten.m5 && balken('5-Min-Kerzen seit 2003 (Labor)', daten.m5.da, daten.m5.gesamt, daten.m5.paareFertig)}
      <small className="leise" style={{ lineHeight: 1.5 }}>
        {text}
        {daten.fehler && !daten.gesperrtBis ? ` Letzter Fehler: ${daten.fehler}` : ''}
      </small>
    </div>
  );
}
