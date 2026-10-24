// Windows-PC per Wake-on-LAN einschalten.
// Die Zentrale läuft im Host-Netz des Pi und schickt das «Magic Packet» direkt ins Heimnetz (UDP-Broadcast).
// Ob der PC läuft, sieht sie an Tailscale: Sobald Windows gestartet ist, meldet sich der PC dort als online.
import dgram from 'node:dgram';
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
  if (!pcEingerichtet()) return { eingerichtet: false, name: config.pc.name, online: null, geraet: null, zuletzt: null, gewecktUm: null };
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
  };
}
