'use client';
// Reiter «Ports & Zugriff»: welche Türen hat der Pi, wer kommt durch, Weg einer Anfrage.
import { useMemo, useState } from 'react';
import type { Erreichbar, NetzPort, NetzwerkZustand } from '@/lib/netzwerk';
import { Begriff, BegriffPopup, Popup } from './NetzBausteine';

const BIND: Record<NetzPort['bind'], string> = { alle: 'für alle', lokal: 'nur lokal', einzeln: 'eine Adresse' };
const FILTER = [
  { id: 'alle', text: 'Alle' },
  { id: 'aussen', text: 'Erreichbar' },
  { id: 'lokal', text: 'Nur lokal' },
  { id: 'tor', text: 'Eingänge' },
] as const;
type FilterId = (typeof FILTER)[number]['id'];

function Chip({ e, label }: { e: Erreichbar; label: string }) {
  const klasse = e.status === 'ja' ? 'offen' : e.status === 'teil' ? 'teil' : e.status === 'nein' ? 'zu' : 'unbekannt';
  const wort = e.status === 'ja' ? 'offen' : e.status === 'teil' ? 'teils' : e.status === 'nein' ? 'zu' : '?';
  return <span className={`pille nw-erreich ${klasse}`} title={e.text}>{label} {wort}</span>;
}

export function NetzPorts({ d }: { d: NetzwerkZustand }) {
  const [filter, setFilter] = useState<FilterId>('alle');
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<NetzPort | null>(null);

  const liste = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return d.liste
      .filter((p) => {
        if (filter === 'aussen') return p.heimnetz.status !== 'nein' || p.tailnet.status !== 'nein';
        if (filter === 'lokal') return p.bind === 'lokal';
        if (filter === 'tor') return p.rolle === 'tor';
        return true;
      })
      .filter((p) => !s || `${p.port} ${p.name} ${p.zweck} ${p.prozess || ''} ${p.container || ''}`.toLowerCase().includes(s))
      .sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto));
  }, [d.liste, filter, suche]);

  const anzahl = {
    gesamt: d.liste.length,
    lokal: d.liste.filter((p) => p.bind === 'lokal').length,
    heim: d.liste.filter((p) => p.heimnetz.status === 'ja' || p.heimnetz.status === 'teil').length,
    tail: d.liste.filter((p) => p.tailnet.status === 'ja' || p.tailnet.status === 'teil').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in" aria-label="Zusammenfassung">
        <h2 className="karte-titel">Türen am Pi <small><Begriff id="port">Was ist ein Port?</Begriff></small></h2>
        <div className="nw-zahlen">
          <div><b>{anzahl.gesamt}</b><small>lauschen</small></div>
          <div><b>{anzahl.lokal}</b><small>nur lokal</small></div>
          <div><b>{anzahl.heim}</b><small>aus dem Heimnetz</small></div>
          <div><b>{anzahl.tail}</b><small>über Tailscale</small></div>
        </div>
        <p className="leise" style={{ fontSize: 12.5, marginBottom: 0 }}>
          «Offen» und «zu» sind <b>berechnet</b> aus <Begriff id="firewall">Firewall</Begriff>-Regeln und {d.tailnetRegeln.quelle === 'live' ? 'deiner echten' : 'angenommenen'} <Begriff id="acl">Tailscale-Regel</Begriff>
          {d.tailnetRegeln.quelle === 'annahme' && ' (ohne API-Schlüssel kann die Seite sie nicht live lesen)'}. Getestet ist es erst, wenn du es von einem anderen Gerät probierst.
        </p>
      </section>

      <WegAnfrage d={d} />

      <section className="karte in" aria-label="Portliste">
        <div className="nw-filterzeile">
          <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)', flex: 1, minWidth: 260 }}>
            {FILTER.map((f) => <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.text}</button>)}
          </div>
          <input className="nw-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Port oder Name suchen" aria-label="Suchen" />
        </div>
        {liste.length === 0 && <div className="leise" style={{ padding: '12px 0' }}>Keine Ports für diese Auswahl.</div>}
        {liste.map((p) => (
          <button key={p.id} className="zeile press nw-zeile nw-port" onClick={() => setOffen(p)}>
            <span className="nw-portnr">{p.port}<small>{p.proto}</small></span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <b>{p.name}</b>
              <div className="leise" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.zweck}{p.container ? ` · Container ${p.container}` : p.prozess ? ` · ${p.prozess}` : ''}
              </div>
            </span>
            <span className="nw-chips">
              <span className={`pille nw-bind ${p.bind}`}>{BIND[p.bind]}</span>
              <Chip e={p.heimnetz} label="Heim" />
              <Chip e={p.tailnet} label="Tailnet" />
            </span>
          </button>
        ))}
      </section>

      <section className="karte in" aria-label="Firewall-Regeln">
        <h2 className="karte-titel">Firewall des Pi <small><Begriff id="firewall">Was ist das?</Begriff></small></h2>
        {!d.firewall.verfuegbar ? <div className="leise">ufw ist von hier aus nicht lesbar.</div> : (
          <>
            <div className="nw-zahlen">
              <div><b>{d.firewall.aktiv ? 'an' : 'aus'}</b><small>ufw</small></div>
              <div><b>{d.firewall.standardEingang || '?'}</b><small>Standard eingehend</small></div>
              <div><b>{d.firewall.dockerSperre === null ? '?' : d.firewall.dockerSperre ? 'ja' : 'nein'}</b><small>Docker-Sperre fürs LAN</small></div>
            </div>
            {d.firewall.regeln.map((r, i) => (
              <div key={i} className="zeile" style={{ fontSize: 13.5 }}>
                <span className={`pille nw-erreich ${/allow/i.test(r.aktion) ? 'offen' : 'zu'}`}>{r.aktion}</span>
                <b style={{ minWidth: 80 }}>{r.ports}{r.proto ? '/' + r.proto : ''}</b>
                <span className="leise" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>von {r.von}{r.iface ? ` · über ${r.iface}` : ''}{r.kommentar ? ` · ${r.kommentar}` : ''}</span>
              </div>
            ))}
          </>
        )}
        <h2 className="karte-titel" style={{ marginTop: 18 }}>Tailscale-Regel <small><Begriff id="acl">Was ist das?</Begriff></small></h2>
        <div className="leise" style={{ fontSize: 13, marginBottom: 6 }}>{d.tailnetRegeln.quelleText}</div>
        {d.tailnetRegeln.alle && <div className="nw-box nw-merke"><b>Achtung</b><span>Die Regel erlaubt allen Geräten alles. Dann ist jeder Port, auf dem etwas lauscht, im Tailnet erreichbar.</span></div>}
        {d.tailnetRegeln.regeln.map((r, i) => <div key={i} className="zeile" style={{ fontSize: 13.5 }}>{r}</div>)}
      </section>

      {offen && <PortPopup p={offen} d={d} onClose={() => setOffen(null)} />}
    </div>
  );
}

function PortPopup({ p, d, onClose }: { p: NetzPort; d: NetzwerkZustand; onClose: () => void }) {
  const ziel = p.ziel ? d.liste.find((x) => x.port === p.ziel && x.proto === p.proto) : null;
  const tore = d.liste.filter((x) => x.rolle === 'tor' && x.ziel === p.port);
  return (
    <Popup titel={`Port ${p.port}/${p.proto} · ${p.name}`} unter={p.zweck} onClose={onClose}>
      <h4 className="nw-h">Wer lauscht?</h4>
      <p className="nw-text">
        {p.prozess || 'Ein Programm'}{p.container ? <> im Container <b>{p.container}</b></> : null} lauscht auf{' '}
        {p.bind === 'lokal' ? <b>127.0.0.1 (nur lokal)</b> : p.bind === 'alle' ? <b>allen Adressen</b> : <b>{p.ips.join(', ')}</b>}. <Begriff id="bind">Was heisst das?</Begriff>
      </p>
      <h4 className="nw-h">Wer kommt durch?</h4>
      <div className="nw-durch"><Chip e={p.heimnetz} label="Heimnetz" /><span>{p.heimnetz.text}</span></div>
      <div className="nw-durch"><Chip e={p.tailnet} label="Tailnet" /><span>{p.tailnet.text}</span></div>
      <div className="nw-durch"><span className="pille nw-erreich zu">Internet zu</span><span>Der Router leitet nichts weiter (<Begriff id="router">NAT</Begriff>). Von aussen kommt niemand ran.</span></div>
      {p.rolle === 'tor' && ziel && <div className="nw-box nw-bei"><b>Eingang</b><span>Dieser Port ist der HTTPS-Eingang (<Begriff id="proxy">Caddy</Begriff>) für Port {ziel.port} ({ziel.name}). Anfragen hierher gehen intern an den Dienst weiter.</span></div>}
      {p.rolle === 'tor' && !ziel && p.ziel && <div className="nw-box nw-bei"><b>Eingang</b><span>HTTPS-Eingang (<Begriff id="proxy">Caddy</Begriff>) für Port {p.ziel}.</span></div>}
      {tore.length > 0 && <div className="nw-box nw-bei"><b>Eingang davor</b><span>Du erreichst diesen Dienst über {tore.map((t) => t.port).join(', ')} (<Begriff id="https">HTTPS</Begriff>).</span></div>}
      {p.rolle !== 'tor' && p.tailnet.status === 'nein' && p.heimnetz.status === 'nein' && <div className="nw-box nw-bei"><b>Gut so</b><span>Dieser Port ist von keinem anderen Gerät erreichbar. Nur der Pi selbst (z. B. Caddy) spricht damit.</span></div>}
      {p.bind === 'alle' && (p.heimnetz.status !== 'nein' || p.tailnet.status !== 'nein') && p.rolle !== 'tor' && <div className="nw-box nw-merke"><b>Zum Nachdenken</b><span>Dieser Dienst lauscht für alle und ist erreichbar. Wenn er hinter einem Caddy-Eingang liegt, könntest du ihn auf 127.0.0.1 binden, dann gäbe es nur noch den HTTPS-Weg. <Begriff id="docker">Wie geht das mit Docker?</Begriff></span></div>}
    </Popup>
  );
}

// ---------- Weg einer Anfrage ----------
type Quellart = 'tailnet' | 'heim' | 'netz';
type Zielart = 'tor' | 'alt';
interface Stufe { id: string; titel: string; wo: string; begriff: string }
const STUFEN: Stufe[] = [
  { id: 'router', titel: 'Router (NAT)', wo: 'Haustür', begriff: 'router' },
  { id: 'ts', titel: 'Tailnet-Anmeldung', wo: 'Tailscale', begriff: 'tailscale' },
  { id: 'acl', titel: 'Zugriffsregel', wo: 'Tailscale ACL', begriff: 'acl' },
  { id: 'fw', titel: 'Firewall', wo: 'ufw · Docker', begriff: 'firewall' },
  { id: 'caddy', titel: 'Caddy', wo: 'Port 1xxxx · HTTPS', begriff: 'proxy' },
  { id: 'dienst', titel: 'Dienst', wo: '127.0.0.1:8989', begriff: 'bind' },
  { id: 'login', titel: 'Anmeldung', wo: 'Passwort im Dienst', begriff: 'dienst' },
];

function weg(q: Quellart, z: Zielart): { stopp: string | null; text: Record<string, string>; ueberspringen: string[] } {
  const t: Record<string, string> = {};
  let stopp: string | null = null;
  const ueberspringen: string[] = [];
  if (q === 'netz') {
    stopp = 'router';
    t.router = 'Der Router kennt keine Portweiterleitung und weiss nicht, wohin das Paket soll. Es wird verworfen. Von hier an sieht der Pi nichts.';
    return { stopp, text: t, ueberspringen };
  }
  if (q === 'heim') {
    t.router = 'Das Gerät ist schon im Haus, der Router lässt es im WLAN/LAN direkt zum Pi.';
    ueberspringen.push('ts', 'acl');
    t.fw = 'Standard «deny incoming»: Nur Syncthing, SSH aus dem Heimnetz und der Fernseher stehen auf der Liste. Und die Docker-Sperre verwirft neue Verbindungen aus dem LAN an Container-Ports. Dein Zugriff stoppt hier, auch auf den HTTPS-Eingang.';
    return { stopp: 'fw', text: t, ueberspringen };
  }
  t.router = 'Tailscale baut den Tunnel von innen nach aussen auf. Der Router muss nichts freigeben.';
  t.ts = 'Dein Gerät ist im Tailnet angemeldet (Google-Konto + 2FA). Ein Fremder käme hier nicht durch.';
  if (z === 'alt') {
    t.acl = 'Port 8989 steht nicht auf der Liste der erlaubten Ports (22, 443, 8443, 10000–19999 …). Tailscale verwirft das Paket, bevor es den Pi erreicht.';
    return { stopp: 'acl', text: t, ueberspringen };
  }
  t.acl = 'Port 18989 liegt in 10000–19999 und ist für deine Geräte erlaubt.';
  t.fw = 'Pakete aus dem Tailscale-Tunnel winkt die Tailscale-Kette («ts-input») vor ufw durch. Darum ist das hier keine Hürde, sondern ein Grund, warum die Zugriffsregel davor wichtig ist.';
  t.caddy = 'Caddy nimmt die Anfrage per HTTPS an (Zertifikat von Tailscale) und leitet sie intern weiter.';
  t.dienst = 'Sonarr lauscht nur auf 127.0.0.1:8989. Nur Caddy kommt dorthin.';
  t.login = 'Sonarr verlangt Benutzer und Passwort. Die letzte Schicht.';
  return { stopp: null, text: t, ueberspringen };
}

function WegAnfrage({ d }: { d: NetzwerkZustand }) {
  const [q, setQ] = useState<Quellart>('tailnet');
  const [z, setZ] = useState<Zielart>('tor');
  const [sel, setSel] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const w = useMemo(() => weg(q, z), [q, z]);
  const stoppIdx = w.stopp ? STUFEN.findIndex((s) => s.id === w.stopp) : STUFEN.length;
  const aktiv = sel || w.stopp || 'login';
  const hatSonarr = d.liste.some((p) => p.port === 8989);

  return (
    <section className="karte in" aria-label="Weg einer Anfrage">
      <h2 className="karte-titel">Der Weg einer Anfrage <small>Beispiel Sonarr{hatSonarr ? '' : ' (Muster)'}</small></h2>
      <p className="leise" style={{ fontSize: 13, marginTop: 0 }}>Wähle, <b>woher</b> die Anfrage kommt und <b>wohin</b> sie will. Du siehst, an welcher Stelle sie stoppt. Tippe auf eine Stufe für die Erklärung.</p>
      <div className="nw-wahl">
        <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button aria-pressed={q === 'tailnet'} onClick={() => { setQ('tailnet'); setSel(null); }}>Dein Handy (Tailscale)</button>
          <button aria-pressed={q === 'heim'} onClick={() => { setQ('heim'); setSel(null); }}>Gerät im WLAN</button>
          <button aria-pressed={q === 'netz'} onClick={() => { setQ('netz'); setSel(null); }}>Fremder im Internet</button>
        </div>
        <div className="segment" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <button aria-pressed={z === 'tor'} onClick={() => { setZ('tor'); setSel(null); }}>https://…:18989 (Eingang)</button>
          <button aria-pressed={z === 'alt'} onClick={() => { setZ('alt'); setSel(null); }}>…:8989 (direkt)</button>
        </div>
      </div>
      <ol className="nw-weg">
        {STUFEN.map((s, i) => {
          const uebersprungen = w.ueberspringen.includes(s.id);
          const erreicht = i < stoppIdx && !uebersprungen;
          const istStopp = s.id === w.stopp;
          const stand = istStopp ? 'stopp' : uebersprungen ? 'skip' : erreicht ? 'ok' : 'nie';
          return (
            <li key={s.id}>
              <button className={`nw-stufe ${stand}${aktiv === s.id ? ' gewaehlt' : ''}`} onClick={() => setSel(s.id)}>
                <span className="nw-stufe-nr">{istStopp ? '✕' : erreicht ? '✓' : uebersprungen ? '–' : i + 1}</span>
                <span><b>{s.titel}</b><small>{s.wo}</small></span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={`nw-box ${w.stopp ? 'nw-merke' : 'nw-bei'}`} aria-live="polite">
        <b>{w.stopp ? `Stoppt bei «${STUFEN.find((s) => s.id === w.stopp)!.titel}»` : 'Kommt durch'}</b>
        <span>
          {w.text[aktiv] || (STUFEN.findIndex((s) => s.id === aktiv) > stoppIdx ? 'Hierhin kommt die Anfrage gar nicht erst.' : w.ueberspringen.includes(aktiv) ? 'Diese Stufe gilt für diesen Weg nicht.' : '')}{' '}
          <button className="nw-begriff" onClick={() => setPop(STUFEN.find((s) => s.id === aktiv)!.begriff)}>Mehr dazu</button>
        </span>
      </div>
      {pop && <BegriffInline id={pop} onClose={() => setPop(null)} />}
    </section>
  );
}

function BegriffInline({ id, onClose }: { id: string; onClose: () => void }) {
  const [akt, setAkt] = useState(id);
  return <BegriffPopup id={akt} onClose={onClose} onWechsel={setAkt} />;
}
