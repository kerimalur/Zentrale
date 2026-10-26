// Kerims Zentrale – Server: Oberfläche ausliefern, API, SSH-Konsole, Hintergrund-Aufgaben.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDataDir } from './config.mjs';
import { load, db, save } from './store.mjs';
import { istAngemeldet, login, logout } from './auth.mjs';
import { terminalUpgrade } from './terminal.mjs';
import { schnell, mittel, langsam, sehrLangsam, speicherLauf, zeitplan, snapshot, sshNurSchluesselSetzen, manuelleSzene, laufwerkeListe, cloudJetzt, tsPeers } from './monitor.mjs';
import { ordnerLesen, ordnerGroessen } from './explorer.mjs';
import { szeneSetzen, standardGovernorMerken, hddTimerSetzen } from './szenen.mjs';
import { neustarten } from './collect/docker.mjs';
import { backupStarten, backupEingerichtet } from './backup.mjs';
import { gastAnlegen, gastEntfernen, gaesteStatus } from './gaeste.mjs';
import { luefterInit } from './luefter.mjs';
import { ereignis } from './ereignisse.mjs';
import { notbetriebSetzen, dienstSchalten, piNeustarten, piAusschalten } from './steuerung.mjs';
import { moebelLuefterModus } from './moebelLuefter.mjs';
import { statusBerichtSchreiben } from './statusbericht.mjs';
import { pcWecken, pcAusschalten, pcSchluesselZeile } from './pc.mjs';
import { tvAbfragen, tvTaste, tvLautstaerke, tvEinschalten } from './tv.mjs';
import { garminDaten, garminHistorie } from './collect/garmin.mjs';

ensureDataDir();
load();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const OEFFENTLICH = [/^\/login\/?$/, /^\/_next\//, /^\/manifest\.webmanifest$/, /^\/icon\.svg$/, /^\/favicon\.ico$/];

function json(res, status, daten, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(daten));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let roh = '';
    req.on('data', (c) => { roh += c; if (roh.length > 64 * 1024) { reject(new Error('Zu gross')); req.destroy(); } });
    req.on('end', () => { try { resolve(roh ? JSON.parse(roh) : {}); } catch { reject(new Error('Ungültiges JSON')); } });
    req.on('error', reject);
  });
}

function statisch(req, res, pfad) {
  let p = decodeURIComponent(pfad.split('?')[0]);
  p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  let datei = path.join(config.staticDir, p);
  if (!datei.startsWith(config.staticDir)) { res.writeHead(403); return res.end(); }
  try {
    if (fs.statSync(datei).isDirectory()) datei = path.join(datei, 'index.html');
  } catch {
    if (fs.existsSync(datei + '.html')) datei += '.html';
  }
  fs.readFile(datei, (err, inhalt) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    const ext = path.extname(datei);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': p.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(inhalt);
  });
}

async function api(req, res, url) {
  const m = req.method;
  const p = url.pathname;

  if (p === '/api/login' && m === 'POST') {
    const b = await body(req);
    const r = login(req, b.passwort);
    return r.ok ? json(res, 200, { ok: true }, { 'Set-Cookie': r.cookie }) : json(res, 401, { ok: false, fehler: r.fehler });
  }
  if (p === '/api/me') return json(res, 200, { angemeldet: istAngemeldet(req) });

  if (!istAngemeldet(req)) return json(res, 401, { fehler: 'Nicht angemeldet' });
  // Schutz gegen fremde Seiten: Änderungen nur mit eigenem Header.
  if (m !== 'GET' && req.headers['x-zentrale'] !== '1') return json(res, 403, { fehler: 'Verboten' });

  if (p === '/api/logout' && m === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': logout(req) });
  if (p === '/api/state' && m === 'GET') return json(res, 200, snapshot());

  // ---------- Garmin (Tab «Gesundheit») ----------
  if (p === '/api/garmin/historie' && m === 'GET') {
    try {
      return json(res, 200, await garminHistorie({ frisch: url.searchParams.get('frisch') === '1' }));
    } catch (e) {
      return json(res, 200, { bereit: false, grund: e.message });
    }
  }
  if (p === '/api/garmin' && m === 'GET') {
    try {
      return json(res, 200, await garminDaten({ frisch: url.searchParams.get('frisch') === '1' }));
    } catch (e) {
      return json(res, 200, { bereit: false, grund: e.message });
    }
  }

  if (p === '/api/szene' && m === 'POST') {
    const b = await body(req);
    const r = await szeneSetzen(String(b.id), { auto: false });
    manuelleSzene();
    await schnell().catch(() => {});
    return json(res, 200, r);
  }

  if (p === '/api/einstellungen' && m === 'POST') {
    const b = await body(req);
    const e = db().einstellungen;
    const zeit = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v));
    if (typeof b.nachtAuto === 'boolean') e.nachtAuto = b.nachtAuto;
    if (zeit(b.nachtVon)) e.nachtVon = b.nachtVon;
    if (zeit(b.nachtBis)) e.nachtBis = b.nachtBis;
    if (typeof b.telegram === 'boolean') e.telegram = b.telegram;
    if (typeof b.backupAuto === 'boolean') e.backupAuto = b.backupAuto;
    if (Number.isFinite(b.moebelWarnAb) && b.moebelWarnAb >= 30 && b.moebelWarnAb <= 60) e.moebelWarnAb = Math.round(b.moebelWarnAb);
    if (Number.isFinite(b.luefterAnAb) && b.luefterAnAb >= 20 && b.luefterAnAb <= 45) e.luefterAnAb = Math.round(b.luefterAnAb);
    if (typeof b.hddSchlaf === 'boolean') { e.hddSchlaf = b.hddSchlaf; hddTimerSetzen().catch(() => {}); }
    if (Number.isFinite(b.luefterAusUnter) && b.luefterAusUnter >= 35 && b.luefterAusUnter <= 65) e.luefterAusUnter = Math.round(b.luefterAusUnter);
    save();
    return json(res, 200, { ok: true, einstellungen: e });
  }

  if (p === '/api/ssh-nur-schluessel' && m === 'POST') {
    const b = await body(req);
    const r = await sshNurSchluesselSetzen(!!b.an);
    return json(res, 200, { ok: true, an: r });
  }

  const neu = p.match(/^\/api\/dienst\/([a-z]+)\/neustart$/);
  if (neu && m === 'POST') {
    const d = config.dienste.find((x) => x.id === neu[1]);
    if (!d) return json(res, 404, { fehler: 'Unbekannter Dienst' });
    for (const c of d.extra || []) await neustarten(c).catch(() => {});
    await neustarten(d.container);
    ereignis('info', `${d.name} wurde neu gestartet (von dir)`);
    return json(res, 200, { ok: true });
  }

  // ---------- Explorer (nur lesen) ----------
  if (p === '/api/explorer' && m === 'GET') {
    return json(res, 200, await ordnerLesen(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || '/'));
  }
  if (p === '/api/explorer/groessen' && m === 'GET') {
    return json(res, 200, await ordnerGroessen(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || '/'));
  }

  // ---------- Möbel-Lüfter ----------
  if (p === '/api/luefter' && m === 'POST') {
    const b = await body(req);
    moebelLuefterModus(String(b.modus));
    await schnell().catch(() => {});
    return json(res, 200, { ok: true });
  }

  // ---------- Nextcloud-Übersicht neu laden ----------
  if (p === '/api/cloud/aktualisieren' && m === 'POST') {
    await cloudJetzt();
    return json(res, 200, { ok: true });
  }

  // ---------- Steuerung ----------
  if (p === '/api/notbetrieb' && m === 'POST') {
    const b = await body(req);
    const r = await notbetriebSetzen(!!b.an);
    await schnell().catch(() => {});
    return json(res, 200, r);
  }
  const schalt = p.match(/^\/api\/container\/([a-z0-9][a-z0-9_.-]*)$/);
  if (schalt && m === 'POST') {
    const b = await body(req);
    const r = await dienstSchalten(schalt[1], !!b.an);
    await schnell().catch(() => {});
    return json(res, 200, r);
  }
  // ---------- Windows-PC einschalten (Wake-on-LAN) ----------
  if (p === '/api/pc/wecken' && m === 'POST') {
    await pcWecken();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/pc/ausschalten' && m === 'POST') {
    const b = await body(req);
    if (b.bestaetigt !== true) return json(res, 400, { fehler: 'Bitte bestätigen' });
    await pcAusschalten(tsPeers());
    return json(res, 200, { ok: true });
  }
  if (p === '/api/pc/schluessel' && m === 'GET') return json(res, 200, { zeile: pcSchluesselZeile() });

  // ---------- Fernseher ----------
  if (p === '/api/tv/taste' && m === 'POST') {
    const b = await body(req);
    await tvTaste(String(b.taste || ''));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/tv/lautstaerke' && m === 'POST') {
    const b = await body(req);
    await tvLautstaerke(b.wert);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/tv/an' && m === 'POST') return json(res, 200, await tvEinschalten());
  if (p === '/api/pi/neustart' && m === 'POST') {
    const b = await body(req);
    if (b.bestaetigt !== true) return json(res, 400, { fehler: 'Bitte bestätigen' });
    await piNeustarten();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/pi/ausschalten' && m === 'POST') {
    const b = await body(req);
    if (b.bestaetigt !== true) return json(res, 400, { fehler: 'Bitte bestätigen' });
    await piAusschalten();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/backup/start' && m === 'POST') {
    if (!backupEingerichtet()) return json(res, 400, { fehler: 'Kein Backup-Ziel (BACKUP_ZIEL in .env)' });
    if (db().backup.laeuft) return json(res, 409, { fehler: 'Backup läuft bereits' });
    backupStarten().catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    return json(res, 200, { ok: true });
  }

  if (p === '/api/gaeste' && m === 'POST') {
    const b = await body(req);
    const g = await gastAnlegen(b);
    return json(res, 200, { ok: true, gast: { id: g.id, name: g.name, inviteUrl: g.inviteUrl, jfName: g.jf?.name || null, jfPasswort: g.jf?.passwort || null } });
  }
  if (p === '/api/gaeste/pruefen' && m === 'POST') return json(res, 200, await gaesteStatus(true));
  const gast = p.match(/^\/api\/gaeste\/([a-f0-9]+)$/);
  if (gast && m === 'DELETE') return json(res, 200, await gastEntfernen(gast[1]));

  return json(res, 404, { fehler: 'Unbekannt' });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!OEFFENTLICH.some((r) => r.test(url.pathname)) && !istAngemeldet(req)) {
      res.writeHead(302, { Location: '/login/' });
      return res.end();
    }
    return statisch(req, res, url.pathname);
  } catch (e) {
    console.error('[api]', e);
    if (!res.headersSent) json(res, e.status && e.status >= 400 && e.status < 500 ? e.status : 500, { fehler: e.message || 'Fehler' });
  }
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/terminal') terminalUpgrade(req, socket, head);
  else socket.destroy();
});

server.listen(config.port, config.bind, () => {
  console.log(`[zentrale] läuft auf http://${config.bind}:${config.port}`);
});

// ---------- Hintergrund-Aufgaben ----------
const alle = (ms, fn, sofort = true) => {
  let laeuft = false;
  const lauf = async () => {
    if (laeuft) return;
    laeuft = true;
    try { await fn(); } catch (e) { console.error('[aufgabe]', e.message); } finally { laeuft = false; }
  };
  if (sofort) lauf();
  setInterval(lauf, ms);
};

standardGovernorMerken();
luefterInit();
hddTimerSetzen().catch(() => {});
// Erst die Container-Liste holen (schnell), sonst überspringen mittel/langsam beim Start alle Medien-Apps.
try { await schnell(); } catch (e) { console.error('[start]', e.message); }
alle(15_000, schnell, false);
alle(60_000, mittel);
alle(5 * 60_000, langsam);
alle(6 * 3600_000, sehrLangsam);
alle(30 * 60_000, speicherLauf);
alle(20_000, zeitplan, false);
alle(15_000, tvAbfragen);
// Statusbericht für Obsidian (alle 15 Min, erstmals 2 Min nach dem Start, wenn alle Daten da sind).
let berichtFehler = null;
const bericht = async () => {
  try {
    const r = await statusBerichtSchreiben(snapshot());
    const f = r.ok ? null : r.grund;
    if (f !== berichtFehler) console.log('[statusbericht]', r.ok ? 'geschrieben: ' + r.pfad : f);
    berichtFehler = f;
  } catch (e) { console.warn('[statusbericht]', e.message); }
};
setTimeout(() => { bericht(); setInterval(bericht, 15 * 60_000); }, 120_000);
