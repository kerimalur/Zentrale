'use client';
// Reiter «Heimnetz»: alle Geräte im Haus, Ports prüfen, wer beim Pi anklopft, Tailnet.
import { useState } from 'react';
import { senden } from '@/lib/api';
import { relativ } from '@/lib/format';
import type { Besitzer, GeraetArt, HausGeraet, NetzwerkZustand, PortPruefung, Quelle } from '@/lib/netzwerk';
import { Icon, Schalter, type IconName } from './ui';
import { Begriff, Popup } from './NetzBausteine';

const ICON: Record<GeraetArt, IconName> = { router: 'geraet', fernseher: 'tv', lautsprecher: 'lautPlus', nas: 'laufwerk', drucker: 'datei', pc: 'pc', handy: 'handy', pi: 'chip', streaming: 'tv', iot: 'welle', unbekannt: 'info' };
const BESITZER: { id: Besitzer; text: string }[] = [
  { id: 'meins', text: 'Meins' },
  { id: 'familie', text: 'Familie' },
  { id: 'gast', text: 'Gast' },
  { id: 'unbekannt', text: 'Unbekannt' },
];
const BEREICH: Record<Quelle['bereich'], string> = { heimnetz: 'Heimnetz', tailnet: 'Tailscale', internet: 'Internet', docker: 'Docker' };

export function NetzHeim({ d, neuLaden }: { d: NetzwerkZustand; neuLaden: () => Promise<void> }) {
  const [suche, setSuche] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [quelle, setQuelle] = useState<Quelle | null>(null);

  async function suchen() {
    setSuche(true);
    setMeldung(null);
    try {
      const r = await senden<{ neu: number }>('/api/netzwerk/suchen');
      await neuLaden();
      setMeldung(r.neu > 0 ? `${r.neu} neue${r.neu === 1 ? 's' : ''} Gerät${r.neu === 1 ? '' : 'e'} gefunden.` : 'Fertig. Keine neuen Geräte.');
    } catch (e) { setMeldung((e as Error).message); }
    setSuche(false);
  }
  async function wache(an: boolean) {
    try { await senden('/api/netzwerk/wache', { an }); await neuLaden(); } catch (e) { setMeldung((e as Error).message); }
  }

  const geraet = d.geraete.find((g) => (g.mac || g.ip) === auswahl) || null;
  const sortiert = [...d.geraete].sort((a, b) => Number(b.istPi) - Number(a.istPi) || Number(b.istRouter) - Number(a.istRouter) || (a.ip.split('.').map(Number).reduce((x, y) => x * 256 + y, 0) - b.ip.split('.').map(Number).reduce((x, y) => x * 256 + y, 0)));
  const klopfer = d.verbindungen.quellen.filter((q) => q.bereich !== 'docker').slice(0, 12);
  const peers = d.tailnet.peers;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in nw-kopf" aria-label="Heimnetz">
        <div style={{ minWidth: 0 }}>
          <h2 className="karte-titel" style={{ marginBottom: 4 }}>Dein Heimnetz</h2>
          <div className="leise" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {d.heimnetz
              ? <>Netz <b>{d.heimnetz.cidr}</b>{d.heimnetz.gateway ? <> · Router <b>{d.heimnetz.gateway}</b></> : null} · <Begriff id="subnetz">Was ist das?</Begriff></>
              : 'Heimnetz nicht erkannt (der Pi hat keine LAN-Schnittstelle?).'}
            <br />{d.geraete.length} Geräte gesehen · letzte Suche {d.suche.zeit ? relativ(new Date(d.suche.zeit).toISOString()) : '—'}
          </div>
        </div>
        <button className="knopf-akzent press" onClick={suchen} disabled={suche || !d.heimnetz}>{suche ? 'Suche läuft …' : 'Jetzt suchen'}</button>
      </section>
      {meldung && <div className="nw-box nw-bei"><span>{meldung}</span></div>}

      <details className="karte nw-erklaer">
        <summary>So findet die Seite die Geräte <small className="leise">(Klicken zum Aufklappen)</small></summary>
        <ol>
          <li><b>Anstupsen.</b> Der Pi schickt an jede Adresse im Netz ein winziges Paket. Wer existiert, muss dafür per <Begriff id="arp">ARP</Begriff> seine <Begriff id="mac">MAC</Begriff> verraten.</li>
          <li><b>Zuhören.</b> Geräte stellen sich selbst vor (<Begriff id="mdns">mDNS</Begriff>, <Begriff id="ssdp">SSDP/UPnP</Begriff>): «Ich bin ein Drucker», «Ich bin ein NAS».</li>
          <li><b>Zusammensetzen.</b> Aus Hersteller (MAC), Name, Diensten und Modell rät die Seite die Art des Geräts. Sie ist nie ganz sicher, darum steht darunter der Grund.</li>
        </ol>
        <p className="leise" style={{ fontSize: 12.5, margin: 0 }}>Es werden keine Passwörter probiert und nichts verändert. «Ports prüfen» fragt ein einzelnes Gerät nach den üblichen Ports – nur auf Knopfdruck, nur im eigenen Heimnetz.</p>
      </details>

      <div className="nw-geraete">
        {sortiert.length === 0 && <div className="karte leise">Noch nichts gefunden. Tippe auf «Jetzt suchen».</div>}
        {sortiert.map((g, i) => (
          <button key={g.mac || g.ip} className="karte press nw-gkarte in" style={{ animationDelay: `${60 + Math.min(i, 12) * 40}ms` }} onClick={() => setAuswahl(g.mac || g.ip)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="geraet-ico"><Icon name={ICON[g.art]} size={22} stroke={1.9} /></span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {g.neu && <span className="pille nw-neu">neu</span>}
                <span className={`pille nw-bes-${g.besitzer}`}>{BESITZER.find((b) => b.id === g.besitzer)?.text}</span>
              </span>
            </div>
            <div style={{ minWidth: 0, width: '100%' }}>
              <div className="nw-name">{g.anzeigeName || g.herstellerMac || g.artText}</div>
              <div className="leise" style={{ fontSize: 12 }}>{g.ip} · {g.artText}</div>
            </div>
            {g.hinweise[0] && <div className="leise nw-hinweis">{g.hinweise[0]}</div>}
          </button>
        ))}
      </div>

      <section className="karte in" aria-label="Wer klopft an">
        <h2 className="karte-titel">Wer klopft beim Pi an?
          <small><Begriff id="conntrack">Verbindungsverfolgung</Begriff></small>
        </h2>
        <p className="leise" style={{ fontSize: 13, marginTop: 0 }}>
          Der Kernel notiert jede Verbindung zum Pi. Hier siehst du, welche Absender gerade klopfen und ob sie Antworten bekommen. Viele <b>verschiedene</b> Ports und kaum Antworten sind das Muster eines <Begriff id="portscan">Port-Scans</Begriff>.
        </p>
        {!d.verbindungen.verfuegbar && <div className="nw-box nw-merke"><b>Nicht lesbar</b><span>Die Verbindungstabelle (nf_conntrack) ist hier nicht verfügbar. Der Container braucht Zugriff auf den Host (privileged, pid host).</span></div>}
        {d.verbindungen.verfuegbar && klopfer.length === 0 && <div className="leise">Im Moment klopft niemand ausser dem Üblichen an.</div>}
        {klopfer.map((q) => (
          <button key={q.ip} className="zeile press nw-zeile" onClick={() => setQuelle(q)}>
            <span className={`nw-punkt ${q.verdacht ? 'rot' : q.unbeantwortet > 3 ? 'gelb' : 'gruen'}`} aria-hidden />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <b>{q.name || q.ip}</b> <span className="leise" style={{ fontSize: 12 }}>{q.name ? q.ip + ' · ' : ''}{BEREICH[q.bereich]}</span>
            </span>
            <span className="leise" style={{ fontSize: 12 }}>{q.verbindungen} Verb. · {q.verschiedenePorts} Ports · {q.unbeantwortet} unbeantwortet</span>
            {q.verdacht && <span className="pille nw-scan">Scan?</span>}
          </button>
        ))}
        <div style={{ marginTop: 12 }}>
          <Schalter an={d.wache} onClick={() => wache(!d.wache)} titel="Wache: bei Scan melden" unter="Prüft alle 30 Sekunden. Bei einem Scan aus dem Heimnetz kommt eine Meldung (und Telegram). Neue Geräte melden sich leise im Protokoll." />
        </div>
      </section>

      <section className="karte in" aria-label="Tailnet">
        <h2 className="karte-titel">Dein Tailnet <small><Begriff id="tailscale">Was ist das?</Begriff></small></h2>
        <p className="leise" style={{ fontSize: 13, marginTop: 0 }}>Nur diese Geräte sind angemeldet und können den Pi über Tailscale erreichen. Alle anderen sehen ihn nicht.</p>
        {!d.tailnet.verfuegbar && <div className="leise">Tailscale nicht erreichbar.</div>}
        {peers.map((p) => (
          <div key={p.ip || p.name} className="zeile" style={{ fontSize: 14 }}>
            <span className={`nw-punkt ${p.online ? 'gruen' : 'grau'}`} aria-hidden />
            <span style={{ flex: 1, minWidth: 0 }}><b>{p.name}</b>{p.selbst ? ' (dieser Pi)' : ''}{p.istGast ? ' · Gast' : ''}<div className="leise" style={{ fontSize: 12 }}>{p.ip} · {p.os || '—'} · {p.besitzer || '—'}</div></span>
            <span className="leise" style={{ fontSize: 12 }}>{p.online ? 'online' : p.zuletzt ? `zuletzt ${relativ(p.zuletzt)}` : 'offline'}</span>
          </div>
        ))}
      </section>

      {geraet && <GeraetPopup g={geraet} onClose={() => setAuswahl(null)} neuLaden={neuLaden} />}
      {quelle && <QuellePopup q={quelle} onClose={() => setQuelle(null)} />}
    </div>
  );
}

function Zeile({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="zeile" style={{ justifyContent: 'space-between', fontSize: 14, alignItems: 'flex-start' }}><span className="leise">{k}</span><span style={{ fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span></div>;
}

function GeraetPopup({ g, onClose, neuLaden }: { g: HausGeraet; onClose: () => void; neuLaden: () => Promise<void> }) {
  const [name, setName] = useState(g.eigenerName || '');
  const [besitzer, setBesitzer] = useState<Besitzer>(g.besitzer);
  const [pruefung, setPruefung] = useState<PortPruefung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  async function speichern() {
    if (!g.mac) return;
    try { await senden('/api/netzwerk/geraet', { mac: g.mac, name: name.trim(), besitzer }); await neuLaden(); setGespeichert(true); setTimeout(() => setGespeichert(false), 1800); }
    catch (e) { setFehler((e as Error).message); }
  }
  async function pruefen() {
    setLaeuft(true); setFehler(null);
    try { setPruefung(await senden<PortPruefung>('/api/netzwerk/ports', { ip: g.ip })); }
    catch (e) { setFehler((e as Error).message); }
    setLaeuft(false);
  }
  const fremd = g.besitzer !== 'meins' && !g.istPi && !g.istPc;

  return (
    <Popup titel={g.anzeigeName || g.herstellerMac || g.artText} unter={`${g.artText} · ${g.ip}`} onClose={onClose} breit>
      <div className="nw-spalten">
        <div>
          <h4 className="nw-h">Was die Seite weiss</h4>
          <Zeile k="IP-Adresse" v={<Begriff id="ip">{g.ip}</Begriff>} />
          <Zeile k="MAC" v={g.mac ? <Begriff id="mac">{g.mac}</Begriff> : '—'} />
          <Zeile k="Hersteller (MAC)" v={g.herstellerMac || (g.zufaelligeMac ? 'zufällige MAC – Handy/Notebook?' : 'unbekannt')} />
          {g.modell && <Zeile k="Modell" v={g.modell} />}
          {g.hersteller && <Zeile k="Hersteller (UPnP)" v={g.hersteller} />}
          {g.hostname && <Zeile k="Hostname" v={g.hostname} />}
          {g.dns && <Zeile k="DNS-Name" v={g.dns} />}
          {g.dienste.length > 0 && <Zeile k="Dienste (mDNS)" v={g.dienste.join(', ')} />}
          {g.upnpServer && <Zeile k="UPnP-Server" v={g.upnpServer} />}
          {g.erstmals && <Zeile k="Zuerst gesehen" v={relativ(new Date(g.erstmals).toISOString())} />}

          <h4 className="nw-h">Warum diese Einschätzung?</h4>
          <ul className="nw-liste">
            {g.hinweise.length === 0 && <li className="leise">Keine Hinweise – das Gerät verrät nichts über sich.</li>}
            {g.hinweise.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
          <div className="leise" style={{ fontSize: 12.5 }}>Mehr dazu: <Begriff id="arp">ARP</Begriff> · <Begriff id="mdns">mDNS</Begriff> · <Begriff id="ssdp">SSDP</Begriff>{g.art === 'nas' && <> · <Begriff id="nas">NAS</Begriff></>}</div>
        </div>

        <div>
          <h4 className="nw-h">Zuordnen</h4>
          <label className="nw-feld">Eigener Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. NAS von Papa" maxLength={40} disabled={!g.mac} />
          </label>
          <div className="nw-feld">Gehört
            <div className="segment" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {BESITZER.map((b) => <button key={b.id} aria-pressed={besitzer === b.id} onClick={() => setBesitzer(b.id)} disabled={!g.mac}>{b.text}</button>)}
            </div>
          </div>
          <button className="knopf-klein press" onClick={speichern} disabled={!g.mac}>{gespeichert ? 'Gespeichert ✓' : 'Speichern'}</button>
          {!g.mac && <div className="leise" style={{ fontSize: 12 }}>Ohne MAC (dieses Gerät selbst) nicht änderbar.</div>}

          <h4 className="nw-h">Ports prüfen</h4>
          <p className="leise" style={{ fontSize: 13, margin: '0 0 8px' }}>
            Klopft kurz an die {pruefung?.geprueft || 'gängigen'} üblichen <Begriff id="port">Ports</Begriff> dieses einen Geräts und zeigt, wo jemand antwortet. Nur eigenes Heimnetz, mit Wartezeit zwischen zwei Prüfungen.
          </p>
          {fremd && <div className="nw-box nw-merke"><b>Kurz überlegen</b><span>Prüfe nur Geräte, die dir gehören oder bei denen du die Erlaubnis hast (z. B. das NAS von Papa, wenn er einverstanden ist). Ein Port-Check ist harmlos, aber wer ihn bemerkt, könnte ihn als Scan deuten.</span></div>}
          <button className="knopf-akzent press" onClick={pruefen} disabled={laeuft}>{laeuft ? 'Prüfe …' : 'Ports prüfen'}</button>
          {fehler && <div className="fehlerbox" style={{ marginTop: 8 }}>{fehler}</div>}
          {pruefung && (
            <div style={{ marginTop: 12 }}>
              {pruefung.vermutung && <div className="nw-box nw-bei"><b>Vermutung</b><span>{pruefung.vermutung}</span></div>}
              {pruefung.offen.length === 0 && <div className="leise">Von {pruefung.geprueft} geprüften Ports antwortet keiner. Das Gerät ist von hier aus «zu».</div>}
              {pruefung.offen.map((o) => (
                <div key={o.port} className="zeile" style={{ fontSize: 14 }}>
                  <b style={{ width: 54 }}>{o.port}</b>
                  <span style={{ flex: 1 }}>{o.name}<div className="leise" style={{ fontSize: 12 }}>{o.zweck}</div></span>
                </div>
              ))}
              {pruefung.warnungen.map((w, i) => <div key={i} className="nw-box nw-merke"><b>Achtung</b><span>{w}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </Popup>
  );
}

function QuellePopup({ q, onClose }: { q: Quelle; onClose: () => void }) {
  return (
    <Popup titel={q.name || q.ip} unter={`${BEREICH[q.bereich]} · ${q.ip}`} onClose={onClose}>
      <Zeile k="Verbindungen" v={q.verbindungen} />
      <Zeile k="davon aktiv" v={q.aktiv} />
      <Zeile k="Unbeantwortet" v={q.unbeantwortet} />
      <Zeile k="Verschiedene Ports" v={q.verschiedenePorts} />
      {q.verdacht
        ? <div className="nw-box nw-merke"><b>Sieht nach einem Scan aus</b><span>Dieser Absender hat viele verschiedene Ports abgeklopft, und fast alle blieben unbeantwortet. Geräte im eigenen Haus tun das selten. Prüfe, ob du gerade einen Netzwerk-Scanner laufen hast (z. B. ein Handy-App «Fing»).</span></div>
        : <div className="nw-box nw-bei"><b>Unauffällig</b><span>Wenige verschiedene Ports oder fast alles beantwortet – so sieht normaler Verkehr aus.</span></div>}
      <h4 className="nw-h">Angeklopfte Ports</h4>
      {q.ports.slice(0, 15).map((p) => (
        <div key={p.proto + p.port} className="zeile" style={{ fontSize: 14 }}>
          <b style={{ width: 70 }}>{p.port}/{p.proto}</b>
          <span className="leise" style={{ flex: 1 }}>{p.n}× · {p.unbeantwortet} unbeantwortet</span>
        </div>
      ))}
      <p className="leise" style={{ fontSize: 12.5 }}>Mehr dazu: <Begriff id="portscan">Port-Scan</Begriff> · <Begriff id="conntrack">Verbindungsverfolgung</Begriff> · <Begriff id="firewall">Firewall</Begriff></p>
    </Popup>
  );
}
