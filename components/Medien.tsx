'use client';
import type { Zustand, Torrent, MedienApp } from '@/lib/types';
import { bytes, relativ, zahl } from '@/lib/format';
import { Icon } from './ui';

const ZUSTAND_TEXT: Record<string, string> = {
  downloading: 'lädt', forcedDL: 'lädt (erzwungen)', stalledDL: 'wartet auf Quellen', metaDL: 'holt Infos', forcedMetaDL: 'holt Infos',
  queuedDL: 'in Warteschlange', pausedDL: 'pausiert', stoppedDL: 'gestoppt', checkingDL: 'prüft', checkingUP: 'prüft', allocating: 'reserviert Platz',
  uploading: 'fertig · teilt', stalledUP: 'fertig', forcedUP: 'fertig · teilt', queuedUP: 'fertig', pausedUP: 'fertig', stoppedUP: 'fertig',
  error: 'Fehler', missingFiles: 'Dateien fehlen', moving: 'wird verschoben',
};

export function vpnStatus(z: Zustand): { text: string; farbe: string; kurz: string } | null {
  const v = z.medien?.vpn;
  if (!v) return null;
  if (v.ausgeschaltet) return { text: 'VPN ausgeschaltet', kurz: 'VPN aus', farbe: '#5b6478' };
  if (v.gluetun && v.gluetun !== 'running') return { text: 'VPN-Container gestoppt', kurz: 'VPN aus', farbe: '#b42318' };
  if (v.ok && v.geschuetzt === false) return { text: 'VPN-Leck!', kurz: 'VPN-Leck', farbe: '#b42318' };
  if (v.ok && v.geschuetzt) return { text: 'Geschützt', kurz: `VPN · ${v.land || 'aktiv'}`, farbe: '#15803d' };
  if (v.ok === false) return { text: 'VPN getrennt', kurz: 'VPN getrennt', farbe: '#c2410c' };
  return { text: 'Wird geprüft …', kurz: 'VPN …', farbe: '#5b6478' };
}

const eta = (s: number | null) => {
  if (s === null || s < 0) return '∞';
  if (s < 60) return '< 1 Min';
  if (s < 3600) return `${Math.round(s / 60)} Min`;
  if (s < 86400) return `${Math.floor(s / 3600)} Std ${Math.round((s % 3600) / 60)} Min`;
  return `${Math.round(s / 86400)} Tage`;
};

const tag = (iso: string) => {
  const d = new Date(iso);
  const heute = new Date();
  const morgen = new Date(Date.now() + 86400_000);
  if (d.toDateString() === heute.toDateString()) return 'heute';
  if (d.toDateString() === morgen.toDateString()) return 'morgen';
  return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

const ART_ICON = { serie: 'pc', film: 'film', musik: 'jellyfin' } as const;

export function Medien({ z }: { z: Zustand }) {
  const m = z.medien;
  if (!m) return <div className="karte leise">Keine Medien-Container gefunden.</div>;
  const v = m.vpn;
  const vs = vpnStatus(z)!;
  const d = m.downloads;

  return (
    <div className="medien">
      <section className="vpn-karte in" style={{ background: vs.farbe }} aria-label="VPN">
        <Icon name="pihole" size={170} stroke={1.2} className="float vpn-deko" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, opacity: 0.9 }}>
          <span className={v.ok && v.geschuetzt ? 'punkt ping' : 'punkt live'} style={{ width: 8, height: 8, background: '#fff' }} />
          Proton VPN · Gluetun {v.health ? `· ${v.health === 'healthy' ? 'gesund' : v.health}` : ''}
        </div>
        <div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{vs.text}</div>
          <div style={{ fontSize: 16, marginTop: 6, opacity: 0.95 }}>
            {v.ok ? [v.land, v.stadt].filter(Boolean).join(' · ') : v.fehler || 'Noch keine Messung'}
          </div>
        </div>
        <div className="vpn-fakten">
          <div><small>IP von qBittorrent</small><b>{v.ip || '—'}</b></div>
          <div><small>IP des Pi</small><b>{v.pi || '—'}</b></div>
          <div style={{ gridColumn: '1 / -1' }}><small>Anbieter</small><b>{v.anbieter || '—'}</b></div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          {v.geschuetzt ? 'qBittorrent läuft nachweislich über das VPN' : v.geschuetzt === false ? 'Alle Downloads wurden automatisch gestoppt' : 'Prüfung alle 3 Minuten'}
          {v.zeit ? ` · geprüft ${relativ(v.zeit)}` : ''}
        </div>
      </section>

      <section className="karte in" style={{ animationDelay: '80ms', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Downloads">
        <h2 className="karte-titel">Downloads {d?.gedrosselt && <span className="pille" style={{ background: '#efe9fd', color: '#6d3fd6' }}>gedrosselt</span>}</h2>
        {!d ? (
          <p style={{ fontSize: 14, margin: 0, color: m.downloadsGrund && !m.downloadsGrund.endsWith('…') ? 'var(--fehler)' : 'var(--muted)' }}>{m.downloadsGrund || 'Wird geladen …'}</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div className="leise" style={{ fontSize: 12 }}>↓ Download</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: 'var(--accent)' }}>{bytes(d.down)}/s</div>
              </div>
              <div>
                <div className="leise" style={{ fontSize: 12 }}>↑ Upload</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{bytes(d.up)}/s</div>
              </div>
            </div>
            <div className="zwei" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div><small>lädt</small><b>{d.anzahl.laden}</b></div>
              <div><small>pausiert</small><b>{d.anzahl.pausiert}</b></div>
              <div><small>Fehler</small><b style={{ color: d.anzahl.fehler ? '#b42318' : undefined }}>{d.anzahl.fehler}</b></div>
              <div><small>fertig</small><b>{d.anzahl.fertig}</b></div>
            </div>
            <span className="leise" style={{ fontSize: 12 }}>
              {d.verbindung === 'connected' ? 'Tracker erreichbar' : d.verbindung === 'firewalled' ? 'Eingehend blockiert (normal ohne Port-Weiterleitung)' : 'Keine Verbindung'}
              {m.filmabendDrosseln ? ' · Filmabend drosselt automatisch' : ''}
            </span>
          </>
        )}
      </section>

      <section className="seerr-karte in" style={{ animationDelay: '140ms' }} aria-label="Anfragen">
        <Icon name="gast" size={130} stroke={1.3} className="float vpn-deko" />
        <div style={{ fontSize: 13, opacity: 0.9 }}>Seerr · Anfragen</div>
        {m.seerr ? (
          <>
            <div><span style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.05em' }}>{m.seerr.offen}</span><span style={{ fontSize: 16, opacity: 0.9 }}> offen</span></div>
            <div className="mini" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div><b>{m.seerr.inArbeit}</b><span>in Arbeit</span></div>
              <div><b>{m.seerr.verfuegbar}</b><span>verfügbar</span></div>
              <div><b>{m.seerr.gesamt}</b><span>gesamt</span></div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, opacity: 0.9 }}>SEERR_API_KEY fehlt in .env</div>
        )}
      </section>

      <section className="karte span2 in" style={{ animationDelay: '200ms' }} aria-label="Warteschlange">
        <h2 className="karte-titel">Warteschlange <small>{d ? `${d.torrents.length} angezeigt` : ''}</small></h2>
        {d && d.torrents.length === 0 && <p className="leise" style={{ fontSize: 14, margin: 0 }}>Nichts in der Warteschlange.</p>}
        {d?.torrents.map((t, i) => <TorrentZeile key={t.hash} t={t} i={i} />)}
      </section>

      <section className="karte in" style={{ animationDelay: '260ms' }} aria-label="Demnächst">
        <h2 className="karte-titel">Demnächst <small>14 Tage</small></h2>
        {m.demnaechst.length === 0 && (
          <p className="leise" style={{ fontSize: 14, margin: 0 }}>
            {m.arrGrund.length ? m.arrGrund.join(' · ') : 'Nichts geplant in den nächsten 14 Tagen.'}
          </p>
        )}
        {m.demnaechst.map((e, i) => (
          <div key={e.titel + i} className="ereignis slide" style={{ animationDelay: `${300 + i * 50}ms` }}>
            <span className="ereignis-ico" style={{ background: e.art === 'film' ? '#efe9fd' : e.art === 'musik' ? '#fce7f1' : '#e8eefe', color: e.art === 'film' ? '#6d3fd6' : e.art === 'musik' ? '#be185d' : '#2457f5' }}>
              <Icon name={ART_ICON[e.art]} size={15} stroke={2.2} />
            </span>
            <span style={{ flex: 1 }}>{e.titel}{e.hatDatei ? ' ✓' : ''}</span>
            <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{tag(e.wann)}</span>
          </div>
        ))}
      </section>

      <section className="karte span2 in" style={{ animationDelay: '320ms' }} aria-label="Apps">
        <h2 className="karte-titel">Arr-Stack</h2>
        <div className="medien-apps">
          {m.apps.map((a, i) => <AppKachel key={a.id} a={a} i={i} />)}
        </div>
      </section>

      <section className="karte in" style={{ animationDelay: '380ms' }} aria-label="Neu hinzugefügt">
        <h2 className="karte-titel">Neu hinzugefügt</h2>
        {m.neu.length === 0 && <p className="leise" style={{ fontSize: 14, margin: 0 }}>Noch nichts.</p>}
        {m.neu.map((n, i) => (
          <div key={n.id} className="ereignis slide" style={{ animationDelay: `${420 + i * 50}ms` }}>
            <span className="ereignis-ico" style={{ background: '#e7f6ec', color: '#15803d' }}><Icon name="ok" size={15} stroke={2.4} /></span>
            <span style={{ flex: 1 }}>{n.titel}</span>
            <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relativ(n.wann)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function TorrentZeile({ t, i }: { t: Torrent; i: number }) {
  const fehler = t.zustand === 'error' || t.zustand === 'missingFiles';
  const laedt = ['downloading', 'forcedDL'].includes(t.zustand);
  const fertig = t.fortschritt >= 1;
  const farbe = fehler ? '#dc2626' : fertig ? '#16a34a' : t.zustand === 'stalledDL' ? '#d97706' : 'var(--accent)';
  return (
    <div className="torrent slide" style={{ animationDelay: `${240 + i * 40}ms` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span className="torrent-name" title={t.name}>{t.name}</span>
        <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{Math.floor(t.fortschritt * 100)} % · {bytes(t.groesse)}</span>
      </div>
      <div className="balken" style={{ height: 6 }}><span className={laedt ? 'gx streifen' : 'gx'} style={{ width: `${Math.max(1, t.fortschritt * 100)}%`, background: farbe }} /></div>
      <div className="leise" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 10 }}>
        <span style={{ color: fehler ? '#b42318' : undefined }}>{ZUSTAND_TEXT[t.zustand] || t.zustand}{t.kategorie ? ` · ${t.kategorie}` : ''}</span>
        <span style={{ whiteSpace: 'nowrap' }}>{laedt ? `↓ ${bytes(t.down)}/s · noch ${eta(t.eta)}` : fertig ? '' : t.zustand === 'stalledDL' ? 'keine Quellen' : ''}</span>
      </div>
    </div>
  );
}

function AppKachel({ a, i }: { a: MedienApp; i: number }) {
  const fehler = a.warnungen.filter((w) => w.typ === 'error').length;
  const warn = a.warnungen.length - fehler;
  const dot = a.ausgeschaltet ? '#b8bfce' : a.zustand === 'online' ? (fehler || a.fehler ? '#dc2626' : warn ? '#d97706' : '#16a34a') : a.zustand === 'pausiert' ? '#b8bfce' : '#dc2626';
  const vergleich = !a.ausgeschaltet && a.vorhanden !== null && a.gesamt !== null && a.gesamt > 0;
  const komplett = vergleich && a.vorhanden! >= a.gesamt!;
  const Inhalt = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={a.zustand === 'online' && !fehler ? 'punkt' : 'punkt live'} style={{ width: 8, height: 8, background: dot }} />
        <b style={{ fontSize: 15 }}>{a.name}</b>
      </span>
      {vergleich ? (
        <>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
            <span style={{ color: komplett ? 'var(--gruen)' : 'var(--orange)' }}>{zahl(a.vorhanden!)}</span>
            <span className="leise" style={{ fontWeight: 600 }}> / {zahl(a.gesamt!)}</span>
          </span>
          <div className="balken" style={{ height: 5 }} aria-hidden>
            <span className="gx" style={{ width: `${Math.max(2, (a.vorhanden! / a.gesamt!) * 100)}%`, background: komplett ? 'var(--gruen)' : 'var(--orange)' }} />
          </div>
        </>
      ) : (
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{a.ausgeschaltet ? 'Aus' : a.anzahl !== null ? zahl(a.anzahl) : a.zustand === 'online' ? '✓' : '—'}</span>
      )}
      <span className="leise" style={{ fontSize: 12 }}>
        {a.ausgeschaltet ? 'ausgeschaltet' : a.anzahl !== null ? a.anzahlLabel : a.zustand === 'online' ? 'läuft' : a.zustand}
        {a.detail ? ` · ${a.detail}` : ''}
        {a.warteschlange ? ` · ${a.warteschlange} in Warteschlange` : ''}
      </span>
      {!a.ausgeschaltet && a.fehlt.length > 0 && (
        <span style={{ fontSize: 12, color: 'var(--warn)' }} title={a.fehlt.join('\n')}>
          Fehlt: {a.fehlt.slice(0, 3).join(', ')}{a.fehlt.length > 3 ? ` (+${a.fehlt.length - 3})` : ''}
        </span>
      )}
      {a.fehler && <span style={{ fontSize: 12, color: 'var(--fehler)' }}>{a.fehler.slice(0, 90)}</span>}
      {(fehler > 0 || warn > 0) && (
        <span style={{ fontSize: 12, color: fehler ? '#b42318' : '#b45309' }} title={a.warnungen.map((w) => w.text).join('\n')}>
          {a.warnungen[0].text.slice(0, 70)}{a.warnungen.length > 1 ? ` (+${a.warnungen.length - 1})` : ''}
        </span>
      )}
    </>
  );
  return a.url ? (
    <a className="medien-app pop" href={a.url} target="_blank" rel="noreferrer" style={{ animationDelay: `${360 + i * 40}ms` }}>{Inhalt}</a>
  ) : (
    <div className="medien-app pop" style={{ animationDelay: `${360 + i * 40}ms` }}>{Inhalt}</div>
  );
}
