'use client';
// Backtest-Session: kleines Fenster, das über TradingView (auch im Vollbild) im Vordergrund bleibt (Chrome/Edge:
// Document Picture-in-Picture). Pro Setup: Long/Short, Entry, SL, TP, Ergebnis, Confluences, Fehler, Notiz und
// Screenshots (aus dem einmal freigegebenen TradingView-Fenster). Jeder Trade wird sofort als Backtest gespeichert.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { senden } from '@/lib/api';
import { rText, rVon, type JTrade, type JournalZustand } from '@/lib/journal';
import { Popup } from './NetzBausteine';

type Ergebnis = 'offen' | 'tp' | 'sl' | 'be' | 'r';
interface PipApi { requestWindow: (o: { width: number; height: number }) => Promise<Window> }

const heuteIso = () => new Date().toLocaleDateString('sv-SE');
function handelstag(iso: string, schritt: number) {
  const d = new Date(iso + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + schritt); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
const num = (s: string) => { const x = Number(String(s).replace(',', '.').trim()); return s.trim() === '' || !Number.isFinite(x) ? null : x; };
const datumKurz = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j.slice(2)}`; };
const pipWindow = (): PipApi | null => (typeof window !== 'undefined' && 'documentPictureInPicture' in window ? (window as unknown as { documentPictureInPicture: PipApi }).documentPictureInPicture : null);

function stileKopieren(w: Window) {
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
  w.document.title = 'Backtest-Session';
  w.document.body.className = 'bt-pip-body';
}

export function BacktestStart({ d, onClose }: { d: JournalZustand; onClose: (neu: boolean) => void }) {
  const [phase, setPhase] = useState<'start' | 'laeuft' | 'fertig'>('start');
  const [pair, setPair] = useState(() => { try { return localStorage.getItem('zentrale-bt-pair') || 'EURUSD'; } catch { return 'EURUSD'; } });
  const [datum, setDatum] = useState(heuteIso());
  const [tf, setTf] = useState<'3D' | 'W' | 'M' | ''>('3D');
  const [risiko, setRisiko] = useState('');
  const [teilen, setTeilen] = useState(true);
  const [pip, setPip] = useState<Window | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [trades, setTrades] = useState<JTrade[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionId = useMemo(() => `bt-${Date.now().toString(36)}`, []);
  const pipMoeglich = !!pipWindow();

  // Vorschläge für Confluences und Fehler aus dem bisherigen Journal (häufigste zuerst)
  const vorschlaege = useMemo(() => {
    const zaehlen = (feld: 'tags' | 'fehler') => {
      const m = new Map<string, number>();
      for (const t of d.trades) for (const x of t[feld]) m.set(x, (m.get(x) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x).slice(0, 14);
    };
    return { tags: zaehlen('tags'), fehler: zaehlen('fehler') };
  }, [d.trades]);

  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  // Versucht zuerst das Overlay-Fenster (dort kam der Klick her), sonst das Hauptfenster.
  async function bildschirmTeilen(w: Window | null = null) {
    try {
      const anfrage = (n: Navigator) => n.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      let s: MediaStream;
      try { s = await anfrage((w || window).navigator); } catch (err) { if (!w) throw err; s = await anfrage(window.navigator); }
      s.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null));
      setStream(s);
      setHinweis(null);
    } catch {
      setHinweis('Bildschirm nicht freigegeben – Screenshots sind aus. Du kannst es im Session-Fenster nochmals versuchen.');
    }
  }
  async function overlayOeffnen() {
    const api = pipWindow();
    if (!api) return;
    try {
      const w = await api.requestWindow({ width: 400, height: 680 });
      stileKopieren(w);
      w.addEventListener('pagehide', () => setPip(null));
      setPip(w);
    } catch { setHinweis('Overlay konnte nicht geöffnet werden – das Session-Fenster bleibt hier in der Zentrale.'); }
  }
  async function starten() {
    try { localStorage.setItem('zentrale-bt-pair', pair); } catch {}
    setPhase('laeuft');
    if (pipMoeglich) await overlayOeffnen(); // braucht den Klick als Auslöser → zuerst
    if (teilen) await bildschirmTeilen();
  }
  function beenden() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    pip?.close();
    setPip(null);
    setPhase('fertig');
  }

  async function screenshot(): Promise<string | null> {
    const v = videoRef.current;
    if (!stream || !v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return null;
    const res = await fetch('/api/journal/bild', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Zentrale': '1' }, body: blob, credentials: 'same-origin' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.fehler || 'Screenshot nicht gespeichert');
    return j.name as string;
  }

  if (phase === 'start') {
    return (
      <Popup titel="Backtest-Session starten" unter="Das Session-Fenster bleibt über TradingView im Vordergrund" onClose={() => onClose(false)}>
        <div className="jr-felder">
          <label className="nw-feld">Paar<select value={pair} onChange={(e) => setPair(e.target.value)}>{d.paare.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="nw-feld">Startdatum im Replay<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
          <label className="nw-feld">Risiko pro Trade in EUR (optional)<input inputMode="decimal" value={risiko} onChange={(e) => setRisiko(e.target.value)} placeholder="z. B. 100" /></label>
          <div className="nw-feld">Zeitrahmen der Linie
            <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {(['3D', 'W', 'M', ''] as const).map((x) => <button key={x || 'ohne'} aria-pressed={tf === x} onClick={() => setTf(x)}>{x || 'ohne'}</button>)}
            </div>
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '6px 0 10px' }}>
          <input type="checkbox" checked={teilen} onChange={(e) => setTeilen(e.target.checked)} /> TradingView-Fenster für Screenshots freigeben
        </label>
        <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          {pipMoeglich
            ? 'Nach dem Start öffnet sich ein kleines Fenster, das über allem bleibt. Danach fragt der Browser, welches Fenster er für Screenshots sehen darf: wähle TradingView.'
            : 'Dieser Browser kann kein Fenster im Vordergrund öffnen (nur Chrome/Edge am PC). Das Session-Fenster erscheint dann hier unten rechts.'}
        </div>
        <button className="knopf-klein press tr-primaer" onClick={starten}>Session starten</button>
      </Popup>
    );
  }

  if (phase === 'fertig') {
    const geschl = trades.map((t) => rVon(t).r).filter((r): r is number => r !== null);
    const summe = geschl.reduce((a, b) => a + b, 0);
    const gew = geschl.filter((r) => r > 0.1).length, ver = geschl.filter((r) => r < -0.1).length;
    return (
      <Popup titel="Backtest-Session beendet" unter={`${pair} · ${trades.length} Trades eingetragen`} onClose={() => onClose(true)}>
        <div className="jr-kacheln">
          <div className="jr-kachel"><div className="jr-kachel-titel">Summe</div><div className={`jr-kachel-wert tr-zahl ${summe > 0 ? 'jr-plus' : summe < 0 ? 'jr-minus' : ''}`}>{rText(summe)}</div></div>
          <div className="jr-kachel"><div className="jr-kachel-titel">Trefferquote</div><div className="jr-kachel-wert tr-zahl">{gew + ver ? `${Math.round((gew / (gew + ver)) * 100)} %` : '—'}</div><div className="leise" style={{ fontSize: 12 }}>{gew} G · {ver} V</div></div>
          <div className="jr-kachel"><div className="jr-kachel-titel">Noch offen</div><div className="jr-kachel-wert tr-zahl">{trades.length - geschl.length}</div></div>
        </div>
        <div style={{ marginTop: 10 }}>{trades.map((t) => <SessionZeile key={t.id} t={t} />)}</div>
        <button className="knopf-klein press tr-primaer" style={{ marginTop: 12 }} onClick={() => onClose(true)}>Fertig</button>
      </Popup>
    );
  }

  const panel = (
    <SessionPanel
      pair={pair} setPair={setPair} paare={d.paare} datum={datum} setDatum={setDatum} tf={tf} risiko={num(risiko)} sessionId={sessionId}
      trades={trades} setTrades={setTrades} vorschlaege={vorschlaege}
      kannScreenshot={!!stream} screenshot={screenshot} teilen={() => bildschirmTeilen(pip)}
      imOverlay={!!pip} overlayOeffnen={pipMoeglich && !pip ? overlayOeffnen : null} beenden={beenden} hinweis={hinweis}
    />
  );
  return (
    <>
      <video ref={videoRef} muted playsInline autoPlay className="bt-video" aria-hidden />
      {pip ? createPortal(panel, pip.document.body) : <div className="bt-schwebend">{panel}</div>}
      {pip && <div className="bt-schwebend bt-hinweis-karte"><b>Backtest-Session läuft</b><span className="leise" style={{ fontSize: 12.5 }}>{pair} · {trades.length} Trades · im Overlay-Fenster</span><button className="knopf-klein press" onClick={beenden}>Beenden</button></div>}
    </>
  );
}

function SessionZeile({ t, onSchliessen }: { t: JTrade; onSchliessen?: (art: 'tp' | 'sl' | 'be') => void }) {
  const { r } = rVon(t);
  return (
    <div className="bt-zeile">
      <span className={`jr-richtung ${t.richtung}`}>{t.richtung === 'long' ? '▲' : '▼'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{t.pair}</b> <span className="leise" style={{ fontSize: 11.5 }}>{datumKurz(t.eroeffnet)}{t.bilder?.length ? ` · ${t.bilder.length} 📷` : ''}</span>
      </span>
      {r !== null ? <b className={`tr-zahl ${r > 0 ? 'jr-plus' : r < 0 ? 'jr-minus' : ''}`} style={{ fontSize: 13 }}>{rText(r)}</b>
        : onSchliessen ? <span style={{ display: 'flex', gap: 4 }}>{(['tp', 'sl', 'be'] as const).map((a) => <button key={a} className="knopf-klein press bt-mini" disabled={a === 'tp' && t.tp === null} onClick={() => onSchliessen(a)}>{a.toUpperCase()}</button>)}</span>
          : <span className="pille tr-pille-aus">offen</span>}
    </div>
  );
}

function SessionPanel(p: {
  pair: string; setPair: (x: string) => void; paare: string[]; datum: string; setDatum: (x: string) => void; tf: string; risiko: number | null; sessionId: string;
  trades: JTrade[]; setTrades: (f: (x: JTrade[]) => JTrade[]) => void; vorschlaege: { tags: string[]; fehler: string[] };
  kannScreenshot: boolean; screenshot: () => Promise<string | null>; teilen: () => void;
  imOverlay: boolean; overlayOeffnen: (() => void) | null; beenden: () => void; hinweis: string | null;
}) {
  const [richtung, setRichtung] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [ergebnis, setErgebnis] = useState<Ergebnis>('offen');
  const [rWert, setRWert] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string[]>([]);
  const [neuTag, setNeuTag] = useState('');
  const [neuFehler, setNeuFehler] = useState('');
  const [notiz, setNotiz] = useState('');
  const [bilder, setBilder] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);

  const e = num(entry), s = num(sl), t = num(tp);
  const rr = e !== null && s !== null && t !== null && e !== s ? (t - e) / (e - s) : null;
  const umschalten = (liste: string[], set: (x: string[]) => void, x: string) => set(liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x]);

  async function foto() {
    setLaeuft('foto'); setInfo(null);
    try { const n = await p.screenshot(); if (n) setBilder((b) => [...b, n]); else setInfo('Kein Bild – Bildschirm freigeben.'); }
    catch (err) { setInfo((err as Error).message); }
    finally { setLaeuft(null); }
  }

  function felder(exitArt: Ergebnis) {
    const exit = exitArt === 'tp' ? t : exitArt === 'sl' ? s : exitArt === 'be' ? e : null;
    return { exit, rManuell: exitArt === 'r' ? num(rWert) : null, geschlossen: exitArt === 'offen' ? null : p.datum };
  }
  async function speichern() {
    setLaeuft('speichern'); setInfo(null);
    try {
      const neu = await senden<JTrade>('/api/journal/trade', {
        art: 'backtest', pair: p.pair, richtung, tf: p.tf || null, eroeffnet: p.datum, entry: e, sl: s, tp: t, lots: null,
        risikoEur: p.risiko, ergebnisEur: null, ...felder(ergebnis), gefuehl: null, tags: [...tags, ...(neuTag.trim() ? [neuTag.trim()] : [])],
        fehler: [...fehler, ...(neuFehler.trim() ? [neuFehler.trim()] : [])], notiz, bild: '', bilder, session: p.sessionId, gvaLevel: null,
      });
      p.setTrades((x) => [...x, neu]);
      setEntry(''); setSl(''); setTp(''); setErgebnis('offen'); setRWert(''); setTags([]); setFehler([]); setNeuTag(''); setNeuFehler(''); setNotiz(''); setBilder([]);
      setInfo(`Gespeichert (${p.trades.length + 1} in dieser Session).`);
    } catch (err) { setInfo((err as Error).message); }
    finally { setLaeuft(null); }
  }
  async function schliessen(tr: JTrade, art: 'tp' | 'sl' | 'be') {
    const exit = art === 'tp' ? tr.tp : art === 'sl' ? tr.sl : tr.entry;
    try {
      const neu = await senden<JTrade>('/api/journal/trade', { ...tr, exit, geschlossen: p.datum });
      p.setTrades((x) => x.map((y) => (y.id === tr.id ? neu : y)));
    } catch (err) { setInfo((err as Error).message); }
  }

  const chips = (liste: string[], gewaehlt: string[], set: (x: string[]) => void) => (
    <div className="bt-chips">{liste.map((x) => <button key={x} className="press" aria-pressed={gewaehlt.includes(x)} onClick={() => umschalten(gewaehlt, set, x)}>{x}</button>)}</div>
  );

  return (
    <div className="bt-panel">
      <div className="bt-kopf">
        <select value={p.pair} onChange={(ev) => p.setPair(ev.target.value)} aria-label="Paar">{p.paare.map((x) => <option key={x}>{x}</option>)}</select>
        <div className="bt-datum">
          <button className="press" onClick={() => p.setDatum(handelstag(p.datum, -1))} aria-label="Handelstag zurück">‹</button>
          <input type="date" value={p.datum} onChange={(ev) => p.setDatum(ev.target.value)} aria-label="Datum im Replay" />
          <button className="press" onClick={() => p.setDatum(handelstag(p.datum, 1))} aria-label="Nächster Handelstag">›</button>
        </div>
      </div>

      <div className="segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button aria-pressed={richtung === 'long'} onClick={() => setRichtung('long')}>▲ Long</button>
        <button aria-pressed={richtung === 'short'} onClick={() => setRichtung('short')}>▼ Short</button>
      </div>
      <div className="bt-preise">
        <label>Entry<input inputMode="decimal" value={entry} onChange={(ev) => setEntry(ev.target.value)} /></label>
        <label>SL<input inputMode="decimal" value={sl} onChange={(ev) => setSl(ev.target.value)} /></label>
        <label>TP<input inputMode="decimal" value={tp} onChange={(ev) => setTp(ev.target.value)} /></label>
      </div>
      <div className="leise tr-zahl" style={{ fontSize: 12 }}>RR {rr !== null ? `1:${rr.toFixed(1).replace('.', ',')}` : '—'}</div>

      <div className="bt-titel">Ergebnis</div>
      <div className="segment" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {(['offen', 'tp', 'sl', 'be', 'r'] as const).map((x) => <button key={x} aria-pressed={ergebnis === x} onClick={() => setErgebnis(x)}>{x === 'offen' ? 'später' : x === 'r' ? 'R' : x.toUpperCase()}</button>)}
      </div>
      {ergebnis === 'r' && <label className="bt-feld">R (z. B. 2.5 oder -0.5)<input inputMode="decimal" value={rWert} onChange={(ev) => setRWert(ev.target.value)} /></label>}

      <div className="bt-titel">Confluences</div>
      {chips(p.vorschlaege.tags, tags, setTags)}
      <input className="bt-input" value={neuTag} onChange={(ev) => setNeuTag(ev.target.value)} placeholder="neue Confluence …" />
      <div className="bt-titel">Fehler</div>
      {chips(p.vorschlaege.fehler, fehler, setFehler)}
      <input className="bt-input" value={neuFehler} onChange={(ev) => setNeuFehler(ev.target.value)} placeholder="neuer Fehler …" />
      <textarea className="bt-input" rows={2} value={notiz} onChange={(ev) => setNotiz(ev.target.value)} placeholder="Warum dieser Trade? Notiz …" />

      <div className="bt-aktionen">
        {p.kannScreenshot
          ? <button className="knopf-klein press" onClick={foto} disabled={!!laeuft}>{laeuft === 'foto' ? '…' : `📷 Screenshot${bilder.length ? ` (${bilder.length})` : ''}`}</button>
          : <button className="knopf-klein press" onClick={p.teilen}>Bildschirm teilen</button>}
        <button className="knopf-klein press tr-primaer" onClick={speichern} disabled={!!laeuft}>{laeuft === 'speichern' ? 'Speichere …' : 'Speichern'}</button>
      </div>
      {!!bilder.length && <div className="bt-bilder klein">{bilder.map((b) => <img key={b} src={`/api/journal/bild/${b}`} alt="Screenshot" />)}</div>}
      {(info || p.hinweis) && <div className="leise" style={{ fontSize: 12 }}>{info || p.hinweis}</div>}

      {!!p.trades.length && (
        <>
          <div className="bt-titel">Diese Session · {p.trades.length}</div>
          <div>{[...p.trades].reverse().map((tr) => <SessionZeile key={tr.id} t={tr} onSchliessen={(a) => schliessen(tr, a)} />)}</div>
        </>
      )}

      <div className="bt-fuss">
        {p.overlayOeffnen && <button className="knopf-klein press" onClick={p.overlayOeffnen}>Als Overlay öffnen</button>}
        {!frage ? <button className="knopf-klein press" onClick={() => setFrage(true)}>Session beenden</button>
          : <button className="knopf-klein press ht-gefahr" onClick={p.beenden}>Wirklich beenden</button>}
      </div>
    </div>
  );
}
