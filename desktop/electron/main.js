// Zentrale Desktop – Hauptprozess.
//
// Die App ist das "Betriebssystem" auf dem HP: Anmeldebildschirm, macOS-artige
// Oberfläche, Finder für Pi- und HP-Dateien und die eingebettete Zentrale.
// Der Rechner geht dabei nie schlafen, damit der Trading-Bot weiterläuft.
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, globalShortcut, screen, nativeTheme } = require('electron');

const einstellungen = require('./lib/einstellungen');
const protokoll = require('./lib/protokoll');
const pi = require('./lib/pi');
const lokal = require('./lib/lokal');
const anmeldung = require('./lib/anmeldung');
const strom = require('./lib/strom');
const kiosk = require('./lib/kiosk');

protokoll.schemaAnmelden();

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorne.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let fenster = null;          // Haupt-BrowserWindow (die ganze Oberfläche)
let gesperrt = true;
let bildschirmAus = false;
let sperrTimer = null;

// ---------------------------------------------------------------- Fenster

function fensterBauen() {
  const e = einstellungen.alle();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  nativeTheme.themeSource = e.aussehen.hell ? 'light' : 'dark';

  fenster = new BrowserWindow({
    width, height,
    show: false,
    frame: !e.verhalten.kiosk,
    kiosk: !!e.verhalten.kiosk,
    fullscreen: !!e.verhalten.kiosk,
    autoHideMenuBar: true,
    backgroundColor: e.aussehen.hell ? '#f2f2f7' : '#0b1220',
    title: 'Zentrale',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  fenster.setMenuBarVisibility(false);
  fenster.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  fenster.once('ready-to-show', () => {
    fenster.show();
    if (e.verhalten.kiosk) fenster.focus();
  });

  // Fehler aus der Oberfläche im Protokoll sichtbar machen (hilft beim Suchen).
  fenster.webContents.on('console-message', (_e, stufe, text, zeile, quelle) => {
    if (stufe >= 2) console.error('[oberflaeche]', text, `${String(quelle).split('/').pop()}:${zeile}`);
  });

  fenster.on('resize', () => fenster.webContents.send('fenster:groesse'));
  fenster.on('closed', () => { fenster = null; ansichten.clear(); });

  // Links aus der Oberfläche im echten Browser öffnen.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------- Zentrale einbetten
//
// Jeder Tab der Zentrale bekommt sein eigenes Fenster und damit seine eigene
// eingebettete Ansicht. Sie laufen alle in derselben Partition, also mit einer
// Anmeldung. Technisch liegen diese Ansichten über der Oberfläche – darum zeigt
// die Oberfläche immer nur die vorderste und blendet die anderen aus (mit einem
// Schnappschuss als Platzhalter, damit kein schwarzes Loch bleibt).

const ansichten = new Map(); // id -> { view, sichtbar }

function ansichtBauen(id, url) {
  if (ansichten.has(id)) return ansichten.get(id);
  if (!fenster) return null;

  const view = new WebContentsView({
    webPreferences: {
      partition: pi.PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  view.setBackgroundColor('#00000000');
  fenster.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: ziel }) => {
    if (/^https?:/i.test(ziel)) shell.openExternal(ziel);
    return { action: 'deny' };
  });
  const melden = () => {
    if (!fenster || fenster.isDestroyed()) return;
    fenster.webContents.send('zentrale:zustand', {
      id,
      url: wc.getURL(),
      laedt: wc.isLoading(),
      zurueck: wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack(),
      vor: wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward(),
      titel: wc.getTitle(),
    });
  };
  wc.on('did-start-loading', melden);
  wc.on('did-stop-loading', melden);
  wc.on('did-navigate', melden);
  wc.on('did-navigate-in-page', melden);
  wc.on('did-fail-load', (_e, code, text, _url, haupt) => {
    if (!haupt || code === -3) return;
    if (fenster) fenster.webContents.send('zentrale:fehler', { id, code, text });
  });

  const eintrag = { view, sichtbar: false };
  ansichten.set(id, eintrag);
  wc.loadURL(url || pi.basis() + '/');
  return eintrag;
}

function ansichtSchliessen(id) {
  const a = ansichten.get(id);
  if (!a) return;
  try { fenster?.contentView.removeChildView(a.view); } catch {}
  try { a.view.webContents.close(); } catch {}
  ansichten.delete(id);
}

function alleAnsichtenVerstecken() {
  for (const a of ansichten.values()) {
    a.sichtbar = false;
    try { a.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } catch {}
  }
  if (fenster && !fenster.isDestroyed()) fenster.webContents.focus();
}

const hatSichtbareAnsicht = () => [...ansichten.values()].some((a) => a.sichtbar);

async function ansichtSchnappschuss(id) {
  const a = ansichten.get(id);
  if (!a || !a.sichtbar) return null;
  try {
    const bild = await a.view.webContents.capturePage();
    return bild.isEmpty() ? null : bild.toDataURL();
  } catch { return null; }
}

// ---------------------------------------------------------------- Sperren

async function sperren({ bildschirmAus: schirmAus = null } = {}) {
  const e = einstellungen.alle();
  gesperrt = true;
  alleAnsichtenVerstecken();
  if (fenster) {
    fenster.webContents.send('sperre:zustand', { gesperrt: true });
    fenster.focus();
  }
  const aus = schirmAus === null ? e.verhalten.bildschirmAusBeiSperre : schirmAus;
  if (aus) {
    const r = await strom.bildschirmAus();
    bildschirmAus = !!r.ok;
    if (!r.ok && fenster) fenster.webContents.send('hinweis', { art: 'warnung', text: 'Monitor liess sich nicht abschalten: ' + (r.fehler || '') });
  }
  return { ok: true };
}

function entsperren() {
  gesperrt = false;
  bildschirmAus = false;
  if (fenster) fenster.webContents.send('sperre:zustand', { gesperrt: false });
  return { ok: true };
}

// Automatisches Sperren nach X Minuten ohne Eingabe.
function sperrTimerSetzen() {
  if (sperrTimer) { clearInterval(sperrTimer); sperrTimer = null; }
  const min = Number(einstellungen.alle().anmeldung.autoSperrenMin) || 0;
  if (min <= 0) return;
  sperrTimer = setInterval(() => {
    if (gesperrt) return;
    if (strom.untaetigSekunden() >= min * 60) sperren();
  }, 15000);
}

// ---------------------------------------------------------------- Befehle vom Pi

// Der HP ist von aussen nicht erreichbar, darum fragt die App selbst nach.
// Alle paar Sekunden: Zustand melden, offene Befehle abholen, ausführen.
let abholTimer = null;
let abholFehlerGemeldet = false;

async function befehleAbholen() {
  const token = anmeldung.tokenLesen();
  if (!token) return;
  const r = await pi.hpAbholen(token, {
    gesperrt,
    bildschirmAus,
    version: app.getVersion(),
    rechner: require('node:os').hostname(),
    benutzer: process.env.USERNAME || process.env.USER || '',
  });
  if (!r.ok) {
    // Nur einmal meckern, nicht im Sekundentakt.
    if (r.status === 401 && !abholFehlerGemeldet) {
      abholFehlerGemeldet = true;
      if (fenster) fenster.webContents.send('hinweis', { art: 'warnung', text: 'Dieses Gerät wurde in der Zentrale entkoppelt. Fernsteuerung ist aus.' });
    }
    return;
  }
  abholFehlerGemeldet = false;
  for (const b of r.befehle || []) {
    if (b === 'sperren') await sperren({ bildschirmAus: false });
    else if (b === 'bildschirmAus') await sperren({ bildschirmAus: true });
    else if (b === 'bildschirmAn') { const a = await strom.bildschirmAn(); bildschirmAus = !a.ok; }
  }
}

function abholenStarten() {
  if (abholTimer) clearInterval(abholTimer);
  abholTimer = setInterval(() => befehleAbholen().catch(() => {}), 5000);
}

// ---------------------------------------------------------------- IPC

function sicher(fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (e) { return { ok: false, fehler: String(e?.message || e).slice(0, 300) }; }
  };
}

function ipcEinrichten() {
  // --- Grundzustand ---
  ipcMain.handle('app:zustand', sicher(async () => ({
    ok: true,
    gesperrt,
    version: app.getVersion(),
    plattform: process.platform,
    einstellungen: einstellungen.alle(),
    autostart: strom.autostartAn(),
    benutzer: process.env.USERNAME || process.env.USER || '',
    rechner: require('node:os').hostname(),
  })));

  // --- Anmeldung ---
  ipcMain.handle('anmeldung:anmelden', sicher(async (_e, eingabe, code, modus) => {
    const r = await anmeldung.anmelden(eingabe, code, modus || 'pin');
    if (r.ok) {
      entsperren();
      if (r.pi) for (const a of ansichten.values()) a.view.webContents.reload();
    }
    return r;
  }));
  ipcMain.handle('anmeldung:zustand', sicher(async () => ({ ok: true, ...anmeldung.zustand() })));
  ipcMain.handle('anmeldung:pruefen', sicher(async () => {
    const z = await pi.angemeldet();
    return { ok: true, ...z, ...anmeldung.zustand() };
  }));
  ipcMain.handle('anmeldung:pinSetzen', sicher(async (_e, pin) => anmeldung.pinSetzen(pin)));
  ipcMain.handle('anmeldung:pinEntfernen', sicher(async () => anmeldung.pinEntfernen()));
  ipcMain.handle('anmeldung:koppeln', sicher(async () => anmeldung.koppeln()));
  ipcMain.handle('anmeldung:geraete', sicher(async () => pi.geraeteListe()));
  ipcMain.handle('anmeldung:geraetWeg', sicher(async (_e, id) => pi.geraetEntkoppeln(id)));
  ipcMain.handle('anmeldung:sitzungSichern', sicher(async () => anmeldung.sitzungSichern()));
  ipcMain.handle('anmeldung:sperren', sicher(async (_e, opt) => sperren(opt || {})));
  ipcMain.handle('anmeldung:abmelden', sicher(async () => {
    await pi.abmelden();
    anmeldung.alleszuruecksetzen();
    for (const id of [...ansichten.keys()]) ansichtSchliessen(id);
    return sperren({ bildschirmAus: false });
  }));

  // --- Einstellungen ---
  ipcMain.handle('einstellungen:alle', sicher(async () => ({ ok: true, einstellungen: einstellungen.alle(), autostart: strom.autostartAn() })));
  ipcMain.handle('einstellungen:setzen', sicher(async (_e, teil) => {
    const vorher = JSON.parse(JSON.stringify(einstellungen.alle()));
    const neu = einstellungen.setzen(teil);
    if (teil?.verhalten?.autostart !== undefined) strom.autostart(!!teil.verhalten.autostart);
    if (teil?.verhalten?.niemalsSchlafen !== undefined) strom.schlafenVerhindern(!!teil.verhalten.niemalsSchlafen);
    if (teil?.anmeldung?.autoSperrenMin !== undefined) sperrTimerSetzen();
    if (teil?.aussehen?.hell !== undefined) nativeTheme.themeSource = teil.aussehen.hell ? 'light' : 'dark';
    const kioskNeu = teil?.verhalten?.kiosk;
    if (kioskNeu !== undefined && !!kioskNeu !== !!vorher.verhalten.kiosk && fenster) {
      fenster.setKiosk(!!kioskNeu);
      fenster.setFullScreen(!!kioskNeu);
    }
    if (teil?.zentraleUrl) for (const id of [...ansichten.keys()]) ansichtSchliessen(id);
    return { ok: true, einstellungen: neu, autostart: strom.autostartAn() };
  }));
  ipcMain.handle('einstellungen:zuruecksetzen', sicher(async () => ({ ok: true, einstellungen: einstellungen.zuruecksetzen() })));
  ipcMain.handle('einstellungen:bildWaehlen', sicher(async () => {
    const r = await dialog.showOpenDialog(fenster, {
      title: 'Bild auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif', 'gif'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, abgebrochen: true };
    return { ok: true, pfad: r.filePaths[0], url: protokoll.lokalUrl(r.filePaths[0]) };
  }));
  ipcMain.handle('einstellungen:ordnerWaehlen', sicher(async () => {
    const r = await dialog.showOpenDialog(fenster, { title: 'Ordner auswählen', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, abgebrochen: true };
    return { ok: true, pfad: r.filePaths[0] };
  }));

  // --- Zentrale-Fenster (eines pro Tab) ---
  ipcMain.handle('zentrale:zeigen', sicher(async (_e, id, flaeche, url) => {
    if (gesperrt) return { ok: false, fehler: 'Gesperrt' };
    const a = ansichtBauen(String(id), url);
    if (!a) return { ok: false, fehler: 'Kein Fenster' };
    const b = {
      x: Math.round(flaeche.x), y: Math.round(flaeche.y),
      width: Math.max(0, Math.round(flaeche.width)), height: Math.max(0, Math.round(flaeche.height)),
    };
    a.view.setBounds(b);
    a.sichtbar = b.width > 0 && b.height > 0;
    // Tastatur an die Seite geben, solange sie vorne ist.
    if (a.sichtbar) a.view.webContents.focus();
    return { ok: true };
  }));
  ipcMain.handle('zentrale:verstecken', sicher(async (_e, id, mitBild) => {
    const bild = mitBild ? await ansichtSchnappschuss(String(id)) : null;
    const a = ansichten.get(String(id));
    if (a) { a.sichtbar = false; a.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); }
    // Tastatur zurück an die Oberfläche – sonst landen Eingaben in Dialogen und
    // Menüs weiterhin in der ausgeblendeten Webseite.
    if (!hatSichtbareAnsicht() && fenster && !fenster.isDestroyed()) fenster.webContents.focus();
    return { ok: true, bild };
  }));
  ipcMain.handle('zentrale:schliessen', sicher(async (_e, id) => { ansichtSchliessen(String(id)); return { ok: true }; }));
  ipcMain.handle('zentrale:befehl', sicher(async (_e, id, was) => {
    const a = ansichten.get(String(id));
    if (!a) return { ok: false, fehler: 'Kein Fenster' };
    const wc = a.view.webContents;
    const h = wc.navigationHistory;
    if (was === 'zurueck') h ? h.goBack() : wc.goBack();
    else if (was === 'vor') h ? h.goForward() : wc.goForward();
    else if (was === 'neu') wc.reload();
    else if (was === 'werkzeuge') wc.toggleDevTools();
    else if (was === 'groesser') wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5));
    else if (was === 'kleiner') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5));
    else if (was === 'normal') wc.setZoomLevel(0);
    return { ok: true };
  }));
  ipcMain.handle('zentrale:laden', sicher(async (_e, id, url) => {
    const a = ansichtBauen(String(id), url);
    if (!a) return { ok: false };
    a.view.webContents.loadURL(url);
    return { ok: true };
  }));
  ipcMain.handle('zentrale:imBrowser', sicher(async (_e, url) => { await shell.openExternal(url || pi.basis() + '/'); return { ok: true }; }));

  // --- Dateien: Pi ---
  const piAntwort = (r) => (r.ok ? { ok: true, ...(r.daten || {}) } : { ok: false, fehler: r.fehler });
  ipcMain.handle('pi:laufwerke', sicher(async () => piAntwort(await pi.dateien.laufwerke())));
  ipcMain.handle('pi:liste', sicher(async (_e, w, p, v) => piAntwort(await pi.dateien.liste(w, p, v))));
  ipcMain.handle('pi:text', sicher(async (_e, w, p) => piAntwort(await pi.dateien.text(w, p))));
  ipcMain.handle('pi:textSchreiben', sicher(async (_e, w, p, i) => piAntwort(await pi.dateien.textSchreiben(w, p, i))));
  ipcMain.handle('pi:neu', sicher(async (_e, w, p, ordner, inhalt) => piAntwort(await pi.dateien.neu(w, p, ordner, inhalt))));
  ipcMain.handle('pi:umbenennen', sicher(async (_e, w, p, n) => piAntwort(await pi.dateien.umbenennen(w, p, n))));
  ipcMain.handle('pi:verschieben', sicher(async (_e, a) => piAntwort(await pi.dateien.verschieben(a))));
  ipcMain.handle('pi:loeschen', sicher(async (_e, w, p, endg) => piAntwort(await pi.dateien.loeschen(w, p, endg))));
  ipcMain.handle('pi:papierkorb', sicher(async (_e, w) => piAntwort(await pi.dateien.papierkorb(w))));
  ipcMain.handle('pi:teilen', sicher(async (_e, w, p, tage) => piAntwort(await pi.dateien.teilen(w, p, tage))));
  ipcMain.handle('pi:freigaben', sicher(async () => piAntwort(await pi.dateien.freigaben())));
  ipcMain.handle('pi:freigabeWeg', sicher(async (_e, t) => piAntwort(await pi.dateien.freigabeWeg(t))));
  ipcMain.handle('pi:status', sicher(async () => piAntwort(await pi.steuerung.status())));
  ipcMain.handle('pi:trading', sicher(async () => piAntwort(await pi.steuerung.trading())));
  ipcMain.handle('pi:heute', sicher(async () => piAntwort(await pi.steuerung.heute())));
  ipcMain.handle('pi:garmin', sicher(async () => piAntwort(await pi.steuerung.garmin())));
  ipcMain.handle('pi:steuern', sicher(async (_e, was, arg) => {
    const s = pi.steuerung;
    const karte = {
      pcWecken: () => s.pcWecken(), pcAus: () => s.pcAus(),
      tvAn: () => s.tvAn(), tvTaste: () => s.tvTaste(arg), tvLautstaerke: () => s.tvLautstaerke(arg),
      szene: () => s.szene(arg), container: () => s.container(arg?.name, arg?.an),
      dienstNeustart: () => s.dienstNeustart(arg), notbetrieb: () => s.notbetrieb(arg),
      luefter: () => s.luefter(arg), backupStart: () => s.backupStart(),
      piNeustart: () => s.piNeustart(), piAus: () => s.piAus(),
    };
    if (!karte[was]) return { ok: false, fehler: 'Unbekannter Befehl' };
    return piAntwort(await karte[was]());
  }));

  // --- Dateien: HP (lokal) ---
  ipcMain.handle('lokal:orte', sicher(async () => ({ ok: true, orte: lokal.orte(einstellungen.alle().finder.lokaleOrte), laufwerke: lokal.laufwerke() })));
  ipcMain.handle('lokal:liste', sicher(async (_e, p, v) => ({ ok: true, ...(await lokal.liste(p, { versteckte: v })) })));
  ipcMain.handle('lokal:text', sicher(async (_e, p) => ({ ok: true, ...(await lokal.text(p)) })));
  ipcMain.handle('lokal:textSchreiben', sicher(async (_e, p, i) => ({ ok: true, ...(await lokal.textSchreiben(p, i)) })));
  ipcMain.handle('lokal:neu', sicher(async (_e, ordner, name, istOrdner, inhalt) => ({ ok: true, ...(await lokal.neu(ordner, name, istOrdner, inhalt)) })));
  ipcMain.handle('lokal:umbenennen', sicher(async (_e, p, n) => ({ ok: true, ...(await lokal.umbenennen(p, n)) })));
  ipcMain.handle('lokal:verschieben', sicher(async (_e, q, z, kop) => ({ ok: true, ...(await lokal.verschieben(q, z, { kopieren: kop })) })));
  ipcMain.handle('lokal:loeschen', sicher(async (_e, p, endg) => ({ ok: true, ...(await lokal.loeschen(p, { endgueltig: endg })) })));
  ipcMain.handle('lokal:oeffnen', sicher(async (_e, p) => {
    const f = await shell.openPath(p);
    return f ? { ok: false, fehler: f } : { ok: true };
  }));
  ipcMain.handle('lokal:imOrdner', sicher(async (_e, p) => { shell.showItemInFolder(p); return { ok: true }; }));

  // --- Zwischen Pi und HP kopieren ---
  ipcMain.handle('uebertragen:piZuLokal', sicher(async (_e, wurzel, pfad, zielOrdner) => {
    const name = String(pfad).split('/').filter(Boolean).pop() || 'datei';
    const ziel = lokal.freierZielpfad(zielOrdner, name);
    const r = await pi.dateien.herunterladenNach(wurzel, pfad, ziel.pfad);
    return r.ok ? { ok: true, pfad: ziel.pfad, name: ziel.name, groesse: r.groesse } : { ok: false, fehler: r.fehler };
  }));
  ipcMain.handle('uebertragen:lokalZuPi', sicher(async (_e, quelle, wurzel, zielPfad) => {
    const st = fs.statSync(quelle);
    if (st.isDirectory()) return { ok: false, fehler: 'Ordner können noch nicht auf den Pi geladen werden – bitte einzelne Dateien.' };
    const r = await pi.dateien.hochladenVon(wurzel, zielPfad, path.basename(quelle), quelle);
    return r.ok ? { ok: true, ...(r.daten || {}) } : { ok: false, fehler: r.fehler };
  }));

  // --- Adressen fürs Anzeigen ---
  ipcMain.handle('url:pi', sicher(async (_e, w, p) => ({ ok: true, url: protokoll.piUrl(w, p) })));
  ipcMain.handle('url:lokal', sicher(async (_e, p) => ({ ok: true, url: protokoll.lokalUrl(p) })));

  // --- Strom & App ---
  ipcMain.handle('strom:bildschirmAus', sicher(async () => strom.bildschirmAus()));
  ipcMain.handle('strom:bildschirmAn', sicher(async () => strom.bildschirmAn()));
  ipcMain.handle('app:beenden', sicher(async () => { app.exit(0); return { ok: true }; }));
  ipcMain.handle('app:neustart', sicher(async () => { app.relaunch(); app.exit(0); return { ok: true }; }));
  ipcMain.handle('app:kiosk', sicher(async (_e, an) => {
    if (!fenster) return { ok: false };
    fenster.setKiosk(!!an);
    fenster.setFullScreen(!!an);
    einstellungen.setzen({ verhalten: { kiosk: !!an } });
    return { ok: true, kiosk: !!an };
  }));
  ipcMain.handle('app:linkOeffnen', sicher(async (_e, url) => {
    if (!/^https?:/i.test(String(url))) return { ok: false, fehler: 'Nur http/https' };
    await shell.openExternal(url);
    return { ok: true };
  }));
  // --- Harter Kiosk: App als Windows-Oberfläche ---
  ipcMain.handle('kiosk:zustand', sicher(async () => ({
    ok: true,
    aktiv: await kiosk.kioskAktiv(),
    shell: (await kiosk.shellLesen()).wert,
    rettung: await kiosk.rettungskonten(),
    windows: process.platform === 'win32',
  })));
  ipcMain.handle('kiosk:setzen', sicher(async (_e, an) => {
    const r = await kiosk.shellSetzen(!!an);
    if (r.ok) einstellungen.setzen({ verhalten: { windowsOberflaeche: !!an } });
    return r;
  }));
  ipcMain.handle('kiosk:explorer', sicher(async () => kiosk.explorerStarten()));
  ipcMain.handle('kiosk:programmStarten', sicher(async (_e, pfad, argumente) => kiosk.programmStarten(pfad, argumente)));
  ipcMain.handle('kiosk:programmWaehlen', sicher(async () => {
    const r = await dialog.showOpenDialog(fenster, {
      title: 'Programm auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Programme', extensions: ['exe', 'bat', 'cmd', 'lnk'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, abgebrochen: true };
    return { ok: true, pfad: r.filePaths[0], name: path.basename(r.filePaths[0], path.extname(r.filePaths[0])) };
  }));

  ipcMain.handle('app:kopieren', sicher(async (_e, text) => {
    require('electron').clipboard.writeText(String(text || ''));
    return { ok: true };
  }));
}

// ---------------------------------------------------------------- Start

app.whenReady().then(async () => {
  einstellungen.laden();
  const e = einstellungen.alle();

  protokoll.handhaben();
  ipcEinrichten();

  strom.schlafenVerhindern(!!e.verhalten.niemalsSchlafen);
  if (e.verhalten.autostart !== strom.autostartAn()) strom.autostart(!!e.verhalten.autostart);

  gesperrt = e.verhalten.beimStartSperren !== false;

  fensterBauen();
  sperrTimerSetzen();

  // Notausstieg, falls der Kiosk-Modus mal klemmt.
  globalShortcut.register('Control+Alt+Shift+Q', () => { app.exit(0); });
  globalShortcut.register('Control+Alt+Shift+K', () => {
    if (!fenster) return;
    const an = !fenster.isKiosk();
    fenster.setKiosk(an);
    fenster.setFullScreen(an);
    einstellungen.setzen({ verhalten: { kiosk: an } });
  });

  // Sitzung zum Pi im Hintergrund gültig halten (Token-Kopplung), damit nie ein
  // Anmeldedialog im Zentrale-Fenster auftaucht.
  const sitzungPflegen = () => anmeldung.sitzungSichern().catch(() => {});
  sitzungPflegen();
  setInterval(sitzungPflegen, 30 * 60_000);

  abholenStarten();

  // Ohne Explorer startet Windows die Autostart-Programme nicht – das macht die App.
  const startProgramme = einstellungen.alle().startProgramme || [];
  if (startProgramme.length) {
    setTimeout(async () => {
      const r = await kiosk.programmeStarten(startProgramme);
      const schief = r.filter((x) => !x.ok);
      if (schief.length && fenster) {
        fenster.webContents.send('hinweis', { art: 'warnung', text: 'Nicht gestartet: ' + schief.map((x) => x.name).join(', ') });
      }
    }, 4000);
  }
});

app.on('second-instance', () => {
  if (!fenster) return;
  if (fenster.isMinimized()) fenster.restore();
  fenster.focus();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) fensterBauen(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); strom.schlafenVerhindern(false); });

// Keine fremden Zertifikate durchwinken; nur saubere TLS-Verbindungen.
app.on('certificate-error', (ereignis, _wc, _url, _fehler, _zert, rueck) => { ereignis.preventDefault(); rueck(false); });
