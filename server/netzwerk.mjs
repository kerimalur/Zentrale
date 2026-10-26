// Seite «Netzwerk»: welche Ports auf dem Pi lauschen, wer sie erreichen kann (Heimnetz / Tailscale),
// wer gerade beim Pi anklopft (Verbindungsverfolgung) und welche Geräte im Heimnetz sind.
import fs from 'node:fs';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { aufHost, lesen, socketAnfrage } from './util.mjs';
import { tsStatus, aclLesen } from './collect/tailscale.mjs';
import { ereignis } from './ereignisse.mjs';
import { schnittstellen, heimnetz, imNetz, geraeteSuchen, portsPruefen } from './netzentdecken.mjs';

const DOCKER_SOCK = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

// ---------- Wissen über bekannte Ports (Name, wofür) ----------
export const PORT_WISSEN = {
  22: ['SSH', 'Fernzugriff auf die Kommandozeile des Pi (nur mit Schlüssel)'],
  53: ['DNS (Pi-hole)', 'Übersetzt Namen in Adressen und blockt Werbung/Tracker'],
  443: ['Vaultwarden (HTTPS)', 'Passwort-Tresor, über Caddy mit Zertifikat'],
  1900: ['UPnP/SSDP', 'Geräte-Erkennung im Heimnetz (Jellyfin für den Fernseher)'],
  2019: ['Caddy-Verwaltung', 'Interne Steuerung des Caddy-Servers, nur lokal'],
  2586: ['ntfy', 'Push-Nachrichten aufs Handy'],
  3001: ['Uptime Kuma', 'Überwacht, ob deine Dienste erreichbar sind'],
  3010: ['What\'s Up Docker', 'Meldet neue Versionen deiner Container'],
  3020: ['Grafana', 'Diagramme für die Garmin-Daten'],
  3030: ['Zentrale (intern)', 'Dein Dashboard, nur lokal – von aussen kommt man über Caddy (8443)'],
  5055: ['Seerr', 'Filme und Serien wünschen'],
  5353: ['mDNS', 'Geräte-Namen im Heimnetz (Bonjour/Avahi)'],
  6767: ['Bazarr', 'Untertitel für Filme und Serien'],
  7878: ['Radarr', 'Filme verwalten und laden'],
  8053: ['Pi-hole (Web)', 'Oberfläche des Werbeblockers'],
  8080: ['Nextcloud', 'Deine eigene Cloud (Dateien, Fotos)'],
  8085: ['qBittorrent', 'Download-Programm (läuft hinter dem VPN)'],
  8086: ['InfluxDB', 'Datenbank für Garmin-Werte, nur lokal'],
  8095: ['Scrutiny', 'Zustand der Festplatten (SMART)'],
  8096: ['Jellyfin', 'Mediaserver für Filme und Musik'],
  8222: ['Vaultwarden', 'Passwort-Tresor (intern, davor sitzt Caddy)'],
  8384: ['Syncthing (Web)', 'Oberfläche für die Datei-Synchronisation'],
  8443: ['Zentrale (HTTPS)', 'Dein Dashboard, über Caddy mit Zertifikat'],
  8686: ['Lidarr', 'Musik verwalten und laden'],
  8989: ['Sonarr', 'Serien verwalten und laden'],
  9696: ['Prowlarr', 'Suchquellen (Indexer) für Radarr, Sonarr & Co.'],
  21027: ['Syncthing (Erkennung)', 'Syncthing findet Geräte im Heimnetz'],
  22000: ['Syncthing (Sync)', 'Hier laufen die synchronisierten Dateien durch'],
  41641: ['Tailscale', 'Direkte, verschlüsselte Verbindungen zwischen deinen Geräten'],
  8191: ['FlareSolverr', 'Hilfsdienst für Prowlarr'],
};

const TAILNET_STANDARD = 'tcp:22,tcp:443,tcp:8443,tcp:10000-19999,tcp:53,udp:53,tcp:22000,udp:22000,udp:21027,tcp:21118';

// ---------- Hilfen ----------
function hexIp(h) {
  h = h.toLowerCase();
  if (h.length === 8) return h.match(/../g).reverse().map((x) => parseInt(x, 16)).join('.');
  const bytes = [];
  for (let i = 0; i < 32; i += 8) bytes.push(...h.slice(i, i + 8).match(/../g).reverse());
  if (bytes.every((x) => x === '00')) return '::';
  if (bytes.slice(0, 15).every((x) => x === '00') && bytes[15] === '01') return '::1';
  if (bytes.slice(0, 10).every((x) => x === '00') && bytes[10] === 'ff' && bytes[11] === 'ff') return bytes.slice(12).map((x) => parseInt(x, 16)).join('.');
  const gr = [];
  for (let i = 0; i < 16; i += 2) gr.push(bytes[i] + bytes[i + 1]);
  return gr.map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}
export { hexIp };

const bindArt = (ip) => (ip === '::' || ip === '0.0.0.0' ? 'alle' : ip === '::1' || ip.startsWith('127.') ? 'lokal' : 'einzeln');

// ---------- Lauschende Ports (aus /proc/net, dem Pi selbst) ----------
export function lauscherLesen() {
  const roh = [];
  for (const [datei, proto] of [['tcp', 'tcp'], ['tcp6', 'tcp'], ['udp', 'udp'], ['udp6', 'udp']]) {
    const text = lesen('/proc/net/' + datei, '');
    for (const zeile of text.split('\n').slice(1)) {
      const t = zeile.trim().split(/\s+/);
      if (t.length < 10) continue;
      const [adr, port] = t[1].split(':');
      if (proto === 'tcp' && t[3] !== '0A') continue; // 0A = lauscht
      if (proto === 'udp' && t[3] !== '07') continue; // 07 = gebunden
      roh.push({ proto, ip: hexIp(adr), port: parseInt(port, 16), inode: t[9] });
    }
  }
  return roh;
}

function inodesZuPids(inodes) {
  const karte = new Map();
  let pids;
  try { pids = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)); } catch { return karte; }
  for (const pid of pids) {
    let fds;
    try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let l;
      try { l = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      const m = l.match(/^socket:\[(\d+)\]$/);
      if (m && inodes.has(m[1]) && !karte.has(m[1])) karte.set(m[1], Number(pid));
    }
  }
  return karte;
}

async function dockerListe() {
  try {
    const r = await socketAnfrage(DOCKER_SOCK, { path: '/containers/json' });
    return Array.isArray(r.json) ? r.json : [];
  } catch { return []; }
}

// ---------- Firewall (ufw) ----------
export function ufwParsen(text) {
  const regeln = [];
  const standardEingang = (text.match(/Default:\s*(\w+)\s*\(incoming\)/) || [])[1] || null;
  const aktiv = /Status:\s*active/i.test(text);
  for (const roh of text.split('\n')) {
    if (/\(v6\)/.test(roh)) continue;
    const m = roh.match(/^(?:\[\s*\d+\]\s*)?(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT|FWD))?\s+(\S.*?)(?:\s+#\s*(.*))?$/);
    if (!m || /^(To|--)/.test(m[1].trim())) continue;
    const richtung = m[3] || 'IN';
    if (richtung !== 'IN') continue;
    let [, nach, aktion, , von, kommentar] = m;
    let iface = null;
    const on = nach.match(/^(.+?)\s+on\s+(\S+)$/);
    if (on) { nach = on[1]; iface = on[2]; }
    // «Anywhere on eth0» im From-Teil ignorieren (Schnittstelle der Quelle)
    von = von.replace(/\s+on\s+\S+$/, '');
    let proto = null;
    const pm = nach.match(/^(.*)\/(tcp|udp)$/);
    if (pm) { nach = pm[1]; proto = pm[2]; }
    let vonProto = null;
    const vm = von.match(/^(.*)\/(tcp|udp)$/);
    if (vm) { von = vm[1]; vonProto = vm[2]; }
    const bereiche = nach === 'Anywhere' ? [[1, 65535]] : nach.split(',').map((x) => { const [a, b] = x.split(':').map(Number); return [a, b ?? a]; }).filter((x) => Number.isFinite(x[0]));
    regeln.push({ aktion, bereiche, proto: proto || vonProto, iface, von: von.trim(), kommentar: kommentar || '' });
  }
  return { aktiv, standardEingang, regeln };
}

function ufwPasst(r, port, proto, iface) {
  if (r.proto && r.proto !== proto) return false;
  if (r.iface && r.iface !== iface) return false;
  return r.bereiche.some(([a, b]) => port >= a && port <= b);
}

let fwCache = { t: 0, wert: null };
async function firewall() {
  if (fwCache.wert && Date.now() - fwCache.t < 20_000) return fwCache.wert;
  const [u, d] = await Promise.all([aufHost('ufw', ['status', 'verbose'], { timeout: 8000 }), aufHost('iptables', ['-S', 'DOCKER-USER'], { timeout: 8000 })]);
  const ufw = u.ok ? ufwParsen(u.stdout) : null;
  const dockerSperre = d.ok ? /-i eth0 .*-j DROP/.test(d.stdout) || /-A DOCKER-USER -i eth0 .*DROP/.test(d.stdout) : null;
  fwCache = { t: Date.now(), wert: { verfuegbar: !!ufw, ufw, dockerSperre } };
  return fwCache.wert;
}

function heimnetzStatus(l, fw, lanName) {
  if (l.bind === 'lokal') return { status: 'nein', text: 'Nur der Pi selbst: Der Dienst hört nur auf 127.0.0.1.' };
  if (l.bind === 'einzeln' && l.ips.every((ip) => ip.startsWith('100.'))) return { status: 'nein', text: 'Der Dienst hört nur auf der Tailscale-Adresse, nicht im Heimnetz.' };
  if (!fw.verfuegbar || !fw.ufw?.aktiv) return { status: 'unbekannt', text: 'Firewall-Regeln konnten nicht gelesen werden.' };
  const passend = fw.ufw.regeln.filter((r) => r.aktion === 'ALLOW' && ufwPasst(r, l.port, l.proto, lanName));
  const alle = passend.some((r) => r.von === 'Anywhere');
  const einzelne = [...new Set(passend.filter((r) => r.von !== 'Anywhere').map((r) => r.von))];
  const dockerGesperrt = l.prozess === 'docker-proxy' && fw.dockerSperre;
  if (alle && !dockerGesperrt) return { status: 'ja', text: 'Die Firewall lässt Verbindungen aus dem Heimnetz zu.' };
  if (alle && dockerGesperrt) return { status: 'nein', text: 'Gesperrt: eine Docker-Regel verwirft Verbindungen aus dem Heimnetz.' };
  if (einzelne.length) return { status: 'teil', text: `Nur bestimmte Geräte dürfen: ${einzelne.join(', ')}.` };
  return { status: 'nein', text: 'Gesperrt: Die Firewall verwirft neue Verbindungen aus dem Heimnetz (Standard: alles zu).' };
}

// ---------- Tailscale-Zugriffsregeln ----------
function ipEintrag(s) {
  s = String(s).trim().toLowerCase();
  if (s === '*') return { alle: true };
  const m = s.match(/^(?:(tcp|udp|icmp)(?::))?(\*|\d+(?:-\d+)?)$/);
  if (!m) return null;
  const proto = m[1] || null;
  if (proto === 'icmp') return null;
  if (m[2] === '*') return { proto, von: 1, bis: 65535 };
  const [a, b] = m[2].split('-').map(Number);
  return { proto, von: a, bis: b ?? a };
}

export function aclRegeln(acl) {
  const regeln = [];
  let alle = false;
  for (const g of acl?.grants || []) {
    const srcOk = (g.src || []).some((s) => s === '*' || s === 'autogroup:member' || s === 'autogroup:owner' || s === 'autogroup:admin' || String(s).includes('@'));
    const dstOk = (g.dst || []).some((d) => d === '*' || d === 'autogroup:self' || /^100\./.test(d));
    if (!srcOk || !dstOk) continue;
    for (const ip of g.ip || []) {
      const e = ipEintrag(ip);
      if (!e) continue;
      if (e.alle) alle = true; else regeln.push(e);
    }
  }
  for (const r of acl?.acls || []) {
    if ((r.dst || []).some((d) => d === '*:*')) alle = true;
  }
  return { alle, regeln };
}

let aclCache = { t: 0, wert: null };
async function tailnetRegeln() {
  if (aclCache.wert && Date.now() - aclCache.t < 120_000) return aclCache.wert;
  let wert;
  if (config.tailscale.apiKey) {
    try {
      const r = aclRegeln(await aclLesen());
      wert = { ...r, quelle: 'live', quelleText: 'Live aus deinen Tailscale-Zugriffsregeln gelesen' };
    } catch (e) { wert = null; }
  }
  if (!wert) {
    const r = aclRegeln({ grants: [{ src: ['autogroup:member'], dst: ['autogroup:self'], ip: (process.env.TAILNET_PORTS || TAILNET_STANDARD).split(',') }] });
    wert = { ...r, quelle: 'annahme', quelleText: 'Angenommene Regeln (kein TS_API_KEY): Stand 26.10.2026' };
  }
  aclCache = { t: Date.now(), wert };
  return wert;
}

function tailnetStatus(l, acl) {
  if (l.bind === 'lokal') return { status: 'nein', text: 'Nur der Pi selbst: Der Dienst hört nur auf 127.0.0.1.' };
  if (acl.alle) return { status: 'ja', text: 'Tailscale erlaubt alle Ports zwischen deinen Geräten.' };
  const erlaubt = acl.regeln.some((r) => (!r.proto || r.proto === l.proto) && l.port >= r.von && l.port <= r.bis);
  return erlaubt
    ? { status: 'ja', text: 'Deine Geräte im Tailnet dürfen diesen Port erreichen (Tailscale-Regel).' }
    : { status: 'nein', text: 'Gesperrt durch deine Tailscale-Zugriffsregel: Dieser Port steht nicht auf der Liste.' };
}

// ---------- Ports zusammenstellen ----------
let portCache = { t: 0, wert: null };
export async function portListe() {
  if (portCache.wert && Date.now() - portCache.t < 15_000) return portCache.wert;
  const roh = lauscherLesen();
  const inodes = new Set(roh.map((r) => r.inode));
  const pidKarte = inodesZuPids(inodes);
  const docker = await dockerListe();
  const idZuName = new Map(docker.map((c) => [c.Id.slice(0, 12), (c.Names?.[0] || '').replace(/^\//, '')]));
  const ipZuName = new Map();
  for (const c of docker) for (const n of Object.values(c.NetworkSettings?.Networks || {})) if (n.IPAddress) ipZuName.set(n.IPAddress, (c.Names?.[0] || '').replace(/^\//, ''));
  const [fw, acl, lan] = await Promise.all([firewall(), tailnetRegeln(), Promise.resolve(heimnetz())]);

  const gruppen = new Map();
  for (const r of roh) {
    const k = `${r.proto}/${r.port}`;
    const g = gruppen.get(k) || { proto: r.proto, port: r.port, ips: new Set(), inodes: new Set() };
    g.ips.add(r.ip);
    g.inodes.add(r.inode);
    gruppen.set(k, g);
  }

  const liste = [];
  for (const g of gruppen.values()) {
    // kurzlebige UDP-Ports von Programmen ausblenden
    if (g.proto === 'udp' && g.port >= 32768 && !PORT_WISSEN[g.port]) continue;
    const ips = [...g.ips];
    const bindings = new Set(ips.map(bindArt));
    const bind = bindings.has('alle') ? 'alle' : bindings.has('einzeln') ? 'einzeln' : 'lokal';
    let pid = null;
    for (const i of g.inodes) if (pidKarte.has(i)) { pid = pidKarte.get(i); break; }
    let prozess = null, container = null;
    if (pid) {
      prozess = (lesen(`/proc/${pid}/comm`, '') || '').trim() || null;
      const cg = lesen(`/proc/${pid}/cgroup`, '') || '';
      const cm = cg.match(/([0-9a-f]{64})/);
      if (cm) container = idZuName.get(cm[1].slice(0, 12)) || null;
      if (prozess === 'docker-proxy') {
        const cmd = (lesen(`/proc/${pid}/cmdline`, '') || '').split('\0');
        const ci = cmd[cmd.indexOf('-container-ip') + 1];
        container = ipZuName.get(ci) || container;
      }
    }
    const wissen = PORT_WISSEN[g.port];
    let name = wissen?.[0] || container || prozess || `Port ${g.port}`;
    let zweck = wissen?.[1] || (container ? `Container «${container}»` : prozess ? `Programm «${prozess}»` : 'Unbekannter Dienst');
    let rolle = 'dienst';
    let ziel = null;
    if (prozess === 'caddy' && g.port >= 10000 && g.port < 20000 && g.port !== 10000) {
      rolle = 'tor';
      ziel = g.port - 10000;
      const w = PORT_WISSEN[ziel];
      name = w ? `${w[0]} (HTTPS)` : `Dienst auf Port ${ziel} (HTTPS)`;
      zweck = `Caddy-Eingang mit Zertifikat. Leitet intern an Port ${ziel} weiter.`;
    } else if (prozess === 'caddy' && (g.port === 443 || g.port === 8443)) rolle = 'tor';
    else if (bind === 'lokal') rolle = 'intern';
    const l = { id: `${g.proto}/${g.port}`, proto: g.proto, port: g.port, bind, ips, prozess, container, name, zweck, rolle, ziel };
    l.heimnetz = heimnetzStatus(l, fw, lan?.name || 'eth0');
    l.tailnet = tailnetStatus(l, acl);
    liste.push(l);
  }
  liste.sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto));
  const wert = {
    liste,
    firewall: { verfuegbar: fw.verfuegbar, standardEingang: fw.ufw?.standardEingang || null, aktiv: !!fw.ufw?.aktiv, dockerSperre: fw.dockerSperre, regeln: (fw.ufw?.regeln || []).map((r) => ({ aktion: r.aktion, ports: r.bereiche.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ').replace('1–65535', 'alle'), proto: r.proto, iface: r.iface, von: r.von, kommentar: r.kommentar })) },
    tailnetRegeln: { quelle: acl.quelle, quelleText: acl.quelleText, alle: acl.alle, regeln: acl.regeln.map((r) => `${r.proto || 'tcp+udp'}:${r.von === r.bis ? r.von : `${r.von}–${r.bis}`}`) },
  };
  portCache = { t: Date.now(), wert };
  return wert;
}

// ---------- Wer klopft an? (Verbindungsverfolgung des Kernels) ----------
export function conntrackParsen(text, eigeneIps) {
  const gruppen = new Map();
  for (const zeile of text.split('\n')) {
    const t = zeile.trim().split(/\s+/);
    if (t.length < 8) continue;
    const proto = t[2];
    if (proto !== 'tcp' && proto !== 'udp') continue;
    const get = (name) => (zeile.match(new RegExp(`\\b${name}=(\\S+)`)) || [])[1];
    const src = get('src');
    const dst = get('dst');
    const dport = Number(get('dport'));
    if (!src || !dst || !eigeneIps.has(dst) || eigeneIps.has(src) || src.startsWith('127.') || src === '::1') continue;
    const zustand = proto === 'tcp' ? t[5] : null;
    const unbeantwortet = /\[UNREPLIED\]/.test(zeile);
    const g = gruppen.get(src) || { ip: src, verbindungen: 0, ports: new Map(), unbeantwortet: 0, protos: new Set(), aktiv: 0 };
    g.verbindungen++;
    g.protos.add(proto);
    if (unbeantwortet) g.unbeantwortet++;
    if (zustand === 'ESTABLISHED' && !unbeantwortet) g.aktiv++;
    const p = g.ports.get(dport) || { port: dport, proto, n: 0, unbeantwortet: 0 };
    p.n++;
    if (unbeantwortet) p.unbeantwortet++;
    g.ports.set(dport, p);
    gruppen.set(src, g);
  }
  return [...gruppen.values()].map((g) => ({
    ip: g.ip,
    verbindungen: g.verbindungen,
    aktiv: g.aktiv,
    unbeantwortet: g.unbeantwortet,
    verschiedenePorts: g.ports.size,
    ports: [...g.ports.values()].sort((a, b) => b.unbeantwortet - a.unbeantwortet || b.n - a.n).slice(0, 12),
    protos: [...g.protos],
  }));
}

export function verbindungenLesen() {
  const text = lesen('/proc/net/nf_conntrack', null);
  if (text === null) return { verfuegbar: false, quellen: [] };
  const eigeneIps = new Set(schnittstellen().map((s) => s.ip));
  const lan = heimnetz();
  const ts = schnittstellen().find((s) => s.art === 'tailscale');
  const quellen = conntrackParsen(text, eigeneIps).map((q) => {
    const bereich = imNetz(q.ip, lan) ? 'heimnetz' : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(q.ip) ? 'tailnet' : /^(172\.(1[6-9]|2\d|3[01])|10\.)/.test(q.ip) ? 'docker' : 'internet';
    // Verdacht: viele verschiedene Ports, fast alle ohne Antwort = jemand klopft überall an (Port-Scan)
    const verdacht = q.verschiedenePorts >= 12 && q.unbeantwortet >= 8;
    return { ...q, bereich, verdacht };
  }).filter((q) => q.bereich !== 'docker');
  quellen.sort((a, b) => Number(b.verdacht) - Number(a.verdacht) || b.aktiv - a.aktiv || b.verbindungen - a.verbindungen);
  return { verfuegbar: true, quellen: quellen.slice(0, 40), tailscaleIp: ts?.ip || null };
}

// ---------- Gemerkte Geräte (Namen, «meins/Familie/Gast») ----------
const netzDb = () => (db().netzwerk ||= { bekannt: {}, wache: true, baseline: false });

const BESITZER = ['meins', 'familie', 'gast', 'unbekannt'];

export function geraetSetzen({ mac, name, besitzer }) {
  mac = String(mac || '').toLowerCase();
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) throw Object.assign(new Error('Ungültige MAC-Adresse'), { status: 400 });
  const n = netzDb();
  const e = (n.bekannt[mac] ||= { erstmals: Date.now(), zuletzt: Date.now() });
  if (typeof name === 'string') e.name = name.trim().slice(0, 40) || undefined;
  if (BESITZER.includes(besitzer)) e.besitzer = besitzer;
  save();
  return e;
}

export function wacheSetzen(an) {
  netzDb().wache = !!an;
  save();
  return netzDb().wache;
}

function bekannteAbgleichen(geraete) {
  const n = netzDb();
  const jetzt = Date.now();
  const neu = [];
  for (const g of geraete) {
    if (!g.mac) continue;
    let e = n.bekannt[g.mac];
    if (!e) {
      e = n.bekannt[g.mac] = { erstmals: jetzt, zuletzt: jetzt, ip: g.ip, baseline: !n.baselineFertig };
      neu.push(g);
    }
    e.zuletzt = jetzt;
    e.ip = g.ip;
  }
  return neu;
}

function anreichern(geraete) {
  const n = netzDb();
  for (const g of geraete) {
    const e = g.mac ? n.bekannt[g.mac] : null;
    g.eigenerName = e?.name || null;
    g.besitzer = e?.besitzer || (g.istPi || g.istPc || g.istTv ? 'meins' : 'unbekannt');
    g.erstmals = e?.erstmals || null;
    g.neu = !!e && !e.baseline && jetzt() - e.erstmals < 24 * 3600_000;
    g.anzeigeName = g.eigenerName || g.name || g.hostname || g.dns || null;
  }
  return geraete;
}
const jetzt = () => Date.now();

// ---------- Gesamtzustand für die Seite ----------
let letzteSuche = null;

export async function netzwerkZustand() {
  if (!letzteSuche) {
    letzteSuche = await geraeteSuchen({ aktiv: false });
    bekannteAbgleichen(letzteSuche.geraete);
    netzDb().baselineFertig = true;
    save();
  }
  const [ports, verb] = await Promise.all([portListe(), Promise.resolve(verbindungenLesen())]);
  let tailnet = null;
  try { tailnet = await tsStatus(); } catch {}
  const geraete = anreichern(letzteSuche.geraete.map((g) => ({ ...g })));
  const nameZuIp = new Map(geraete.map((g) => [g.ip, g.anzeigeName || g.herstellerMac || g.artText]));
  const peers = tailnet ? [{ name: tailnet.selbst.name, ip: tailnet.selbst.ip, selbst: true, online: true, os: 'linux', besitzer: tailnet.ichLogin, istGast: false }, ...tailnet.peers.map((p) => ({ name: p.name, ip: p.ip, online: p.online, os: p.os, besitzer: p.besitzer, istGast: p.istGast, zuletzt: p.zuletzt, aktiv: p.aktiv }))] : [];
  for (const q of verb.quellen) q.name = nameZuIp.get(q.ip) || peers.find((p) => p.ip === q.ip)?.name || null;
  return {
    zeit: Date.now(),
    schnittstellen: schnittstellen().map((s) => ({ name: s.name, ip: s.ip, praefix: s.praefix, art: s.art })),
    heimnetz: letzteSuche.netz,
    suche: { zeit: letzteSuche.zeit, aktiv: letzteSuche.aktiv, angestupst: letzteSuche.angestupst || 0 },
    geraete,
    tailnet: { peers, verfuegbar: !!tailnet, name: tailnet?.tailnet || null },
    ...ports,
    verbindungen: verb,
    wache: netzDb().wache,
  };
}

export async function netzwerkSuchen() {
  letzteSuche = await geraeteSuchen({ aktiv: true });
  const neu = bekannteAbgleichen(letzteSuche.geraete);
  netzDb().baselineFertig = true;
  save();
  return { neu: neu.length, zustand: await netzwerkZustand() };
}

export { portsPruefen };

// ---------- Hintergrundwache: Port-Scans und neue Geräte ----------
export async function netzwache() {
  const n = netzDb();
  // Neue Geräte (nur leises Lesen der ARP-Tabelle)
  const s = await geraeteSuchen({ aktiv: false }).catch(() => null);
  if (s) {
    const neu = bekannteAbgleichen(s.geraete);
    if (n.baselineFertig) {
      for (const g of neu) ereignis('info', `Neues Gerät im Heimnetz: ${g.ip}${g.herstellerMac ? ' · ' + g.herstellerMac : g.zufaelligeMac ? ' · zufällige MAC (vermutlich Handy)' : ''}`, { schluessel: 'neu-' + g.mac });
    }
    n.baselineFertig = true;
    save();
  }
  if (!n.wache) return;
  const v = verbindungenLesen();
  for (const q of v.quellen) {
    if (q.verdacht && q.bereich !== 'tailnet') {
      const name = s?.geraete.find((g) => g.ip === q.ip);
      const wer = name?.name ? `${q.ip} (${name.name})` : q.ip;
      ereignis('warnung', `Port-Scan erkannt: ${wer} hat ${q.verschiedenePorts} verschiedene Ports am Pi abgeklopft (${q.bereich}).`, { telegram: true, schluessel: 'portscan-' + q.ip });
    }
  }
}
