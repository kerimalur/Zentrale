'use client';
// Einstellungen: alles, was man in der Zentrale schalten kann, an einem Ort.
import { useState } from 'react';
import type { Zustand } from '@/lib/types';
import { senden } from '@/lib/api';
import { bytes, relativ } from '@/lib/format';
import { Schalter } from './ui';
import { SzenenKarte } from './Uebersicht';
import { Steuerung } from './Steuerung';
import { EinstellungenKarte } from './Konsole';

export function Einstellungen({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  return (
    <div className="einst">
      <SzenenKarte z={z} aktualisieren={aktualisieren} />
      <BackupKarte z={z} aktualisieren={aktualisieren} />
      <EinstellungenKarte z={z} aktualisieren={aktualisieren} />
      <Steuerung z={z} aktualisieren={aktualisieren} />
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
