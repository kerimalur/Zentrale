// Hilfsfunktionen: HTTP mit Zeitlimit, Unix-Socket-Anfragen, Befehle ausführen, Zeit.
import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from './config.mjs';

export async function holen(url, { timeout = 4000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const ms = Math.round(performance.now() - start);
    return { res, ms };
  } finally {
    clearTimeout(t);
  }
}

export async function holenJson(url, opts = {}) {
  const { res } = await holen(url, opts);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} bei ${url.replace(/\?.*/, '')}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// HTTP über Unix-Socket (Docker, Tailscale).
export function socketAnfrage(socketPath, { method = 'GET', path, headers = {}, body, timeout = 5000 }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, method, path, headers: { Host: 'localhost', ...headers }, timeout }, (res) => {
      let roh = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (roh += c));
      res.on('end', () => {
        let json = null;
        try { json = roh ? JSON.parse(roh) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text: roh });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

export function ausfuehren(cmd, args, { timeout = 30_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || err?.message || '') });
    });
  });
}

// Befehl direkt auf dem Pi ausführen (nicht im Container).
export function aufHost(cmd, args = [], opts) {
  return ausfuehren('nsenter', ['-t', '1', '-m', '-u', '-i', '-n', '-p', '--', cmd, ...args], opts);
}

export function lesen(p, fallback = null) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return fallback; }
}

export function existiert(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

// Uhrzeit/Tag in der Zeitzone des Pi.
const fmtZeit = new Intl.DateTimeFormat('de-CH', { timeZone: config.zeitzone, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTag = new Intl.DateTimeFormat('sv-SE', { timeZone: config.zeitzone, year: 'numeric', month: '2-digit', day: '2-digit' });

export const uhrzeit = (t = Date.now()) => fmtZeit.format(new Date(t));
export const tagKey = (t = Date.now()) => fmtTag.format(new Date(t));
export const minutenJetzt = (t = Date.now()) => {
  const [h, m] = uhrzeit(t).split(':').map(Number);
  return h * 60 + m;
};
export const zuMinuten = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ist unter diesem Pfad auf dem Pi ein eigenes Laufwerk eingehängt? (anderes Gerät als der übergeordnete Ordner)
export function eingehaengt(pfad) {
  try {
    return fs.statSync(hostPath(pfad)).dev !== fs.statSync(hostPath(path.dirname(pfad))).dev;
  } catch {
    return false;
  }
}
