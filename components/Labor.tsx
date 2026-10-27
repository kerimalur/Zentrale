'use client';
// Trading → Labor: eigene und fremde Strategien sowie Hypothesen aufstellen, backtesten und (einmal, bewusst) forward-testen.
// Ablauf pro Idee: Vorab-Karte → Starten (Version wird eingefroren) → Ergebnis mit Robustheits-Raster und Urteil →
// Forward öffnen → Urteil mit Forward. Jede Änderung nach dem Start ist eine neue Version (zählt als getestete Variante).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { holen, senden } from '@/lib/api';
import { datumCh } from '@/lib/trading';
import {
  URTEIL_FARBE, atrText, prozent, rText, standardWerte,
  type LBaustein, type LBausteine, type LErgebnis, type LGruppe, type LIdee, type LIdeeKurz, type LKarte, type LParam, type LTeil, type LTrade, type LZeile,
} from '@/lib/labor';
import { Schalter } from './ui';
import { Popup } from './NetzBausteine';

type Ansicht = { art: 'liste' } | { art: 'idee'; id: string } | { art: 'karte'; karte: LKarte; id?: string };

export function Labor() {
  const [b, setB] = useState<LBausteine | null>(null);
  const [liste, setListe] = useState<LIdeeKurz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'liste' });
  const [vorlagen, setVorlagen] = useState(false);

  const laden = useCallback(async () => {
    try { setListe((await holen<{ ideen: LIdeeKurz[] }>('/api/labor')).ideen); setFehler(null); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { holen<LBausteine>('/api/labor/bausteine').then(setB).catch((e) => setFehler((e as Error).message)); laden(); }, [laden]);
  const laeuft = liste?.some((i) => i.lauf && (i.lauf.status === 'laeuft' || i.lauf.status === 'wartet'));
  useEffect(() => {
    if (ansicht.art !== 'liste') return;
    const t = setInterval(() => { if (!document.hidden) laden(); }, laeuft ? 3000 : 20_000);
    return () => clearInterval(t);
  }, [laden, laeuft, ansicht.art]);

  if (fehler && !b) return <div className="karte fehlerbox">Labor nicht ladbar: {fehler}</div>;
  if (!b || !liste) return <div className="karte leise">Lade das Labor …</div>;

  if (ansicht.art === 'karte') return <KarteEditor b={b} start={ansicht.karte} id={ansicht.id} onZurueck={() => { setAnsicht(ansicht.id ? { art: 'idee', id: ansicht.id } : { art: 'liste' }); laden(); }} onGespeichert={(id) => { setAnsicht({ art: 'idee', id }); laden(); }} />;
  if (ansicht.art === 'idee') return <IdeeAnsicht b={b} id={ansicht.id} onZurueck={() => { setAnsicht({ art: 'liste' }); laden(); }} onBearbeiten={(karte) => setAnsicht({ art: 'karte', karte, id: ansicht.id })} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in">
        <h2 className="karte-titel">Labor <small>{liste.length} Idee{liste.length === 1 ? '' : 'n'}</small></h2>
        <p className="leise" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '0 0 12px', maxWidth: '70ch' }}>
          Hier testest du Strategien und Hypothesen nach festen Regeln: Vorab festhalten, was gilt, dann backtesten. Der Forward-Zeitraum bleibt gesperrt, bis du ihn einmal bewusst öffnest. Jede Änderung nach dem Start ist eine neue Version – die Zentrale zählt mit, wie viel du probiert hast.
        </p>
        <button className="knopf-akzent press" onClick={() => setVorlagen(true)}>+ Neue Idee</button>
      </section>

      {liste.length > 0 && (
        <section className="karte in" aria-label="Bibliothek">
          <div className="lb-liste">
            {liste.map((i) => <IdeeZeile key={i.id} i={i} onClick={() => setAnsicht({ art: 'idee', id: i.id })} />)}
          </div>
        </section>
      )}

      {vorlagen && (
        <Popup titel="Neue Idee" unter="Mit einer Vorlage beginnen – alles ist danach änderbar" onClose={() => setVorlagen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {b.vorlagen.map((v) => (
              <button key={v.id} className="lb-vorlage press" onClick={() => { setVorlagen(false); setAnsicht({ art: 'karte', karte: structuredClone(v.karte) }); }}>
                <strong>{v.name}</strong>
                <span className="leise">{v.karte.typ === 'hypothese' ? 'Hypothese' : 'Strategie'}{v.karte.mechanismus ? ` · ${v.karte.mechanismus}` : ''}</span>
              </button>
            ))}
          </div>
        </Popup>
      )}
    </div>
  );
}

function UrteilChip({ urteil }: { urteil: string }) {
  return <span className="lb-chip" style={{ background: URTEIL_FARBE[urteil] || 'var(--muted)', color: '#fff' }}>{urteil}</span>;
}
function TypChip({ typ }: { typ: string }) {
  return <span className="lb-chip">{typ === 'hypothese' ? 'Hypothese' : 'Strategie'}</span>;
}
function Fortschritt({ lauf }: { lauf: NonNullable<LIdeeKurz['lauf']> }) {
  const p = lauf.fortschritt ? Math.round((lauf.fortschritt.fertig / Math.max(1, lauf.fortschritt.gesamt)) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }} className="leise">
      <div className="lb-balken"><span style={{ width: `${lauf.status === 'wartet' ? 0 : p}%` }} /></div>
      {lauf.status === 'wartet' ? 'wartet' : `${lauf.art === 'forward' ? 'Forward' : 'Backtest'} ${p} %${lauf.fortschritt?.paar ? ` · ${lauf.fortschritt.paar}` : ''}`}
    </div>
  );
}

function IdeeZeile({ i, onClick }: { i: LIdeeKurz; onClick: () => void }) {
  const laeuft = i.lauf && (i.lauf.status === 'laeuft' || i.lauf.status === 'wartet');
  return (
    <button className="lb-zeile press" onClick={onClick}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15 }}>{i.name}</strong>
          <TypChip typ={i.typ} />
          <span className="leise" style={{ fontSize: 12.5 }}>Version {i.version}{!i.eingefroren ? ' (Entwurf)' : ''} · {i.varianten} Variante{i.varianten === 1 ? '' : 'n'}{i.forwardOffen ? ' · Forward offen' : ''}</span>
        </div>
        {laeuft && i.lauf ? <Fortschritt lauf={i.lauf} /> : i.lauf?.status === 'fehler' ? <div style={{ fontSize: 12.5, color: 'var(--fehler)' }}>Fehler: {i.lauf.fehler}</div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {i.ergebnis ? <UrteilChip urteil={i.ergebnis.urteil} /> : <span className="leise" style={{ fontSize: 12.5 }}>noch nicht getestet</span>}
        {i.ergebnis && <span className="leise" style={{ fontSize: 12.5 }}>N {i.ergebnis.n} · unabh. {i.ergebnis.nUnabhaengig}{i.ergebnis.avgR !== null ? ` · Ø ${rText(i.ergebnis.avgR)}` : ''}</span>}
      </div>
    </button>
  );
}

// ---------- Parameter-Formular (aus dem Schema der Bausteine) ----------
function ParamFeld({ s, wert, setze }: { s: LParam; wert: unknown; setze: (v: unknown) => void }) {
  if (s.typ === 'schalter') return <Schalter an={!!wert} onClick={() => setze(!wert)} titel={s.name} unter={s.hilfe} />;
  if (s.typ === 'auswahl') {
    return (
      <label className="nw-feld">{s.name}
        <select value={String(wert)} onChange={(e) => setze(e.target.value)}>{s.optionen?.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}</select>
        {s.hilfe && <small className="tr-hilfe">{s.hilfe}</small>}
      </label>
    );
  }
  if (s.typ === 'mehrfach') {
    const a = Array.isArray(wert) ? (wert as string[]) : [];
    return (
      <div className="nw-feld">{s.name}
        <div className="lb-chips">
          {s.optionen?.map((o) => (
            <button key={o.wert} type="button" className="lb-wahl press" aria-pressed={a.includes(o.wert)} onClick={() => setze(a.includes(o.wert) ? a.filter((x) => x !== o.wert) : [...a, o.wert])}>{o.text}</button>
          ))}
        </div>
        {s.hilfe && <small className="tr-hilfe">{s.hilfe}</small>}
      </div>
    );
  }
  return (
    <label className="nw-feld">{s.name}
      <input type="number" value={String(wert ?? '')} min={s.min} max={s.max} step={s.schritt} onChange={(e) => setze(e.target.value === '' ? '' : Number(e.target.value))} />
      {s.hilfe && <small className="tr-hilfe">{s.hilfe}</small>}
    </label>
  );
}
function ParamFormular({ schema, werte, setze }: { schema: LParam[]; werte: Record<string, unknown>; setze: (w: Record<string, unknown>) => void }) {
  const voll = standardWerte(schema, werte);
  return (
    <div className="lb-felder">
      {schema.map((s) => (
        <div key={s.key} className={s.typ === 'mehrfach' || s.typ === 'schalter' ? 'lb-breit' : ''}>
          <ParamFeld s={s} wert={voll[s.key]} setze={(v) => setze({ ...voll, [s.key]: v })} />
        </div>
      ))}
    </div>
  );
}

// Liste von Bausteinen (Ereignisse oder Filter) mit Hinzufügen/Entfernen
function TeilListe({ titel, katalog, liste, setze, leer }: { titel: string; katalog: LBaustein[]; liste: LTeil[]; setze: (l: LTeil[]) => void; leer: string }) {
  const [neu, setNeu] = useState('');
  const byId = Object.fromEntries(katalog.map((k) => [k.id, k]));
  return (
    <div className="lb-teile">
      <h4 className="nw-h">{titel}</h4>
      {!liste.length && <div className="leise" style={{ fontSize: 13 }}>{leer}</div>}
      {liste.map((t, i) => {
        const def = byId[t.id];
        if (!def) return null;
        return (
          <div key={i} className="lb-teil">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 14 }}>{i > 0 ? 'und ' : ''}{def.name}</strong>
              <button type="button" className="knopf-klein press" onClick={() => setze(liste.filter((_, j) => j !== i))}>Entfernen</button>
            </div>
            <div className="tr-hilfe" style={{ margin: '2px 0 8px' }}>{def.beschreibung}</div>
            <ParamFormular schema={def.parameter} werte={t.p} setze={(p) => setze(liste.map((x, j) => (j === i ? { ...x, p } : x)))} />
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <select className="lb-select" value={neu} onChange={(e) => setNeu(e.target.value)} aria-label={`${titel} hinzufügen`}>
          <option value="">Hinzufügen …</option>
          {katalog.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button type="button" className="knopf-klein press" disabled={!neu} onClick={() => { if (neu) { setze([...liste, { id: neu, p: {} }]); setNeu(''); } }}>+</button>
      </div>
    </div>
  );
}

// ---------- Vorab-Karte bearbeiten ----------
function KarteEditor({ b, start, id, onZurueck, onGespeichert }: { b: LBausteine; start: LKarte; id?: string; onZurueck: () => void; onGespeichert: (id: string) => void }) {
  const [k, setK] = useState<LKarte>(() => ({ backtest: { von: b.jahre.von, bis: Math.min(2022, b.jahre.bis - 1) }, forward: { von: Math.min(2023, b.jahre.bis) }, geplanteVarianten: 1, paare: [], filter: [], ...start }));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [horizText, setHorizText] = useState((start.horizonte || [1, 5, 10]).join(', '));
  const setz = <K extends keyof LKarte>(key: K, v: LKarte[K]) => setK((x) => ({ ...x, [key]: v }));
  const strat = b.strategien.find((s) => s.id === k.modell);
  const istH = k.typ === 'hypothese';

  const speichern = async (starten: boolean) => {
    setLaeuft(true); setFehler(null);
    try {
      const horizonte = horizText.split(/[,;\s]+/).map(Number).filter((x) => x >= 1);
      const r = await senden<LIdee>('/api/labor/idee', { id, karte: { ...k, horizonte } });
      if (starten) await senden('/api/labor/start', { id: r.id });
      onGespeichert(r.id);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><button className="knopf-klein press" onClick={onZurueck}>← Zurück</button></div>
      <section className="karte in">
        <h2 className="karte-titel">Vorab-Karte <small>{istH ? 'Hypothese' : 'Strategie'}</small></h2>
        <p className="tr-hilfe" style={{ margin: '0 0 12px' }}>Alles hier wird beim Start eingefroren – damit sich die Torpfosten nachher nicht verschieben.</p>
        <label className="nw-feld">Name<input value={k.name} onChange={(e) => setz('name', e.target.value)} maxLength={80} /></label>
        <label className="nw-feld">Mechanismus (warum sollte es funktionieren?)<textarea className="lb-text" rows={2} value={k.mechanismus || ''} onChange={(e) => setz('mechanismus', e.target.value)} /></label>
        <label className="nw-feld">Erwartung (Richtung und Zeitraum)<textarea className="lb-text" rows={2} value={k.erwartung || ''} onChange={(e) => setz('erwartung', e.target.value)} /></label>
        <label className="nw-feld">Erfolgskriterium (vorab!)<textarea className="lb-text" rows={2} value={k.erfolgskriterium || ''} onChange={(e) => setz('erfolgskriterium', e.target.value)} /></label>
        <div className="lb-felder">
          <label className="nw-feld">Backtest von<input type="number" min={b.jahre.von} max={b.jahre.bis} value={k.backtest?.von ?? ''} onChange={(e) => setz('backtest', { von: Number(e.target.value), bis: k.backtest?.bis ?? 2022 })} /></label>
          <label className="nw-feld">Backtest bis<input type="number" min={b.jahre.von} max={b.jahre.bis} value={k.backtest?.bis ?? ''} onChange={(e) => setz('backtest', { von: k.backtest?.von ?? b.jahre.von, bis: Number(e.target.value) })} /></label>
          <label className="nw-feld">Forward ab (gesperrt)<input type="number" min={b.jahre.von} max={b.jahre.bis} value={k.forward?.von ?? ''} onChange={(e) => setz('forward', { von: Number(e.target.value) })} /></label>
          <label className="nw-feld">Geplante Varianten<input type="number" min={1} max={100} value={k.geplanteVarianten ?? 1} onChange={(e) => setz('geplanteVarianten', Number(e.target.value))} /></label>
        </div>
        <div className="nw-feld">Paare <span className="tr-hilfe">(keine Auswahl = alle 28)</span>
          <div className="lb-chips">
            {b.paare.map((p) => {
              const an = (k.paare || []).includes(p);
              return <button key={p} type="button" className="lb-wahl press" aria-pressed={an} onClick={() => setz('paare', an ? (k.paare || []).filter((x) => x !== p) : [...(k.paare || []), p])}>{p}</button>;
            })}
          </div>
        </div>
      </section>

      <section className="karte in">
        <h2 className="karte-titel">{istH ? 'Ereignis und Horizont' : 'Regel'}</h2>
        {istH ? (
          <>
            <div className="lb-felder">
              <label className="nw-feld">Zeitrahmen<select value={k.tf} onChange={(e) => setz('tf', e.target.value)}>{b.zeitrahmen.map((z) => <option key={z.wert} value={z.wert}>{z.text}</option>)}</select></label>
              <label className="nw-feld">Richtung<select value={k.richtung} onChange={(e) => setz('richtung', e.target.value)}><option value="beide">beide</option><option value="long">nur Long</option><option value="short">nur Short</option></select></label>
              <label className="nw-feld">Horizonte (Handelstage)<input value={horizText} onChange={(e) => setHorizText(e.target.value)} placeholder="1, 5, 10" /></label>
              <label className="nw-feld">Haupt-Horizont<input type="number" min={1} max={60} value={k.hauptHorizont ?? 5} onChange={(e) => setz('hauptHorizont', Number(e.target.value))} /></label>
            </div>
            <Schalter an={k.nurNeu !== false} onClick={() => setz('nurNeu', k.nurNeu === false)} titel="Nur wenn neu" unter="Ereignis zählt nur, wenn es bei der Kerze davor noch nicht galt" />
            <TeilListe titel="Ereignisse (alle müssen gelten)" katalog={b.ereignisse} liste={k.ereignisse || []} setze={(l) => setz('ereignisse', l)} leer="Noch kein Ereignis – füge mindestens eines hinzu." />
          </>
        ) : (
          <>
            <label className="nw-feld">Strategie
              <select value={k.modell} onChange={(e) => setK((x) => ({ ...x, modell: e.target.value, parameter: {}, ereignisse: b.strategien.find((s) => s.id === e.target.value)?.mitEreignissen ? x.ereignisse || [] : undefined }))}>
                {b.strategien.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {strat && <p className="tr-hilfe" style={{ margin: '-4px 0 10px' }}>{strat.beschreibung}</p>}
            {strat && <ParamFormular schema={strat.parameter} werte={k.parameter || {}} setze={(p) => setz('parameter', p)} />}
            {strat?.mitEreignissen && <TeilListe titel="Ereignisse (alle müssen gelten)" katalog={b.ereignisse} liste={k.ereignisse || []} setze={(l) => setz('ereignisse', l)} leer="Noch kein Ereignis – füge mindestens eines hinzu." />}
            <div style={{ marginTop: 12 }}>
              <Schalter an={!!k.bias} onClick={() => setz('bias', k.bias ? null : { tf: 'D', richtung: 'beide', tage: 5, ereignisse: [] })} titel="Bias-Fenster (Monty Stufe 2)" unter="Trades nur in einem Zeitfenster nach einem Ereignis und in dessen Richtung; der Rest wird als Gegenprobe gerechnet" />
              {k.bias && (
                <div className="lb-teil" style={{ marginTop: 8 }}>
                  <div className="lb-felder">
                    <label className="nw-feld">Zeitrahmen<select value={k.bias.tf} onChange={(e) => setz('bias', { ...k.bias!, tf: e.target.value })}>{b.zeitrahmen.map((z) => <option key={z.wert} value={z.wert}>{z.text}</option>)}</select></label>
                    <label className="nw-feld">Fenster (Handelstage)<input type="number" min={1} max={60} value={k.bias.tage} onChange={(e) => setz('bias', { ...k.bias!, tage: Number(e.target.value) })} /></label>
                  </div>
                  <TeilListe titel="Bias-Ereignisse" katalog={b.ereignisse} liste={k.bias.ereignisse} setze={(l) => setz('bias', { ...k.bias!, ereignisse: l })} leer="Ereignis wählen, das die Richtung vorgibt." />
                </div>
              )}
            </div>
          </>
        )}
        <TeilListe titel="Filter" katalog={b.filter} liste={k.filter || []} setze={(l) => setz('filter', l)} leer="Keine Filter – alle Signale zählen." />
      </section>

      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="knopf-akzent press" disabled={laeuft} onClick={() => speichern(true)}>Speichern und Backtest starten</button>
        <button className="knopf-klein press" disabled={laeuft} onClick={() => speichern(false)}>Nur speichern</button>
      </div>
    </div>
  );
}

// ---------- Eine Idee: Status, Läufe, Ergebnis ----------
function IdeeAnsicht({ b, id, onZurueck, onBearbeiten }: { b: LBausteine; id: string; onZurueck: () => void; onBearbeiten: (k: LKarte) => void }) {
  const [i, setI] = useState<LIdee | null>(null);
  const [erg, setErg] = useState<LErgebnis | null>(null);
  const [laufId, setLaufId] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<'forward' | 'loeschen' | null>(null);
  const [karteAuf, setKarteAuf] = useState(false);

  const laden = useCallback(async () => {
    try { const x = await holen<LIdee>(`/api/labor/idee?id=${id}`); setI(x); setFehler(null); return x; } catch (e) { setFehler((e as Error).message); return null; }
  }, [id]);
  useEffect(() => { laden(); }, [laden]);
  const laeuft = i?.lauf && (i.lauf.status === 'laeuft' || i.lauf.status === 'wartet');
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => { if (!document.hidden) laden(); }, 2000);
    return () => clearInterval(t);
  }, [laeuft, laden]);
  // Ergebnis des neuesten fertigen Laufs laden
  const zielLauf = laufId || i?.ergebnis?.lauf || null;
  useEffect(() => {
    if (!zielLauf) { setErg(null); return; }
    holen<LErgebnis>(`/api/labor/ergebnis?lauf=${zielLauf}`).then(setErg).catch(() => setErg(null));
  }, [zielLauf]);

  if (fehler && !i) return <div className="karte fehlerbox">{fehler}</div>;
  if (!i) return <div className="karte leise">Lade …</div>;
  const v = i.versionen[i.versionen.length - 1];
  const fertigeLaeufe = i.laeufe.filter((l) => l.status === 'fertig').slice().reverse();
  const backtestFertig = i.laeufe.some((l) => l.v === i.version && l.status === 'fertig');

  const aktion = async (pfad: string, body: unknown) => {
    setFehler(null);
    try { await senden(pfad, body); setLaufId(null); await laden(); } catch (e) { setFehler((e as Error).message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><button className="knopf-klein press" onClick={onZurueck}>← Bibliothek</button></div>
      <section className="karte in">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <h2 className="karte-titel" style={{ margin: 0 }}>{v.karte.name}</h2>
          <TypChip typ={v.karte.typ} />
          {erg && <UrteilChip urteil={erg.urteil} />}
        </div>
        <div className="leise" style={{ fontSize: 13 }}>
          Version {i.version}{v.eingefroren ? ` · eingefroren ${datumCh(v.eingefroren.slice(0, 10))}` : ' · Entwurf'} · {i.varianten} getestete Variante{i.varianten === 1 ? '' : 'n'}
          {Object.keys(i.forwardGeoeffnet).length ? ` · Forward geöffnet für Version ${Object.keys(i.forwardGeoeffnet).join(', ')}` : ' · Forward gesperrt'}
        </div>
        {laeuft && i.lauf && <div style={{ marginTop: 10 }}><Fortschritt lauf={i.lauf} /></div>}
        {i.lauf?.status === 'fehler' && <div className="fehlerbox" style={{ marginTop: 10 }}>Letzter Lauf: {i.lauf.fehler}</div>}
        {fehler && <div className="fehlerbox" style={{ marginTop: 10 }}>{fehler}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {!laeuft && <button className="knopf-akzent press" onClick={() => aktion('/api/labor/start', { id })}>{backtestFertig ? 'Backtest neu rechnen' : 'Backtest starten'}</button>}
          {!laeuft && backtestFertig && !i.forwardOffen && <button className="knopf-klein press" onClick={() => setFrage('forward')}>Forward öffnen …</button>}
          {!laeuft && i.forwardOffen && <button className="knopf-klein press" onClick={() => aktion('/api/labor/start', { id, art: 'forward' })}>Mit Forward neu rechnen</button>}
          {laeuft && i.lauf && <button className="knopf-klein press" onClick={() => aktion('/api/labor/abbrechen', { lauf: i.lauf!.id })}>Abbrechen</button>}
          <button className="knopf-klein press" onClick={() => onBearbeiten(structuredClone(v.karte))}>{v.eingefroren ? 'Ändern (neue Version)' : 'Bearbeiten'}</button>
          <button className="knopf-klein press" onClick={() => setKarteAuf((x) => !x)}>{karteAuf ? 'Vorab-Karte zu' : 'Vorab-Karte'}</button>
          <button className="knopf-klein press" style={{ color: 'var(--fehler)' }} onClick={() => setFrage('loeschen')}>Löschen …</button>
        </div>
        {frage === 'forward' && (
          <div className="lb-frage">
            <strong>Forward-Zeitraum öffnen?</strong>
            <p>Der Zeitraum ab {v.karte.forward?.von} wurde bisher nie angeschaut. Nach dem Öffnen ist er für diese Idee «verbraucht»: Jede spätere Version kennt ihn schon und ist dort nicht mehr unvoreingenommen. Öffne ihn erst, wenn die Regel wirklich feststeht.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="knopf-akzent press" onClick={() => { setFrage(null); aktion('/api/labor/forward-oeffnen', { id }); }}>Ja, jetzt öffnen</button>
              <button className="knopf-klein press" onClick={() => setFrage(null)}>Abbrechen</button>
            </div>
          </div>
        )}
        {frage === 'loeschen' && (
          <div className="lb-frage">
            <strong>Idee mit allen Versionen und Ergebnissen löschen?</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="knopf-akzent press" style={{ background: 'var(--fehler)' }} onClick={async () => { await senden('/api/labor/idee', { id }, 'DELETE').catch(() => {}); onZurueck(); }}>Löschen</button>
              <button className="knopf-klein press" onClick={() => setFrage(null)}>Abbrechen</button>
            </div>
          </div>
        )}
        {karteAuf && <VorabKarte k={v.karte} b={b} />}
      </section>

      {fertigeLaeufe.length > 1 && (
        <div className="segment" style={{ gridTemplateColumns: `repeat(${Math.min(fertigeLaeufe.length, 4)}, 1fr)` }}>
          {fertigeLaeufe.slice(0, 4).map((l) => (
            <button key={l.id} aria-pressed={(zielLauf || '') === l.id} onClick={() => setLaufId(l.id)}>V{l.v} · {l.art === 'forward' ? 'mit Forward' : 'Backtest'}</button>
          ))}
        </div>
      )}

      {erg ? (erg.typ === 'hypothese' ? <ErgebnisHypothese e={erg} /> : <ErgebnisStrategie e={erg} />) : !laeuft && <div className="karte leise">Noch kein Ergebnis – starte den Backtest.</div>}
    </div>
  );
}

function VorabKarte({ k, b }: { k: LKarte; b: LBausteine }) {
  const name = (liste: LBaustein[], id: string) => liste.find((x) => x.id === id)?.name || id;
  const teile = (l?: LTeil[]) => (l?.length ? l.map((t) => `${name(b.ereignisse.concat(b.filter), t.id)}${Object.keys(t.p).length ? ` (${Object.entries(t.p).map(([a, w]) => `${a} ${Array.isArray(w) ? w.join('/') : w}`).join(', ')})` : ''}`).join(' · ') : '—');
  const zeilen: [string, string][] = [
    ['Mechanismus', k.mechanismus || '—'], ['Erwartung', k.erwartung || '—'], ['Erfolgskriterium', k.erfolgskriterium || '—'],
    ['Paare', k.paare?.length ? k.paare.join(', ') : 'alle 28'], ['Backtest', `${k.backtest?.von}–${k.backtest?.bis}`], ['Forward', `ab ${k.forward?.von} (gesperrt bis geöffnet)`],
    ['Geplante Varianten', String(k.geplanteVarianten ?? 1)],
    ...(k.typ === 'hypothese'
      ? ([['Zeitrahmen', k.tf || ''], ['Richtung', k.richtung || ''], ['Ereignisse', teile(k.ereignisse)], ['Horizonte', `${(k.horizonte || []).join(', ')} Handelstage (Haupt: ${k.hauptHorizont})`]] as [string, string][])
      : ([['Strategie', name(b.strategien, k.modell || '')], ['Parameter', Object.entries(k.parameter || {}).map(([a, w]) => `${a} ${Array.isArray(w) ? w.join('/') : w}`).join(', ') || 'Standard'], ['Ereignisse', teile(k.ereignisse)], ['Bias-Fenster', k.bias ? `${teile(k.bias.ereignisse)} · ${k.bias.tage} Tage` : '—']] as [string, string][])),
    ['Filter', teile(k.filter)],
  ];
  return (
    <dl className="lb-karte">
      {zeilen.map(([a, w]) => <div key={a}><dt>{a}</dt><dd>{w}</dd></div>)}
    </dl>
  );
}

// ---------- Ergebnis-Bausteine ----------
function Raster({ zeilen }: { zeilen: LZeile[] }) {
  const zeichen = { ja: '✓', nein: '✗', offen: '–' } as const;
  const farbe = { ja: 'var(--gruen)', nein: 'var(--fehler)', offen: 'var(--muted)' } as const;
  return (
    <div className="lb-raster">
      {zeilen.map((z) => (
        <div key={z.id} className="lb-raster-zeile">
          <span className="lb-zeichen" style={{ color: farbe[z.status] }} aria-label={z.status}>{zeichen[z.status]}</span>
          <div style={{ minWidth: 0 }}><strong>{z.name}</strong><div className="tr-hilfe">{z.text}</div></div>
        </div>
      ))}
    </div>
  );
}

function Kurve({ punkte, forward }: { punkte: [number, number][]; forward?: [number, number][] | null }) {
  const alle = useMemo(() => {
    const letzte = punkte.length ? punkte[punkte.length - 1][1] : 0;
    return { bt: punkte, fw: (forward || []).map(([t, v]) => [t, v + letzte] as [number, number]) };
  }, [punkte, forward]);
  const xs = [...alle.bt, ...alle.fw];
  if (xs.length < 2) return <div className="leise" style={{ fontSize: 13 }}>Zu wenige Trades für eine Kurve.</div>;
  const W = 640, H = 200, P = 34;
  const t0 = xs[0][0], t1 = xs[xs.length - 1][0];
  const vs = xs.map((p) => p[1]).concat(0);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - P - 8);
  const y = (v: number) => 8 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - 30);
  const pfad = (p: [number, number][]) => p.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const j0 = new Date(t0 * 1000).getUTCFullYear(), j1 = new Date(t1 * 1000).getUTCFullYear();
  const jahre = []; for (let j = j0 + 1; j <= j1; j += Math.max(1, Math.ceil((j1 - j0) / 8))) jahre.push(j);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label="Kumulierte R">
      <line x1={P} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--track)" />
      <text x={P - 6} y={y(hi) + 4} textAnchor="end" className="lb-achse">{hi.toFixed(0)}</text>
      <text x={P - 6} y={y(lo) + 4} textAnchor="end" className="lb-achse">{lo.toFixed(0)}</text>
      <text x={P - 6} y={y(0) + 4} textAnchor="end" className="lb-achse">0</text>
      {jahre.map((j) => { const xx = x(Date.UTC(j, 0, 1) / 1000); return <text key={j} x={xx} y={H - 4} textAnchor="middle" className="lb-achse">{j}</text>; })}
      <path d={pfad(alle.bt)} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
      {alle.fw.length > 0 && <path d={pfad([alle.bt[alle.bt.length - 1] || alle.fw[0], ...alle.fw])} fill="none" stroke="#d6a23a" strokeWidth={1.8} />}
    </svg>
  );
}

function Gruppenbalken({ gruppen, einheit }: { gruppen: LGruppe[]; einheit: 'R' | 'ATR' }) {
  if (!gruppen.length) return null;
  const max = Math.max(...gruppen.map((g) => Math.abs(g.avg ?? 0)), 1e-9);
  return (
    <div className="lb-gruppen">
      {gruppen.map((g) => (
        <div key={g.schluessel} className="lb-gruppe" title={`${g.schluessel}: ${g.n} · Ø ${g.avg}`}>
          <span className="lb-gruppe-name">{g.schluessel}</span>
          <div className="lb-gruppe-spur">
            <span style={{ left: (g.avg ?? 0) >= 0 ? '50%' : `${50 - (Math.abs(g.avg ?? 0) / max) * 50}%`, width: `${(Math.abs(g.avg ?? 0) / max) * 50}%`, background: (g.avg ?? 0) >= 0 ? 'var(--gruen)' : 'var(--fehler)' }} />
          </div>
          <span className="lb-gruppe-wert">{einheit === 'R' ? rText(g.avg) : atrText(g.avg)} <span className="leise">({g.n})</span></span>
        </div>
      ))}
    </div>
  );
}

function Kachel({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) {
  return <div className="lb-kachel"><span className="leise">{titel}</span><strong>{wert}</strong>{unter && <small className="leise">{unter}</small>}</div>;
}

function Kopf({ e }: { e: LErgebnis }) {
  const grob = e.abdeckung.filter((a) => a.zuGrob).length, fehlt = e.abdeckung.filter((a) => a.fehlt).length;
  const quellen = [...new Set(e.abdeckung.filter((a) => a.quelle).map((a) => a.quelle))].join(', ');
  return (
    <section className="karte in" style={{ borderLeft: `6px solid ${URTEIL_FARBE[e.urteil] || 'var(--muted)'}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="gs-gross" style={{ fontSize: 30, color: URTEIL_FARBE[e.urteil] }}>{e.urteil}</span>
        <span className="leise">{e.warum}</span>
      </div>
      <div className="leise" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
        Version {e.lauf.v} · {e.lauf.art === 'forward' ? 'Backtest + Forward' : 'nur Backtest'} · {e.karte.backtest?.von}–{e.karte.backtest?.bis}{e.lauf.art === 'forward' ? `, Forward ab ${e.karte.forward?.von}` : ''} · gerechnet in {e.dauerSek} s · Daten: {quellen || '—'}
        {grob > 0 && <span style={{ color: '#b7791f' }}> · {grob} Paar{grob === 1 ? '' : 'e'} nur mit gröberen Daten als nötig (5-Min-Kerzen noch nicht geladen)</span>}
        {fehlt > 0 && <span style={{ color: 'var(--fehler)' }}> · {fehlt} Paar{fehlt === 1 ? '' : 'e'} ohne Daten</span>}
        {e.schonGesehen && <span style={{ color: 'var(--fehler)' }}> · Achtung: Der Forward wurde schon bei einer früheren Version angeschaut</span>}
      </div>
    </section>
  );
}

function ErgebnisStrategie({ e }: { e: LErgebnis }) {
  const k = e.kennzahlen!;
  const [mehr, setMehr] = useState(60);
  const trades = useMemo(() => [...(e.trades || []), ...(e.forwardTrades || []).map((t) => ({ ...t, fw: true }))].sort((a, b) => b.tEin - a.tEin), [e]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Kopf e={e} />
      <section className="karte in">
        <div className="lb-kacheln">
          <Kachel titel="Trades" wert={String(k.n)} unter={`${e.nUnabhaengig} unabhängig · ${e.varianten} Variante${e.varianten === 1 ? '' : 'n'}`} />
          <Kachel titel="Trefferquote" wert={prozent(k.quote)} unter={k.bereich ? `${prozent(k.bereich[0])}–${prozent(k.bereich[1])}` : undefined} />
          <Kachel titel="Ø pro Trade" wert={rText(k.avgR)} unter={`Zufall ${rText(e.zufall?.mittel)} · p ${e.zufall?.p ?? '—'}`} />
          <Kachel titel="Profit-Faktor" wert={k.pf === null || k.pf === undefined ? '—' : k.pf.toFixed(2).replace('.', ',')} unter={`Summe ${rText(k.summeR, 1)}`} />
          <Kachel titel="Max. Drawdown" wert={k.maxDD === null || k.maxDD === undefined ? '—' : `${k.maxDD.toFixed(1).replace('.', ',')} R`} unter={`längste Verlustserie ${k.verlustSerie ?? '—'}`} />
          {e.forward && <Kachel titel="Forward" wert={rText(e.forward.kennzahlen.avgR)} unter={`${e.forward.kennzahlen.n} Trades · ${prozent(e.forward.kennzahlen.quote)}`} />}
        </div>
        {e.trichter && Object.keys(e.trichter).length > 0 && (
          <div className="leise" style={{ fontSize: 12.5, marginTop: 10 }}>
            {Object.entries(e.trichter).map(([a, w]) => `${a === 'linien' ? 'GVA-Treffer' : a === 'bos' ? 'mit BOS' : a === 'einstieg' ? 'Einstieg erreicht' : a} ${w}`).join(' → ')}
            {e.uebersprungen ? ` · ${e.uebersprungen} übersprungen (Position offen)` : ''} · Ø MFE {e.mfeMedian ?? '—'} R, MAE {e.maeMedian ?? '—'} R (Median)
          </div>
        )}
      </section>
      <section className="karte in">
        <h2 className="karte-titel">Kumulierte R <small>blau Backtest{e.forward ? ', gelb Forward' : ''}</small></h2>
        <Kurve punkte={e.kurve || []} forward={e.forward?.kurve} />
      </section>
      <section className="karte in">
        <h2 className="karte-titel">Robustheit</h2>
        <Raster zeilen={e.raster} />
      </section>
      <div className="gs-zwei">
        <section className="karte in"><h2 className="karte-titel">Pro Jahr</h2><Gruppenbalken gruppen={e.proJahr || []} einheit="R" /></section>
        <section className="karte in"><h2 className="karte-titel">Pro Paar</h2><Gruppenbalken gruppen={e.proPaar || []} einheit="R" /></section>
      </div>
      {e.monteCarlo && (
        <section className="karte in">
          <h2 className="karte-titel">Risiko (Monte Carlo) <small>{e.monteCarlo.trades} Trades, 10'000 Verläufe</small></h2>
          <div className="lb-kacheln">
            <Kachel titel="Drawdown typisch" wert={`${e.monteCarlo.dd50.toFixed(1).replace('.', ',')} R`} />
            <Kachel titel="Drawdown 95 %" wert={`${e.monteCarlo.dd95.toFixed(1).replace('.', ',')} R`} unter="bei 1 % Risiko = so viele %" />
            <Kachel titel="Drawdown 99 %" wert={`${e.monteCarlo.dd99.toFixed(1).replace('.', ',')} R`} />
            <Kachel titel="Verlustserie 95 %" wert={String(e.monteCarlo.serie95)} />
            <Kachel titel="10 R Drawdown erreicht" wert={prozent(e.monteCarlo.chance10R)} unter="z. B. Prop-Firm-Grenze bei 1 %" />
          </div>
          <p className="tr-hilfe" style={{ marginTop: 8 }}>Simulation zeigt nur das Risiko deiner Trade-Liste – sie beweist keinen Vorteil. Müll rein, Müll raus.</p>
        </section>
      )}
      <section className="karte in">
        <h2 className="karte-titel">Trades <small>neueste zuerst</small></h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="lb-tabelle">
            <thead><tr><th>Einstieg</th><th>Paar</th><th>Seite</th><th>Risiko</th><th>Ausstieg</th><th>R</th></tr></thead>
            <tbody>
              {trades.slice(0, mehr).map((t: LTrade & { fw?: boolean }, x) => (
                <tr key={x} style={t.fw ? { background: 'rgba(214,162,58,.08)' } : undefined}>
                  <td>{new Date(t.tEin * 1000).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}{t.fw ? ' · F' : ''}</td>
                  <td>{t.pair}</td><td>{t.seite > 0 ? 'Long' : 'Short'}</td><td>{t.risikoPips} Pips</td>
                  <td>{t.grund === 'tp' ? 'TP' : t.grund === 'sl' ? 'SL' : t.grund === 'zeit' ? 'Zeit' : 'offen'}</td>
                  <td style={{ color: t.r >= 0 ? 'var(--gruen)' : 'var(--fehler)', fontWeight: 600 }}>{rText(t.r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trades.length > mehr && <button className="knopf-klein press" style={{ marginTop: 10 }} onClick={() => setMehr((m) => m + 200)}>Mehr laden ({trades.length - mehr} weitere)</button>}
      </section>
    </div>
  );
}

function ErgebnisHypothese({ e }: { e: LErgebnis }) {
  const hs = e.horizonte || [];
  const [wahl, setWahl] = useState(Math.max(0, hs.findIndex((h) => h.h === e.haupt)));
  const H = hs[wahl];
  if (!H) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Kopf e={e} />
      <section className="karte in">
        <h2 className="karte-titel">Je Horizont <small>Rendite in Tages-ATR, ohne Überlappung</small></h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="lb-tabelle">
            <thead><tr><th>Handelstage</th><th>Fälle</th><th>unabh.</th><th>Ø Ereignis</th><th>Saison</th><th>Mehrwert</th><th>Zufall</th><th>p</th><th>Treffer</th>{hs[0]?.forward && <th>Forward</th>}</tr></thead>
            <tbody>
              {hs.map((h, x) => (
                <tr key={h.h} onClick={() => setWahl(x)} style={{ cursor: 'pointer', fontWeight: x === wahl ? 700 : 400 }}>
                  <td>{h.h}{h.h === e.haupt ? ' ★' : ''}</td><td>{h.n}</td><td>{h.nUnabhaengig}</td><td>{atrText(h.mittel)}</td><td>{atrText(h.saison)}</td>
                  <td style={{ color: (h.mehrwert ?? 0) > 0 ? 'var(--gruen)' : 'var(--fehler)' }}>{atrText(h.mehrwert)}</td><td>{atrText(h.zufall)}</td><td>{h.p ?? '—'}</td><td>{prozent(h.quote)}</td>
                  {h.forward && <td>{atrText(h.forward.mittel)} ({h.forward.n})</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tr-hilfe" style={{ marginTop: 8 }}>★ = Haupt-Horizont aus der Vorab-Karte (für das Urteil). Zeile antippen für Details. 1 ATR ≈ durchschnittliche Tagesbewegung des Paars.</p>
      </section>
      <section className="karte in">
        <h2 className="karte-titel">Robustheit <small>Haupt-Horizont {e.haupt} Tage</small></h2>
        <Raster zeilen={e.raster} />
      </section>
      <section className="karte in">
        <h2 className="karte-titel">Jeder Fall <small>{H.h} Handelstage · Balken = Ergebnis, Strich = Saison</small></h2>
        <Faelle faelle={H.faelle} />
      </section>
      <div className="gs-zwei">
        <section className="karte in"><h2 className="karte-titel">Pro Jahr <small>{H.h} Tage</small></h2><Gruppenbalken gruppen={H.proJahr} einheit="ATR" /></section>
        <section className="karte in"><h2 className="karte-titel">Pro Paar <small>{H.h} Tage</small></h2><Gruppenbalken gruppen={H.proPaar} einheit="ATR" /></section>
      </div>
    </div>
  );
}

function Faelle({ faelle }: { faelle: { pair: string; t: number; seite: number; r: number; s: number | null }[] }) {
  const [tip, setTip] = useState<string | null>(null);
  if (!faelle.length) return <div className="leise">Keine Fälle.</div>;
  const W = 640, H = 160, n = faelle.length;
  const max = Math.max(...faelle.map((f) => Math.abs(f.r)), 0.5);
  const bw = (W - 10) / n;
  const y = (v: number) => H / 2 - (v / max) * (H / 2 - 6);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label="Ergebnis je Fall">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--track)" />
        {faelle.map((f, i) => (
          <g key={i} onMouseEnter={() => setTip(`${f.pair} ${f.seite > 0 ? 'Long' : 'Short'} · ${new Date(f.t * 1000).toLocaleDateString('de-CH')} · ${atrText(f.r)}${f.s !== null ? ` (Saison ${atrText(f.s)})` : ''}`)}>
            <rect x={5 + i * bw} width={Math.max(0.6, bw - 0.4)} y={Math.min(y(f.r), H / 2)} height={Math.abs(y(f.r) - H / 2)} fill={f.r >= 0 ? 'var(--gruen)' : 'var(--fehler)'} opacity={0.85} />
            {f.s !== null && bw > 2.5 && <line x1={5 + i * bw} x2={5 + (i + 1) * bw - 0.4} y1={y(f.s)} y2={y(f.s)} stroke="var(--ink)" strokeWidth={1} />}
          </g>
        ))}
      </svg>
      <div className="leise" style={{ fontSize: 12.5, minHeight: 18 }}>{tip || 'Mit der Maus über einen Balken fahren für Details.'}</div>
    </div>
  );
}
