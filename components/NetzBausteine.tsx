'use client';
// Gemeinsame Bausteine der Netz-Seiten: Pop-up, Glossar-Begriff, Daten laden.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { holen } from '@/lib/api';
import { GLOSSAR } from '@/lib/netzwissen';
import type { NetzwerkZustand } from '@/lib/netzwerk';
import { Icon } from './ui';

export function Popup({ titel, unter, onClose, children, breit }: { titel: string; unter?: string; onClose: () => void; children: ReactNode; breit?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose kommt fast überall als neue Inline-Funktion. Hinge der Effekt daran, würde er bei jeder Eingabe neu laufen,
  // den Fokus auf den Dialog zurückholen und damit Dropdowns und Zahlenfelder zuklappen. Darum über eine Ref lesen.
  const schliessen = useRef(onClose);
  schliessen.current = onClose;
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); schliessen.current(); } };
    window.addEventListener('keydown', taste);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', taste); document.body.style.overflow = ov; vorher?.focus?.(); };
  }, []);
  return (
    <div className="nw-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`nw-popup${breit ? ' breit' : ''}`} role="dialog" aria-modal="true" aria-label={titel} tabIndex={-1} ref={ref}>
        <div className="nw-popup-kopf">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3>{titel}</h3>
            {unter && <div className="leise" style={{ fontSize: 13 }}>{unter}</div>}
          </div>
          <button className="icon-knopf press" onClick={onClose} aria-label="Schliessen"><Icon name="x" size={18} /></button>
        </div>
        <div className="nw-popup-inhalt">{children}</div>
      </div>
    </div>
  );
}

// Begriff aus dem Glossar: gestrichelt unterstrichen, Klick öffnet das Erklär-Pop-up.
export function Begriff({ id, children }: { id: string; children?: ReactNode }) {
  const [offen, setOffen] = useState<string | null>(null);
  const b = GLOSSAR[id];
  if (!b) return <>{children}</>;
  return (
    <>
      <button type="button" className="nw-begriff" onClick={() => setOffen(id)} title={b.kurz}>{children ?? b.titel}</button>
      {offen && <BegriffPopup id={offen} onClose={() => setOffen(null)} onWechsel={setOffen} />}
    </>
  );
}

export function BegriffPopup({ id, onClose, onWechsel }: { id: string; onClose: () => void; onWechsel: (id: string) => void }) {
  const b = GLOSSAR[id];
  if (!b) return null;
  return (
    <Popup titel={b.titel} unter={b.kurz} onClose={onClose}>
      {b.text.map((t, i) => <p key={i} className="nw-text">{t}</p>)}
      {b.beiDir && <div className="nw-box nw-bei"><b>Bei dir</b><span>{b.beiDir}</span></div>}
      {b.merke && <div className="nw-box nw-merke"><b>Merke</b><span>{b.merke}</span></div>}
      {b.siehe && b.siehe.length > 0 && (
        <div className="nw-siehe">
          <span className="leise">Weiter:</span>
          {b.siehe.filter((s) => GLOSSAR[s]).map((s) => <button key={s} className="pille nw-chip" onClick={() => onWechsel(s)}>{GLOSSAR[s].titel}</button>)}
        </div>
      )}
    </Popup>
  );
}

// Lädt den Netzwerk-Zustand und aktualisiert ihn, solange die Seite sichtbar ist.
export function useNetzwerk(intervallMs = 10_000) {
  const [d, setD] = useState<NetzwerkZustand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(async () => {
    try { setD(await holen<NetzwerkZustand>('/api/netzwerk')); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    laden();
    const t = setInterval(() => { if (!document.hidden) laden(); }, intervallMs);
    return () => clearInterval(t);
  }, [laden, intervallMs]);
  return { d, fehler, neuLaden: laden, setD };
}

export function Ampel({ status, text }: { status: 'ja' | 'teil' | 'nein' | 'unbekannt'; text?: string }) {
  const f = status === 'ja' ? 'var(--fehler)' : status === 'teil' ? 'var(--warn)' : status === 'nein' ? 'var(--gruen)' : 'var(--muted)';
  return <span className="nw-ampel" style={{ background: f }} title={text} aria-hidden />;
}
