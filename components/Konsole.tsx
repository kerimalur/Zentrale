'use client';
import { useEffect, useRef, useState } from 'react';
import type { Zustand, Einstellungen } from '@/lib/types';
import { senden } from '@/lib/api';
import { Schalter } from './ui';

const BEFEHLE = [
  { l: 'Container', cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}"' },
  { l: 'Temperatur', cmd: 'vcgencmd measure_temp' },
  { l: 'Speicher', cmd: 'df -h /mnt/daten' },
  { l: 'Pi-hole neu starten', cmd: 'docker restart pihole' },
  { l: 'Updates holen', cmd: 'sudo apt update && sudo apt upgrade' },
];

type Verbindung = 'verbinde' | 'verbunden' | 'getrennt';

export function Konsole({ z }: { z: Zustand }) {
  return (
    <div className="konsole">
      <Terminal />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <section className="zugriff in" style={{ animationDelay: '160ms' }} aria-label="Zugriff">
          <span style={{ fontSize: 13, opacity: 0.85 }}>Zugriff von überall</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{z.hostName}</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>https · Port 8443</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6, lineHeight: 1.4 }}>Nur auf deinen Geräten mit Tailscale erreichbar, zusätzlich mit Login. Nicht öffentlich im Internet.</div>
          </div>
        </section>
        {z.hinweise.length > 0 && (
          <section className="karte in" style={{ animationDelay: '220ms' }} aria-label="Hinweise">
            <h2 className="karte-titel">Hinweise</h2>
            <div className="hinweisbox">
              {z.hinweise.map((h) => <div key={h}>• {h}</div>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Terminal() {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Verbindung>('verbinde');
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let weg = false;
    let aufraeumen = () => {};
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (weg || !box.current) return;
      const term = new XTerm({
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: window.innerWidth < 760 ? 12 : 14,
        lineHeight: 1.25,
        cursorBlink: true,
        theme: { background: '#151a26', foreground: '#e8ebf2', cursor: '#2457f5', selectionBackground: '#2457f555', black: '#151a26', blue: '#6b93ff', green: '#4ade80', red: '#f87171', yellow: '#fbbf24', magenta: '#c084fc', cyan: '#22d3ee', white: '#e8ebf2' },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(box.current);
      fit.fit();
      setStatus('verbinde');
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal`);
      ws.current = sock;
      const groesse = () => {
        try { fit.fit(); } catch {}
        if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ typ: 'groesse', cols: term.cols, rows: term.rows }));
      };
      sock.onopen = groesse;
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string) as { typ: string; d: string };
        if (m.typ === 'daten') term.write(m.d);
        else if (m.typ === 'status') { setStatus(m.d === 'verbunden' ? 'verbunden' : 'getrennt'); if (m.d === 'verbunden') groesse(); }
        else if (m.typ === 'fehler') term.write(`\r\n\x1b[31m${m.d}\x1b[0m\r\n`);
      };
      sock.onclose = () => { setStatus('getrennt'); term.write('\r\n\x1b[90m— Verbindung getrennt —\x1b[0m\r\n'); };
      const d = term.onData((data) => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify({ typ: 'daten', d: data })));
      const ro = new ResizeObserver(groesse);
      ro.observe(box.current);
      term.focus();
      aufraeumen = () => { ro.disconnect(); d.dispose(); sock.close(); term.dispose(); };
    })();
    return () => { weg = true; aufraeumen(); };
  }, [versuch]);

  const befehl = (cmd: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ typ: 'daten', d: cmd + '\r' }));
  };

  return (
    <section className="terminal in" aria-label="SSH-Konsole">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3a4258' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3a4258' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#3a4258' }} />
        <span style={{ marginLeft: 10, fontSize: 13, color: '#9aa3b8' }}>SSH · homelabkerim</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: status === 'verbunden' ? '#86efac' : status === 'verbinde' ? '#fbbf24' : '#f87171' }}>
          <span className="punkt live" style={{ background: 'currentColor' }} />
          {status === 'verbunden' ? 'verbunden' : status === 'verbinde' ? 'verbinde …' : 'getrennt'}
        </span>
        {status === 'getrennt' && <button className="press terminal-knopf" style={{ minHeight: 32, padding: '6px 12px' }} onClick={() => setVersuch((v) => v + 1)}>Neu verbinden</button>}
      </div>
      <div className="terminal-fenster" ref={box} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BEFEHLE.map((b) => (
          <button key={b.l} className="press terminal-knopf" onClick={() => befehl(b.cmd)} disabled={status !== 'verbunden'}>{b.l}</button>
        ))}
      </div>
    </section>
  );
}

export function EinstellungenKarte({ z, aktualisieren }: { z: Zustand; aktualisieren: () => void }) {
  const [e, setE] = useState<Einstellungen>(z.einstellungen);
  const [sshFrage, setSshFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const f = z.faehigkeiten;

  useEffect(() => { setE(z.einstellungen); }, [z.einstellungen]);

  async function setzen(teil: Partial<Einstellungen>) {
    const neu = { ...e, ...teil };
    setE(neu);
    setFehler(null);
    try { await senden('/api/einstellungen', teil); aktualisieren(); } catch (err) { setFehler((err as Error).message); }
  }

  async function ssh() {
    const an = !f.sshNurSchluessel;
    if (an && !sshFrage) { setSshFrage(true); return; }
    setSshFrage(false);
    setFehler(null);
    try { await senden('/api/ssh-nur-schluessel', { an }); aktualisieren(); } catch (err) { setFehler((err as Error).message); }
  }

  return (
    <section className="karte in" style={{ animationDelay: '100ms', display: 'flex', flexDirection: 'column' }} aria-label="Allgemein">
      <h2 className="karte-titel" style={{ marginBottom: 4 }}>Allgemein</h2>
      <Schalter an={e.nachtAuto} onClick={() => setzen({ nachtAuto: !e.nachtAuto })} titel="Nacht-Szene automatisch" unter={`${e.nachtVon} bis ${e.nachtBis}`} />
      {e.nachtAuto && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <label>von <input className="zeitfeld" type="time" value={e.nachtVon} onChange={(x) => x.target.value && setzen({ nachtVon: x.target.value })} /></label>
          <label>bis <input className="zeitfeld" type="time" value={e.nachtBis} onChange={(x) => x.target.value && setzen({ nachtBis: x.target.value })} /></label>
        </div>
      )}
      <Schalter an={e.telegram && f.telegram} deaktiviert={!f.telegram} onClick={() => setzen({ telegram: !e.telegram })} titel="Telegram-Alarme" unter={f.telegram ? 'bei Fehlern und Ausfällen' : 'Bot noch nicht eingerichtet (.env)'} />
      {z.moebel.luefter.vorhanden && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Möbel-Lüfter (Auto)</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>an ab dieser Möbel-Temperatur, nachts erst 5 °C später</span>
          </span>
          <select className="zeitfeld" aria-label="Möbel-Lüfter an ab" value={e.luefterAnAb} onChange={(x) => setzen({ luefterAnAb: Number(x.target.value) })}>
            {[25, 28, 30, 32, 35].map((w) => <option key={w} value={w}>ab {w} °C</option>)}
          </select>
        </div>
      )}
      {f.luefter && <Schalter an={e.luefterAusUnter <= 50 && f.luefter} deaktiviert={!f.luefter} onClick={() => setzen({ luefterAusUnter: e.luefterAusUnter <= 50 ? 55 : 50 })} titel={`Lüfter aus unter ${e.luefterAusUnter} °C`} unter={f.luefter ? 'an: 50 °C · aus: 55 °C (leiser)' : 'Lüfter noch nicht eingerichtet'} />}
      {f.moebel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Möbel-Warnung</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>Meldung, wenn es im Möbel wärmer wird</span>
          </span>
          <select className="zeitfeld" aria-label="Möbel-Warnung ab" value={e.moebelWarnAb} onChange={(x) => setzen({ moebelWarnAb: Number(x.target.value) })}>
            {[35, 40, 45, 50].map((w) => <option key={w} value={w}>ab {w} °C</option>)}
          </select>
        </div>
      )}
      <Schalter an={e.hddSchlaf && f.hddSchlaf} deaktiviert={!f.hddSchlaf} onClick={() => setzen({ hddSchlaf: !e.hddSchlaf })} titel="Backup-HDD schlafen lassen" unter={f.hddSchlaf ? 'nach 20 Min ohne Zugriff' : 'BACKUP_DISK fehlt (.env)'} />
      <Schalter an={!!f.sshNurSchluessel} deaktiviert={f.sshNurSchluessel === null} onClick={ssh} titel="SSH nur mit Schlüssel" unter={f.sshNurSchluessel === null ? 'Status unbekannt' : f.sshNurSchluessel ? 'Passwort-Login ist aus' : 'Passwort-Login ist noch an'} />
      {sshFrage && (
        <div className="hinweisbox" style={{ marginTop: 10 }}>
          Danach kommt nur noch rein, wer einen Schlüssel hat (Windows-PC und dieses Dashboard ja). <b>Hat der Fedora-Laptop schon einen Schlüssel?</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="press knopf-akzent" onClick={ssh}>Ja, ausschalten</button>
            <button className="press knopf-klein" onClick={() => setSshFrage(false)}>Abbrechen</button>
          </div>
        </div>
      )}
      {fehler && <div className="fehlerbox" style={{ marginTop: 10 }}>{fehler}</div>}
    </section>
  );
}
