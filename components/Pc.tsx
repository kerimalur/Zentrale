'use client';
// Windows-PC per Wake-on-LAN einschalten. Status kommt von Tailscale (online, sobald Windows läuft).
import { useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { relativ } from '@/lib/format';
import { Icon } from './ui';

export function PcKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const pc = z.pc;
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!pc) return null;

  const startet = !!pc.gewecktUm && pc.online !== true;
  const status = !pc.eingerichtet
    ? 'PC_MAC fehlt in der .env'
    : pc.online === true
      ? 'läuft (Tailscale meldet «aus» erst 2–5 Min nach dem Herunterfahren)'
      : startet
        ? `startet … (Signal ${relativ(pc.gewecktUm)})`
        : pc.online === false
          ? `aus${pc.zuletzt ? ` · zuletzt ${relativ(pc.zuletzt)}` : ''}`
          : 'Status unbekannt (in Tailscale nicht gefunden)';
  const farbe = pc.online === true ? 'var(--gruen)' : startet ? 'var(--orange)' : '#b8bfce';

  async function wecken() {
    setLaedt(true);
    setFehler(null);
    try {
      await senden('/api/pc/wecken');
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
      aktualisieren();
    }
  }

  return (
    <section className="karte in" style={{ animationDelay: '140ms' }} aria-label={pc.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ereignis-ico" style={{ background: 'var(--bg)', color: 'var(--accent)', width: 40, height: 40 }}>
          <Icon name="pc" size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{pc.name}</b>
          <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={startet ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: farbe }} />
            {status}
          </span>
        </span>
        <button
          className="press knopf-klein"
          onClick={wecken}
          disabled={laedt || !pc.eingerichtet}
          aria-label={`${pc.name} einschalten`}
        >
          {laedt ? 'Sende …' : startet ? 'Nochmal' : 'Einschalten'}
        </button>
      </div>
      {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
    </section>
  );
}
