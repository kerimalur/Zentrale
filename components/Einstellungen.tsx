'use client';
// Einstellungen: alles, was man in der Zentrale schalten kann, als Liste zum Aufklappen (wie auf dem Pixel).
// Zu sehen ist erst nur die Überschrift mit einer kurzen Zeile; die Details kommen beim Antippen.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Zustand } from '@/lib/types';
import { holen, senden } from '@/lib/api';
import { bytes, relativ } from '@/lib/format';
import { Icon, Schalter, type IconName } from './ui';
import { SzenenKarte } from './Uebersicht';
import { Steuerung } from './Steuerung';
import { Konsole, EinstellungenKarte } from './Konsole';
import { SicherheitKarte } from './Sicherheit';
import { TvKoppelnKarte } from './TvKoppeln';
import { SpotifyKarte } from './SpotifyKarte';
import { Gaeste } from './Gaeste';

const GEOEFFNET = 'zentrale-einst-offen';
const MELDER = ['sicherheit', 'fernseher', 'spotify'] as const;

export function Einstellungen({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [offen, setOffen] = useState<string | null>(null);
  const [stand, setStand] = useState<Record<string, string>>({});

  // Welcher Punkt zuletzt offen war, bleibt beim Tab-Wechsel erhalten.
  useEffect(() => {
    try { setOffen(sessionStorage.getItem(GEOEFFNET)); } catch {}
  }, []);
  const umschalten = useCallback((id: string) => {
    setOffen((alt) => {
      const neu = alt === id ? null : id;
      try { if (neu) sessionStorage.setItem(GEOEFFNET, neu); else sessionStorage.removeItem(GEOEFFNET); } catch {}
      return neu;
    });
  }, []);

  // Stand der drei Punkte, die eigene Daten brauchen – einmal beim Öffnen des Tabs, damit die Zeilen
  // schon vor dem Aufklappen stimmen. Fehler sind egal: dann bleibt die allgemeine Beschreibung stehen.
  useEffect(() => {
    let weg = false;
    const setzen = (id: string, text: string) => { if (!weg) setStand((alt) => (alt[id] === text ? alt : { ...alt, [id]: text })); };
    void holen<{ zweifaktor: { aktiv: boolean } }>('/api/sicherheit')
      .then((d) => setzen('sicherheit', d.zweifaktor.aktiv ? 'Zwei-Faktor aktiv' : 'nur Passwort')).catch(() => {});
    void holen<{ geraete: unknown[] }>('/api/tv/geraete')
      .then((d) => setzen('fernseher', d.geraete.length === 1 ? '1 Fernseher gekoppelt' : `${d.geraete.length} Fernseher gekoppelt`)).catch(() => {});
    void holen<{ eingerichtet: boolean; verbunden: boolean }>('/api/spotify/status')
      .then((d) => setzen('spotify', d.verbunden ? 'verbunden' : d.eingerichtet ? 'nicht verbunden' : 'noch nicht eingerichtet')).catch(() => {});
    return () => { weg = true; };
  }, []);

  // Karten, die ihren Stand ändern, melden ihn danach für die Kopfzeile nach oben.
  const melden = useMemo(() => {
    const m = {} as Record<(typeof MELDER)[number], (text: string) => void>;
    for (const id of MELDER) m[id] = (text: string) => setStand((alt) => (alt[id] === text ? alt : { ...alt, [id]: text }));
    return m;
  }, []);

  const b = z.backup;
  const e = z.einstellungen;
  const nb = z.steuerung?.notbetrieb.an;
  const gaesteAktiv = z.gaeste.liste.filter((g) => g.status === 'aktiv').length;
  const gaesteOffen = z.gaeste.liste.filter((g) => g.status === 'eingeladen').length;

  const punkte: { id: string; titel: string; unter: string; icon: IconName; flach: boolean; inhalt: ReactNode }[] = [
    {
      id: 'szenen', titel: 'Szenen', icon: 'sonne', flach: true,
      unter: `${z.szene.name}${z.szene.auto ? ' · automatisch' : ''}`,
      inhalt: <SzenenKarte z={z} aktualisieren={aktualisieren} />,
    },
    {
      id: 'backup', titel: 'Backup', icon: 'laufwerk', flach: true,
      unter: !b.eingerichtet ? 'noch nicht eingerichtet' : b.laeuft ? 'läuft gerade …' : b.auto ? `automatisch um ${b.zeit}` : 'nur von Hand',
      inhalt: <BackupKarte z={z} aktualisieren={aktualisieren} />,
    },
    {
      id: 'allgemein', titel: 'Allgemein', icon: 'zahnrad', flach: true,
      unter: `Nacht-Szene ${e.nachtAuto ? `${e.nachtVon}–${e.nachtBis}` : 'aus'} · Tages-Check ${e.checkAn ? 'an' : 'aus'}`,
      inhalt: <EinstellungenKarte z={z} aktualisieren={aktualisieren} />,
    },
    {
      id: 'sicherheit', titel: 'Sicherheit', icon: 'schloss', flach: true,
      unter: stand.sicherheit || 'Zwei-Faktor und angemeldete Geräte',
      inhalt: <SicherheitKarte onStand={melden.sicherheit} />,
    },
    {
      id: 'fernseher', titel: 'Fernseher koppeln', icon: 'tv', flach: true,
      unter: stand.fernseher || 'Code vom Fernseher eingeben',
      inhalt: <TvKoppelnKarte onStand={melden.fernseher} />,
    },
    {
      id: 'spotify', titel: 'Spotify', icon: 'musik', flach: true,
      unter: stand.spotify || 'Musik auf der Sonos-Box',
      inhalt: <SpotifyKarte onStand={melden.spotify} />,
    },
    {
      id: 'gaeste', titel: 'Gäste', icon: 'gast', flach: false,
      unter: [gaesteAktiv ? `${gaesteAktiv} aktiv` : '', gaesteOffen ? `${gaesteOffen} eingeladen` : ''].filter(Boolean).join(' · ') || 'niemand eingeladen',
      inhalt: <Gaeste z={z} aktualisieren={aktualisieren} />,
    },
    {
      id: 'konsole', titel: 'Konsole', icon: 'pc', flach: false,
      unter: z.hinweise.length ? `SSH auf dem Pi · ${z.hinweise.length} Hinweis${z.hinweise.length === 1 ? '' : 'e'}` : 'SSH auf dem Pi',
      inhalt: <Konsole z={z} />,
    },
    {
      id: 'steuerung', titel: 'Steuerung', icon: 'blitz', flach: true,
      unter: nb ? 'Notbetrieb an' : 'Dienste, Pi und PC schalten',
      inhalt: <Steuerung z={z} aktualisieren={aktualisieren} />,
    },
  ];

  return (
    <div className="einst">
      {punkte.map((p, i) => {
        const auf = offen === p.id;
        return (
          <section key={p.id} className={`einst-gruppe in${auf ? ' auf' : ''}`} style={{ animationDelay: `${60 + i * 40}ms` }}>
            <h2 style={{ margin: 0 }}>
              <button className="press einst-kopf" aria-expanded={auf} aria-controls={`einst-${p.id}`} onClick={() => umschalten(p.id)}>
                <span className="einst-ico"><Icon name={p.icon} size={20} /></span>
                <span className="einst-text">
                  <b>{p.titel}</b>
                  <span className="einst-sub">{p.unter}</span>
                </span>
                <Icon name="weiter" size={20} className="einst-pfeil" />
              </button>
            </h2>
            {auf && (
              <div id={`einst-${p.id}`} className={`einst-koerper${p.flach ? ' flach' : ''}`}>
                {p.inhalt}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BackupKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [laedt, setLaedt] = useState<null | 'start' | 'auto'>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const b = z.backup;

  async function los(art: 'start' | 'auto') {
    setLaedt(art);
    setFehler(null);
    try {
      if (art === 'start') await senden('/api/backup/start');
      else await senden('/api/einstellungen', { backupAuto: !b.auto });
      aktualisieren();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(null);
    }
  }

  return (
    <section className="karte in" style={{ animationDelay: '100ms', display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Backup">
      <h2 className="karte-titel" style={{ marginBottom: 4 }}>Backup</h2>
      {!b.eingerichtet ? (
        <p className="leise" style={{ fontSize: 14, margin: 0 }}>Noch nicht eingerichtet: <code>BACKUP_ZIEL=/mnt/backup</code> in der <code>.env</code> eintragen.</p>
      ) : (
        <>
          <Schalter
            an={b.auto}
            onClick={() => los('auto')}
            deaktiviert={laedt !== null}
            titel="Automatisches Backup"
            unter={b.auto ? `jede Nacht um ${b.zeit} auf die Backup-HDD` : 'aus – nur von Hand'}
          />
          <div className="zeile" style={{ alignItems: 'flex-start' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Letztes Backup</span>
              <span style={{ display: 'block', fontSize: 12, color: b.letzte && !b.letzte.ok ? 'var(--fehler)' : 'var(--muted)' }}>
                {b.laeuft
                  ? 'läuft gerade …'
                  : b.letzte
                    ? b.letzte.ok
                      ? `${relativ(b.letzte.zeit)} · ${bytes(b.letzte.bytes)} übertragen · ${Math.max(1, Math.round(b.letzte.dauerS / 60))} Min`
                      : `${relativ(b.letzte.zeit)} · Fehler: ${b.letzte.fehler}`
                    : 'noch nie gelaufen'}
              </span>
            </span>
          </div>
          <button className="press knopf-akzent" style={{ marginTop: 10, alignSelf: 'flex-start' }} onClick={() => los('start')} disabled={laedt !== null || b.laeuft}>
            {b.laeuft ? 'Backup läuft …' : laedt === 'start' ? 'Startet …' : 'Backup jetzt starten'}
          </button>
        </>
      )}
      {fehler && <div className="fehlerbox" style={{ marginTop: 10 }}>{fehler}</div>}
    </section>
  );
}
