'use client';
// Trading → Labor: Brainstorm-Zettel, Markdown-Export (Datei, Zwischenablage) und Markdown-Import (eigene Exporte, Skill-Ergebnisse,
// Projekt-Docs und die Obsidian-Tabelle «Hypothesen»).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { holen, senden, kopieren } from '@/lib/api';
import { mdHerunterladen, type LBausteine, type LIdeeKurz, type LImportEintrag, type LKarte, type LKette, type LZettel } from '@/lib/labor';
import { Popup } from './NetzBausteine';
import { Rueckfrage, UrteilChip } from './LaborTeile';
import { passendeFallen } from './LaborFremd';

const STATUS: { wert: LZettel['status']; text: string }[] = [
  { wert: 'roh', text: 'Roh' }, { wert: 'ausgearbeitet', text: 'Ausgearbeitet' }, { wert: 'getestet', text: 'Getestet' }, { wert: 'verworfen', text: 'Verworfen' },
];
const FARBEN: { wert: LZettel['farbe']; css: string }[] = [
  { wert: 'gelb', css: '#ffe9a3' }, { wert: 'blau', css: '#c9dbff' }, { wert: 'gruen', css: '#bfe6cf' }, { wert: 'rot', css: '#f6c7c1' }, { wert: 'grau', css: '#d7dce4' },
];
const KETTE: [keyof LKette, string][] = [['ereignis', 'Ereignis (messbar)'], ['mechanismus', 'Mechanismus'], ['wirkung', 'Wirkung'], ['markt', 'Markt'], ['zeitraum', 'Zeitraum']];
const leererZettel = (): Partial<LZettel> => ({ titel: '', text: '', tags: [], status: 'roh', kette: {}, spiegel: '', fragen: '', quellen: '', wege: [], links: [], farbe: 'gelb' });
const ketteText = (k: LKette | undefined) => KETTE.map(([key]) => k?.[key]).filter(Boolean) as string[];

// ---------- Export ----------
export async function exportHolen(ideen: string[], zettel: string[]) {
  return senden<{ datei: string; md: string }>('/api/labor/export', { ideen, zettel });
}
export function ExportKnoepfe({ ideen = [], zettel = [], klein }: { ideen?: string[]; zettel?: string[]; klein?: boolean }) {
  const [meldung, setMeldung] = useState<string | null>(null);
  const leer = !ideen.length && !zettel.length;
  const zeige = (t: string) => { setMeldung(t); setTimeout(() => setMeldung(null), 2200); };
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="knopf-klein press" disabled={leer} onClick={async () => {
        try { const r = await exportHolen(ideen, zettel); mdHerunterladen(r.datei, r.md); zeige('Heruntergeladen ✓'); } catch (e) { zeige((e as Error).message); }
      }}>{klein ? 'MD' : 'Als MD herunterladen'}</button>
      <button className="knopf-klein press" disabled={leer} onClick={async () => {
        try { const r = await exportHolen(ideen, zettel); zeige((await kopieren(r.md)) ? 'Kopiert ✓ – im Chat mit dem Skill einfügen' : 'Kopieren fehlgeschlagen'); } catch (e) { zeige((e as Error).message); }
      }}>{klein ? 'Kopieren' : 'MD kopieren'}</button>
      {meldung && <span className="leise" style={{ fontSize: 12.5 }}>{meldung}</span>}
    </span>
  );
}

// ---------- Import ----------
export function ImportPopup({ ideen, onClose, onFertig }: { ideen: LIdeeKurz[]; onClose: () => void; onFertig: (t: string) => void }) {
  const [text, setText] = useState('');
  const [eintraege, setEintraege] = useState<LImportEintrag[] | null>(null);
  const [warnungen, setWarnungen] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const pruefen = async (zu = zuordnung) => {
    setFehler(null); setLaeuft(true);
    try {
      const r = await senden<{ eintraege: LImportEintrag[]; warnungen: string[] }>('/api/labor/import', { text, zuordnung: zu });
      setEintraege(r.eintraege); setWarnungen(r.warnungen || []);
      setAuswahl((alt) => (eintraege ? alt : new Set(r.eintraege.filter((e) => e.ziel !== 'unverändert').map((e) => e.nr))));
    } catch (e) { setFehler((e as Error).message); }
    setLaeuft(false);
  };
  const uebernehmen = async () => {
    setFehler(null); setLaeuft(true);
    try {
      const r = await senden<{ angelegt: { ideen: number; zettel: number; ergebnisse: number } }>('/api/labor/import', { text, uebernehmen: true, auswahl: [...auswahl], zuordnung });
      const a = r.angelegt;
      onFertig(`Importiert: ${a.ideen} Idee${a.ideen === 1 ? '' : 'n'}, ${a.zettel} Zettel, ${a.ergebnisse} Ergebnis${a.ergebnisse === 1 ? '' : 'se'}`);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  };
  const ART = { idee: 'Idee', zettel: 'Zettel', ergebnis: 'Skill-Ergebnis' } as const;

  return (
    <Popup titel="Markdown importieren" unter="Eigene Exporte, Ergebnisse des Skills «hypothese-testen», Projekt-Docs oder die Obsidian-Tabelle «Hypothesen»" onClose={onClose} breit>
      <textarea className="lb-text" rows={eintraege ? 4 : 10} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12.5 }} value={text}
        onChange={(e) => { setText(e.target.value); setEintraege(null); }} placeholder="Markdown hier einfügen …" aria-label="Markdown" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <label className="knopf-klein press" style={{ cursor: 'pointer' }}>Datei wählen (.md)
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden onChange={async (e) => {
            const fs = Array.from(e.target.files || []);
            const teile = await Promise.all(fs.map((f) => f.text()));
            setText(teile.join('\n\n---\n\n').slice(0, 2_000_000)); setEintraege(null);
          }} />
        </label>
        <button className="knopf-akzent press" disabled={!text.trim() || laeuft} onClick={() => pruefen()}>Prüfen</button>
      </div>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      {warnungen.map((w) => <div key={w} className="leise" style={{ fontSize: 12.5, color: '#b7791f' }}>{w}</div>)}
      {eintraege && (
        eintraege.length === 0 ? <div className="leise">Nichts erkannt. Am sichersten sind Exporte aus der Zentrale oder Texte mit Zeilen wie «Hypothese:», «Mechanismus:», «Urteil:».</div> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="lb-tabelle">
                <thead><tr><th /><th>Art</th><th>Name</th><th>Was passiert</th></tr></thead>
                <tbody>
                  {eintraege.map((e) => (
                    <tr key={e.nr}>
                      <td><input type="checkbox" checked={auswahl.has(e.nr)} onChange={() => setAuswahl((s) => { const n = new Set(s); if (n.has(e.nr)) n.delete(e.nr); else n.add(e.nr); return n; })} aria-label={`${e.name} übernehmen`} /></td>
                      <td>{ART[e.art]}{e.typ ? ` · ${e.typ === 'fremd' ? 'Fremddaten' : e.typ === 'hypothese' ? 'Kurse' : 'Strategie'}` : ''}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 180 }}>
                        {e.name}
                        {e.art === 'ergebnis' && <div style={{ marginTop: 2 }}>{e.urteil && <UrteilChip urteil={e.urteil} />} <span className="leise" style={{ fontSize: 12 }}>{e.kernzahl}</span></div>}
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>
                        {e.art === 'ergebnis' ? (
                          <select className="lb-select" value={zuordnung[e.nr] ?? e.ideeId ?? 'zettel'} onChange={(ev) => { const z = { ...zuordnung, [e.nr]: ev.target.value }; setZuordnung(z); pruefen(z); }} aria-label="Zuordnen">
                            <option value="zettel">als Zettel ablegen</option>
                            {ideen.map((i) => <option key={i.id} value={i.id}>zu «{i.name}»</option>)}
                          </select>
                        ) : e.ziel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tr-hilfe" style={{ margin: '8px 0' }}>Eine bekannte Idee mit geänderter Vorab-Karte wird als neue Version gespeichert (zählt als Variante). Skill-Ergebnisse erscheinen bei der Idee unter «Ergebnisse aus dem Skill».</p>
            <button className="knopf-akzent press" disabled={!auswahl.size || laeuft} onClick={uebernehmen}>{auswahl.size} übernehmen</button>
          </>
        )
      )}
    </Popup>
  );
}

// ---------- Brainstorm ----------
export function Brainstorm({ b, ideen, onZurHypothese, onIdeeOeffnen, meldung }: {
  b: LBausteine; ideen: LIdeeKurz[]; onZurHypothese: (karte: LKarte, zettelId: string) => void; onIdeeOeffnen: (id: string) => void; meldung?: string | null;
}) {
  const [zettel, setZettel] = useState<LZettel[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<Partial<LZettel> | null>(null);
  const [suche, setSuche] = useState('');
  const [status, setStatus] = useState<'' | LZettel['status']>('');
  const [tag, setTag] = useState('');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [waehlen, setWaehlen] = useState(false);
  const [schnell, setSchnell] = useState('');

  const laden = useCallback(async () => {
    try { setZettel((await holen<{ zettel: LZettel[] }>('/api/labor/zettel')).zettel); setFehler(null); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const alleTags = useMemo(() => [...new Set((zettel || []).flatMap((z) => z.tags))].sort(), [zettel]);
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (zettel || []).filter((z) => (!status || z.status === status) && (!tag || z.tags.includes(tag))
      && (!q || [z.titel, z.text, z.fragen, z.spiegel, z.quellen, ...Object.values(z.kette || {}), ...z.tags].join(' ').toLowerCase().includes(q)));
  }, [zettel, suche, status, tag]);

  const schnellAnlegen = async () => {
    const t = schnell.trim();
    if (!t) return;
    const [titel, ...rest] = t.split(/\n/);
    try { await senden('/api/labor/zettel', { ...leererZettel(), titel: titel.slice(0, 120), text: rest.join('\n').trim() }); setSchnell(''); laden(); } catch (e) { setFehler((e as Error).message); }
  };

  if (offen) {
    return <ZettelEditor b={b} start={offen} alle={zettel || []} ideen={ideen} onZurueck={() => { setOffen(null); laden(); }}
      onZurHypothese={onZurHypothese} onIdeeOeffnen={onIdeeOeffnen} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in">
        <h2 className="karte-titel">Brainstorm <small>{zettel?.length ?? 0} Zettel</small></h2>
        <p className="leise" style={{ fontSize: 13.5, lineHeight: 1.5, margin: '0 0 12px', maxWidth: '70ch' }}>
          Rohe Ideen festhalten, ohne schon eine Regel zu brauchen: «Wenn das passiert, passiert das». Die Kette Ereignis → Mechanismus → Wirkung → Markt → Zeitraum schärft die Idee; ist sie messbar, wird daraus eine Hypothese zum Testen. Als Markdown kannst du Zettel direkt an den Skill geben.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea className="lb-text" rows={2} style={{ flex: '1 1 260px' }} value={schnell} onChange={(e) => setSchnell(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); schnellAnlegen(); } }}
            placeholder={'Schnell-Idee: erste Zeile = Titel, Rest = Text\nz. B. «Dürre in Australien → Weizen steigt»'} aria-label="Schnell-Idee" />
          <button className="knopf-akzent press" disabled={!schnell.trim()} onClick={schnellAnlegen}>+ Zettel</button>
          <button className="knopf-klein press" onClick={() => setOffen(leererZettel())}>Ausführlich …</button>
        </div>
        {meldung && <div className="leise" style={{ fontSize: 13, marginTop: 8 }}>{meldung}</div>}
      </section>

      {fehler && <div className="fehlerbox">{fehler}</div>}

      {(zettel?.length ?? 0) > 0 && (
        <section className="karte in">
          <div className="lb-kopf" style={{ marginBottom: 12 }}>
            <input className="lb-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen …" aria-label="Zettel suchen" />
            <select className="lb-select" style={{ flex: '0 1 160px' }} value={status} onChange={(e) => setStatus(e.target.value as '' | LZettel['status'])} aria-label="Status">
              <option value="">alle Status</option>{STATUS.map((s) => <option key={s.wert} value={s.wert}>{s.text}</option>)}
            </select>
            {alleTags.length > 0 && (
              <select className="lb-select" style={{ flex: '0 1 160px' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Stichwort">
                <option value="">alle Stichworte</option>{alleTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <button className="knopf-klein press" onClick={() => { setWaehlen((w) => !w); setAuswahl(new Set()); }}>{waehlen ? 'Auswahl beenden' : 'Auswählen'}</button>
            {waehlen && (
              <>
                <button className="knopf-klein press" onClick={() => setAuswahl(new Set(sichtbar.map((z) => z.id)))}>Alle sichtbaren</button>
                <ExportKnoepfe zettel={[...auswahl]} />
              </>
            )}
          </div>
          <div className="lb-zettelwand">
            {sichtbar.map((z) => {
              const kt = ketteText(z.kette);
              const gewaehlt = auswahl.has(z.id);
              return (
                <button key={z.id} className="lb-zettel press" data-farbe={z.farbe} data-status={z.status} aria-pressed={waehlen ? gewaehlt : undefined}
                  style={waehlen && gewaehlt ? { outline: '2px solid var(--accent)' } : undefined}
                  onClick={() => (waehlen ? setAuswahl((s) => { const n = new Set(s); if (n.has(z.id)) n.delete(z.id); else n.add(z.id); return n; }) : setOffen(z))}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong>{waehlen ? (gewaehlt ? '☑ ' : '☐ ') : ''}{z.titel}</strong>
                    <span className="lb-tag" style={{ background: 'rgba(255,255,255,.6)' }}>{STATUS.find((s) => s.wert === z.status)?.text}</span>
                  </div>
                  {kt.length > 0 && <div className="lb-kette-anzeige">{kt.map((s, i) => <span key={i}>{i > 0 && <i aria-hidden="true">→</i>}{s}</span>)}</div>}
                  {z.text && <p>{z.text}</p>}
                  {(z.tags.length > 0 || z.idee) && (
                    <div className="lb-tags">
                      {z.idee && <span className="lb-tag" style={{ background: '#fff' }}>→ Hypothese</span>}
                      {z.tags.map((t) => <span key={t} className="lb-tag" style={{ background: 'rgba(255,255,255,.6)' }}>{t}</span>)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {!sichtbar.length && <div className="leise">Kein Zettel passt zum Filter.</div>}
        </section>
      )}

      <section className="karte in">
        <h2 className="karte-titel">Leitfragen <small>aus dem Skill</small></h2>
        <ol className="lb-leitfragen">{b.fremd.leitfragen.map((f) => <li key={f}>{f}</li>)}</ol>
      </section>
    </div>
  );
}

function ZettelEditor({ b, start, alle, ideen, onZurueck, onZurHypothese, onIdeeOeffnen }: {
  b: LBausteine; start: Partial<LZettel>; alle: LZettel[]; ideen: LIdeeKurz[]; onZurueck: () => void; onZurHypothese: (karte: LKarte, zettelId: string) => void; onIdeeOeffnen: (id: string) => void;
}) {
  const fb = b.fremd;
  const [z, setZ] = useState<Partial<LZettel>>(() => ({ ...leererZettel(), ...start, kette: { ...(start.kette || {}) } }));
  const [tagText, setTagText] = useState((start.tags || []).join(', '));
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const setz = <K extends keyof LZettel>(k: K, v: LZettel[K]) => { setZ((x) => ({ ...x, [k]: v })); setGespeichert(null); };
  const kette = z.kette || {};
  const fallen = passendeFallen(fb, { name: z.titel || '', mechanismus: kette.mechanismus, erwartung: kette.wirkung, kette, text: `${z.text || ''} ${z.fragen || ''}` });
  const andere = alle.filter((x) => x.id !== z.id);
  const idee = z.idee ? ideen.find((i) => i.id === z.idee) : null;

  const speichern = async (): Promise<LZettel | null> => {
    setFehler(null);
    try {
      const r = await senden<LZettel>('/api/labor/zettel', { ...z, tags: tagText.split(',').map((s) => s.trim()).filter(Boolean) });
      setZ(r); setGespeichert('Gespeichert ✓');
      return r;
    } catch (e) { setFehler((e as Error).message); return null; }
  };
  const zurHypothese = async () => {
    const r = await speichern();
    if (!r) return;
    const vorlage = b.vorlagen.find((v) => v.id === 'f-leer')?.karte;
    const karte: LKarte = {
      ...(structuredClone(vorlage) || { typ: 'fremd', name: '' }), typ: 'fremd', name: r.titel.slice(0, 80), beschreibung: r.text.slice(0, 600),
      kette: { ...r.kette }, mechanismus: r.kette.mechanismus || '', erwartung: [r.kette.wirkung, r.kette.markt, r.kette.zeitraum].filter(Boolean).join(' · '), wege: r.wege,
    };
    onZurHypothese(karte, r.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div><button className="knopf-klein press" onClick={onZurueck}>← Brainstorm</button></div>
      <section className="karte in">
        <h2 className="karte-titel">{z.id ? 'Zettel' : 'Neuer Zettel'}</h2>
        <label className="nw-feld">Titel (die Idee in ein paar Worten)<input value={z.titel || ''} onChange={(e) => setz('titel', e.target.value)} maxLength={120} placeholder="z. B. Krieg im Nahen Osten → Öl und Gold steigen" /></label>
        <label className="nw-feld">Gedanken<textarea className="lb-text" rows={4} value={z.text || ''} onChange={(e) => setz('text', e.target.value)} placeholder="Was hast du beobachtet? Warum glaubst du daran?" /></label>
        <div className="nw-feld">Kette
          <div className="lb-kette">
            {KETTE.map(([key, ph], i) => (
              <div key={key} className="lb-kette-glied">
                {i > 0 && <span aria-hidden="true">→</span>}
                <input value={kette[key] || ''} onChange={(e) => setz('kette', { ...kette, [key]: e.target.value })} placeholder={ph} aria-label={ph} maxLength={300} />
              </div>
            ))}
          </div>
        </div>
        <label className="nw-feld">Spiegel-Idee (Gegen-Ereignis → Gegenwirkung)<textarea className="lb-text" rows={2} value={z.spiegel || ''} onChange={(e) => setz('spiegel', e.target.value)} placeholder="z. B. Warmer Winter → Erdgas fällt stärker als üblich" /></label>
        <label className="nw-feld">Offene Fragen und Zweifel<textarea className="lb-text" rows={3} value={z.fragen || ''} onChange={(e) => setz('fragen', e.target.value)} placeholder="Ab wann bekannt? Schon eingepreist? Welche Saison steckt drin?" /></label>
        <label className="nw-feld">Datenquellen-Ideen<textarea className="lb-text" rows={2} value={z.quellen || ''} onChange={(e) => setz('quellen', e.target.value)} placeholder="z. B. NASA POWER Regen Kansas, FRED PWHEAMTUSDM, GPR-Index" /></label>
        <div className="lb-felder">
          <label className="nw-feld">Status<select value={z.status} onChange={(e) => setz('status', e.target.value as LZettel['status'])}>{STATUS.map((s) => <option key={s.wert} value={s.wert}>{s.text}</option>)}</select></label>
          <label className="nw-feld">Stichworte (mit Komma)<input value={tagText} onChange={(e) => { setTagText(e.target.value); setGespeichert(null); }} placeholder="erdgas, wetter, winter" /></label>
          <div className="nw-feld">Farbe
            <div className="lb-farben">{FARBEN.map((f) => <button key={f.wert} type="button" className="lb-farbe press" style={{ background: f.css }} aria-pressed={z.farbe === f.wert} aria-label={f.wert} onClick={() => setz('farbe', f.wert)} />)}</div>
          </div>
        </div>
        <div className="nw-feld">Wege zu mehr Fällen
          <div className="lb-chips">
            {fb.wege.map((w) => {
              const an = (z.wege || []).includes(w.id);
              return <button key={w.id} type="button" className="lb-wahl press" aria-pressed={an} title={w.text} onClick={() => setz('wege', an ? (z.wege || []).filter((x) => x !== w.id) : [...(z.wege || []), w.id])}>{w.name}</button>;
            })}
          </div>
        </div>
        {andere.length > 0 && (
          <div className="nw-feld">Verwandte Zettel
            <div className="lb-chips">
              {andere.slice(0, 60).map((x) => {
                const an = (z.links || []).includes(x.id);
                return <button key={x.id} type="button" className="lb-wahl press" aria-pressed={an} onClick={() => setz('links', an ? (z.links || []).filter((y) => y !== x.id) : [...(z.links || []), x.id])}>{x.titel}</button>;
              })}
            </div>
          </div>
        )}
        {fallen.length > 0 && <div className="lb-fallen"><strong>Fallen aus bisherigen Tests</strong><ul>{fallen.map((f) => <li key={f.text}>{f.text}</li>)}</ul></div>}
        {idee && <p style={{ fontSize: 13.5, margin: '10px 0 0' }}>Daraus wurde die Hypothese <button className="knopf-klein press" onClick={() => onIdeeOeffnen(idee.id)}>{idee.name}</button>{idee.ergebnis && <> <UrteilChip urteil={idee.ergebnis.urteil} /></>}</p>}
      </section>

      <section className="karte in">
        <h2 className="karte-titel">Leitfragen</h2>
        <ol className="lb-leitfragen">{fb.leitfragen.map((f) => <li key={f}>{f}</li>)}</ol>
      </section>

      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="knopf-akzent press" disabled={!z.titel?.trim()} onClick={speichern}>Speichern</button>
        <button className="knopf-klein press" disabled={!z.titel?.trim()} onClick={zurHypothese}>{idee ? 'Neue Hypothese daraus' : 'Zur Hypothese machen →'}</button>
        {z.id && <ExportKnoepfe zettel={[z.id]} />}
        {z.id && <button className="knopf-klein press" style={{ color: 'var(--fehler)' }} onClick={() => setFrage(true)}>Löschen …</button>}
        {gespeichert && <span className="leise" style={{ fontSize: 13 }}>{gespeichert}</span>}
      </div>
      {frage && z.id && (
        <Rueckfrage titel="Zettel löschen?" text="Verknüpfungen von anderen Zetteln werden mitentfernt. Eine daraus entstandene Hypothese bleibt." ja="Löschen" gefahr
          onJa={async () => { await senden('/api/labor/zettel', { id: z.id }, 'DELETE').catch(() => {}); onZurueck(); }} onNein={() => setFrage(false)} />
      )}
    </div>
  );
}

// Markdown einer Idee als Vorschau (aufklappbar)
export function MdVorschau({ ideeId }: { ideeId: string }) {
  const [md, setMd] = useState<string | null>(null);
  const [auf, setAuf] = useState(false);
  useEffect(() => { if (auf && md === null) exportHolen([ideeId], []).then((r) => setMd(r.md)).catch((e) => setMd(`Fehler: ${(e as Error).message}`)); }, [auf, md, ideeId]);
  return (
    <details className="lb-details" onToggle={(e) => setAuf((e.target as HTMLDetailsElement).open)}>
      <summary>Markdown-Vorschau (so bekommt der Skill die Idee)</summary>
      <div className="lb-mdvorschau" style={{ marginTop: 8 }}>{md ?? 'Lade …'}</div>
    </details>
  );
}
