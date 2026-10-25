// Windows-PC per Wake-on-LAN einschalten.
// Die Zentrale läuft im Host-Netz des Pi und schickt das «Magic Packet» direkt ins Heimnetz (UDP-Broadcast).
// Ob der PC läuft, sieht sie an Tailscale: Sobald Windows gestartet ist, meldet sich der PC dort als online.
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ssh2 from 'ssh2';
import { config } from './config.mjs';
import { ereignis } from './ereignisse.mjs';

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const WARTEN_MS = 5 * 60_000; // so lange gilt der PC nach dem Wecken als «startet …»
let gewecktUm = 0;
let warOnline = null;

export const pcEingerichtet = () => MAC.test(config.pc.mac);

function magicPacket(mac) {
  const adresse = Buffer.from(mac.replace(/[:-]/g, ''), 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => adresse)]);
}

function udpSenden(paket, ziel, port) {
  return new Promise((ok, fehler) => {
    const s = dgram.createSocket('udp4');
    s.once('error', (e) => { try { s.close(); } catch {} fehler(e); });
    s.bind(() => {
      s.setBroadcast(true);
      s.send(paket, port, ziel, (e) => { s.close(); e ? fehler(e) : ok(); });
    });
  });
}

// Magic Packet an mehrere Ziele (Broadcast und/oder direkte Adresse), je dreimal an Port 9 und 7.
export async function wolSenden(mac, ziele) {
  const paket = magicPacket(mac);
  for (let i = 0; i < 3; i++) for (const ziel of ziele) for (const port of [9, 7]) await udpSenden(paket, ziel, port).catch(() => {});
}

export async function pcWecken() {
  if (!pcEingerichtet()) {
    const e = new Error('PC_MAC fehlt oder ist ungültig (.env)');
    e.status = 400;
    throw e;
  }
  const paket = magicPacket(config.pc.mac);
  // UDP kann verloren gehen: dreimal senden, an die üblichen Ports 9 und 7.
  for (let i = 0; i < 3; i++) for (const port of [9, 7]) await udpSenden(paket, config.pc.broadcast, port);
  gewecktUm = Date.now();
  ereignis('info', `${config.pc.name}: Einschalt-Signal gesendet (Wake-on-LAN)`);
}

// Sucht den PC in der Tailscale-Geräteliste: per PC_TAILSCALE_NAME, sonst das einzige eigene Windows-Gerät.
function pcFinden(peers) {
  const liste = peers || [];
  const ziel = config.pc.tailscaleName.toLowerCase();
  if (ziel) return liste.find((p) => p.name.toLowerCase() === ziel || p.dns.toLowerCase().startsWith(ziel + '.')) || null;
  const windows = liste.filter((p) => /windows/i.test(p.os) && !p.istGast);
  return windows.length === 1 ? windows[0] : null;
}

export function pcStatus(peers) {
  if (!pcEingerichtet()) return { eingerichtet: false, name: config.pc.name, online: null, geraet: null, zuletzt: null, gewecktUm: null, ausBereit: false, ausUm: null };
  const p = pcFinden(peers);
  const online = p ? p.online : null;
  // Nach dem Wecken melden, sobald der PC wirklich da ist.
  if (online === true && warOnline === false && gewecktUm && Date.now() - gewecktUm < 15 * 60_000) {
    ereignis('ok', `${config.pc.name} ist eingeschaltet`);
    gewecktUm = 0;
  }
  if (online !== null) warOnline = online;
  return {
    eingerichtet: true,
    name: config.pc.name,
    online,
    geraet: p?.name || null,
    zuletzt: p?.zuletzt || null,
    gewecktUm: online !== true && gewecktUm && Date.now() - gewecktUm < WARTEN_MS ? gewecktUm : null,
    ausBereit: pcAusBereit(),
    ausUm: online !== false ? pcAusGesendet() : null,
  };
}

// ---------- Ausschalten über SSH (OpenSSH-Server unter Windows) ----------
// Die Zentrale hat dafür einen eigenen Schlüssel. Auf dem PC ist er so eingetragen, dass er NUR
// «shutdown» ausführen darf (command=…) und nur aus dem Tailscale-Netz kommen darf (from=…).
// Den Host-Schlüssel des PCs merkt sich die Zentrale beim ersten Mal und lehnt danach jeden anderen ab.

const { Client, utils } = ssh2;
const SCHLUESSEL = () => path.join(config.dataDir, 'pc', 'id_ed25519');
const HOSTKEY = () => path.join(config.dataDir, 'pc', 'hostkey.sha256');
export const AUS_BEFEHL = 'shutdown /s /t 30 /c "Ausgeschaltet von der Zentrale - Abbrechen: shutdown /a"';
let ausUm = 0;

function schluesselHolen() {
  const p = SCHLUESSEL();
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    const k = utils.generateKeyPairSync('ed25519', { comment: 'zentrale-pc-aus' });
    fs.writeFileSync(p, k.private, { mode: 0o600 });
    fs.writeFileSync(p + '.pub', k.public + '\n', { mode: 0o644 });
  }
  return { privat: fs.readFileSync(p), oeffentlich: fs.readFileSync(p + '.pub', 'utf8').trim() };
}

// Zeile für C:\ProgramData\ssh\administrators_authorized_keys auf dem PC.
export function pcSchluesselZeile() {
  const { oeffentlich } = schluesselHolen();
  const befehl = AUS_BEFEHL.replace(/"/g, '\\"');
  return `from="100.64.0.0/10",command="${befehl}",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${oeffentlich}`;
}

export const pcAusBereit = () => pcEingerichtet() && !!config.pc.user;

export async function pcAusschalten(peers) {
  if (!pcAusBereit()) {
    const e = new Error('PC_USER fehlt in der .env');
    e.status = 400;
    throw e;
  }
  const p = pcFinden(peers);
  const host = config.pc.host || p?.ip;
  if (!host) {
    const e = new Error('PC in Tailscale nicht gefunden (PC_HOST oder PC_TAILSCALE_NAME setzen)');
    e.status = 400;
    throw e;
  }
  const { privat } = schluesselHolen();
  let bekannt = null;
  try { bekannt = fs.readFileSync(HOSTKEY(), 'utf8').trim(); } catch {}
  let neuerHostkey = null;

  await new Promise((ok, fehler) => {
    const c = new Client();
    const fertig = (e) => { try { c.end(); } catch {} e ? fehler(e) : ok(); };
    c.on('ready', () => {
      c.exec(AUS_BEFEHL, (e, stream) => {
        if (e) return fertig(e);
        let err = '';
        stream.stderr.on('data', (d) => (err += d));
        stream.on('close', (code) => fertig(code && code !== 0 ? new Error(`PC meldet Fehler ${code}: ${err.trim().slice(0, 160)}`) : null));
        stream.resume();
      });
    });
    c.on('error', (e) => fertig(new Error(e.level === 'client-authentication' ? 'PC lehnt den Schlüssel ab (Schlüssel auf dem PC eingetragen?)' : `SSH zum PC: ${e.message}`)));
    c.connect({
      host,
      port: config.pc.sshPort,
      username: config.pc.user,
      privateKey: privat,
      readyTimeout: 10_000,
      hostVerifier: (key) => {
        const fp = crypto.createHash('sha256').update(key).digest('base64');
        if (!bekannt) { neuerHostkey = fp; return true; } // erstes Mal: merken
        return fp === bekannt;
      },
    });
  }).catch((e) => {
    if (bekannt && /Handshake failed|host/i.test(e.message)) e.message = 'Host-Schlüssel des PCs hat sich geändert – Verbindung aus Sicherheit abgelehnt';
    throw e;
  });

  if (neuerHostkey) fs.writeFileSync(HOSTKEY(), neuerHostkey + '\n', { mode: 0o600 });
  ausUm = Date.now();
  ereignis('info', `${config.pc.name} wird in 30 Sekunden ausgeschaltet`);
}

export const pcAusGesendet = () => (ausUm && Date.now() - ausUm < 5 * 60_000 ? ausUm : null);
