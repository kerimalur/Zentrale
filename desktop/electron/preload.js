// Brücke zwischen Oberfläche und Hauptprozess. Die Oberfläche selbst hat keinen
// Node-Zugriff – sie darf nur das, was hier aufgelistet ist.
const { contextBridge, ipcRenderer } = require('electron');

const r = (kanal, ...args) => ipcRenderer.invoke(kanal, ...args);

contextBridge.exposeInMainWorld('zentrale', {
  // Grundzustand
  zustand: () => r('app:zustand'),

  // Anmeldung / Sperre
  anmelden: (eingabe, code, modus) => r('anmeldung:anmelden', eingabe, code, modus),
  anmeldungZustand: () => r('anmeldung:zustand'),
  anmeldungPruefen: () => r('anmeldung:pruefen'),
  pinSetzen: (pin) => r('anmeldung:pinSetzen', pin),
  pinEntfernen: () => r('anmeldung:pinEntfernen'),
  koppeln: () => r('anmeldung:koppeln'),
  geraete: () => r('anmeldung:geraete'),
  geraetWeg: (id) => r('anmeldung:geraetWeg', id),
  sitzungSichern: () => r('anmeldung:sitzungSichern'),
  sperren: (opt) => r('anmeldung:sperren', opt),
  abmelden: () => r('anmeldung:abmelden'),

  // Einstellungen
  einstellungen: {
    alle: () => r('einstellungen:alle'),
    setzen: (teil) => r('einstellungen:setzen', teil),
    zuruecksetzen: () => r('einstellungen:zuruecksetzen'),
    bildWaehlen: () => r('einstellungen:bildWaehlen'),
    ordnerWaehlen: () => r('einstellungen:ordnerWaehlen'),
  },

  // Eingebettete Zentrale – eine Ansicht je Fenster (id)
  web: {
    zeigen: (id, flaeche, url) => r('zentrale:zeigen', id, flaeche, url),
    verstecken: (id, mitBild) => r('zentrale:verstecken', id, mitBild),
    schliessen: (id) => r('zentrale:schliessen', id),
    befehl: (id, was) => r('zentrale:befehl', id, was),
    laden: (id, url) => r('zentrale:laden', id, url),
    imBrowser: (url) => r('zentrale:imBrowser', url),
  },

  // Dateien auf dem Pi
  pi: {
    laufwerke: () => r('pi:laufwerke'),
    liste: (w, p, v) => r('pi:liste', w, p, v),
    text: (w, p) => r('pi:text', w, p),
    textSchreiben: (w, p, i) => r('pi:textSchreiben', w, p, i),
    neu: (w, p, ordner, inhalt) => r('pi:neu', w, p, ordner, inhalt),
    umbenennen: (w, p, n) => r('pi:umbenennen', w, p, n),
    verschieben: (a) => r('pi:verschieben', a),
    loeschen: (w, p, endg) => r('pi:loeschen', w, p, endg),
    papierkorb: (w) => r('pi:papierkorb', w),
    teilen: (w, p, tage) => r('pi:teilen', w, p, tage),
    freigaben: () => r('pi:freigaben'),
    freigabeWeg: (t) => r('pi:freigabeWeg', t),
    status: () => r('pi:status'),
    trading: () => r('pi:trading'),
    heute: () => r('pi:heute'),
    garmin: () => r('pi:garmin'),
    steuern: (was, arg) => r('pi:steuern', was, arg),
    url: (w, p) => r('url:pi', w, p),
  },

  // Dateien auf dem HP
  lokal: {
    orte: () => r('lokal:orte'),
    liste: (p, v) => r('lokal:liste', p, v),
    text: (p) => r('lokal:text', p),
    textSchreiben: (p, i) => r('lokal:textSchreiben', p, i),
    neu: (ordner, name, istOrdner, inhalt) => r('lokal:neu', ordner, name, istOrdner, inhalt),
    umbenennen: (p, n) => r('lokal:umbenennen', p, n),
    verschieben: (q, z, kop) => r('lokal:verschieben', q, z, kop),
    loeschen: (p, endg) => r('lokal:loeschen', p, endg),
    oeffnen: (p) => r('lokal:oeffnen', p),
    imOrdner: (p) => r('lokal:imOrdner', p),
    url: (p) => r('url:lokal', p),
  },

  // Übertragen zwischen Pi und HP
  uebertragen: {
    piZuLokal: (w, p, ziel) => r('uebertragen:piZuLokal', w, p, ziel),
    lokalZuPi: (quelle, w, ziel) => r('uebertragen:lokalZuPi', quelle, w, ziel),
  },

  // Harter Kiosk (App als Windows-Oberfläche) und Startprogramme
  kiosk: {
    zustand: () => r('kiosk:zustand'),
    setzen: (an) => r('kiosk:setzen', an),
    explorer: () => r('kiosk:explorer'),
    programmStarten: (pfad, argumente) => r('kiosk:programmStarten', pfad, argumente),
    programmWaehlen: () => r('kiosk:programmWaehlen'),
  },

  // System
  system: {
    bildschirmAus: () => r('strom:bildschirmAus'),
    bildschirmAn: () => r('strom:bildschirmAn'),
    beenden: () => r('app:beenden'),
    neustart: () => r('app:neustart'),
    kiosk: (an) => r('app:kiosk', an),
    linkOeffnen: (url) => r('app:linkOeffnen', url),
    kopieren: (text) => r('app:kopieren', text),
  },

  // Nachrichten aus dem Hauptprozess
  auf: (name, fn) => {
    const erlaubt = ['sperre:zustand', 'zentrale:zustand', 'zentrale:fehler', 'fenster:groesse', 'hinweis'];
    if (!erlaubt.includes(name)) return () => {};
    const h = (_e, daten) => fn(daten);
    ipcRenderer.on(name, h);
    return () => ipcRenderer.removeListener(name, h);
  },
});
