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

protokoll.schemaAnmelden();

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorne.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let fenster = null;          // Haupt-BrowserWindow (die ganze Oberfläche)
let zentraleView = null;     // eingebettete Zentrale (echte Webseite vom Pi)
let gesperrt = true;
let zentraleSichtbar = false;
let letzterSchnappschuss = null;
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
  fenster.on('closed', () => { fenster = null; zentraleView = null; });

  // Links aus der Oberfläche im echten Browser öffnen.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------- Zentrale einbetten

function zentraleBauen() {
  if (zentraleView || !fenster) return zentraleView;
  zentraleView = new WebContentsView({
    webPreferences: {
      partition: pi.PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  zentraleView.setBackgroundColor('#00000000');
  fenster.contentView.addChildView(zentraleView);
  zentraleView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  const wc = zentraleView.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const melden = () => {
    if (!fenster) return;
    fenster.webContents.send('zentrale:zustand', {
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
  wc.on('did-fail-load', (_e, code, text, url, haupt) => {
    if (!haupt || code === -3) return;
    if (fenster) fenster.webContents.send('zentrale:fehler', { code, text, url });
  });

  wc.loadURL(pi.basis() + '/');
  return zentraleView;
}

function zentraleVerstecken() {
  if (!zentraleView) return;
  zentraleSichtbar = false;
  zentraleView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

async function zentraleSchnappschuss() {
  if (!zentraleView || !zentraleSichtbar) return null;
  try {
    const bild = await zentraleView.webContents.capturePage();
    if (bild.isEmpty()) return null;
    letzterSchnappschuss = bild.toDataURL();
    return letzterSchnappschuss;
  } catch { return null; }
}

// ---------------------------------------------------------------- Sperren

async function sperren({ bildschirmAus = null } = {}) {
  const e = einstellungen.alle();
  gesperrt = true;
  zentraleVerstecken();
  if (fenster) {
    fenster.webContents.send('sperre:zustand', { gesperrt: true });
    fenster.focus();
  }
  const aus = bildschirmAus === null ? e.verhalten.bildschirmAusBeiSperre : bildschirmAus;
  if (aus) {
    const r = await strom.bildschirmAus();
    if (!r.ok && fenster) fenster.webContents.send('hinweis', { art: 'warnung', text: 'Monitor liess sich nicht abschalten: ' + (r.fehler || '') });
  }
  return { ok: true };
}

function entsperren() {
  gesperrt = false;
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
  ipcMain.handle('anmeldung:anmelden', sicher(async (_e, passwort, code) => {
    const r = await anmeldung.anmelden(passwort, code);
    if (r.ok) {
      entsperren();
      if (!r.offline) { zentraleBauen(); zentraleView.webContents.reload(); }
    }
    return r;
  }));
  ipcMain.handle('anmeldung:pruefen', sicher(async () => {
    const z = await pi.angemeldet();
    return { ok: true, ...z, gemerkt: anmeldung.gemerkt() };
  }));
  ipcMain.handle('anmeldung:sperren', sicher(async (_e, opt) => sperren(opt || {})));
  ipcMain.handle('anmeldung:abmelden', sicher(async () => {
    await pi.abmelden();
    anmeldung.vergessen();
    if (zentraleView) zentraleView.webContents.loadURL('about:blank');
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
    if (teil?.zentraleUrl && zentraleView) zentraleView.webContents.loadURL(pi.basis() + '/');
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

  // --- Zentrale-Fenster ---
  ipcMain.handle('zentrale:zeigen', sicher(async (_e, flaeche) => {
    if (gesperrt) return { ok: false, fehler: 'Gesperrt' };
    zentraleBauen();
    const b = {
      x: Math.round(flaeche.x), y: Math.round(flaeche.y),
      width: Math.max(0, Math.round(flaeche.width)), height: Math.max(0, Math.round(flaeche.height)),
    };
    zentraleView.setBounds(b);
    zentraleSichtbar = b.width > 0 && b.height > 0;
    return { ok: true };
  }));
  ipcMain.handle('zentrale:verstecken', sicher(async (_e, mitBild) => {
    const bild = mitBild ? await zentraleSchnappschuss() : null;
    zentraleVerstecken();
    return { ok: true, bild };
  }));
  ipcMain.handle('zentrale:befehl', sicher(async (_e, was) => {
    zentraleBauen();
    const wc = zentraleView.webContents;
    const h = wc.navigationHistory;
    if (was === 'zurueck') h ? h.goBack() : wc.goBack();
    else if (was === 'vor') h ? h.goForward() : wc.goForward();
    else if (was === 'neu') wc.reload();
    else if (was === 'start') wc.loadURL(pi.basis() + '/');
    else if (was === 'werkzeuge') wc.toggleDevTools();
    else if (was === 'groesser') wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5));
    else if (was === 'kleiner') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5));
    else if (was === 'normal') wc.setZoomLevel(0);
    return { ok: true };
  }));
  ipcMain.handle('zentrale:oeffnen', sicher(async (_e, pfad) => {
    zentraleBauen();
    zentraleView.webContents.loadURL(pi.basis() + String(pfad || '/'));
    return { ok: true };
  }));
  ipcMain.handle('zentrale:imBrowser', sicher(async () => { await shell.openExternal(pi.basis() + '/'); return { ok: true }; }));

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
  ipcMain.handle('pi:steuern', sicher(async (_e, was, arg) => {
    const s = pi.steuerung;
    const karte = {
      pcWecken: () => s.pcWecken(), pcAus: () => s.pcAus(),
      tvAn: () => s.tvAn(), tvTaste: () => s.tvTaste(arg), tvLautstaerke: () => s.tvLautstaerke(arg),
      szene: () => s.szene(arg), container: () => s.container(arg?.name, arg?.an),
      dienstNeustart: () => s.dienstNeustart(arg), notbetrieb: () => s.notbetrieb(arg),
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

  // War die Sitzung beim Pi noch gültig? Dann ist nach dem Entsperren alles sofort da.
  pi.angemeldet().catch(() => {});
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
