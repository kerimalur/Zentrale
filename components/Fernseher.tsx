'use client';
// Fernseher (Philips) als Fernbedienung in der Zentrale: ein/aus, Lautstärke, Pfeiltasten, Programme.
import { useEffect, useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { Icon, type IconName } from './ui';

type Taste = { k: string; text?: string; icon?: IconName; label: string; klasse?: string };

const OBEN: Taste[] = [
  { k: 'Mute', icon: 'lautAus', label: 'Ton aus' },
  { k: 'VolumeDown', icon: 'lautMinus', label: 'Leiser' },
  { k: 'VolumeUp', icon: 'lautPlus', label: 'Lauter' },
  { k: 'Source', text: 'Quelle', label: 'Quelle wählen' },
];
const KREUZ: Taste[] = [
  { k: 'Back', text: 'Zurück', label: 'Zurück' },
  { k: 'CursorUp', text: '▲', label: 'Hoch' },
  { k: 'Home', text: 'Home', label: 'Startseite' },
  { k: 'CursorLeft', text: '◀', label: 'Links' },
  { k: 'Confirm', text: 'OK', label: 'OK', klasse: 'ok' },
  { k: 'CursorRight', text: '▶', label: 'Rechts' },
  { k: 'Options', text: 'Optionen', label: 'Optionen' },
  { k: 'CursorDown', text: '▼', label: 'Runter' },
  { k: 'Info', text: 'Info', label: 'Info' },
];
const UNTEN: Taste[] = [
  { k: 'ChannelStepDown', text: 'P −', label: 'Programm zurück' },
  { k: 'ChannelStepUp', text: 'P +', label: 'Programm weiter' },
  { k: 'PlayPause', text: '⏯', label: 'Abspielen / Pause' },
  { k: 'Stop', text: '⏹', label: 'Stopp' },
];

export function FernseherKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const tv = z.tv;
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laut, setLaut] = useState<number | null>(null);
  useEffect(() => { if (tv?.lautstaerke !== null && tv?.lautstaerke !== undefined) setLaut(tv.lautstaerke); }, [tv?.lautstaerke]);
  if (!tv || !tv.eingerichtet) return null;

  async function los(id: string, fn: () => Promise<unknown>, neuLaden = true) {
    setLaedt(id);
    setFehler(null);
    try { await fn(); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(null); if (neuLaden) aktualisieren(); }
  }
  const taste = (k: string) => los(k, () => senden('/api/tv/taste', { taste: k }), k === 'Standby');

  const an = tv.an === true;
  const status = tv.schaltetEin || laedt === 'an'
    ? 'wird eingeschaltet …'
    : an
      ? `an${tv.stumm ? ' · stumm' : tv.lautstaerke !== null ? ` · Lautstärke ${tv.lautstaerke}` : ''}`
      : tv.an === false ? 'aus (Standby)' : 'wird geprüft …';

  const knopf = (t: Taste) => (
    <button key={t.k} className={`fb-taste press${t.klasse ? ' ' + t.klasse : ''}`} aria-label={t.label} title={t.label} disabled={!an || laedt !== null} onClick={() => taste(t.k)}>
      {t.icon ? <Icon name={t.icon} size={18} /> : t.text}
    </button>
  );

  return (
    <section className="karte in fb" style={{ animationDelay: '160ms' }} aria-label={tv.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ereignis-ico" style={{ background: 'var(--bg)', color: 'var(--accent)', width: 40, height: 40 }}>
          <Icon name="tv" size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{tv.name}</b>
          <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={tv.schaltetEin ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, flexShrink: 0, background: an ? 'var(--gruen)' : tv.schaltetEin ? 'var(--orange)' : '#b8bfce' }} />
            {status}
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {an ? (
          <button className="press knopf-klein" disabled={laedt !== null} onClick={() => taste('Standby')}>Ausschalten</button>
        ) : (
          <button className="press knopf-klein" disabled={laedt !== null || !tv.kannWecken} title={tv.kannWecken ? undefined : 'TV_MAC fehlt in der .env'} onClick={() => los('an', () => senden('/api/tv/an'))}>
            {laedt === 'an' ? 'Schalte ein … (bis 30 s)' : 'Einschalten'}
          </button>
        )}
        <button className="press knopf-klein" onClick={() => setOffen(!offen)} aria-expanded={offen}>{offen ? 'Fernbedienung zu' : 'Fernbedienung'}</button>
      </div>

      {offen && (
        <>
          <div className="fb-reihe">{OBEN.map(knopf)}</div>
          {an && laut !== null && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }} className="leise">
              <span style={{ minWidth: 70 }}>Lautstärke {laut}</span>
              <input
                type="range" min={0} max={60} value={laut} className="fb-regler" aria-label="Lautstärke"
                onChange={(e) => setLaut(Number(e.target.value))}
                onPointerUp={() => los('laut', () => senden('/api/tv/lautstaerke', { wert: laut }), false)}
                onKeyUp={() => los('laut', () => senden('/api/tv/lautstaerke', { wert: laut }), false)}
              />
            </label>
          )}
          <div className="fb-kreuz">{KREUZ.map(knopf)}</div>
          <div className="fb-reihe">{UNTEN.map(knopf)}</div>
          {!an && <p className="leise" style={{ fontSize: 12, margin: 0 }}>Die Tasten funktionieren, sobald der Fernseher an ist.</p>}
        </>
      )}
      {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
    </section>
  );
}
