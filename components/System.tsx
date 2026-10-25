'use client';
import { useState } from 'react';
import { senden } from '@/lib/api';
import type { ContainerUpdate, ContainerUpdates, UpdateArt, Zustand } from '@/lib/types';
import { bytes, komma, laufzeit } from '@/lib/format';
import type { ReactNode } from 'react';
import { Ring, Verlauf } from './ui';

export function System({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const p = z.pi;
  const temp = p?.temp ?? null;
  const ramProzent = p && p.ramTotal ? (p.ramBenutzt / p.ramTotal) * 100 : 0;
  const m = z.moebel;
  const mt = m.temp;
  const mFarbe = mt === null ? '#94a3b8' : mt >= m.warnAb ? '#dc2626' : mt >= m.warnAb - 5 ? '#c2410c' : '#16a34a';
  const mVerlauf = m.verlauf.filter((x): x is number => x !== null);
  const messer: { l: string; v: string; d: number; sub: ReactNode; c: string; extra?: ReactNode }[] = [
    { l: 'CPU', v: p?.cpu === null || p?.cpu === undefined ? '—' : `${p.cpu} %`, d: p?.cpu ?? 0, sub: p?.mhz ? `Takt ${p.mhz >= 1000 ? komma(p.mhz / 1000) + ' GHz' : p.mhz + ' MHz'} · ${p.governor ?? ''}` : '—', c: 'var(--accent)' },
    { l: 'Arbeitsspeicher', v: p ? `${komma(p.ramBenutzt / 1024 ** 3)} GB` : '—', d: ramProzent, sub: p ? `von ${Math.round(p.ramTotal / 1024 ** 3)} GB` : '—', c: '#7e3fd6' },
    { l: 'Pi-Temperatur', v: temp === null ? '—' : `${Math.round(temp)} °C`, d: temp === null ? 0 : (temp / 85) * 100, sub: temp === null ? '—' : temp >= 75 ? 'zu heiss!' : temp >= 60 ? 'warm' : 'im grünen Bereich', c: temp !== null && temp >= 60 ? '#c2410c' : '#0e7490' },
    {
      l: 'Möbel',
      v: mt === null ? '—' : `${komma(mt)} °C`,
      d: mt === null ? 0 : Math.min(100, (mt / 50) * 100),
      sub: !m.vorhanden ? (
        'Temperatursensor nicht gefunden'
      ) : mt === null ? (
        'Sensor liefert gerade keine Werte'
      ) : (
        <>
          {m.min24 !== null && m.max24 !== null ? `24 Std: ${komma(m.min24)} – ${komma(m.max24)} °C` : 'Verlauf wird gesammelt'}
          <br />
          {mt >= m.warnAb ? `über der Warngrenze (${m.warnAb} °C)!` : `Warnung ab ${m.warnAb} °C`}
        </>
      ),
      c: mFarbe,
      extra: (
        <>
          {mVerlauf.length >= 2 && <div style={{ width: '100%', color: mFarbe }}><Verlauf werte={mVerlauf} verzoegerung={300} /></div>}
          <LuefterKnopf z={z} aktualisieren={aktualisieren} />
        </>
      ),
    },
  ];
  const ew = z.energie.verlauf;
  const maxW = Math.max(1, ...ew.map((x) => x ?? 0));

  return (
    <div className="sys">
      {messer.map((ms, i) => (
        <section key={ms.l} className="karte messer in" style={{ animationDelay: `${i * 70}ms` }}>
          <h2 className="karte-titel" style={{ alignSelf: 'flex-start', fontSize: 15 }}>{ms.l}</h2>
          <Ring wert={ms.d} groesse={136} farbe={ms.c} label={`${ms.l} ${ms.v}`}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em' }}>{ms.v}</span>
          </Ring>
          <span className="leise" style={{ fontSize: 12, textAlign: 'center' }}>{ms.sub}</span>
          {ms.extra}
        </section>
      ))}

      <section className="energie in" style={{ animationDelay: '200ms' }} aria-label="Energie">
        <div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Energie · {z.energie.quelle === 'shelly' ? 'Messstecker' : 'geschätzt'}</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.05em' }}>{komma(z.energie.watt)}</span>
            <span style={{ fontSize: 16, opacity: 0.85 }}> Watt</span>
          </div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>≈ {komma(z.energie.chfMonat, 2)} CHF / Monat</div>
        </div>
        <div>
          <div className="saeulen">
            {ew.map((w, i) => (
              <span key={i} className="gy" style={{ animationDelay: `${i * 40}ms`, height: `${w === null ? 3 : Math.max(3, (w / maxW) * 100)}%`, background: i === ew.length - 1 ? '#fff' : 'rgba(255,255,255,.35)' }} />
            ))}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>Letzte 24 Stunden</div>
        </div>
      </section>

      <section className="karte anschluesse in" style={{ animationDelay: '260ms' }} aria-label="Anschlüsse">
        <h2 className="karte-titel">Anschlüsse</h2>
        {z.anschluesse.map((a, i) => (
          <div key={i} className="zeile">
            <span className="port" style={portStil(a.port)}>{a.port}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, minWidth: 0 }}>{a.geraet}</span>
            <span className="leise" style={{ fontSize: 13, textAlign: 'right' }}>{a.info}</span>
            <span className="punkt" style={{ width: 8, height: 8, background: a.ok === false ? '#dc2626' : a.ok ? '#16a34a' : '#b8bfce' }} />
          </div>
        ))}
      </section>

      <section className="karte sysinfo in" style={{ animationDelay: '320ms' }} aria-label="System">
        <h2 className="karte-titel">System</h2>
        {[
          ['Gerät', p?.modell?.replace('Raspberry Pi', 'Raspberry Pi').replace(' Model B Rev', ' · Rev') ?? '—'],
          ['Betriebssystem', p?.os ?? '—'],
          ['Laufzeit', p ? laufzeit(p.uptimeS) : '—'],
          ['Container', p ? `${p.container.laufen} von ${p.container.gesamt} laufen` : '—'],
          ['Last (1/5/15 Min)', p ? p.last.map((x) => komma(x, 2)).join(' · ') : '—'],
          ['Updates', p?.updates === null || p?.updates === undefined ? 'wird geprüft' : p.updates === 0 ? 'alles aktuell' : `${p.updates} verfügbar`],
          ['RAM frei', p ? bytes(p.ramTotal - p.ramBenutzt) : '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="leise" style={{ fontSize: 12 }}>{k}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </section>

      <ContainerUpdatesKarte u={z.containerUpdates} />
    </div>
  );
}

const ART: Record<UpdateArt, { text: string; bg: string; fg: string }> = {
  major: { text: 'Major', bg: '#fdecea', fg: '#b91c1c' },
  minor: { text: 'Minor', bg: '#fdf1dc', fg: '#b45309' },
  patch: { text: 'Patch', bg: '#e3f5ea', fg: '#15803d' },
  prerelease: { text: 'Vorabversion', bg: '#f1e8fd', fg: '#7e3fd6' },
  image: { text: 'Neues Image', bg: '#e8eefe', fg: '#1d4ed8' },
  unbekannt: { text: 'Update', bg: 'var(--bg)', fg: 'var(--ink)' },
};

function befehl(c: ContainerUpdate) {
  if (!c.ordner || !c.dienst) return null;
  return `cd ${c.ordner} && docker compose pull ${c.dienst} && docker compose up -d ${c.dienst}`;
}

function ContainerUpdatesKarte({ u }: { u: ContainerUpdates | undefined }) {
  const [kopiert, setKopiert] = useState<string | null>(null);
  if (!u) return null;
  async function kopieren(name: string, text: string) {
    try { await navigator.clipboard.writeText(text); setKopiert(name); setTimeout(() => setKopiert(null), 2000); } catch { window.prompt('Befehl kopieren:', text); }
  }
  const zeitText = u.zeit ? new Date(u.zeit).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <section className="karte cupdates in" style={{ animationDelay: '380ms' }} aria-label="Container-Updates">
      <h2 className="karte-titel">
        Container-Updates{' '}
        <small>
          {u.bereit ? `${u.liste.length === 0 ? 'alles aktuell' : `${u.liste.length} verfügbar`} · ${u.gesamt} überwacht${zeitText ? ` · Stand ${zeitText}` : ''}` : u.grund}
        </small>
      </h2>
      {u.bereit && u.liste.length === 0 && <div className="leise" style={{ fontSize: 14, padding: '6px 0' }}>Alle Container laufen mit dem neusten Image.</div>}
      {u.liste.map((c) => {
        const a = ART[c.art || 'unbekannt'];
        const b = befehl(c);
        return (
          <div key={c.name} className="zeile" style={{ flexWrap: 'wrap' }}>
            <span className="pille" style={{ background: a.bg, color: a.fg, fontWeight: 600 }}>{a.text}</span>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{c.name}</span>
              <span className="leise" style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>
                {c.image}:{c.tag}
                {c.art !== 'image' && c.von && c.nach ? ` · ${c.von} → ${c.nach}` : c.art === 'image' ? ' · gleicher Tag, neueres Image' : ''}
              </span>
            </span>
            {c.link && <a className="knopf-klein" href={c.link} target="_blank" rel="noreferrer">Änderungen</a>}
            {b && <button className="knopf-klein press" onClick={() => kopieren(c.name, b)} title={b}>{kopiert === c.name ? 'Kopiert ✓' : 'Befehl kopieren'}</button>}
          </div>
        );
      })}
      {u.liste.some((c) => c.art === 'major') && (
        <div className="leise" style={{ fontSize: 12, lineHeight: 1.4, marginTop: 10 }}>
          Major-Updates können Einstellungen ändern – vorher «Änderungen» lesen und ein Backup haben. Nextcloud immer nur eine Hauptversion auf einmal.
        </div>
      )}
      {u.fehler.length > 0 && <div className="leise" style={{ fontSize: 12, marginTop: 10 }}>Nicht prüfbar: {u.fehler.map((f) => f.name).join(', ')}</div>}
      <a className="leise" href={u.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, display: 'inline-block', marginTop: 12 }}>In What&apos;s Up Docker öffnen →</a>
    </section>
  );
}

function LuefterKnopf({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const l = z.moebel.luefter;
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  async function waehle(modus: 'auto' | 'an' | 'aus') {
    if (modus === l.modus) return;
    setLaedt(modus);
    setFehler(null);
    try { await senden('/api/luefter', { modus }); aktualisieren(); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(null); }
  }
  if (!l.vorhanden) return <span className="leise" style={{ fontSize: 12, textAlign: 'center' }}>Lüfter-Relais: {l.fehler || 'nicht erreichbar'}</span>;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className={l.an ? 'punkt live' : 'punkt'} style={{ width: 8, height: 8, background: l.an ? '#16a34a' : '#b8bfce' }} />
        <b>Lüfter {l.an === null ? '…' : l.an ? 'laufen' : 'aus'}</b>
      </div>
      <div className="segment" role="group" aria-label="Möbel-Lüfter">
        {(['auto', 'an', 'aus'] as const).map((m) => (
          <button key={m} className="press" aria-pressed={l.modus === m} disabled={laedt !== null} onClick={() => waehle(m)}>
            {laedt === m ? '…' : m === 'auto' ? 'Auto' : m === 'an' ? 'An' : 'Aus'}
          </button>
        ))}
      </div>
      <span className="leise" style={{ fontSize: 11, lineHeight: 1.35 }}>{l.grund}</span>
      {fehler && <div className="fehlerbox">{fehler}</div>}
    </div>
  );
}

function portStil(port: string) {
  if (port.includes('3.0')) return { background: '#e8eefe', color: '#1d4ed8' };
  if (port === 'LAN') return { background: '#e3f5f3', color: '#0f766e' };
  if (port === 'GPIO') return { background: '#fce7f1', color: '#be185d' };
  if (port === 'USB-C') return { background: '#fdf1dc', color: '#b45309' };
  return { background: 'var(--bg)', color: 'var(--ink)' };
}
