'use client';
// Tab «Gesundheit»: auf einen Blick das Wichtigste aus der Garmin-Uhr.
// Jede Kachel lässt sich antippen und öffnet eine Detailansicht mit der ganzen Historie.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { holen } from '@/lib/api';
import type { Garmin, GarminHistorie } from '@/lib/types';
import { komma, relativ, zahl } from '@/lib/format';
import { bbFarbe, dauer, schlafStufe, stressFarbe, zeitHM } from '@/lib/garmin';
import { Icon, Ring } from './ui';
import type { IconName } from './ui';
import { Linie, SchlafPhasen, Veraenderung, Zaehler } from './GesundheitTeile';
import { AktivitaetZeile, Detail } from './GesundheitDetail';
import type { DetailArt } from './GesundheitDetail';

type Bereit = Extract<Garmin, { bereit: true }>;
type Hist = Extract<GarminHistorie, { bereit: true }>;

export function Gesundheit() {
  const [d, setD] = useState<Garmin | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [detail, setDetail] = useState<DetailArt | null>(null);
  const [historie, setHistorie] = useState<Hist | null>(null);
  const [histFehler, setHistFehler] = useState<string | null>(null);
  const histLaedt = useRef(false);

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

  const oeffnen = useCallback(async (art: DetailArt) => {
    setDetail(art);
    if (historie || histLaedt.current) return;
    histLaedt.current = true;
    setHistFehler(null);
    try {
      const h = await holen<GarminHistorie>('/api/garmin/historie');
      if (h.bereit) setHistorie(h);
      else setHistFehler(h.grund);
    } catch (e) {
      setHistFehler((e as Error).message);
    } finally {
      histLaedt.current = false;
    }
  }, [historie]);
  const schliessen = useCallback(() => setDetail(null), []);

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

  return (
    <>
      <Ansicht d={d} laedt={laedt} neu={() => laden(true)} oeffnen={oeffnen} />
      {detail && <Detail art={detail} historie={historie} fehler={histFehler} schliessen={schliessen} />}
    </>
  );
}

// Antippbare Fläche (Kachel → Detail)
function Klick({ art, oeffnen, className, style, label, children }: { art: DetailArt; oeffnen: (a: DetailArt) => void; className: string; style?: React.CSSProperties; label: string; children: ReactNode }) {
  const taste = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oeffnen(art); } };
  return (
    <section className={`${className} ges-klick`} style={style} role="button" tabIndex={0} aria-label={`${label} – Details öffnen`} onClick={() => oeffnen(art)} onKeyDown={taste}>
      {children}
      <span className="ges-mehr" aria-hidden="true"><Icon name="weiter" size={16} stroke={2.5} /></span>
    </section>
  );
}

function Ansicht({ d, laedt, neu, oeffnen }: { d: Bereit; laedt: boolean; neu: () => void; oeffnen: (a: DetailArt) => void }) {
  const bb = d.bodyBattery;
  const bf = bbFarbe(bb.jetzt);
  const n = d.letzteNacht;
  const sf = schlafStufe(n?.score ?? null);
  const h = d.heute;
  const ruheDiff = d.puls.ruhe !== null && d.puls.ruhe30 !== null ? d.puls.ruhe - d.puls.ruhe30 : null;
  const hrvFarbe = d.hrv.stufe === 'tief' ? '#c2410c' : d.hrv.stufe === 'hoch' ? '#0e7490' : d.hrv.stufe === 'normal' ? '#15803d' : '#64748b';
  const hrvNaechte = d.schlaf.filter((s) => s.hrv !== null).map((s) => ({ t: s.ende, v: s.hrv as number }));
  const ruhepulsTage = d.tage.filter((t) => t.ruhepuls !== null).map((t) => ({ t: new Date(t.tag + 'T12:00:00').getTime(), v: t.ruhepuls as number }));
  const veraltet = d.letzterSync !== null && Date.now() - d.letzterSync > 6 * 3600_000;
  const v = d.vergleich30;

  const vergleichChips: { art: DetailArt; titel: string; icon: IconName; farbe: string; jetzt: number | null; vorher: number | null; besser: 'hoch' | 'tief'; fmt: (x: number) => string; fmtDiff?: (x: number) => string }[] = [
    { art: 'schlaf', titel: 'Schlaf', icon: 'mond', farbe: '#7e3fd6', jetzt: v.schlaf.jetzt, vorher: v.schlaf.vorher, besser: 'hoch', fmt: (x) => dauer(x) },
    { art: 'hrv', titel: 'HRV', icon: 'welle', farbe: '#15803d', jetzt: v.hrv.jetzt, vorher: v.hrv.vorher, besser: 'hoch', fmt: (x) => `${Math.round(x)} ms` },
    { art: 'ruhepuls', titel: 'Ruhepuls', icon: 'herz', farbe: '#dc2626', jetzt: v.ruhepuls.jetzt, vorher: v.ruhepuls.vorher, besser: 'tief', fmt: (x) => `${Math.round(x)} bpm`, fmtDiff: (x) => `${komma(x, 1)} bpm` },
    { art: 'schritte', titel: 'Schritte', icon: 'schritte', farbe: '#2457f5', jetzt: v.schritte.jetzt, vorher: v.schritte.vorher, besser: 'hoch', fmt: (x) => zahl(x) },
    { art: 'stress', titel: 'Stress', icon: 'blitz', farbe: '#ea580c', jetzt: v.stress.jetzt, vorher: v.stress.vorher, besser: 'tief', fmt: (x) => `${Math.round(x)} %`, fmtDiff: (x) => `${Math.round(x)} %-Pkt.` },
  ];

  return (
    <div className="ges">
      {/* ---------- Oben: die vier wichtigsten Werte ---------- */}
      <div className="ges-oben">
        <Klick art="bodybattery" oeffnen={oeffnen} label="Body Battery" className="ges-bb in" style={{ background: `linear-gradient(150deg, ${bf.a}, ${bf.b})` }}>
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
        </Klick>

        <Klick art="schlaf" oeffnen={oeffnen} label="Schlaf" className="karte ges-kachel in" style={{ animationDelay: '80ms' }}>
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
              <SchlafPhasen n={n} legende={false} />
            </>
          ) : <div className="ges-leer">Keine Schlafdaten</div>}
        </Klick>

        <Klick art="hrv" oeffnen={oeffnen} label="HRV" className="karte ges-kachel in" style={{ animationDelay: '160ms' }}>
          <div className="ges-kopf"><span className="ges-ico" style={{ background: '#e3f5ea', color: '#15803d' }}><Icon name="welle" size={18} /></span>HRV über Nacht</div>
          <div><span className="ges-riesig"><Zaehler wert={d.hrv.letzte} /></span><span className="ges-einheit">ms</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pille" style={{ background: hrvFarbe + '1a', color: hrvFarbe, fontWeight: 700 }}>{d.hrv.text}</span>
            {d.hrv.schnitt7 !== null && <span className="leise" style={{ fontSize: 12 }}>7 Nächte Ø {d.hrv.schnitt7} ms</span>}
          </div>
          <Linie punkte={hrvNaechte} farbe="#15803d" hoehe={58} verzoegerung={300} />
        </Klick>

        <Klick art="ruhepuls" oeffnen={oeffnen} label="Ruhepuls" className="karte ges-kachel in" style={{ animationDelay: '240ms' }}>
          <div className="ges-kopf"><span className="ges-ico ges-schlag" style={{ background: '#fdecea', color: '#dc2626' }}><Icon name="herz" size={18} /></span>Ruhepuls</div>
          <div><span className="ges-riesig"><Zaehler wert={d.puls.ruhe} /></span><span className="ges-einheit">bpm</span></div>
          <div className="leise" style={{ fontSize: 12 }}>
            {ruheDiff === null ? '30-Tage-Schnitt folgt' : (
              <><b style={{ color: ruheDiff > 2 ? '#c2410c' : ruheDiff < -2 ? '#15803d' : 'var(--ink)' }}>{ruheDiff > 0 ? '▲' : ruheDiff < 0 ? '▼' : '●'} {komma(Math.abs(ruheDiff))}</b> vs. 30 Tage Ø ({komma(d.puls.ruhe30)})</>
            )}
          </div>
          <Linie punkte={ruhepulsTage} farbe="#dc2626" hoehe={58} verzoegerung={400} />
        </Klick>
      </div>

      {/* ---------- Letzte 30 Tage gegen die 30 davor ---------- */}
      <section className="karte ges-vergleich in" style={{ animationDelay: '280ms' }} aria-label="30 Tage im Vergleich">
        <h2 className="karte-titel">Letzte 30 Tage <small>gegenüber den 30 Tagen davor</small></h2>
        <div className="ges-vergleich-reihe">
          {vergleichChips.map((c, i) => (
            <button key={c.art} className="press ges-vergleich-chip slide" style={{ animationDelay: `${320 + i * 60}ms` }} onClick={() => oeffnen(c.art)}>
              <span className="ges-ico" style={{ background: c.farbe + '17', color: c.farbe }}><Icon name={c.icon} size={16} /></span>
              <span style={{ minWidth: 0 }}>
                <span className="leise" style={{ display: 'block', fontSize: 12 }}>{c.titel}</span>
                <b style={{ display: 'block', fontSize: 17 }}>{c.jetzt === null ? '—' : c.fmt(c.jetzt)}</b>
                <span style={{ display: 'block', fontSize: 12 }}><Veraenderung jetzt={c.jetzt} vorher={c.vorher} besser={c.besser} format={c.fmtDiff ?? c.fmt} /></span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Heute und letzte 24 Std ---------- */}
      <div className="ges-mitte">
        <Klick art="schritte" oeffnen={oeffnen} label="Heute" className="karte in" style={{ animationDelay: '340ms' }}>
          <h2 className="karte-titel">Heute {d.letzterSync && <small style={{ color: veraltet ? 'var(--orange)' : undefined, marginRight: 28 }}>Uhr synchronisiert {relativ(d.letzterSync)}</small>}</h2>
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
        </Klick>

        <Klick art="stress" oeffnen={oeffnen} label="Puls und Stress" className="karte in" style={{ animationDelay: '400ms', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="karte-titel">Puls & Stress <small style={{ marginRight: 28 }}>letzte 24 Std</small></h2>
          <div>
            <div className="ges-reihe-kopf">
              <span><i style={{ background: '#dc2626' }} />Puls</span>
              {d.puls.verlauf.length > 0 && <span className="leise">{Math.round(Math.min(...d.puls.verlauf.map((p) => p.v)))}–{Math.round(Math.max(...d.puls.verlauf.map((p) => p.v)))} bpm</span>}
            </div>
            <Linie punkte={d.puls.verlauf} farbe="#dc2626" hoehe={70} verzoegerung={450} />
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
        </Klick>
      </div>

      {/* ---------- Aktivitäten und Fitness ---------- */}
      <div className="ges-mitte">
        <Klick art="aktivitaeten" oeffnen={oeffnen} label="Aktivitäten" className="karte in" style={{ animationDelay: '460ms' }}>
          <h2 className="karte-titel">Aktivitäten <small style={{ marginRight: 28 }}>zuletzt</small></h2>
          {d.aktivitaeten.length === 0 && <div className="ges-leer">Noch keine Aktivitäten</div>}
          {d.aktivitaeten.slice(0, 3).map((a, i) => <AktivitaetZeile key={a.zeit} a={a} i={i} />)}
        </Klick>

        <Klick art="fitness" oeffnen={oeffnen} label="Fitness" className="karte in" style={{ animationDelay: '520ms', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="karte-titel">Fitness <small style={{ marginRight: 28 }}>{d.geraet || ''}</small></h2>
          <div className="ges-fitness">
            <div>
              <span className="leise">VO₂max</span>
              <b><Zaehler wert={d.vo2max} stellen={0} /></b>
            </div>
            <div>
              <span className="leise">Fitnessalter</span>
              <b><Zaehler wert={d.fitnessAlter} stellen={0} /></b>
              {d.alter !== null && d.fitnessAlter !== null && <small className="leise">echt {d.alter} · {d.fitnessAlter < d.alter ? `${komma(d.alter - d.fitnessAlter, 0)} Jahre jünger` : 'gleich alt'}</small>}
            </div>
          </div>
          <div className="ges-fuss-aktionen" onClick={(e) => e.stopPropagation()}>
            <span className="leise" style={{ fontSize: 12, flex: 1, color: veraltet ? 'var(--orange)' : undefined }}>Sync {d.letzterSync ? relativ(d.letzterSync) : '—'}</span>
            <button className="knopf-klein press" onClick={neu} disabled={laedt}>{laedt ? 'Lädt …' : 'Aktualisieren'}</button>
            <a className="knopf-klein" href={d.grafanaUrl} target="_blank" rel="noreferrer">Grafana →</a>
          </div>
        </Klick>
      </div>
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
          <div className="balken" style={{ height: 6 }}><span className="gx" style={{ width: `${Math.max(2, prozent)}%`, background: farbe, animationDelay: `${300 + verz * 90}ms` }} /></div>
          <span className="leise" style={{ fontSize: 11 }}>{zielText}</span>
        </>
      )}
    </div>
  );
}
