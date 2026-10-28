'use client';
// Schmale Leiste unter dem Kopf: wie weit die Dukascopy-Kursdaten (Stunden und 5 Min, ab 2003) geladen sind.
// Verschwindet, sobald alles da ist. Ein Klick öffnet den Trading-Tab.
import { useEffect, useState } from 'react';
import { holen } from '@/lib/api';
import type { DatenStand } from '@/lib/trading';

const prozent = (da: number, gesamt: number) => (gesamt ? Math.min(100, Math.floor((da / gesamt) * 100)) : 0);
const dauerText = (min: number) => (min < 60 ? `${min} Min` : min < 48 * 60 ? `${Math.floor(min / 60)} Std ${min % 60} Min` : `${Math.round(min / 60 / 24)} Tage`);

export function KursdatenLeiste({ onOeffnen }: { onOeffnen: () => void }) {
  const [d, setD] = useState<DatenStand | null>(null);

  useEffect(() => {
    let aus = false;
    const laden = () => { if (document.visibilityState === 'visible') holen<DatenStand>('/api/kursdaten').then((x) => { if (!aus) setD(x); }).catch(() => {}); };
    laden();
    const t = setInterval(laden, 20_000);
    document.addEventListener('visibilitychange', laden);
    return () => { aus = true; clearInterval(t); document.removeEventListener('visibilitychange', laden); };
  }, []);

  if (!d || !d.an || (d.fertig && d.m5?.fertig)) return null;
  const h1 = prozent(d.da, d.gesamt), m5 = prozent(d.m5?.da ?? 0, d.m5?.gesamt ?? 0);
  const status = d.gesperrtBis
    ? `Pause (${d.fehler ?? 'Fehler'}), neuer Versuch um ${new Date(d.gesperrtBis).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`
    : d.laeuft
      ? `lädt ${d.art === 'm5' ? '5-Min ' : d.art === 'h1' ? 'Stunden ' : ''}${d.paar ?? ''}${d.restMin !== null ? ` · noch ca. ${dauerText(d.restMin)}${d.art === 'h1' ? ' (Stunden)' : ''}` : ''}`
      : 'wartet auf den nächsten Start';

  const balken = (titel: string, p: number, aktiv: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 160px' }}>
      <span style={{ whiteSpace: 'nowrap', fontWeight: aktiv ? 700 : 400 }}>{titel}</span>
      <div style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 3, background: 'rgba(127,127,127,.25)', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: 'var(--gruen)', transition: 'width .6s ease' }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p} %</span>
    </div>
  );

  return (
    <button
      className="press karte"
      onClick={onOeffnen}
      title="Kursdaten für Statistik und Labor – zum Trading-Tab"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 18px', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--ink)', border: 0, width: '100%' }}
    >
      <strong style={{ whiteSpace: 'nowrap' }}>Kursdaten ab 2003</strong>
      {balken('Stunden', h1, d.art === 'h1')}
      {balken('5 Min', m5, d.art === 'm5')}
      <span className="leise" style={{ flex: '1 1 220px' }}>{status}</span>
    </button>
  );
}
