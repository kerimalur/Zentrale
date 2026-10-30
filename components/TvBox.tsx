'use client';
// Xiaomi TV Box als Fernbedienung in der Zentrale: ein/aus, Pfeiltasten, Home/Zurück, Lautstärke.
import { useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { Icon, type IconName } from './ui';

type Taste = { k: string; text?: string; icon?: IconName; label: string; klasse?: string };

const KREUZ: Taste[] = [
  { k: 'zurueck', text: 'Zurück', label: 'Zurück' },
  { k: 'hoch', text: '▲', label: 'Hoch' },
  { k: 'home', text: 'Home', label: 'Startseite' },
  { k: 'links', text: '◀', label: 'Links' },
  { k: 'ok', text: 'OK', label: 'OK', klasse: 'ok' },
  { k: 'rechts', text: '▶', label: 'Rechts' },
  { k: 'menu', text: 'Menü', label: 'Menü' },
  { k: 'runter', text: '▼', label: 'Runter' },
  { k: 'spielen', text: '⏯', label: 'Abspielen / Pause' },
];
const LAUT: Taste[] = [
  { k: 'stumm', icon: 'lautAus', label: 'Ton aus' },
  { k: 'leiser', icon: 'lautMinus', label: 'Leiser' },
  { k: 'lauter', icon: 'lautPlus', label: 'Lauter' },
];

export function TvBoxKarte({ z }: { z: Zustand }) {
  const box = z.tvbox;
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!box || !box.eingerichtet) return null;

  async function los(id: string, fn: () => Promise<unknown>) {
    setLaedt(id);
    setFehler(null);
    try { await fn(); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(null); }
  }
  const taste = (k: string) => los(k, () => senden('/api/tvbox/taste', { taste: k }));

  const an = box.an === true;
  const status = laedt === 'an' ? 'wird eingeschaltet …' : an ? 'an' : box.an === false ? 'aus (Standby)' : box.fehler || 'wird geprüft …';

  const knopf = (t: Taste) => (
    <button key={t.k} className={`fb-taste press${t.klasse ? ' ' + t.klasse : ''}`} aria-label={t.label} title={t.label} disabled={laedt !== null} onClick={() => taste(t.k)}>
      {t.icon ? <Icon name={t.icon} size={18} /> : t.text}
    </button>
  );

  return (
    <section className="karte in fb" style={{ animationDelay: '180ms' }} aria-label={box.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ereignis-ico" style={{ background: 'var(--bg)', color: 'var(--accent)', width: 40, height: 40 }}>
          <Icon name="tv" size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{box.name}</b>
          <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="punkt" style={{ width: 8, height: 8, flexShrink: 0, background: an ? 'var(--gruen)' : '#b8bfce' }} />
            {status}
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {an ? (
          <button className="press knopf-klein" disabled={laedt !== null} onClick={() => los('aus', () => senden('/api/tvbox/aus'))}>Ausschalten</button>
        ) : (
          <button className="press knopf-klein" disabled={laedt !== null} onClick={() => los('an', () => senden('/api/tvbox/an'))}>
            {laedt === 'an' ? 'Schalte ein …' : 'Einschalten'}
          </button>
        )}
        <button className="press knopf-klein" onClick={() => setOffen(!offen)} aria-expanded={offen}>{offen ? 'Fernbedienung zu' : 'Fernbedienung'}</button>
      </div>

      {offen && (
        <>
          <div className="fb-reihe" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>{LAUT.map(knopf)}</div>
          <div className="fb-kreuz">{KREUZ.map(knopf)}</div>
          {!an && <p className="leise" style={{ fontSize: 12, margin: 0 }}>Die Tasten funktionieren, sobald die Box an ist.</p>}
        </>
      )}
      {fehler && <div className="fehlerbox" style={{ fontSize: 12.5 }}>{fehler}</div>}
    </section>
  );
}
