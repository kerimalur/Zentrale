// Die sechs Dienste: Erreichbarkeit + Kennzahlen aus ihren Schnittstellen.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from '../config.mjs';
import { holen, holenJson } from '../util.mjs';

const basis = (port) => `http://127.0.0.1:${port}`;
const dienst = (id) => config.dienste.find((d) => d.id === id);

// ---------- Erreichbarkeit ----------
export async function pruefeDienst(d) {
  try {
    const { res, ms } = await holen(basis(d.port) + d.check, { timeout: 5000, redirect: 'manual' });
    await res.arrayBuffer().catch(() => {});
    return { up: res.status < 500, ms, http: res.status };
  } catch (e) {
    return { up: false, ms: null, http: null, fehler: e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message };
  }
}

// ---------- Pi-hole 6 ----------
let piSid = null;
let piSidBis = 0;

async function piholeAuth() {
  const url = basis(dienst('pihole').port) + '/api/auth';
  const j = await holenJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: config.pihole.passwort }) });
  piSid = j?.session?.sid || null;
  piSidBis = Date.now() + Math.max(60, (j?.session?.validity || 1800) - 60) * 1000;
}

async function piholeApi(p, nochmal = true) {
  if (config.pihole.passwort && (!piSid || Date.now() > piSidBis)) await piholeAuth();
  const headers = piSid ? { 'X-FTL-SID': piSid } : {};
  try {
    return await holenJson(basis(dienst('pihole').port) + '/api' + p, { headers });
  } catch (e) {
    if ((e.status === 401 || e.status === 403) && nochmal && config.pihole.passwort) {
      piSid = null;
      return piholeApi(p, false);
    }
    throw e;
  }
}

export async function piholeDaten() {
  const [sum, top] = await Promise.all([piholeApi('/stats/summary'), piholeApi('/stats/top_clients?count=50').catch(() => null)]);
  return {
    anfragen: sum?.queries?.total ?? null,
    geblockt: sum?.queries?.blocked ?? null,
    prozent: sum?.queries?.percent_blocked ?? null,
    clients: (top?.clients || []).map((c) => ({ ip: c.ip, name: c.name || '', anzahl: c.count })),
  };
}

// ---------- Syncthing ----------
async function stApi(p) {
  return holenJson(basis(dienst('syncthing').port) + '/rest' + p, { headers: { 'X-API-Key': config.syncthing.apiKey } });
}

export async function syncthingDaten() {
  if (!config.syncthing.apiKey) return null;
  const [status, geraete, verbindungen, stats, ordner, ordnerStats] = await Promise.all([
    stApi('/system/status'), stApi('/config/devices'), stApi('/system/connections'), stApi('/stats/device'), stApi('/config/folders'), stApi('/stats/folder'),
  ]);
  const ich = status.myID;
  const namen = Object.fromEntries(geraete.map((g) => [g.deviceID, g.name || g.deviceID.slice(0, 7)]));
  const geraeteListe = geraete
    .filter((g) => g.deviceID !== ich)
    .map((g) => ({ id: g.deviceID, name: namen[g.deviceID], verbunden: !!verbindungen.connections?.[g.deviceID]?.connected, zuletzt: stats[g.deviceID]?.lastSeen || null }));

  const ordnerListe = [];
  for (const o of ordner) {
    const fehler = await stApi(`/folder/errors?folder=${encodeURIComponent(o.id)}`).catch(() => ({ errors: [] }));
    const partner = [];
    for (const d of o.devices || []) {
      if (d.deviceID === ich) continue;
      const c = await stApi(`/db/completion?folder=${encodeURIComponent(o.id)}&device=${encodeURIComponent(d.deviceID)}`).catch(() => null);
      const g = geraeteListe.find((x) => x.id === d.deviceID);
      partner.push({ geraet: namen[d.deviceID] || d.deviceID.slice(0, 7), prozent: c ? Math.floor(c.completion) : null, verbunden: g?.verbunden ?? false, zuletzt: g?.zuletzt || null });
    }
    const st = ordnerStats[o.id] || {};
    ordnerListe.push({
      id: o.id,
      label: o.label || o.id,
      pausiert: !!o.paused,
      partner,
      fehler: (fehler.errors || []).length,
      fehlerText: (fehler.errors || [])[0]?.error || null,
      letzteDatei: st.lastFile?.at && !st.lastFile.at.startsWith('1970') ? { at: st.lastFile.at, name: st.lastFile.filename } : null,
      letzterScan: st.lastScan || null,
    });
  }
  return { geraete: geraeteListe, ordner: ordnerListe };
}

// ---------- Jellyfin ----------
const jfHeaders = () => ({ Authorization: `MediaBrowser Token="${config.jellyfin.apiKey}"`, 'Content-Type': 'application/json' });

export async function jellyfinDaten() {
  if (!config.jellyfin.apiKey) return null;
  const b = basis(dienst('jellyfin').port);
  const [zahlen, sitzungen] = await Promise.all([holenJson(b + '/Items/Counts', { headers: jfHeaders() }), holenJson(b + '/Sessions?activeWithinSeconds=900', { headers: jfHeaders() })]);
  const laeuft = (sitzungen || [])
    .filter((s) => s.NowPlayingItem)
    .map((s) => ({ nutzer: s.UserName, titel: s.NowPlayingItem.SeriesName ? `${s.NowPlayingItem.SeriesName} · ${s.NowPlayingItem.Name}` : s.NowPlayingItem.Name, geraet: s.DeviceName, pausiert: !!s.PlayState?.IsPaused }));
  return { filme: zahlen.MovieCount || 0, serien: zahlen.SeriesCount || 0, alben: zahlen.MusicAlbumCount || zahlen.AlbumCount || 0, songs: zahlen.SongCount || 0, laeuft };
}

export async function jellyfinNutzerAnlegen(name, passwort) {
  if (!config.jellyfin.apiKey) throw new Error('JELLYFIN_API_KEY fehlt');
  const j = await holenJson(basis(dienst('jellyfin').port) + '/Users/New', { method: 'POST', headers: jfHeaders(), body: JSON.stringify({ Name: name, Password: passwort }) });
  return j.Id;
}

export async function jellyfinNutzerLoeschen(id) {
  if (!config.jellyfin.apiKey || !id) return;
  const { res } = await holen(basis(dienst('jellyfin').port) + '/Users/' + encodeURIComponent(id), { method: 'DELETE', headers: jfHeaders() });
  if (!res.ok && res.status !== 404) throw new Error(`Jellyfin ${res.status}`);
}

// ---------- Nextcloud ----------
function httpGetMitHost(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers, timeout: 8000 }, (res) => {
      let roh = '';
      res.on('data', (c) => (roh += c));
      res.on('end', () => resolve({ status: res.statusCode, text: roh }));
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end();
  });
}

export async function nextcloudDaten() {
  if (!config.nextcloud.token) return null;
  const r = await httpGetMitHost(basis(dienst('nextcloud').port) + '/ocs/v2.php/apps/serverinfo/api/v1/info?format=json&skipApps=true&skipUpdate=true', {
    Host: config.hostName,
    'NC-Token': config.nextcloud.token,
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
  });
  if (r.status >= 400) throw new Error(`Nextcloud ${r.status}`);
  const d = JSON.parse(r.text)?.ocs?.data;
  return {
    dateien: d?.nextcloud?.storage?.num_files ?? null,
    nutzer: d?.nextcloud?.storage?.num_users ?? null,
    aktiv24h: d?.activeUsers?.last24hours ?? null,
    version: d?.nextcloud?.system?.version ?? null,
  };
}

// ---------- Vaultwarden ----------
export function vaultwardenDaten() {
  for (const p of ['data/db.sqlite3', 'db.sqlite3', 'vw-data/db.sqlite3']) {
    try {
      const s = fs.statSync(hostPath(path.join(config.vaultwarden.daten, p)));
      return { dbGroesse: s.size, dbPfad: path.join(config.vaultwarden.daten, p), geaendert: s.mtimeMs };
    } catch {}
  }
  return null;
}

// ---------- Uptime Kuma ----------
export async function kumaDaten() {
  if (!config.kuma.apiKey) return null;
  const auth = Buffer.from(':' + config.kuma.apiKey).toString('base64');
  const { res } = await holen(basis(dienst('kuma').port) + '/metrics', { headers: { Authorization: 'Basic ' + auth } });
  if (!res.ok) throw new Error(`Kuma ${res.status}`);
  const text = await res.text();
  const monitore = [];
  for (const z of text.split('\n')) {
    const m = z.match(/^monitor_status\{([^}]*)\}\s+(\d+)/);
    if (!m) continue;
    const name = (m[1].match(/monitor_name="([^"]*)"/) || [])[1] || '?';
    monitore.push({ name, status: Number(m[2]) }); // 1 = oben, 0 = unten, 2 = wartend, 3 = Wartung
  }
  return { gesamt: monitore.length, oben: monitore.filter((m) => m.status === 1).length, unten: monitore.filter((m) => m.status === 0).map((m) => m.name) };
}
