// Einstellungen der Desktop-App. Liegen als JSON im Benutzerordner
// (C:\Users\<du>\AppData\Roaming\Zentrale\einstellungen.json).
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const STANDARD = {
  // --- Verbindung zur Zentrale ---
  zentraleUrl: 'https://homelabkerim.taila4b96b.ts.net:8443',
  // Demo-Modus: Testdaten statt Pi. An, bis du ihn unter Einstellungen → Verbindung ausschaltest.
  demo: true,

  // --- Anmeldung / Sperrbildschirm ---
  anmeldung: {
    benutzerName: 'Kerim',
    untertitel: '',                 // z. B. "Zentrale · HP"
    hintergrund: '',                // Pfad zu einem Bild, leer = eingebauter Verlauf
    hintergrundArt: 'verlauf',      // verlauf | bild | farbe
    farbe: '#0b1220',
    weichzeichnen: 24,              // 0–60 px
    uhrZeigen: true,
    datumZeigen: true,
    avatar: '',                     // Pfad zu einem Bild, leer = Initiale
    offlineErlauben: true,          // Anmelden ohne Pi (nur Passwort, kein 2FA)
    autoSperrenMin: 0,              // 0 = aus, sonst nach X Minuten ohne Eingabe sperren
  },

  // --- Aussehen ---
  aussehen: {
    hintergrund: '',                // Desktop-Hintergrundbild, leer = eingebauter Verlauf
    hintergrundArt: 'verlauf',
    akzent: '#2457f5',
    hell: false,                    // helles Thema
    glas: 22,                       // Weichzeichner der Fenster und Leisten (px)
    radius: 12,                     // Eckenradius der Fenster (px)
    tempo: 1,                       // Animationsgeschwindigkeit (0 = aus)
    schrift: 14,                    // Schriftgrösse der Oberfläche (px)
    verlauf: 'blau',                // eingebauter Hintergrund: blau | abend | wald | graphit
    dockGroesse: 56,
    dockVergroessern: true,
    menueleiste: true,
  },

  // --- Verhalten ---
  verhalten: {
    kiosk: true,                    // Vollbild ohne Rahmen, wie ein Betriebssystem
    autostart: true,                // mit Windows starten
    beimStartSperren: true,         // nach dem Hochfahren Anmeldebildschirm
    zentraleBeimStart: true,        // Zentrale-Fenster gleich öffnen
    bildschirmAusBeiSperre: true,   // "Ausschalten" = Monitor aus, Rechner läuft weiter
    niemalsSchlafen: true,          // verhindert Energiesparmodus (Trading-Bot läuft weiter)
    windowsOberflaeche: false,      // App ersetzt den Explorer als Windows-Shell
  },

  // --- Programme, die die App beim Start mitstartet (ohne Explorer tut das sonst niemand) ---
  startProgramme: [],               // [{ name, pfad, argumente: [] }]

  // --- Finder ---
  finder: {
    versteckteZeigen: false,
    ansicht: 'liste',               // liste | symbole
    lokaleOrte: [],                 // zusätzliche lokale Ordner in der Seitenleiste
    sortierung: 'name',             // name | groesse | geaendert
  },

  // --- Dock --- (Kennungen: 'finder', 'steuerung', 'einstellungen' oder 'zentrale:<Tab>')
  dock: ['launchpad', 'finder', 'zentrale:Übersicht', 'steuerung', 'zentrale:Trading', 'web', 'terminal', 'software', 'aktivitaet', 'einstellungen'],

  // --- Schreibtisch: Symbole und Widgets, frei anzuordnen ---
  schreibtisch: {
    raster: 110,              // Rasterweite in Pixeln, an der eingerastet wird
    einrasten: true,
    symbole: [
      { app: 'finder', x: 0, y: 0 },
      { app: 'zentrale:Übersicht', x: 0, y: 1 },
      { app: 'steuerung', x: 0, y: 2 },
    ],
    widgets: [
      { id: 'w1', typ: 'pi', x: 2, y: 0, breit: 3, hoch: 2 },
      { id: 'w2', typ: 'haus', x: 5, y: 0, breit: 3, hoch: 2 },
    ],
  },
};

let datei = null;
let daten = null;

function tiefMischen(standard, roh) {
  const out = Array.isArray(standard) ? (Array.isArray(roh) ? roh.slice() : standard.slice()) : { ...standard };
  if (Array.isArray(standard)) return out;
  for (const [k, v] of Object.entries(roh || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && standard[k] && typeof standard[k] === 'object' && !Array.isArray(standard[k])) {
      out[k] = tiefMischen(standard[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function laden() {
  datei = path.join(app.getPath('userData'), 'einstellungen.json');
  try {
    daten = tiefMischen(STANDARD, JSON.parse(fs.readFileSync(datei, 'utf8')));
  } catch {
    daten = tiefMischen(STANDARD, {});
  }
  return daten;
}

function alle() {
  if (!daten) laden();
  return daten;
}

// Speichert einen Teilbaum, z. B. setzen({ anmeldung: { uhrZeigen: false } })
function setzen(teil) {
  const d = alle();
  daten = tiefMischen(d, teil || {});
  const tmp = datei + '.tmp';
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), 'utf8');
  fs.renameSync(tmp, datei);
  return daten;
}

function zuruecksetzen() {
  daten = tiefMischen(STANDARD, {});
  setzen({});
  return daten;
}

module.exports = { alle, setzen, laden, zuruecksetzen, STANDARD };
