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
// Eigene Apps der Oberfläche plus ein Eintrag je Zentrale-Tab.
const Apps = {
  finder: { name: 'Finder', symbol: 'finder', fensterId: 'finder', farbe: 'linear-gradient(160deg,#38bdf8,#0369a1)', oeffnen: (start) => Finder.oeffnen(start && start.quelle ? start : null) },
  steuerung: { name: 'Steuerung', symbol: 'steuerung', fensterId: 'steuerung', farbe: 'linear-gradient(160deg,#a78bfa,#6d28d9)', oeffnen: () => Steuerung.oeffnen() },
  einstellungen: { name: 'Einstellungen', symbol: 'einstellungen', fensterId: 'einstellungen', farbe: 'linear-gradient(160deg,#9ca3af,#4b5563)', oeffnen: (b) => EinstellungenApp.oeffnen(typeof b === 'string' ? b : null) },
};
for (const t of ZENTRALE_TABS) {
  Apps['zentrale:' + t.id] = {
    name: t.name, symbol: t.symbol, farbe: t.farbe,
    fensterId: 'zentrale:' + t.id,
    zentrale: true,
    oeffnen: () => ZentraleFenster.oeffnen(t.id),
  };
}
// Alte Kennung aus früheren Einstellungen weiterhin verstehen.
Apps.zentrale = Apps['zentrale:Übersicht'];

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
    Schreibtischflaeche.bauen();
    this.horchen();
    this.tasten();

    if (z && z.gesperrt) Sperre.zeigen();
    else this.nachAnmeldung({ ok: true, pi: true, offline: false }, true);
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

  async nachAnmeldung(r = {}, start = false) {
    this.aussehenAnwenden();
    const ohnePi = r.offline || r.pi === false;

    if (ohnePi) hinweis('Der Pi ist gerade nicht erreichbar. Das System und deine Dateien auf diesem Rechner gehen trotzdem.', 'warnung', 'Ohne Pi angemeldet');
    else if (r.piFehler) hinweis(r.piFehler, 'warnung', 'Zentrale nicht angemeldet');
    if (r.gekoppelt === false && r.kopplungFehler) {
      hinweis('Gerät konnte nicht gekoppelt werden: ' + r.kopplungFehler + ' – du musst dich weiter mit Passwort anmelden.', 'warnung');
    }

    if (Einst.daten.verhalten?.zentraleBeimStart !== false && !ohnePi) {
      if (!FM.finden('zentrale:Übersicht')) ZentraleFenster.oeffnen('Übersicht');
    } else if (ohnePi && start) {
      Finder.oeffnen();
    }
    setTimeout(() => ZentraleFenster.anpassen(), 120);
    Menueleiste.piTick();

    // Nach der ersten Anmeldung mit Passwort gleich einen PIN anbieten.
    if (r.pinNoetig) setTimeout(() => this.pinEinrichten(true), 600);
  },

  // Fragt einen neuen PIN ab (zweimal) und speichert ihn.
  async pinEinrichten(ersteMal = false) {
    const text = ersteMal
      ? 'Damit du dich nicht jedes Mal mit Passwort und 2FA-Code anmelden musst: leg einen PIN fest. Mindestens 4 Zeichen. Das Zentrale-Passwort funktioniert weiterhin als Rückfall.'
      : 'Neuen PIN festlegen. Mindestens 4 Zeichen.';
    const a = await dialog({ titel: 'PIN festlegen', text, felder: [{ type: 'password', platzhalter: 'Neuer PIN' }, { type: 'password', platzhalter: 'Nochmal' }], okText: 'Speichern' });
    if (!a) return false;
    const [p1, p2] = a;
    if (p1 !== p2) { hinweis('Die beiden Eingaben stimmen nicht überein.', 'fehler'); return this.pinEinrichten(ersteMal); }
    const r = await Z.pinSetzen(p1);
    if (!r.ok) { hinweis(r.fehler || 'PIN konnte nicht gesetzt werden', 'fehler'); return this.pinEinrichten(ersteMal); }
    hinweis('PIN gespeichert', 'ok');
    return true;
  },

  async sperren() {
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
    kontextmenue(r.left - 90, r.top - 190, [
      { titel: 'Der HP bleibt an' },
      { text: 'Bildschirm aus & sperren', kuerzel: '⌘L', tun: () => this.sperren() },
      { text: 'Nur sperren', tun: () => Z.sperren({ bildschirmAus: false }) },
      '-',
      { text: 'Alle Fenster schliessen', tun: () => FM.schliessenAlle() },
      { text: 'Zentrale neu starten', tun: () => Z.system.neustart() },
      '-',
      { text: 'Zentrale beenden …', tun: () => this.beenden() },
    ]);
  },

  horchen() {
    Z.auf('sperre:zustand', (d) => {
      if (d.gesperrt) { FM.melden('sperre'); Sperre.zeigen(); }
      else Sperre.verstecken();
    });
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
      else if (k === 'r' && FM.oben?.appId?.startsWith('zentrale:')) { e.preventDefault(); ZentraleFenster.neuLaden(FM.oben.appId.slice(9)); }
    }, true);

    // Rechtsklick auf den Schreibtisch
    for (const ziel of [$('#tapete'), $('#flaeche')]) {
      ziel.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.fl-symbol, .fl-widget')) return;
        e.preventDefault();
        Schreibtischflaeche.menue(e.clientX, e.clientY);
      });
      ziel.addEventListener('mousedown', (e) => { if (!e.target.closest('.fl-symbol, .fl-widget')) schliesseMenues(); });
    }
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
