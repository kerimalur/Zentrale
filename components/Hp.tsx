'use client';
// HP (Trading-Rechner): sperren, Bildschirm aus- und einschalten.
// Der HP ist von aussen nicht erreichbar – die Desktop-App darauf holt die Befehle
// selbst ab und meldet dabei ihren Zustand. Darum dauert es ein paar Sekunden,
// bis ein Knopfdruck wirkt. Entsperren geht bewusst nur am HP selbst.
import { useCallback, useEffect, useState } from 'react';
import { senden, holen } from '@/lib/api';
import { relativ } from '@/lib/format';
import { Icon } from './ui';

type HpZustand = {
  erreichbar: boolean;
  gesperrt: boolean | null;
  bildschirm: 'an' | 'aus' | null;
  version: string | null;
  rechner: string | null;
  benutzer: string | null;
  seit: number | null;
  offeneBefehle: string[];
};

export function HpKarte() {
  const [z, setZ] = useState<HpZustand | null>(null);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [weg, setWeg] = useState(false);

  const laden = useCallback(async () => {
    try {
      setZ(await holen<HpZustand>('/api/hp'));
      setWeg(false);
    } catch {
      setWeg(true);
    }
  }, []);

  useEffect(() => {
    laden();
    const t = setInterval(laden, 10_000);
    return () => clearInterval(t);
  }, [laden]);

  // Noch nie eine Meldung vom HP: Karte gar nicht zeigen, solange nichts gekoppelt ist.
  if (weg || !z || (!z.erreichbar && !z.seit)) return null;

  async function los(befehl: string) {
    setLaedt(befehl);
    setFehler(null);
    try {
      await senden('/api/hp/befehl', { befehl });
      setTimeout(laden, 2000);
      setTimeout(laden, 7000);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(null);
    }
  }

  const status = !z.erreichbar
    ? `nicht erreichbar${z.seit ? ` · zuletzt ${relativ(z.seit)}` : ''}`
    : `${z.gesperrt ? 'gesperrt' : 'entsperrt'} · Bildschirm ${z.bildschirm === 'aus' ? 'aus' : 'an'}`;
  const farbe = !z.erreichbar ? '#b8bfce' : z.gesperrt ? 'var(--orange)' : 'var(--gruen)';
  const name = z.rechner || 'HP';

  return (
    <section className="karte in" style={{ animationDelay: '160ms', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ereignis-ico" style={{ background: 'var(--bg)', color: 'var(--accent)', width: 40, height: 40 }}>
          <Icon name="pc" size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{name}</b>
          <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={z.offeneBefehle.length ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: farbe, flexShrink: 0 }} />
            {status}
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="press knopf-klein" disabled={!z.erreichbar || laedt !== null} onClick={() => los('bildschirmAus')}>
          {laedt === 'bildschirmAus' ? 'Sende …' : 'Sperren & Bildschirm aus'}
        </button>
        <button className="press knopf-klein" disabled={!z.erreichbar || laedt !== null || !!z.gesperrt} onClick={() => los('sperren')}>
          {laedt === 'sperren' ? 'Sende …' : 'Nur sperren'}
        </button>
        <button className="press knopf-klein" disabled={!z.erreichbar || laedt !== null || z.bildschirm !== 'aus'} onClick={() => los('bildschirmAn')}>
          {laedt === 'bildschirmAn' ? 'Sende …' : 'Bildschirm an'}
        </button>
      </div>

      {!!z.offeneBefehle.length && (
        <p className="leise" style={{ fontSize: 12, margin: 0 }}>Befehl unterwegs – der HP fragt alle paar Sekunden nach.</p>
      )}
      <p className="leise" style={{ fontSize: 12, margin: 0 }}>
        Der HP läuft immer durch, auch wenn der Bildschirm aus ist. Entsperren geht nur am Gerät selbst.
      </p>
      {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
    </section>
  );
}
