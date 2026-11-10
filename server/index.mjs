// Kerims Zentrale – Server: Oberfläche ausliefern, API, SSH-Konsole, Hintergrund-Aufgaben.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDataDir } from './config.mjs';
import { load, db, save } from './store.mjs';
import { istAngemeldet, login, logout, sitzungenZustand, andereAbmelden } from './auth.mjs';
import { zweifaktorZustand, einrichtungStarten, einrichtungBestaetigen, ausschalten as zweifaktorAus, notfallNeu } from './zweifaktor.mjs';
import { terminalUpgrade } from './terminal.mjs';
import { schnell, mittel, langsam, sehrLangsam, speicherLauf, zeitplan, snapshot, sshNurSchluesselSetzen, manuelleSzene, laufwerkeListe, cloudJetzt, tsPeers } from './monitor.mjs';
import { ordnerLesen, ordnerGroessen } from './explorer.mjs';
import { listen as dateienListen, dateiInfo, textLesen, textSchreiben, neueDatei, neuerOrdner, umbenennen as dateiUmbenennen, verschieben as dateiVerschieben, loeschen as dateiLoeschen, papierkorbLeeren, uploadZiel, teilen as dateiTeilen, freigabenListe, freigabeLoeschen, freigabeAufloesen } from './dateien.mjs';
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
import { tagescheckSenden } from './tagescheck.mjs';
import { fokusZustand, fokusLauf, koppelcodeErzeugen, koppeln, geraetVonToken, geraetEntfernen, geraetSetzen as fokusGeraetSetzen, bericht as fokusBericht, diagnoseSpeichern, sperreSetzen, sperreLoeschen, kategorieSetzen, piholeSync, parkKonfigSetzen } from './fokus.mjs';
import { dukascopyTakt, dukascopyZustand } from './dukascopy.mjs';
import { tradingZustand, tradingPaar, tradingLauf, tradingNeuLaden, tradingEinstellungenSetzen, tradingTestMeldung, gvaPruefer, gvaMonat, gvaDetail, PAARE } from './trading.mjs';
import { heuteZustand, anmeldeUrl, rueckkehr, trennen as googleTrennen, mailAktion, scanStarten, scanZustand, absenderAktion, werbefilterSetzen, terminNeu, aufgabeNeu, aufgabeErledigt } from './google.mjs';
import { statistik as gvaStatistik, statistikStandardSetzen, beispiel as gvaBeispiel } from './tradingStatistik.mjs';
import { laborListe, laborIdee, laborIdeeSpeichern, laborIdeeLoeschen, laborStarten, laborForwardOeffnen, laborLauf, laborErgebnis, laborAbbrechen, laborBausteine, laborStart, laborIdeeMeta, laborVarianteVorbereiten, laborZettel, laborZettelSpeichern, laborZettelLoeschen, laborReiheSpeichern, laborReiheLoeschen, laborReiheVorschau, laborExport, laborImport, laborLaufLoeschen, laborTradeChart, laborGvaMuster, laborLaeufeFertig, laborVergleich } from './labor/labor.mjs';
import { laborPdfLauf, laborPdfVergleich } from './labor/pdf.mjs';
import { journalZustand, tradeSpeichern, tradeLoeschen, tradesLoeschen, journalEinstellungenSetzen, bildSpeichern, bildPfad, importieren } from './journal.mjs';
import { netzwerkZustand, netzwerkSuchen, portsPruefen, geraetSetzen, wacheSetzen, netzwache } from './netzwerk.mjs';

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

function body(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let roh = '';
    req.on('data', (c) => { roh += c; if (roh.length > max) { reject(new Error('Zu gross')); req.destroy(); } });
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
    const r = login(req, b.passwort, b.code);
    return r.ok ? json(res, 200, { ok: true }, { 'Set-Cookie': r.cookie }) : json(res, 401, { ok: false, fehler: r.fehler, codeNoetig: !!r.codeNoetig });
  }
  if (p === '/api/me') return json(res, 200, { angemeldet: istAngemeldet(req) });

  // ---------- Fokus-Agenten (Geräte-Token statt Anmeldung) ----------
  if (p === '/api/fokus/agent/koppeln' && m === 'POST') {
    const b = await body(req);
    const r = koppeln({ code: b.code, name: b.name, art: b.art });
    return r.fehler ? json(res, r.status || 400, { fehler: r.fehler }) : json(res, 200, r);
  }
  if (p === '/api/fokus/agent/diagnose' && m === 'POST') {
    const g = geraetVonToken(req);
    if (!g) return json(res, 401, { fehler: 'Ungültiges Token' });
    return json(res, 200, diagnoseSpeichern(g, (await body(req)).text));
  }
  if (p === '/api/fokus/agent/bericht' && m === 'POST') {
    const g = geraetVonToken(req);
    if (!g) return json(res, 401, { fehler: 'Ungültiges Token' });
    return json(res, 200, fokusBericht(g, await body(req), req));
  }

  // ---------- Google-Anmeldung: Rückkehr von Google (ohne Cookie, weil die Weiterleitung von accounts.google.com kommt; geschützt über «state») ----------
  if (p === '/api/google/zurueck' && m === 'GET') {
    try {
      await rueckkehr(url);
      res.writeHead(302, { Location: '/#Heute' });
      return res.end();
    } catch (e) {
      const text = String(e.message).replace(/[<>&"]/g, '');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px"><h2>Google-Verbindung fehlgeschlagen</h2><p>${text}</p><p><a href="/#Heute">Zurück zur Zentrale</a></p>`);
    }
  }

  if (!istAngemeldet(req)) return json(res, 401, { fehler: 'Nicht angemeldet' });
  // Schutz gegen fremde Seiten: Änderungen nur mit eigenem Header.
  if (m !== 'GET' && req.headers['x-zentrale'] !== '1') return json(res, 403, { fehler: 'Verboten' });

  if (p === '/api/logout' && m === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': logout(req) });
  if (p === '/api/state' && m === 'GET') return json(res, 200, snapshot());

  // ---------- Fokus (Tab «Fokus») ----------
  if (p === '/api/fokus' && m === 'GET') return json(res, 200, fokusZustand(url.searchParams.get('tag')));
  if (p === '/api/fokus/koppelcode' && m === 'POST') return json(res, 200, koppelcodeErzeugen());
  if (p === '/api/fokus/geraet' && m === 'POST') {
    const b = await body(req);
    const r = fokusGeraetSetzen(String(b.id || ''), { name: b.name, websperre: b.websperre });
    if (r.fehler) return json(res, r.status || 400, { fehler: r.fehler });
    piholeSync().catch(() => {});
    return json(res, 200, { ok: true });
  }
  if (p === '/api/fokus/geraet' && m === 'DELETE') {
    const b = await body(req);
    const ok = geraetEntfernen(String(b.id || ''));
    if (ok) piholeSync().catch(() => {});
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { fehler: 'Gerät nicht gefunden' });
  }
  if (p === '/api/fokus/kategorie' && m === 'POST') {
    const b = await body(req);
    return kategorieSetzen(String(b.key || ''), String(b.kategorie || '')) ? json(res, 200, { ok: true }) : json(res, 400, { fehler: 'Ungültig' });
  }
  if (p === '/api/fokus/sperre' && m === 'POST') {
    const r = sperreSetzen(await body(req));
    return r.fehler ? json(res, r.status || 400, { fehler: r.fehler }) : json(res, 200, r);
  }
  if (p === '/api/fokus/sperre' && m === 'DELETE') {
    const b = await body(req);
    const r = sperreLoeschen(String(b.id || ''));
    return r.fehler ? json(res, r.status || 400, { fehler: r.fehler }) : json(res, 200, { ok: true });
  }
  if (p === '/api/fokus/parken' && m === 'POST') {
    const r = parkKonfigSetzen(await body(req));
    return r.fehler ? json(res, 400, { fehler: r.fehler }) : json(res, 200, r);
  }
  if (p === '/api/fokus/pihole' && m === 'POST') { await piholeSync(true); return json(res, 200, fokusZustand().pihole); }

  // ---------- Trading (Tab «Trading»: GVA-Linien, Treffer-Meldungen) ----------
  if (p === '/api/trading' && m === 'GET') return json(res, 200, tradingZustand());
  if (p === '/api/kursdaten' && m === 'GET') return json(res, 200, dukascopyZustand());
  if (p === '/api/trading/paar' && m === 'GET') {
    const pair = String(url.searchParams.get('p') || '').toUpperCase();
    if (!PAARE.includes(pair)) return json(res, 404, { fehler: 'Unbekanntes Paar' });
    const r = tradingPaar(pair);
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Noch keine Kurse' });
  }
  if (p === '/api/trading/einstellungen' && m === 'POST') return json(res, 200, tradingEinstellungenSetzen(await body(req)));
  if (p === '/api/trading/pruefer' && m === 'GET') {
    const r = gvaPruefer({ pair: String(url.searchParams.get('p') || '').toUpperCase(), tf: String(url.searchParams.get('tf') || '3D'), von: url.searchParams.get('von'), bis: url.searchParams.get('bis') });
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/trading/monat' && m === 'GET') return json(res, 200, gvaMonat(url.searchParams.get('jahr')));
  if (p === '/api/trading/gva' && m === 'GET') {
    const r = gvaDetail(url.searchParams.get('id'));
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/trading/test' && m === 'POST') return json(res, 200, await tradingTestMeldung());
  if (p === '/api/trading/neu-laden' && m === 'POST') { tradingNeuLaden(); return json(res, 200, { ok: true }); }
  if (p === '/api/trading/statistik' && m === 'POST') return json(res, 200, gvaStatistik(await body(req)));
  if (p === '/api/trading/statistik/standard' && m === 'POST') return json(res, 200, statistikStandardSetzen(await body(req)));
  if (p === '/api/trading/statistik/beispiel' && m === 'POST') {
    const b = await body(req);
    const r = gvaBeispiel(String(b.id || ''), b);
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Ereignis nicht gefunden (Kurse noch nicht geladen?)' });
  }

  // ---------- Sicherheit: Zwei-Faktor und Sitzungen (Einstellungen) ----------
  if (p === '/api/sicherheit' && m === 'GET') return json(res, 200, { zweifaktor: zweifaktorZustand(), sitzungen: sitzungenZustand(req) });
  if (p === '/api/zweifaktor/start' && m === 'POST') return json(res, 200, einrichtungStarten());
  if (p === '/api/zweifaktor/bestaetigen' && m === 'POST') {
    const r = einrichtungBestaetigen((await body(req)).code);
    andereAbmelden(req); // alte Sitzungen ohne 2FA beenden
    return json(res, 200, r);
  }
  if (p === '/api/zweifaktor/aus' && m === 'POST') return json(res, 200, zweifaktorAus((await body(req)).code));
  if (p === '/api/zweifaktor/notfall' && m === 'POST') return json(res, 200, notfallNeu((await body(req)).code));
  if (p === '/api/sitzungen/andere-abmelden' && m === 'POST') return json(res, 200, andereAbmelden(req));

  // ---------- Heute (Mail aufräumen, Kalender, Aufgaben über Google) ----------
  if (p === '/api/heute' && m === 'GET') return json(res, 200, await heuteZustand(url.searchParams.get('frisch') === '1'));
  if (p === '/api/google/start' && m === 'GET') {
    try { res.writeHead(302, { Location: anmeldeUrl() }); return res.end(); }
    catch (e) { return json(res, 400, { fehler: e.message }); }
  }
  if (p === '/api/google/trennen' && m === 'POST') { await googleTrennen(); return json(res, 200, { ok: true }); }
  if (p === '/api/heute/mail' && m === 'POST') { const b = await body(req); return json(res, 200, await mailAktion(String(b.id || ''), String(b.aktion || ''))); }
  if (p === '/api/heute/scan' && m === 'POST') return json(res, 200, scanStarten());
  if (p === '/api/heute/scan' && m === 'GET') return json(res, 200, scanZustand());
  if (p === '/api/heute/absender' && m === 'POST') { const b = await body(req); return json(res, 200, await absenderAktion(b.email, String(b.aktion || ''))); }
  if (p === '/api/heute/werbefilter' && m === 'POST') return json(res, 200, await werbefilterSetzen(await body(req)));
  if (p === '/api/heute/termin' && m === 'POST') return json(res, 200, await terminNeu(await body(req)));
  if (p === '/api/heute/aufgabe' && m === 'POST') return json(res, 200, await aufgabeNeu(await body(req)));
  if (p === '/api/heute/aufgabe/erledigt' && m === 'POST') { const b = await body(req); return json(res, 200, await aufgabeErledigt(b.id)); }

  // ---------- Journal (Tab «Trading» → Journal) ----------
  // ---------- Trading-Labor (Strategien und Hypothesen testen) ----------
  if (p === '/api/labor' && m === 'GET') return json(res, 200, laborListe());
  if (p === '/api/labor/bausteine' && m === 'GET') return json(res, 200, laborBausteine());
  if (p === '/api/labor/idee' && m === 'GET') {
    const r = laborIdee(String(url.searchParams.get('id') || ''));
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/labor/idee' && m === 'POST') { const r = laborIdeeSpeichern(await body(req, 512 * 1024)); return r.fehler ? json(res, 400, r) : json(res, 200, r); }
  if (p === '/api/labor/idee/meta' && m === 'POST') {
    const r = laborIdeeMeta(await body(req, 256 * 1024));
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/labor/idee/variante' && m === 'POST') {
    const r = laborVarianteVorbereiten(String((await body(req)).id || ''));
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/labor/zettel' && m === 'GET') return json(res, 200, laborZettel());
  if (p === '/api/labor/zettel' && m === 'POST') return json(res, 200, laborZettelSpeichern(await body(req, 128 * 1024)));
  if (p === '/api/labor/zettel' && m === 'DELETE') return laborZettelLoeschen(String((await body(req)).id || '')) ? json(res, 200, { ok: true }) : json(res, 404, { fehler: 'Nicht gefunden' });
  if (p === '/api/labor/reihe' && m === 'POST') { const r = laborReiheSpeichern(await body(req, 4 * 1024 * 1024)); return r.fehler ? json(res, 400, r) : json(res, 200, r); }
  if (p === '/api/labor/reihe' && m === 'DELETE') return laborReiheLoeschen(String((await body(req)).id || '')) ? json(res, 200, { ok: true }) : json(res, 404, { fehler: 'Nicht gefunden' });
  if (p === '/api/labor/reihe' && m === 'GET') { const r = await laborReiheVorschau(String(url.searchParams.get('id') || '')); return r.fehler ? json(res, 400, r) : json(res, 200, r); }
  if (p === '/api/labor/export' && m === 'POST') { const r = laborExport(await body(req)); return r.fehler ? json(res, 400, r) : json(res, 200, r); }
  if (p === '/api/labor/lauf' && m === 'DELETE') return laborLaufLoeschen(String((await body(req)).lauf || '')) ? json(res, 200, { ok: true }) : json(res, 400, { fehler: 'Lauf nicht löschbar' });
  if (p === '/api/labor/import' && m === 'POST') return json(res, 200, laborImport(await body(req, 2 * 1024 * 1024)));
  if (p === '/api/labor/idee' && m === 'DELETE') {
    const b = await body(req);
    return laborIdeeLoeschen(String(b.id || '')) ? json(res, 200, { ok: true }) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/labor/start' && m === 'POST') {
    const b = await body(req);
    const r = laborStarten(String(b.id || ''), b.art === 'forward' ? 'forward' : 'backtest');
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/labor/forward-oeffnen' && m === 'POST') {
    const r = laborForwardOeffnen(String((await body(req)).id || ''));
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/labor/abbrechen' && m === 'POST') return json(res, 200, { ok: laborAbbrechen(String((await body(req)).lauf || '')) });
  if (p === '/api/labor/lauf' && m === 'GET') {
    const r = laborLauf(String(url.searchParams.get('id') || ''));
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/labor/ergebnis' && m === 'GET') {
    const r = laborErgebnis(String(url.searchParams.get('lauf') || '').replace(/[^0-9a-f-]/g, ''));
    return r ? json(res, 200, r) : json(res, 404, { fehler: 'Kein Ergebnis' });
  }

  if (p === '/api/labor/laeufe-fertig' && m === 'GET') return json(res, 200, laborLaeufeFertig());
  if (p === '/api/labor/pdf' && m === 'GET') {
    const vg = url.searchParams.get('vergleich');
    const r = vg ? await laborPdfVergleich(vg.split(',')) : await laborPdfLauf(url.searchParams.get('lauf'));
    if (r.fehler) return json(res, 400, r);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${r.datei}"`, 'Cache-Control': 'no-store', 'Content-Length': r.pdf.length });
    return res.end(r.pdf);
  }
  if (p === '/api/labor/vergleich' && m === 'POST') {
    const r = laborVergleich((await body(req)).ids);
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/labor/gva-muster' && m === 'GET') {
    const r = laborGvaMuster({ linie: String(url.searchParams.get('linie') || ''), vor: url.searchParams.get('vor') ?? 5, nach: url.searchParams.get('nach') ?? 5 });
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }
  if (p === '/api/labor/trade-chart' && m === 'GET') {
    const r = laborTradeChart({ pair: String(url.searchParams.get('pair') || ''), von: url.searchParams.get('von'), bis: url.searchParams.get('bis'), tf: String(url.searchParams.get('tf') || '15m') });
    return r.fehler ? json(res, 400, r) : json(res, 200, r);
  }

  if (p === '/api/journal' && m === 'GET') return json(res, 200, journalZustand());
  if (p === '/api/journal/trade' && m === 'POST') {
    try { return json(res, 200, tradeSpeichern(await body(req))); }
    catch (e) { return json(res, e.status || 400, { fehler: e.message }); }
  }
  if (p === '/api/journal/trade' && m === 'DELETE') {
    const b = await body(req);
    if (Array.isArray(b.ids)) return json(res, 200, { ok: true, geloescht: tradesLoeschen(b.ids.slice(0, 5000)) });
    return tradeLoeschen(String(b.id || '')) ? json(res, 200, { ok: true }) : json(res, 404, { fehler: 'Nicht gefunden' });
  }
  if (p === '/api/journal/einstellungen' && m === 'POST') return json(res, 200, journalEinstellungenSetzen(await body(req)));
  if (p === '/api/journal/import' && m === 'POST') return json(res, 200, importieren((await body(req, 4 * 1024 * 1024)).trades));
  if (p === '/api/journal/bild' && m === 'POST') {
    const teile = [];
    let groesse = 0;
    for await (const c of req) { groesse += c.length; if (groesse > 8 * 1024 * 1024) return json(res, 413, { fehler: 'Bild zu gross' }); teile.push(c); }
    return json(res, 200, bildSpeichern(Buffer.concat(teile), String(req.headers['content-type'] || '').split(';')[0]));
  }
  if (p.startsWith('/api/journal/bild/') && m === 'GET') {
    const datei = bildPfad(p.slice('/api/journal/bild/'.length));
    if (!datei) return json(res, 404, { fehler: 'Bild nicht gefunden' });
    res.writeHead(200, { 'Content-Type': datei.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
    return fs.createReadStream(datei).pipe(res);
  }

  // ---------- Netzwerk (Tab «Netz» → Heimnetz, Ports & Zugriff) ----------
  if (p === '/api/netzwerk' && m === 'GET') return json(res, 200, await netzwerkZustand());
  if (p === '/api/netzwerk/suchen' && m === 'POST') return json(res, 200, await netzwerkSuchen());
  if (p === '/api/netzwerk/ports' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await portsPruefen(String(b.ip || '')));
  }
  if (p === '/api/netzwerk/geraet' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, { ok: true, geraet: geraetSetzen({ mac: b.mac, name: b.name, besitzer: b.besitzer }) });
  }
  if (p === '/api/netzwerk/wache' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, { ok: true, an: wacheSetzen(!!b.an) });
  }

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
    if (typeof b.checkAn === 'boolean') e.checkAn = b.checkAn;
    if (Array.isArray(b.favoriten)) e.favoriten = [...new Set(b.favoriten.map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
    if (Array.isArray(b.checkZeiten)) {
      const ok = [...new Set(b.checkZeiten.map(String).filter(zeit))].sort().slice(0, 6);
      if (ok.length) e.checkZeiten = ok;
    }
    if (typeof b.backupAuto === 'boolean') e.backupAuto = b.backupAuto;
    if (Number.isFinite(b.moebelWarnAb) && b.moebelWarnAb >= 30 && b.moebelWarnAb <= 60) e.moebelWarnAb = Math.round(b.moebelWarnAb);
    if (Number.isFinite(b.luefterAnAb) && b.luefterAnAb >= 20 && b.luefterAnAb <= 45) e.luefterAnAb = Math.round(b.luefterAnAb);
    if (typeof b.hddSchlaf === 'boolean') { e.hddSchlaf = b.hddSchlaf; hddTimerSetzen().catch(() => {}); }
    if (Number.isFinite(b.luefterAusUnter) && b.luefterAusUnter >= 35 && b.luefterAusUnter <= 65) e.luefterAusUnter = Math.round(b.luefterAusUnter);
    save();
    return json(res, 200, { ok: true, einstellungen: e });
  }

  if (p === '/api/tagescheck' && m === 'POST') {
    return json(res, 200, await tagescheckSenden(snapshot(), { manuell: true }));
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

  // ---------- Dateien (Finder der Desktop-App) ----------
  if (p === '/api/dateien/laufwerke' && m === 'GET') {
    return json(res, 200, { laufwerke: laufwerkeListe().map((l) => ({ mount: l.mount, name: l.name, groesse: l.groesse ?? null, frei: l.frei ?? null, benutzt: l.benutzt ?? null })) });
  }
  if (p === '/api/dateien' && m === 'GET') {
    return json(res, 200, await dateienListen(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || '/', { versteckte: url.searchParams.get('versteckte') === '1' }));
  }
  if (p === '/api/dateien/inhalt' && m === 'GET') {
    const info = await dateiInfo(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || '');
    return dateiAusliefern(req, res, info, url.searchParams.get('download') === '1');
  }
  if (p === '/api/dateien/text' && m === 'GET') {
    return json(res, 200, await textLesen(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || ''));
  }
  if (p === '/api/dateien/text' && (m === 'POST' || m === 'PUT')) {
    const b = await body(req, 5 * 1024 * 1024);
    return json(res, 200, await textSchreiben(laufwerkeListe(), String(b.wurzel || ''), String(b.pfad || ''), b.inhalt));
  }
  if (p === '/api/dateien/neu' && m === 'POST') {
    const b = await body(req);
    const lw = laufwerkeListe();
    const r = b.ordner
      ? await neuerOrdner(lw, String(b.wurzel || ''), String(b.pfad || ''))
      : await neueDatei(lw, String(b.wurzel || ''), String(b.pfad || ''), String(b.inhalt || ''));
    return json(res, 200, r);
  }
  if (p === '/api/dateien/umbenennen' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await dateiUmbenennen(laufwerkeListe(), String(b.wurzel || ''), String(b.pfad || ''), String(b.name || '')));
  }
  if (p === '/api/dateien/verschieben' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await dateiVerschieben(laufwerkeListe(), { wurzel: String(b.wurzel || ''), pfad: String(b.pfad || '') }, { wurzel: String(b.zielWurzel || b.wurzel || ''), pfad: String(b.zielPfad || '/') }, { kopieren: !!b.kopieren }));
  }
  if (p === '/api/dateien/loeschen' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await dateiLoeschen(laufwerkeListe(), String(b.wurzel || ''), String(b.pfad || ''), { endgueltig: !!b.endgueltig }));
  }
  if (p === '/api/dateien/papierkorb' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await papierkorbLeeren(laufwerkeListe(), String(b.wurzel || '')));
  }
  if (p === '/api/dateien/upload' && m === 'POST') {
    const ziel = await uploadZiel(laufwerkeListe(), url.searchParams.get('wurzel') || '', url.searchParams.get('pfad') || '/', url.searchParams.get('name') || '');
    const max = 4 * 1024 * 1024 * 1024; // 4 GB
    let gesamt = 0;
    const strom = fs.createWriteStream(ziel.tmp);
    try {
      await new Promise((ok, schief) => {
        req.on('data', (c) => { gesamt += c.length; if (gesamt > max) { schief(new Error('Datei zu gross (max. 4 GB)')); req.destroy(); } });
        req.on('error', schief);
        strom.on('error', schief);
        strom.on('finish', ok);
        req.pipe(strom);
      });
    } catch (e) {
      try { fs.unlinkSync(ziel.tmp); } catch {}
      return json(res, 413, { fehler: e.message });
    }
    fs.renameSync(ziel.tmp, ziel.host);
    return json(res, 200, { ok: true, name: ziel.name, pfad: ziel.pfad, groesse: gesamt });
  }
  if (p === '/api/dateien/teilen' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, await dateiTeilen(laufwerkeListe(), String(b.wurzel || ''), String(b.pfad || ''), { tage: b.tage, hostName: config.hostName }));
  }
  if (p === '/api/dateien/teilen' && m === 'GET') return json(res, 200, { freigaben: freigabenListe(), host: config.hostName });
  if (p === '/api/dateien/teilen/weg' && m === 'POST') {
    const b = await body(req);
    return json(res, 200, freigabeLoeschen(String(b.token || '')));
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

// Programme der Fokus-Agenten zum Herunterladen (enthalten keine Geheimnisse; die Zentrale ist nur im Tailnet erreichbar).
const AGENT_DATEIEN = { '/agent/windows.ps1': 'windows.ps1', '/agent/browser/manifest.json': 'browser/manifest.json', '/agent/browser/background.js': 'browser/background.js', '/agent/fokus.apk': 'fokus.apk' };
function agentDatei(res, pfad) {
  const rel = AGENT_DATEIEN[pfad];
  if (!rel) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
  const inhalt = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'agent', rel));
  res.writeHead(200, { 'Content-Type': rel.endsWith('.apk') ? 'application/vnd.android.package-archive' : rel.endsWith('.json') ? 'application/json' : rel.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(inhalt);
}

// Datei ausliefern, mit Unterstuetzung fuer Teil-Anfragen (Range) - noetig fuer Video und PDF.
function dateiAusliefern(req, res, info, download = false) {
  const kopf = {
    'Content-Type': download ? 'application/octet-stream' : info.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(info.name)}`,
  };
  const bereich = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
  if (bereich && info.groesse > 0) {
    let von = bereich[1] === '' ? null : Number(bereich[1]);
    let bis = bereich[2] === '' ? null : Number(bereich[2]);
    if (von === null) { von = Math.max(info.groesse - (bis || 0), 0); bis = info.groesse - 1; }
    if (bis === null || bis >= info.groesse) bis = info.groesse - 1;
    if (von > bis || von >= info.groesse) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.groesse}` });
      return res.end();
    }
    res.writeHead(206, { ...kopf, 'Content-Range': `bytes ${von}-${bis}/${info.groesse}`, 'Content-Length': bis - von + 1 });
    return fs.createReadStream(info.host, { start: von, end: bis }).pipe(res);
  }
  res.writeHead(200, { ...kopf, 'Content-Length': info.groesse });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(info.host).pipe(res);
}

// Oeffentlicher Teilen-Link: /teilen/<token> - ohne Anmeldung, laeuft ab.
async function teilenAusliefern(req, res, pfad) {
  const token = decodeURIComponent(pfad.slice('/teilen/'.length)).split('/')[0];
  const info = await freigabeAufloesen(laufwerkeListe(), token);
  if (!info) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Link ungültig oder abgelaufen</h2>');
  }
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  return dateiAusliefern(req, res, info, false);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/agent/') && req.method === 'GET') return agentDatei(res, url.pathname);
    if (url.pathname.startsWith('/teilen/') && (req.method === 'GET' || req.method === 'HEAD')) return await teilenAusliefern(req, res, url.pathname);
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
// Netz-Wache: neue Geräte im Heimnetz und Port-Scans gegen den Pi (liest nur, schickt nichts los).
setTimeout(() => alle(30_000, netzwache, false), 20_000);
setTimeout(() => alle(60_000, fokusLauf, false), 25_000);
// Trading: Kurse laden (erst nach 40 s, damit der Start nicht gebremst wird), danach jede Minute prüfen, ob nachgeladen wird.
setTimeout(() => alle(60_000, tradingLauf), 40_000);
laborStart(); // Labor: verwaiste Läufe aufräumen, Warteschlange weiterführen
setTimeout(() => alle(5 * 60_000, dukascopyTakt), 60_000); // Stundenkerzen ab 2003 nachladen (danach 1× am Tag)
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
