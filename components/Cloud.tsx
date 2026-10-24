'use client';
// Nextcloud-Übersicht: was gerade hochgeladen wird, wohin, letzte Dateien, Fehler, Platz und Ordner.
import { useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { bytes, komma, relativ, zahl } from '@/lib/format';
import { Icon } from './ui';

const BILD = /\.(jpe?g|png|heic|webp|gif|dng)$/i;
const VIDEO = /\.(mp4|mov|mkv|3gp|webm)$/i;

function dateiFarbe(name: string) {
  if (BILD.test(name)) return { farbe: '#0e7490', bg: '#e0f2f5' };
  if (VIDEO.test(name)) return { farbe: '#7e3fd6', bg: '#efe9fd' };
  if (/\.pdf$/i.test(name)) return { farbe: '#c2410c', bg: '#fdf1dc' };
  return { farbe: 'var(--muted)', bg: 'var(--bg)' };
}

export function Cloud({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const c = z.cloud;
  const [laedt, setLaedt] = useState(false);

  async function neuLaden() {
    setLaedt(true);
    try { await senden('/api/cloud/aktualisieren'); aktualisieren(); } catch {} finally { setLaedt(false); }
  }

  if (!c.bereit) {
    return (
      <section className="karte in" aria-label="Nextcloud">
        <h2 className="karte-titel">Nextcloud</h2>
        <p className="leise" style={{ fontSize: 14 }}>{c.grund || 'Keine Daten'}</p>
        <button className="press knopf-klein" onClick={neuLaden} disabled={laedt} style={{ alignSelf: 'flex-start' }}>{laedt ? 'Lädt …' : 'Erneut versuchen'}</button>
      </section>
    );
  }

  const zehn = c.zehnMin!, stunde = c.stunde!, heute = c.heute!;
  const tempo = zehn.bytes / 600; // Bytes pro Sekunde (letzte 10 Min)
  const laufend = c.laufend || [];
  const ordner = (c.ordner || []).filter((o) => o.bytes > 0 || o.ordner);
  const maxOrdner = Math.max(1, ...ordner.map((o) => o.bytes));
  const belegt = (c.nutzer || []).reduce((a, n) => a + n.belegt, 0);
  const platz = c.platz;
  const fehler = c.fehler || [];

  return (
    <div className="cloud">
      <section className={`cloud-held in ${c.aktiv ? '' : 'ruhig'}`} aria-label="Uploads">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={c.aktiv ? 'punkt live' : 'punkt'} style={{ width: 10, height: 10, background: c.aktiv ? '#fff' : 'rgba(255,255,255,.45)' }} />
          <span style={{ flex: 1, fontSize: 14, opacity: 0.9 }}>Uploads</span>
          <button className="press" onClick={neuLaden} disabled={laedt} style={{ border: 0, background: 'rgba(255,255,255,.16)', color: '#fff', borderRadius: 10, padding: '6px 12px', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {laedt ? 'Lädt …' : 'Aktualisieren'}
          </button>
        </div>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
            {c.aktiv ? 'Upload läuft' : 'Gerade ruhig'}
          </div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>
            {c.aktiv
              ? zehn.anzahl > 0 ? `${zahl(zehn.anzahl)} Dateien in 10 Min · ≈ ${bytes(tempo)}/s` : 'eine grosse Datei wird übertragen'
              : c.letzter ? `Letzter Upload ${relativ(c.letzter)}` : 'Noch keine Uploads erfasst'}
          </div>
        </div>
        <div className="cloud-zahlen">
          <div><b>{zahl(zehn.anzahl)}</b><span>10 Min · {bytes(zehn.bytes)}</span></div>
          <div><b>{zahl(stunde.anzahl)}</b><span>1 Std · {bytes(stunde.bytes)}</span></div>
          <div><b>{zahl(heute.anzahl)}</b><span>heute · {bytes(heute.bytes)}</span></div>
        </div>
        {laufend.map((l, i) => (
          <div key={i} style={{ fontSize: 13, background: 'rgba(255,255,255,.12)', borderRadius: 14, padding: '10px 12px' }}>
            Grosse Datei wird übertragen: <b>{bytes(l.bytes)}</b> angekommen · seit {relativ(l.seit).replace('vor ', '')}
          </div>
        ))}
        <div className="leise" style={{ fontSize: 12 }}>
          Wie viele Dateien am Handy noch warten, sieht nur das Handy: Nextcloud-App → Menü → Uploads.
          {c.haengend ? ` · ${c.haengend} abgebrochene Teil-Uploads (räumt Nextcloud selbst auf)` : ''}
        </div>
      </section>

      <section className="karte in" style={{ animationDelay: '80ms' }} aria-label="Speicherplatz">
        <h2 className="karte-titel">Platz</h2>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em' }}>{bytes(belegt)}</div>
        <div className="leise" style={{ fontSize: 13 }}>in Nextcloud{(c.nutzer || []).length > 1 ? ` · ${(c.nutzer || []).map((n) => `${n.name} ${bytes(n.belegt)}`).join(' · ')}` : ''}</div>
        {platz && (
          <>
            <span className="balken" style={{ display: 'block', height: 10, marginTop: 14 }} aria-hidden>
              <span className="gx" style={{ width: `${Math.max(2, ((platz.gross - platz.frei) / platz.gross) * 100)}%`, background: 'var(--accent)' }} />
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 8 }}>
              <span><b>{bytes(platz.frei)}</b> frei</span>
              <span className="leise">von {bytes(platz.gross)} (EVO)</span>
            </div>
          </>
        )}
      </section>

      <section className="karte in" style={{ animationDelay: '120ms' }} aria-label="Zielordner">
        <h2 className="karte-titel">Wohin (24 Std)</h2>
        {(c.ziele || []).length === 0 && <p className="leise" style={{ fontSize: 13 }}>Keine Uploads in den letzten 24 Std.</p>}
        {(c.ziele || []).map((g, i) => (
          <div key={i} className="cloud-zeile">
            <span className="explorer-typ" style={{ color: 'var(--accent)', background: '#e8eefe' }}><Icon name="ordner" size={16} stroke={2} /></span>
            <span className="cloud-name">
              <span style={{ fontSize: 14, fontWeight: 600 }} title={g.ordner}>{g.ordner === '/' ? 'Hauptordner' : g.ordner}</span>
              <span className="leise" style={{ fontSize: 12 }}>{zahl(g.anzahl)} {g.anzahl === 1 ? 'Datei' : 'Dateien'} · {bytes(g.bytes)}</span>
            </span>
            <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relativ(g.zuletzt)}</span>
          </div>
        ))}
      </section>

      <section className="karte in" style={{ animationDelay: '160ms' }} aria-label="Letzte Uploads">
        <h2 className="karte-titel">Letzte Uploads</h2>
        {(c.neu || []).length === 0 && <p className="leise" style={{ fontSize: 13 }}>Keine Uploads in den letzten 7 Tagen.</p>}
        {(c.neu || []).slice(0, 12).map((d, i) => {
          const f = dateiFarbe(d.name);
          return (
            <div key={i} className="cloud-zeile">
              <span className="explorer-typ" style={{ color: f.farbe, background: f.bg }}><Icon name="datei" size={16} stroke={2} /></span>
              <span className="cloud-name">
                <span style={{ fontSize: 14, fontWeight: 600 }} title={d.name}>{d.name}</span>
                <span className="leise" style={{ fontSize: 12 }} title={d.ordner}>{d.ordner === '/' ? 'Hauptordner' : d.ordner} · {bytes(d.bytes)}</span>
              </span>
              <span className="leise" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relativ(d.zeit)}</span>
            </div>
          );
        })}
      </section>

      <section className="karte in" style={{ animationDelay: '200ms' }} aria-label="Fehler">
        <h2 className="karte-titel">Fehler (24 Std)</h2>
        {fehler.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <span className="explorer-typ" style={{ color: '#15803d', background: '#e6f6ec' }}><Icon name="ok" size={16} stroke={2.4} /></span>
            Keine Fehler gemeldet
          </div>
        ) : (
          fehler.map((f, i) => (
            <div key={i} className="cloud-zeile" style={{ alignItems: 'flex-start' }}>
              <span className="punkt" style={{ width: 8, height: 8, marginTop: 6, background: f.stufe === 'schwer' ? '#b42318' : '#c2410c' }} />
              <span className="cloud-name">
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'normal' }}>{f.text}</span>
                <span className="leise" style={{ fontSize: 12 }}>{f.app} · {relativ(f.zeit)}{f.anzahl > 1 ? ` · ${f.anzahl}×` : ''}</span>
              </span>
            </div>
          ))
        )}
      </section>

      <section className="karte in cloud-breit" style={{ animationDelay: '240ms' }} aria-label="Ordner">
        <h2 className="karte-titel">Ordner{c.haupt ? ` · ${c.haupt}` : ''}</h2>
        {ordner.length === 0 && <p className="leise" style={{ fontSize: 13 }}>Noch keine Ordner.</p>}
        {ordner.slice(0, 20).map((o) => (
          <div key={o.name} className="cloud-zeile">
            <span className="explorer-typ" style={o.ordner ? { color: 'var(--accent)', background: '#e8eefe' } : { color: 'var(--muted)', background: 'var(--bg)' }}>
              <Icon name={o.ordner ? 'ordner' : 'datei'} size={16} stroke={2} />
            </span>
            <span className="cloud-name"><span style={{ fontSize: 14, fontWeight: 600 }} title={o.name}>{o.name}</span></span>
            <span className="balken" style={{ height: 6, width: 120, flexShrink: 0 }} aria-hidden>
              <span className="gx" style={{ width: `${Math.max(2, (o.bytes / maxOrdner) * 100)}%`, background: 'var(--accent)' }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{bytes(o.bytes)}</span>
          </div>
        ))}
        {belegt > 0 && <div className="leise" style={{ fontSize: 12, marginTop: 8 }}>Stand: {relativ(c.zeit)} · Anteil Fotos: {komma(((ordner.find((o) => o.name.toLowerCase() === 'fotos')?.bytes || 0) / belegt) * 100, 0)} %</div>}
      </section>
    </div>
  );
}
