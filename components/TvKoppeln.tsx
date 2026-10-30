'use client';
// Einstellungen → Fernseher koppeln: Code vom Fernseher eingeben, gekoppelte Boxen sehen und entfernen.
import { useCallback, useEffect, useState } from 'react';
import { holen, senden } from '@/lib/api';
import { relativ } from '@/lib/format';

interface TvGeraet { id: string; name: string; seit: number; zuletzt: number | null }

export function TvKoppelnKarte() {
  const [liste, setListe] = useState<TvGeraet[] | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('Wohnzimmer');
  const [info, setInfo] = useState<{ text: string; fehler: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    try {
      setListe((await holen<{ geraete: TvGeraet[] }>('/api/tv/geraete')).geraete);
    } catch (e) {
      setInfo({ text: (e as Error).message, fehler: true });
    }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function koppeln() {
    setLaeuft(true);
    setInfo(null);
    try {
      await senden('/api/tv/koppeln/bestaetigen', { code, name });
      setCode('');
      setInfo({ text: 'Gekoppelt – der Fernseher öffnet gleich die Startseite.', fehler: false });
      await laden();
    } catch (e) {
      setInfo({ text: (e as Error).message, fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  async function entfernen(g: TvGeraet) {
    if (!window.confirm(`«${g.name}» entfernen? Der Fernseher zeigt danach wieder einen Koppel-Code.`)) return;
    try {
      await senden('/api/tv/geraet/entfernen', { id: g.id });
      await laden();
    } catch (e) {
      setInfo({ text: (e as Error).message, fehler: true });
    }
  }

  return (
    <section className="karte in" aria-label="Fernseher koppeln" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="karte-titel">Fernseher koppeln <small>{liste ? `${liste.length} gekoppelt` : ''}</small></h2>
      <p className="leise" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        Öffnest du die TV-App, zeigt der Fernseher einen 6-stelligen Code. Gib ihn hier ein – der Fernseher darf danach nur den TV-Bereich der Zentrale nutzen (Filme, Musik, Szenen), nicht den Rest.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123 456" aria-label="Code vom Fernseher" style={{ width: 110 }} />
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name des Fernsehers" style={{ width: 150 }} />
        <button className="knopf-klein press tr-primaer" disabled={laeuft || code.replace(/\D/g, '').length !== 6} onClick={koppeln}>Koppeln</button>
      </div>
      {info && <div role="status" style={{ fontSize: 13.5, color: info.fehler ? '#c0392b' : 'inherit' }}>{info.text}</div>}
      {liste && liste.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {liste.map((g) => (
            <li key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
              <span><b>{g.name}</b> <span className="leise">· zuletzt {relativ(g.zuletzt)}</span></span>
              <button className="knopf-klein press" onClick={() => entfernen(g)}>Entfernen</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
