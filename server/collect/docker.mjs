// Docker über den Socket: Container-Status, Pause/Fortsetzen, Neustart, Speicherbedarf.
import fs from 'node:fs';
import http from 'node:http';
import { socketAnfrage } from '../util.mjs';

const SOCK = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

async function api(method, path, body) {
  const r = await socketAnfrage(SOCK, {
    method,
    path,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body,
    timeout: method === 'GET' ? 5000 : 60_000,
  });
  if (r.status >= 400) {
    const e = new Error(r.json?.message || `Docker ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json;
}

export async function container() {
  const liste = await api('GET', '/containers/json?all=1');
  return liste.map((c) => ({
    id: c.Id,
    name: (c.Names?.[0] || '').replace(/^\//, ''),
    image: c.Image,
    state: c.State, // running | paused | exited | restarting ...
    status: c.Status,
  }));
}

export async function details(name) {
  const c = await api('GET', `/containers/${encodeURIComponent(name)}/json`);
  return { restartCount: c.RestartCount ?? 0, gestartet: c.State?.StartedAt || null, state: c.State?.Status, health: c.State?.Health?.Status || null };
}

export const pausieren = (name) => api('POST', `/containers/${encodeURIComponent(name)}/pause`);
export const fortsetzen = (name) => api('POST', `/containers/${encodeURIComponent(name)}/unpause`);
export const neustarten = (name) => api('POST', `/containers/${encodeURIComponent(name)}/restart?t=10`);
// 304 = war schon gestoppt/gestartet → kein Fehler
export const stoppen = (name) => api('POST', `/containers/${encodeURIComponent(name)}/stop?t=20`).catch((e) => { if (e.status !== 304) throw e; });
export const starten = (name) => api('POST', `/containers/${encodeURIComponent(name)}/start`).catch((e) => { if (e.status !== 304) throw e; });

export async function dockerSpeicher() {
  const d = await api('GET', '/system/df');
  const bilder = (d.Images || []).reduce((a, i) => a + (i.Size || 0), 0);
  const volumes = (d.Volumes || []).reduce((a, v) => a + Math.max(0, v.UsageData?.Size || 0), 0);
  const schicht = d.LayersSize || bilder;
  return schicht + volumes;
}

// Befehl in einem Container ausführen. Docker liefert stdout/stderr gemischt mit 8-Byte-Köpfen; die werden hier getrennt.
async function execStream(name, cmd, aufStdout, timeout, env) {
  const ex = await api('POST', `/containers/${encodeURIComponent(name)}/exec`, { Cmd: cmd, AttachStdout: true, AttachStderr: true, ...(env ? { Env: env } : {}) });
  let fehlerText = '';
  await new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCK, method: 'POST', path: `/exec/${ex.Id}/start`, headers: { Host: 'localhost', 'Content-Type': 'application/json' }, timeout }, (res) => {
      let puffer = Buffer.alloc(0);
      res.on('data', (chunk) => {
        puffer = Buffer.concat([puffer, chunk]);
        while (puffer.length >= 8) {
          const typ = puffer[0];
          const laenge = puffer.readUInt32BE(4);
          if (puffer.length < 8 + laenge) break;
          const teil = puffer.subarray(8, 8 + laenge);
          if (typ === 1) aufStdout(teil);
          else if (typ === 2 && fehlerText.length < 4000) fehlerText += teil.toString();
          puffer = puffer.subarray(8 + laenge);
        }
      });
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end(JSON.stringify({ Detach: false, Tty: false }));
  });
  const info = await api('GET', `/exec/${ex.Id}/json`);
  return { exitCode: info.ExitCode, fehler: fehlerText.trim() };
}

// Ausgabe in eine Datei schreiben (z. B. Datenbank-Sicherung).
export async function execZuDatei(name, cmd, zielDatei, { timeout = 900_000 } = {}) {
  const out = fs.createWriteStream(zielDatei);
  try {
    return await execStream(name, cmd, (teil) => out.write(teil), timeout);
  } finally {
    await new Promise((r) => out.end(r));
  }
}

// Ausgabe als Text zurückgeben (höchstens 256 KB).
export async function execAusgabe(name, cmd, { timeout = 20_000, env } = {}) {
  let text = '';
  const r = await execStream(name, cmd, (teil) => { if (text.length < 256 * 1024) text += teil.toString(); }, timeout, env);
  return { ...r, ausgabe: text };
}
