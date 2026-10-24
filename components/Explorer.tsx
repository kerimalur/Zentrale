'use client';
// Datei-Explorer für ein Laufwerk (nur anschauen). Öffnet sich als Fenster über dem Speicher-Tab.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Laufwerk, ExplorerOrdner, ExplorerEintrag } from '@/lib/types';
import { holen } from '@/lib/api';
import { bytes, relativ } from '@/lib/format';
import { Icon, type IconName } from './ui';

type Groessen = { groessen: Record<string, number>; gesamt: number | null; zeit: number };

const TYP_ICON: Record<ExplorerEintrag['typ'], IconName> = { ordner: 'ordner', datei: 'datei', link: 'verknuepfung', anders: 'datei' };

function endung(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : '';
}
const FARBE_ENDUNG: Record<string, string> = {
  mkv: '#7e3fd6', mp4: '#7e3fd6', avi: '#7e3fd6', mp3: '#be185d', flac: '#be185d', m4a: '#be185d',
  jpg: '#0e7490', jpeg: '#0e7490', png: '#0e7490', heic: '#0e7490', pdf: '#c2410c', srt: '#15803d',
};

export function Explorer({ laufwerke, start, schliessen }: { laufwerke: Laufwerk[]; start: string; schliessen: () => void }) {
  const [wurzel, setWurzel] = useState(start);
  const [pfad, setPfad] = useState('/');
  const [ordner, setOrdner] = useState<ExplorerOrdner | null>(null);
  const [groessen, setGroessen] = useState<Groessen | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [groessenLaden, setGroessenLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zu = useRef<HTMLButtonElement>(null);
  const lw = laufwerke.find((l) => l.mount === wurzel);

  // Escape schliesst, Seite dahinter scrollt nicht.
  useEffect(() => {
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    zu.current?.focus();
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    window.addEventListener('keydown', taste);
    return () => { document.body.style.overflow = vorher; window.removeEventListener('keydown', taste); };
  }, [schliessen]);

  useEffect(() => {
    const ctrl = new AbortController();
    const q = `wurzel=${encodeURIComponent(wurzel)}&pfad=${encodeURIComponent(pfad)}`;
    setLaedt(true);
    setFehler(null);
    setGroessen(null);
    holen<ExplorerOrdner>(`/api/explorer?${q}`, ctrl.signal)
      .then((o) => {
        setOrdner(o);
        setLaedt(false);
        if (!o.eintraege.some((e) => e.typ === 'ordner' && !e.anderes)) return null;
        setGroessenLaden(true);
        return holen<Groessen>(`/api/explorer/groessen?${q}`, ctrl.signal).then(setGroessen);
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setFehler((e as Error).message); setLaedt(false); } })
      .finally(() => { if (!ctrl.signal.aborted) setGroessenLaden(false); });
    return () => ctrl.abort();
  }, [wurzel, pfad]);

  const teile = pfad.split('/').filter(Boolean);
  const geh = (p: string) => setPfad(p || '/');
  const wechsle = (mount: string) => { setWurzel(mount); setPfad('/'); };

  const liste = useMemo(() => {
    if (!ordner) return [];
    const g = groessen?.groessen || {};
    const mitGroesse = ordner.eintraege.map((e) => ({ ...e, bytes: e.typ === 'ordner' ? (e.anderes ? null : g[e.name] ?? null) : e.groesse }));
    if (groessen) mitGroesse.sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));
    return mitGroesse;
  }, [ordner, groessen]);
  const max = Math.max(1, ...liste.map((e) => e.bytes ?? 0));
  const summe = groessen?.gesamt ?? (liste.every((e) => e.typ !== 'ordner') ? liste.reduce((a, e) => a + (e.bytes ?? 0), 0) : null);

  return (
    <div className="explorer-hinter" onMouseDown={(e) => { if (e.target === e.currentTarget) schliessen(); }}>
      <section className="explorer pop" role="dialog" aria-modal="true" aria-labelledby="explorer-titel">
        <header className="explorer-kopf">
          <span className="explorer-ico"><Icon name="laufwerk" size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="explorer-titel" style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{lw?.name || wurzel}</h2>
            <div className="leise" style={{ fontSize: 12 }}>{wurzel}{lw ? ` · ${bytes(lw.benutzt)} von ${bytes(lw.gross)} belegt` : ''} · nur anschauen</div>
          </div>
          <button ref={zu} className="press icon-knopf" onClick={schliessen} aria-label="Explorer schliessen"><Icon name="x" size={20} /></button>
        </header>

        <nav className="explorer-pfad" aria-label="Pfad">
          <button className="press" onClick={() => geh('/')} disabled={pfad === '/'}>
            <Icon name="laufwerk" size={14} stroke={2.2} /> {lw?.name || wurzel}
          </button>
          {teile.map((t, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <Icon name="weiter" size={14} stroke={2.2} className="leise" />
              <button className="press" onClick={() => geh('/' + teile.slice(0, i + 1).join('/'))} disabled={i === teile.length - 1}>{t}</button>
            </span>
          ))}
        </nav>

        <div className="explorer-info leise">
          {pfad !== '/' && (
            <button className="press explorer-zurueck" onClick={() => geh('/' + teile.slice(0, -1).join('/'))}>
              <Icon name="zurueck" size={14} stroke={2.4} /> Zurück
            </button>
          )}
          <span style={{ flex: 1 }}>
            {ordner ? `${ordner.anzahl} ${ordner.anzahl === 1 ? 'Eintrag' : 'Einträge'}${ordner.gekuerzt ? ` (die ersten ${ordner.eintraege.length} angezeigt)` : ''}` : ''}
            {summe !== null ? ` · ${bytes(summe)}` : ''}
          </span>
          {groessenLaden && <span className="explorer-rechnet"><span className="dreh" /> Grössen werden berechnet …</span>}
        </div>

        <div className="explorer-liste" aria-busy={laedt}>
          {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
          {laedt && !fehler && (
            <div className="explorer-leer"><span className="dreh" style={{ width: 22, height: 22 }} /></div>
          )}
          {!laedt && !fehler && liste.length === 0 && <div className="explorer-leer leise">Dieser Ordner ist leer.</div>}
          {!laedt && !fehler && liste.map((e, i) => {
            const navigierbar = e.typ === 'ordner' && !e.anderes;
            const wechselbar = e.typ === 'ordner' && !!e.anderesMount;
            const farbe = e.typ === 'ordner' ? 'var(--accent)' : FARBE_ENDUNG[endung(e.name)] || 'var(--muted)';
            const inhalt = (
              <>
                <span className="explorer-typ" style={{ color: farbe, background: e.typ === 'ordner' ? '#e8eefe' : 'var(--bg)' }}>
                  <Icon name={TYP_ICON[e.typ]} size={16} stroke={2} />
                </span>
                <span className="explorer-name">
                  <span className="explorer-titel" title={e.name}>{e.name}</span>
                  <span className="explorer-unter">
                    {e.anderes ? (
                      <span className="pille" style={{ background: '#efe9fd', color: '#6d3fd6' }}>liegt auf {e.anderes}{wechselbar ? ' →' : ''}</span>
                    ) : (
                      <>
                        {e.typ === 'link' ? 'Verknüpfung · ' : ''}
                        {relativ(e.geaendert)}
                      </>
                    )}
                  </span>
                </span>
                <span className="explorer-groesse">
                  <span>{e.bytes !== null ? bytes(e.bytes) : e.typ === 'ordner' && !e.anderes && groessenLaden ? '…' : ''}</span>
                  {e.bytes !== null && (
                    <span className="balken" style={{ height: 4, width: 72 }} aria-hidden>
                      <span className="gx" style={{ width: `${Math.max(2, (e.bytes / max) * 100)}%`, background: farbe }} />
                    </span>
                  )}
                </span>
                {navigierbar && <Icon name="weiter" size={16} stroke={2.2} className="leise" />}
              </>
            );
            const stil = { animationDelay: `${Math.min(i, 20) * 18}ms` };
            if (navigierbar) return <button key={e.name} className="press explorer-zeile slide" style={stil} onClick={() => geh(`${pfad.replace(/\/$/, '')}/${e.name}`)}>{inhalt}</button>;
            if (wechselbar) return <button key={e.name} className="press explorer-zeile slide" style={stil} onClick={() => wechsle(e.anderesMount!)}>{inhalt}</button>;
            return <div key={e.name} className="explorer-zeile slide" style={stil}>{inhalt}</div>;
          })}
        </div>
      </section>
    </div>
  );
}
