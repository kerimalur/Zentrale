'use client';
// Tab «Trading»: GVA-Linien (3D, Woche, Monat) aller 28 Paare als Heatmap, nächste Linie je Seite, erste Treffer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { holen, senden } from '@/lib/api';
import { relativ } from '@/lib/format';
import { TF_TEXT, datumCh, kurs, type TEinstellungen, type TOffen, type TPaarDetail, type TPaarKurz, type TTf, type TradingZustand } from '@/lib/trading';
import { Icon, Schalter } from './ui';
import { Popup } from './NetzBausteine';

const TFS: TTf[] = ['3D', 'W', 'M'];
const GRUEN = '21, 128, 61';
const ROT = '180, 35, 24';

// Je näher (gemessen in Tages-ATR), desto kräftiger die Farbe. Ab 4 ATR Abstand nur noch ein Hauch.
function hitze(l: TOffen | null) {
  if (!l) return { background: 'transparent', color: 'var(--muted)' };
  const h = Math.max(0, Math.min(1, 1 - l.abstandAtr / 4));
  return { background: `rgba(${l.seite === 'long' ? GRUEN : ROT}, ${0.07 + h * 0.83})`, color: h > 0.5 ? '#fff' : 'var(--ink)' };
}
const pips = (x: number) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace('.', ','));
const seiteText = (s: string) => (s === 'long' ? 'Long' : 'Short');
const zeitpunkt = (t: number) => new Date(t).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function Trading() {
  const [d, setD] = useState<TradingZustand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sortierung, setSortierung] = useState<'naehe' | 'az'>('naehe');
  const [paar, setPaar] = useState<string | null>(null);
  const [einst, setEinst] = useState(false);

  const laden = useCallback(async () => {
    try { setD(await holen<TradingZustand>('/api/trading')); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    laden();
    const t = setInterval(() => { if (!document.hidden) laden(); }, 30_000);
    return () => clearInterval(t);
  }, [laden]);
  // Während des ersten Ladens schneller nachfragen, damit der Fortschritt sichtbar ist.
  useEffect(() => {
    if (!d?.laedt) return;
    const t = setTimeout(laden, 3000);
    return () => clearTimeout(t);
  }, [d, laden]);

  const zeilen = useMemo(() => {
    if (!d) return [];
    const z = [...d.paare];
    if (sortierung === 'naehe') z.sort((a, b) => (a.naechsteLinie?.abstandAtr ?? 1e9) - (b.naechsteLinie?.abstandAtr ?? 1e9));
    return z;
  }, [d, sortierung]);

  if (fehler && !d) return <div className="karte fehlerbox">Trading nicht ladbar: {fehler}</div>;
  if (!d) return <div className="karte leise">Lade …</div>;

  const tfs = TFS.filter((tf) => d.einstellungen.tfs[tf]);
  const naechste = d.paare.filter((p) => p.naechsteLinie).sort((a, b) => a.naechsteLinie!.abstandAtr - b.naechsteLinie!.abstandAtr).slice(0, 6);
  const fertig = d.paare.filter((p) => p.preis !== undefined).length;
  const offenGesamt = d.paare.reduce((s, p) => s + (p.offen || 0), 0);
  const kaputt = d.paare.filter((p) => p.fehler);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in tr-kopf" aria-label="Stand">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="karte-titel" style={{ marginBottom: 4 }}>GVA-Linien</h2>
          <div className="leise" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <span className={`nw-punkt ${d.marktOffen ? 'gruen' : 'grau'}`} aria-hidden style={{ display: 'inline-block', marginRight: 6 }} />
            {d.marktOffen ? 'Markt offen' : 'Markt geschlossen'}
            {' · '}
            {d.laedt && fertig < d.gesamt ? `lade Kurse ${d.fortschritt}/${d.gesamt} …` : d.stand ? `Kurse ${relativ(d.stand)}` : 'noch keine Kurse'}
            {' · '}{offenGesamt} offene Linien
          </div>
        </div>
        <div className="tr-kopf-rechts">
          <span className={`pille ${d.einstellungen.meldungen && d.meldungenBereit ? 'tr-pille-an' : 'tr-pille-aus'}`}>
            {!d.meldungenBereit ? 'ntfy aus' : d.einstellungen.meldungen ? 'Meldung bei Treffer' : 'Meldungen aus'}
          </span>
          <button className="knopf-klein press" onClick={() => setEinst(true)}>Einstellungen</button>
        </div>
      </section>

      {naechste.length > 0 && (
        <section className="karte in" aria-label="Am nächsten">
          <h2 className="karte-titel">Am nächsten dran <small>nächste offene Linie, egal welche Seite</small></h2>
          <div className="tr-naechste">
            {naechste.map((p) => {
              const l = p.naechsteLinie!;
              return (
                <button key={p.pair} className="press tr-chip" style={hitze(l)} onClick={() => setPaar(p.pair)}>
                  <b>{p.pair}</b>
                  <span>{seiteText(l.seite)} {l.tf}</span>
                  <span className="tr-zahl">{pips(l.abstandPips)} Pips</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="karte in" aria-label="Heatmap">
        <h2 className="karte-titel">
          Alle Paare
          <small className="segment" style={{ width: 'auto', gridTemplateColumns: '1fr 1fr', minWidth: 190 }}>
            <button aria-pressed={sortierung === 'naehe'} onClick={() => setSortierung('naehe')}>Nach Nähe</button>
            <button aria-pressed={sortierung === 'az'} onClick={() => setSortierung('az')}>A–Z</button>
          </small>
        </h2>
        <div className="tr-tabelle-rahmen">
          <table className="tr-tabelle">
            <thead>
              <tr>
                <th rowSpan={2} className="tr-paar-kopf">Paar</th>
                {tfs.map((tf) => <th key={tf} colSpan={2}>{tf}</th>)}
              </tr>
              <tr>
                {tfs.map((tf) => [<th key={tf + 'l'} className="tr-sub">↓ Long</th>, <th key={tf + 's'} className="tr-sub">↑ Short</th>])}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((p) => <Zeile key={p.pair} p={p} tfs={tfs} onClick={() => setPaar(p.pair)} />)}
            </tbody>
          </table>
        </div>
        <div className="leise" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
          Zahl = Abstand in Pips zur nächsten offenen Linie. Long-Linien liegen unter dem Preis, Short-Linien darüber.
          Je kräftiger die Farbe, desto näher (gemessen an der Tagesschwankung). Antippen zeigt alle Linien und den Chart.
          {kaputt.length > 0 && <span style={{ color: 'var(--fehler)' }}> Ohne Kurse: {kaputt.map((p) => p.pair).join(', ')}.</span>}
        </div>
      </section>

      <section className="karte in" aria-label="Treffer">
        <h2 className="karte-titel">Erste Treffer <small>letzte 14 Tage</small></h2>
        {d.treffer.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>{fertig ? 'Keine Linie wurde in den letzten 14 Tagen das erste Mal getroffen.' : 'Kurse werden geladen …'}</div>}
        {d.treffer.map((t) => (
          <button key={t.id} className="zeile press nw-zeile" onClick={() => setPaar(t.pair)} style={{ width: '100%', background: 'transparent' }}>
            <span className="fk-punkt" style={{ background: t.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)' }} />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <b>{t.pair}</b> <span className="leise" style={{ fontSize: 13 }}>{seiteText(t.seite)} {TF_TEXT[t.tf]}</span>
              <div className="leise" style={{ fontSize: 12 }}>Level <span className="tr-zahl">{kurs(t.pair, t.lvl)}</span> · entstanden {datumCh(t.entstanden)}</div>
            </span>
            <span style={{ textAlign: 'right', fontSize: 13 }}>
              <b>{relativ(t.t)}</b>
              <div className="leise" style={{ fontSize: 12 }}>{zeitpunkt(t.t)}</div>
            </span>
          </button>
        ))}
      </section>

      {paar && <PaarPopup pair={paar} onClose={() => setPaar(null)} />}
      {einst && <EinstellungenPopup d={d} onClose={() => { setEinst(false); laden(); }} />}
    </div>
  );
}

function Zeile({ p, tfs, onClick }: { p: TPaarKurz; tfs: TTf[]; onClick: () => void }) {
  return (
    <tr className="press tr-zeile" onClick={onClick} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} aria-label={`${p.pair} öffnen`}>
      <td className="tr-paar">
        <b>{p.pair}</b>
        <div className="leise tr-zahl" style={{ fontSize: 11.5 }}>{p.preis !== undefined ? kurs(p.pair, p.preis) : p.fehler ? 'Fehler' : '…'}</div>
      </td>
      {tfs.map((tf) => {
        const n = p.naechste?.[tf];
        return [n?.long, n?.short].map((l, i) => (
          <td key={tf + i} className="tr-zelle tr-zahl" style={hitze(l || null)} title={l ? `${seiteText(l.seite)} ${tf} · ${kurs(p.pair, l.lvl)} · entstanden ${datumCh(l.entstanden)}` : 'keine offene Linie'}>
            {l ? pips(l.abstandPips) : '—'}
          </td>
        ));
      })}
    </tr>
  );
}

function PaarPopup({ pair, onClose }: { pair: string; onClose: () => void }) {
  const [d, setD] = useState<TPaarDetail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    holen<TPaarDetail>(`/api/trading/paar?p=${pair}`).then(setD).catch((e) => setFehler((e as Error).message));
  }, [pair]);
  return (
    <Popup titel={pair} unter={d ? `Preis ${kurs(pair, d.preis)} · Tagesschwankung Ø ${pips(d.atrTag)} Pips` : undefined} onClose={onClose} breit>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      {!d && !fehler && <div className="leise">Lade …</div>}
      {d && (
        <>
          <Chart d={d} />
          <h4 className="nw-h">Offene Linien</h4>
          {d.offen.length === 0 && <div className="leise" style={{ padding: '6px 0' }}>Keine offenen Linien.</div>}
          {d.offen.map((l) => (
            <div key={l.id} className="zeile" style={{ padding: '9px 0' }}>
              <span className="fk-punkt" style={{ background: l.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{seiteText(l.seite)} {TF_TEXT[l.tf]}</b> <span className="tr-zahl">{kurs(pair, l.lvl)}</span>
                <div className="leise" style={{ fontSize: 12 }}>entstanden {datumCh(l.entstanden)}{l.alt ? ' · aus Tageskerzen (± wenige Pips)' : ''}</div>
              </span>
              <span style={{ textAlign: 'right' }}>
                <b className="tr-zahl">{pips(l.abstandPips)} Pips</b>
                <div className="leise" style={{ fontSize: 12 }}>{l.abstandAtr.toFixed(1).replace('.', ',')} × Tagesschwankung</div>
              </span>
            </div>
          ))}
          <h4 className="nw-h">Erste Treffer</h4>
          {d.treffer.length === 0 && <div className="leise" style={{ padding: '6px 0' }}>Noch keine.</div>}
          {d.treffer.slice(0, 15).map((t) => (
            <div key={t.id} className="zeile" style={{ padding: '9px 0' }}>
              <span className="fk-punkt" style={{ background: t.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)', opacity: 0.55 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {seiteText(t.seite)} {TF_TEXT[t.tf]} <span className="tr-zahl">{kurs(pair, t.lvl)}</span>
                <div className="leise" style={{ fontSize: 12 }}>entstanden {datumCh(t.entstanden)}</div>
              </span>
              <span className="leise" style={{ fontSize: 12.5, textAlign: 'right' }}>{t.ungefaehr ? new Date(t.t).toLocaleDateString('de-CH') : zeitpunkt(t.t)}</span>
            </div>
          ))}
          <div className="leise" style={{ fontSize: 12, marginTop: 8 }}>
            {d.verworfen} GVAs wurden vom Nachbar-Filter verworfen (zu früh wieder angelaufen).
          </div>
        </>
      )}
    </Popup>
  );
}

// Tageskerzen der letzten 90 Handelstage mit den offenen Linien, die im Bild liegen.
function Chart({ d }: { d: TPaarDetail }) {
  const W = 640, H = 250, R = 58;
  const k = d.chart;
  if (k.length < 2) return null;
  let lo = Math.min(...k.map((x) => x.l)), hi = Math.max(...k.map((x) => x.h));
  const spanne = hi - lo;
  // Die nächste Linie je Seite ins Bild holen, wenn sie nicht zu weit weg ist.
  const nl = d.offen.find((l) => l.seite === 'long'), ns = d.offen.find((l) => l.seite === 'short');
  if (nl && nl.lvl >= lo - spanne) lo = Math.min(lo, nl.lvl);
  if (ns && ns.lvl <= hi + spanne) hi = Math.max(hi, ns.lvl);
  const pad = (hi - lo) * 0.05;
  lo -= pad; hi += pad;
  const y = (v: number) => ((hi - v) / (hi - lo)) * H;
  const schritt = (W - R) / k.length;
  const sichtbar = d.offen.filter((l) => l.lvl >= lo && l.lvl <= hi);
  const ausserhalb = d.offen.length - sichtbar.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tr-chart" role="img" aria-label={`${d.pair}: Tageskerzen der letzten ${k.length} Handelstage mit offenen GVA-Linien`}>
        {sichtbar.map((l) => (
          <g key={l.id}>
            <line x1={0} x2={W - R} y1={y(l.lvl)} y2={y(l.lvl)} stroke={l.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)'} strokeWidth={l.tf === 'M' ? 2.2 : l.tf === 'W' ? 1.7 : 1.2} strokeDasharray={l.tf === '3D' ? '5 4' : undefined} opacity={0.85} />
            <text x={W - R + 4} y={y(l.lvl) + 4} fontSize={11} fill={l.seite === 'long' ? 'var(--gruen)' : 'var(--fehler)'} fontFamily="var(--mono)">{l.tf}</text>
          </g>
        ))}
        {k.map((x, i) => {
          const cx = i * schritt + schritt / 2;
          const auf = x.c >= x.o;
          const farbe = auf ? '#2f9e5b' : '#c8463a';
          return (
            <g key={x.tag}>
              <line x1={cx} x2={cx} y1={y(x.h)} y2={y(x.l)} stroke={farbe} strokeWidth={1} />
              <rect x={cx - schritt * 0.32} width={schritt * 0.64} y={y(Math.max(x.o, x.c))} height={Math.max(1, Math.abs(y(x.o) - y(x.c)))} fill={farbe} rx={0.6} />
            </g>
          );
        })}
        <line x1={0} x2={W - R} y1={y(d.preis)} y2={y(d.preis)} stroke="var(--accent)" strokeWidth={1} opacity={0.7} />
        <text x={W - R + 4} y={y(d.preis) + 4} fontSize={11} fill="var(--accent)" fontFamily="var(--mono)">{kurs(d.pair, d.preis)}</text>
      </svg>
      <div className="leise" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span>{datumCh(k[0].tag)} – {datumCh(k[k.length - 1].tag)} · gestrichelt 3D, dünn W, dick M</span>
        {ausserhalb > 0 && <span>{ausserhalb} weitere {ausserhalb === 1 ? 'Linie' : 'Linien'} ausserhalb des Bildes</span>}
      </div>
    </div>
  );
}

function EinstellungenPopup({ d, onClose }: { d: TradingZustand; onClose: () => void }) {
  const [e, setE] = useState<TEinstellungen>(d.einstellungen);
  const [laeuft, setLaeuft] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const setz = <K extends keyof TEinstellungen>(k: K, v: TEinstellungen[K]) => setE((x) => ({ ...x, [k]: v }));

  async function speichern() {
    setLaeuft(true);
    try { await senden('/api/trading/einstellungen', e); onClose(); }
    catch (err) { setInfo((err as Error).message); setLaeuft(false); }
  }
  async function test() {
    setInfo(null);
    try { const r = await senden<{ ok: boolean; fehler?: string }>('/api/trading/test'); setInfo(r.ok ? 'Test-Meldung gesendet.' : r.fehler || 'Senden fehlgeschlagen.'); }
    catch (err) { setInfo((err as Error).message); }
  }
  async function neuLaden() {
    try { await senden('/api/trading/neu-laden'); setInfo('Kurse werden neu geladen (ca. 30 Sekunden).'); }
    catch (err) { setInfo((err as Error).message); }
  }

  return (
    <Popup titel="Trading-Einstellungen" unter="Regeln wie im Pine-Script «GVA Linien — Pur v1.1»" onClose={onClose}>
      <Schalter an={e.meldungen} onClick={() => setz('meldungen', !e.meldungen)} titel="Meldung beim ersten Treffer" unter={d.meldungenBereit ? 'per ntfy aufs Handy' : 'ntfy ist aus (Einstellungen → Allgemein)'} />

      <h4 className="nw-h">Zeitrahmen</h4>
      <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {TFS.map((tf) => <button key={tf} aria-pressed={e.tfs[tf]} onClick={() => setz('tfs', { ...e.tfs, [tf]: !e.tfs[tf] })}>{TF_TEXT[tf]}</button>)}
      </div>

      <h4 className="nw-h">GVA-Erkennung</h4>
      <div className="tr-felder">
        <label className="nw-feld">Boden/Top-Toleranz (%)<input type="number" step={0.5} min={0.1} max={50} value={e.tolPct} onChange={(x) => setz('tolPct', Number(x.target.value))} /></label>
        <label className="nw-feld">2. Kerze mindestens X % grösser<input type="number" step={5} min={0} max={500} value={e.k2Pct} onChange={(x) => setz('k2Pct', Number(x.target.value))} /></label>
      </div>
      <div className="nw-feld">Toleranz-Basis
        <div className="segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button aria-pressed={e.tolBasis === 'body'} onClick={() => setz('tolBasis', 'body')}>Body 1. Kerze</button>
          <button aria-pressed={e.tolBasis === 'atr'} onClick={() => setz('tolBasis', 'atr')}>ATR (HTF)</button>
        </div>
      </div>
      {e.tolBasis === 'atr' && <label className="nw-feld">ATR-Periode (HTF)<input type="number" min={1} max={50} value={e.atrLen} onChange={(x) => setz('atrLen', Number(x.target.value))} /></label>}

      <h4 className="nw-h">Berührung</h4>
      <Schalter an={e.docht} onClick={() => setz('docht', !e.docht)} titel="Docht zählt als Berührung" unter="Aus = nur Kerzenkörper (Open/Close)" />
      <label className="nw-feld" style={{ marginTop: 8 }}>Touch-Toleranz (× ATR HTF)<input type="number" step={0.005} min={0} max={0.5} value={e.touchTol} onChange={(x) => setz('touchTol', Number(x.target.value))} /></label>

      <h4 className="nw-h">Zu früher Treffer</h4>
      <Schalter an={e.filterAn} onClick={() => setz('filterAn', !e.filterAn)} titel="Nachbar-Filter" unter="Treffer direkt in der nächsten HTF-Kerze → GVA verwerfen" />
      {e.filterAn && <label className="nw-feld" style={{ marginTop: 8 }}>Mindestens X HTF-Kerzen komplett dazwischen<input type="number" min={0} max={20} value={e.filterAbstand} onChange={(x) => setz('filterAbstand', Number(x.target.value))} /></label>}

      <h4 className="nw-h">3D-Kerzen</h4>
      <label className="nw-feld">Ein Tag, an dem eine 3D-Kerze beginnt (wie in TradingView)<input type="date" value={e.anker3d} onChange={(x) => setz('anker3d', x.target.value)} /></label>
      <Schalter an={e.feiertageAus} onClick={() => setz('feiertageAus', !e.feiertageAus)} titel="25.12. und 1.1. sind keine Handelstage" unter="zählen dann nicht für die 3D-Kerzen" />

      {info && <div className="leise" style={{ fontSize: 13, marginTop: 10 }}>{info}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="knopf-klein press tr-primaer" onClick={speichern} disabled={laeuft}>{laeuft ? 'Speichere …' : 'Speichern'}</button>
        <button className="knopf-klein press" onClick={test}><Icon name="info" size={14} /> Test-Meldung</button>
        <button className="knopf-klein press" onClick={neuLaden}><Icon name="neustart" size={14} /> Kurse neu laden</button>
      </div>
    </Popup>
  );
}
