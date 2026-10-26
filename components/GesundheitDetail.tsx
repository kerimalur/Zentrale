'use client';
// Detailansichten für «Gesundheit»: ganze Historie, Monat gegen Vormonat, Wochentage, Zusammenhänge.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GarminAktivitaet, GarminHistorie } from '@/lib/types';
import { komma, relativ, zahl } from '@/lib/format';
import {
  aktivitaetsArt, alsDatum, datumLang, davor, dauer, gleitend, heute, imZeitraum, mittel, monatName, monatsMittel, monatsSumme,
  schlafStufe, streuung, tagPlus, trend30, uhrzeitAusMinuten, wochenSumme, wochentagMittel, zusammenhang, WOCHENTAGE,
} from '@/lib/garmin';
import type { Wert } from '@/lib/garmin';
import { Icon } from './ui';
import type { IconName } from './ui';
import { Balken, Kennzahl, SchlafPhasen, Verlauf, Veraenderung, Zaehler } from './GesundheitTeile';

export type DetailArt = 'schlaf' | 'hrv' | 'ruhepuls' | 'bodybattery' | 'schritte' | 'stress' | 'aktivitaeten' | 'fitness';
type Hist = Extract<GarminHistorie, { bereit: true }>;

interface Metrik {
  titel: string; icon: IconName; farbe: string; besser: 'hoch' | 'tief';
  format: (v: number) => string; formatDiff?: (v: number) => string;
  reihe: (h: Hist) => Wert[]; ziel?: number; zielText?: string; erklaerung: string;
}

const METRIKEN: Record<Exclude<DetailArt, 'aktivitaeten'>, Metrik> = {
  schlaf: {
    titel: 'Schlaf', icon: 'mond', farbe: '#7e3fd6', besser: 'hoch', format: (v) => dauer(v), ziel: 8 * 3600, zielText: '8 h',
    reihe: (h) => h.naechte.map((n) => ({ tag: n.tag, v: n.dauerS })),
    erklaerung: 'Schlafdauer pro Nacht (ohne Wachphasen), dem Tag des Aufwachens zugeordnet.',
  },
  hrv: {
    titel: 'HRV über Nacht', icon: 'welle', farbe: '#15803d', besser: 'hoch', format: (v) => `${Math.round(v)} ms`,
    reihe: (h) => h.naechte.filter((n) => n.hrv !== null).map((n) => ({ tag: n.tag, v: n.hrv as number })),
    erklaerung: 'Herzfrequenzvariabilität im Schlaf. Höher heisst meist: besser erholt. Wichtig ist der Vergleich mit dir selbst, nicht mit anderen.',
  },
  ruhepuls: {
    titel: 'Ruhepuls', icon: 'herz', farbe: '#dc2626', besser: 'tief', format: (v) => `${komma(v, 0)} bpm`, formatDiff: (v) => `${komma(v, 1)} bpm`,
    reihe: (h) => h.tage.filter((t) => t.ruhepuls !== null).map((t) => ({ tag: t.tag, v: t.ruhepuls as number })),
    erklaerung: 'Tiefster Puls in Ruhe pro Tag. Sinkt er über Monate, wird das Herz-Kreislauf-System fitter. Steigt er plötzlich, kann das Stress, Krankheit oder zu wenig Erholung bedeuten.',
  },
  bodybattery: {
    titel: 'Body Battery beim Aufwachen', icon: 'batterie', farbe: '#0f766e', besser: 'hoch', format: (v) => `${Math.round(v)}`,
    reihe: (h) => h.tage.filter((t) => t.bbWach !== null).map((t) => ({ tag: t.tag, v: t.bbWach as number })),
    erklaerung: 'Wie voll deine Energiereserve am Morgen ist – zeigt, wie gut die Nacht dich erholt hat.',
  },
  schritte: {
    titel: 'Schritte', icon: 'schritte', farbe: '#2457f5', besser: 'hoch', format: (v) => zahl(v), ziel: 10000, zielText: '10\'000',
    reihe: (h) => h.tage.filter((t) => t.schritte !== null && (t.schritte as number) > 0).map((t) => ({ tag: t.tag, v: t.schritte as number })),
    erklaerung: 'Schritte pro Tag.',
  },
  stress: {
    titel: 'Stress', icon: 'blitz', farbe: '#ea580c', besser: 'tief', format: (v) => `${Math.round(v)}`,
    reihe: (h) => h.tage.filter((t) => t.stress !== null).map((t) => ({ tag: t.tag, v: t.stress as number })),
    erklaerung: 'Durchschnittlicher Stresswert pro Tag (0–100, aus der Herzfrequenzvariabilität). Unter 25 = Ruhe, über 50 = hoher Stress.',
  },
  fitness: {
    titel: 'VO₂max', icon: 'ziel', farbe: '#0e7490', besser: 'hoch', format: (v) => komma(v, 1),
    reihe: (h) => h.vo2,
    erklaerung: 'Maximale Sauerstoffaufnahme – Garmins Mass für deine Ausdauer. Verändert sich nur langsam, darum lohnt der Blick über Monate.',
  },
};

const ZEITRAEUME: { id: string; text: string; tage: number | null }[] = [
  { id: '30', text: '30 Tage', tage: 30 },
  { id: '90', text: '90 Tage', tage: 90 },
  { id: '365', text: '1 Jahr', tage: 365 },
  { id: 'alle', text: 'Alles', tage: null },
];

export function Detail({ art, historie, fehler, schliessen }: { art: DetailArt; historie: Hist | null; fehler: string | null; schliessen: () => void }) {
  const [zeitraum, setZeitraum] = useState<number | null>(art === 'fitness' ? null : 90);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    document.addEventListener('keydown', taste);
    const alt = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', taste); document.body.style.overflow = alt; };
  }, [schliessen]);

  const m = art === 'aktivitaeten' ? null : METRIKEN[art];
  const titel = m ? m.titel : 'Aktivitäten';
  const icon: IconName = m ? m.icon : 'lauf';
  const farbe = m ? m.farbe : '#2457f5';

  return (
    <div className="ges-overlay" onClick={schliessen} role="presentation">
      <div className="ges-sheet" role="dialog" aria-modal="true" aria-label={titel} onClick={(e) => e.stopPropagation()}>
        <div className="ges-sheet-kopf">
          <span className="ges-ico" style={{ background: farbe + '17', color: farbe, width: 40, height: 40, borderRadius: 13 }}><Icon name={icon} size={20} /></span>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', flex: 1, minWidth: 0 }}>{titel}</h2>
          <div className="segment ges-zeitraum" role="group" aria-label="Zeitraum">
            {ZEITRAEUME.map((z) => (
              <button key={z.id} className="press" aria-pressed={zeitraum === z.tage} onClick={() => setZeitraum(z.tage)}>{z.text}</button>
            ))}
          </div>
          <button className="press icon-knopf" onClick={schliessen} aria-label="Schliessen"><Icon name="x" size={20} /></button>
        </div>
        {!historie ? (
          fehler ? <div className="fehlerbox">{fehler}</div> : <div className="ges-laden"><div className="dreh" /><span className="leise">Lade alle Daten seit Beginn …</span></div>
        ) : art === 'aktivitaeten' ? (
          <AktivitaetenDetail h={historie} n={zeitraum} key={String(zeitraum)} />
        ) : (
          <MetrikDetail art={art} m={m!} h={historie} n={zeitraum} key={art + String(zeitraum)} />
        )}
      </div>
    </div>
  );
}

// ---------- Allgemeine Detailansicht für eine Kennzahl ----------
function MetrikDetail({ art, m, h, n }: { art: DetailArt; m: Metrik; h: Hist; n: number | null }) {
  const alle = useMemo(() => m.reihe(h), [m, h]);
  const werte = imZeitraum(alle, n);
  const vorher = davor(alle, n);
  const fd = m.formatDiff ?? m.format;
  const schnitt = mittel(werte.map((w) => w.v));
  const schnittVorher = mittel(vorher.map((w) => w.v));
  const sortiert = [...werte].sort((a, b) => a.v - b.v);
  const bester = m.besser === 'hoch' ? sortiert.at(-1) : sortiert[0];
  const schlechtester = m.besser === 'hoch' ? sortiert[0] : sortiert.at(-1);
  const tr = trend30(werte);
  const st = streuung(werte.map((w) => w.v));
  const fenster = n !== null && n <= 90 ? 7 : 30;
  const gleit = gleitend(alle, fenster).filter((p) => werte.length && p.tag >= werte[0].tag);

  // Monate
  const monate = monatsMittel(alle);
  const letzteMonate = n === null ? monate : monate.slice(-13);
  const dieser = monate.at(-1), letzter = monate.at(-2);
  const vorjahr = dieser ? monate.find((x) => x.monat === `${Number(dieser.monat.slice(0, 4)) - 1}${dieser.monat.slice(4)}`) : undefined;

  // Wochentage
  const wt = wochentagMittel(werte);
  const wtGueltig = wt.filter((w) => w.v !== null && w.n >= 2) as { tag: string; v: number; n: number }[];
  const wtBest = wtGueltig.length ? wtGueltig.reduce((a, b) => (m.besser === 'hoch' ? (b.v > a.v ? b : a) : (b.v < a.v ? b : a))) : null;
  const wtSchlecht = wtGueltig.length ? wtGueltig.reduce((a, b) => (m.besser === 'hoch' ? (b.v < a.v ? b : a) : (b.v > a.v ? b : a))) : null;
  const langeName = (k: string) => ({ Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' } as Record<string, string>)[k];

  if (!alle.length) return <div className="hinweisbox">Für «{m.titel}» gibt es noch keine Daten.</div>;

  return (
    <div className="ges-detail">
      <p className="leise ges-erklaerung">{m.erklaerung}</p>

      <div className="ges-kennzahlen in">
        <Kennzahl titel={n === null ? 'Ø gesamt' : `Ø ${n} Tage`} wert={schnitt === null ? '—' : <Zaehler wert={schnitt} format={m.format} />}
          unter={n !== null ? <>vs. {n} Tage davor: <Veraenderung jetzt={schnitt} vorher={schnittVorher} besser={m.besser} format={fd} /></> : `${werte.length} Messungen`} />
        <Kennzahl titel="Bester Wert" wert={bester ? m.format(bester.v) : '—'} unter={bester ? datumLang(bester.tag) : ''} farbe="#15803d" />
        <Kennzahl titel="Schlechtester Wert" wert={schlechtester ? m.format(schlechtester.v) : '—'} unter={schlechtester ? datumLang(schlechtester.tag) : ''} farbe="#c2410c" />
        <Kennzahl titel="Trend pro Monat" wert={tr === null ? '—' : Math.abs(tr) < (st ?? 1) * 0.05 ? 'stabil' : <span style={{ color: (m.besser === 'hoch') === tr > 0 ? '#15803d' : '#c2410c' }}>{tr > 0 ? '+' : '−'}{fd(Math.abs(tr))}</span>}
          unter={st !== null ? `Schwankung ± ${fd(st)}` : ''} />
      </div>

      <section className="karte in" style={{ animationDelay: '80ms' }}>
        <h3 className="karte-titel">Verlauf <small>Punkte = Tage · Linie = Ø {fenster} Tage</small></h3>
        <Verlauf werte={werte} schnitt={gleit} farbe={m.farbe} format={m.format} ziel={m.ziel} zielText={m.zielText} hoehe={240} />
      </section>

      {art === 'schlaf' && <SchlafExtra h={h} n={n} />}
      {art === 'schritte' && <SchritteExtra h={h} n={n} />}

      <div className="ges-detail-zwei">
        <section className="karte in" style={{ animationDelay: '140ms' }}>
          <h3 className="karte-titel">Monate <small>Ø pro Monat</small></h3>
          <div className="ges-saetze">
            {dieser && letzter && (
              <div><b>{monatName(dieser.monat, false)}</b>{dieser.monat === heute().slice(0, 7) ? ' (bis heute)' : ''} gegenüber <b>{monatName(letzter.monat, false)}</b>: {m.format(dieser.v)} statt {m.format(letzter.v)} · <Veraenderung jetzt={dieser.v} vorher={letzter.v} besser={m.besser} format={fd} /></div>
            )}
            {dieser && vorjahr && (
              <div>Gegenüber <b>{monatName(vorjahr.monat)}</b>: {m.format(vorjahr.v)} · <Veraenderung jetzt={dieser.v} vorher={vorjahr.v} besser={m.besser} format={fd} /></div>
            )}
          </div>
          <Balken
            werte={letzteMonate.map((x) => ({ label: monatName(x.monat, false), v: x.v, titel: `${monatName(x.monat)}: ${m.format(x.v)} (${x.n} Tage)` }))}
            farbe={m.farbe} format={m.format} hervor={[letzteMonate.length - 1]} ziel={m.ziel} zielText={m.zielText}
            beschriftungJede={letzteMonate.length > 18 ? 3 : 1}
          />
        </section>

        <section className="karte in" style={{ animationDelay: '200ms' }}>
          <h3 className="karte-titel">Wochentage <small>im gewählten Zeitraum</small></h3>
          <div className="ges-saetze">
            {wtBest && wtSchlecht && wtBest.tag !== wtSchlecht.tag ? (
              <div>Am besten am <b>{langeName(wtBest.tag)}</b> ({m.format(wtBest.v)}), am schwächsten am <b>{langeName(wtSchlecht.tag)}</b> ({m.format(wtSchlecht.v)}).</div>
            ) : <div className="leise">Noch zu wenig Daten für ein Muster.</div>}
          </div>
          <Balken werte={wt.map((w) => ({ label: w.tag, v: w.v, titel: `${langeName(w.tag)}: ${w.v === null ? '—' : m.format(w.v)} (${w.n} Tage)` }))} farbe={m.farbe} format={m.format}
            hervor={wtBest ? [WOCHENTAGE.indexOf(wtBest.tag)] : []} />
        </section>
      </div>

      {(art === 'schlaf' || art === 'hrv' || art === 'ruhepuls' || art === 'bodybattery') && <Zusammenhaenge art={art} h={h} m={m} />}
    </div>
  );
}

// ---------- Zusammenhänge: was hängt mit dem Wert zusammen? ----------
function Zusammenhaenge({ art, h, m }: { art: DetailArt; h: Hist; m: Metrik }) {
  const ergebnisse = useMemo(() => {
    const ziel: Wert[] = art === 'schlaf'
      ? h.naechte.filter((x) => x.score !== null).map((x) => ({ tag: x.tag, v: x.score as number }))
      : m.reihe(h);
    const zielFormat = art === 'schlaf' ? (v: number) => `Score ${Math.round(v)}` : m.format;
    const training = new Map<string, number>();
    for (const a of h.aktivitaeten) {
      const tag = new Date(a.zeit).toLocaleDateString('sv-SE');
      training.set(tag, (training.get(tag) || 0) + (a.dauerS || 0) / 60);
    }
    const alleTage = h.tage.map((t) => t.tag);
    const faktoren: { name: string; reihe: Wert[]; versatz: number; text: (g: number) => [string, string] }[] = [
      { name: 'Schritte', reihe: h.tage.filter((t) => t.schritte).map((t) => ({ tag: t.tag, v: t.schritte as number })), versatz: -1,
        text: (g) => [`Nach Tagen mit mehr als ${zahl(g)} Schritten`, `nach Tagen mit weniger`] },
      { name: 'Stress', reihe: h.tage.filter((t) => t.stress !== null).map((t) => ({ tag: t.tag, v: t.stress as number })), versatz: -1,
        text: (g) => [`Nach stressigen Tagen (Ø über ${Math.round(g)})`, `nach ruhigeren Tagen`] },
      { name: 'Training', reihe: alleTage.map((tag) => ({ tag, v: training.get(tag) || 0 })), versatz: -1,
        text: (g) => [g > 0 ? `Nach Tagen mit mehr als ${Math.round(g)} Min Training` : 'Nach Tagen mit Training', 'nach Tagen ohne (oder mit wenig)'] },
      { name: 'Intensität', reihe: h.tage.map((t) => ({ tag: t.tag, v: t.intensitaet })), versatz: -1,
        text: (g) => [`Nach Tagen mit mehr als ${Math.round(g)} Intensitätsminuten`, 'nach ruhigeren Tagen'] },
    ];
    if (art !== 'ruhepuls') {
      // Einschlafzeit (Minuten nach 18 Uhr), gleiche Nacht
      faktoren.push({
        name: 'Einschlafzeit',
        reihe: h.naechte.map((x) => { const d = new Date(x.start); return { tag: x.tag, v: ((d.getHours() * 60 + d.getMinutes() - 18 * 60) + 1440) % 1440 }; }),
        versatz: 0,
        text: (g) => [`Wenn du nach ${uhrzeitAusMinuten(g + 18 * 60)} einschläfst`, 'wenn du früher einschläfst'],
      });
    }
    return faktoren
      .map((f) => ({ f, z: zusammenhang(ziel, f.reihe, f.versatz) }))
      .filter((x): x is { f: (typeof faktoren)[number]; z: NonNullable<ReturnType<typeof zusammenhang>> } => x.z !== null)
      .sort((a, b) => b.z.staerke - a.z.staerke)
      .map(({ f, z }) => {
        const [hochText, tiefText] = f.text(z.grenze);
        const gut = m.besser === 'hoch' ? z.diff > 0 : z.diff < 0;
        return { name: f.name, hochText, tiefText, z, gut, zielFormat };
      });
  }, [art, h, m]);

  return (
    <section className="karte in" style={{ animationDelay: '260ms' }}>
      <h3 className="karte-titel">Was hängt damit zusammen? <small>über alle Daten</small></h3>
      <p className="leise" style={{ fontSize: 12, margin: '0 0 10px' }}>Vergleicht deine eigenen Tage miteinander. Ein Zusammenhang ist noch kein Beweis für die Ursache.</p>
      {!ergebnisse.length && <div className="ges-leer">Noch zu wenig Daten (mindestens 30 Tage nötig)</div>}
      <div className="ges-zusammen">
        {ergebnisse.map((e, i) => {
          const deutlich = e.z.staerke >= 0.15;
          return (
            <div key={e.name} className="ges-zusammen-zeile slide" style={{ animationDelay: `${300 + i * 80}ms`, opacity: deutlich ? 1 : 0.6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{e.hochText}</div>
                <div className="leise" style={{ fontSize: 12 }}>
                  {e.zielFormat(e.z.mittelHoch)} statt {e.zielFormat(e.z.mittelTief)} {e.tiefText}{!deutlich ? ' · kaum Unterschied' : ''}
                </div>
              </div>
              <span className="pille" style={{ background: !deutlich ? 'var(--bg)' : e.gut ? '#e3f5ea' : '#fdf1dc', color: !deutlich ? 'var(--muted)' : e.gut ? '#15803d' : '#b45309', fontWeight: 700 }}>
                {!deutlich ? 'neutral' : e.gut ? 'eher gut' : 'eher schlecht'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Schlaf: Phasen, Rhythmus, Schlafschuld ----------
function SchlafExtra({ h, n }: { h: Hist; n: number | null }) {
  const im = n === null ? h.naechte : h.naechte.filter((x) => x.tag > tagPlus(heute(), -n));
  const vor = n === null ? [] : h.naechte.filter((x) => x.tag > tagPlus(heute(), -2 * n) && x.tag <= tagPlus(heute(), -n));
  const phase = (l: typeof im) => ({
    tiefS: mittel(l.map((x) => x.tiefS)) ?? 0, leichtS: mittel(l.map((x) => x.leichtS)) ?? 0, remS: mittel(l.map((x) => x.remS)) ?? 0, wachS: mittel(l.map((x) => x.wachS)) ?? 0,
  });
  const p = phase(im);
  const score = mittel(im.map((x) => x.score)), scoreVor = mittel(vor.map((x) => x.score));
  // Einschlaf-/Aufwachzeit als Minuten (Einschlafen relativ zu 18 Uhr, damit Mitternacht nicht stört)
  const ein = im.map((x) => { const d = new Date(x.start); return ((d.getHours() * 60 + d.getMinutes() - 1080) + 1440) % 1440; });
  const auf = im.map((x) => { const d = new Date(x.ende); return d.getHours() * 60 + d.getMinutes(); });
  const istWe = (tag: string) => { const w = alsDatum(tag).getDay(); return w === 0 || w === 6; }; // Nacht auf Sa/So
  const mitte = (l: typeof im) => mittel(l.map((x) => { const d = new Date((x.start + x.ende) / 2); return ((d.getHours() * 60 + d.getMinutes() - 1080) + 1440) % 1440; }));
  const mWerk = mitte(im.filter((x) => !istWe(x.tag))), mWe = mitte(im.filter((x) => istWe(x.tag)));
  const jetlag = mWerk !== null && mWe !== null ? mWe - mWerk : null;
  const sieben = h.naechte.slice(-7);
  const schuld = sieben.reduce((a, x) => a + (8 * 3600 - x.dauerS), 0);

  return (
    <div className="ges-detail-zwei">
      <section className="karte in" style={{ animationDelay: '110ms', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 className="karte-titel">Schlafphasen <small>Ø pro Nacht</small></h3>
        <SchlafPhasen n={p} hoehe={18} />
        <div className="ges-kennzahlen klein">
          <Kennzahl titel="Schlaf-Score Ø" wert={score === null ? '—' : Math.round(score)} farbe={schlafStufe(score).farbe}
            unter={n !== null ? <Veraenderung jetzt={score} vorher={scoreVor} besser="hoch" format={(v) => `${Math.round(v)}`} prozentZeigen={false} /> : undefined} />
          <Kennzahl titel="Schlafschuld (7 Nächte)" wert={schuld > 0 ? dauer(schuld) : 'keine'} farbe={schuld > 3 * 3600 ? '#c2410c' : schuld > 0 ? undefined : '#15803d'} unter="gegenüber 8 h pro Nacht" />
        </div>
      </section>
      <section className="karte in" style={{ animationDelay: '130ms', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 className="karte-titel">Schlafrhythmus</h3>
        <div className="ges-kennzahlen klein">
          <Kennzahl titel="Ø Einschlafen" wert={ein.length ? uhrzeitAusMinuten((mittel(ein) as number) + 1080) : '—'} unter={ein.length > 2 ? `± ${Math.round(streuung(ein) as number)} Min` : ''} />
          <Kennzahl titel="Ø Aufwachen" wert={auf.length ? uhrzeitAusMinuten(mittel(auf) as number) : '—'} unter={auf.length > 2 ? `± ${Math.round(streuung(auf) as number)} Min` : ''} />
        </div>
        <div className="ges-saetze">
          {jetlag !== null && (
            <div>
              <b>Wochenende vs. Werktage:</b> Die Mitte deines Schlafs verschiebt sich am Wochenende um <b>{Math.abs(Math.round(jetlag))} Min {jetlag >= 0 ? 'nach hinten' : 'nach vorne'}</b>.
              {' '}{Math.abs(jetlag) > 60 ? 'Das ist ein spürbarer «sozialer Jetlag» – regelmässigere Zeiten verbessern meist Schlaf und HRV.' : 'Dein Rhythmus ist recht regelmässig.'}
            </div>
          )}
          <div className="leise" style={{ fontSize: 12 }}>Je kleiner die Streuung (±), desto regelmässiger dein Rhythmus.</div>
        </div>
      </section>
    </div>
  );
}

// ---------- Schritte: Intensitätsminuten pro Woche, Kilometer pro Monat ----------
function SchritteExtra({ h, n }: { h: Hist; n: number | null }) {
  const wochen = wochenSumme(h.tage.map((t) => ({ tag: t.tag, v: t.intensitaet })));
  const zeig = wochen.slice(n === null ? -52 : -Math.max(4, Math.ceil(n / 7)));
  const km = monatsSumme(h.tage.filter((t) => t.distanzM).map((t) => ({ tag: t.tag, v: (t.distanzM as number) / 1000 }))).slice(-12);
  const erfuellt = zeig.filter((w) => w.v >= 150).length;
  return (
    <div className="ges-detail-zwei">
      <section className="karte in" style={{ animationDelay: '110ms' }}>
        <h3 className="karte-titel">Intensitätsminuten pro Woche <small>Ziel 150 · {erfuellt} von {zeig.length} Wochen erreicht</small></h3>
        <Balken werte={zeig.map((w) => ({ label: alsDatum(w.tag).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' }), v: w.v, titel: `Woche ab ${datumLang(w.tag)}: ${Math.round(w.v)} Min`, farbe: w.v >= 150 ? '#7e3fd6' : '#7e3fd655' }))}
          farbe="#7e3fd6" format={(v) => `${Math.round(v)}`} ziel={150} zielText="150" beschriftungJede={zeig.length > 16 ? 4 : 2} />
      </section>
      <section className="karte in" style={{ animationDelay: '130ms' }}>
        <h3 className="karte-titel">Kilometer pro Monat <small>zu Fuss und Training</small></h3>
        <Balken werte={km.map((x) => ({ label: monatName(x.monat, false), v: x.v, titel: `${monatName(x.monat)}: ${komma(x.v, 1)} km` }))} farbe="#2457f5" format={(v) => `${Math.round(v)}`} hervor={[km.length - 1]} />
      </section>
    </div>
  );
}

// ---------- Aktivitäten ----------
function AktivitaetenDetail({ h, n }: { h: Hist; n: number | null }) {
  const [mehr, setMehr] = useState(false);
  const grenze = n === null ? '' : tagPlus(heute(), -n);
  const tagA = (a: GarminAktivitaet) => new Date(a.zeit).toLocaleDateString('sv-SE');
  const im = h.aktivitaeten.filter((a) => n === null || tagA(a) > grenze);
  const vor = n === null ? [] : h.aktivitaeten.filter((a) => tagA(a) > tagPlus(heute(), -2 * n) && tagA(a) <= grenze);
  const summe = (l: GarminAktivitaet[], f: (a: GarminAktivitaet) => number | null) => l.reduce((s, a) => s + (f(a) || 0), 0);
  const stunden = summe(im, (a) => a.dauerS) / 3600, stundenVor = summe(vor, (a) => a.dauerS) / 3600;
  const km = summe(im, (a) => a.distanzM) / 1000, kmVor = summe(vor, (a) => a.distanzM) / 1000;
  const kcal = summe(im, (a) => a.kcal), kcalVor = summe(vor, (a) => a.kcal);

  const arten = new Map<string, { name: string; farbe: string; icon: IconName; n: number; s: number }>();
  for (const a of im) {
    const art = aktivitaetsArt(a.typ);
    const e = arten.get(art.name) || { name: art.name, farbe: art.farbe, icon: art.icon, n: 0, s: 0 };
    e.n++; e.s += a.dauerS || 0;
    arten.set(art.name, e);
  }
  const artenListe = [...arten.values()].sort((a, b) => b.s - a.s);
  const maxS = artenListe[0]?.s || 1;

  const proWoche = wochenSumme(h.aktivitaeten.map((a) => ({ tag: tagA(a), v: (a.dauerS || 0) / 3600 })));
  // Leere Wochen auffüllen
  const wochen: Wert[] = [];
  const startTag = proWoche.length ? proWoche[0].tag : heute();
  const wMap = new Map(proWoche.map((w) => [w.tag, w.v]));
  for (let d = startTag; d <= heute(); d = tagPlus(d, 7)) wochen.push({ tag: d, v: wMap.get(d) || 0 });
  const zeigWochen = wochen.slice(n === null ? -52 : -Math.max(4, Math.ceil(n / 7)));
  const monate = monatsSumme(h.aktivitaeten.map((a) => ({ tag: tagA(a), v: (a.dauerS || 0) / 3600 }))).slice(-13);

  const laengste = [...im].sort((a, b) => (b.dauerS || 0) - (a.dauerS || 0))[0];
  const weiteste = [...im].sort((a, b) => (b.distanzM || 0) - (a.distanzM || 0))[0];
  const haerteste = [...im].sort((a, b) => (b.last || 0) - (a.last || 0))[0];

  if (!h.aktivitaeten.length) return <div className="hinweisbox">Noch keine Aktivitäten erfasst.</div>;

  return (
    <div className="ges-detail">
      <div className="ges-kennzahlen in">
        <Kennzahl titel="Aktivitäten" wert={<Zaehler wert={im.length} />} unter={n !== null ? <Veraenderung jetzt={im.length} vorher={vor.length} besser="hoch" format={(v) => `${Math.round(v)}`} /> : undefined} />
        <Kennzahl titel="Trainingszeit" wert={dauer(stunden * 3600)} unter={n !== null ? <Veraenderung jetzt={stunden} vorher={stundenVor} besser="hoch" format={(v) => dauer(v * 3600)} /> : undefined} />
        <Kennzahl titel="Distanz" wert={`${komma(km, km >= 100 ? 0 : 1)} km`} unter={n !== null ? <Veraenderung jetzt={km} vorher={kmVor} besser="hoch" format={(v) => `${komma(v, 1)} km`} /> : undefined} />
        <Kennzahl titel="Kalorien" wert={`${zahl(kcal)} kcal`} unter={n !== null ? <Veraenderung jetzt={kcal} vorher={kcalVor} besser="hoch" format={(v) => zahl(v)} /> : undefined} />
      </div>

      <div className="ges-detail-zwei">
        <section className="karte in" style={{ animationDelay: '80ms' }}>
          <h3 className="karte-titel">Trainingszeit pro Woche <small>Stunden</small></h3>
          <Balken werte={zeigWochen.map((w) => ({ label: alsDatum(w.tag).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' }), v: w.v, titel: `Woche ab ${datumLang(w.tag)}: ${dauer(w.v * 3600)}` }))}
            farbe="#2457f5" format={(v) => komma(v, 1)} hervor={[zeigWochen.length - 1]} beschriftungJede={zeigWochen.length > 16 ? 4 : 2} />
        </section>
        <section className="karte in" style={{ animationDelay: '120ms' }}>
          <h3 className="karte-titel">Nach Sportart <small>im Zeitraum</small></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
            {artenListe.map((a, i) => (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="ges-akt-ico" style={{ background: a.farbe + '17', color: a.farbe }}><Icon name={a.icon} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><b>{a.name}</b><span className="leise">{a.n}× · {dauer(a.s)}</span></div>
                  <div className="balken" style={{ height: 8 }}><span className="gx" style={{ width: `${(a.s / maxS) * 100}%`, background: a.farbe, animationDelay: `${200 + i * 80}ms` }} /></div>
                </div>
              </div>
            ))}
            {!artenListe.length && <div className="ges-leer">Keine Aktivitäten im Zeitraum</div>}
          </div>
        </section>
      </div>

      <div className="ges-detail-zwei">
        <section className="karte in" style={{ animationDelay: '160ms' }}>
          <h3 className="karte-titel">Monate <small>Trainingsstunden</small></h3>
          <Balken werte={monate.map((x) => ({ label: monatName(x.monat, false), v: x.v, titel: `${monatName(x.monat)}: ${dauer(x.v * 3600)}` }))} farbe="#2457f5" format={(v) => komma(v, 0)} hervor={[monate.length - 1]} />
        </section>
        <section className="karte in" style={{ animationDelay: '200ms', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 className="karte-titel">Rekorde <small>im Zeitraum</small></h3>
          <Rekord titel="Längste" a={laengste} wert={laengste ? dauer(laengste.dauerS) : ''} />
          <Rekord titel="Weiteste" a={weiteste && (weiteste.distanzM || 0) > 0 ? weiteste : undefined} wert={weiteste ? `${komma((weiteste.distanzM || 0) / 1000, 1)} km` : ''} />
          <Rekord titel="Härteste (Trainingslast)" a={haerteste && haerteste.last ? haerteste : undefined} wert={haerteste?.last ? `${haerteste.last}` : ''} />
        </section>
      </div>

      <section className="karte in" style={{ animationDelay: '240ms' }}>
        <h3 className="karte-titel">Alle Aktivitäten <small>{im.length} im Zeitraum</small></h3>
        {(mehr ? im : im.slice(0, 12)).map((a, i) => <AktivitaetZeile key={a.zeit + a.name} a={a} i={i} />)}
        {im.length > 12 && <button className="knopf-klein press" style={{ marginTop: 10 }} onClick={() => setMehr(!mehr)}>{mehr ? 'Weniger anzeigen' : `Alle ${im.length} anzeigen`}</button>}
      </section>
    </div>
  );
}

function Rekord({ titel, a, wert }: { titel: string; a?: GarminAktivitaet; wert: string }) {
  if (!a) return null;
  const art = aktivitaetsArt(a.typ);
  return (
    <div className="zeile">
      <span className="ges-akt-ico" style={{ background: art.farbe + '17', color: art.farbe }}><Icon name={art.icon} size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>{titel}</span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || art.name}</span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <b style={{ display: 'block', color: art.farbe }}>{wert}</b>
        <span className="leise" style={{ fontSize: 12 }}>{new Date(a.zeit).toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </span>
    </div>
  );
}

export function AktivitaetZeile({ a, i }: { a: GarminAktivitaet; i: number }) {
  const art = aktivitaetsArt(a.typ);
  const teile = [
    a.dauerS ? dauer(a.dauerS) : null,
    a.distanzM && a.distanzM > 50 ? `${komma(a.distanzM / 1000, 1)} km` : null,
    a.pulsSchnitt ? `Ø ${a.pulsSchnitt} bpm` : null,
    a.kcal ? `${zahl(a.kcal)} kcal` : null,
  ].filter(Boolean);
  return (
    <div className="zeile slide" style={{ animationDelay: `${Math.min(900, 200 + i * 50)}ms` }}>
      <span className="ges-akt-ico" style={{ background: art.farbe + '17', color: art.farbe }}><Icon name={art.icon} size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || art.name}</span>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>{teile.join(' · ')}</span>
      </span>
      <span style={{ textAlign: 'right', flex: 'none' }}>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>{Date.now() - a.zeit < 7 * 86400_000 ? relativ(a.zeit) : new Date(a.zeit).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })}</span>
        {a.effekt !== null && <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: art.farbe }} title="Aerober Trainingseffekt">TE {komma(a.effekt)}</span>}
      </span>
    </div>
  );
}

export function Hinweis({ children }: { children: ReactNode }) {
  return <div className="hinweisbox">{children}</div>;
}
