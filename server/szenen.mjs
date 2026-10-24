// Szenen: Normal / Filmabend / Nacht – pausiert Container, setzt CPU-Modus, schickt HDD schlafen.
import fs from 'node:fs';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { container, pausieren, fortsetzen } from './collect/docker.mjs';
import { governorPfad } from './collect/host.mjs';
import { ereignis } from './ereignisse.mjs';
import { lesen, ausfuehren } from './util.mjs';
import { qbDrosseln } from './collect/medien.mjs';

let wechselLaeuft = false;

const ANZEIGE = { nextcloud: 'Nextcloud', 'nextcloud-db': 'Nextcloud-Datenbank', jellyfin: 'Jellyfin', syncthing: 'Syncthing' };

// Was eine Szene konkret tut – für die Anzeige und das Ereignis.
export function wirkung(id) {
  const s = config.szenen[id];
  const w = [];
  const pausiert = s.pause.filter((n) => n !== 'nextcloud-db').map((n) => ANZEIGE[n] || n);
  w.push(pausiert.length ? `Pausiert: ${pausiert.join(', ')}` : 'Alle Dienste laufen');
  w.push(s.governor === 'performance' ? 'CPU: volle Leistung' : s.governor === 'powersave' ? 'CPU: Stromsparmodus' : 'CPU: normal');
  if (config.medien.filmabendDrosseln && config.medien.qbit.passwort) w.push(id === 'film' ? 'Downloads gedrosselt' : 'Downloads volle Geschwindigkeit');
  if (s.luefterMax !== undefined) w.push(`Lüfter höchstens ${s.luefterMax} %`);
  if (s.hddSchlaf && config.backup.disk) w.push('Backup-HDD schläft');
  return w;
}

export function szenenListe() {
  return Object.entries(config.szenen).map(([id, s]) => ({ id, name: s.name, wirkung: wirkung(id) }));
}

export function standardGovernorMerken() {
  const gp = governorPfad();
  if (!gp) return;
  if (!db().standardGovernor && db().szene.id === 'normal') {
    db().standardGovernor = lesen(gp) || 'ondemand';
    save();
  }
}

function governorSetzen(ziel) {
  const gp = governorPfad();
  if (!gp || !ziel) return;
  const verfuegbar = (lesen(gp.replace('scaling_governor', 'scaling_available_governors'), '') || '').split(/\s+/);
  if (!verfuegbar.includes(ziel)) return;
  try { fs.writeFileSync(gp, ziel); } catch (e) { console.warn('[szene] Governor:', e.message); }
}

export async function hddSchlafen() {
  if (!config.backup.disk || !db().einstellungen.hddSchlaf || db().backup.laeuft) return;
  await ausfuehren('hdparm', ['-y', config.backup.disk], { timeout: 15_000 });
}

export async function hddTimerSetzen() {
  if (!config.backup.disk) return;
  // -S 240 = nach 20 Min ohne Zugriff schlafen, -S 0 = nie
  await ausfuehren('hdparm', ['-S', db().einstellungen.hddSchlaf ? '240' : '0', config.backup.disk], { timeout: 15_000 });
}

export async function szeneSetzen(id, { auto = false } = {}) {
  const s = config.szenen[id];
  if (!s) throw new Error('Unbekannte Szene');
  if (wechselLaeuft) throw new Error('Szenenwechsel läuft gerade');
  wechselLaeuft = true;
  const fehler = [];
  try {
    const liste = await container();
    const status = Object.fromEntries(liste.map((c) => [c.name, c.state]));
    const alleBetroffenen = [...new Set(Object.values(config.szenen).flatMap((x) => x.pause))];

    // Fortsetzen: Datenbanken zuerst.
    const fortsetzenListe = alleBetroffenen.filter((n) => !s.pause.includes(n)).sort((a, b) => (b.includes('-db') ? 1 : 0) - (a.includes('-db') ? 1 : 0));
    for (const n of fortsetzenListe) {
      if (status[n] === 'paused') await fortsetzen(n).catch((e) => fehler.push(`${n}: ${e.message}`));
    }
    // Pausieren: in der angegebenen Reihenfolge (App vor Datenbank).
    for (const n of s.pause) {
      if (status[n] === 'running') await pausieren(n).catch((e) => fehler.push(`${n}: ${e.message}`));
    }
    governorSetzen(s.governor || db().standardGovernor || 'ondemand');
    if (s.hddSchlaf) await hddSchlafen();
    // Filmabend: Downloads auf die "alternativen" Geschwindigkeiten von qBittorrent drosseln.
    if (config.medien.filmabendDrosseln) await qbDrosseln(id === 'film').catch((e) => fehler.push(`qBittorrent: ${e.message}`));

    db().szene = { id, seit: Date.now(), auto };
    save();
    const art = id === 'nacht' ? 'nacht' : id === 'film' ? 'film' : 'info';
    ereignis(fehler.length ? 'warnung' : art, `${s.name} ${auto ? 'automatisch ' : ''}aktiviert · ${wirkung(id).join(' · ')}${fehler.length ? ' · Fehler: ' + fehler.join(', ') : ''}`);
    return { ok: fehler.length === 0, fehler };
  } finally {
    wechselLaeuft = false;
  }
}
