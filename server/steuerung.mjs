// Steuerung: Notbetrieb, einzelne Dienste ein/aus, Pi neu starten/ausschalten.
// Wichtige Dienste (Nextcloud, Vaultwarden, Pi-hole, Syncthing, Zentrale, Tailscale) lassen sich hier bewusst NICHT abschalten.
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { container, details, stoppen, starten, fortsetzen, pausieren, neustarten } from './collect/docker.mjs';
import { ereignis } from './ereignisse.mjs';
import { aufHost } from './util.mjs';

let laeuft = false;

// Was abgeschaltet werden darf – Reihenfolge = Reihenfolge beim Starten.
export function abschaltbar() {
  const m = config.medien;
  const NAMEN = { jellyfin: 'Jellyfin', 'uptime-kuma': 'Uptime Kuma', flaresolverr: 'FlareSolverr' };
  const liste = [
    { container: m.vpnContainer, name: 'Gluetun (VPN)', gruppe: 'Downloads' },
    { container: m.downloadContainer, name: 'qBittorrent', gruppe: 'Downloads' },
    ...m.arr.map((a) => ({ container: a.container, name: a.name, gruppe: 'Medien' })),
    { container: m.seerr.container, name: 'Seerr', gruppe: 'Medien' },
    ...m.weitere.map((n) => ({ container: n, name: NAMEN[n] || n, gruppe: 'Medien' })),
    { container: 'jellyfin', name: 'Jellyfin', gruppe: 'Streaming' },
    { container: 'uptime-kuma', name: 'Uptime Kuma', gruppe: 'Überwachung' },
  ];
  const extra = (process.env.ABSCHALTBAR || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of extra) if (!liste.some((x) => x.container === n)) liste.push({ container: n, name: n, gruppe: 'Weitere' });
  const gesperrt = new Set(GESCHUETZT.map((g) => g.container));
  return liste.filter((x) => x.container && !gesperrt.has(x.container));
}

export const GESCHUETZT = [
  { container: null, name: 'Tailscale', grund: 'Dein Zugang von unterwegs' },
  { container: 'zentrale', name: 'Zentrale', grund: 'Damit schaltest du alles wieder ein' },
  { container: 'nextcloud', name: 'Nextcloud', grund: 'Deine Daten' },
  { container: 'nextcloud-db', name: 'Nextcloud-Datenbank', grund: 'Gehört zu Nextcloud' },
  { container: 'vaultwarden', name: 'Vaultwarden', grund: 'Passwörter' },
  { container: 'pihole', name: 'Pi-hole', grund: 'DNS – ohne geht das Internet über Tailscale nicht' },
  { container: 'syncthing', name: 'Syncthing', grund: 'Ordner-Synchronisation' },
];

// qBittorrent hängt im Netz von Gluetun: ohne Gluetun kein Start, nach Gluetun-Start neu verbinden.
const VPN = () => config.medien.vpnContainer;
const DL = () => config.medien.downloadContainer;

const aus = () => (db().ausgeschaltet ||= {});
const nb = () => (db().notbetrieb ||= { an: false, seit: null, gestoppt: [] });

async function zustaende() {
  return Object.fromEntries((await container()).map((c) => [c.name, c.state]));
}

async function sicherStoppen(name, st) {
  if (st[name] === 'paused') await fortsetzen(name).catch(() => {});
  await stoppen(name);
}

async function warteGesund(name, maxMs = 60_000) {
  const ende = Date.now() + maxMs;
  while (Date.now() < ende) {
    const d = await details(name).catch(() => null);
    if (d && d.state === 'running' && (d.health === null || d.health === 'healthy')) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// Startet eine Liste in sinnvoller Reihenfolge (VPN zuerst, dann qBittorrent, dann der Rest).
async function startenGeordnet(namen, fehler) {
  const st = await zustaende();
  const reihenfolge = [...namen].sort((a, b) => rang(a) - rang(b));
  let vpnNeu = false;
  for (const n of reihenfolge) {
    if (st[n] === undefined) continue;
    if (st[n] === 'running') continue;
    try {
      if (st[n] === 'paused') await fortsetzen(n);
      else await starten(n);
      if (n === VPN()) { vpnNeu = true; await warteGesund(n); }
    } catch (e) { fehler.push(`${n}: ${e.message}`); }
  }
  // Lief qBittorrent schon, während Gluetun neu gestartet wurde, hängt es im alten Netz → neu starten.
  if (vpnNeu && !reihenfolge.includes(DL()) && st[DL()] === 'running') await neustarten(DL()).catch((e) => fehler.push(`${DL()}: ${e.message}`));
}
const rang = (n) => (n === VPN() ? 0 : n === DL() ? 1 : 2);

async function stoppenGeordnet(namen, fehler) {
  const st = await zustaende();
  const reihenfolge = [...namen].sort((a, b) => rang(b) - rang(a)); // erst Rest, dann qBittorrent, VPN zuletzt
  const gestoppt = [];
  for (const n of reihenfolge) {
    if (!st[n] || !['running', 'paused', 'restarting'].includes(st[n])) continue;
    try { await sicherStoppen(n, st); gestoppt.push(n); } catch (e) { fehler.push(`${n}: ${e.message}`); }
  }
  return gestoppt;
}

function exklusiv(fn) {
  return async (...a) => {
    if (laeuft) throw new Error('Es läuft gerade schon eine Schaltung – kurz warten');
    laeuft = true;
    try { return await fn(...a); } finally { laeuft = false; }
  };
}

// ---------- Notbetrieb ----------
export const notbetriebSetzen = exklusiv(async (an) => {
  const fehler = [];
  const n = nb();
  if (an) {
    if (n.an) return { ok: true, fehler };
    const gestoppt = await stoppenGeordnet(abschaltbar().map((x) => x.container), fehler);
    for (const c of gestoppt) aus()[c] = { seit: Date.now(), durch: 'notbetrieb' };
    db().notbetrieb = { an: true, seit: Date.now(), gestoppt };
    save();
    const namen = gestoppt.map((c) => abschaltbar().find((x) => x.container === c)?.name || c);
    ereignis('warnung', `Notbetrieb an · gestoppt: ${namen.join(', ') || 'nichts (lief schon nichts)'}${fehler.length ? ' · Fehler: ' + fehler.join(', ') : ''}`, { telegram: true, schluessel: 'notbetrieb' });
  } else {
    if (!n.an) return { ok: true, fehler };
    // Nur wieder starten, was der Notbetrieb gestoppt hat – nicht, was du vorher selbst ausgeschaltet hast.
    const wieder = (n.gestoppt || []).filter((c) => aus()[c]?.durch === 'notbetrieb');
    await startenGeordnet(wieder, fehler);
    for (const c of wieder) if (!fehler.some((f) => f.startsWith(c + ':'))) delete aus()[c];
    // Aktive Szene respektieren (z. B. Nacht pausiert Jellyfin).
    const szene = config.szenen[db().szene?.id];
    for (const c of szene?.pause || []) if (wieder.includes(c)) await pausieren(c).catch(() => {});
    db().notbetrieb = { an: false, seit: null, gestoppt: [] };
    save();
    ereignis(fehler.length ? 'warnung' : 'ok', `Notbetrieb aus · alles läuft wieder${fehler.length ? ' · Fehler: ' + fehler.join(', ') : ''}`, { telegram: true, schluessel: 'notbetrieb' });
  }
  return { ok: fehler.length === 0, fehler };
});

// ---------- Einzelner Dienst ----------
export const dienstSchalten = exklusiv(async (containerName, an) => {
  const d = abschaltbar().find((x) => x.container === containerName);
  if (!d) throw new Error('Dieser Dienst ist geschützt oder unbekannt');
  const fehler = [];
  if (an) {
    const liste = [containerName];
    if (containerName === DL()) liste.unshift(VPN()); // qBittorrent braucht das VPN
    // Wurde qBittorrent zusammen mit dem VPN ausgeschaltet, kommt es mit dem VPN auch wieder.
    for (const [c, v] of Object.entries(aus())) if (v.mit === containerName && !liste.includes(c)) liste.push(c);
    await startenGeordnet(liste, fehler);
    for (const c of liste) if (!fehler.some((f) => f.startsWith(c + ':'))) delete aus()[c];
    ereignis('info', `${d.name} eingeschaltet (von dir)${containerName === DL() ? ' · VPN mitgestartet' : ''}${fehler.length ? ' · Fehler: ' + fehler.join(', ') : ''}`);
  } else {
    const liste = [containerName];
    if (containerName === VPN()) liste.unshift(DL()); // ohne VPN hätte qBittorrent kein Netz → mit ausschalten
    const gestoppt = await stoppenGeordnet(liste, fehler);
    for (const c of liste) {
      if (!gestoppt.includes(c) && aus()[c]) continue;
      aus()[c] = { seit: Date.now(), durch: 'du', ...(c !== containerName && gestoppt.includes(c) ? { mit: containerName } : {}) };
    }
    ereignis('info', `${d.name} ausgeschaltet (von dir)${containerName === VPN() ? ' · qBittorrent mit ausgeschaltet' : ''}${fehler.length ? ' · Fehler: ' + fehler.join(', ') : ''}`);
  }
  save();
  return { ok: fehler.length === 0, fehler };
});

// Wenn ein ausgeschalteter Container von woanders wieder gestartet wurde (z. B. docker compose up), Vermerk löschen.
export function abgleichen(liste) {
  const st = Object.fromEntries(liste.map((c) => [c.name, c.state]));
  let geaendert = false;
  for (const c of Object.keys(aus())) {
    if (st[c] === 'running' || st[c] === undefined) { delete aus()[c]; geaendert = true; }
  }
  if (geaendert) save();
}

export function ausgeschaltet(name) {
  return aus()[name] || null;
}

// ---------- Pi ----------
export async function piNeustarten() {
  ereignis('warnung', 'Pi wird neu gestartet (von dir) · in etwa 2 Minuten wieder da', { telegram: true, schluessel: 'pi-neustart' });
  save();
  setTimeout(() => aufHost('systemctl', ['reboot'], { timeout: 30_000 }).catch(() => {}), 1500);
}

export async function piAusschalten() {
  ereignis('fehler', 'Pi wird ausgeschaltet (von dir) · einschalten nur zu Hause: Netzteil aus- und wieder einstecken', { telegram: true, schluessel: 'pi-aus' });
  save();
  setTimeout(() => aufHost('systemctl', ['poweroff'], { timeout: 30_000 }).catch(() => {}), 1500);
}

// ---------- Für die Oberfläche ----------
export function steuerungSnapshot(containerListe, tailscaleAktiv) {
  const st = Object.fromEntries(containerListe.map((c) => [c.name, c.state]));
  return {
    notbetrieb: { an: !!nb().an, seit: nb().seit || null },
    dienste: abschaltbar()
      .filter((x) => st[x.container] !== undefined)
      .map((x) => {
        const s = st[x.container];
        const v = aus()[x.container];
        return {
          container: x.container,
          name: x.name,
          gruppe: x.gruppe,
          zustand: s === 'running' ? 'an' : s === 'paused' ? 'pausiert' : 'aus',
          durch: s === 'running' ? null : v?.durch || null,
          seit: v?.seit || null,
        };
      }),
    geschuetzt: GESCHUETZT.filter((g) => g.container === null || st[g.container] !== undefined).map((g) => ({
      name: g.name,
      grund: g.grund,
      zustand: g.container === null ? (tailscaleAktiv === false ? 'aus' : 'an') : st[g.container] === 'running' ? 'an' : st[g.container] === 'paused' ? 'pausiert' : 'aus',
    })),
  };
}
