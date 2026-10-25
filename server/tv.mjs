// Philips-Fernseher (Saphi, JointSpace-API v6 auf Port 1925, ohne Kopplung).
// Einschalten: Wake-on-WLAN (Magic Packet) und danach powerstate «On». Funktioniert nur, solange der
// Fernseher nicht im tiefen Standby ist – sonst meldet die Zentrale das und man nimmt die Fernbedienung.
import { config } from './config.mjs';
import { holen, holenJson, aufHost } from './util.mjs';
import { ereignis } from './ereignisse.mjs';
import { wolSenden } from './pc.mjs';

const IP = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

// Erlaubte Tasten (Namen der Philips-API)
export const TASTEN = new Set([
  'Standby', 'VolumeUp', 'VolumeDown', 'Mute', 'ChannelStepUp', 'ChannelStepDown',
  'CursorUp', 'CursorDown', 'CursorLeft', 'CursorRight', 'Confirm', 'Back', 'Home', 'Source', 'Options', 'Info',
  'PlayPause', 'Stop', 'FastForward', 'Rewind', 'Next', 'Previous', 'WatchTV', 'Find', 'Subtitle', 'Teletext',
  'RedColour', 'GreenColour', 'YellowColour', 'BlueColour', 'AmbilightOnOff',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
]);

const z = { an: null, lautstaerke: null, stumm: null, geprueft: 0, einschaltenUm: 0, einschaltenFehler: null };

export const tvEingerichtet = () => IP.test(config.tv.ip);
const basis = () => `http://${config.tv.ip}:1925/6`;

async function api(pfad, daten, timeout = 3000) {
  if (daten === undefined) return holenJson(basis() + pfad, { timeout });
  const { res } = await holen(basis() + pfad, { method: 'POST', body: JSON.stringify(daten), headers: { 'Content-Type': 'application/json' }, timeout });
  if (!res.ok) throw new Error(`Fernseher antwortet mit ${res.status}`);
  return true;
}

// Alle 15 s aus index.mjs: an/aus und Lautstärke.
export async function tvAbfragen() {
  if (!tvEingerichtet()) return;
  try {
    const p = await api('/powerstate', undefined, 2500);
    z.an = p.powerstate === 'On';
    if (z.an) {
      try { const v = await api('/audio/volume', undefined, 2500); z.lautstaerke = v.current ?? null; z.stumm = !!v.muted; } catch {}
    }
  } catch {
    z.an = false; // nicht erreichbar = Standby (WLAN schläft)
  }
  z.geprueft = Date.now();
}

function fehler(text, status = 400) {
  const e = new Error(text);
  e.status = status;
  return e;
}

export async function tvTaste(taste) {
  if (!tvEingerichtet()) throw fehler('TV_IP fehlt in der .env');
  if (!TASTEN.has(taste)) throw fehler('Unbekannte Taste');
  try { await api('/input/key', { key: taste }); } catch { throw fehler('Fernseher nicht erreichbar (ist er an?)', 409); }
  if (taste === 'Standby') { z.an = false; ereignis('info', `${config.tv.name} ausgeschaltet`); }
  if (taste === 'VolumeUp' || taste === 'VolumeDown' || taste === 'Mute') tvAbfragen().catch(() => {});
}

export async function tvLautstaerke(wert) {
  if (!tvEingerichtet()) throw fehler('TV_IP fehlt in der .env');
  const n = Math.max(0, Math.min(60, Math.round(Number(wert))));
  if (!Number.isFinite(n)) throw fehler('Ungültige Lautstärke');
  try { await api('/audio/volume', { muted: false, current: n }); } catch { throw fehler('Fernseher nicht erreichbar (ist er an?)', 409); }
  z.lautstaerke = n;
  z.stumm = false;
}

export async function tvEinschalten() {
  if (!tvEingerichtet()) throw fehler('TV_IP fehlt in der .env');
  const ip = config.tv.ip;
  // Läuft er schon (oder ist das WLAN wach), reicht der Befehl.
  try { await api('/powerstate', { powerstate: 'On' }, 2500); z.an = true; return { ok: true }; } catch {}
  if (!MAC.test(config.tv.mac)) throw fehler('TV_MAC fehlt in der .env (zum Aufwecken nötig)');
  z.einschaltenUm = Date.now();
  z.einschaltenFehler = null;
  // Der schlafende Fernseher beantwortet keine ARP-Anfragen: MAC fest eintragen, damit das Paket direkt ankommt.
  const mac = config.tv.mac.replace(/-/g, ':').toLowerCase();
  await aufHost('sh', ['-c', `d=$(ip route get ${ip} | grep -o 'dev [^ ]*' | cut -d' ' -f2); ip neigh replace ${ip} lladdr ${mac} dev "$d" nud permanent`], { timeout: 5000 }).catch(() => {});
  const subnetz = config.tv.broadcast || ip.replace(IP, '$1.$2.$3.255');
  await wolSenden(mac, ['255.255.255.255', subnetz, ip]);
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      await api('/powerstate', { powerstate: 'On' }, 2500);
      z.an = true;
      z.einschaltenUm = 0;
      ereignis('info', `${config.tv.name} eingeschaltet`);
      return { ok: true };
    } catch {}
  }
  z.einschaltenUm = 0;
  z.einschaltenFehler = 'Fernseher reagiert nicht – wahrscheinlich im tiefen Standby. Bitte mit der Fernbedienung einschalten.';
  throw fehler(z.einschaltenFehler, 409);
}

export function tvSnapshot() {
  if (!tvEingerichtet()) return { eingerichtet: false, name: config.tv.name, an: null, lautstaerke: null, stumm: null, schaltetEin: false, kannWecken: false };
  return {
    eingerichtet: true,
    name: config.tv.name,
    an: z.geprueft ? z.an : null,
    lautstaerke: z.lautstaerke,
    stumm: z.stumm,
    schaltetEin: !!z.einschaltenUm,
    kannWecken: MAC.test(config.tv.mac),
  };
}
