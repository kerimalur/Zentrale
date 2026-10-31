'use client';
// Backtest-Session: kleines Fenster, das über TradingView (auch im Vollbild) im Vordergrund bleibt (Chrome/Edge:
// Document Picture-in-Picture). Pro Trade ein Ablauf mit Pfeiltasten: Datum → Ergebnis (TP, SL, Break-Even, Teil-TP, Skip)
// → (Skip-Grund) → Confluences → Fehler → Notiz → Übersicht → Speichern. Kurse gibt man nicht ein: Das Risiko ist pro
// Session fest (in %), das Ergebnis ergibt sich aus dem Ausgang (SL = −1 R, TP = Ziel-R, Break-Even = 0 R, Teil-TP = halbes Ziel).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { senden } from '@/lib/api';
import { AUSGANG_TEXT, rText, rVon, type JTrade, type JournalZustand } from '@/lib/journal';
import { Popup } from './NetzBausteine';

type Ergebnis = 'tp' | 'sl' | 'be' | 'teiltp' | 'skip';
type Schritt = 'datum' | 'ergebnis' | 'grund' | 'conf' | 'fehler' | 'notiz' | 'ueber';
const ERGEBNISSE: { id: Ergebnis; text: string }[] = [
  { id: 'tp', text: 'TP' }, { id: 'sl', text: 'SL' }, { id: 'be', text: 'Break-Even' }, { id: 'teiltp', text: 'Teil-TP + BE' }, { id: 'skip', text: 'Skip' },
];
interface PipApi { requestWindow: (o: { width: number; height: number }) => Promise<Window> }

const heuteIso = () => new Date().toLocaleDateString('sv-SE');
function handelstag(iso: string, schritt: number) {
  const d = new Date(iso + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + schritt); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
const num = (s: string) => { const x = Number(String(s).replace(',', '.').trim()); return s.trim() === '' || !Number.isFinite(x) ? null : x; };
const prozentText = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2).replace('.', ',')} %`;
const isoZuText = (iso: string) => { const [j, m, t] = iso.slice(0, 10).split('-'); return `${t}.${m}.${j}`; };
// Tippt man nur Ziffern, setzt das Feld die Punkte selbst: 01032024 → 01.03.2024
function datumFormat(roh: string, vorwaerts: boolean) {
  const z = roh.replace(/\D/g, '').slice(0, 8);
  const teile = [z.slice(0, 2), z.slice(2, 4), z.slice(4, 8)].filter(Boolean).join('.');
  return teile + (vorwaerts && (z.length === 2 || z.length === 4) ? '.' : '');
}
function textZuIso(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
function ergebnisR(e: Ergebnis, tpR: number, teilR: number): number | null {
  return e === 'tp' ? tpR : e === 'sl' ? -1 : e === 'be' ? 0 : e === 'teiltp' ? teilR / 2 : null;
}
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
  const gespeichert = (k: string, std: string) => { try { return localStorage.getItem('zentrale-bt-' + k) || std; } catch { return std; } };
  const [risiko, setRisiko] = useState(() => gespeichert('risiko', '1'));
  const [tpR, setTpR] = useState(() => gespeichert('tpr', '2'));
  const [teilR, setTeilR] = useState(() => gespeichert('teilr', '1'));
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
    const alle = [...d.trades, ...trades.filter((t) => !d.trades.some((x) => x.id === t.id))];
    const zaehlen = (hol: (t: JTrade) => string[], max: number) => {
      const m = new Map<string, number>();
      for (const t of alle) for (const x of hol(t)) m.set(x, (m.get(x) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x).slice(0, max);
    };
    return { tags: zaehlen((t) => t.tags, 14), fehler: zaehlen((t) => t.fehler, 14), gruende: zaehlen((t) => (t.skipGrund ? [t.skipGrund] : []), 8) };
  }, [d.trades, trades]);
  const rp = num(risiko), tpRn = num(tpR), teilRn = num(teilR);
  const startOk = rp !== null && rp > 0 && rp <= 100 && tpRn !== null && tpRn > 0 && teilRn !== null && teilRn > 0;

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
    try { localStorage.setItem('zentrale-bt-pair', pair); localStorage.setItem('zentrale-bt-risiko', risiko); localStorage.setItem('zentrale-bt-tpr', tpR); localStorage.setItem('zentrale-bt-teilr', teilR); } catch {}
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
          <label className="nw-feld">Risiko pro Trade in %<input inputMode="decimal" value={risiko} onChange={(e) => setRisiko(e.target.value)} placeholder="z. B. 1" /></label>
          <label className="nw-feld">TP zählt als … R<input inputMode="decimal" value={tpR} onChange={(e) => setTpR(e.target.value)} placeholder="z. B. 2" /></label>
          <label className="nw-feld">Teil-TP: Hälfte raus bei … R<input inputMode="decimal" value={teilR} onChange={(e) => setTeilR(e.target.value)} placeholder="z. B. 1" /></label>
          <div className="nw-feld">Zeitrahmen der Linie
            <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {(['3D', 'W', 'M', ''] as const).map((x) => <button key={x || 'ohne'} aria-pressed={tf === x} onClick={() => setTf(x)}>{x || 'ohne'}</button>)}
            </div>
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '6px 0 10px' }}>
          <input type="checkbox" checked={teilen} onChange={(e) => setTeilen(e.target.checked)} /> TradingView-Fenster für Screenshots freigeben
        </label>
        <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 8 }}>
          SL = −1 R · Break-Even = 0 R · Teil-TP = halb so viel wie bei {teilRn ?? '…'} R, Rest Break-Even ({teilRn !== null ? String(teilRn / 2).replace('.', ',') : '…'} R). Kurse musst du nicht eintragen.
        </div>
        <div className="leise" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
          {pipMoeglich
            ? 'Nach dem Start öffnet sich ein kleines Fenster, das über allem bleibt. Danach fragt der Browser, welches Fenster er für Screenshots sehen darf: wähle TradingView.'
            : 'Dieser Browser kann kein Fenster im Vordergrund öffnen (nur Chrome/Edge am PC). Das Session-Fenster erscheint dann hier unten rechts.'}
        </div>
        <button className="knopf-klein press tr-primaer" onClick={starten} disabled={!startOk}>Session starten</button>
      </Popup>
    );
  }

  if (phase === 'fertig') {
    const gez = trades.filter((t) => t.ausgang !== 'skip');
    const rs = gez.map((t) => rVon(t).r).filter((r): r is number => r !== null);
    const summe = rs.reduce((x, y) => x + y, 0);
    const gew = rs.filter((r) => r > 0.1).length, ver = rs.filter((r) => r < -0.1).length;
    const prozent = rp !== null ? summe * rp : null;
    return (
      <Popup titel="Backtest-Session beendet" unter={`${pair} · ${gez.length} Trades${trades.length > gez.length ? ` · ${trades.length - gez.length} Skips` : ''}`} onClose={() => onClose(true)}>
        <div className="jr-kacheln">
          <div className="jr-kachel"><div className="jr-kachel-titel">Summe</div><div className={`jr-kachel-wert tr-zahl ${summe > 0 ? 'jr-plus' : summe < 0 ? 'jr-minus' : ''}`}>{rText(summe)}</div>{prozent !== null && <div className="leise tr-zahl" style={{ fontSize: 12 }}>{prozentText(prozent)}</div>}</div>
          <div className="jr-kachel"><div className="jr-kachel-titel">Trefferquote</div><div className="jr-kachel-wert tr-zahl">{gew + ver ? `${Math.round((gew / (gew + ver)) * 100)} %` : '—'}</div><div className="leise" style={{ fontSize: 12 }}>{gew} G · {ver} V</div></div>
          <div className="jr-kachel"><div className="jr-kachel-titel">Skips</div><div className="jr-kachel-wert tr-zahl">{trades.length - gez.length}</div></div>
        </div>
        <div style={{ marginTop: 10 }}>{trades.map((t) => <SessionZeile key={t.id} t={t} />)}</div>
        <button className="knopf-klein press tr-primaer" style={{ marginTop: 12 }} onClick={() => onClose(true)}>Fertig</button>
      </Popup>
    );
  }

  const panel = (
    <SessionPanel
      pair={pair} setPair={setPair} paare={d.paare} datum={datum} setDatum={setDatum} tf={tf} risiko={rp!} tpR={tpRn!} teilR={teilRn!} sessionId={sessionId}
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

function SessionZeile({ t }: { t: JTrade }) {
  const { r } = rVon(t);
  const ausgang = t.ausgang ? AUSGANG_TEXT[t.ausgang] : '';
  return (
    <div className="bt-zeile">
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{t.pair}</b> <span className="leise" style={{ fontSize: 11.5 }}>{datumKurz(t.eroeffnet)} · {ausgang}{t.skipGrund ? `: ${t.skipGrund}` : ''}{t.bilder?.length ? ` · ${t.bilder.length} 📷` : ''}</span>
      </span>
      {r !== null ? <b className={`tr-zahl ${r > 0 ? 'jr-plus' : r < 0 ? 'jr-minus' : ''}`} style={{ fontSize: 13 }}>{rText(r)}</b> : <span className="pille tr-pille-aus">Skip</span>}
    </div>
  );
}

const SCHRITT_TITEL: Record<Schritt, string> = { datum: 'Datum', ergebnis: 'Ergebnis', grund: 'Skip-Grund', conf: 'Confluences', fehler: 'Fehler', notiz: 'Notiz', ueber: 'Übersicht' };

function SessionPanel(p: {
  pair: string; setPair: (x: string) => void; paare: string[]; datum: string; setDatum: (x: string) => void; tf: string; risiko: number; tpR: number; teilR: number; sessionId: string;
  trades: JTrade[]; setTrades: (f: (x: JTrade[]) => JTrade[]) => void; vorschlaege: { tags: string[]; fehler: string[]; gruende: string[] };
  kannScreenshot: boolean; screenshot: () => Promise<string | null>; teilen: () => void;
  imOverlay: boolean; overlayOeffnen: (() => void) | null; beenden: () => void; hinweis: string | null;
}) {
  const [schritt, setSchritt] = useState<Schritt>('datum');
  const [datumText, setDatumText] = useState(() => isoZuText(p.datum));
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [grund, setGrund] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string[]>([]);
  const [neuTag, setNeuTag] = useState('');
  const [neuFehler, setNeuFehler] = useState('');
  const [notiz, setNotiz] = useState('');
  const [bilder, setBilder] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const wurzel = useRef<HTMLDivElement>(null);

  const reihenfolge: Schritt[] = ['datum', 'ergebnis', ...(ergebnis === 'skip' ? (['grund'] as const) : []), 'conf', 'fehler', 'notiz', 'ueber'];
  const nr = reihenfolge.indexOf(schritt);
  const iso = textZuIso(datumText);
  const r = ergebnis ? ergebnisR(ergebnis, p.tpR, p.teilR) : null;

  // Beim Schrittwechsel das passende Feld fokussieren, sonst das Panel selbst, damit die Pfeiltasten sofort gehen.
  useEffect(() => {
    const t = setTimeout(() => {
      const f = wurzel.current?.querySelector<HTMLElement>('[data-fokus]');
      if (f) {
        f.focus();
        if (f instanceof HTMLInputElement && f.type === 'text' && f.inputMode === 'numeric') f.select(); // Datum: Eintippen überschreibt
        else if (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) f.setSelectionRange(f.value.length, f.value.length); // Cursor ans Ende, dann gehen die Pfeile gleich
      } else wurzel.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [schritt]);

  const gehe = (delta: number, von: Schritt = schritt, liste: Schritt[] = reihenfolge) => {
    const i = liste.indexOf(von) + delta;
    if (i >= 0 && i < liste.length) setSchritt(liste[i]);
  };
  const kannWeiter = () => (schritt === 'datum' ? !!iso : schritt === 'ergebnis' ? ergebnis !== null : schritt !== 'ueber');
  const weiter = () => { if (!kannWeiter()) return; if (schritt === 'datum' && iso) p.setDatum(iso); gehe(1); };

  function datumTippen(roh: string) {
    const vorwaerts = roh.length > datumText.length;
    const neu = datumFormat(roh, vorwaerts);
    setDatumText(neu);
    const ok = textZuIso(neu);
    if (ok && vorwaerts) { p.setDatum(ok); setSchritt('ergebnis'); } // vollständig eingegeben → automatisch weiter
  }
  const handelstagVerschieben = (schrittTage: number) => {
    const basis = iso || p.datum;
    const neu = handelstag(basis, schrittTage);
    setDatumText(isoZuText(neu)); p.setDatum(neu);
  };
  function ergebnisWaehlen(e: Ergebnis) {
    setErgebnis(e);
    const liste: Schritt[] = ['datum', 'ergebnis', ...(e === 'skip' ? (['grund'] as const) : []), 'conf', 'fehler', 'notiz', 'ueber'];
    gehe(1, 'ergebnis', liste);
  }
  const umschalten = (liste: string[], set: (x: string[]) => void, x: string) => set(liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x]);
  function neuHinzu(wert: string, liste: string[], set: (x: string[]) => void, leeren: () => void) {
    const w = wert.trim().slice(0, 40);
    if (w && !liste.includes(w)) set([...liste, w]);
    leeren();
  }

  function taste(ev: React.KeyboardEvent<HTMLDivElement>) {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
    const text = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text');
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      // In Textfeldern wandert der Cursor, die Pfeile wechseln erst am Rand den Schritt.
      if (text && (el.selectionStart !== el.selectionEnd || el.selectionStart !== (ev.key === 'ArrowRight' ? el.value.length : 0))) return;
      ev.preventDefault();
      if (ev.key === 'ArrowRight') weiter(); else gehe(-1);
      return;
    }
    if (schritt === 'datum' && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); handelstagVerschieben(ev.key === 'ArrowUp' ? 1 : -1); return; }
    if (ev.key === 'Enter' && !ev.shiftKey) {
      if (schritt === 'ueber') { ev.preventDefault(); speichern(); return; }
      if (schritt === 'conf' && neuTag.trim()) { ev.preventDefault(); neuHinzu(neuTag, tags, setTags, () => setNeuTag('')); return; }
      if (schritt === 'fehler' && neuFehler.trim()) { ev.preventDefault(); neuHinzu(neuFehler, fehler, setFehler, () => setNeuFehler('')); return; }
      if (el.tagName === 'BUTTON' && (schritt === 'ergebnis' || schritt === 'conf' || schritt === 'fehler' || schritt === 'grund')) return; // Button löst sich selbst aus
      ev.preventDefault(); weiter(); return;
    }
    if (schritt === 'ergebnis' && !text && ev.key >= '1' && ev.key <= '5') { ev.preventDefault(); ergebnisWaehlen(ERGEBNISSE[Number(ev.key) - 1].id); }
  }

  async function foto() {
    setLaeuft('foto'); setInfo(null);
    try { const n = await p.screenshot(); if (n) setBilder((b) => [...b, n]); else setInfo('Kein Bild – Bildschirm freigeben.'); }
    catch (err) { setInfo((err as Error).message); }
    finally { setLaeuft(null); }
  }

  async function speichern() {
    if (!iso || !ergebnis) { setSchritt(!iso ? 'datum' : 'ergebnis'); return; }
    if (laeuft) return;
    setLaeuft('speichern'); setInfo(null);
    const tagsAlle = [...tags, ...(neuTag.trim() && !tags.includes(neuTag.trim()) ? [neuTag.trim()] : [])];
    const fehlerAlle = [...fehler, ...(neuFehler.trim() && !fehler.includes(neuFehler.trim()) ? [neuFehler.trim()] : [])];
    try {
      const neu = await senden<JTrade>('/api/journal/trade', {
        art: 'backtest', pair: p.pair, richtung: null, tf: p.tf || null, eroeffnet: iso, geschlossen: iso,
        entry: null, sl: null, tp: null, exit: null, lots: null, risikoEur: null, ergebnisEur: null,
        risikoProzent: p.risiko, rManuell: r, ausgang: ergebnis, skipGrund: ergebnis === 'skip' ? grund : '',
        gefuehl: null, tags: tagsAlle, fehler: fehlerAlle, notiz, bild: '', bilder, session: p.sessionId, gvaLevel: null,
      });
      p.setTrades((x) => [...x, neu]);
      setErgebnis(null); setGrund(''); setTags([]); setFehler([]); setNeuTag(''); setNeuFehler(''); setNotiz(''); setBilder([]);
      setInfo(`Gespeichert (${p.trades.length + 1} in dieser Session).`);
      setSchritt('datum');
    } catch (err) { setInfo((err as Error).message); }
    finally { setLaeuft(null); }
  }

  const chips = (liste: string[], gewaehlt: string[], set: (x: string[]) => void) => (
    <div className="bt-chips">{liste.map((x) => <button key={x} type="button" className="press" aria-pressed={gewaehlt.includes(x)} onClick={() => umschalten(gewaehlt, set, x)}>{x}</button>)}
      {gewaehlt.filter((x) => !liste.includes(x)).map((x) => <button key={x} type="button" className="press" aria-pressed onClick={() => umschalten(gewaehlt, set, x)}>{x}</button>)}</div>
  );
  const rText2 = r === null ? 'Skip' : `${rText(r)}${` · ${prozentText(r * p.risiko)}`}`;
  const zeile = (titel: string, wert: React.ReactNode, ziel: Schritt) => (
    <button type="button" className="bt-ueber-zeile press" onClick={() => setSchritt(ziel)}><span className="leise">{titel}</span><span>{wert}</span></button>
  );

  return (
    <div className="bt-panel" ref={wurzel} tabIndex={-1} onKeyDown={taste} style={{ outline: 'none' }}>
      <div className="bt-kopf">
        <select value={p.pair} onChange={(ev) => p.setPair(ev.target.value)} aria-label="Paar">{p.paare.map((x) => <option key={x}>{x}</option>)}</select>
        <span className="leise tr-zahl" style={{ fontSize: 12, flex: 1, textAlign: 'right' }}>{String(p.risiko).replace('.', ',')} % Risiko · TP {String(p.tpR).replace('.', ',')} R</span>
      </div>

      <div className="bt-schritte" aria-label="Fortschritt">
        {reihenfolge.map((s, i) => <button key={s} type="button" className={`bt-punkt${s === schritt ? ' an' : i < nr ? ' fertig' : ''}`} onClick={() => { if (i <= nr || (iso && ergebnis)) setSchritt(s); }} aria-label={SCHRITT_TITEL[s]} />)}
      </div>
      <div className="bt-titel" style={{ marginTop: 0 }}>{nr + 1}/{reihenfolge.length} · {SCHRITT_TITEL[schritt]}</div>

      {schritt === 'datum' && (
        <>
          <input data-fokus className="bt-gross" inputMode="numeric" type="text" value={datumText} onChange={(ev) => datumTippen(ev.target.value)} placeholder="TT.MM.JJJJ" aria-label="Datum im Replay" maxLength={10} />
          <div className="leise" style={{ fontSize: 12 }}>Tippe nur Ziffern (01032024). Ist das Datum komplett, geht es automatisch weiter. ↑ ↓ = nächster Handelstag.</div>
        </>
      )}

      {schritt === 'ergebnis' && (
        <div className="bt-optionen">
          {ERGEBNISSE.map((e, i) => (
            <button key={e.id} type="button" data-fokus={ergebnis === e.id || (ergebnis === null && i === 0) ? '' : undefined} className="press" aria-pressed={ergebnis === e.id} onClick={() => ergebnisWaehlen(e.id)}>
              <small>{i + 1}</small>{e.text}
              <span className="leise tr-zahl">{e.id === 'skip' ? 'nicht genommen' : rText(ergebnisR(e.id, p.tpR, p.teilR)!)}</span>
            </button>
          ))}
        </div>
      )}

      {schritt === 'grund' && (
        <>
          <input data-fokus className="bt-input" type="text" value={grund} onChange={(ev) => setGrund(ev.target.value)} placeholder="Warum geskippt? Enter = weiter" maxLength={300} />
          {!!p.vorschlaege.gruende.length && <div className="bt-chips">{p.vorschlaege.gruende.map((x) => <button key={x} type="button" className="press" aria-pressed={grund === x} onClick={() => { setGrund(x); gehe(1); }}>{x}</button>)}</div>}
        </>
      )}

      {schritt === 'conf' && (
        <>
          {chips(p.vorschlaege.tags, tags, setTags)}
          <input data-fokus className="bt-input" type="text" value={neuTag} onChange={(ev) => setNeuTag(ev.target.value)} placeholder="Neue Confluence + Enter · leer + Enter = weiter" />
        </>
      )}

      {schritt === 'fehler' && (
        <>
          {chips(p.vorschlaege.fehler, fehler, setFehler)}
          <input data-fokus className="bt-input" type="text" value={neuFehler} onChange={(ev) => setNeuFehler(ev.target.value)} placeholder="Neuer Fehler + Enter · leer + Enter = weiter" />
        </>
      )}

      {schritt === 'notiz' && (
        <>
          <textarea data-fokus className="bt-input" rows={4} value={notiz} onChange={(ev) => setNotiz(ev.target.value)} placeholder="Notiz (Enter = weiter, Shift+Enter = neue Zeile)" />
        </>
      )}

      {schritt === 'ueber' && (
        <div className="bt-ueber">
          {zeile('Paar', p.pair, 'datum')}
          {zeile('Datum', iso ? datumKurz(iso) : '—', 'datum')}
          {zeile('Ergebnis', ergebnis ? <b className={r !== null && r > 0 ? 'jr-plus' : r !== null && r < 0 ? 'jr-minus' : ''}>{AUSGANG_TEXT[ergebnis]} · {rText2}</b> : '—', 'ergebnis')}
          {ergebnis === 'skip' && zeile('Skip-Grund', grund || '—', 'grund')}
          {zeile('Confluences', [...tags, ...(neuTag.trim() ? [neuTag.trim()] : [])].join(', ') || '—', 'conf')}
          {zeile('Fehler', [...fehler, ...(neuFehler.trim() ? [neuFehler.trim()] : [])].join(', ') || '—', 'fehler')}
          {zeile('Notiz', notiz || '—', 'notiz')}
          <button data-fokus type="button" className="knopf-klein press tr-primaer" onClick={speichern} disabled={!!laeuft}>{laeuft === 'speichern' ? 'Speichere …' : '✓ Gut, fertig – speichern (Enter)'}</button>
        </div>
      )}

      <div className="bt-aktionen">
        <button type="button" className="knopf-klein press" onClick={() => gehe(-1)} disabled={nr === 0}>← Zurück</button>
        {p.kannScreenshot
          ? <button type="button" className="knopf-klein press" onClick={foto} disabled={!!laeuft}>{laeuft === 'foto' ? '…' : `📷${bilder.length ? ` (${bilder.length})` : ''}`}</button>
          : <button type="button" className="knopf-klein press" onClick={p.teilen}>Bildschirm teilen</button>}
        <button type="button" className="knopf-klein press" onClick={weiter} disabled={!kannWeiter()}>Weiter →</button>
      </div>
      {!!bilder.length && <div className="bt-bilder klein">{bilder.map((b) => <img key={b} src={`/api/journal/bild/${b}`} alt="Screenshot" />)}</div>}
      {(info || p.hinweis) && <div className="leise" style={{ fontSize: 12 }}>{info || p.hinweis}</div>}

      {!!p.trades.length && (
        <>
          <div className="bt-titel">Diese Session · {p.trades.length}</div>
          <div>{[...p.trades].reverse().slice(0, 8).map((tr) => <SessionZeile key={tr.id} t={tr} />)}</div>
        </>
      )}

      <div className="bt-fuss">
        {p.overlayOeffnen && <button type="button" className="knopf-klein press" onClick={p.overlayOeffnen}>Als Overlay öffnen</button>}
        {!frage ? <button type="button" className="knopf-klein press" onClick={() => setFrage(true)}>Session beenden</button>
          : <button type="button" className="knopf-klein press ht-gefahr" onClick={p.beenden}>Wirklich beenden</button>}
      </div>
    </div>
  );
}
