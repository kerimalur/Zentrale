'use client';

// TV-Tab: Oberfläche für den Fernseher (Xiaomi TV Box), bedient nur mit Pfeiltasten, OK und Zurück.
// Läuft im Vollbild-WebView der Android-TV-App (android-tv/), geht aber auch im normalen Browser.
// Gezeichnet wird auf 1920 x 1080 und auf die echte Bildschirmgrösse skaliert.
import { useCallback, useEffect, useRef, useState } from 'react';
import './tv.css';

// ---------- Typen ----------
type Karte = {
  id: string; art: string; titel: string; untertitel: string | null; jahr: number | null; dauerMin: number | null; restMin: number | null;
  fortschritt: number; sprache: string | null; qualitaet: string | null; genres: string[]; bewertung: number | null; beschreibung: string;
  bild: string | null; breit: string | null;
};
type Start = {
  zeit: number;
  kalender: { verbunden: boolean; termine: { titel: string; zeit: string | null; ganztaegig: boolean }[]; aufgaben: number };
  garmin: { schlafS: number | null; schlafScore: number | null; bodyBattery: number | null; schritte: number | null; schritteZiel: number | null } | null;
  homelab: { ok: boolean; probleme: number; szene: string | null; moebelTemp: number | null; piTemp: number | null; updates: number | null; tailscale: boolean } | null;
  wetter: { temp: number; code: number | null } | null;
  filme: { weiter: Karte | null; neu: Karte[]; fehler?: string };
};
type Filme = { weiter: Karte[]; neu: Karte[]; filme: Karte[]; serien: Karte[] };
type Sonos = {
  gefunden: boolean; raeume: { id: string; name: string; aktiv: boolean }[]; raum?: string; zustand?: string | null;
  lied?: { titel: string; kuenstler: string; album: string; position: number; dauer: number } | null;
  cover?: string | null; lautstaerke?: number | null; stumm?: boolean; warteschlange?: { titel: string; kuenstler: string }[];
};
type Szenen = { aktiv: string | null; liste: { id: string; name: string }[] };
type Bildschirm = 'laden' | 'koppeln' | 'start' | 'filme' | 'musik' | 'steuerung' | 'apps';
type AppEintrag = { name: string; pkg: string };

declare global {
  interface Window {
    AndroidTV?: { startApp: (pkg: string) => boolean; apps: () => string; home: () => void };
    tvZurueck?: () => boolean;
  }
}

const FESTE_APPS: AppEintrag[] = [
  { name: 'Jellyfin', pkg: 'org.jellyfin.androidtv' },
  { name: 'Spotify', pkg: 'com.spotify.tv.android' },
  { name: 'YouTube', pkg: 'com.google.android.youtube.tv' },
];

class NichtGekoppelt extends Error {}

async function api<T>(pfad: string, daten?: unknown): Promise<T> {
  const res = await fetch(pfad, {
    method: daten === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Zentrale': '1' },
    body: daten === undefined ? undefined : JSON.stringify(daten),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401) throw new NichtGekoppelt();
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { fehler?: string }).fehler || `Fehler ${res.status}`);
  return j as T;
}

function appStarten(pkg: string): boolean {
  try {
    return !!window.AndroidTV?.startApp(pkg);
  } catch {
    return false;
  }
}

const zeitFmt = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
const datumFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' });
const stdMin = (s: number | null | undefined) => (s || s === 0 ? `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}` : '–');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Navigation mit Pfeiltasten ----------
type Richtung = 'links' | 'rechts' | 'oben' | 'unten';
function naechster(r: Richtung, von: HTMLElement, alle: HTMLElement[]): HTMLElement | null {
  const a = von.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestWert = Infinity;
  for (const el of alle) {
    if (el === von) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    let vor: number, quer: number;
    if (r === 'rechts') { if (dx <= 4) continue; vor = dx; quer = Math.abs(dy); }
    else if (r === 'links') { if (dx >= -4) continue; vor = -dx; quer = Math.abs(dy); }
    else if (r === 'unten') { if (dy <= 4) continue; vor = dy; quer = Math.abs(dx); }
    else { if (dy >= -4) continue; vor = -dy; quer = Math.abs(dx); }
    const wert = vor + quer * 2.5;
    if (wert < bestWert) { bestWert = wert; best = el; }
  }
  return best;
}

export default function TvSeite() {
  const [schirm, setSchirm] = useState<Bildschirm>('laden');
  const [jetzt, setJetzt] = useState(() => new Date());
  const [skala, setSkala] = useState(1);
  const [start, setStart] = useState<Start | null>(null);
  const [filme, setFilme] = useState<Filme | null>(null);
  const [detail, setDetail] = useState<Karte | null>(null);
  const [sonos, setSonos] = useState<Sonos | null>(null);
  const [favoriten, setFavoriten] = useState<{ index: number; titel: string }[]>([]);
  const [szenen, setSzenen] = useState<Szenen | null>(null);
  const [apps, setApps] = useState<AppEintrag[]>(FESTE_APPS);
  const [bruecke, setBruecke] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [code, setCode] = useState<{ id: string; code: string; bis: number } | null>(null);
  const wurzel = useRef<HTMLDivElement>(null);
  const letzterFokus = useRef<string | null>(null);
  const schirmRef = useRef(schirm);
  const detailRef = useRef(detail);
  schirmRef.current = schirm;
  detailRef.current = detail;

  const nichtGekoppelt = useCallback(() => { setSchirm('koppeln'); setCode(null); }, []);
  const zeigeMeldung = useCallback((t: string) => {
    setMeldung(t);
    window.setTimeout(() => setMeldung((m) => (m === t ? null : m)), 3500);
  }, []);
  const sicher = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      const r = await fn();
      setFehler(null);
      return r;
    } catch (e) {
      if (e instanceof NichtGekoppelt) nichtGekoppelt();
      else setFehler((e as Error).message);
      return null;
    }
  }, [nichtGekoppelt]);

  // ---------- Skalieren und Uhr ----------
  useEffect(() => {
    setBruecke(!!window.AndroidTV);
    const auf = () => setSkala(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    auf();
    window.addEventListener('resize', auf);
    const t = window.setInterval(() => setJetzt(new Date()), 15_000);
    return () => { window.removeEventListener('resize', auf); window.clearInterval(t); };
  }, []);

  // ---------- Zurück ----------
  const zurueck = useCallback((): boolean => {
    if (detailRef.current) { setDetail(null); return true; }
    if (schirmRef.current !== 'start' && schirmRef.current !== 'koppeln' && schirmRef.current !== 'laden') { setSchirm('start'); return true; }
    return false;
  }, []);
  useEffect(() => {
    window.tvZurueck = zurueck;
    return () => { delete window.tvZurueck; };
  }, [zurueck]);

  // Ist die Detailansicht offen, gilt nur sie (der Rest liegt darunter).
  const fokusListe = useCallback((): HTMLElement[] => {
    const w = wurzel.current;
    if (!w) return [];
    const bereich = w.querySelector<HTMLElement>('.tv-detail') || w;
    return Array.from(bereich.querySelectorAll<HTMLElement>('[data-fok]'));
  }, []);

  // ---------- Tasten ----------
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const karte: Record<string, Richtung> = { ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'oben', ArrowDown: 'unten' };
      const r = karte[e.key];
      if (r) {
        e.preventDefault();
        const alle = fokusListe();
        if (!alle.length) return;
        const aktiv = document.activeElement as HTMLElement | null;
        const von = aktiv && alle.includes(aktiv) ? aktiv : null;
        if (!von) { alle[0].focus(); return; }
        const ziel = naechster(r, von, alle);
        if (ziel) ziel.focus();
        return;
      }
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        zurueck();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zurueck, fokusListe]);

  // Nach jedem Wechsel: gemerkten oder ersten Knopf wählen.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const alle = fokusListe();
      if (!alle.length) return;
      const gemerkt = letzterFokus.current ? alle.find((x) => x.dataset.fok === letzterFokus.current) : null;
      const aktiv = document.activeElement as HTMLElement | null;
      if (aktiv && alle.includes(aktiv)) return;
      (gemerkt || alle[0]).focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [schirm, detail, start, filme, sonos, szenen, apps, code, fokusListe]);

  const merken = (k: string) => { letzterFokus.current = k; };

  // ---------- Start: gekoppelt? ----------
  const startLaden = useCallback(async () => {
    const s = await sicher(() => api<Start>('/api/tv/start'));
    if (s) { setStart(s); setSchirm((alt) => (alt === 'laden' || alt === 'koppeln' ? 'start' : alt)); }
  }, [sicher]);

  useEffect(() => { void startLaden(); }, [startLaden]);
  useEffect(() => {
    if (schirm !== 'start') return;
    const t = window.setInterval(() => void startLaden(), 60_000);
    return () => window.clearInterval(t);
  }, [schirm, startLaden]);

  // ---------- Koppeln ----------
  useEffect(() => {
    if (schirm !== 'koppeln') return;
    let aktiv = true;
    let timer = 0;
    const neu = async () => {
      try {
        const r = await fetch('/api/tv/koppeln/start', { method: 'POST', headers: { 'X-Zentrale': '1', 'Content-Type': 'application/json' }, credentials: 'same-origin' });
        const j = (await r.json()) as { id?: string; code?: string; gueltigS?: number; fehler?: string };
        if (!aktiv) return;
        if (!r.ok || !j.id || !j.code) throw new Error(j.fehler || 'Kein Code erhalten');
        setCode({ id: j.id, code: j.code, bis: Date.now() + (j.gueltigS || 600) * 1000 });
        setFehler(null);
        frage(j.id);
      } catch (e) {
        if (!aktiv) return;
        setFehler(`${(e as Error).message} – neuer Versuch …`);
        timer = window.setTimeout(neu, 5000);
      }
    };
    const frage = (id: string) => {
      timer = window.setTimeout(async () => {
        if (!aktiv) return;
        try {
          const r = await fetch(`/api/tv/koppeln/status?id=${id}`, { credentials: 'same-origin', cache: 'no-store' });
          const j = (await r.json()) as { gekoppelt?: boolean; abgelaufen?: boolean };
          if (!aktiv) return;
          if (j.gekoppelt) { setCode(null); void startLaden(); return; }
          if (j.abgelaufen) { void neu(); return; }
        } catch {}
        frage(id);
      }, 2000);
    };
    void neu();
    return () => { aktiv = false; window.clearTimeout(timer); };
  }, [schirm, startLaden]);

  // ---------- Daten pro Bildschirm ----------
  useEffect(() => {
    if (schirm === 'filme') void sicher(() => api<Filme>('/api/tv/filme')).then((f) => f && setFilme(f));
    if (schirm === 'steuerung') void sicher(() => api<Szenen>('/api/tv/szenen')).then((s) => s && setSzenen(s));
    if (schirm === 'apps') {
      try {
        const roh = window.AndroidTV?.apps();
        if (roh) {
          const liste = JSON.parse(roh) as AppEintrag[];
          const bekannt = new Set(FESTE_APPS.map((a) => a.pkg));
          setApps([...FESTE_APPS, ...liste.filter((a) => !bekannt.has(a.pkg)).sort((a, b) => a.name.localeCompare(b.name, 'de'))]);
        }
      } catch {}
    }
  }, [schirm, sicher]);

  const sonosLaden = useCallback(async () => {
    const s = await sicher(() => api<Sonos>('/api/tv/sonos/status'));
    if (s) setSonos(s);
  }, [sicher]);
  useEffect(() => {
    if (schirm !== 'musik') return;
    void sonosLaden();
    void sicher(() => api<{ index: number; titel: string }[]>('/api/tv/sonos/favoriten')).then((f) => f && setFavoriten(f));
    const t = window.setInterval(() => void sonosLaden(), 4000);
    return () => window.clearInterval(t);
  }, [schirm, sonosLaden, sicher]);

  const sonosTun = async (pfad: string, daten: unknown, text?: string) => {
    const r = await sicher(() => api(pfad, daten));
    if (r && text) zeigeMeldung(text);
    void sonosLaden();
  };

  const szeneWaehlen = async (id: string, name: string) => {
    const r = await sicher(() => api('/api/tv/szene', { id }));
    if (r) { zeigeMeldung(`Szene «${name}» ist aktiv`); setSzenen((s) => (s ? { ...s, aktiv: id } : s)); }
  };

  const jellyfinOeffnen = () => {
    if (!appStarten('org.jellyfin.androidtv')) zeigeMeldung('Jellyfin lässt sich hier nicht öffnen (nur in der TV-App)');
  };

  // ---------- Bausteine ----------
  const poster = (k: Karte, breit = false) => (
    <button
      key={`${k.id}`}
      data-fok={`k-${k.id}`}
      className={`tv-karte ${breit ? 'breit' : ''}`}
      onFocus={() => merken(`k-${k.id}`)}
      onClick={() => { merken(`k-${k.id}`); setDetail(k); }}
      style={k.bild ? undefined : { background: 'linear-gradient(135deg,#27405E,#14202F)' }}
    >
      {k.bild && <img src={k.bild} alt="" loading="lazy" />}
      <span className="tv-karte-name">{k.titel}</span>
      {k.fortschritt > 0 && <span className="tv-balken"><span style={{ width: `${k.fortschritt}%` }} /></span>}
    </button>
  );

  const reihe = (titel: string, liste: Karte[] | undefined) =>
    liste && liste.length ? (
      <section className="tv-reihe">
        <h2>{titel}</h2>
        <div className="tv-band">{liste.map((k) => poster(k))}</div>
      </section>
    ) : null;

  const kachel = (ziel: Bildschirm, name: string, pfad: string) => (
    <button key={ziel} data-fok={`t-${ziel}`} className="tv-kachel" onFocus={() => merken(`t-${ziel}`)} onClick={() => { merken(`t-${ziel}`); setSchirm(ziel); }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={pfad} /></svg>
      {name}
    </button>
  );

  // ---------- Bildschirme ----------
  const kopf = (titel: string) => (
    <div className="tv-kopf">
      <h1>{titel}</h1>
      <div className="tv-uhr-klein">{zeitFmt.format(jetzt)}</div>
    </div>
  );

  const hinweis = (t: string) => <div className="tv-fuss">{t}</div>;

  let inhalt: React.ReactNode = null;

  if (schirm === 'laden') {
    inhalt = <div className="tv-mitte"><div className="tv-gross">Zentrale</div><div className="tv-klein">{fehler || 'Verbinde …'}</div></div>;
  }

  if (schirm === 'koppeln') {
    inhalt = (
      <div className="tv-mitte">
        <div className="tv-klein">Dieser Fernseher ist noch nicht gekoppelt</div>
        <div className="tv-code">{code ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : '– – –  – – –'}</div>
        <ol className="tv-schritte">
          <li>Zentrale am Handy oder PC öffnen und anmelden</li>
          <li>Einstellungen → «Fernseher koppeln»</li>
          <li>Diesen Code eingeben und bestätigen</li>
        </ol>
        <div className="tv-klein">{fehler || 'Der Code gilt 10 Minuten und erneuert sich selbst.'}</div>
      </div>
    );
  }

  if (schirm === 'start') {
    const h = start?.homelab;
    const g = start?.garmin;
    const w = start?.filme.weiter;
    inhalt = (
      <>
        <div className="tv-oben">
          <div className="tv-zeit">
            <span className="tv-uhr">{zeitFmt.format(jetzt)}</span>
            <span className="tv-datum">{datumFmt.format(jetzt)}</span>
          </div>
          <div className="tv-chips">
            {h && <span className={`tv-chip ${h.ok ? 'ok' : 'warn'}`}><i />{h.ok ? 'Homelab okay' : `${h.probleme} Dienst${h.probleme === 1 ? '' : 'e'} gestört`}</span>}
            {h && <span className="tv-chip">{h.tailscale ? 'Tailscale verbunden' : 'Tailscale aus'}</span>}
            {start?.wetter && <span className="tv-chip hell">{start.wetter.temp}° Wetter</span>}
          </div>
        </div>
        <div className="tv-spalten">
          <div className="tv-links">
            <div className="tv-held" style={w?.breit ? { backgroundImage: `linear-gradient(90deg,rgba(11,14,20,.92),rgba(11,14,20,.35)),url(${w.breit})` } : undefined}>
              {w ? (
                <>
                  <div className="tv-label">WEITERSCHAUEN</div>
                  <div className="tv-held-titel">{w.titel}</div>
                  <div className="tv-held-info">{[w.untertitel, w.restMin ? `Noch ${w.restMin} Min` : null, w.sprache, w.qualitaet].filter(Boolean).join(' · ')}</div>
                  <div className="tv-held-zeile">
                    <button data-fok="h-fort" className="tv-knopf primaer" onFocus={() => merken('h-fort')} onClick={jellyfinOeffnen}>Fortsetzen</button>
                    <button data-fok="h-details" className="tv-knopf" onFocus={() => merken('h-details')} onClick={() => { merken('h-details'); setDetail(w); }}>Details</button>
                    <span className="tv-balken lang"><span style={{ width: `${w.fortschritt}%` }} /></span>
                  </div>
                </>
              ) : (
                <>
                  <div className="tv-label">FILME UND SERIEN</div>
                  <div className="tv-held-titel">{start?.filme.fehler ? 'Jellyfin nicht erreichbar' : 'Nichts angefangen'}</div>
                  <div className="tv-held-info">{start?.filme.fehler || 'Sobald du etwas anschaust, geht es hier weiter.'}</div>
                  <div className="tv-held-zeile"><button data-fok="h-film" className="tv-knopf primaer" onFocus={() => merken('h-film')} onClick={() => setSchirm('filme')}>Zu den Filmen</button></div>
                </>
              )}
            </div>
            {start && start.filme.neu.length > 0 && (
              <section className="tv-reihe">
                <h2>Neu auf dem Pi</h2>
                <div className="tv-band klein">{start.filme.neu.map((k) => poster(k, true))}</div>
              </section>
            )}
            <div className="tv-kacheln">
              {kachel('filme', 'Filme', 'M4 5h16v14H4z M10 9l5 3-5 3z')}
              {kachel('musik', 'Musik', 'M9 18V6l10-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z')}
              {kachel('steuerung', 'Steuerung', 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z')}
              {kachel('apps', 'Apps', 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z')}
            </div>
          </div>
          <div className="tv-rechts">
            <div className="tv-glas">
              <div className="tv-glas-titel">Heute</div>
              {start?.kalender.verbunden ? (
                <>
                  {start.kalender.termine.length === 0 && <div className="tv-zeile-text mut">Keine Termine</div>}
                  {start.kalender.termine.map((t, i) => (
                    <div key={i} className="tv-zeile-text"><b>{t.ganztaegig ? 'Ganztag' : t.zeit}</b><span>{t.titel}</span></div>
                  ))}
                  <div className="tv-glas-titel">{start.kalender.aufgaben} Aufgabe{start.kalender.aufgaben === 1 ? '' : 'n'} offen</div>
                </>
              ) : <div className="tv-zeile-text mut">Google nicht verbunden</div>}
            </div>
            <div className="tv-glas">
              <div className="tv-glas-titel">Garmin</div>
              {g ? (
                <div className="tv-zahlen">
                  <span><big>{stdMin(g.schlafS)}</big>Schlaf</span>
                  <span><big>{g.bodyBattery ?? '–'}</big>Body Battery</span>
                </div>
              ) : <div className="tv-zeile-text mut">Keine Daten</div>}
            </div>
            <div className="tv-glas">
              <div className="tv-glas-titel">Homelab{h?.szene ? ` · ${h.szene}` : ''}</div>
              {h ? (
                <div className="tv-zahlen">
                  <span><big>{h.moebelTemp !== null ? `${Math.round(h.moebelTemp)} °C` : h.piTemp !== null ? `${Math.round(h.piTemp)} °C` : '–'}</big>{h.moebelTemp !== null ? 'Möbel' : 'Pi'}</span>
                  <span><big>{h.updates ?? '–'}</big>Updates</span>
                </div>
              ) : <div className="tv-zeile-text mut">Keine Daten</div>}
            </div>
          </div>
        </div>
        {hinweis('Pfeiltasten: wählen    OK: öffnen    Zurück: eine Ebene hoch')}
      </>
    );
  }

  if (schirm === 'filme') {
    inhalt = (
      <>
        {kopf('Filme und Serien')}
        <div className="tv-scroll">
          {!filme && <div className="tv-klein">{fehler || 'Lade …'}</div>}
          {filme && !filme.weiter.length && !filme.neu.length && !filme.filme.length && !filme.serien.length && <div className="tv-klein">Jellyfin hat noch nichts in der Bibliothek.</div>}
          {reihe('Weiterschauen', filme?.weiter)}
          {reihe('Neu hinzugefügt', filme?.neu)}
          {reihe('Filme', filme?.filme)}
          {reihe('Serien', filme?.serien)}
        </div>
        {hinweis('OK: Details    Zurück: Start')}
      </>
    );
  }

  if (schirm === 'musik') {
    const l = sonos?.lied;
    const spielt = sonos?.zustand === 'playing';
    inhalt = (
      <>
        {kopf('Musik')}
        {!sonos && <div className="tv-klein">{fehler || 'Suche Sonos …'}</div>}
        {sonos && !sonos.gefunden && (
          <div className="tv-mitte">
            <div className="tv-klein">Keine Sonos-Box im Netz gefunden. Läuft die Zentrale im Heimnetz und ist die Box an?</div>
            <button data-fok="m-neu" className="tv-knopf primaer" onClick={() => void sonosLaden()}>Erneut suchen</button>
          </div>
        )}
        {sonos?.gefunden && (
          <div className="tv-musik">
            <div className="tv-spieler">
              <div className="tv-cover" style={sonos.cover ? { backgroundImage: `url(${sonos.cover})` } : undefined}>{!sonos.cover && '♪'}</div>
              <div className="tv-lied">
                <div className="tv-label">{sonos.raum} · {spielt ? 'spielt' : sonos.zustand === 'paused' ? 'Pause' : 'gestoppt'}</div>
                <div className="tv-held-titel">{l?.titel || 'Nichts läuft'}</div>
                <div className="tv-held-info">{l ? [l.kuenstler, l.album].filter(Boolean).join(' · ') : 'Wähle rechts einen Favoriten'}</div>
                {l && l.dauer > 0 && (
                  <div className="tv-fortschritt"><span>{mmss(l.position)}</span><span className="tv-balken lang"><span style={{ width: `${Math.min(100, (l.position / l.dauer) * 100)}%` }} /></span><span>{mmss(l.dauer)}</span></div>
                )}
                <div className="tv-held-zeile">
                  <button data-fok="m-zurueck" className="tv-knopf" onFocus={() => merken('m-zurueck')} onClick={() => void sonosTun('/api/tv/sonos/aktion', { aktion: 'zurueck' })}>⏮</button>
                  <button data-fok="m-spiel" className="tv-knopf primaer" onFocus={() => merken('m-spiel')} onClick={() => void sonosTun('/api/tv/sonos/aktion', { aktion: 'umschalten' })}>{spielt ? 'Pause' : 'Spielen'}</button>
                  <button data-fok="m-weiter" className="tv-knopf" onFocus={() => merken('m-weiter')} onClick={() => void sonosTun('/api/tv/sonos/aktion', { aktion: 'weiter' })}>⏭</button>
                  <button data-fok="m-leiser" className="tv-knopf" onFocus={() => merken('m-leiser')} onClick={() => void sonosTun('/api/tv/sonos/lauter', { delta: -5 })}>Leiser</button>
                  <button data-fok="m-lauter" className="tv-knopf" onFocus={() => merken('m-lauter')} onClick={() => void sonosTun('/api/tv/sonos/lauter', { delta: 5 })}>Lauter</button>
                  <button data-fok="m-stumm" className="tv-knopf" onFocus={() => merken('m-stumm')} onClick={() => void sonosTun('/api/tv/sonos/aktion', { aktion: 'stumm' })}>{sonos.stumm ? 'Ton an' : 'Stumm'}</button>
                </div>
                <div className="tv-fortschritt"><span>Lautstärke</span><span className="tv-balken lang"><span style={{ width: `${sonos.lautstaerke ?? 0}%` }} /></span><span>{sonos.lautstaerke ?? '–'}</span></div>
              </div>
            </div>
            <div className="tv-seite">
              <div className="tv-glas">
                <div className="tv-glas-titel">Raum</div>
                <div className="tv-liste">
                  {sonos.raeume.map((r) => (
                    <button key={r.id} data-fok={`r-${r.id}`} className={`tv-eintrag ${r.aktiv ? 'aktiv' : ''}`} onFocus={() => merken(`r-${r.id}`)} onClick={() => void sonosTun('/api/tv/sonos/raum', { id: r.id }, `Raum: ${r.name}`)}>{r.name}</button>
                  ))}
                </div>
              </div>
              <div className="tv-glas">
                <div className="tv-glas-titel">Sonos-Favoriten</div>
                <div className="tv-liste">
                  {favoriten.length === 0 && <div className="tv-zeile-text mut">Keine Favoriten – in der Sonos-App Playlists als Favorit speichern</div>}
                  {favoriten.slice(0, 6).map((f) => (
                    <button key={f.index} data-fok={`f-${f.index}`} className="tv-eintrag" onFocus={() => merken(`f-${f.index}`)} onClick={() => void sonosTun('/api/tv/sonos/favorit', { index: f.index }, `Spielt: ${f.titel}`)}>{f.titel}</button>
                  ))}
                </div>
              </div>
              {(sonos.warteschlange?.length || 0) > 0 && (
                <div className="tv-glas">
                  <div className="tv-glas-titel">Als Nächstes</div>
                  {sonos.warteschlange!.slice(0, 4).map((q, i) => (<div key={i} className="tv-zeile-text mut"><span>{q.titel}</span></div>))}
                </div>
              )}
            </div>
          </div>
        )}
        {hinweis('OK: auswählen    Zurück: Start')}
      </>
    );
  }

  if (schirm === 'steuerung') {
    inhalt = (
      <>
        {kopf('Steuerung')}
        <div className="tv-scroll">
          <section className="tv-reihe">
            <h2>Szene</h2>
            {!szenen && <div className="tv-klein">{fehler || 'Lade …'}</div>}
            <div className="tv-grid">
              {szenen?.liste.map((s) => (
                <button key={s.id} data-fok={`s-${s.id}`} className={`tv-gross-knopf ${szenen.aktiv === s.id ? 'aktiv' : ''}`} onFocus={() => merken(`s-${s.id}`)} onClick={() => void szeneWaehlen(s.id, s.name)}>
                  {s.name}
                  {szenen.aktiv === s.id && <small>aktiv</small>}
                </button>
              ))}
            </div>
          </section>
        </div>
        {hinweis('OK: Szene setzen    Zurück: Start')}
      </>
    );
  }

  if (schirm === 'apps') {
    inhalt = (
      <>
        {kopf('Apps')}
        <div className="tv-scroll">
          {!bruecke && <div className="tv-klein">Apps lassen sich nur in der TV-App starten.</div>}
          <div className="tv-grid apps">
            {apps.map((a) => (
              <button key={a.pkg} data-fok={`a-${a.pkg}`} className="tv-gross-knopf" onFocus={() => merken(`a-${a.pkg}`)} onClick={() => { if (!appStarten(a.pkg)) zeigeMeldung(`${a.name} lässt sich nicht öffnen`); }}>{a.name}</button>
            ))}
          </div>
        </div>
        {hinweis('OK: App starten    Zurück: Start')}
      </>
    );
  }

  return (
    <div className="tv-huelle">
      <div ref={wurzel} className="tv" style={{ transform: `translate(-50%,-50%) scale(${skala})` }}>
        <div className="tv-inhalt">{inhalt}</div>
        {meldung && <div className="tv-meldung" role="status">{meldung}</div>}
        {fehler && schirm !== 'laden' && schirm !== 'koppeln' && <div className="tv-fehler" role="alert">{fehler}</div>}
        {detail && (
          <div className="tv-detail">
            <div className="tv-detail-karte" style={detail.breit ? { backgroundImage: `linear-gradient(90deg,rgba(11,14,20,.96) 35%,rgba(11,14,20,.55)),url(${detail.breit})` } : undefined}>
              <div className="tv-detail-text">
                <div className="tv-label">{detail.art === 'Series' ? 'SERIE' : detail.art === 'Episode' ? 'FOLGE' : 'FILM'}</div>
                <div className="tv-held-titel">{detail.titel}</div>
                <div className="tv-held-info">{[detail.untertitel, detail.jahr, detail.dauerMin ? `${detail.dauerMin} Min` : null, detail.sprache, detail.qualitaet, detail.bewertung ? `★ ${detail.bewertung}` : null].filter(Boolean).join(' · ')}</div>
                {detail.genres.length > 0 && <div className="tv-held-info">{detail.genres.join(' · ')}</div>}
                <p className="tv-beschreibung">{detail.beschreibung || 'Keine Beschreibung.'}</p>
                <div className="tv-held-zeile">
                  <button data-fok="d-spiel" className="tv-knopf primaer" onClick={jellyfinOeffnen}>{detail.fortschritt > 0 ? 'Fortsetzen' : 'Abspielen'}</button>
                  <button data-fok="d-zu" className="tv-knopf" onClick={() => setDetail(null)}>Schliessen</button>
                </div>
                <div className="tv-klein">Abspielen öffnet die Jellyfin-App.</div>
              </div>
              {detail.bild && <img className="tv-detail-bild" src={detail.bild} alt="" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
