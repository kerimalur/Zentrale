'use client';
import { useState } from 'react';
import type { Zustand, SyncZeile } from '@/lib/types';
import { bytes, relativ } from '@/lib/format';
import { Icon } from './ui';
import { Explorer } from './Explorer';

const FARBEN = ['#7e3fd6', '#2457f5', '#0e7490', '#be185d', '#15803d', '#c2410c', '#8fb0fb', '#1e2a4a'];
const SYNC_FARBE: Record<SyncZeile['art'], [string, string]> = {
  ok: ['#16a34a', '#15803d'],
  warnung: ['#d97706', '#b45309'],
  fehler: ['#dc2626', '#b42318'],
  aus: ['#b8bfce', '#5b6478'],
  info: ['#2457f5', '#2457f5'],
};

export function Speicher({ z }: { z: Zustand }) {
  const [offen, setOffen] = useState<string | null>(null);
  const kats = z.speicher.kategorien;
  const total = kats.reduce((a, k) => a + k.bytes, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {offen && <Explorer laufwerke={z.laufwerke} start={offen} schliessen={() => setOffen(null)} />}
      <div className="drei">
        {z.laufwerke.map((l, i) => {
          const p = l.gross ? (l.benutzt / l.gross) * 100 : 0;
          const zustand = l.typ === 'hdd' ? (l.schlaeft ? 'schläft' : 'wach') : 'aktiv';
          const voll = p >= 90;
          return (
            <button key={l.mount} className="press karte lw lw-knopf in" style={{ animationDelay: `${80 + i * 60}ms` }} onClick={() => setOffen(l.mount)} aria-label={`${l.name}: Inhalt ansehen`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{l.name}</h2>
                <span className="pille" style={l.schlaeft ? { background: '#f0f2f7', color: 'var(--muted)' } : voll ? { background: '#fdecea', color: '#b42318' } : { background: '#e7f6ec', color: '#15803d' }}>{voll ? 'fast voll' : zustand}</span>
              </div>
              <div className="leise" style={{ fontSize: 13 }}>{[l.modell, l.port, l.mount].filter(Boolean).join(' · ')}</div>
              <div className="balken" style={{ height: 12, borderRadius: 6 }}><span className="gx" style={{ width: `${Math.max(1, p)}%`, background: voll ? '#dc2626' : 'var(--accent)' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{bytes(l.benutzt)} / {bytes(l.gross)}</span>
                <span className="leise">{bytes(l.frei)} frei</span>
              </div>
              <span className="lw-oeffnen"><Icon name="ordner" size={15} stroke={2.2} /> Inhalt ansehen <Icon name="weiter" size={14} stroke={2.4} /></span>
            </button>
          );
        })}
      </div>

      <div className="speicher-unten">
        <section className="karte in" style={{ animationDelay: '200ms', display: 'flex', flexDirection: 'column', gap: 18 }} aria-label="Speicherverbrauch">
          <h2 className="karte-titel">Wofür der Speicher gebraucht wird <small>{bytes(total)} gezählt</small></h2>
          {kats.length === 0 ? (
            <p className="leise" style={{ fontSize: 13, margin: 0 }}>Wird berechnet … (läuft alle 30 Minuten im Hintergrund)</p>
          ) : (
            <>
              <div className="stapel" role="img" aria-label={kats.map((k) => `${k.name} ${bytes(k.bytes)}`).join(', ')}>
                {kats.map((k, i) => <span key={k.name} className="gx" style={{ animationDelay: `${200 + i * 60}ms`, width: `${Math.max(1, (k.bytes / total) * 100)}%`, background: FARBEN[i % FARBEN.length] }} />)}
              </div>
              <div className="legende-gitter">
                {kats.map((k, i) => (
                  <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: FARBEN[i % FARBEN.length], flex: 'none' }} />
                    <span style={{ flex: 1 }}>{k.name}</span>
                    <span style={{ fontWeight: 600 }}>{bytes(k.bytes)}</span>
                  </div>
                ))}
              </div>
              <span className="leise" style={{ fontSize: 12 }}>Stand: {relativ(z.speicher.zeit)}</span>
            </>
          )}
        </section>

        <section className="karte in" style={{ animationDelay: '260ms', display: 'flex', flexDirection: 'column' }} aria-label="Synchronisation und Backup">
          <h2 className="karte-titel">Synchronisation & Backup <small>Backup steuern: Einstellungen</small></h2>
          {z.sync.map((y, i) => (
            <div key={y.titel + i} className="zeile">
              <span className={y.art === 'info' ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: SYNC_FARBE[y.art][0] }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{y.titel}</span>
                <span style={{ display: 'block', fontSize: 12, color: SYNC_FARBE[y.art][1] }}>{y.unter}</span>
              </span>
              <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{y.wann || (y.t ? relativ(y.t) : '')}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
