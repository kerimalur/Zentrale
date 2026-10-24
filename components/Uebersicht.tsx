'use client';
import { useState } from 'react';
import type { Zustand, Dienst, Ereignis } from '@/lib/types';
import { senden } from '@/lib/api';
import { komma, uhr, zahl } from '@/lib/format';
import { Icon, Ring, Verlauf, type IconName } from './ui';
import { PcKarte } from './Pc';

export const APP_FARBE: Record<Dienst['id'], string> = {
  nextcloud: '#2457f5',
  jellyfin: '#7e3fd6',
  vaultwarden: '#15803d',
  pihole: '#c2410c',
  syncthing: '#0e7490',
  kuma: '#be185d',
};

export const SZENE_STIL: Record<string, { farbe: string; icon: IconName; sub: string; text: string }> = {
  normal: { farbe: '#2457f5', icon: 'sonne', sub: 'Alles an', text: 'Alle Dienste laufen, CPU im Normaltakt, Lüfter regeln nach Temperatur.' },
  film: { farbe: '#7e3fd6', icon: 'film', sub: 'Jellyfin im Fokus', text: 'Nextcloud und Syncthing pausiert, Jellyfin bekommt die volle Leistung.' },
  nacht: { farbe: '#1e2a4a', icon: 'mond', sub: 'Nur das Nötigste', text: 'Jellyfin pausiert, Stromsparmodus, Möbel-Lüfter nur bei Wärme, Backup-HDD schläft. Nextcloud bleibt für Handy-Uploads an.' },
};

const EREIGNIS_STIL: Record<Ereignis['art'], { icon: IconName; farbe: string; bg: string }> = {
  ok: { icon: 'ok', farbe: '#15803d', bg: '#e7f6ec' },
  info: { icon: 'info', farbe: '#2457f5', bg: '#e8eefe' },
  warnung: { icon: 'warn', farbe: '#b45309', bg: '#fdf1dc' },
  fehler: { icon: 'fehler', farbe: '#b42318', bg: '#fdecea' },
  film: { icon: 'film', farbe: '#7e3fd6', bg: '#efe9fd' },
  gast: { icon: 'gast', farbe: '#2457f5', bg: '#e8eefe' },
  nacht: { icon: 'mond', farbe: '#1e2a4a', bg: '#e6e9f2' },
};

const STATUS_TEXT: Record<Dienst['status'], string> = {
  online: 'online',
  pausiert: 'pausiert',
  gestoert: 'gestört',
  offline: 'gestoppt',
  unbekannt: 'wird geprüft',
};

export function Uebersicht({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const laufen = z.dienste.filter((d) => d.status === 'online').length;
  const pausiert = z.dienste.filter((d) => d.status === 'pausiert').length;
  const gestoert = z.dienste.filter((d) => d.status === 'gestoert' || d.status === 'offline').length;

  const piholeWert = z.netz.pihole?.geblockt;
  return (
    <div className="ueb">
      <section className="status-karte in" aria-label="Status">
        <svg className="status-deko float" viewBox="0 0 24 24" width="190" height="190" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={'M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3'} />
        </svg>
        <div style={{ alignSelf: 'flex-start', fontSize: 14, opacity: 0.85 }}>Dienste</div>
        <div style={{ position: 'relative' }}>
          <Ring wert={(laufen / 6) * 100} groesse={210} dicke={2.6} farbe="#fff" spur="rgba(255,255,255,.22)" label={`${laufen} von 6 Diensten laufen`}>
            <span style={{ fontSize: 62, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>{laufen}/6</span>
            <span style={{ fontSize: 14, opacity: 0.9 }}>{gestoert ? `${gestoert} gestört` : pausiert ? `${pausiert} pausiert (Szene)` : 'Dienste online'}</span>
          </Ring>
          <svg className="orbit" viewBox="0 0 210 210" width="210" height="210" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="105" cy="6" r="5" fill="#fff" />
            <circle cx="105" cy="204" r="3" fill="rgba(255,255,255,.6)" />
          </svg>
        </div>
        <div className="mini">
          <div className="pop" style={{ animationDelay: '300ms' }}><b>{piholeWert === null || piholeWert === undefined ? '—' : piholeWert >= 10000 ? `${komma(piholeWert / 1000)}k` : zahl(piholeWert)}</b><span>geblockt</span></div>
          {z.moebel.vorhanden && z.moebel.temp !== null ? (
            <div className="pop" style={{ animationDelay: '380ms' }}><b>{komma(z.moebel.temp)}</b><span>°C Möbel</span></div>
          ) : (
            <div className="pop" style={{ animationDelay: '380ms' }}><b>{z.pi?.temp === null || z.pi?.temp === undefined ? '—' : Math.round(z.pi.temp)}</b><span>°C Pi</span></div>
          )}
          <div className="pop" style={{ animationDelay: '460ms' }}><b>{komma(z.energie.watt)}</b><span>Watt{z.energie.quelle === 'schaetzung' ? '*' : ''}</span></div>
        </div>
        <div className="status-fuss">
          <span className={z.netz.tailscale.aktiv ? 'punkt ping' : 'punkt'} style={{ width: 8, height: 8, background: z.netz.tailscale.aktiv ? '#fff' : 'rgba(255,255,255,.4)' }} />
          <span style={{ flex: 1 }}>Fernzugriff über Tailscale</span>
          <span style={{ opacity: 0.85 }}>{z.netz.tailscale.aktiv ? 'aktiv' : 'unbekannt'}</span>
        </div>
      </section>

      <section className="apps" aria-label="Dienste">
        {z.dienste.map((d, i) => (
          <Kachel key={d.id} d={d} i={i} aktualisieren={aktualisieren} />
        ))}
      </section>

      <div className="rechts">
        <PcKarte z={z} aktualisieren={aktualisieren} />
        <section className="karte in" style={{ animationDelay: '180ms', flex: 1 }} aria-label="Ereignisse">
          <h2 className="karte-titel">Ereignisse & Fehler</h2>
          {z.ereignisse.length === 0 && <p className="leise" style={{ fontSize: 13 }}>Noch keine Ereignisse.</p>}
          {z.ereignisse.slice(0, 8).map((e, i) => {
            const st = EREIGNIS_STIL[e.art] || EREIGNIS_STIL.info;
            return (
              <div key={e.t + e.text} className="ereignis slide" style={{ animationDelay: `${250 + i * 60}ms` }}>
                <span className="ereignis-ico" style={{ background: st.bg, color: st.farbe }}><Icon name={st.icon} size={16} stroke={2.2} /></span>
                <span style={{ flex: 1 }}>{e.text}</span>
                <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{uhr(e.t)}</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Kachel({ d, i, aktualisieren }: { d: Dienst; i: number; aktualisieren: () => void }) {
  const [frage, setFrage] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const aus = d.status === 'pausiert' || d.status === 'offline';
  const stoerung = d.status === 'gestoert';
  const werte = d.verlauf.length >= 2 ? d.verlauf : [5, 5];

  async function neustart() {
    if (!frage) { setFrage(true); setTimeout(() => setFrage(false), 4000); return; }
    setLaedt(true);
    try { await senden(`/api/dienst/${d.id}/neustart`); } catch {} finally { setLaedt(false); setFrage(false); aktualisieren(); }
  }

  return (
    <article className={`kachel in${aus ? ' aus' : ''}${stoerung ? ' stoerung' : ''}`} style={{ animationDelay: `${60 + i * 70}ms`, background: APP_FARBE[d.id] }}>
      <svg className="kachel-deko float" viewBox="0 0 24 24" width="120" height="120" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animationDelay: `${i * 700}ms` }}>
        <path d={ICON_PFAD[d.id]} />
      </svg>
      <div className="kachel-kopf">
        <span className="kachel-ico"><Icon name={d.id} size={22} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <a className="kachel-name" href={d.url} target="_blank" rel="noreferrer">{d.name}</a>
          <span className="kachel-status">
            <span className={d.status === 'online' ? 'punkt ping' : 'punkt'} />
            {STATUS_TEXT[d.status]}
            {d.status === 'online' && d.ms !== null && <span className="ms">&nbsp;· {d.ms} ms</span>}
          </span>
        </span>
        <button className={`press kachel-neu${frage ? ' bestaetigen' : ''}`} onClick={neustart} aria-label={`${d.name} neu starten`} disabled={laedt}>
          {frage ? 'Neu starten?' : <Icon name="neustart" size={16} className={laedt ? 'dreh' : undefined} />}
        </button>
      </div>
      <div>
        <span className="kachel-wert">{aus ? (d.status === 'offline' ? 'Aus' : 'Pause') : d.kennzahl}</span>
        <span className="kachel-label">{aus ? (d.ausGrund || (d.status === 'offline' ? 'Container gestoppt' : 'pausiert durch Szene')) : d.label}</span>
      </div>
      <Verlauf werte={aus ? [5, 5] : werte} verzoegerung={400 + i * 90} />
    </article>
  );
}

const ICON_PFAD: Record<Dienst['id'], string> = {
  nextcloud: 'M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 5 19z',
  jellyfin: 'M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  vaultwarden: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z',
  pihole: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  syncthing: 'M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M18.5 2v4h-4M5.5 22v-4h4',
  kuma: 'M3 12h4l3-8 4 16 3-8h4',
};

export function SzenenKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [szeneLaedt, setSzeneLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function szene(id: string) {
    if (id === z.szene.id || szeneLaedt) return;
    setSzeneLaedt(id);
    setFehler(null);
    try {
      const r = await senden<{ ok: boolean; fehler: string[] }>('/api/szene', { id });
      if (!r.ok) setFehler(r.fehler.join(' · '));
      aktualisieren();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSzeneLaedt(null);
    }
  }

  return (
    <section className="karte in" style={{ animationDelay: '120ms', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Szenen">
          <h2 className="karte-titel">Szenen</h2>
          {z.szenen.map((s) => {
            const stil = SZENE_STIL[s.id] || SZENE_STIL.normal;
            const an = s.id === z.szene.id;
            return (
              <div key={s.id} className={an ? 'szene-aktiv' : undefined} style={{ ['--szene' as string]: stil.farbe }}>
                <button className="press szene-knopf" aria-pressed={an} aria-describedby={`wirkung-${s.id}`} onClick={() => szene(s.id)} disabled={!!szeneLaedt} title={an ? undefined : s.wirkung.join(' · ')} style={{ background: an ? stil.farbe : 'var(--bg)', color: an ? '#fff' : 'var(--ink)' }}>
                  <span className="szene-ico" style={{ background: an ? 'rgba(255,255,255,.2)' : '#fff', color: an ? '#fff' : stil.farbe }}>
                    <Icon name={stil.icon} size={18} className={szeneLaedt === s.id ? 'dreh' : undefined} />
                  </span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 400 }}>{szeneLaedt === s.id ? 'schaltet …' : an ? (z.szene.auto ? 'aktiv · automatisch' : 'aktiv') : stil.sub}</span>
                </button>
                {an && (
                  <ul className="wirkung" id={`wirkung-${s.id}`}>
                    {s.wirkung.map((w, i) => (
                      <li key={w} className="slide" style={{ animationDelay: `${i * 60}ms` }}>
                        <Icon name="ok" size={13} stroke={2.6} />{w}
                      </li>
                    ))}
                    <li className="leise" style={{ fontSize: 12 }}>seit {uhr(z.szene.seit)}</li>
                  </ul>
                )}
              </div>
            );
          })}
          {fehler && <div className="fehlerbox">{fehler}</div>}
        </section>

  );
}
