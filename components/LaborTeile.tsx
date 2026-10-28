'use client';
// Gemeinsame Bausteine der Labor-Seiten (Strategien, Kurs-Hypothesen, Fremddaten-Hypothesen).
import { useState } from 'react';
import { kopieren } from '@/lib/api';
import { AMPEL_FARBE, URTEIL_FARBE, atrText, pText, rText, type LFazit, type LGruppe, type LZeile } from '@/lib/labor';

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

// Fazit auf einen Blick: Ampel, ein Satz, 4 Kernzahlen, worauf achten, was würde das Urteil ändern, Handelsregel.
// Alles Weitere (Raster, Jahre, Trades) steht darunter und ist aufklappbar.
export function FazitKarte({ f, offen, onUmschalten }: { f: LFazit; offen: boolean; onUmschalten: () => void }) {
  const farbe = AMPEL_FARBE[f.ampel];
  const guteFarbe = (g: boolean | null) => (g === true ? 'var(--gruen)' : g === false ? 'var(--fehler)' : 'var(--ink)');
  return (
    <section className="karte in lb-fazit" style={{ borderLeft: `6px solid ${farbe}` }}>
      <div className="lb-fazit-kopf">
        <span className="lb-ampel" style={{ background: farbe }} aria-hidden="true" />
        <span className="gs-gross" style={{ fontSize: 30, color: farbe }}>{f.urteil}</span>
        <span className="leise">{f.warum}</span>
      </div>
      <p className="lb-fazit-satz">{f.satz}</p>
      <div className="lb-kacheln lb-fazit-zahlen">
        {f.zahlen.map((z) => (
          <div key={z.titel} className="lb-kachel">
            <span className="leise">{z.titel}</span>
            <strong style={{ color: guteFarbe(z.gut) }}>{z.wert}</strong>
            {z.unter && <small className="leise">{z.unter}</small>}
          </div>
        ))}
      </div>
      <div className="lb-fazit-spalten">
        <div>
          <h3 className="lb-fazit-h">Darauf achten</h3>
          {f.achten.length ? <ul className="lb-fazit-liste">{f.achten.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="leise" style={{ margin: 0, fontSize: 13.5 }}>Keine Auffälligkeiten.</p>}
        </div>
        <div>
          <h3 className="lb-fazit-h">Was würde das Urteil ändern?</h3>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{f.aendern}</p>
          <h3 className="lb-fazit-h" style={{ marginTop: 12 }}>Handelsregel</h3>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{f.regel || <span className="leise">{f.regelHinweis}</span>}</p>
        </div>
      </div>
      <div className="leise" style={{ fontSize: 12.5, marginTop: 12 }}>{f.meta}</div>
      <button type="button" className="knopf-klein press" style={{ marginTop: 10 }} aria-expanded={offen} onClick={onUmschalten}>{offen ? 'Details ausblenden ▴' : 'Alle Details anzeigen ▾'}</button>
    </section>
  );
}

// Eingeklappter Bereich «Erweitert» für Felder mit sinnvollen Standardwerten
export function Erweitert({ titel = 'Erweitert', hilfe, children }: { titel?: string; hilfe?: string; children: React.ReactNode }) {
  return (
    <details className="lb-erweitert">
      <summary>{titel}{hilfe && <small> · {hilfe}</small>}</summary>
      <div className="lb-erweitert-inhalt">{children}</div>
    </details>
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
