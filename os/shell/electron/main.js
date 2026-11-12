// ZentraleOS – Hauptprozess der Shell.
//
// Die Shell ist die Oberfläche des Systems: Anmeldebildschirm, Schreibtisch, Dock,
// Menüleiste, eigene Programme und die Zentrale-Apps als Fenster. Fremde Programme
// (Terminal-Fenster, Browser, Flatpak, Wine) laufen als normale Fenster des
// Compositors (labwc) über dem Schreibtisch.
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, screen, nativeTheme, session } = require('electron');

const einstellungen = require('./lib/einstellungen');
const protokoll = require('./lib/protokoll');
const pi = require('./lib/pi');
const lokal = require('./lib/lokal');
const anmeldung = require('./lib/anmeldung');
const strom = require('./lib/strom');
const demo = require('./lib/demo');
const system = require('./lib/system');
const mehr = require('./lib/mehr');

const ARG = process.argv.slice(1);
const ENTWICKLUNG = ARG.includes('--entwicklung');
const argWert = (liste, name) => { const a = liste.find((x) => String(x).startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : null; };
app.setName('ZentraleOS');
try { app.setDesktopName('zentraleos-shell.desktop'); } catch {}

protokoll.schemaAnmelden();

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorne.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let fenster = null;          // Haupt-BrowserWindow (die ganze Oberfläche)
let gesperrt = true;
let bildschirmAus = false;
let sperrTimer = null;
let ausSeit = 0;              // wann der Bildschirm abgeschaltet wurde
let sperrWache = null;        // hält fremde Fenster unten, solange gesperrt ist

// ---------------------------------------------------------------- Fenster

function skalaAnwenden() {
  if (!fenster || fenster.isDestroyed()) return;
  const s = Math.max(0.8, Math.min(2.5, Number(einstellungen.alle().aussehen.skala) || 1));
  fenster.webContents.setZoomFactor(s);
}

function fensterBauen() {
  const e = einstellungen.alle();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  nativeTheme.themeSource = e.aussehen.hell ? 'light' : 'dark';

  fenster = new BrowserWindow({
    width, height,
    show: false,
    frame: false,
    kiosk: false,
    fullscreen: !ENTWICKLUNG,
    autoHideMenuBar: true,
    backgroundColor: e.aussehen.hell ? '#f2f2f7' : '#0b1220',
    title: 'ZentraleOS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: pi.PARTITION,       // dieselbe Sitzung wie die eingebetteten Zentrale-Apps
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  fenster.setMenuBarVisibility(false);
  fenster.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  fenster.webContents.on('did-finish-load', skalaAnwenden);
  fenster.once('ready-to-show', () => {
    fenster.show();
    fenster.focus();
  });

  // Fehler aus der Oberfläche im Protokoll sichtbar machen (hilft beim Suchen).
  fenster.webContents.on('console-message', (_e, stufe, text, zeile, quelle) => {
    if (stufe >= 2) console.error('[oberflaeche]', text, `${String(quelle).split('/').pop()}:${zeile}`);
  });

  fenster.on('resize', () => fenster.webContents.send('fenster:groesse'));
  fenster.on('closed', () => { fenster = null; });
  fenster.on('page-title-updated', (ev) => ev.preventDefault());
  // Lädt eine eingebettete Zentrale-App nicht (Pi weg), bekommt ihr Fenster eine Fehlerseite.
  fenster.webContents.on('did-fail-load', (_e, code, text, url, haupt) => {
    if (!haupt && code !== -3 && fenster) fenster.webContents.send('zentrale:fehler', { url, code, text });
  });

  // Links aus der Oberfläche im echten Browser öffnen.
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------- Zentrale einbetten
//
// Die Zentrale-Apps sind <iframe> IN den Fenstern der Shell (keine überlagerte
// Ansicht mehr wie in Version 1). Damit das geht, entfernt die Shell die
// Rahmen-Verbote aus den Antworten der Zentrale und stellt deren Cookies so um,
// dass sie auch im eingebetteten Rahmen gelten. Das gilt NUR für die Adresse der
// Zentrale, nicht für fremde Seiten.

function einbettenErlauben() {
  const s = session.fromPartition(pi.PARTITION);
  s.webRequest.onHeadersReceived((d, weiter) => {
    const basis = pi.basis();
    if (!basis || !d.url.startsWith(basis)) return weiter({});
    const kopf = {};
    for (const [k, v] of Object.entries(d.responseHeaders || {})) {
      const n = k.toLowerCase();
      if (n === 'x-frame-options') continue;
      if (n === 'content-security-policy') { kopf[k] = v.map((x) => x.split(';').filter((t) => !/^\s*frame-ancestors/i.test(t)).join(';')); continue; }
      if (n === 'set-cookie') { kopf[k] = v.map((c) => c.replace(/;\s*SameSite=[^;]*/i, '').replace(/;\s*Secure/i, '') + '; SameSite=None; Secure'); continue; }
      kopf[k] = v;
    }
    weiter({ responseHeaders: kopf });
  });
}

// ---------------------------------------------------------------- Sperren

async function sperren({ bildschirmAus: schirmAus = null } = {}) {
  const e = einstellungen.alle();
  gesperrt = true;
  system.alleMinimieren().catch(() => {});   // fremde Fenster dürfen nicht über der Sperre liegen
  sperrWacheStarten();
  if (fenster) {
    fenster.webContents.send('sperre:zustand', { gesperrt: true });
    fenster.focus();
  }
  const aus = schirmAus === null ? e.verhalten.bildschirmAusBeiSperre : schirmAus;
  if (aus) {
    const r = await strom.bildschirmAus();
    bildschirmAus = !!r.ok; ausSeit = Date.now();
    if (!r.ok && fenster) fenster.webContents.send('hinweis', { art: 'warnung', text: 'Monitor liess sich nicht abschalten: ' + (r.fehler || '') });
  }
  return { ok: true };
}

// Solange gesperrt ist, darf kein fremdes Fenster nach vorn: jede Sekunde alles Fremde wieder ablegen.
function sperrWacheStarten() {
  if (sperrWache || process.platform !== 'linux') return;
  sperrWache = setInterval(() => { if (!gesperrt) { clearInterval(sperrWache); sperrWache = null; return; } system.alleMinimieren().catch(() => {}); if (fenster && !fenster.isFocused()) fenster.focus(); }, 1000);
}

// Bildschirm wieder an (Maus, Taste oder Befehl aus der Zentrale). Entsperrt NICHT – der Code bleibt nötig.
async function wecken() {
  if (!bildschirmAus || Date.now() - ausSeit < 2500) return { ok: true };
  const a = await strom.bildschirmAn(); bildschirmAus = !a.ok; return a;
}

// «Schlafen gehen»: alle Programme beenden (ausser den Ausnahmen, z. B. dem Bot), sperren, Bildschirm aus.
async function schlafen() {
  if (fenster) fenster.webContents.send('befehl', 'alleSchliessen');
  const r = await mehr.allesBeenden().catch((f) => ({ ok: false, fehler: String(f.message || f) }));
  await sperren({ bildschirmAus: true });
  return r;
}

function entsperren() {
  gesperrt = false;
  if (sperrWache) { clearInterval(sperrWache); sperrWache = null; }
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
    else if (b === 'bildschirmAn') { ausSeit = 0; await wecken(); }
    else if (b === 'schlafen') await schlafen();
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
    demo: !!demo.url(),
    piBasis: pi.basis(),
    heim: require('node:os').homedir(),
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
      if (r.pi && fenster) fenster.webContents.send('zentrale:neuLaden');
    }
    return r;
  }));
  ipcMain.handle('anmeldung:zustand', sicher(async () => ({ ok: true, ...anmeldung.zustand() })));
  ipcMain.handle('anmeldung:pruefen', sicher(async () => {
    const z = await pi.angemeldet();
    return { ok: true, ...z, ...anmeldung.zustand() };
  }));
  ipcMain.handle('anmeldung:pinSetzen', sicher(async (_e, pin) => { const r = await anmeldung.pinSetzen(pin); if (r.ok) einstellungen.setzen({ anmeldung: { eigenerCode: true } }); return r; }));
  ipcMain.handle('anmeldung:pinEntfernen', sicher(async () => anmeldung.pinEntfernen()));
  ipcMain.handle('anmeldung:koppeln', sicher(async () => anmeldung.koppeln()));
  ipcMain.handle('anmeldung:geraete', sicher(async () => pi.geraeteListe()));
  ipcMain.handle('anmeldung:geraetWeg', sicher(async (_e, id) => pi.geraetEntkoppeln(id)));
  ipcMain.handle('anmeldung:sitzungSichern', sicher(async () => anmeldung.sitzungSichern()));
  ipcMain.handle('anmeldung:sperren', sicher(async (_e, opt) => sperren(opt || {})));
  ipcMain.handle('anmeldung:abmelden', sicher(async () => {
    await pi.abmelden();
    anmeldung.alleszuruecksetzen();
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
    if (teil?.anmeldung?.autoSperrenMin !== undefined || teil?.ruhe?.bildschirmAusMin !== undefined) strom.leerlaufWaechter(neu.anmeldung.autoSperrenMin, neu.ruhe.bildschirmAusMin);
    if (teil?.aussehen?.skala !== undefined) skalaAnwenden();
    if ((teil?.demo !== undefined && !!teil.demo !== !!vorher.demo) || (teil?.zentraleUrl && teil.zentraleUrl !== vorher.zentraleUrl)) setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
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
  ipcMain.handle('strom:bildschirmAn', sicher(async () => wecken()));
  ipcMain.handle('app:beenden', sicher(async () => { app.exit(0); return { ok: true }; }));
  ipcMain.handle('app:neustart', sicher(async () => { app.relaunch(); app.exit(0); return { ok: true }; }));
  ipcMain.handle('app:linkOeffnen', sicher(async (_e, url) => {
    if (!/^https?:/i.test(String(url))) return { ok: false, fehler: 'Nur http/https' };
    await shell.openExternal(url);
    return { ok: true };
  }));
  systemIpc();

  ipcMain.handle('app:kopieren', sicher(async (_e, text) => {
    require('electron').clipboard.writeText(String(text || ''));
    return { ok: true };
  }));
}

// ---------------------------------------------------------------- System

function befehlAusfuehren(b) {
  if (b === 'sperren') return sperren({ bildschirmAus: false });
  if (b === 'bildschirmAus') return bildschirmAus ? null : sperren({ bildschirmAus: true });
  if (b === 'bildschirmAn') return wecken();
  if (b === 'schlafen') return schlafen();
  if (b === 'bildschirmfoto-bereich') { if (!gesperrt) system.bildschirmfoto(true).then((r) => fenster && r && fenster.webContents.send('hinweis', r.ok ? { art: 'ok', text: 'Bildschirmfoto gespeichert: ' + r.pfad } : { art: 'fehler', text: r.fehler || 'Abgebrochen' })); return null; }
  if (['wechsler', 'wechsler-zurueck', 'uebersicht', 'zwischenablage', 'terminal', 'desktop-rechts', 'desktop-links'].includes(b)) {
    if (fenster && !gesperrt) { if (!b.startsWith('desktop') && !b.startsWith('wechsler')) { system.fensterFokus('zentraleos-shell').catch(() => {}); fenster.focus(); } fenster.webContents.send('befehl', b); }
    return null;
  }
  if (b === 'bildschirmfoto' && gesperrt) return null;
  if (b === 'bildschirmfoto') return system.bildschirmfoto(false).then((r) => fenster && fenster.webContents.send('hinweis', r.ok ? { art: 'ok', text: 'Bildschirmfoto gespeichert: ' + r.pfad } : { art: 'fehler', text: r.fehler }));
  if (['spotlight', 'schreibtisch', 'launchpad', 'kontrollzentrum', 'start'].includes(b)) {
    if (b !== 'schreibtisch') system.fensterFokus('zentraleos-shell').catch(() => {});
    else system.alleMinimieren().catch(() => {});
    if (fenster && !gesperrt) { fenster.focus(); fenster.webContents.send('befehl', b); }
  }
  return null;
}

function systemIpc() {
  const h = (kanal, fn) => ipcMain.handle('sys:' + kanal, sicher(async (_e, ...a) => fn(...a)));
  const senden = (kanal) => (d) => { if (fenster && !fenster.isDestroyed()) fenster.webContents.send(kanal, d); };
  const nurOffen = (fn) => (...a) => (gesperrt ? { ok: false, fehler: 'Gesperrt' } : fn(...a));
  const klein = (r) => ({ ok: r.ok, fehler: r.fehler, aus: String(r.aus || '').slice(-6000), passwortNoetig: r.passwortNoetig, falsch: r.falsch });

  h('info', system.info); h('geraete', system.geraete); h('dienste', system.dienste); h('prozesse', system.prozesse); h('beenden', nurOffen(system.beenden));
  h('wlan', system.wlan); h('wlanSchalten', async (an) => klein(await system.wlanSchalten(an)));
  h('wlanVerbinden', nurOffen(async (ssid, pw) => klein(await system.wlanVerbinden(ssid, pw)))); h('wlanTrennen', async (g) => klein(await system.wlanTrennen(g)));
  h('bluetooth', system.bluetooth); h('bluetoothSchalten', async (an) => klein(await system.bluetoothSchalten(an)));
  h('tailscale', system.tailscale); h('netzweg', system.netzweg); h('tailscaleDns', nurOffen(async (an) => klein(await system.tailscaleDns(an)))); h('tailscaleExit', async (ip) => klein(await system.tailscaleExit(ip)));
  h('ton', system.ton); h('tonSetzen', async (p) => klein(await system.tonSetzen(p))); h('tonStumm', async (an) => klein(await system.tonStumm(an))); h('tonAusgabe', async (id) => klein(await system.tonAusgabe(id)));
  h('helligkeit', system.helligkeit); h('helligkeitSetzen', async (p) => klein(await system.helligkeitSetzen(p)));
  h('anzeige', system.anzeige); h('anzeigeSetzen', async (n, o) => klein(await system.anzeigeSetzen(n, o)));
  h('energie', system.energie); h('energieSetzen', async (p) => klein(await system.energieSetzen(p)));
  h('zeit', system.zeit); h('zeitzonen', system.zeitzonen); h('tastatur', system.tastatur);
  h('firewall', system.firewallLesen);
  h('firewallSetzen', nurOffen(async (k, pw) => klein(await system.firewallSetzen(k, { passwort: pw }))));
  // Feste Root-Aktionen; alles andere lehnt der Helfer ab.
  const ROOT = ['pruefen', 'firewall-bestaetigen', 'firewall-zuruecknehmen', 'firewall-zustand', 'firewall-protokoll', 'ports', 'ssh', 'zeitzone', 'ntp', 'hostname', 'tastatur', 'updates-suchen', 'updates-einspielen', 'auto-updates', 'paket-installieren', 'protokoll', 'tailscale-anmelden', 'energie'];
  h('root', nurOffen(async (aktion, args, pw) => (ROOT.includes(aktion) ? klein(await system.alsRoot(aktion, args || [], { passwort: pw, timeout: 30 * 60_000 })) : { ok: false, fehler: 'Nicht erlaubt' })));
  h('passwortAendern', nurOffen(async (neu, pw) => klein(await system.alsRoot('passwort', [], { passwort: pw, eingabe: `${require('node:os').userInfo().username}:${String(neu).replace(/[\r\n]/g, '')}\n` }))));
  h('rootVergessen', async () => { system.rootVergessen(); return { ok: true }; });
  h('programme', system.programme); h('programmStarten', nurOffen(system.programmStarten));
  h('webAppAnlegen', nurOffen(system.webAppAnlegen)); h('eigenesEntfernen', nurOffen(system.eigenesProgrammEntfernen));
  h('fremdeFenster', system.fremdeFenster); h('fensterFokus', async (a, t) => klein(await system.fensterFokus(a, t))); h('fensterZu', async (a) => klein(await system.fensterZu(a)));
  h('flatpakSuche', system.flatpakSuche); h('flatpakListe', system.flatpakListe);
  h('flatpakInstallieren', nurOffen(async (id) => klein(await system.flatpakInstallieren(id)))); h('flatpakEntfernen', nurOffen(async (id) => klein(await system.flatpakEntfernen(id))));
  h('flatpakAktualisieren', nurOffen(async () => klein(await system.flatpakAktualisieren())));
  h('terminalStarten', nurOffen((id, opt) => system.terminalStarten(String(id), senden('terminal:daten'), opt || {})));
  h('terminalEingabe', (id, t) => system.terminalEingabe(String(id), String(t))); h('terminalGroesse', (id, s, z) => system.terminalGroesse(String(id), s, z)); h('terminalBeenden', (id) => system.terminalBeenden(String(id)));
  h('bildschirmfoto', nurOffen(system.bildschirmfoto));
  h('browser', nurOffen(async (url) => system.befehlStarten((fs.existsSync('/usr/bin/brave-browser') ? 'brave-browser --password-store=basic' : 'chromium') + (/^https?:\/\/[^\s"'`$\\]+$/i.test(String(url || '')) ? ` '${url}'` : ''))));
  h('symbolUrl', async (p) => ({ ok: true, url: protokoll.lokalUrl(p) }));

  // --- Weitere Systemfunktionen (lib/mehr.js) ---
  const m = (kanal, fn) => ipcMain.handle('mehr:' + kanal, sicher(async (_e, ...a) => fn(...a)));
  m('ablageListe', nurOffen(mehr.ablageListe)); m('ablageNehmen', nurOffen(mehr.ablageNehmen)); m('ablageLeeren', mehr.ablageLeeren);
  m('papierkorb', mehr.papierkorb); m('papierkorbZurueck', nurOffen(mehr.papierkorbZurueck)); m('papierkorbLeeren', nurOffen(mehr.papierkorbLeeren));
  m('fotos', nurOffen(mehr.fotos));
  m('datentraeger', mehr.datentraeger); m('ordnerAnalyse', nurOffen(mehr.ordnerAnalyse));
  m('einhaengen', nurOffen(async (g) => klein(await mehr.einhaengen(g)))); m('aushaengen', nurOffen(async (g) => klein(await mehr.aushaengen(g))));
  m('smart', nurOffen(async (g, pw) => klein(await mehr.smart(g, pw))));
  m('sicherheit', () => mehr.sicherheit({ pinGesetzt: anmeldung.pinGesetzt() }));
  m('netz', mehr.netz); m('netzVergessen', nurOffen(mehr.netzVergessen));
  m('botStand', mehr.botStand); m('botPruefen', async () => { await mehr.botPruefen(); return mehr.botStand(); }); m('meldeTest', nurOffen(() => mehr.melden('Testmeldung von ZentraleOS (' + require('node:os').hostname() + ')')));
  m('backupSchluessel', nurOffen(mehr.backupSchluessel)); m('backupJetzt', nurOffen(mehr.backupJetzt));
  m('schlafen', nurOffen(schlafen));
  m('fokusStart', nurOffen(async (pw) => { const r = await mehr.fokusStart(pw); return r.ok ? r : klein(r); })); m('fokusEnde', nurOffen(async (pw) => { const r = await mehr.fokusEnde(pw); return r.ok ? r : klein(r); })); m('fokusStand', mehr.fokusStand);
  m('installPlatten', mehr.installPlatten); m('installieren', nurOffen(async (k, pw) => klein(await mehr.installieren(k || {}, pw)))); m('installStand', mehr.installStand);
  m('energie', nurOffen(mehr.energie)); m('fernzugriff', mehr.fernzugriff);
  m('rootMehr', nurOffen(async (aktion, args, pw) => (['ssh-fern', 'update-fenster'].includes(aktion) ? klein(await system.alsRoot(aktion, args || [], { passwort: pw, timeout: 60000 })) : { ok: false, fehler: 'Nicht erlaubt' })));
  m('desktopTaste', nurOffen(async (richtung) => klein(await system.lauf('wtype', ['-M', 'ctrl', '-M', 'logo', '-k', richtung === 'links' ? 'Left' : 'Right'], { timeout: 4000 }))));
  m('fensterKlein', async (a) => klein(await system.lauf('wlrctl', ['toplevel', 'minimize', `app_id:${String(a)}`], { timeout: 4000 })));
}

// ---------------------------------------------------------------- Start

app.whenReady().then(async () => {
  einstellungen.laden();
  const e = einstellungen.alle();

  // Erster Start nach der Installation: den dort gewählten Code für die Sperre übernehmen.
  try {
    const erst = path.join(app.getPath('userData'), 'erststart.json');
    if (fs.existsSync(erst)) {
      const d = JSON.parse(fs.readFileSync(erst, 'utf8')); fs.rmSync(erst, { force: true });
      if (d.pin && (await anmeldung.pinSetzen(String(d.pin))).ok) einstellungen.setzen({ anmeldung: { eigenerCode: true, ...(d.name ? { benutzerName: String(d.name).slice(0, 40) } : {}) } });
    }
  } catch (f) { console.error('[erststart]', f.message); }

  // Demo-Modus: lokaler Server mit Testdaten spielt den Pi (siehe lib/demo.js).
  if (ARG.includes('--demo') || e.demo) {
    try { global.zosDemoUrl = await demo.starten(app.getPath('userData')); } catch (f) { console.error('[demo]', f.message); }
    if (global.zosDemoUrl && !anmeldung.pinGesetzt()) await anmeldung.pinSetzen('1234');   // Demo-PIN, steht auf dem Sperrbildschirm
    if (global.zosDemoUrl && !anmeldung.gekoppelt()) await anmeldung.koppeln().catch(() => {});   // damit die Fernsteuerung auch in der Demo geht
  }
  einbettenErlauben();

  protokoll.handhaben();
  ipcEinrichten();

  strom.schlafenVerhindern(!!e.verhalten.niemalsSchlafen);
  if (e.verhalten.autostart !== strom.autostartAn()) strom.autostart(!!e.verhalten.autostart);

  gesperrt = e.verhalten.beimStartSperren !== false;
  // Startet die Oberfläche in derselben Sitzung noch einmal (Absturz, «Oberfläche neu starten»), ist sie immer gesperrt –
  // sonst liesse sich die Sperre durch einen Absturz umgehen.
  if (process.platform === 'linux' && process.env.XDG_RUNTIME_DIR) {
    const marke = path.join(process.env.XDG_RUNTIME_DIR, 'zos-lief');
    if (fs.existsSync(marke)) gesperrt = true; else { try { fs.writeFileSync(marke, String(Date.now())); } catch {} }
  }

  fensterBauen();
  sperrTimerSetzen();
  strom.leerlaufWaechter(e.anmeldung.autoSperrenMin, e.ruhe.bildschirmAusMin);
  if (gesperrt) sperrWacheStarten();
  if (process.platform === 'linux') mehr.socketStarten((b) => { try { befehlAusfuehren(b); } catch {} });
  mehr.starten({ hinweis: (text, art) => { if (fenster && !fenster.isDestroyed()) fenster.webContents.send('hinweis', { text, art: art || 'info' }); } });

  if (ENTWICKLUNG) globalShortcut.register('Control+Alt+Shift+Q', () => { app.exit(0); });

  // Sitzung zum Pi im Hintergrund gültig halten (Token-Kopplung), damit nie ein
  // Anmeldedialog im Zentrale-Fenster auftaucht.
  const sitzungPflegen = () => anmeldung.sitzungSichern().catch(() => {});
  sitzungPflegen();
  setInterval(sitzungPflegen, 30 * 60_000);

  abholenStarten();

});

// «zos <befehl>» startet eine zweite Instanz, die hier nur ihren Befehl abgibt.
app.on('second-instance', (_e, argv) => {
  const b = argWert(argv, 'befehl');
  if (b) befehlAusfuehren(b);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) fensterBauen(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); strom.schlafenVerhindern(false); system.alleTerminalsBeenden(); demo.stoppen(); });

// Keine fremden Zertifikate durchwinken; nur saubere TLS-Verbindungen.
app.on('certificate-error', (ereignis, _wc, _url, _fehler, _zert, rueck) => { ereignis.preventDefault(); rueck(false); });
