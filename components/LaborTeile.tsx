'use client';
// Gemeinsame Bausteine der Labor-Seiten (Strategien, Kurs-Hypothesen, Fremddaten-Hypothesen).
import { useState } from 'react';
import { kopieren } from '@/lib/api';
import { URTEIL_FARBE, atrText, pText, rText, type LGruppe, type LZeile } from '@/lib/labor';

export function UrteilChip({ urteil }: { urteil: string }) {
  return <span className="lb-chip" style={{ background: URTEIL_FARBE[urteil] || 'var(--muted)', color: '#fff' }}>{urteil}</span>;
}
export function TypChip({ typ }: { typ: string }) {
  return <span className="lb-chip">{typ === 'fremd' ? 'Hypothese · Fremddaten' : typ === 'hypothese' ? 'Hypothese · Kurse' : 'Strategie'}</span>;
}
export function Raster({ zeilen }: { zeilen: LZeile[] }) {
  const zeichen = { ja: '✓', nein: '✗', offen: '–' } as const;
  const farbe = { ja: 'var(--gruen)', nein: 'var(--fehler)', offen: 'var(--muted)' } as const;
  return (
    <div className="lb-raster">
      {zeilen.map((z) => (
        <div key={z.id} className="lb-raster-zeile">
          <span className="lb-zeichen" style={{ color: farbe[z.status] }} aria-label={z.status}>{zeichen[z.status]}</span>
          <div style={{ minWidth: 0 }}><strong>{z.name}</strong><div className="tr-hilfe">{z.text}</div></div>
        </div>
      ))}
    </div>
  );
}

export function Gruppenbalken({ gruppen, einheit }: { gruppen: LGruppe[]; einheit: 'R' | 'ATR' | '%' }) {
  if (!gruppen.length) return null;
  const max = Math.max(...gruppen.map((g) => Math.abs(g.avg ?? 0)), 1e-9);
  return (
    <div className="lb-gruppen">
      {gruppen.map((g) => (
        <div key={g.schluessel} className="lb-gruppe" title={`${g.schluessel}: ${g.n} · Ø ${g.avg}`}>
          <span className="lb-gruppe-name">{g.schluessel}</span>
          <div className="lb-gruppe-spur">
            <span style={{ left: (g.avg ?? 0) >= 0 ? '50%' : `${50 - (Math.abs(g.avg ?? 0) / max) * 50}%`, width: `${(Math.abs(g.avg ?? 0) / max) * 50}%`, background: (g.avg ?? 0) >= 0 ? 'var(--gruen)' : 'var(--fehler)' }} />
          </div>
          <span className="lb-gruppe-wert">{einheit === 'R' ? rText(g.avg) : einheit === '%' ? pText(g.avg) : atrText(g.avg)} <span className="leise">({g.n})</span></span>
        </div>
      ))}
    </div>
  );
}

export function Kachel({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) {
  return <div className="lb-kachel"><span className="leise">{titel}</span><strong>{wert}</strong>{unter && <small className="leise">{unter}</small>}</div>;
}


// Ja/Nein-Frage direkt unter einem Knopf (statt Browser-Dialog)
export function Rueckfrage({ titel, text, ja, gefahr, onJa, onNein }: { titel: string; text?: string; ja: string; gefahr?: boolean; onJa: () => void; onNein: () => void }) {
  return (
    <div className="lb-frage">
      <strong>{titel}</strong>
      {text && <p>{text}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: text ? 0 : 8 }}>
        <button className="knopf-akzent press" style={gefahr ? { background: 'var(--fehler)' } : undefined} onClick={onJa}>{ja}</button>
        <button className="knopf-klein press" onClick={onNein}>Abbrechen</button>
      </div>
    </div>
  );
}

// Kleiner Knopf, der nach dem Klick kurz «Kopiert» zeigt
export function KopierKnopf({ text, label = 'Kopieren', holen }: { text?: string; label?: string; holen?: () => Promise<string> }) {
  const [zustand, setZustand] = useState<'' | 'ok' | 'fehler'>('');
  return (
    <button className="knopf-klein press" onClick={async () => {
      try { const t = text ?? (holen ? await holen() : ''); setZustand((await kopieren(t)) ? 'ok' : 'fehler'); } catch { setZustand('fehler'); }
      setTimeout(() => setZustand(''), 1800);
    }}>{zustand === 'ok' ? 'Kopiert ✓' : zustand === 'fehler' ? 'Fehler' : label}</button>
  );
}
