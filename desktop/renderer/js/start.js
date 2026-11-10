// Startpunkt der Oberfläche: Einstellungen laden, Apps anmelden, alles verdrahten.

// ---------------------------------------------------------------- Einstellungen
const Einst = {
  daten: null,

  mischen(ziel, teil) {
    for (const [k, v] of Object.entries(teil || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && ziel[k] && typeof ziel[k] === 'object' && !Array.isArray(ziel[k])) this.mischen(ziel[k], v);
      else ziel[k] = v;
    }
    return ziel;
  },

  // Sofort in der Oberfläche wirksam, im Hintergrund gespeichert.
  setzen(teil) {
    this.mischen(this.daten, teil);
    Z.einstellungen.setzen(teil).then((r) => { if (r && r.ok) this.daten = r.einstellungen; });
    return this.daten;
  },

  async setzenAsync(teil) {
    this.mischen(this.daten, teil);
    const r = await Z.einstellungen.setzen(teil);
    if (r && r.ok) this.daten = r.einstellungen;
    return this.daten;
  },
};

// ---------------------------------------------------------------- Apps
const Apps = {
  zentrale: { name: 'Zentrale', symbol: 'zentrale', fensterId: 'zentrale', farbe: 'linear-gradient(160deg,#3b82f6,#1d4ed8)', oeffnen: (tab) => ZentraleFenster.oeffnen(typeof tab === 'string' ? tab : null) },
  finder: { name: 'Finder', symbol: 'finder', fensterId: 'finder', farbe: 'linear-gradient(160deg,#38bdf8,#0369a1)', oeffnen: (start) => Finder.oeffnen(start && start.quelle ? start : null) },
  steuerung: { name: 'Steuerung', symbol: 'steuerung', fensterId: 'steuerung', farbe: 'linear-gradient(160deg,#a78bfa,#6d28d9)', oeffnen: () => Steuerung.oeffnen() },
  einstellungen: { name: 'Einstellungen', symbol: 'einstellungen', fensterId: 'einstellungen', farbe: 'linear-gradient(160deg,#9ca3af,#4b5563)', oeffnen: (b) => EinstellungenApp.oeffnen(typeof b === 'string' ? b : null) },
};

// ---------------------------------------------------------------- Schreibtisch
const Schreibtisch = {
  zustand: {},

  async start() {
    const z = await Z.zustand();
    this.zustand = z || {};
    Einst.daten = (z && z.einstellungen) || {};

    this.aussehenAnwenden();
    Menueleiste.bauen();
    Dock.bauen();
    this.horchen();
    this.tasten();

    if (z && z.gesperrt) Sperre.zeigen();
    else this.nachAnmeldung(false, true);
  },

  aussehenAnwenden() {
    const a = Einst.daten.aussehen || {};
    document.body.classList.toggle('hell', !!a.hell);
    document.body.classList.toggle('dunkel', !a.hell);
    if (a.akzent) document.documentElement.style.setProperty('--akzent', a.akzent);
    document.documentElement.style.setProperty('--menue-h', a.menueleiste === false ? '0px' : '28px');
    $('#menueleiste').style.display = a.menueleiste === false ? 'none' : 'flex';

    const t = $('#tapete');
    if (a.hintergrundArt === 'bild' && a.hintergrund) {
      Z.lokal.url(a.hintergrund).then((r) => { if (r.ok) t.style.backgroundImage = `url("${r.url}")`; });
    } else {
      t.style.backgroundImage = '';
    }
  },

  nachAnmeldung(offline, start = false) {
    this.aussehenAnwenden();
    if (offline) {
      hinweis('Der Pi ist gerade nicht erreichbar. Dateien auf dem HP gehen trotzdem.', 'warnung', 'Ohne Pi angemeldet');
    }
    if (Einst.daten.verhalten?.zentraleBeimStart !== false && !offline) {
      if (!FM.finden('zentrale')) ZentraleFenster.oeffnen();
    } else if (offline && start) {
      Finder.oeffnen();
    }
    setTimeout(() => ZentraleFenster.anpassen(), 120);
    Menueleiste.piTick();
  },

  async sperren() {
    await Z.web.verstecken(false);
    await Z.sperren();
  },

  async abmelden() {
    if (!await fragen('Vom Pi abmelden?', 'Die Sitzung wird beendet und das gespeicherte Passwort gelöscht. Beim nächsten Anmelden brauchst du Passwort und 2FA-Code, und der Pi muss erreichbar sein.', 'Abmelden', true)) return;
    FM.schliessenAlle();
    await Z.abmelden();
  },

  async beenden() {
    if (!await fragen('Zentrale beenden?', 'Die Oberfläche wird geschlossen. Windows und der Trading-Bot laufen ganz normal weiter.', 'Beenden', true)) return;
    Z.system.beenden();
  },

  ausschaltenMenue(knopf) {
    const r = knopf.getBoundingClientRect();
    FM.ueberlagernAn();
    const m = kontextmenue(r.left - 90, r.top - 190, [
      { titel: 'Der HP bleibt an' },
      { text: 'Bildschirm aus & sperren', kuerzel: '⌘L', tun: () => this.sperren() },
      { text: 'Nur sperren', tun: () => Z.sperren({ bildschirmAus: false }) },
      '-',
      { text: 'Alle Fenster schliessen', tun: () => FM.schliessenAlle() },
      { text: 'Zentrale neu starten', tun: () => Z.system.neustart() },
      '-',
      { text: 'Zentrale beenden …', tun: () => this.beenden() },
    ]);
    const b = new MutationObserver(() => { if (!m.isConnected) { FM.ueberlagernAus(); b.disconnect(); } });
    b.observe($('#ebenen'), { childList: true });
  },

  horchen() {
    Z.auf('sperre:zustand', (d) => {
      if (d.gesperrt) { FM.melden('sperre'); Sperre.zeigen(); }
      else Sperre.verstecken();
    });
    Z.auf('zentrale:zustand', (d) => ZentraleFenster.zustandSetzen(d));
    Z.auf('zentrale:fehler', (d) => ZentraleFenster.fehlerZeigen(d));
    Z.auf('fenster:groesse', () => {
      for (const f of FM.liste) {
        if (f.gezoomt) { f.gezoomt = false; f.zoomen(); }
      }
      ZentraleFenster.anpassen();
    });
    Z.auf('hinweis', (d) => hinweis(d.text, d.art || 'info'));

    FM.aufAenderung(() => ZentraleFenster.anpassen());
    window.addEventListener('resize', entprellen(() => ZentraleFenster.anpassen(), 80));
    window.addEventListener('blur', () => { if (FM.ueberlagert()) return; });
  },

  tasten() {
    document.addEventListener('keydown', (e) => {
      if (!$('#sperre').hidden) return;
      const strg = e.ctrlKey || e.metaKey;
      if (!strg) {
        if (e.key === 'Escape') schliesseMenues();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'l') { e.preventDefault(); this.sperren(); }
      else if (k === 'e') { e.preventDefault(); Apps.finder.oeffnen(); }
      else if (k === ',') { e.preventDefault(); Apps.einstellungen.oeffnen(); }
      else if (k === 'w') { e.preventDefault(); FM.oben && FM.oben.schliessen(); }
      else if (k === 'm') { e.preventDefault(); FM.oben && FM.oben.minimieren(); }
      else if (k === 'r' && FM.oben?.appId === 'zentrale') { e.preventDefault(); Z.web.befehl('neu'); }
    }, true);

    // Rechtsklick auf den Schreibtisch
    $('#tapete').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      kontextmenue(e.clientX, e.clientY, [
        { text: 'Finder öffnen', kuerzel: '⌘E', tun: () => Apps.finder.oeffnen() },
        { text: 'Zentrale öffnen', tun: () => Apps.zentrale.oeffnen() },
        { text: 'Steuerung öffnen', tun: () => Apps.steuerung.oeffnen() },
        '-',
        { text: 'Hintergrund ändern …', tun: () => Apps.einstellungen.oeffnen('aussehen') },
        { text: 'Einstellungen …', kuerzel: '⌘,', tun: () => Apps.einstellungen.oeffnen() },
      ]);
    });
    $('#tapete').addEventListener('mousedown', () => schliesseMenues());
  },
};

window.addEventListener('DOMContentLoaded', () => Schreibtisch.start());
// Fehler nicht stumm schlucken: sonst bleibt ein Fenster einfach leer.
window.addEventListener('error', (e) => {
  console.error('[oberflaeche]', e.message, e.filename, e.lineno);
  try { hinweis(e.message, 'fehler', 'Fehler in der Oberfläche'); } catch {}
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[oberflaeche] offene Zusage', e.reason);
  try { hinweis(String(e.reason?.message || e.reason), 'fehler', 'Fehler in der Oberfläche'); } catch {}
});
