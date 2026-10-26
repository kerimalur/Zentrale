// Geräte im Heimnetz finden: ARP-Tabelle, mDNS (Bonjour), SSDP (UPnP), Namen per Rückwärts-DNS,
// und für ein einzelnes Gerät auf Klick: ein paar gängige Ports prüfen.
// Alles bleibt im eigenen Netz (nur private Adressen) und nutzt nur Standardverfahren, die jedes Gerät beantwortet.
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import http from 'node:http';
import { config } from './config.mjs';
import { lesen, sleep } from './util.mjs';

// ---------- Adressen ----------
export const ipZuZahl = (ip) => ip.split('.').reduce((a, b) => ((a << 8) + Number(b)) >>> 0, 0);
export const zahlZuIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
export const istIpv4 = (s) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every((x) => Number(x) <= 255);
export const istPrivat = (ip) => {
  if (!istIpv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
const praefix = (maske) => ipZuZahl(maske).toString(2).replace(/0/g, '').length;

export function schnittstellen() {
  const out = [];
  for (const [name, liste] of Object.entries(os.networkInterfaces())) {
    for (const a of liste || []) {
      if (a.family !== 'IPv4') continue;
      const art = a.internal ? 'lokal' : name === 'tailscale0' ? 'tailscale' : /^(docker|br-|veth)/.test(name) ? 'docker' : 'heimnetz';
      out.push({ name, ip: a.address, maske: a.netmask, praefix: praefix(a.netmask), mac: a.mac, art });
    }
  }
  return out;
}

export const heimnetz = () => schnittstellen().find((s) => s.art === 'heimnetz') || null;

function imNetz(ip, netz) {
  if (!netz || !istIpv4(ip)) return false;
  const maske = (~0 << (32 - netz.praefix)) >>> 0;
  return (ipZuZahl(ip) & maske) === (ipZuZahl(netz.ip) & maske);
}
export { imNetz };

// Standard-Gateway (= Router) aus der Routing-Tabelle des Pi
export function gateway() {
  const t = lesen('/proc/net/route', '');
  for (const z of t.split('\n').slice(1)) {
    const f = z.trim().split(/\s+/);
    if (f[1] === '00000000' && f[7] === '00000000') {
      const b = f[2].match(/../g).reverse().map((x) => parseInt(x, 16));
      return b.join('.');
    }
  }
  return null;
}

// ---------- Hersteller (nur sichere Zuordnungen) und zufällige MAC ----------
const OUI = {
  b827eb: 'Raspberry Pi', dca632: 'Raspberry Pi', e45f01: 'Raspberry Pi', d83add: 'Raspberry Pi', '2ccf67': 'Raspberry Pi', '28cdc1': 'Raspberry Pi',
  '001132': 'Synology', '9009d0': 'Synology',
  '245ebe': 'QNAP', '00089b': 'QNAP',
  '000e58': 'Sonos', '5caafd': 'Sonos', '7828ca': 'Sonos', b8e937: 'Sonos', '949f3e': 'Sonos', '347e5c': 'Sonos', '48a6b8': 'Sonos',
};
export const zufaelligeMac = (mac) => !!mac && (parseInt(mac.slice(0, 2), 16) & 2) === 2;
export function hersteller(mac) {
  if (!mac) return null;
  const k = mac.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 6);
  if (OUI[k]) return OUI[k];
  const tv = (config.tv.mac || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 6);
  if (tv && k === tv) return 'Philips-Fernseher (gleicher Hersteller-Code wie dein TV)';
  return null;
}

// ---------- ARP-Tabelle ----------
export function arpLesen(iface) {
  const t = lesen('/proc/net/arp', '');
  const out = [];
  for (const z of t.split('\n').slice(1)) {
    const f = z.trim().split(/\s+/);
    if (f.length < 6) continue;
    const [ip, , flags, mac, , dev] = f;
    if (flags !== '0x2' || mac === '00:00:00:00:00:00') continue; // 0x2 = Eintrag vollständig
    if (iface && dev !== iface) continue;
    out.push({ ip, mac: mac.toLowerCase(), iface: dev });
  }
  return out;
}

// Jedes Gerät im Netz kurz «anstupsen» (ein winziges UDP-Paket an den Discard-Port). Dadurch fragt der Pi per ARP nach jeder Adresse,
// und alle vorhandenen Geräte tauchen in der ARP-Tabelle auf. Es werden keine Ports geprüft.
export async function anstupsen(netz) {
  if (!netz || netz.praefix < 22 || netz.praefix > 30) return 0;
  const basis = ipZuZahl(netz.ip) & ((~0 << (32 - netz.praefix)) >>> 0);
  const anzahl = 2 ** (32 - netz.praefix);
  const sock = dgram.createSocket('udp4');
  await new Promise((r) => sock.bind(0, netz.ip, r));
  let n = 0;
  for (let i = 1; i < anzahl - 1; i++) {
    const ip = zahlZuIp(basis + i);
    if (ip === netz.ip) continue;
    sock.send(Buffer.from('.'), 9, ip, () => {});
    n++;
    if (n % 40 === 0) await sleep(15);
  }
  await sleep(1500);
  sock.close();
  return n;
}

// ---------- DNS-Pakete (mDNS) ----------
function frage(namen) {
  const teile = [Buffer.from([0, 0, 0, 0, 0, namen.length, 0, 0, 0, 0, 0, 0])];
  for (const n of namen) {
    for (const l of n.split('.')) teile.push(Buffer.from([Buffer.byteLength(l)]), Buffer.from(l));
    teile.push(Buffer.from([0, 0, 12, 0x80, 1])); // Typ PTR, Klasse IN mit «antworte direkt an mich»
  }
  return Buffer.concat(teile);
}

function dnsName(b, pos, tiefe = 0) {
  const teile = [];
  let p = pos;
  let ende = null;
  for (let schritt = 0; schritt < 40; schritt++) {
    if (p >= b.length) return [teile.join('.'), ende ?? p];
    const l = b[p];
    if (l === 0) { p++; break; }
    if ((l & 0xc0) === 0xc0) {
      if (ende === null) ende = p + 2;
      p = ((l & 0x3f) << 8) | b[p + 1];
      if (tiefe > 8) break;
      continue;
    }
    teile.push(b.toString('utf8', p + 1, p + 1 + l));
    p += 1 + l;
  }
  return [teile.join('.'), ende ?? p];
}

export function dnsAntwort(b) {
  if (b.length < 12) return [];
  const qd = b.readUInt16BE(4);
  const rr = b.readUInt16BE(6) + b.readUInt16BE(8) + b.readUInt16BE(10);
  let p = 12;
  for (let i = 0; i < qd; i++) { p = dnsName(b, p)[1] + 4; }
  const out = [];
  for (let i = 0; i < rr && p + 10 <= b.length; i++) {
    const [name, np] = dnsName(b, p);
    p = np;
    const typ = b.readUInt16BE(p);
    const laenge = b.readUInt16BE(p + 8);
    const d = p + 10;
    p = d + laenge;
    if (p > b.length) break;
    if (typ === 12) out.push({ typ: 'PTR', name, ziel: dnsName(b, d)[0] });
    else if (typ === 33) out.push({ typ: 'SRV', name, port: b.readUInt16BE(d + 4), ziel: dnsName(b, d + 6)[0] });
    else if (typ === 1 && laenge === 4) out.push({ typ: 'A', name, ip: [...b.subarray(d, d + 4)].join('.') });
    else if (typ === 16) {
      const txt = [];
      for (let q = d; q < d + laenge;) { const l = b[q]; txt.push(b.toString('utf8', q + 1, q + 1 + l)); q += 1 + l; }
      out.push({ typ: 'TXT', name, txt });
    }
  }
  return out;
}

const MDNS_TYPEN = [
  '_services._dns-sd._udp.local', '_smb._tcp.local', '_afpovertcp._tcp.local', '_nfs._tcp.local', '_http._tcp.local', '_googlecast._tcp.local',
  '_airplay._tcp.local', '_spotify-connect._tcp.local', '_sonos._tcp.local', '_ipp._tcp.local', '_printer._tcp.local', '_workstation._tcp.local',
  '_device-info._tcp.local', '_ssh._tcp.local', '_homekit._tcp.local', '_raop._tcp.local',
];

const dienstName = (typ) => typ.replace(/\.local$/, '').replace(/\._(tcp|udp)$/, '').replace(/^_/, '');

async function mdns(netz, ms = 2200) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const funde = new Map(); // ip → { dienste:Set, instanzen:Set, host, txt:[] }
  const get = (ip) => { if (!funde.has(ip)) funde.set(ip, { dienste: new Set(), instanzen: new Set(), host: null, txt: [], ports: {} }); return funde.get(ip); };
  const unbekannte = new Set();
  sock.on('message', (msg, ri) => {
    let r;
    try { r = dnsAntwort(msg); } catch { return; }
    const f = get(ri.address);
    for (const x of r) {
      if (x.typ === 'PTR') {
        if (x.name === '_services._dns-sd._udp.local') {
          f.dienste.add(dienstName(x.ziel));
          if (!MDNS_TYPEN.includes(x.ziel)) unbekannte.add(x.ziel);
        } else if (x.name.startsWith('_')) {
          f.dienste.add(dienstName(x.name));
          f.instanzen.add(x.ziel.replace(new RegExp('\\.' + x.name.replace(/\./g, '\\.') + '$'), ''));
        }
      } else if (x.typ === 'A' && x.ip === ri.address) f.host = x.name.replace(/\.local$/, '');
      else if (x.typ === 'SRV') { f.ports[dienstName(x.name.split('.').slice(-3).join('.'))] = x.port; if (!f.host && x.ziel.endsWith('.local')) f.host = x.ziel.replace(/\.local$/, ''); }
      else if (x.typ === 'TXT') f.txt.push(...x.txt);
    }
  });
  await new Promise((r) => sock.bind(0, netz.ip, r));
  try { sock.setMulticastTTL(255); sock.setMulticastInterface(netz.ip); } catch {}
  const senden = (namen) => { for (let i = 0; i < namen.length; i += 8) sock.send(frage(namen.slice(i, i + 8)), 5353, '224.0.0.251', () => {}); };
  senden(MDNS_TYPEN);
  await sleep(ms / 2);
  if (unbekannte.size) senden([...unbekannte].slice(0, 24));
  await sleep(ms / 2);
  sock.close();
  return funde;
}

// ---------- SSDP / UPnP ----------
function holeXml(url, ip) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve(null); }
    if (u.protocol !== 'http:' || u.hostname !== ip) return resolve(null); // nur vom antwortenden Gerät selbst
    const req = http.get({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: 1500 }, (res) => {
      let roh = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { roh += c; if (roh.length > 64 * 1024) req.destroy(); });
      res.on('end', () => resolve(roh));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}
const tag = (xml, name) => (xml?.match(new RegExp(`<${name}>([^<]{1,120})</${name}>`)) || [])[1]?.trim() || null;

async function ssdp(netz, ms = 2800) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const funde = new Map(); // ip → { server, typen:Set, orte:Set }
  sock.on('message', (msg, ri) => {
    const kopf = {};
    for (const z of msg.toString('utf8').split('\r\n').slice(1)) {
      const i = z.indexOf(':');
      if (i > 0) kopf[z.slice(0, i).trim().toLowerCase()] = z.slice(i + 1).trim();
    }
    if (!funde.has(ri.address)) funde.set(ri.address, { server: null, typen: new Set(), orte: new Set() });
    const f = funde.get(ri.address);
    if (kopf.server) f.server = kopf.server;
    if (kopf.st) f.typen.add(kopf.st);
    if (kopf.location) f.orte.add(kopf.location);
  });
  await new Promise((r) => sock.bind(0, netz.ip, r));
  try { sock.setMulticastTTL(4); sock.setMulticastInterface(netz.ip); } catch {}
  const such = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n');
  sock.send(such, 1900, '239.255.255.250', () => {});
  await sleep(700);
  sock.send(such, 1900, '239.255.255.250', () => {});
  await sleep(ms - 700);
  sock.close();
  // Gerätebeschreibung (Name, Hersteller, Modell) vom Gerät selbst holen
  await Promise.all([...funde].map(async ([ip, f]) => {
    for (const ort of f.orte) {
      const xml = await holeXml(ort, ip);
      if (xml) {
        f.name = tag(xml, 'friendlyName');
        f.hersteller = tag(xml, 'manufacturer');
        f.modell = tag(xml, 'modelName');
        break;
      }
    }
  }));
  return funde;
}

async function rueckwaerts(ip) {
  try {
    const r = await Promise.race([dns.reverse(ip), sleep(900).then(() => [])]);
    return r?.[0] || null;
  } catch { return null; }
}

// ---------- Zusammenführen ----------
const ART_TEXT = { router: 'Router', fernseher: 'Fernseher', lautsprecher: 'Lautsprecher', nas: 'NAS / Dateiserver', drucker: 'Drucker', pc: 'Computer', handy: 'Handy / Tablet', pi: 'Raspberry Pi', streaming: 'Streaming-Gerät', iot: 'Smart-Home-Gerät', unbekannt: 'Unbekannt' };

function einordnen(g) {
  const hinweise = [];
  const text = [g.name, g.modell, g.hersteller, g.herstellerMac, g.upnpServer, ...(g.dienste || []), g.hostname].filter(Boolean).join(' ').toLowerCase();
  const hat = (...w) => w.some((x) => text.includes(x));
  let art = 'unbekannt';
  if (g.istRouter) { art = 'router'; hinweise.push('Das ist das Standard-Gateway: Alle Pakete ins Internet gehen hier durch.'); }
  else if (g.istPi) { art = 'pi'; hinweise.push('Gehört zu deinem Raspberry Pi.'); }
  else if (g.istTv || hat('philips', 'tp vision') && hat('tv', 'ipi', 'fernseher')) { art = 'fernseher'; hinweise.push('Gehört zu deinem Fernseher.'); }
  else if (hat('sonos')) { art = 'lautsprecher'; hinweise.push('Meldet sich als Sonos-Lautsprecher (mDNS/UPnP).'); }
  else if (hat('synology', 'qnap', 'diskstation', 'readynas', 'wd my cloud', 'mycloud')) { art = 'nas'; hinweise.push('Name oder Hersteller deutet auf ein NAS hin.'); }
  else if (g.dienste?.some((d) => ['smb', 'afpovertcp', 'nfs'].includes(d))) { art = 'nas'; hinweise.push('Bietet Datei-Freigaben an (SMB/AFP/NFS) – typisch für NAS oder Computer.'); }
  else if (g.dienste?.some((d) => ['ipp', 'printer'].includes(d)) || hat('printer', 'drucker', 'laserjet', 'officejet')) { art = 'drucker'; hinweise.push('Meldet sich als Drucker.'); }
  else if (g.dienste?.some((d) => ['googlecast', 'airplay', 'raop'].includes(d))) { art = 'streaming'; hinweise.push('Kann Bild/Ton empfangen (Chromecast/AirPlay).'); }
  else if (g.dienste?.includes('workstation') || hat('windows', 'desktop-', 'laptop')) { art = 'pc'; hinweise.push('Verhält sich wie ein Computer.'); }
  else if (g.zufaelligeMac) { art = 'handy'; hinweise.push('Zufällige MAC-Adresse: typisch für Handys, Tablets und neuere Notebooks (Privatsphäre-Funktion).'); }
  if (g.zufaelligeMac && art !== 'handy') hinweise.push('Die MAC ist zufällig erzeugt (Privatsphäre-Funktion) – darum ist der Hersteller nicht erkennbar.');
  return { art, artText: ART_TEXT[art], hinweise };
}

/**
 * Sucht Geräte. aktiv=false: nur ARP-Tabelle lesen (leise, immer erlaubt). aktiv=true: Netz anstupsen + mDNS + SSDP.
 */
export async function geraeteSuchen({ aktiv = false } = {}) {
  const netz = heimnetz();
  if (!netz) return { netz: null, geraete: [], hinweis: 'Kein Heimnetz-Anschluss gefunden.' };
  let mdnsFunde = new Map();
  let ssdpFunde = new Map();
  let angestupst = 0;
  if (aktiv) {
    angestupst = await anstupsen(netz).catch(() => 0);
    [mdnsFunde, ssdpFunde] = await Promise.all([mdns(netz).catch(() => new Map()), ssdp(netz).catch(() => new Map())]);
  }
  const arp = arpLesen(netz.name);
  const eigeneMacs = new Set(schnittstellen().map((s) => (s.mac || '').toLowerCase()));
  const eigeneIps = new Set(schnittstellen().map((s) => s.ip));
  const gw = gateway();
  const pcMac = (config.pc.mac || '').toLowerCase();
  const ips = new Set([...arp.map((a) => a.ip), ...[...mdnsFunde.keys()], ...[...ssdpFunde.keys()]].filter((ip) => istPrivat(ip) && imNetz(ip, netz) && !eigeneIps.has(ip)));
  const geraete = await Promise.all([...ips].map(async (ip) => {
    const a = arp.find((x) => x.ip === ip);
    const m = mdnsFunde.get(ip);
    const s = ssdpFunde.get(ip);
    const mac = a?.mac || null;
    const g = {
      ip,
      mac,
      herstellerMac: hersteller(mac),
      zufaelligeMac: zufaelligeMac(mac),
      hostname: m?.host || null,
      name: s?.name || m?.instanzen?.values().next().value || null,
      modell: s?.modell || (m?.txt || []).map((t) => t.match(/^(?:md|model|am)=(.+)/)?.[1]).find(Boolean) || null,
      hersteller: s?.hersteller || null,
      upnpServer: s?.server || null,
      dienste: m ? [...m.dienste].filter((d) => !['udp', 'dns-sd'].includes(d)).sort() : [],
      upnpTypen: s ? [...s.typen].slice(0, 12) : [],
      istRouter: ip === gw,
      istPi: !!mac && eigeneMacs.has(mac),
      istTv: (config.tv.ip && ip === config.tv.ip) || false,
      istPc: !!pcMac && mac === pcMac,
    };
    g.dns = await rueckwaerts(ip);
    if (!g.name && g.dns) g.name = g.dns.replace(/\.(lan|local|home|fritz\.box)$/i, '');
    if (!g.name && g.hostname) g.name = g.hostname;
    if (g.istPc) { g.name = config.pc.name; g.hinweisEigen = 'Dein Windows-PC'; }
    if (g.istTv) g.name = config.tv.name;
    const e = einordnen(g);
    if (g.istPc) { e.art = 'pc'; e.artText = ART_TEXT.pc; e.hinweise.unshift('Das ist dein Windows-PC (MAC aus der Zentrale-Konfiguration).'); }
    return { ...g, ...e };
  }));
  geraete.sort((a, b) => ipZuZahl(a.ip) - ipZuZahl(b.ip));
  return { netz: { name: netz.name, ip: netz.ip, cidr: `${zahlZuIp(ipZuZahl(netz.ip) & ((~0 << (32 - netz.praefix)) >>> 0))}/${netz.praefix}`, gateway: gw }, geraete, aktiv, angestupst, zeit: Date.now() };
}

// ---------- Ports eines einzelnen Geräts prüfen (nur auf Klick, nur gängige Ports, nur eigenes Netz) ----------
export const GAENGIGE_PORTS = [
  [21, 'FTP', 'Dateiübertragung (alt, unverschlüsselt)'], [22, 'SSH', 'Fernzugriff auf die Kommandozeile'], [23, 'Telnet', 'Fernzugriff (alt, unverschlüsselt – sollte aus sein)'],
  [53, 'DNS', 'Namensauflösung'], [80, 'HTTP', 'Weboberfläche ohne Verschlüsselung'], [139, 'NetBIOS', 'Windows-Freigaben (alt)'], [443, 'HTTPS', 'Weboberfläche mit Verschlüsselung'],
  [445, 'SMB', 'Windows-/NAS-Dateifreigaben'], [548, 'AFP', 'Apple-Dateifreigaben'], [631, 'IPP', 'Druckserver'], [1400, 'Sonos', 'Sonos-Steuerung'],
  [1925, 'Philips-TV-API', 'Fernseher-Steuerung (JointSpace)'], [2049, 'NFS', 'Datei-Freigaben (Linux/NAS)'], [3389, 'RDP', 'Windows-Fernzugriff'],
  [5000, 'Synology DSM', 'NAS-Weboberfläche (http)'], [5001, 'Synology DSM', 'NAS-Weboberfläche (https)'], [5357, 'WSD', 'Windows-Geräteerkennung'],
  [5900, 'VNC', 'Bildschirm-Fernzugriff'], [8000, 'HTTP-alt', 'Weboberfläche'], [8008, 'Chromecast', 'Chromecast/Google-TV-Steuerung'], [8009, 'Chromecast', 'Chromecast-Streaming'],
  [8080, 'HTTP-alt', 'Weboberfläche'], [8096, 'Jellyfin', 'Mediaserver'], [8200, 'DLNA', 'Medienserver (MiniDLNA)'], [8443, 'HTTPS-alt', 'Weboberfläche mit Verschlüsselung'],
  [9100, 'Drucker', 'Direktdruck (JetDirect)'], [32400, 'Plex', 'Mediaserver'],
];

const portOffen = (ip, port, ms = 700) => new Promise((resolve) => {
  const s = net.connect({ host: ip, port });
  const fertig = (ok) => { s.destroy(); resolve(ok); };
  s.setTimeout(ms, () => fertig(false));
  s.on('connect', () => fertig(true));
  s.on('error', () => fertig(false));
});

const zuletztGeprueft = new Map();

export async function portsPruefen(ip) {
  const netz = heimnetz();
  if (!istIpv4(ip) || !istPrivat(ip) || !imNetz(ip, netz)) throw Object.assign(new Error('Nur Geräte im eigenen Heimnetz'), { status: 400 });
  if (Date.now() - (zuletztGeprueft.get(ip) || 0) < 15_000) throw Object.assign(new Error('Bitte kurz warten (15 Sekunden)'), { status: 429 });
  zuletztGeprueft.set(ip, Date.now());
  const offen = [];
  const liste = [...GAENGIGE_PORTS];
  const arbeiter = Array.from({ length: 8 }, async () => {
    while (liste.length) {
      const [port, name, zweck] = liste.shift();
      if (await portOffen(ip, port)) offen.push({ port, name, zweck });
    }
  });
  await Promise.all(arbeiter);
  offen.sort((a, b) => a.port - b.port);
  const p = new Set(offen.map((o) => o.port));
  let vermutung = null;
  if (p.has(5000) || p.has(5001)) vermutung = 'Sieht nach einem Synology-NAS aus (DSM-Weboberfläche).';
  else if (p.has(445) && (p.has(2049) || p.has(548) || p.has(80) || p.has(443) || p.has(8080))) vermutung = 'Sieht nach einem NAS oder Dateiserver aus (Dateifreigaben + Weboberfläche).';
  else if (p.has(445) && p.has(3389)) vermutung = 'Sieht nach einem Windows-Computer aus.';
  else if (p.has(9100) || p.has(631)) vermutung = 'Sieht nach einem Drucker aus.';
  else if (p.has(8008) || p.has(8009)) vermutung = 'Sieht nach einem Chromecast / Google-TV-Gerät aus.';
  else if (p.has(1400)) vermutung = 'Sieht nach einem Sonos-Lautsprecher aus.';
  else if (p.has(1925)) vermutung = 'Sieht nach einem Philips-Fernseher aus.';
  else if (p.has(22) && !p.has(445)) vermutung = 'Ein Linux-Gerät mit SSH (Server, Raspberry Pi, Router …).';
  const warnungen = [];
  if (p.has(23)) warnungen.push('Telnet ist offen: unverschlüsselt und veraltet – besser abschalten.');
  if (p.has(21)) warnungen.push('FTP ist offen: Passwörter laufen im Klartext.');
  if (p.has(80) && !p.has(443)) warnungen.push('Die Weboberfläche läuft nur ohne Verschlüsselung (HTTP).');
  return { ip, offen, geprueft: GAENGIGE_PORTS.length, vermutung, warnungen, zeit: Date.now() };
}
