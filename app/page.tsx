'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { datumLang, komma } from '@/lib/format';
import { Icon } from '@/components/ui';
import { Uebersicht, SZENE_STIL } from '@/components/Uebersicht';
import { System } from '@/components/System';
import { Netz } from '@/components/Netz';
import { Speicher } from '@/components/Speicher';
import { Cloud } from '@/components/Cloud';
import { Gaeste } from '@/components/Gaeste';
import { Konsole } from '@/components/Konsole';
import { Medien, vpnStatus } from '@/components/Medien';
import { Einstellungen } from '@/components/Einstellungen';

const TABS = ['Übersicht', 'System', 'Netz', 'Speicher', 'Cloud', 'Medien', 'Gäste', 'Konsole', 'Einstellungen'] as const;
type Tab = (typeof TABS)[number];

function gespeicherterTab(): Tab {
  try {
    const h = decodeURIComponent(location.hash.slice(1));
    if ((TABS as readonly string[]).includes(h)) return h as Tab;
    const s = localStorage.getItem('zentrale-tab');
    if (s && (TABS as readonly string[]).includes(s)) return s as Tab;
  } catch {}
  return 'Übersicht';
}

export default function Seite() {
  const [z, setZ] = useState<Zustand | null>(null);
  const [tab, setTab] = useState<Tab>('Übersicht');
  const [verbindungFehlt, setVerbindungFehlt] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const laden = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { location.href = '/login/'; return; }
      if (!res.ok) throw new Error(String(res.status));
      setZ(await res.json());
      setVerbindungFehlt(false);
    } catch {
      setVerbindungFehlt(true);
    }
  }, []);

  useEffect(() => {
    setTab(gespeicherterTab());
    laden();
    const start = () => { if (!timer.current) timer.current = setInterval(laden, 5000); };
    const stopp = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    const sicht = () => (document.hidden ? stopp() : (laden(), start()));
    start();
    document.addEventListener('visibilitychange', sicht);
    return () => { stopp(); document.removeEventListener('visibilitychange', sicht); };
  }, [laden]);

  function waehle(t: Tab) {
    setTab(t);
    try { localStorage.setItem('zentrale-tab', t); history.replaceState(null, '', '#' + encodeURIComponent(t)); } catch {}
  }

  async function abmelden() {
    try { await senden('/api/logout'); } catch {}
    location.href = '/login/';
  }

  if (!z) {
    return (
      <main className="seite" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="pop" style={{ textAlign: 'center' }}>
          <div className="dreh" style={{ width: 36, height: 36, border: '4px solid #dfe4ee', borderTopColor: 'var(--accent)', borderRadius: '50%', margin: '0 auto 14px' }} />
          <div className="leise">{verbindungFehlt ? 'Pi nicht erreichbar – versuche weiter …' : 'Lade Zentrale …'}</div>
        </div>
      </main>
    );
  }

  const stil = SZENE_STIL[z.szene.id] || SZENE_STIL.normal;
  const vpn = vpnStatus(z);
  const stoerungen = z.dienste.filter((d) => d.status === 'gestoert' || (d.status === 'offline' && !d.ausGrund));
  const notbetrieb = z.steuerung?.notbetrieb.an;
  const titel = notbetrieb && !stoerungen.length ? 'Notbetrieb' : stoerungen.length ? (stoerungen.length === 1 ? `${stoerungen[0].name} gestört` : 'Störungen') : z.szene.id === 'normal' ? 'Alles läuft' : z.szene.id === 'film' ? 'Filmabend' : 'Ruhemodus';

  return (
    <main className="seite">
      <header className="kopf">
        <div>
          <div className="kopf-zeile">
            <span>{datumLang()} · {z.uhrzeit}</span>
            <button className="press szene-chip" onClick={() => waehle('Einstellungen')} style={{ border: 0, cursor: 'pointer', color: 'var(--ink)' }} title="Szene wechseln">
              <span className="punkt live" style={{ background: stil.farbe }} />
              Szene {z.szene.name} · {komma(z.energie.watt)} W
            </button>
            {vpn && (
              <button className="press szene-chip" onClick={() => waehle('Medien')} style={{ border: 0, cursor: 'pointer', color: vpn.farbe === '#15803d' ? 'var(--ink)' : vpn.farbe, fontWeight: vpn.farbe === '#15803d' ? 400 : 700 }}>
                <span className={vpn.farbe === '#15803d' ? 'punkt' : 'punkt live'} style={{ background: vpn.farbe }} />
                {vpn.kurz}
              </button>
            )}
            {notbetrieb && (
              <button className="press szene-chip" onClick={() => waehle('Einstellungen')} style={{ border: 0, cursor: 'pointer', color: 'var(--orange)', fontWeight: 700 }}>
                <span className="punkt live" style={{ background: 'var(--orange)' }} />
                Notbetrieb
              </button>
            )}
            {verbindungFehlt && <span className="szene-chip" style={{ color: '#b42318' }}>Verbindung unterbrochen</span>}
          </div>
          <h1 className="titel">{titel}<span style={{ color: stoerungen.length || notbetrieb ? '#d97706' : stil.farbe }}>.</span></h1>
        </div>
        <div className="kopf-aktionen" style={{ maxWidth: '100%' }}>
          <nav className="tabs" aria-label="Bereiche">
            {TABS.map((t) => (
              <button key={t} className="press tab" aria-pressed={t === tab} onClick={() => waehle(t)}>{t}</button>
            ))}
          </nav>
          <button className="press icon-knopf" onClick={abmelden} aria-label="Abmelden" title="Abmelden"><Icon name="abmelden" size={20} /></button>
        </div>
      </header>

      {tab === 'Übersicht' && <Uebersicht z={z} aktualisieren={laden} />}
      {tab === 'System' && <System z={z} aktualisieren={laden} />}
      {tab === 'Netz' && <Netz z={z} />}
      {tab === 'Speicher' && <Speicher z={z} />}
      {tab === 'Cloud' && <Cloud z={z} aktualisieren={laden} />}
      {tab === 'Medien' && <Medien z={z} />}
      {tab === 'Gäste' && <Gaeste z={z} aktualisieren={laden} />}
      {tab === 'Konsole' && <Konsole z={z} />}
      {tab === 'Einstellungen' && <Einstellungen z={z} aktualisieren={laden} />}
    </main>
  );
}
