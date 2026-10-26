'use client';
import type { Zustand } from '@/lib/types';
import { bytes, relativ, zahl } from '@/lib/format';
import { Icon } from './ui';
import { useEffect, useState } from 'react';
import { NetzHeim } from './NetzHeim';
import { NetzPorts } from './NetzPorts';
import { NetzLernen } from './NetzLernen';
import { useNetzwerk } from './NetzBausteine';

type Reiter = 'uebersicht' | 'heim' | 'ports' | 'lernen';
const REITER: { id: Reiter; text: string }[] = [
  { id: 'uebersicht', text: 'Übersicht' },
  { id: 'heim', text: 'Heimnetz' },
  { id: 'ports', text: 'Ports & Zugriff' },
  { id: 'lernen', text: 'Lernen' },
];

export function Netz({ z }: { z: Zustand }) {
  const [reiter, setReiter] = useState<Reiter>('uebersicht');
  useEffect(() => {
    try { const r = sessionStorage.getItem('netz-reiter') as Reiter | null; if (r && REITER.some((x) => x.id === r)) setReiter(r); } catch {}
  }, []);
  const waehlen = (r: Reiter) => { setReiter(r); try { sessionStorage.setItem('netz-reiter', r); } catch {} };
  const { d, fehler, neuLaden } = useNetzwerk();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="segment nw-reiter" role="tablist" aria-label="Netz-Bereiche" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {REITER.map((r) => <button key={r.id} role="tab" aria-selected={reiter === r.id} aria-pressed={reiter === r.id} onClick={() => waehlen(r.id)}>{r.text}</button>)}
      </div>
      {reiter === 'uebersicht' && <NetzUebersicht z={z} />}
      {(reiter === 'heim' || reiter === 'ports') && fehler && !d && <div className="karte fehlerbox">Netzwerk-Daten nicht ladbar: {fehler}</div>}
      {(reiter === 'heim' || reiter === 'ports') && !d && !fehler && <div className="karte leise">Lade … die erste Abfrage liest das Netz und kann einige Sekunden dauern.</div>}
      {reiter === 'heim' && d && <NetzHeim d={d} neuLaden={neuLaden} />}
      {reiter === 'ports' && d && <NetzPorts d={d} />}
      {reiter === 'lernen' && <NetzLernen gehZu={(r) => waehlen(r)} />}
    </div>
  );
}

function NetzUebersicht({ z }: { z: Zustand }) {
  const g = z.netz.geraete;
  const maxAktiv = Math.max(1, ...g.map((x) => x.download + x.upload));
  const maxV = Math.max(1, ...z.netz.verkehr.map((v) => Math.max(v.down, v.up)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="geraete">
        {g.length === 0 && <div className="karte leise">Keine Geräte gefunden (Tailscale-Socket nicht erreichbar?).</div>}
        {g.map((d, i) => (
          <section key={d.ip || d.name} className="karte geraet in" style={{ animationDelay: `${80 + i * 60}ms` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="geraet-ico"><Icon name={d.typ} size={22} stroke={1.9} /></span>
              <span className="pille" style={d.online ? { background: '#e7f6ec', color: '#15803d' } : { background: '#f0f2f7', color: 'var(--muted)' }}>
                {d.gast ? 'Gast · ' : ''}{d.online ? 'online' : 'offline'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div className="leise" style={{ fontSize: 12 }}>{d.ip} · {d.online ? 'jetzt' : `zuletzt ${relativ(d.zuletzt)}`}</div>
            </div>
            <div className="zwei">
              <div><small>↓ Download heute</small><b>{bytes(d.download)}</b></div>
              <div><small>↑ Upload heute</small><b>{bytes(d.upload)}</b></div>
            </div>
            <div>
              <div className="leise" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span>Aktivität</span>
                <span>{d.dns === null ? 'DNS unbekannt' : `${zahl(d.dns)} DNS-Anfragen`}</span>
              </div>
              <div className="balken"><span className="gx" style={{ width: `${Math.max(2, ((d.download + d.upload) / maxAktiv) * 100)}%`, background: 'var(--accent)' }} /></div>
            </div>
          </section>
        ))}
      </div>

      <div className="netz-unten">
        <section className="karte in" style={{ animationDelay: '200ms', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Datenverkehr">
          <h2 className="karte-titel">
            Datenverkehr des Pi
            <small style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><span className="legende" style={{ background: 'var(--accent)' }} />Download {bytes(z.netz.heute.down)}</span>
              <span><span className="legende" style={{ background: '#9db4fb' }} />Upload {bytes(z.netz.heute.up)}</span>
            </small>
          </h2>
          <div className="verkehr" role="img" aria-label={`Datenverkehr der letzten 24 Stunden: ${bytes(z.netz.heute.down)} empfangen, ${bytes(z.netz.heute.up)} gesendet`}>
            {z.netz.verkehr.map((v, i) => (
              <div key={i} title={`↓ ${bytes(v.down)} · ↑ ${bytes(v.up)}`}>
                <span className="gy" style={{ animationDelay: `${i * 40}ms`, height: `${Math.max(1.5, (v.down / maxV) * 100)}%`, background: 'var(--accent)' }} />
                <span className="gy" style={{ animationDelay: `${i * 40}ms`, height: `${Math.max(1.5, (v.up / maxV) * 100)}%`, background: '#9db4fb' }} />
              </div>
            ))}
          </div>
          <div className="leise" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>vor 24 Std</span><span>jetzt</span></div>
        </section>

        <section className="karte in" style={{ animationDelay: '260ms', display: 'flex', flexDirection: 'column' }} aria-label="Netz">
          <h2 className="karte-titel">Netz</h2>
          {[
            ['Fernzugriff', z.netz.tailscale.aktiv ? 'Tailscale · aktiv' : 'Tailscale · unbekannt'],
            ['Adresse', z.netz.tailscale.ip || '—'],
            ['Pi-hole', z.netz.pihole ? `${zahl(z.netz.pihole.prozent)} % geblockt` : '—'],
            ['Anfragen (24 Std)', z.netz.pihole ? zahl(z.netz.pihole.anfragen) : '—'],
            ['Internet-Ping', z.netz.ping === null ? 'keine Antwort' : `${z.netz.ping} ms`],
            ['LAN', z.netz.lan ? (z.netz.lan.verbunden ? `${z.netz.lan.mbit >= 1000 ? z.netz.lan.mbit / 1000 + ' Gbit/s' : z.netz.lan.mbit + ' Mbit/s'}` : 'getrennt') : '—'],
          ].map(([k, v]) => (
            <div key={k} className="zeile" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span className="leise">{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <p className="leise" style={{ marginTop: 'auto', marginBottom: 0, paddingTop: 12, fontSize: 12, lineHeight: 1.4 }}>
            Zeigt nur Verkehr, der über den Pi läuft (Tailscale, Nextcloud, Jellyfin), und DNS-Anfragen über Pi-hole. Den ganzen Verkehr im Haus sieht nur der Router.
          </p>
        </section>
      </div>
    </div>
  );
}
