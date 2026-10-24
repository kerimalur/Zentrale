// SSH-Konsole im Browser: WebSocket <-> SSH zum Pi (mit eigenem Schlüssel).
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { config } from './config.mjs';
import { istAngemeldet } from './auth.mjs';

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

export function terminalUpgrade(req, socket, head) {
  // Nur Verbindungen von der eigenen Seite zulassen.
  const origin = req.headers.origin || '';
  const hostname = (h) => String(h || '').split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
  let originHost = '';
  try { originHost = origin ? new URL(origin).hostname.toLowerCase() : ''; } catch {}
  const erlaubt = [hostname(req.headers['x-forwarded-host']), hostname(req.headers.host), config.hostName.toLowerCase(), 'localhost', '127.0.0.1'];
  const originOk = !origin || erlaubt.includes(originHost);
  if (!istAngemeldet(req) || !originOk) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => verbinden(ws));
}

function verbinden(ws) {
  const senden = (typ, d) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ typ, d }));
  let key;
  try {
    key = fs.readFileSync(config.ssh.keyPath);
  } catch {
    senden('fehler', `SSH-Schlüssel fehlt (${config.ssh.keyPath}). Siehe Anleitung Schritt 3.`);
    ws.close();
    return;
  }
  const conn = new Client();
  let stream = null;
  let groesse = { cols: 100, rows: 30 };

  conn.on('ready', () => {
    senden('status', 'verbunden');
    conn.shell({ term: 'xterm-256color', ...groesse }, (err, s) => {
      if (err) { senden('fehler', err.message); ws.close(); return; }
      stream = s;
      s.on('data', (d) => senden('daten', d.toString('utf8')));
      s.stderr.on('data', (d) => senden('daten', d.toString('utf8')));
      s.on('close', () => { senden('status', 'getrennt'); ws.close(); conn.end(); });
    });
  });
  conn.on('error', (e) => { senden('fehler', 'SSH: ' + e.message); ws.close(); });
  conn.connect({ host: config.ssh.host, port: config.ssh.port, username: config.ssh.user, privateKey: key, readyTimeout: 10_000, keepaliveInterval: 20_000 });

  ws.on('message', (roh) => {
    let m;
    try { m = JSON.parse(roh.toString()); } catch { return; }
    if (m.typ === 'daten' && stream) stream.write(m.d);
    if (m.typ === 'groesse' && Number.isInteger(m.cols) && Number.isInteger(m.rows)) {
      groesse = { cols: Math.min(400, m.cols), rows: Math.min(200, m.rows) };
      stream?.setWindow(groesse.rows, groesse.cols, 0, 0);
    }
  });
  ws.on('close', () => { try { stream?.end(); } catch {} conn.end(); });
}
