'use client';
// Tab «Speicher»: Laufwerke und Ordner (Speicher) und Nextcloud (Cloud) unter einem Dach.
import { useEffect, useState } from 'react';
import type { Zustand } from '@/lib/types';
import { Speicher } from './Speicher';
import { Cloud } from './Cloud';
import { Unterreiter } from './ui';

type Teil = 'speicher' | 'cloud';

export function SpeicherCloud({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [teil, setTeil] = useState<Teil>('speicher');
  useEffect(() => {
    try { const t = sessionStorage.getItem('speichercloud-teil'); if (t === 'speicher' || t === 'cloud') setTeil(t); } catch {}
  }, []);
  const waehlen = (t: Teil) => { setTeil(t); try { sessionStorage.setItem('speichercloud-teil', t); } catch {} };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Unterreiter
        label="Speicher und Cloud"
        aktiv={teil}
        waehlen={waehlen}
        punkte={[{ id: 'speicher', text: 'Laufwerke' }, { id: 'cloud', text: 'Nextcloud' }]}
      />
      {teil === 'speicher' && <Speicher z={z} />}
      {teil === 'cloud' && <Cloud z={z} aktualisieren={aktualisieren} />}
    </div>
  );
}
