// Ebene über allen Programmen.
//
// Die Oberfläche liegt unter fremden Programmen (Brave, Obsidian …). Damit Startmenü, Suche, Alt+Tab, Übersicht,
// Zwischenablage, Kontrollzentrum und Mitteilungen trotzdem obenauf erscheinen, öffnet sie ein zweites,
// durchsichtiges Fenster («Ebene», index.html?ebene=1). Darin läuft dieselbe Oberfläche, zeigt aber nur das Gewünschte.
// Programme der Oberfläche öffnet weiterhin das Hauptfenster.
const IST_EBENE = new URLSearchParams(location.search).get('ebene') === '1';
const fremdeOffen = () => !IST_EBENE && !!Z.ebene && Array.isArray(Dock.fremde) && Dock.fremde.length > 0;
const knopfDaten = (k) => { if (!k || !k.getBoundingClientRect) return null; const r = k.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
const falscherKnopf = (r) => ({ getBoundingClientRect: () => r, contains: () => false });
const eigeneFenster = () => FM.liste.map((f) => ({ id: f.id, titel: f.titel || f.id, appId: f.appId, desk: f.desk, minimiert: !!f.minimiert }));

if (!IST_EBENE) {
  // ---------- Hauptfenster: liegen fremde Programme offen, das Gewünschte in der Ebene zeigen ----------
  const ueberEbene = (obj, name, art, daten = () => null) => {
    const alt = obj[name];
    obj[name] = async function (...a) {
      if (fremdeOffen() && !$('#ebenen').childElementCount) { const r = await Z.ebene.zeigen(art, daten(...a)).catch(() => ({ ok: false })); if (r && r.ok) return; }
      return alt.apply(this, a);
    };
  };
  ueberEbene(Startmenue, 'oeffnen', 'start');
  ueberEbene(Spotlight, 'oeffnen', 'spotlight');
  ueberEbene(Ablage, 'oeffnen', 'zwischenablage');
  ueberEbene(Kontrollzentrum, 'oeffnen', 'kontrollzentrum', (k) => ({ rect: knopfDaten(k) }));
  ueberEbene(Mitteilungen, 'oeffnen', 'mitteilungen', (k) => ({ rect: knopfDaten(k), liste: Mitteilungen.liste }));
  ueberEbene(Wechsler, 'uebersicht', 'uebersicht', () => ({ eigene: eigeneFenster(), aktuell: Arbeit.aktuell, anzahl: Arbeit.anzahl }));
  {
    const alt = Wechsler.schritt;
    Wechsler.schritt = async function (d) {
      if (!this.liste && fremdeOffen()) { const r = await Z.ebene.zeigen('wechsler', { d, eigene: eigeneFenster(), verlauf: this.verlauf, aktuell: Arbeit.aktuell, fremdAktiv: !document.hasFocus() }).catch(() => ({ ok: false })); if (r && r.ok) return; }
      return alt.call(this, d);
    };
  }

  // Ein Programm der Oberfläche nach vorn holen: fremde Programme gehen dafür in die Taskleiste
  // (die Oberfläche kann nicht über ihnen liegen).
  const fremdeWeg = () => { if (fremdeOffen()) Z.sys.alleMinimieren && Z.sys.alleMinimieren(); };
  { const alt = FM.oeffnen; FM.oeffnen = function (opt) { const f = alt.call(this, opt); if (f && document.hasFocus()) fremdeWeg(); return f; }; }

  window.addEventListener('DOMContentLoaded', () => Z.auf('ebene', async ({ art, daten }) => {
    if (art !== 'app' || !daten) return;
    const { id, arg } = daten;
    if (id === '__einst') { const r = await Z.einstellungen.alle(); if (r && r.ok) Einst.daten = r.einstellungen; Dock.bauen(); Schreibtischflaeche.zeichnen && Schreibtischflaeche.zeichnen(); return; }
    if (id === '__desk') { Arbeit.gehe(Number(arg) || 0); return; }
    if (id === '__fenster') {
      const f = FM.finden(String(arg)); if (!f) return;
      if (f.desk !== undefined && f.desk !== Arbeit.aktuell) await Arbeit.gehe(f.desk);
      f.minimiert ? f.wiederherstellen() : f.fokus(); Z.sys.alleMinimieren(); Z.sys.fensterFokus('zentraleos-shell'); return;
    }
    if (id === '__zentrale') { ZentraleFenster.oeffnen(arg); Z.sys.alleMinimieren(); return; }
    const a = Apps[id]; if (!a) return;
    a.oeffnen(arg === null ? undefined : arg); Z.sys.alleMinimieren(); Z.sys.fensterFokus('zentraleos-shell');
  }));
} else {
  // ---------- In der Ebene ----------
  document.documentElement.classList.add('ebene');
  const insHaupt = (id, arg = null) => Z.ebene.app(id, arg);

  Schreibtisch.start = async function () {
    document.body.classList.add('ebene');
    const z = await Z.zustand(); this.zustand = z || {}; Einst.daten = (z && z.einstellungen) || {};
    this.aussehenAnwenden(); Menueleiste.bauen = () => {}; Dock.bauen = () => {};
    await Launchpad.laden();
    // Programme der Oberfläche öffnet das Hauptfenster; fremde Programme und der Browser starten direkt von hier.
    for (const [id, a] of Object.entries(Apps)) {
      if (!a || typeof a.oeffnen !== 'function' || id.startsWith('prog:') || id === 'web') continue;
      a.oeffnen = (arg) => insHaupt(id, typeof arg === 'string' || typeof arg === 'number' ? arg : null);
    }
    EinstellungenApp.oeffnen = (b) => insHaupt('einstellungen', b || null);
    ZentraleFenster.oeffnen = (tab) => insHaupt('__zentrale', tab);
    Arbeit.gehe = (n) => insHaupt('__desk', n);
    // Änderungen an Taskleiste oder Schreibtisch auch im Hauptfenster zeigen
    const altSetzen = Einst.setzenAsync.bind(Einst); Einst.setzenAsync = async (t) => { const r = await altSetzen(t); insHaupt('__einst'); return r; };
    const altS = Einst.setzen.bind(Einst); Einst.setzen = (t) => { const r = altS(t); setTimeout(() => insHaupt('__einst'), 300); return r; };
    FM.oeffnen = (opt) => { if (opt && opt.id) insHaupt('__fenster', opt.id); return null; };
  };
  Sperre.zeigen = () => {}; // gesperrt wird nur das Hauptfenster; die Ebene ist dann versteckt

  // Wechsler und Übersicht: die Fenster der Oberfläche kommen als Liste aus dem Hauptfenster
  Wechsler.extern = []; Wechsler.externDesk = 0;
  Wechsler.sammeln = async function (alle = false) {
    const eigene = this.extern.filter((f) => alle || f.desk === undefined || f.desk === this.externDesk)
      .sort((a, b) => { const ia = this.verlauf.indexOf(a.id); const ib = this.verlauf.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); })
      .map((f) => ({ art: 'eigen', f, titel: f.titel, app: Apps[f.appId] || null, desk: f.desk }));
    const r = await Z.sys.fremdeFenster().catch(() => ({ liste: [] }));
    const fremde = (r.liste || []).map((x) => ({ art: 'fremd', x, titel: x.titel || x.app, app: null, name: x.app }));
    // Ist gerade ein fremdes Programm vorn, steht es zuerst – der erste Druck auf Tab springt dann zum nächsten.
    return this.fremdAktiv ? [...fremde, ...eigene] : [...eigene, ...fremde];
  };
  Wechsler.gehe = function (e) { if (e.art === 'eigen') insHaupt('__fenster', e.f.id); else Z.sys.fensterFokus(e.x.app, e.x.titel); };

  // Ist die Ebene leer, verschwindet sie wieder.
  let leerTimer = null;
  const pruefeLeer = () => { clearTimeout(leerTimer); leerTimer = setTimeout(() => { if (!$('#ebenen').childElementCount) Z.ebene.fertig(); }, 60); };

  window.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(pruefeLeer).observe($('#ebenen'), { childList: true });
    Z.auf('ebene', async ({ art, daten }) => {
      const d = daten || {};
      if (art === 'blur') { schliesseMenues(); Startmenue.schliessen(); Spotlight.schliessen(); Ablage.zu(); Wechsler.uebersichtZu(); Kontrollzentrum.schliessen && Kontrollzentrum.schliessen(); const m = $('#mitteilungen'); if (m) m.remove(); if (Wechsler.liste) Wechsler.fertig(); setTimeout(pruefeLeer, 200); return; }
      if (d.eigene) { Wechsler.fremdAktiv = !!d.fremdAktiv; Wechsler.extern = d.eigene; Wechsler.externDesk = d.aktuell || 0; if (d.verlauf) Wechsler.verlauf = d.verlauf; Arbeit.aktuell = d.aktuell || 0; if (d.anzahl) Arbeit.anzahl = d.anzahl; }
      if (art === 'start') Startmenue.oeffnen();
      else if (art === 'spotlight') Spotlight.oeffnen();
      else if (art === 'zwischenablage') Ablage.oeffnen();
      else if (art === 'uebersicht') Wechsler.uebersicht();
      else if (art === 'wechsler') Wechsler.schritt(d.d || 1);
      else if (art === 'kontrollzentrum') Kontrollzentrum.oeffnen(falscherKnopf(d.rect || { left: innerWidth - 400, top: innerHeight - 80, right: innerWidth - 20, bottom: innerHeight - 20, width: 380, height: 60 }));
      else if (art === 'mitteilungen') { Mitteilungen.liste = d.liste || []; Mitteilungen.oeffnen(falscherKnopf(d.rect || { left: innerWidth - 200, top: innerHeight - 80, right: innerWidth - 20, bottom: innerHeight - 20, width: 180, height: 60 })); }
      setTimeout(pruefeLeer, 400);
    });
  });
}
