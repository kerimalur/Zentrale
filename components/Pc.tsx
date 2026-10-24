'use client';
// Windows-PC: einschalten (Wake-on-LAN) und ausschalten (SSH mit eingeschränktem Schlüssel).
// Status kommt von Tailscale: online, sobald Windows läuft.
import { useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden, holen, kopieren } from '@/lib/api';
import { relativ } from '@/lib/format';
import { Icon } from './ui';

export function PcKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const pc = z.pc;
  const [laedt, setLaedt] = useState<null | 'an' | 'aus'>(null);
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeile, setZeile] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  if (!pc) return null;

  const startet = !!pc.gewecktUm && pc.online !== true;
  const faehrtRunter = !!pc.ausUm;
  const status = !pc.eingerichtet
    ? 'PC_MAC fehlt in der .env'
    : faehrtRunter
      ? `wird ausgeschaltet … (${relativ(pc.ausUm)})`
      : pc.online === true
        ? 'läuft'
        : startet
          ? `startet … (Signal ${relativ(pc.gewecktUm)})`
          : pc.online === false
            ? `aus${pc.zuletzt ? ` · zuletzt ${relativ(pc.zuletzt)}` : ''}`
            : 'Status unbekannt (in Tailscale nicht gefunden)';
  const farbe = faehrtRunter || startet ? 'var(--orange)' : pc.online === true ? 'var(--gruen)' : '#b8bfce';

  async function los(art: 'an' | 'aus', fn: () => Promise<unknown>) {
    setLaedt(art);
    setFehler(null);
    try { await fn(); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(null); setFrage(false); aktualisieren(); }
  }

  async function schluesselZeigen() {
    if (zeile) { setZeile(null); return; }
    try { setZeile((await holen<{ zeile: string }>('/api/pc/schluessel')).zeile); } catch (e) { setFehler((e as Error).message); }
  }

  const ausMoeglich = pc.ausBereit && pc.online !== false && !faehrtRunter;

  return (
    <section className="karte in" style={{ animationDelay: '140ms', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={pc.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ereignis-ico" style={{ background: 'var(--bg)', color: 'var(--accent)', width: 40, height: 40 }}>
          <Icon name="pc" size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{pc.name}</b>
          <span className="leise" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={startet || faehrtRunter ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: farbe, flexShrink: 0 }} />
            {status}
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="press knopf-klein" onClick={() => los('an', () => senden('/api/pc/wecken'))} disabled={laedt !== null || !pc.eingerichtet} aria-label={`${pc.name} einschalten`}>
          {laedt === 'an' ? 'Sende …' : startet ? 'Nochmal einschalten' : 'Einschalten'}
        </button>
        {ausMoeglich && (
          <button
            className="press knopf-klein"
            style={frage ? { background: 'var(--fehler)', color: '#fff' } : undefined}
            disabled={laedt !== null}
            onClick={() => (frage ? los('aus', () => senden('/api/pc/ausschalten', { bestaetigt: true })) : setFrage(true))}
            aria-label={`${pc.name} ausschalten`}
          >
            {laedt === 'aus' ? 'Schalte aus …' : frage ? 'Wirklich ausschalten?' : 'Ausschalten'}
          </button>
        )}
        {frage && <button className="press knopf-klein" onClick={() => setFrage(false)}>Abbrechen</button>}
      </div>
      {faehrtRunter && <p className="leise" style={{ fontSize: 12, margin: 0 }}>Der PC fährt 30 Sekunden nach dem Signal herunter. Abbrechen am PC: <code>shutdown /a</code></p>}

      {pc.eingerichtet && (
        <button className="leise" onClick={schluesselZeigen} style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
          {zeile ? 'Einrichtung ausblenden' : pc.ausBereit ? 'Schlüssel fürs Ausschalten anzeigen' : 'Ausschalten einrichten'}
        </button>
      )}
      {zeile && (
        <>
          <p className="leise" style={{ fontSize: 12, margin: 0 }}>
            Diese Zeile auf dem PC in <code>C:\ProgramData\ssh\administrators_authorized_keys</code> einfügen. Der Schlüssel darf nur «shutdown» ausführen und nur aus dem Tailscale-Netz kommen.
            {!pc.ausBereit && ' Danach PC_USER (Windows-Benutzername) in der .env eintragen.'}
          </p>
          <div className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{zeile}</div>
          <button className="press knopf-klein" style={{ alignSelf: 'flex-start' }} onClick={async () => { setKopiert(await kopieren(zeile)); setTimeout(() => setKopiert(false), 2000); }}>
            {kopiert ? 'Kopiert' : 'Kopieren'}
          </button>
        </>
      )}
      {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
    </section>
  );
}
