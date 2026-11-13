'use client';
// Cloud & Medien als einfache Übersicht für Browser und Handy.
// Die ausführlichen Seiten «Cloud» und «Medien» gibt es weiterhin in ZentraleOS.
import type { Zustand } from '@/lib/types';
import { bytes, relativ, zahl } from '@/lib/format';
import { vpnStatus } from './Medien';

export function CloudMedien({ z }: { z: Zustand }) {
  const c = z.cloud;
  const m = z.medien;
  const vs = vpnStatus(z);
  const d = m?.downloads;
  const belegt = (c.nutzer || []).reduce((a, n) => a + n.belegt, 0);
  const cloudFehler = (c.fehler || []).length;

  return (
    <div className="cm">
      <section className="karte in" aria-label="Nextcloud">
        <h2 className="karte-titel">Nextcloud</h2>
        {!c.bereit ? (
          <p className="leise" style={{ fontSize: 14, margin: 0 }}>{c.grund || 'Keine Daten'}</p>
        ) : (
          <>
            <div className="cm-gross">{c.aktiv ? 'Upload läuft' : 'Ruhig'}</div>
            <div className="leise" style={{ fontSize: 13 }}>{c.letzter ? `letzter Upload ${relativ(c.letzter)}` : 'noch keine Uploads erfasst'}</div>
            <div className="cm-zeilen">
              <div><span>Heute hochgeladen</span><b>{zahl(c.heute?.anzahl || 0)} · {bytes(c.heute?.bytes || 0)}</b></div>
              <div><span>Belegt</span><b>{bytes(belegt)}</b></div>
              {c.platz && <div><span>Frei auf der SSD</span><b>{bytes(c.platz.frei)} von {bytes(c.platz.gross)}</b></div>}
              {cloudFehler > 0 && <div><span>Fehler im Protokoll</span><b style={{ color: 'var(--fehler)' }}>{cloudFehler}</b></div>}
            </div>
          </>
        )}
      </section>

      <section className="karte in" style={{ animationDelay: '60ms' }} aria-label="VPN und Downloads">
        <h2 className="karte-titel">Downloads</h2>
        {!m ? (
          <p className="leise" style={{ fontSize: 14, margin: 0 }}>Keine Medien-Container gefunden.</p>
        ) : (
          <>
            {vs && <div className="cm-gross" style={{ color: vs.farbe }}>{vs.text}</div>}
            <div className="leise" style={{ fontSize: 13 }}>{m.vpn.ok ? [m.vpn.land, m.vpn.stadt].filter(Boolean).join(' · ') || 'Proton VPN' : m.vpn.fehler || 'Proton VPN'}</div>
            {d ? (
              <div className="cm-zeilen">
                <div><span>Download / Upload</span><b>{bytes(d.down)}/s · {bytes(d.up)}/s</b></div>
                <div><span>Lädt · pausiert · fertig</span><b>{d.anzahl.laden} · {d.anzahl.pausiert} · {d.anzahl.fertig}</b></div>
                {d.anzahl.fehler > 0 && <div><span>Mit Fehler</span><b style={{ color: 'var(--fehler)' }}>{d.anzahl.fehler}</b></div>}
              </div>
            ) : (
              <p className="leise" style={{ fontSize: 13, margin: '10px 0 0' }}>{m.downloadsGrund || 'Wird geladen …'}</p>
            )}
          </>
        )}
      </section>

      <section className="karte in" style={{ animationDelay: '120ms' }} aria-label="Medien">
        <h2 className="karte-titel">Medien</h2>
        {!m ? (
          <p className="leise" style={{ fontSize: 14, margin: 0 }}>—</p>
        ) : (
          <div className="cm-zeilen" style={{ marginTop: 0 }}>
            <div><span>Offene Anfragen (Seerr)</span><b>{m.seerr ? m.seerr.offen : '—'}</b></div>
            {m.seerr && <div><span>In Arbeit</span><b>{m.seerr.inArbeit}</b></div>}
            <div><span>Neu in den letzten Tagen</span><b>{m.neu.length}</b></div>
            {m.neu.slice(0, 4).map((n) => <div key={n.id}><span className="leise">{n.titel}</span><span className="leise">{n.art === 'film' ? 'Film' : 'Serie'}</span></div>)}
            <div><span>Demnächst</span><b>{m.demnaechst.length}</b></div>
          </div>
        )}
      </section>
    </div>
  );
}
