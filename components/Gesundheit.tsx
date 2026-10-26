'use client';
// Tab «Gesundheit»: Garmin-Daten aus garmin-grafana, übersichtlich und animiert.
// Lädt eigene Daten (/api/garmin) nur, solange der Tab offen ist – jede Minute neu.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { holen } from '@/lib/api';
import type { Garmin, GarminAktivitaet, GarminNacht, GarminPunkt } from '@/lib/types';
import { komma, relativ, zahl } from '@/lib/format';
import { Icon, Ring } from './ui';
import type { IconName } from './ui';

type Bereit = Extract<Garmin, { bereit: true }>;

// ---------- Hilfen ----------
const dauer = (s: number | null | undefined) => {
  if (s === null || s === undefined) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} Min`;
};
const zeitHM = (t: number) => new Date(t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const wochentag = (tag: string) => new Date(tag + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'short' }).replace('.', '');
const datumKurz = (tag: string) => new Date(tag + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' });

function bbFarbe(v: number | null) {
  if (v === null) return { a: '#64748b', b: '#94a3b8', text: 'keine Daten' };
  if (v >= 75) return { a: '#0f766e', b: '#14b8a6', text: 'voll geladen' };
  if (v >= 50) return { a: '#1d4ed8', b: '#3b82f6', text: 'gut' };
  if (v >= 25) return { a: '#c2410c', b: '#f59e0b', text: 'mittel' };
  return { a: '#9f1239', b: '#e11d48', text: 'leer – Erholung nötig' };
}
function schlafStufe(score: number | null) {
  if (score === null) return { farbe: '#94a3b8', text: '—' };
  if (score >= 90) return { farbe: '#15803d', text: 'ausgezeichnet' };
  if (score >= 80) return { farbe: '#16a34a', text: 'gut' };
  if (score >= 60) return { farbe: '#d97706', text: 'okay' };
  return { farbe: '#dc2626', text: 'schlecht' };
}
function stressFarbe(v: number) {
  if (v <= 25) return '#38bdf8';
  if (v <= 50) return '#f59e0b';
  if (v <= 75) return '#f97316';
  return '#dc2626';
}
const SCHLAF_FARBEN = { tief: '#1e3a8a', leicht: '#60a5fa', rem: '#a855f7', wach: '#f472b6' };

const AKTIVITAET: { test: RegExp; name: string; icon: IconName; farbe: string }[] = [
  { test: /strength|weight/, name: 'Krafttraining', icon: 'hantel', farbe: '#7e3fd6' },
  { test: /treadmill|indoor_running/, name: 'Laufband', icon: 'lauf', farbe: '#2457f5' },
  { test: /run/, name: 'Laufen', icon: 'lauf', farbe: '#2457f5' },
  { test: /cycl|bik/, name: 'Velo', icon: 'velo', farbe: '#0e7490' },
  { test: /swim/, name: 'Schwimmen', icon: 'schwimmen', farbe: '#0284c7' },
  { test: /hik/, name: 'Wandern', icon: 'wandern', farbe: '#15803d' },
  { test: /walk/, name: 'Gehen', icon: 'schritte', farbe: '#16a34a' },
  { test: /yoga|pilates|breath/, name: 'Yoga', icon: 'welle', farbe: '#be185d' },
  { test: /hiit|cardio|fitness/, name: 'Cardio', icon: 'herz', farbe: '#dc2626' },
];
const aktivitaetsArt = (typ: string) => AKTIVITAET.find((a) => a.test.test(typ)) || { name: 'Aktivität', icon: 'blitz' as IconName, farbe: '#475569' };

// Zahl, die beim Erscheinen hochzählt.
function Zaehler({ wert, stellen = 0, dauerMs = 900 }: { wert: number | null; stellen?: number; dauerMs?: number }) {
  const [anzeige, setAnzeige] = useState(0);
  const vorher = useRef(0);
  useEffect(() => {
    if (wert === null) return;
    const ruhig = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = vorher.current;
    if (ruhig || start === wert) { setAnzeige(wert); vorher.current = wert; return; }
    const t0 = performance.now();
    let id = 0;
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / dauerMs);
      const e = 1 - Math.pow(1 - p, 3);
      setAnzeige(start + (wert - start) * e);
      if (p < 1) id = requestAnimationFrame(schritt);
      else vorher.current = wert;
    };
    id = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(id);
  }, [wert, dauerMs]);
  if (wert === null) return <>—</>;
  return <>{stellen ? komma(anzeige, stellen) : zahl(anzeige)}</>;
}

// Linie über die Zeit (24-Std-Verläufe), mit Fläche und pulsierendem Endpunkt.
function Linie({ punkte, farbe, hoehe = 90, min, max, verzoegerung = 0, hell = false }: { punkte: GarminPunkt[]; farbe: string; hoehe?: number; min?: number; max?: number; verzoegerung?: number; hell?: boolean }) {
  if (punkte.length < 2) return <div className="ges-leer" style={{ height: hoehe }}>Noch kein Verlauf</div>;
  const t0 = punkte[0].t, t1 = punkte.at(-1)!.t, dt = t1 - t0 || 1;
  const werte = punkte.map((p) => p.v);
  const lo = min ?? Math.min(...werte), hi = max ?? Math.max(...werte), r = hi - lo || 1;
  const xy = punkte.map((p) => [((p.t - t0) / dt) * 100, 96 - ((p.v - lo) / r) * 88] as const);
  const linie = 'M' + xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L');
  const [lx, ly] = xy.at(-1)!;
  const id = `g${farbe.replace(/[^a-z0-9]/gi, '')}${hell ? 'h' : ''}`;
  return (
    <div style={{ position: 'relative', height: hoehe }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={hoehe} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={farbe} stopOpacity={hell ? 0.45 : 0.28} />
            <stop offset="1" stopColor={farbe} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="area" d={`${linie} L100,100 L0,100 Z`} fill={`url(#${id})`} style={{ animationDelay: `${verzoegerung}ms` }} />
        <path className="spark" pathLength={1} d={linie} fill="none" stroke={farbe} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${verzoegerung}ms` }} />
      </svg>
      <span className="ges-endpunkt pop" style={{ left: `${lx}%`, top: `${(ly / 100) * hoehe}px`, background: farbe, animationDelay: `${verzoegerung + 900}ms`, ...(hell ? { boxShadow: '0 0 0 3px rgba(255,255,255,.9)' } : {}) }} />
    </div>
  );
}

// Säulen (30 Tage) mit gestaffeltem Wachsen.
function Saeulen({ werte, hoehe = 130, ziel, zielText }: { werte: { schluessel: string; v: number | null; farbe: string; titel: string; unten?: string }[]; hoehe?: number; ziel?: number; zielText?: string }) {
  const max = Math.max((ziel ?? 0) * 1.15, ...werte.map((w) => w.v ?? 0)) || 1;
  return (
    <div className="ges-saeulen-box">
      <div className="ges-saeulen" style={{ height: hoehe }}>
        {ziel !== undefined && (
          <div className="ges-ziel" style={{ bottom: `${(ziel / max) * 100}%` }}>
            <span>{zielText}</span>
          </div>
        )}
        {werte.map((w, i) => (
          <div key={w.schluessel} className="ges-saeule" title={w.titel}>
            <span className="gy" style={{ height: `${w.v ? Math.max(3, (w.v / max) * 100) : 0}%`, background: w.farbe, animationDelay: `${i * 22}ms` }} />
          </div>
        ))}
      </div>
      <div className="ges-saeulen-achse">
        {werte.map((w, i) => (
          <span key={w.schluessel}>{i % 5 === 0 || i === werte.length - 1 ? w.unten : ''}</span>
        ))}
      </div>
    </div>
  );
}

function SchlafPhasen({ n, hoehe = 14 }: { n: GarminNacht; hoehe?: number }) {
  const teile = [
    { k: 'Tief', s: n.tiefS, f: SCHLAF_FARBEN.tief },
    { k: 'Leicht', s: n.leichtS, f: SCHLAF_FARBEN.leicht },
    { k: 'REM', s: n.remS, f: SCHLAF_FARBEN.rem },
    { k: 'Wach', s: n.wachS, f: SCHLAF_FARBEN.wach },
  ];
  const total = teile.reduce((a, t) => a + t.s, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="ges-phasen gx" style={{ height: hoehe }}>
        {teile.map((t) => (t.s > 0 ? <span key={t.k} style={{ width: `${(t.s / total) * 100}%`, background: t.f }} title={`${t.k}: ${dauer(t.s)}`} /> : null))}
      </div>
      <div className="ges-legende">
        {teile.map((t) => (
          <span key={t.k}><i style={{ background: t.f }} />{t.k} <b>{dauer(t.s)}</b></span>
        ))}
      </div>
    </div>
  );
}

// ---------- Tab ----------
export function Gesundheit() {
  const [d, setD] = useState<Garmin | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async (frisch = false) => {
    setLaedt(true);
    try {
      setD(await holen<Garmin>(`/api/garmin${frisch ? '?frisch=1' : ''}`));
      setFehler(null);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    laden();
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => laden(), 60_000);
    const sicht = () => {
      if (document.hidden) { if (timer) clearInterval(timer); timer = null; }
      else if (!timer) { laden(); timer = setInterval(() => laden(), 60_000); }
    };
    document.addEventListener('visibilitychange', sicht);
    return () => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', sicht); };
  }, [laden]);

  if (!d) {
    return (
      <div className="ges">
        {fehler ? <div className="fehlerbox">{fehler}</div> : (
          <div className="ges-oben">{[0, 1, 2, 3].map((i) => <div key={i} className="karte ges-skelett" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        )}
      </div>
    );
  }

  if (!d.bereit) {
    return (
      <div className="ges">
        <section className="karte in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="karte-titel">Gesundheit</h2>
          <div className="hinweisbox">{d.grund}</div>
          <div className="leise" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Die Daten kommen aus garmin-grafana (<code>/mnt/daten/garmin-grafana</code>). Die Datenbank muss auf dem Pi unter <code>127.0.0.1:8086</code> erreichbar sein, und das Passwort steht in der <code>.env</code> der Zentrale als <code>GARMIN_INFLUX_PASSWORD</code>.
          </div>
          <button className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={() => laden(true)} disabled={laedt}>{laedt ? 'Prüfe …' : 'Nochmals prüfen'}</button>
        </section>
      </div>
    );
  }

  return <Ansicht d={d} laedt={laedt} neu={() => laden(true)} />;
}

function Ansicht({ d, laedt, neu }: { d: Bereit; laedt: boolean; neu: () => void }) {
  const bb = d.bodyBattery;
  const bf = bbFarbe(bb.jetzt);
  const n = d.letzteNacht;
  const sf = schlafStufe(n?.score ?? null);
  const h = d.heute;
  const ruheDiff = d.puls.ruhe !== null && d.puls.ruhe30 !== null ? d.puls.ruhe - d.puls.ruhe30 : null;
  const hrvFarbe = d.hrv.stufe === 'tief' ? '#c2410c' : d.hrv.stufe === 'hoch' ? '#0e7490' : d.hrv.stufe === 'normal' ? '#15803d' : '#64748b';
  const hrvNaechte = d.schlaf.filter((s) => s.hrv !== null).map((s) => ({ t: s.ende, v: s.hrv as number }));
  const ruhepulsTage = d.tage.filter((t) => t.ruhepuls !== null).map((t) => ({ t: new Date(t.tag + 'T12:00:00').getTime(), v: t.ruhepuls as number }));
  const schlafSchnitt = d.schlaf.length ? d.schlaf.reduce((a, s) => a + s.dauerS, 0) / d.schlaf.length : null;
  const schritteSchnitt = d.tage.length ? d.tage.reduce((a, t) => a + (t.schritte || 0), 0) / d.tage.length : null;
  const veraltet = d.letzterSync !== null && Date.now() - d.letzterSync > 6 * 3600_000;

  return (
    <div className="ges">
      {/* ---------- Oben: die vier wichtigsten Werte ---------- */}
      <div className="ges-oben">
        <section className="ges-bb in" style={{ background: `linear-gradient(150deg, ${bf.a}, ${bf.b})` }} aria-label="Body Battery">
          <div className="ges-bb-kopf">
            <span className="ges-ico-hell"><Icon name="batterie" size={20} /></span>
            <span>Body Battery</span>
            <span className="ges-bb-zeit">{bb.zeit ? relativ(bb.zeit) : ''}</span>
          </div>
          <div className="ges-bb-wert">
            <Ring wert={bb.jetzt ?? 0} groesse={128} dicke={3.2} farbe="#fff" spur="rgba(255,255,255,.22)" label={`Body Battery ${bb.jetzt ?? '—'}`}>
              <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}><Zaehler wert={bb.jetzt} /></span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>{bf.text}</span>
            </Ring>
            <div className="ges-bb-zahlen">
              <div><span>geladen</span><b>+{bb.geladen ?? '—'}</b></div>
              <div><span>verbraucht</span><b>−{bb.verbraucht ?? '—'}</b></div>
            </div>
          </div>
          <Linie punkte={bb.verlauf} farbe="#ffffff" hoehe={64} min={0} max={100} hell verzoegerung={200} />
          <div className="ges-bb-fuss"><span>vor 24 Std</span><span>jetzt</span></div>
        </section>

        <section className="karte ges-kachel in" style={{ animationDelay: '80ms' }} aria-label="Schlaf">
          <div className="ges-kopf"><span className="ges-ico" style={{ background: '#efe7fb', color: '#7e3fd6' }}><Icon name="mond" size={18} /></span>Letzte Nacht</div>
          {n ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Ring wert={n.score ?? 0} groesse={92} dicke={3.4} farbe={sf.farbe} label={`Schlaf-Score ${n.score ?? '—'}`}>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}><Zaehler wert={n.score} /></span>
                  <span className="leise" style={{ fontSize: 10 }}>Score</span>
                </Ring>
                <div style={{ minWidth: 0 }}>
                  <div className="ges-gross">{dauer(n.dauerS)}</div>
                  <div className="leise" style={{ fontSize: 13 }}>{zeitHM(n.start)} – {zeitHM(n.ende)}</div>
                  <span className="pille" style={{ background: sf.farbe + '1a', color: sf.farbe, fontWeight: 700, display: 'inline-block', marginTop: 6 }}>{sf.text}</span>
                </div>
              </div>
              <SchlafPhasen n={n} />
            </>
          ) : <div className="ges-leer">Keine Schlafdaten</div>}
        </section>

        <section className="karte ges-kachel in" style={{ animationDelay: '160ms' }} aria-label="HRV">
          <div className="ges-kopf"><span className="ges-ico" style={{ background: '#e3f5ea', color: '#15803d' }}><Icon name="welle" size={18} /></span>HRV über Nacht</div>
          <div>
            <span className="ges-riesig"><Zaehler wert={d.hrv.letzte} /></span><span className="ges-einheit">ms</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pille" style={{ background: hrvFarbe + '1a', color: hrvFarbe, fontWeight: 700 }}>{d.hrv.text}</span>
            {d.hrv.schnitt7 !== null && <span className="leise" style={{ fontSize: 12 }}>7-Nächte-Schnitt {d.hrv.schnitt7} ms</span>}
          </div>
          <Linie punkte={hrvNaechte} farbe="#15803d" hoehe={58} verzoegerung={300} />
        </section>

        <section className="karte ges-kachel in" style={{ animationDelay: '240ms' }} aria-label="Ruhepuls">
          <div className="ges-kopf"><span className="ges-ico ges-schlag" style={{ background: '#fdecea', color: '#dc2626' }}><Icon name="herz" size={18} /></span>Ruhepuls</div>
          <div>
            <span className="ges-riesig"><Zaehler wert={d.puls.ruhe} /></span><span className="ges-einheit">bpm</span>
          </div>
          <div className="leise" style={{ fontSize: 12 }}>
            {ruheDiff === null ? '30-Tage-Schnitt folgt' : (
              <>
                <b style={{ color: ruheDiff > 2 ? '#c2410c' : ruheDiff < -2 ? '#15803d' : 'var(--ink)' }}>{ruheDiff > 0 ? '▲' : ruheDiff < 0 ? '▼' : '●'} {komma(Math.abs(ruheDiff))}</b> gegenüber 30-Tage-Schnitt ({komma(d.puls.ruhe30)})
              </>
            )}
          </div>
          <Linie punkte={ruhepulsTage} farbe="#dc2626" hoehe={58} verzoegerung={400} />
        </section>
      </div>

      {/* ---------- Mitte: heute und die letzten 24 Std ---------- */}
      <div className="ges-mitte">
        <section className="karte in" style={{ animationDelay: '300ms' }} aria-label="Heute">
          <h2 className="karte-titel">Heute {d.letzterSync && <small style={{ color: veraltet ? 'var(--orange)' : undefined }}>Uhr synchronisiert {relativ(d.letzterSync)}</small>}</h2>
          <div className="ges-heute">
            <HeuteWert icon="schritte" farbe="#2457f5" titel="Schritte" wert={h?.schritte ?? null} ziel={h?.schritteZiel ?? null} zielText={h ? `Ziel ${zahl(h.schritteZiel)}` : ''} verz={0} />
            <HeuteWert icon="blitz" farbe="#7e3fd6" titel="Intensität (Woche)" wert={d.wocheIntensitaet} ziel={150} zielText="Ziel 150 Min" einheit="Min" verz={1} />
            <HeuteWert icon="flamme" farbe="#ea580c" titel="Aktive Kalorien" wert={h?.kcalAktiv ?? null} einheit="kcal" verz={2} />
            <HeuteWert icon="treppe" farbe="#0e7490" titel="Stockwerke" wert={h?.stockwerke ?? null} ziel={10} zielText="Ziel 10" verz={3} />
          </div>
          <div className="ges-mini">
            <div><span>Distanz</span><b>{h?.distanzM ? `${komma(h.distanzM / 1000, 1)} km` : '—'}</b></div>
            <div><span>Body Battery heute</span><b>{h?.bbMin ?? '—'} – {h?.bbMax ?? '—'}</b></div>
            <div><span>Atmung (Nacht)</span><b>{n?.atmung ? `${komma(n.atmung)} /Min` : '—'}</b></div>
            <div><span>SpO₂ (Nacht)</span><b>{n?.spo2 ? `${n.spo2} %` : '—'}</b></div>
          </div>
        </section>

        <section className="karte in" style={{ animationDelay: '360ms', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Puls und Stress">
          <h2 className="karte-titel">Puls & Stress <small>letzte 24 Std</small></h2>
          <div>
            <div className="ges-reihe-kopf">
              <span><i style={{ background: '#dc2626' }} />Puls</span>
              {d.puls.verlauf.length > 0 && <span className="leise">{Math.round(Math.min(...d.puls.verlauf.map((p) => p.v)))}–{Math.round(Math.max(...d.puls.verlauf.map((p) => p.v)))} bpm</span>}
            </div>
            <Linie punkte={d.puls.verlauf} farbe="#dc2626" hoehe={80} verzoegerung={450} />
          </div>
          <div>
            <div className="ges-reihe-kopf">
              <span><i style={{ background: '#f59e0b' }} />Stress</span>
              {d.stress.schnitt !== null && <span className="leise">Ø {d.stress.schnitt} · {d.stress.schnitt <= 25 ? 'entspannt' : d.stress.schnitt <= 50 ? 'leicht' : d.stress.schnitt <= 75 ? 'mittel' : 'hoch'}</span>}
            </div>
            <div className="ges-stress">
              {d.stress.verlauf.map((p, i) => (
                <span key={p.t} className="gy" title={`${zeitHM(p.t)}: ${p.v}`} style={{ height: `${Math.max(4, p.v)}%`, background: stressFarbe(p.v), animationDelay: `${500 + i * 6}ms` }} />
              ))}
            </div>
            <div className="ges-bb-fuss leise" style={{ marginTop: 6 }}><span>vor 24 Std</span><span>jetzt</span></div>
          </div>
        </section>
      </div>

      {/* ---------- Unten: 30 Tage und Aktivitäten ---------- */}
      <div className="ges-unten">
        <section className="karte in" style={{ animationDelay: '420ms' }} aria-label="Schlaf 30 Nächte">
          <h2 className="karte-titel">Schlaf <small>{d.schlaf.length} Nächte · Ø {dauer(schlafSchnitt)}</small></h2>
          <Saeulen
            werte={d.schlaf.map((s) => ({ schluessel: s.tag, v: s.dauerS, farbe: schlafStufe(s.score).farbe, titel: `${wochentag(s.tag)} ${datumKurz(s.tag)}: ${dauer(s.dauerS)} · Score ${s.score ?? '—'}`, unten: datumKurz(s.tag) }))}
            ziel={8 * 3600}
            zielText="8 h"
          />
          <div className="ges-legende" style={{ marginTop: 10 }}>
            {[['ausgezeichnet', '#15803d'], ['gut', '#16a34a'], ['okay', '#d97706'], ['schlecht', '#dc2626']].map(([t, f]) => <span key={t}><i style={{ background: f }} />{t}</span>)}
          </div>
        </section>

        <section className="karte in" style={{ animationDelay: '480ms' }} aria-label="Schritte 30 Tage">
          <h2 className="karte-titel">Schritte <small>Ø {zahl(schritteSchnitt)}</small></h2>
          <Saeulen
            werte={d.tage.map((t) => ({ schluessel: t.tag, v: t.schritte, farbe: (t.schritte ?? 0) >= (h?.schritteZiel ?? 10000) ? '#2457f5' : '#a9bdfb', titel: `${wochentag(t.tag)} ${datumKurz(t.tag)}: ${zahl(t.schritte)} Schritte`, unten: datumKurz(t.tag) }))}
            ziel={h?.schritteZiel ?? 10000}
            zielText={zahl(h?.schritteZiel ?? 10000)}
          />
        </section>

        <section className="karte in" style={{ animationDelay: '540ms' }} aria-label="Aktivitäten">
          <h2 className="karte-titel">Aktivitäten <small>{d.aktivitaeten.length ? 'zuletzt' : ''}</small></h2>
          {d.aktivitaeten.length === 0 && <div className="ges-leer">Noch keine Aktivitäten</div>}
          {d.aktivitaeten.slice(0, 6).map((a, i) => <AktivitaetZeile key={a.zeit} a={a} i={i} />)}
        </section>
      </div>

      {/* ---------- Fuss ---------- */}
      <section className="karte ges-fuss in" style={{ animationDelay: '600ms' }}>
        <div><span className="leise">Uhr</span><b>{d.geraet || '—'}</b></div>
        <div><span className="leise">VO₂max</span><b>{d.vo2max !== null ? komma(d.vo2max, 0) : '—'}</b></div>
        <div><span className="leise">Fitnessalter</span><b>{d.fitnessAlter !== null ? komma(d.fitnessAlter, 0) : '—'}{d.alter !== null && d.fitnessAlter !== null ? <small className="leise"> (echt {d.alter})</small> : null}</b></div>
        <div><span className="leise">Letzte Synchronisierung</span><b style={{ color: veraltet ? 'var(--orange)' : undefined }}>{d.letzterSync ? relativ(d.letzterSync) : '—'}</b></div>
        <div className="ges-fuss-aktionen">
          <button className="knopf-klein press" onClick={neu} disabled={laedt}>{laedt ? 'Lädt …' : 'Aktualisieren'}</button>
          <a className="knopf-klein" href={d.grafanaUrl} target="_blank" rel="noreferrer">Details in Grafana →</a>
        </div>
      </section>
    </div>
  );
}

function HeuteWert({ icon, farbe, titel, wert, ziel, zielText, einheit, verz }: { icon: IconName; farbe: string; titel: string; wert: number | null; ziel?: number | null; zielText?: string; einheit?: string; verz: number }) {
  const prozent = ziel && wert !== null ? Math.min(100, (wert / ziel) * 100) : null;
  const erreicht = prozent !== null && prozent >= 100;
  return (
    <div className="ges-heute-wert">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="ges-ico" style={{ background: farbe + '17', color: farbe }}><Icon name={icon} size={16} /></span>
        <span className="leise" style={{ fontSize: 12 }}>{titel}</span>
        {erreicht && <span className="pop" style={{ marginLeft: 'auto', color: farbe }} title="Ziel erreicht"><Icon name="ok" size={16} stroke={3} /></span>}
      </div>
      <div><span className="ges-gross"><Zaehler wert={wert} /></span>{einheit && <span className="ges-einheit klein">{einheit}</span>}</div>
      {prozent !== null && (
        <>
          <div className="balken" style={{ height: 6 }}><span className="gx" style={{ width: `${Math.max(2, prozent)}%`, background: farbe, animationDelay: `${300 + verz * 90}ms` } as CSSProperties} /></div>
          <span className="leise" style={{ fontSize: 11 }}>{zielText}</span>
        </>
      )}
    </div>
  );
}

function AktivitaetZeile({ a, i }: { a: GarminAktivitaet; i: number }) {
  const art = aktivitaetsArt(a.typ);
  const teile = [
    a.dauerS ? dauer(a.dauerS) : null,
    a.distanzM && a.distanzM > 50 ? `${komma(a.distanzM / 1000, 1)} km` : null,
    a.pulsSchnitt ? `Ø ${a.pulsSchnitt} bpm` : null,
    a.kcal ? `${zahl(a.kcal)} kcal` : null,
  ].filter(Boolean);
  return (
    <div className="zeile slide" style={{ animationDelay: `${600 + i * 70}ms` }}>
      <span className="ges-akt-ico" style={{ background: art.farbe + '17', color: art.farbe }}><Icon name={art.icon} size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || art.name}</span>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>{teile.join(' · ')}</span>
      </span>
      <span style={{ textAlign: 'right', flex: 'none' }}>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>{relativ(a.zeit)}</span>
        {a.effekt !== null && <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: art.farbe }} title="Aerober Trainingseffekt">TE {komma(a.effekt)}</span>}
      </span>
    </div>
  );
}
