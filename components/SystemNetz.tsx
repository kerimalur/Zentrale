'use client';
// Tab «System»: Pi-Werte und Dienste (System) und alles zum Netz (Netz) unter einem Dach.
import { useEffect, useState } from 'react';
import type { Zustand } from '@/lib/types';
import { System } from './System';
import { Netz } from './Netz';
import { Unterreiter } from './ui';

type Teil = 'system' | 'netz';

export function SystemNetz({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [teil, setTeil] = useState<Teil>('system');
  useEffect(() => {
    try { const t = sessionStorage.getItem('systemnetz-teil'); if (t === 'system' || t === 'netz') setTeil(t); } catch {}
  }, []);
  const waehlen = (t: Teil) => { setTeil(t); try { sessionStorage.setItem('systemnetz-teil', t); } catch {} };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Unterreiter
        label="System und Netz"
        aktiv={teil}
        waehlen={waehlen}
        punkte={[{ id: 'system', text: 'Pi & Dienste' }, { id: 'netz', text: 'Netz' }]}
      />
      {teil === 'system' && <System z={z} aktualisieren={aktualisieren} />}
      {teil === 'netz' && <Netz z={z} />}
    </div>
  );
}
