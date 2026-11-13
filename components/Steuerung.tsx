'use client';
import { useState } from 'react';
import type { Zustand, Steuerung as SteuerungTyp } from '@/lib/types';
import { senden } from '@/lib/api';
import { relativ } from '@/lib/format';
import { Icon, Schalter } from './ui';

type Frage = null | 'notbetrieb' | 'neustart' | 'aus';

// nurPi: nur Notbetrieb und Pi neu starten/ausschalten (für Browser und Handy).
export function Steuerung({ z, aktualisieren, nurPi = false }: { z: Zustand; aktualisieren: () => void; nurPi?: boolean }) {
  const s: SteuerungTyp | undefined = z.steuerung;
  const [laedt, setLaedt] = useState<string | null>(null);
  const [frage, setFrage] = useState<Frage>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  if (!s) return null;
  const nb = s.notbetrieb.an;

  async function los(id: string, fn: () => Promise<{ ok?: boolean; fehler?: string[] } | unknown>) {
    setLaedt(id);
    setFehler(null);
    try {
      const r = (await fn()) as { ok?: boolean; fehler?: string[] } | undefined;
      if (r && r.ok === false && r.fehler?.length) setFehler(r.fehler.join(' · '));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(null);
      setFrage(null);
      aktualisieren();
    }
  }

  function zweiStufen(f: Exclude<Frage, null>, ausfuehren: () => void) {
    if (frage !== f) { setFrage(f); return; }
    ausfuehren();
  }

  const gruppen = [...new Set(s.dienste.map((d) => d.gruppe))];

  return (
    <section className={`karte steuerung in${nurPi ? ' nur-pi' : ''}`} style={{ animationDelay: '220ms' }} aria-label="Steuerung">
      <h2 className="karte-titel">{nurPi ? 'Pi' : 'Steuerung'} <small>{nurPi ? 'Notbetrieb, neu starten, ausschalten' : 'wichtige Dienste sind geschützt'}</small></h2>
      {fehler && <div className="fehlerbox" role="alert">{fehler}</div>}
      {meldung && <div className="hinweisbox" role="status">{meldung}</div>}

      <div className="steuerung-raster">
        {/* Notbetrieb */}
        <div className={`notbetrieb${nb ? ' an' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.9 }}>
            <span className={nb ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: nb ? '#fff' : 'var(--orange)' }} />
            Notbetrieb
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{nb ? 'Aktiv' : 'Aus'}</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, opacity: 0.92 }}>
            {nb
              ? `Seit ${s.notbetrieb.seit ? relativ(s.notbetrieb.seit) : 'kurzem'}. Nur Nextcloud, Passwörter, Pi-hole, Syncthing und Tailscale laufen.`
              : 'Stoppt mit einem Tipp Downloads, VPN, Arr-Apps, Jellyfin und Kuma. Spart Strom und Wärme – das Wichtige läuft weiter.'}
          </p>
          <button
            className={`press notbetrieb-knopf${frage === 'notbetrieb' ? ' bestaetigen' : ''}`}
            disabled={laedt !== null}
            onClick={() => zweiStufen('notbetrieb', () => los('notbetrieb', () => senden('/api/notbetrieb', { an: !nb })))}
          >
            {laedt === 'notbetrieb' ? (nb ? 'Starte alles …' : 'Stoppe …') : frage === 'notbetrieb' ? (nb ? 'Wirklich alles starten?' : 'Wirklich Notbetrieb?') : nb ? 'Alles wieder starten' : 'Notbetrieb einschalten'}
          </button>
        </div>

        {/* Einzelne Dienste */}
        {!nurPi && <div>
          <div className="steuerung-dienste">
            {gruppen.map((g) => (
              <div key={g}>
                <div className="leise steuerung-gruppe">{g}</div>
                {s.dienste.filter((d) => d.gruppe === g).map((d) => {
                  const an = d.zustand !== 'aus';
                  const unter =
                    laedt === d.container ? (an ? 'wird ausgeschaltet …' : 'wird gestartet …')
                    : d.zustand === 'an' ? 'läuft'
                    : d.zustand === 'pausiert' ? 'pausiert durch Szene'
                    : d.durch === 'notbetrieb' ? 'aus · Notbetrieb'
                    : d.durch === 'du' ? `aus · von dir${d.seit ? ' ' + relativ(d.seit) : ''}`
                    : 'gestoppt';
                  return (
                    <Schalter
                      key={d.container}
                      an={an}
                      titel={d.name}
                      unter={unter}
                      deaktiviert={laedt !== null}
                      onClick={() => los(d.container, () => senden(`/api/container/${encodeURIComponent(d.container)}`, { an: !an }))}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="leise steuerung-gruppe" style={{ marginTop: 14 }}>Geschützt – immer an</div>
          <div className="geschuetzt">
            {s.geschuetzt.map((g) => (
              <span key={g.name} className="geschuetzt-pille" title={g.grund}>
                <Icon name="schloss" size={13} stroke={2.2} />
                {g.name}
                {g.zustand !== 'an' && <b style={{ color: 'var(--fehler)' }}>· {g.zustand}</b>}
              </span>
            ))}
          </div>
        </div>}

        {/* Pi */}
        <div className="pi-steuerung">
          {!nurPi && <div className="leise steuerung-gruppe">Raspberry Pi</div>}
          <button
            className={`press pi-knopf${frage === 'neustart' ? ' bestaetigen' : ''}`}
            disabled={laedt !== null}
            onClick={() => zweiStufen('neustart', () => los('neustart', async () => { await senden('/api/pi/neustart', { bestaetigt: true }); setMeldung('Pi startet neu – in etwa 2 Minuten ist die Zentrale wieder da.'); }))}
          >
            <Icon name="neustart" size={18} />
            <span>
              <b>{frage === 'neustart' ? 'Ja, jetzt neu starten' : 'Pi neu starten'}</b>
              <small>{frage === 'neustart' ? 'Alle Dienste sind ca. 2 Minuten weg' : 'Kommt von selbst wieder'}</small>
            </span>
          </button>
          <button
            className={`press pi-knopf gefahr${frage === 'aus' ? ' bestaetigen' : ''}`}
            disabled={laedt !== null}
            onClick={() => zweiStufen('aus', () => los('aus', async () => { await senden('/api/pi/ausschalten', { bestaetigt: true }); setMeldung('Pi fährt herunter. Einschalten: zu Hause Netzteil aus- und wieder einstecken.'); }))}
          >
            <Icon name="x" size={18} />
            <span>
              <b>{frage === 'aus' ? 'Ja, wirklich ausschalten' : 'Pi ausschalten'}</b>
              <small>{frage === 'aus' ? 'Von unterwegs NICHT mehr einschaltbar!' : 'Nur für Notfälle'}</small>
            </span>
          </button>
          {frage && (
            <button className="press abbrechen" onClick={() => setFrage(null)}>Abbrechen</button>
          )}
        </div>
      </div>
    </section>
  );
}
