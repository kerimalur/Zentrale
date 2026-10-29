'use client';
// Trading → Labor: eigene und fremde Strategien sowie Hypothesen aufstellen, backtesten und (einmal, bewusst) forward-testen.
// Ablauf pro Idee: Vorab-Karte → Starten (Version wird eingefroren) → Ergebnis mit Robustheits-Raster und Urteil →
// Forward öffnen → Urteil mit Forward. Jede Änderung nach dem Start ist eine neue Version (zählt als getestete Variante).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { holen, senden } from '@/lib/api';
import { datumCh } from '@/lib/trading';
import {
  URTEIL_FARBE, atrText, prozent, rText, standardWerte,
  type LBaustein, type LBausteine, type LErgebnis, type LFErgebnis, type LExtern, type LIdee, type LIdeeKurz, type LKarte, type LParam, type LTeil, type LTrade, type LZettel, pText,
} from '@/lib/labor';
import { Schalter } from './ui';
import { TradeChart, grundText } from './LaborTradeChart';
import { UrteilChip, TypChip, Raster, Gruppenbalken, Kachel, Rueckfrage, FazitKarte, Erweitert } from './LaborTeile';
import { Popup } from './NetzBausteine';
import { FremdEditor, FremdVorabKarte, ErgebnisFremd, reiheNameKlient } from './LaborFremd';
import { LaborVergleich } from './LaborVergleich';
import { Brainstorm, ExportKnoepfe, ImportPopup, MdVorschau } from './LaborWerkzeuge';

type Ansicht =
  | { art: 'liste' } | { art: 'brainstorm' } | { art: 'vergleich'; ids?: string[] } | { art: 'idee'; id: string }
  | { art: 'karte'; karte: LKarte; id?: string; zettel?: string };
type Filter = '' | 'strategie' | 'hypothese' | 'fremd';

export function Labor() {
  const [b, setB] = useState<LBausteine | null>(null);
  const [liste, setListe] = useState<LIdeeKurz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'liste' });
  const [vorlagen, setVorlagen] = useState(false);
  const [importOffen, setImportOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('');
  const [tag, setTag] = useState('');
  const [suche, setSuche] = useState('');
  const [waehlen, setWaehlen] = useState(false);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  const laden = useCallback(async () => {
    try { setListe((await holen<{ ideen: LIdeeKurz[] }>('/api/labor')).ideen); setFehler(null); } catch (e) { setFehler((e as Error).message); }
  }, []);
  const bausteineLaden = useCallback(() => { holen<LBausteine>('/api/labor/bausteine').then(setB).catch((e) => setFehler((e as Error).message)); }, []);
  useEffect(() => { bausteineLaden(); laden(); }, [laden, bausteineLaden]);
  const laeuft = liste?.some((i) => i.lauf && (i.lauf.status === 'laeuft' || i.lauf.status === 'wartet'));
  useEffect(() => {
    if (ansicht.art !== 'liste') return;
    const t = setInterval(() => { if (!document.hidden) laden(); }, laeuft ? 3000 : 20_000);
    return () => clearInterval(t);
  }, [laden, laeuft, ansicht.art]);
  const alleTags = useMemo(() => [...new Set((liste || []).flatMap((i) => i.tags || []))].sort(), [liste]);
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (liste || []).filter((i) => (!filter || i.typ === filter) && (!tag || (i.tags || []).includes(tag)) && (!q || `${i.name} ${(i.tags || []).join(' ')} ${(i.maerkte || []).join(' ')}`.toLowerCase().includes(q)));
  }, [liste, filter, tag, suche]);

  if (fehler && !b) return <div className="karte fehlerbox">Labor nicht ladbar: {fehler}</div>;
  if (!b || !liste) return <div className="karte leise">Lade das Labor …</div>;

  const nachSpeichern = async (id: string, zettel?: string) => {
    if (zettel) {
      // Zettel, aus dem die Hypothese entstand: verknüpfen und als ausgearbeitet markieren
      const z = (await holen<{ zettel: LZettel[] }>('/api/labor/zettel').catch(() => ({ zettel: [] as LZettel[] }))).zettel.find((x) => x.id === zettel);
      if (z) await senden('/api/labor/zettel', { ...z, idee: id, status: z.status === 'roh' ? 'ausgearbeitet' : z.status }).catch(() => {});
    }
    setAnsicht({ art: 'idee', id }); laden();
  };

  if (ansicht.art === 'karte') {
    const zurueck = () => { setAnsicht(ansicht.id ? { art: 'idee', id: ansicht.id } : ansicht.zettel ? { art: 'brainstorm' } : { art: 'liste' }); laden(); };
    if (ansicht.karte.typ === 'fremd') return <FremdEditor b={b} start={ansicht.karte} id={ansicht.id} onZurueck={zurueck} onGespeichert={(id) => nachSpeichern(id, ansicht.zettel)} onBausteine={bausteineLaden} />;
    return <KarteEditor b={b} ideen={liste} start={ansicht.karte} id={ansicht.id} onZurueck={zurueck} onGespeichert={(id) => nachSpeichern(id, ansicht.zettel)} />;
  }
  if (ansicht.art === 'idee') {
    return <IdeeAnsicht b={b} id={ansicht.id} onZurueck={() => { setAnsicht({ art: 'liste' }); laden(); }} onBearbeiten={(karte, neu) => setAnsicht(neu ? { art: 'karte', karte } : { art: 'karte', karte, id: ansicht.id })}
      onOeffnen={(id) => setAnsicht({ art: 'idee', id })} onVergleich={(ids) => setAnsicht({ art: 'vergleich', ids })} />;
  }

  const bereich = (
    <div className="segment" style={{ gridTemplateColumns: '1fr 1fr 1fr', maxWidth: 560 }} role="tablist" aria-label="Labor-Bereich">
      <button role="tab" aria-selected={ansicht.art === 'liste'} aria-pressed={ansicht.art === 'liste'} onClick={() => { setAnsicht({ art: 'liste' }); laden(); }}>Bibliothek</button>
      <button role="tab" aria-selected={ansicht.art === 'brainstorm'} aria-pressed={ansicht.art === 'brainstorm'} onClick={() => setAnsicht({ art: 'brainstorm' })}>Brainstorm</button>
      <button role="tab" aria-selected={ansicht.art === 'vergleich'} aria-pressed={ansicht.art === 'vergleich'} onClick={() => setAnsicht({ art: 'vergleich' })}>Vergleich</button>
    </div>
  );

  if (ansicht.art === 'vergleich') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bereich}
        <LaborVergleich key={(ansicht.ids || []).join(',')} startIds={ansicht.ids} />
      </div>
    );
  }

  if (ansicht.art === 'brainstorm') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bereich}
        <Brainstorm b={b} ideen={liste} meldung={meldung} onZurHypothese={(karte, zettel) => setAnsicht({ art: 'karte', karte, zettel })} onIdeeOeffnen={(id) => setAnsicht({ art: 'idee', id })} />
      </div>
    );
  }

  const gruppen: { titel: string; filter: (v: { karte: LKarte }) => boolean }[] = [
    { titel: 'Strategien und Kurs-Hypothesen (28 Devisenpaare)', filter: (v) => v.karte.typ !== 'fremd' },
    { titel: 'Hypothesen mit Fremddaten (Rohstoffe, Wetter, Krieg, Makro …)', filter: (v) => v.karte.typ === 'fremd' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {bereich}
      <section className="karte in">
        <h2 className="karte-titel">Labor <small>{liste.length} Idee{liste.length === 1 ? '' : 'n'}</small></h2>
        <p className="leise" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '0 0 12px', maxWidth: '70ch' }}>
          Hier testest du Strategien und Hypothesen nach festen Regeln: Vorab festhalten, was gilt, dann backtesten. Hypothesen gehen auch über Devisen hinaus – Erdgas, Gold, Weizen, Öl, Indizes mit Wetter-, Kriegs-, Makro- oder eigenen Daten. Der Forward-Zeitraum bleibt gesperrt, bis du ihn einmal bewusst öffnest. Jede Änderung nach dem Start ist eine neue Version – die Zentrale zählt mit, wie viel du probiert hast.
        </p>
        <div className="lb-kopf">
          <button className="knopf-akzent press" onClick={() => setVorlagen(true)}>+ Neue Idee</button>
          <button className="knopf-klein press" onClick={() => setImportOffen(true)}>Markdown importieren …</button>
          <ExportKnoepfe ideen={liste.map((i) => i.id)} klein={false} />
          <span className="leise" style={{ fontSize: 12.5 }}>(alle {liste.length})</span>
        </div>
        {meldung && <div className="leise" style={{ fontSize: 13, marginTop: 8 }}>{meldung}</div>}
      </section>

      {liste.length > 0 && (
        <section className="karte in" aria-label="Bibliothek">
          <div className="lb-kopf" style={{ marginBottom: 10 }}>
            <input className="lb-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen (Name, Stichwort, Markt) …" aria-label="Ideen suchen" />
            <select className="lb-select" style={{ flex: '0 1 200px' }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Art">
              <option value="">alle Arten</option><option value="strategie">Strategien</option><option value="hypothese">Hypothesen · Kurse</option><option value="fremd">Hypothesen · Fremddaten</option>
            </select>
            {alleTags.length > 0 && (
              <select className="lb-select" style={{ flex: '0 1 160px' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Stichwort">
                <option value="">alle Stichworte</option>{alleTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <button className="knopf-klein press" onClick={() => { setWaehlen((w) => !w); setAuswahl(new Set()); }}>{waehlen ? 'Auswahl beenden' : 'Auswählen'}</button>
            {waehlen && (
              <>
                <button className="knopf-klein press" onClick={() => setAuswahl(new Set(sichtbar.map((i) => i.id)))}>Alle sichtbaren</button>
                <ExportKnoepfe ideen={[...auswahl]} />
                <span className="leise" style={{ fontSize: 12.5 }}>{auswahl.size} gewählt</span>
              </>
            )}
          </div>
          {gruppen.map((g) => {
            const l = sichtbar.filter((i) => g.filter({ karte: { typ: i.typ, name: i.name } }));
            if (!l.length) return null;
            return (
              <div key={g.titel} style={{ marginBottom: 10 }}>
                <h4 className="nw-h">{g.titel}</h4>
                <div className="lb-liste">
                  {l.map((i) => (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center' }}>
                      {waehlen && <label className="lb-auswahl"><input type="checkbox" checked={auswahl.has(i.id)} onChange={() => setAuswahl((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} aria-label={`${i.name} auswählen`} /></label>}
                      <IdeeZeile i={i} onClick={() => setAnsicht({ art: 'idee', id: i.id })} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!sichtbar.length && <div className="leise">Keine Idee passt zum Filter.</div>}
        </section>
      )}

      {vorlagen && (
        <Popup titel="Neue Idee" unter="Mit einer Vorlage beginnen – alles ist danach änderbar" onClose={() => setVorlagen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['strategie', 'hypothese', 'fremd'] as const).map((typ) => (
              <div key={typ} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h4 className="nw-h" style={{ margin: '6px 0 0' }}>{typ === 'fremd' ? 'Hypothese mit Fremddaten (Rohstoffe, Wetter, Krieg, Makro …)' : typ === 'hypothese' ? 'Hypothese auf den 28 Devisenpaaren' : 'Strategie'}</h4>
                {b.vorlagen.filter((v) => v.karte.typ === typ).map((v) => (
                  <button key={v.id} className="lb-vorlage press" onClick={() => { setVorlagen(false); setAnsicht({ art: 'karte', karte: structuredClone(v.karte) }); }}>
                    <strong>{v.name.replace(/^Fremddaten: /, '')}</strong>
                    {v.karte.mechanismus && <span className="leise">{v.karte.mechanismus}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Popup>
      )}
      {importOffen && <ImportPopup ideen={liste} onClose={() => setImportOffen(false)} onFertig={(t) => { setImportOffen(false); setMeldung(t); laden(); setTimeout(() => setMeldung(null), 6000); }} />}
    </div>
  );
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
        {!laeuft && i.ergebnis && (
          <>
            <div className="leise" style={{ fontSize: 13, marginTop: 2 }}>{i.ergebnis.einzeiler || i.ergebnis.warum}</div>
            {i.ergebnis.achten1 && <div className="lb-zeile-warnung">⚠ {i.ergebnis.achten1}</div>}
          </>
        )}
        {(i.tags?.length > 0 || i.extern) && (
          <div className="lb-tags">
            {i.tags.map((t) => <span key={t} className="lb-tag">{t}</span>)}
            {i.extern && <span className="lb-tag" title={i.extern.kernzahl}>Skill {i.extern.datum}: {i.extern.urteil || 'ohne Urteil'}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {i.ergebnis ? <UrteilChip urteil={i.ergebnis.urteil} /> : i.extern?.urteil ? <UrteilChip urteil={i.extern.urteil} /> : <span className="leise" style={{ fontSize: 12.5 }}>noch nicht getestet</span>}
        {i.ergebnis && (
          <span className="leise" style={{ fontSize: 12.5 }}>
            N {i.ergebnis.n} · unabh. {i.ergebnis.nUnabhaengig}
            {i.typ === 'fremd' ? (i.ergebnis.mehrwertProzent !== null && i.ergebnis.mehrwertProzent !== undefined ? ` · Mehrwert ${pText(i.ergebnis.mehrwertProzent, 1)}` : '') : i.ergebnis.avgR !== null ? ` · Ø ${rText(i.ergebnis.avgR)}` : ''}
          </span>
        )}
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
function KarteEditor({ b, ideen, start, id, onZurueck, onGespeichert }: { b: LBausteine; ideen: LIdeeKurz[]; start: LKarte; id?: string; onZurueck: () => void; onGespeichert: (id: string) => void }) {
  const fremdIdeen = ideen.filter((i) => i.typ === 'fremd');
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
        <label className="nw-feld">Mechanismus (warum sollte es funktionieren? Ein Satz genügt)<textarea className="lb-text" rows={2} value={k.mechanismus || ''} onChange={(e) => setz('mechanismus', e.target.value)} /></label>
        <label className="nw-feld">Erfolgskriterium (vorab als Zahl, z. B. «Ø R &gt; 0,1, p &lt; 0,05, beide Hälften positiv»)<textarea className="lb-text" rows={2} value={k.erfolgskriterium || ''} onChange={(e) => setz('erfolgskriterium', e.target.value)} /></label>
        <Erweitert hilfe="Standardwerte passen meistens, leere Felder sind in Ordnung">
          <label className="nw-feld">Erwartung (Richtung und Zeitraum)<textarea className="lb-text" rows={2} value={k.erwartung || ''} onChange={(e) => setz('erwartung', e.target.value)} /></label>
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
        </Erweitert>
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
                  <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 460, marginBottom: 10, background: '#fff' }}>
                    <button type="button" aria-pressed={k.bias.quelle !== 'fremd'} onClick={() => setz('bias', { tf: 'D', richtung: 'beide', tage: 5, ereignisse: [] })}>Ereignis auf den Kursen</button>
                    <button type="button" aria-pressed={k.bias.quelle === 'fremd'} disabled={!fremdIdeen.length} onClick={() => setz('bias', { quelle: 'fremd', idee: fremdIdeen[0]?.id || '', richtung: 'beide', tage: 30, ereignisse: [] })}>Fremddaten-Hypothese</button>
                  </div>
                  {k.bias.quelle === 'fremd' ? (
                    <>
                      <div className="lb-felder">
                        <label className="nw-feld lb-breit">Hypothese (ihre Ereignisse öffnen das Fenster)
                          <select value={k.bias.idee || ''} onChange={(e) => setz('bias', { ...k.bias!, idee: e.target.value })}>
                            {fremdIdeen.map((i) => <option key={i.id} value={i.id}>{i.name}{i.ergebnis ? ` (${i.ergebnis.urteil})` : ''}</option>)}
                          </select>
                        </label>
                        <label className="nw-feld">Richtung der Trades<select value={k.bias.richtung} onChange={(e) => setz('bias', { ...k.bias!, richtung: e.target.value })}><option value="beide">beide</option><option value="long">nur Long</option><option value="short">nur Short</option></select></label>
                        <label className="nw-feld">Fenster (Kalendertage)<input type="number" min={1} max={365} value={k.bias.tage} onChange={(e) => setz('bias', { ...k.bias!, tage: Number(e.target.value) })} /></label>
                      </div>
                      <p className="tr-hilfe" style={{ margin: '0 0 8px' }}>Das Fenster beginnt, wenn das Ereignis bekannt ist (plus Wartezeit der Hypothese), und dauert so viele Kalendertage. Die Richtung legst du hier fest, weil eine Rohstoff-Hypothese nicht automatisch sagt, welches Paar steigt.</p>
                    </>
                  ) : (
                    <>
                      <div className="lb-felder">
                        <label className="nw-feld">Zeitrahmen<select value={k.bias.tf} onChange={(e) => setz('bias', { ...k.bias!, tf: e.target.value })}>{b.zeitrahmen.map((z) => <option key={z.wert} value={z.wert}>{z.text}</option>)}</select></label>
                        <label className="nw-feld">Fenster (Handelstage)<input type="number" min={1} max={60} value={k.bias.tage} onChange={(e) => setz('bias', { ...k.bias!, tage: Number(e.target.value) })} /></label>
                      </div>
                      <TeilListe titel="Bias-Ereignisse" katalog={b.ereignisse} liste={k.bias.ereignisse} setze={(l) => setz('bias', { ...k.bias!, ereignisse: l })} leer="Ereignis wählen, das die Richtung vorgibt." />
                    </>
                  )}
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

// ---------- Eine Idee: Status, Läufe, Ergebnis, Notizen, Skill-Ergebnisse ----------
function IdeeAnsicht({ b, id, onZurueck, onBearbeiten, onOeffnen, onVergleich }: { b: LBausteine; id: string; onZurueck: () => void; onBearbeiten: (k: LKarte, neu?: boolean) => void; onOeffnen: (id: string) => void; onVergleich: (ids: string[]) => void }) {
  const [i, setI] = useState<LIdee | null>(null);
  const [erg, setErg] = useState<LErgebnis | LFErgebnis | null>(null);
  const [laufId, setLaufId] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<'forward' | 'loeschen' | 'verwerfen' | 'lauf' | null>(null);
  const [karteAuf, setKarteAuf] = useState(false);
  const [versionWahl, setVersionWahl] = useState<number | null>(null);
  const [detailsAuf, setDetailsAuf] = useState(false);

  const laden = useCallback(async () => {
    try { const x = await holen<LIdee>(`/api/labor/idee?id=${id}`); setI(x); setFehler(null); return x; } catch (e) { setFehler((e as Error).message); return null; }
  }, [id]);
  useEffect(() => { laden(); setLaufId(null); setVersionWahl(null); }, [laden]);
  const laeuft = i?.lauf && (i.lauf.status === 'laeuft' || i.lauf.status === 'wartet');
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => { if (!document.hidden) laden(); }, 2000);
    return () => clearInterval(t);
  }, [laeuft, laden]);
  // Ergebnis des gewählten oder neuesten fertigen Laufs laden
  const zielLauf = laufId || i?.ergebnis?.lauf || null;
  useEffect(() => {
    if (!zielLauf) { setErg(null); return; }
    holen<LErgebnis | LFErgebnis>(`/api/labor/ergebnis?lauf=${zielLauf}`).then(setErg).catch(() => setErg(null));
  }, [zielLauf]);

  if (fehler && !i) return <div className="karte fehlerbox">{fehler}</div>;
  if (!i) return <div className="karte leise">Lade …</div>;
  const v = i.versionen[i.versionen.length - 1];
  const gezeigt = i.versionen.find((x) => x.v === versionWahl) || v;
  const fertigeLaeufe = i.laeufe.filter((l) => l.status === 'fertig').slice().reverse();
  const backtestFertig = i.laeufe.some((l) => l.v === i.version && l.status === 'fertig');
  const istFremd = v.karte.typ === 'fremd';

  const aktion = async (pfad: string, body: unknown, method?: 'POST' | 'DELETE') => {
    setFehler(null);
    try { await senden(pfad, body, method); setLaufId(null); await laden(); } catch (e) { setFehler((e as Error).message); }
  };
  const meta = async (daten: Record<string, unknown>) => {
    setFehler(null);
    try { const r = await senden<LIdee>('/api/labor/idee/meta', { id, ...daten }); setI(r); } catch (e) { setFehler((e as Error).message); }
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
          {istFremd && v.karte.maerkte?.length ? ` · ${v.karte.maerkte.map((m) => reiheNameKlient(b.fremd, m.id)).join(', ')}` : ''}
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
          {!v.eingefroren && i.versionen.length > 1 && <button className="knopf-klein press" onClick={() => setFrage('verwerfen')}>Entwurf verwerfen …</button>}
          <button className="knopf-klein press" onClick={async () => { try { const r = await senden<LIdee>('/api/labor/idee/kopieren', { id }); onOeffnen(r.id); } catch (e) { setFehler((e as Error).message); } }}>Kopieren</button>
          {istFremd && <button className="knopf-klein press" title="Kerims Entry-Model (oder eine andere Strategie) nur in den Fenstern dieser Hypothese handeln" onClick={() => {
            const vorlage = b.vorlagen.find((x) => x.id === 'gva')?.karte;
            if (vorlage) onBearbeiten({ ...structuredClone(vorlage), name: `GVA im Fenster: ${v.karte.name}`.slice(0, 80), bias: { quelle: 'fremd', idee: id, richtung: 'beide', tage: v.karte.hauptHorizont || 30, ereignisse: [] } }, true);
          }}>Als Bias-Fenster für eine Strategie …</button>}
          <button className="knopf-klein press" onClick={() => setKarteAuf((x) => !x)}>{karteAuf ? 'Vorab-Karte zu' : 'Vorab-Karte'}</button>
          <ExportKnoepfe ideen={[id]} />
          <button className="knopf-klein press" style={{ color: 'var(--fehler)' }} onClick={() => setFrage('loeschen')}>Löschen …</button>
        </div>
        {frage === 'forward' && (
          <Rueckfrage titel="Forward-Zeitraum öffnen?" ja="Ja, jetzt öffnen" onNein={() => setFrage(null)} onJa={() => { setFrage(null); aktion('/api/labor/forward-oeffnen', { id }); }}
            text={`Der Zeitraum ab ${v.karte.forward?.von} wurde bisher nie angeschaut. Nach dem Öffnen ist er für diese Idee «verbraucht»: Jede spätere Version kennt ihn schon und ist dort nicht mehr unvoreingenommen. Öffne ihn erst, wenn die Regel wirklich feststeht.`} />
        )}
        {frage === 'verwerfen' && (
          <Rueckfrage titel={`Entwurf (Version ${v.v}) verwerfen?`} text="Die vorige, eingefrorene Version wird wieder die aktuelle." ja="Verwerfen" gefahr onNein={() => setFrage(null)} onJa={() => { setFrage(null); aktion('/api/labor/version-verwerfen', { id }); }} />
        )}
        {frage === 'loeschen' && (
          <Rueckfrage titel="Idee mit allen Versionen und Ergebnissen löschen?" text="Tipp: vorher als Markdown exportieren, wenn du sie behalten willst." ja="Löschen" gefahr onNein={() => setFrage(null)}
            onJa={async () => { await senden('/api/labor/idee', { id }, 'DELETE').catch(() => {}); onZurueck(); }} />
        )}
        {karteAuf && (
          <>
            {i.versionen.length > 1 && (
              <div className="lb-chips" style={{ marginTop: 12 }}>
                {i.versionen.slice().reverse().map((x) => (
                  <button key={x.v} type="button" className="lb-wahl press" aria-pressed={gezeigt.v === x.v} onClick={() => setVersionWahl(x.v)}>V{x.v}{x.eingefroren ? '' : ' (Entwurf)'}</button>
                ))}
              </div>
            )}
            {gezeigt.karte.typ === 'fremd' ? <FremdVorabKarte k={gezeigt.karte} b={b} /> : <VorabKarte k={gezeigt.karte} b={b} />}
          </>
        )}
      </section>

      {fertigeLaeufe.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {fertigeLaeufe.length > 1 && (
            <div className="segment" style={{ gridTemplateColumns: `repeat(${Math.min(fertigeLaeufe.length, 4)}, 1fr)`, flex: '1 1 320px' }}>
              {fertigeLaeufe.slice(0, 4).map((l) => (
                <button key={l.id} aria-pressed={(zielLauf || '') === l.id} onClick={() => setLaufId(l.id)}>V{l.v} · {l.art === 'forward' ? 'mit Forward' : 'Backtest'}</button>
              ))}
            </div>
          )}
          {fertigeLaeufe.length > 1 && <button className="knopf-klein press" onClick={() => onVergleich(fertigeLaeufe.slice(0, Math.min(4, fertigeLaeufe.length)).map((l) => l.id))}>Läufe vergleichen</button>}
          {zielLauf && <a className="knopf-klein press" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/labor/pdf?lauf=${zielLauf}`} download>Als PDF</a>}
          {zielLauf && <button className="knopf-klein press" onClick={() => setFrage('lauf')}>Dieses Ergebnis löschen …</button>}
        </div>
      )}
      {frage === 'lauf' && zielLauf && (
        <Rueckfrage titel="Dieses Ergebnis löschen?" text="Die Version bleibt eingefroren und zählt weiter als getestete Variante." ja="Löschen" gefahr onNein={() => setFrage(null)}
          onJa={() => { setFrage(null); aktion('/api/labor/lauf', { lauf: zielLauf }, 'DELETE'); }} />
      )}

      {erg?.fazit && <FazitKarte f={erg.fazit} offen={detailsAuf} onUmschalten={() => setDetailsAuf((x) => !x)} />}
      {erg ? ((!erg.fazit || detailsAuf) && (erg.typ === 'fremd' ? <ErgebnisFremd e={erg as LFErgebnis} /> : erg.typ === 'hypothese' ? <ErgebnisHypothese e={erg as LErgebnis} /> : <ErgebnisStrategie e={erg as LErgebnis} />))
        : !laeuft && <div className="karte leise">Noch kein Ergebnis aus der Zentrale – starte den Backtest{istFremd ? ' (oder trage unten ein Ergebnis aus dem Skill ein)' : ''}.</div>}

      <NotizenKarte i={i} speichern={meta} />
      <SkillErgebnisse i={i} speichern={meta} />
      <section className="karte in"><MdVorschau key={`${id}-${i.version}-${i.ergebnis?.lauf || ''}-${i.externAlle.length}`} ideeId={id} /></section>
    </div>
  );
}

function NotizenKarte({ i, speichern }: { i: LIdee; speichern: (d: Record<string, unknown>) => Promise<void> }) {
  const [notizen, setNotizen] = useState(i.notizen || '');
  const [tags, setTags] = useState((i.tags || []).join(', '));
  const [ok, setOk] = useState(false);
  useEffect(() => { setNotizen(i.notizen || ''); setTags((i.tags || []).join(', ')); }, [i.id, i.notizen, i.tags]);
  const geaendert = notizen !== (i.notizen || '') || tags !== (i.tags || []).join(', ');
  return (
    <section className="karte in">
      <h2 className="karte-titel">Notizen und Stichworte <small>gehören nicht zur Vorab-Karte, ändern keine Version</small></h2>
      <label className="nw-feld">Stichworte (mit Komma)<input value={tags} onChange={(e) => { setTags(e.target.value); setOk(false); }} placeholder="erdgas, winter, wetter" /></label>
      <label className="nw-feld">Notizen<textarea className="lb-text" rows={4} value={notizen} onChange={(e) => { setNotizen(e.target.value); setOk(false); }} placeholder="Beobachtungen, nächste Schritte, Ideen für Varianten …" /></label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="knopf-klein press" disabled={!geaendert} onClick={async () => { await speichern({ notizen, tags: tags.split(',').map((s) => s.trim()).filter(Boolean) }); setOk(true); }}>Speichern</button>
        {ok && !geaendert && <span className="leise" style={{ fontSize: 13 }}>Gespeichert ✓</span>}
      </div>
    </section>
  );
}

const URTEILE = ['Bestätigt', 'Hinweis', 'Nicht bestätigt', 'Zu wenig Daten'];
const leerExtern = (): LExtern => ({ id: '', datum: new Date().toISOString().slice(0, 10), urteil: null, stufe: '', kernzahl: '', link: '', text: '', n: null, nUnabhaengig: null });
function SkillErgebnisse({ i, speichern }: { i: LIdee; speichern: (d: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState<LExtern | null>(null);
  const liste = i.externAlle || [];
  const sichern = async (neu: LExtern[]) => { await speichern({ extern: neu }); setForm(null); };
  return (
    <section className="karte in">
      <h2 className="karte-titel">Ergebnisse aus dem Skill <small>{liste.length}</small></h2>
      <p className="tr-hilfe" style={{ margin: '0 0 8px' }}>Was der Skill «hypothese-testen» ausserhalb der Zentrale gerechnet hat. Am einfachsten: die Antwort des Skills als Markdown importieren (Bibliothek → Markdown importieren) – oder hier von Hand eintragen.</p>
      {liste.map((x) => (
        <div key={x.id} className="lb-extern">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{x.datum}</b>{x.urteil && <UrteilChip urteil={x.urteil} />}{x.stufe && <span className="lb-tag">Stufe {x.stufe}</span>}
            {x.n !== null && <span className="leise" style={{ fontSize: 12.5 }}>N {x.n}{x.nUnabhaengig !== null ? ` · unabh. ${x.nUnabhaengig}` : ''}</span>}
            <span style={{ flex: 1 }} />
            <button className="knopf-klein press" onClick={() => setForm({ ...x })}>Bearbeiten</button>
            <button className="knopf-klein press" onClick={() => sichern(liste.filter((y) => y.id !== x.id))}>Entfernen</button>
          </div>
          {x.kernzahl && <div style={{ marginTop: 4 }}>{x.kernzahl}</div>}
          {x.text && <div className="leise" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.text}</div>}
          {x.link && <div style={{ marginTop: 4 }}><a href={x.link} target="_blank" rel="noopener noreferrer">Ergebnis-Seite öffnen</a></div>}
        </div>
      ))}
      {form ? (
        <div className="lb-teil">
          <div className="lb-felder">
            <label className="nw-feld">Datum<input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
            <label className="nw-feld">Urteil<select value={form.urteil || ''} onChange={(e) => setForm({ ...form, urteil: e.target.value || null })}><option value="">—</option>{URTEILE.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
            <label className="nw-feld">Monty-Stufe<input value={form.stufe} onChange={(e) => setForm({ ...form, stufe: e.target.value })} placeholder="1, 2, 3 oder 4" /></label>
            <label className="nw-feld">Fälle (N)<input type="number" value={form.n ?? ''} onChange={(e) => setForm({ ...form, n: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            <label className="nw-feld">davon unabhängig<input type="number" value={form.nUnabhaengig ?? ''} onChange={(e) => setForm({ ...form, nUnabhaengig: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            <label className="nw-feld lb-breit">Kernzahlen<input value={form.kernzahl} onChange={(e) => setForm({ ...form, kernzahl: e.target.value })} placeholder="Ø +5,8 % · Saison +2,6 % · p 0,19" /></label>
            <label className="nw-feld lb-breit">Link zur Ergebnis-Seite<input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://claude.ai/artifact/…" /></label>
            <label className="nw-feld lb-breit">Einordnung<textarea className="lb-text" rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Was heisst das? Was würde das Urteil ändern?" /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="knopf-akzent press" onClick={() => sichern(form.id ? liste.map((y) => (y.id === form.id ? form : y)) : [...liste, form])}>Speichern</button>
            <button className="knopf-klein press" onClick={() => setForm(null)}>Abbrechen</button>
          </div>
        </div>
      ) : <button className="knopf-klein press" onClick={() => setForm(leerExtern())}>+ Ergebnis eintragen</button>}
    </section>
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
      : ([['Strategie', name(b.strategien, k.modell || '')], ['Parameter', Object.entries(k.parameter || {}).map(([a, w]) => `${a} ${Array.isArray(w) ? w.join('/') : w}`).join(', ') || 'Standard'], ['Ereignisse', teile(k.ereignisse)], ['Bias-Fenster', k.bias ? (k.bias.quelle === 'fremd' ? `Fremddaten-Hypothese ${k.bias.idee} · ${k.bias.tage} Kalendertage · ${k.bias.richtung}` : `${teile(k.bias.ereignisse)} · ${k.bias.tage} Handelstage`) : '—']] as [string, string][])),
    ['Filter', teile(k.filter)],
  ];
  return (
    <dl className="lb-karte">
      {zeilen.map(([a, w]) => <div key={a}><dt>{a}</dt><dd>{w}</dd></div>)}
    </dl>
  );
}

// ---------- Ergebnis-Bausteine ----------
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
  const [chartOffen, setChartOffen] = useState<number | null>(null);
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
            {Object.entries(e.trichter).filter(([a]) => ['linien', 'bos', 'einstieg'].includes(a)).map(([a, w]) => `${a === 'linien' ? 'GVA-Treffer' : a === 'bos' ? 'mit BOS' : 'Einstieg erreicht'} ${w}`).join(' → ')}
            {(() => {
              const T = e.trichter as Record<string, number>;
              const GRUND: [string, string][] = [['keinHoch', 'kein letztes Hoch vor dem Hit'], ['keinBos', 'kein BOS im Zeitfenster'], ['bosNurUnterOpen', 'BOS nur unter dem Daily Open'], ['ungueltig', 'ungültig (Kurs schon weggelaufen)'], ['gebrochen', 'Low vor dem Einstieg gebrochen'], ['verfallen', 'verfallen (kein Einstieg)'], ['zuWenigConf', 'zu wenig Confluences in der Box'], ['gegenBos', 'wegen Gegen-BOS-Regel']];
              const teile = GRUND.filter(([k]) => T[k]).map(([k, txt]) => `${T[k]} ${txt}`);
              return teile.length ? ` · ausgeschieden: ${teile.join(', ')}` : '';
            })()}
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
            <thead><tr><th>Einstieg</th><th>Paar</th><th>Seite</th><th>Risiko</th><th>Ausstieg</th><th>R</th><th></th></tr></thead>
            <tbody>
              {trades.slice(0, mehr).map((t: LTrade & { fw?: boolean }, x) => (
                <Fragment key={x}>
                  <tr style={t.fw ? { background: 'rgba(214,162,58,.08)' } : undefined}>
                    <td>{new Date(t.tEin * 1000).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}{t.fw ? ' · F' : ''}</td>
                    <td>{t.pair}</td><td>{t.seite > 0 ? 'Long' : 'Short'}</td><td>{t.risikoPips} Pips</td>
                    <td>{grundText(t)}</td>
                    <td style={{ color: t.r >= 0 ? 'var(--gruen)' : 'var(--fehler)', fontWeight: 600 }}>{rText(t.r)}</td>
                    <td><button className="knopf-klein press" onClick={() => setChartOffen(chartOffen === x ? null : x)}>{chartOffen === x ? 'Zu' : 'Chart'}</button></td>
                  </tr>
                  {chartOffen === x && <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><TradeChart t={t} parameter={e.parameter} /></td></tr>}
                </Fragment>
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
