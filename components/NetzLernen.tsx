'use client';
// Reiter «Lernen»: Lektionen, Glossar, Geschichten aus dem eigenen Homelab, Selbsttest, Praxis.
import { useState } from 'react';
import { kopieren } from '@/lib/api';
import { FRAGEN, GESCHICHTEN, GLOSSAR, LEKTIONEN, NEUER_DIENST, type Geschichte, type Lektion } from '@/lib/netzwissen';
import { Begriff, BegriffPopup, Popup } from './NetzBausteine';

export function NetzLernen({ gehZu }: { gehZu: (reiter: 'heim' | 'ports') => void }) {
  const [lektion, setLektion] = useState<Lektion | null>(null);
  const [geschichte, setGeschichte] = useState<Geschichte | null>(null);
  const [begriff, setBegriff] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const gl = Object.entries(GLOSSAR).filter(([, b]) => !filter.trim() || (b.titel + ' ' + b.kurz).toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in" aria-label="Lektionen">
        <h2 className="karte-titel">Netzwerk verstehen <small>5 Lektionen · jeweils mit Übung an deinem Homelab</small></h2>
        <div className="nw-lektionen">
          {LEKTIONEN.map((l) => (
            <button key={l.id} className="press nw-lektion" onClick={() => setLektion(l)}>
              <span className="nw-nr">{l.nr}</span>
              <span style={{ textAlign: 'left', minWidth: 0 }}><b>{l.titel}</b><small>{l.frage}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="karte in" aria-label="Aus deinem Homelab">
        <h2 className="karte-titel">Aus deinem Homelab gelernt <small>vier echte Stolpersteine</small></h2>
        {GESCHICHTEN.map((g) => (
          <button key={g.id} className="zeile press nw-zeile" onClick={() => setGeschichte(g)}>
            <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}><b>{g.titel}</b><div className="leise" style={{ fontSize: 12.5 }}>{g.problem}</div></span>
          </button>
        ))}
      </section>

      <section className="karte in" aria-label="Glossar">
        <h2 className="karte-titel">Glossar <small>{Object.keys(GLOSSAR).length} Begriffe</small></h2>
        <input className="nw-suche" style={{ width: '100%', marginBottom: 10 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Begriff suchen" aria-label="Begriff suchen" />
        <div className="nw-glossar">
          {gl.map(([id, b]) => (
            <button key={id} className="press nw-gl" onClick={() => setBegriff(id)}>
              <b>{b.titel}</b><small>{b.kurz}</small>
            </button>
          ))}
          {gl.length === 0 && <div className="leise">Nichts gefunden.</div>}
        </div>
      </section>

      <Selbsttest />
      <Praxis />

      {lektion && (
        <Popup titel={`Lektion ${lektion.nr}: ${lektion.titel}`} unter={lektion.frage} onClose={() => setLektion(null)}>
          <p className="nw-text">{lektion.intro}</p>
          <h4 className="nw-h">Begriffe dazu</h4>
          <div className="nw-siehe">{lektion.begriffe.map((b) => <button key={b} className="pille nw-chip" onClick={() => setBegriff(b)}>{GLOSSAR[b]?.titel}</button>)}</div>
          <div className="nw-box nw-bei"><b>Probier es aus</b><span>{lektion.probier}</span></div>
          {lektion.ziel && lektion.ziel !== 'lernen' && <button className="knopf-akzent press" style={{ alignSelf: 'flex-start' }} onClick={() => { setLektion(null); gehZu(lektion.ziel as 'heim' | 'ports'); }}>Zum Reiter «{lektion.ziel === 'heim' ? 'Heimnetz' : 'Ports & Zugriff'}»</button>}
        </Popup>
      )}
      {geschichte && (
        <Popup titel={geschichte.titel} onClose={() => setGeschichte(null)}>
          <div className="nw-box nw-merke"><b>Problem</b><span>{geschichte.problem}</span></div>
          <h4 className="nw-h">Warum?</h4><p className="nw-text">{geschichte.ursache}</p>
          <h4 className="nw-h">Lösung</h4><p className="nw-text">{geschichte.loesung}</p>
          <div className="nw-box nw-bei"><b>Merke</b><span>{geschichte.lehre}</span></div>
          <div className="nw-siehe">{geschichte.begriffe.map((b) => <button key={b} className="pille nw-chip" onClick={() => setBegriff(b)}>{GLOSSAR[b]?.titel}</button>)}</div>
        </Popup>
      )}
      {begriff && <BegriffPopup id={begriff} onClose={() => setBegriff(null)} onWechsel={setBegriff} />}
    </div>
  );
}

function Selbsttest() {
  const [i, setI] = useState(0);
  const [antwort, setAntwort] = useState<number | null>(null);
  const [punkte, setPunkte] = useState(0);
  const fertig = i >= FRAGEN.length;
  const f = FRAGEN[i];
  function waehlen(n: number) {
    if (antwort !== null) return;
    setAntwort(n);
    if (n === f.richtig) setPunkte((p) => p + 1);
  }
  function weiter() { setI((x) => x + 1); setAntwort(null); }
  function neu() { setI(0); setAntwort(null); setPunkte(0); }
  return (
    <section className="karte in" aria-label="Selbsttest">
      <h2 className="karte-titel">Selbsttest <small>{fertig ? 'Fertig' : `Frage ${i + 1} von ${FRAGEN.length}`}</small></h2>
      {fertig ? (
        <>
          <p className="nw-text"><b>{punkte} von {FRAGEN.length}</b> richtig. {punkte === FRAGEN.length ? 'Sauber, alles verstanden.' : 'Lies bei den falschen den Begriff nochmals im Glossar nach.'}</p>
          <button className="knopf-klein press" onClick={neu}>Nochmals</button>
        </>
      ) : (
        <>
          <p className="nw-text" style={{ fontWeight: 600 }}>{f.frage}</p>
          <div className="nw-antworten">
            {f.antworten.map((a, n) => (
              <button key={n} className={`press nw-antwort${antwort !== null ? (n === f.richtig ? ' richtig' : n === antwort ? ' falsch' : '') : ''}`} onClick={() => waehlen(n)} disabled={antwort !== null}>{a}</button>
            ))}
          </div>
          {antwort !== null && (
            <div className={`nw-box ${antwort === f.richtig ? 'nw-bei' : 'nw-merke'}`} aria-live="polite"><b>{antwort === f.richtig ? 'Richtig' : 'Nicht ganz'}</b><span>{f.erklaerung}</span></div>
          )}
          {antwort !== null && <button className="knopf-klein press" style={{ marginTop: 10 }} onClick={weiter}>{i + 1 < FRAGEN.length ? 'Nächste Frage' : 'Ergebnis'}</button>}
        </>
      )}
    </section>
  );
}

function Praxis() {
  const [ok, setOk] = useState<number | null>(null);
  return (
    <section className="karte in" aria-label="Praxis">
      <h2 className="karte-titel">Praxis: eigenen Dienst freigeben <small>Port 9000 als Beispiel</small></h2>
      <p className="leise" style={{ fontSize: 13, marginTop: 0 }}>So kommt ein neuer Dienst ins Homelab, ohne dass er unnötig offen ist. Dahinter stecken <Begriff id="bind">Lauschen lokal</Begriff>, <Begriff id="proxy">Reverse Proxy</Begriff> und <Begriff id="acl">Zugriffsregel</Begriff>.</p>
      <ol className="nw-schritte">
        {NEUER_DIENST.map((s, i) => (
          <li key={i}>
            <b>{s.titel}</b>
            <p>{s.text}</p>
            {s.befehl && (
              <div className="nw-code">
                <code>{s.befehl}</code>
                <button className="knopf-klein press" onClick={async () => { await kopieren(s.befehl!); setOk(i); setTimeout(() => setOk(null), 1500); }}>{ok === i ? 'Kopiert ✓' : 'Kopieren'}</button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
