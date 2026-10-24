'use client';
import { useState } from 'react';
import type { Zustand, Gast } from '@/lib/types';
import { senden, kopieren } from '@/lib/api';
import { ablauf } from '@/lib/format';
import { Icon } from './ui';

const DAUER = [
  { l: '1 Tag', v: 1 },
  { l: '7 Tage', v: 7 },
  { l: '30 Tage', v: 30 },
  { l: 'Immer', v: 0 },
];

interface Neu { id: string; name: string; inviteUrl: string | null; jfName: string | null; jfPasswort: string | null }

export function Gaeste({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jellyfin, setJellyfin] = useState(true);
  const [dauer, setDauer] = useState(7);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState<Neu | null>(null);
  const [pruefen, setPruefen] = useState(false);
  const g = z.gaeste;

  async function einladen(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);
    try {
      const r = await senden<{ gast: Neu }>('/api/gaeste', { name, email, jellyfin, dauerTage: dauer });
      setNeu(r.gast);
      setName('');
      setEmail('');
      aktualisieren();
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaedt(false);
    }
  }

  async function nochmalPruefen() {
    setPruefen(true);
    try { await senden('/api/gaeste/pruefen'); } catch {} finally { setPruefen(false); aktualisieren(); }
  }

  return (
    <div className="gaeste">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <form className="einladen in" onSubmit={einladen} aria-label="Neuen Gast einladen">
          <div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Neuen Gast einladen</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Filme schauen und Werbung blocken</div>
          </div>
          <label className="feld">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Familie" maxLength={40} required /></label>
          <label className="feld">E-Mail des Gasts (sein Google-, Microsoft- oder Apple-Konto)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" required /></label>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Zugriff auf</div>
            <div className="wahl">
              <button type="button" className="press" aria-pressed={jellyfin} onClick={() => setJellyfin(!jellyfin)} disabled={!g.jellyfinBereit} style={{ background: jellyfin ? '#fff' : 'rgba(255,255,255,.16)', color: jellyfin ? 'var(--ink)' : '#fff' }}>
                Jellyfin {jellyfin ? '✓' : ''}
              </button>
              <span style={{ flex: 1, padding: '10px 4px', borderRadius: 14, fontSize: 14, fontWeight: 600, background: '#fff', color: 'var(--ink)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44 }}>Pi-hole · automatisch</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Gültig für</div>
            <div className="wahl">
              {DAUER.map((d) => (
                <button key={d.v} type="button" className="press" aria-pressed={dauer === d.v} onClick={() => setDauer(d.v)} style={{ background: dauer === d.v ? '#fff' : 'rgba(255,255,255,.16)', color: dauer === d.v ? 'var(--ink)' : '#fff' }}>{d.l}</button>
              ))}
            </div>
          </div>
          {fehler && <div className="fehlerbox">{fehler}</div>}
          <button className="press knopf-gross" type="submit" disabled={!g.bereit || laedt}>{laedt ? 'Erstelle …' : 'Einladung erstellen'}</button>
          {!g.bereit && <div style={{ fontSize: 13, opacity: 0.9 }}>Noch gesperrt: {g.grund}</div>}

          {neu && (
            <div className="ergebnis pop">
              <b>Einladung für {neu.name} erstellt</b>
              {neu.inviteUrl ? (
                <>
                  <span>1. Diesen Link dem Gast schicken. Er installiert Tailscale und tritt bei:</span>
                  <Kopier text={neu.inviteUrl} />
                </>
              ) : (
                <span>1. Tailscale hat die Einladung per E-Mail an den Gast geschickt.</span>
              )}
              {neu.jfName && (
                <>
                  <span>2. Jellyfin öffnen und anmelden:</span>
                  <Kopier text={g.jellyfinUrl} />
                  <Kopier text={`Benutzer: ${neu.jfName}  Passwort: ${neu.jfPasswort}`} />
                </>
              )}
              <span className="leise" style={{ fontSize: 12 }}>Pi-hole blockt Werbung automatisch, solange Tailscale beim Gast an ist.</span>
            </div>
          )}
        </form>

        {!g.bereit && g.aclVorschlag && (
          <section className="karte in" aria-label="Zugriffsregeln einrichten">
            <h2 className="karte-titel">Einmalig: Zugriffsregeln einrichten</h2>
            <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 0 }}>
              Ohne diese Regeln könnten Gäste alles in deinem Netz sehen. Öffne <a href="https://login.tailscale.com/admin/acls/file" target="_blank" rel="noreferrer">Tailscale → Access controls</a> und übernimm daraus <b>hosts</b> und <b>grants</b> (den alten <b>acls</b>- bzw. <b>grants</b>-Block ersetzen):
            </p>
            <pre className="code">{g.aclVorschlag}</pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <KopierKnopf text={g.aclVorschlag} label="Regeln kopieren" />
              <button className="press knopf-klein" onClick={nochmalPruefen} disabled={pruefen}>{pruefen ? 'Prüfe …' : 'Nochmal prüfen'}</button>
            </div>
          </section>
        )}

        <section className="karte in" style={{ animationDelay: '120ms', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="So funktioniert's">
          <h2 className="karte-titel">So funktioniert&apos;s</h2>
          {[
            'Du erstellst die Einladung. Der Gast installiert Tailscale und meldet sich mit seiner E-Mail an.',
            'Der Gast sieht nur Jellyfin. Pi-hole blockt bei ihm automatisch Werbung, solange Tailscale an ist.',
            'Läuft der Zugang ab oder entfernst du ihn, werden seine Geräte gelöscht und er ist sofort draussen.',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: '#efe9fd', color: '#6d3fd6', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</span>
              <span>{t}</span>
            </div>
          ))}
        </section>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <section className="karte in" style={{ animationDelay: '80ms', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Aktive Gäste">
          <h2 className="karte-titel">Gäste <small>{g.liste.length} {g.liste.length === 1 ? 'Gast' : 'Gäste'}</small></h2>
          {g.liste.length === 0 && <p className="leise" style={{ fontSize: 14, margin: 0 }}>Noch keine Gäste eingeladen.</p>}
          {g.liste.map((x) => <GastZeile key={x.id} g={x} jfUrl={g.jellyfinUrl} aktualisieren={aktualisieren} />)}
        </section>
        <section className="karte in" style={{ animationDelay: '160ms', display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Für Gäste gesperrt">
          <h2 className="karte-titel">Für Gäste gesperrt</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Nextcloud', 'Vaultwarden', 'Syncthing', 'Uptime Kuma', 'Dashboard', 'SSH', 'deine Geräte'].map((l) => (
              <span key={l} className="gesperrt"><Icon name="schloss" size={14} stroke={2.2} />{l}</span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function GastZeile({ g, jfUrl, aktualisieren }: { g: Gast; jfUrl: string; aktualisieren: () => void }) {
  const [frage, setFrage] = useState(false);
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const a = ablauf(g.bis);

  async function entfernen() {
    if (!frage) { setFrage(true); setTimeout(() => setFrage(false), 4000); return; }
    setLaedt(true);
    try { await senden(`/api/gaeste/${g.id}`, undefined, 'DELETE'); } catch {} finally { setLaedt(false); aktualisieren(); }
  }

  return (
    <div className="gast slide">
      <span className="avatar">{g.name.charAt(0).toUpperCase()}</span>
      <span style={{ flex: 1, minWidth: 160 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{g.name}</span>
        <span className="leise" style={{ display: 'block', fontSize: 12 }}>
          {g.status === 'eingeladen' ? 'Einladung offen' : `${g.geraete} ${g.geraete === 1 ? 'Gerät' : 'Geräte'}`} · {a.text}
        </span>
        <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#e6e0fa', overflow: 'hidden', marginTop: 8 }}>
          <span className="gx" style={{ display: 'block', height: '100%', width: `${a.prozent}%`, background: 'var(--violett)' }} />
        </span>
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <span className="pille" style={g.jellyfin ? { background: '#efe9fd', color: '#6d3fd6', fontWeight: 600 } : { background: 'var(--bg)', color: '#a0a7b8' }}>Jellyfin</span>
        <span className="pille" style={{ background: '#fdf1dc', color: '#b45309', fontWeight: 600 }}>Pi-hole</span>
      </span>
      {(g.inviteUrl || g.jfName) && (
        <button className="press knopf-klein" onClick={() => setOffen(!offen)} aria-expanded={offen}>Zugang</button>
      )}
      <button className="press" onClick={entfernen} disabled={laedt} aria-label={`${g.name} entfernen`} style={{ minWidth: 44, height: 44, borderRadius: 14, background: frage ? '#b42318' : '#fff', color: frage ? '#fff' : '#b42318', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: frage ? '0 12px' : 0, fontWeight: 700, fontSize: 13 }}>
        {frage ? 'Entfernen?' : <Icon name="x" size={18} stroke={2.2} />}
      </button>
      {offen && (
        <div className="ergebnis" style={{ width: '100%' }}>
          {g.inviteUrl && g.status === 'eingeladen' && <><span>Einladungslink:</span><Kopier text={g.inviteUrl} /></>}
          {g.jfName && <><span>Jellyfin:</span><Kopier text={jfUrl} /><Kopier text={`Benutzer: ${g.jfName}  Passwort: ${g.jfPasswort}`} /></>}
        </div>
      )}
    </div>
  );
}

function Kopier({ text }: { text: string }) {
  return (
    <div className="kopierzeile">
      <span>{text}</span>
      <KopierKnopf text={text} label="Kopieren" />
    </div>
  );
}

function KopierKnopf({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="press knopf-klein" onClick={async () => { if (await kopieren(text)) { setOk(true); setTimeout(() => setOk(false), 1500); } }}>
      {ok ? 'Kopiert ✓' : label}
    </button>
  );
}
