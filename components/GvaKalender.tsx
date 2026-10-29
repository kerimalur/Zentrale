'use client';
// GVA-Kalender: Monate Januar bis Dezember; ein Monat zeigt alle GVAs, die in diesem Monat zum ersten Mal getroffen wurden
// (nicht die, die im Monat entstanden sind), nach Treffer-Zeit sortiert. Antippen öffnet das Muster (12 Kerzen) und den Treffer.
// Dazu eine Markdown-Tabelle zum Kopieren (Obsidian) mit leeren Spalten zum Auswerten.
import { useEffect, useMemo, useState } from 'react';
import { holen } from '@/lib/api';
import { TF_TEXT, datumCh, kurs, type TSeite, type TTf } from '@/lib/trading';
import { Popup } from './NetzBausteine';

interface Treffer {
  id: string; pair: string; tf: TTf; seite: TSeite; lvl: number; entstanden: string; t: number; monat: number; datum: string; uhr: string; ungefaehr: boolean;
}
interface Monat { jahr: number; bereit: number; gesamt: number; treffer: Treffer[] }
interface Kerze { start: string; ende: string; o: number; h: number; l: number; c: number }
interface Detail {
  id: string; pair: string; tf: TTf; seite: TSeite; status: string; lvl: number; pip: number; alt: boolean;
  entstanden: string; bestaetigt: string | null;
  A: { start: string; o: number; c: number }; B: { start: string; o: number; c: number }; verhaeltnis: number;
  muster: Kerze[];
  treffer: { t: number; ungefaehr: boolean; datum: string; uhr: string } | null;
  stunden: { t: number; o: number; h: number; l: number; c: number; treffer: boolean }[];
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const seiteText = (s: string) => (s === 'long' ? 'Long' : 'Short');
const tagUhr = (datum: string, uhr: string, ungefaehr: boolean) => `${datumCh(datum)}${ungefaehr ? '' : ' ' + uhr}`;

export function GvaKalender() {
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [monat, setMonat] = useState(new Date().getMonth() + 1);
  const [tfs, setTfs] = useState<Record<TTf, boolean>>({ '3D': true, W: true, M: true });
  const [d, setD] = useState<Monat | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<Treffer | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    let weg = false;
    setD(null); setFehler(null);
    holen<Monat>(`/api/trading/monat?jahr=${jahr}`).then((r) => { if (!weg) setD(r); }).catch((e) => { if (!weg) setFehler((e as Error).message); });
    return () => { weg = true; };
  }, [jahr]);

  const gefiltert = useMemo(() => (d?.treffer || []).filter((t) => tfs[t.tf]), [d, tfs]);
  const proMonat = useMemo(() => {
    const z = new Array(12).fill(0) as number[];
    for (const t of gefiltert) z[t.monat - 1]++;
    return z;
  }, [gefiltert]);
  const liste = useMemo(() => gefiltert.filter((t) => t.monat === monat), [gefiltert, monat]);
  const long = liste.filter((t) => t.seite === 'long').length;

  async function markdown() {
    const kopf = '| Treffer | Paar | Zeitrahmen | Seite | Level | Entstanden | Nutzbar | Ergebnis (R) |\n|---|---|---|---|---|---|---|---|';
    const zeilen = liste.map((t) => `| ${tagUhr(t.datum, t.uhr, t.ungefaehr)} | ${t.pair} | ${TF_TEXT[t.tf]} | ${seiteText(t.seite)} | ${kurs(t.pair, t.lvl)} | ${datumCh(t.entstanden)} |  |  |`);
    try { await navigator.clipboard.writeText([kopf, ...zeilen].join('\n')); setKopiert(true); setTimeout(() => setKopiert(false), 2000); }
    catch { setFehler('Kopieren nicht möglich (Browser-Berechtigung).'); }
  }

  return (
    <section className="karte in" aria-label="GVA-Kalender">
      <h2 className="karte-titel">GVA-Kalender <small>nach Treffer-Monat</small></h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="knopf-klein" onClick={() => setJahr(jahr - 1)} aria-label="Vorjahr">‹</button>
        <b>{jahr}</b>
        <button className="knopf-klein" onClick={() => setJahr(jahr + 1)} aria-label="Folgejahr" disabled={jahr >= new Date().getFullYear()}>›</button>
        <span style={{ flex: 1 }} />
        {(['3D', 'W', 'M'] as TTf[]).map((tf) => (
          <button key={tf} className="knopf-klein" aria-pressed={tfs[tf]} onClick={() => setTfs({ ...tfs, [tf]: !tfs[tf] })} style={{ opacity: tfs[tf] ? 1 : 0.45, fontWeight: tfs[tf] ? 700 : 500 }}>{TF_TEXT[tf]}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, marginBottom: 12 }}>
        {KURZ.map((k, i) => (
          <button key={k} className="knopf-klein" aria-pressed={monat === i + 1} onClick={() => setMonat(i + 1)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 4px', background: monat === i + 1 ? 'var(--accent)' : undefined, color: monat === i + 1 ? '#fff' : undefined }}>
            <span>{k}</span>
            <b style={{ fontSize: 15 }}>{proMonat[i]}</b>
          </button>
        ))}
      </div>

      {fehler && <div className="fehlerbox">{fehler}</div>}
      {!d && !fehler && <div className="leise">Lade …</div>}
      {d && d.bereit < d.gesamt && <div className="leise" style={{ fontSize: 12.5, marginBottom: 8 }}>Erst {d.bereit} von {d.gesamt} Paaren berechnet – die Liste ist noch unvollständig.</div>}
      {d && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <b>{MONATE[monat - 1]} {jahr}</b>
            <span className="leise" style={{ fontSize: 13 }}>{liste.length} GVAs getroffen · {long} Long · {liste.length - long} Short</span>
            <span style={{ flex: 1 }} />
            <button className="knopf-klein" onClick={markdown} disabled={liste.length === 0}>{kopiert ? 'Kopiert ✓' : 'Als Markdown kopieren'}</button>
          </div>
          {liste.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Keine GVA wurde in diesem Monat getroffen.</div>}
          {liste.map((t) => (
            <button key={t.id} className="zeile press nw-zeile" onClick={() => setOffen(t)} style={{ width: '100%', background: 'transparent' }}>
              <span className="fk-punkt" style={{ background: t.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)' }} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <b>{t.pair}</b> <span className="leise" style={{ fontSize: 13 }}>{seiteText(t.seite)} {TF_TEXT[t.tf]}</span>
                <div className="leise" style={{ fontSize: 12 }}>Level <span className="tr-zahl">{kurs(t.pair, t.lvl)}</span> · entstanden {datumCh(t.entstanden)}</div>
              </span>
              <span style={{ textAlign: 'right', fontSize: 13 }}><b>{tagUhr(t.datum, t.uhr, t.ungefaehr)}</b></span>
            </button>
          ))}
          <div className="leise" style={{ fontSize: 12, marginTop: 8 }}>
            Gezählt wird der erste Treffer einer Linie (Zeit in Zürich), nicht ihre Entstehung. Vom Nachbar-Filter verworfene Linien sind nicht dabei.
          </div>
        </>
      )}
      {offen && <DetailPopup t={offen} onClose={() => setOffen(null)} />}
    </section>
  );
}

function DetailPopup({ t, onClose }: { t: Treffer; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    holen<Detail>(`/api/trading/gva?id=${encodeURIComponent(t.id)}`).then(setD).catch((e) => setFehler((e as Error).message));
  }, [t.id]);
  const farbe = t.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)';
  return (
    <Popup titel={`${t.pair} · ${seiteText(t.seite)} ${TF_TEXT[t.tf]}`} unter={`Level ${kurs(t.pair, t.lvl)} · getroffen ${tagUhr(t.datum, t.uhr, t.ungefaehr)}`} onClose={onClose} breit>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      {!d && !fehler && <div className="leise">Lade …</div>}
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Wert titel="Preis (Level)" wert={kurs(d.pair, d.lvl)} />
            <Wert titel="Entstanden (Kerze B)" wert={datumCh(d.entstanden)} unter={d.bestaetigt ? `bestätigt ab ${datumCh(d.bestaetigt)}` : 'Kerze B läuft noch'} />
            <Wert titel="Getroffen" wert={d.treffer ? tagUhr(d.treffer.datum, d.treffer.uhr, d.treffer.ungefaehr) : '–'} unter={d.treffer?.ungefaehr ? 'nur Tageskerze, Uhrzeit unbekannt' : undefined} />
            <Wert titel="Körper B / A" wert={`${d.verhaeltnis.toString().replace('.', ',')} ×`} unter={`A ${kurs(d.pair, d.A.o)} → ${kurs(d.pair, d.A.c)} · B ${kurs(d.pair, d.B.o)} → ${kurs(d.pair, d.B.c)}`} />
          </div>
          <h4 className="nw-h">Muster beim Entstehen <small className="leise">12 Kerzen {TF_TEXT[d.tf]}, links älter</small></h4>
          <KerzenChart pair={d.pair} kerzen={d.muster.map((k, i) => ({ ...k, label: k.start, marke: i === d.muster.length - 1 ? 'B' : i === d.muster.length - 2 ? 'A' : '' }))} lvl={d.lvl} farbe={farbe} />
          <h4 className="nw-h">Treffer <small className="leise">Stundenkerzen, 3 Tage davor bis 1 Tag danach</small></h4>
          {d.stunden.length === 0 ? <div className="leise">Keine Stundenkerzen vorhanden (Treffer aus Tageskerzen).</div> : (
            <KerzenChart pair={d.pair} kerzen={d.stunden.map((k) => ({ start: '', ende: '', o: k.o, h: k.h, l: k.l, c: k.c, label: new Date(k.t).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), marke: k.treffer ? '●' : '' }))} lvl={d.lvl} farbe={farbe} />
          )}
        </>
      )}
    </Popup>
  );
}

const Wert = ({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) => (
  <div>
    <div className="leise" style={{ fontSize: 12 }}>{titel}</div>
    <b className="tr-zahl" style={{ fontSize: 16 }}>{wert}</b>
    {unter && <div className="leise" style={{ fontSize: 11.5 }}>{unter}</div>}
  </div>
);

function KerzenChart({ pair, kerzen, lvl, farbe }: { pair: string; kerzen: (Kerze & { label: string; marke: string })[]; lvl: number; farbe: string }) {
  const W = 640, H = 230, R = 62;
  if (kerzen.length < 1) return null;
  let lo = Math.min(...kerzen.map((x) => x.l), lvl), hi = Math.max(...kerzen.map((x) => x.h), lvl);
  const pad = (hi - lo) * 0.06 || 1e-4;
  lo -= pad; hi += pad;
  const y = (v: number) => ((hi - v) / (hi - lo)) * (H - 16);
  const schritt = (W - R) / kerzen.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-chart" role="img" aria-label={`${pair}: Kerzenchart mit GVA-Level`}>
        <line x1={0} x2={W - R} y1={y(lvl)} y2={y(lvl)} stroke={farbe} strokeWidth={1.4} strokeDasharray="5 4" />
        <text x={W - R + 4} y={y(lvl) + 4} fontSize={11} fill={farbe} fontFamily="var(--mono)">{kurs(pair, lvl)}</text>
        {kerzen.map((x, i) => {
          const cx = i * schritt + schritt / 2;
          const f = x.c >= x.o ? '#2f9e5b' : '#c8463a';
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(x.h)} y2={y(x.l)} stroke={f} strokeWidth={1} />
              <rect x={cx - schritt * 0.32} width={schritt * 0.64} y={y(Math.max(x.o, x.c))} height={Math.max(1, Math.abs(y(x.o) - y(x.c)))} fill={f} rx={0.6} />
              {x.marke && <text x={cx} y={H - 3} fontSize={11} textAnchor="middle" fill="var(--accent)" fontWeight={700}>{x.marke}</text>}
            </g>
          );
        })}
      </svg>
      <div className="leise" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>{kerzen[0].label.length === 10 ? datumCh(kerzen[0].label) : kerzen[0].label}</span>
        <span>{kerzen[kerzen.length - 1].label.length === 10 ? datumCh(kerzen[kerzen.length - 1].label) : kerzen[kerzen.length - 1].label}</span>
      </div>
    </div>
  );
}
