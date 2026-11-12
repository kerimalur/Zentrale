// «Moos»: Taskleiste mit Startmenü, anpassbare Widgets (Form, Stil, Grösse, Bilder),
// Personalisierung mit Akzentfarbe, Geräte-Manager und Task-Manager.
// Alles, was hier eingestellt wird, landet in einstellungen.json und bleibt nach dem Neustart.

Object.assign(SYMBOL, {
  logo: S('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/>'),
  chip: S('<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>'),
  glocke: S('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
});

const TL = () => ({ position: 'unten', ausrichtung: 'mitte', schwebend: true, suche: true, hoehe: 52, uhrDatum: true, ...(Einst.daten.taskleiste || {}) });
const AKZENTE = ['#3fae6b', '#2f7fd6', '#7b5bd6', '#d6466a', '#e5484d', '#e0782d', '#c9a227', '#14a3a3', '#8a93a3'];

// ---------------------------------------------------------------- Startmenü
const Startmenue = {
  appKnopf(id, a, klasse = 'sm-app') {
    const k = el('button', { klasse, title: a.name, onclick: () => { this.schliessen(); a.oeffnen(); } }, Launchpad.symbolEl(a, 'sm-symbol'), el('span', { text: a.name }));
    k.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const dock = Einst.daten.dock || []; const drin = dock.includes(id);
      kontextmenue(e.clientX, e.clientY, [{ titel: a.name }, { text: 'Öffnen', tun: () => { this.schliessen(); a.oeffnen(); } },
        { text: drin ? 'Von der Taskleiste lösen' : 'An die Taskleiste anheften', tun: async () => { await Einst.setzenAsync({ dock: drin ? dock.filter((x) => x !== id) : [...dock, id] }); Dock.bauen(); } },
        { text: 'Auf den Schreibtisch legen', tun: () => Schreibtischflaeche.symbolHinzu(id) }]);
    });
    return k;
  },
  async oeffnen() {
    if ($('#startmenue')) return this.schliessen();
    schliesseMenues(); Kontrollzentrum.schliessen(); await Launchpad.laden();
    const feld = el('input', { placeholder: 'Programme und Einstellungen suchen', 'aria-label': 'Suchen' });
    const koerper = el('div', { stil: { display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '0', overflow: 'hidden' } });
    const alle = () => Launchpad.alle().filter((a) => a.id !== 'launchpad');
    const zeichnen = () => {
      const t = feld.value.trim().toLowerCase(); leeren(koerper);
      if (t) {
        const treffer = alle().filter((a) => a.name.toLowerCase().includes(t)); const bereiche = EinstellungenApp.BEREICHE.filter((b) => b.name.toLowerCase().includes(t));
        koerper.append(el('div', { klasse: 'sm-titel', text: 'Treffer' }), el('div', { klasse: 'sm-alle' }, treffer.map((a) => this.appKnopf(a.id, a, 'sm-zeile')),
          bereiche.map((b) => el('button', { klasse: 'sm-zeile', onclick: () => { this.schliessen(); Apps.einstellungen.oeffnen(b.id); } }, el('span', { klasse: 'sm-symbol', html: symbol(b.symbol), stil: { color: 'var(--text)' } }), el('span', { text: 'Einstellungen › ' + b.name })))));
        if (!treffer.length && !bereiche.length) koerper.append(el('div', { klasse: 'u', text: 'Nichts gefunden.', stil: { padding: '8px 4px', color: 'var(--text-leise)' } }));
        return;
      }
      const angeheftet = ['finder', 'web', 'terminal', 'software', 'einstellungen', 'aktivitaet', 'geraete', 'netzplan', 'steuerung', 'zentrale:Übersicht', 'zentrale:Trading', 'zentrale:Heute'].filter((id) => Apps[id]);
      koerper.append(el('div', { klasse: 'sm-titel', text: 'Angeheftet' }), el('div', { klasse: 'sm-gitter' }, angeheftet.map((id) => this.appKnopf(id, Apps[id]))),
        el('div', { klasse: 'sm-titel', text: 'Zentrale · vorinstalliert' }), el('div', { klasse: 'sm-chips' }, ZENTRALE_TABS.map((x) => el('button', { klasse: 'sm-chip', text: x.name, onclick: () => { this.schliessen(); ZentraleFenster.oeffnen(x.id); } }))),
        el('div', { klasse: 'sm-titel', text: 'Alle Programme' }), el('div', { klasse: 'sm-alle' }, alle().sort((a, b) => a.name.localeCompare(b.name, 'de')).map((a) => this.appKnopf(a.id, a, 'sm-zeile'))));
    };
    feld.addEventListener('input', zeichnen);
    feld.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.schliessen(); if (e.key === 'Enter') { const k = koerper.querySelector('.sm-zeile, .sm-app'); k && k.click(); } });
    const z = Schreibtisch.zustand; const name = Einst.daten.anmeldung?.benutzerName || z.benutzer || 'Benutzer';
    const aus = el('button', { klasse: 'tl-knopf', title: 'Sperren, neu starten, ausschalten', html: symbol('strom') }); aus.addEventListener('click', () => { const r = aus.getBoundingClientRect(); this.schliessen(); Schreibtisch.ausschaltenMenue({ getBoundingClientRect: () => r }); });
    const m = el('div', { id: 'startmenue', klasse: 'startmenue' }, el('label', { klasse: 'sm-suche' }, el('span', { html: symbol('suche') }).firstElementChild, feld), koerper,
      el('div', { klasse: 'sm-fuss' }, el('span', { klasse: 'sm-ich', text: name.slice(0, 1).toUpperCase() }), el('span', { text: name, stil: { flex: '1', fontSize: '12.5px', fontWeight: '600' } }),
        el('button', { klasse: 'tl-knopf', title: 'Einstellungen', html: symbol('einstellungen'), onclick: () => { this.schliessen(); Apps.einstellungen.oeffnen(); } }),
        el('button', { klasse: 'tl-knopf', title: 'Sperren', html: symbol('schloss'), onclick: () => { this.schliessen(); Z.sperren({ bildschirmAus: false }); } }), aus));
    $('#ebenen').append(m); zeichnen();
    requestAnimationFrame(() => { m.classList.add('da'); feld.focus(); });
    this.zu = (e) => { if (!m.contains(e.target) && !e.target.closest('.tl-start, .menue')) this.schliessen(); };
    setTimeout(() => document.addEventListener('mousedown', this.zu, true), 0);
  },
  schliessen() { const m = $('#startmenue'); if (!m) return; document.removeEventListener('mousedown', this.zu, true); m.classList.remove('da'); setTimeout(() => m.remove(), 160); },
};
Launchpad.oeffnen = () => Startmenue.oeffnen();
Launchpad.schliessen = () => Startmenue.schliessen();
Apps.launchpad.name = 'Start';

// ---------------------------------------------------------------- Taskleiste
Dock.bauen = function () {
  const t = TL(); const d = leeren($('#dock')); d.className = 'dock tl';
  const w = document.documentElement.style;
  w.setProperty('--tl-h', (Number(t.hoehe) || 52) + 'px'); w.setProperty('--tl-rand', t.schwebend ? '10px' : '0px'); w.setProperty('--tl-radius', t.schwebend ? '16px' : '0px');
  w.setProperty('--dock-h', (Number(t.hoehe) || 52) + (t.schwebend ? 22 : 8) + 'px');
  document.body.classList.toggle('tl-oben', t.position === 'oben'); document.body.classList.toggle('tl-links', t.ausrichtung === 'links');

  const pi = el('button', { klasse: 'tl-knopf tl-pi', title: 'Zustand des Pi', onclick: (e) => Menueleiste.piMenue ? Menueleiste.piMenue(e.currentTarget) : Apps['zentrale:System'].oeffnen() }, el('i'), el('span', { text: 'Pi' }));
  this.piPunkt = pi.firstElementChild;
  const links = el('div', { klasse: 'tl-links' }, pi);

  const start = el('button', { klasse: 'tl-knopf tl-start', title: 'Start', 'aria-label': 'Startmenü', onclick: () => Startmenue.oeffnen() }, el('i', { html: symbol('logo') }));
  const mitte = el('div', { klasse: 'tl-mitte' }, start);
  if (t.suche) mitte.append(el('button', { klasse: 'tl-knopf tl-suche', title: 'Suchen (Super + Leertaste)', onclick: () => Spotlight.oeffnen() }, el('span', { html: symbol('suche') }).firstElementChild, el('span', { text: 'Suchen' })));
  for (const id of (Einst.daten.dock || []).filter((x) => x !== 'launchpad')) {
    const app = Apps[id]; if (!app) continue;
    const e = el('button', { klasse: 'dock-eintrag', daten: { app: id }, 'aria-label': app.name }, el('span', { klasse: 'dock-name', text: app.name }), Launchpad.symbolEl(app, 'dock-symbol'));
    e.addEventListener('click', () => { const f = FM.finden(app.fensterId || id); if (f && FM.oben === f && !f.minimiert) f.minimieren(); else app.oeffnen(); });
    e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); const f = FM.finden(app.fensterId || id);
      kontextmenue(ev.clientX, ev.clientY - 120, [{ titel: app.name }, { text: 'Öffnen', tun: () => app.oeffnen() }, { text: 'Fenster schliessen', aus: !f, tun: () => f && f.schliessen() }, '-',
        { text: 'Von der Taskleiste lösen', tun: async () => { await Einst.setzenAsync({ dock: Einst.daten.dock.filter((x) => x !== id) }); Dock.bauen(); } }, { text: 'Taskleiste anpassen …', tun: () => Apps.einstellungen.oeffnen('taskleiste') }]); });
    mitte.append(e);
  }
  mitte.append(el('span', { klasse: 'dock-trenner' }));

  const kz = el('button', { klasse: 'tl-knopf', title: 'Kontrollzentrum: WLAN, Ton, Helligkeit' }, ...['wlan', 'ton', 'akku'].map((s) => el('span', { html: symbol(s) }).firstElementChild)); kz.classList.add('tl-kz'); kz.setAttribute('data-kz', '1');
  kz.addEventListener('click', () => { Startmenue.schliessen(); Kontrollzentrum.oeffnen(kz); });
  const mt = el('button', { klasse: 'tl-knopf', title: 'Mitteilungen', html: symbol('glocke') }); mt.addEventListener('click', () => Mitteilungen.oeffnen(mt));
  this.uhrEl = el('button', { klasse: 'tl-knopf tl-uhr', title: 'Datum und Uhrzeit', onclick: () => Apps.einstellungen.oeffnen('datum') }, el('b'), el('small'));
  const rechts = el('div', { klasse: 'tl-rechts' });
  if (Schreibtisch.zustand.demo) rechts.append(el('button', { klasse: 'mb-demo', title: 'Demo-Modus: Testdaten statt Pi', text: 'DEMO', onclick: () => Apps.einstellungen.oeffnen('verbindung') }));
  rechts.append(kz, mt, this.uhrEl);
  d.append(links, mitte, rechts);
  d.oncontextmenu = (ev) => { if (ev.target.closest('.dock-eintrag')) return; ev.preventDefault(); kontextmenue(ev.clientX, ev.clientY - 90, [{ text: 'Taskleiste anpassen …', tun: () => Apps.einstellungen.oeffnen('taskleiste') }, { text: 'Task-Manager', tun: () => Aktivitaet.oeffnen() }]); };
  this.tick(); this.aktualisieren(); this.fremdeZeichnen();
};
Dock.tick = function () {
  if (!this.uhrEl || !this.uhrEl.isConnected) return; const j = new Date();
  this.uhrEl.children[0].textContent = uhr(j); this.uhrEl.children[1].textContent = TL().uhrDatum ? `${zweiStellig(j.getDate())}.${zweiStellig(j.getMonth() + 1)}.${j.getFullYear()}` : '';
  if (this.piPunkt && Menueleiste.punktEl) this.piPunkt.className = Menueleiste.punktEl.classList.contains('an') ? 'an' : Menueleiste.punktEl.classList.contains('weg') ? 'weg' : '';
};
setInterval(() => Dock.tick(), 5000);
{ const alt = Dock.aktualisieren;
  Dock.aktualisieren = function () { alt.call(this); for (const e of $$('#dock .dock-eintrag[data-app]')) { const app = Apps[e.dataset.app]; const f = FM.finden(app?.fensterId || e.dataset.app); e.classList.toggle('vorn', !!f && FM.oben === f && !f.minimiert); } };
  FM.aufAenderung(() => Dock.aktualisieren()); document.addEventListener('mousedown', () => setTimeout(() => Dock.aktualisieren(), 30), true); }
// Das Kontrollzentrum wurde bisher über den Knopf der Menüleiste gefunden.
{ const alt = Kontrollzentrum.neu; Kontrollzentrum.neu = function (k) { alt.call(this, (k && k.isConnected) ? k : $('#dock [data-kz]')); }; }

// ---------------------------------------------------------------- Erscheinungsbild
{ const alt = Schreibtisch.aussehenAnwenden;
  Schreibtisch.aussehenAnwenden = function () {
    alt.call(this); const a = Einst.daten.aussehen || {};
    document.body.classList.toggle('knoepfe-rechts', a.knoepfe !== 'links');
    document.body.classList.toggle('tapete-akzent', (a.verlauf || 'akzent') === 'akzent' && a.hintergrundArt !== 'bild');
  }; }

// ---------------------------------------------------------------- Widgets: Bild, Form, Stil, Grösse ziehen
WIDGETS.bild = { name: 'Bild', symbol: 'bild', breit: 2, hoch: 2, quelle: 'keine',
  zeichnen(k, _d, w) {
    if (!w.pfad) return k.append(el('div', { klasse: 'w-bild-leer' }, el('span', { text: 'Rechtsklick → «Bild wählen»' })));
    const b = el('img', { klasse: 'w-bild', alt: '' }); k.append(b); Z.lokal.url(w.pfad).then((r) => { if (r.ok) b.src = r.url; });
  } };
{ const alt = Schreibtischflaeche.zeichnen;
  const FORMEN = [['weich', 'Abgerundet'], ['eckig', 'Eckig'], ['rund', 'Stark gerundet'], ['kreis', 'Kreis']]; const STILE = [['glas', 'Glas'], ['fest', 'Deckend'], ['akzent', 'Akzentfarbe'], ['ohne', 'Ohne Hintergrund']];
  Schreibtischflaeche.zeichnen = function () {
    alt.call(this); const r = this.raster;
    for (const w of this.e.widgets || []) {
      const k = this.wurzel.querySelector(`[data-widget="${w.id}"]`); const def = WIDGETS[w.typ]; if (!k || !def) continue;
      k.classList.add('form-' + (w.form || 'weich'), 'stil-' + (w.stil || 'glas'), 'typ-' + w.typ);
      const breit = w.breit || def.breit; const hoch = w.hoch || def.hoch;
      // Eigenes Menü (vor dem alten): Grösse, Form, Stil, Bild
      k.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopImmediatePropagation();
        kontextmenue(ev.clientX, ev.clientY, [{ titel: def.name }, def.tun ? { text: 'Öffnen', tun: () => def.tun() } : null,
          w.typ === 'bild' ? { text: 'Bild wählen …', tun: async () => { const b = await Z.einstellungen.bildWaehlen(); if (b.ok) { await this.widgetSetzen(w.id, { pfad: b.pfad }); this.zeichnen(); } } } : null, '-',
          { titel: 'Form' }, ...FORMEN.map(([id, n]) => ({ text: ((w.form || 'weich') === id ? '✓ ' : '') + n, tun: async () => { await this.widgetSetzen(w.id, { form: id }); this.zeichnen(); } })),
          { titel: 'Stil' }, ...STILE.map(([id, n]) => ({ text: ((w.stil || 'glas') === id ? '✓ ' : '') + n, tun: async () => { await this.widgetSetzen(w.id, { stil: id }); this.zeichnen(); } })), '-',
          { text: 'Grösse: an der Ecke unten rechts ziehen', aus: true }, { text: 'Widget entfernen', tun: () => this.widgetWeg(w.id) }].filter(Boolean));
      }, true);
      // Grösse mit der Maus ziehen (rastet auf dem Raster ein)
      const griff = el('div', { klasse: 'w-griff', title: 'Grösse ändern' }); k.append(griff);
      griff.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); ev.stopPropagation(); const s = { x: ev.clientX, y: ev.clientY, b: k.offsetWidth, h: k.offsetHeight }; FM.ueberlagernAn();
        const bew = (e2) => { k.style.width = Math.max(r - 10, s.b + e2.clientX - s.x) + 'px'; k.style.height = Math.max(r - 10, s.h + e2.clientY - s.y) + 'px'; };
        const los = () => { document.removeEventListener('mousemove', bew); document.removeEventListener('mouseup', los); FM.ueberlagernAus();
          const nb = Math.max(1, Math.min(10, Math.round((k.offsetWidth + 10) / r))); const nh = Math.max(1, Math.min(7, Math.round((k.offsetHeight + 10) / r)));
          if (nb !== breit || nh !== hoch) this.widgetSetzen(w.id, { breit: nb, hoch: nh }); else this.zeichnen(); };
        document.addEventListener('mousemove', bew); document.addEventListener('mouseup', los);
      });
    }
  };
  const altSetzen = Schreibtischflaeche.widgetSetzen;   // gibt die Zusage zurück, damit danach neu gezeichnet werden kann
  Schreibtischflaeche.widgetSetzen = function (id, teil) { const liste = (this.e.widgets || []).map((w) => (w.id === id ? { ...w, ...teil } : w)); return this.speichern({ widgets: liste }).then(() => { if (teil.breit || teil.hoch || teil.x !== undefined) this.zeichnen(); }); };
}

// ---------------------------------------------------------------- Einstellungen: Personalisierung, Taskleiste
{ const b = EinstellungenApp.BEREICHE; const i = b.findIndex((x) => x.id === 'aussehen'); b[i].name = 'Personalisierung'; b.splice(i + 1, 0, { id: 'taskleiste', name: 'Taskleiste & Start', symbol: 'raster' });
  b.find((x) => x.id === 'dock').name = 'Schreibtisch & Widgets';
  const altAussehen = EinstellungenApp.aussehen;
  EinstellungenApp.aussehen = function (inhalt) {
    const a = Einst.daten.aussehen; const s = (teil) => { Einst.setzen({ aussehen: teil }); Schreibtisch.aussehenAnwenden(); };
    this.kopf(inhalt, 'Personalisierung', 'Alles wirkt sofort und bleibt gespeichert.');
    const eigene = el('input', { type: 'color', value: a.akzent || '#3fae6b', title: 'Eigene Farbe', stil: { width: '30px', height: '28px', border: '0', background: 'none', padding: '0' } });
    const felder = el('div', { stil: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } });
    const malen = () => { leeren(felder).append(...AKZENTE.map((f) => el('button', { klasse: 'farbfeld' + ((Einst.daten.aussehen.akzent || '').toLowerCase() === f ? ' gewaehlt' : ''), title: f, 'aria-label': 'Akzentfarbe ' + f, stil: { background: f }, onclick: () => { s({ akzent: f }); eigene.value = f; malen(); } })), eigene); };
    eigene.addEventListener('input', () => { s({ akzent: eigene.value }); malen(); }); malen();
    inhalt.append(this.block('Farbe', this.karte(
      this.reihe('Akzentfarbe', 'Färbt Glas, Hintergrund, Markierungen, Schalter und das Leuchten der Taskleiste.', felder),
      this.reihe('Dunkles Design', null, this.schalter(!a.hell, (x) => { s({ hell: !x }); })),
      this.reihe('Hintergrund', 'Aus der Akzentfarbe erzeugt, ein fester Verlauf oder ein eigenes Bild.', this.auswahl(a.hintergrundArt === 'bild' ? 'bild' : (a.verlauf || 'akzent'), [['akzent', 'Aus Akzentfarbe'], ['blau', 'Blau'], ['abend', 'Abend'], ['wald', 'Wald'], ['graphit', 'Graphit'], ['bild', 'Eigenes Bild …']], async (v) => {
        if (v === 'bild') { const bild = await Z.einstellungen.bildWaehlen(); if (!bild.ok) return this.zeichnen(); return s({ hintergrundArt: 'bild', hintergrund: bild.pfad }); } s({ hintergrundArt: 'verlauf', verlauf: v }); })))));
    inhalt.append(this.block('Fenster und Glas', this.karte(
      this.reihe('Fensterknöpfe', 'Schliessen, Minimieren, Maximieren.', this.auswahl(a.knoepfe || 'rechts', [['rechts', 'Rechts'], ['links', 'Links (farbige Punkte)']], (v) => s({ knoepfe: v }))),
      this.reihe('Glas-Effekt', '0 = aus, spart Rechenleistung.', this.regler(a.glas ?? 26, 0, 40, (v) => s({ glas: v }))),
      this.reihe('Eckenradius', null, this.regler(a.radius ?? 11, 0, 22, (v) => s({ radius: v }))),
      this.reihe('Schriftgrösse', null, this.regler(a.schrift ?? 13, 11, 17, (v) => s({ schrift: v }))),
      this.reihe('Animationen', null, this.auswahl(String(a.tempo ?? 1), [['0', 'aus'], ['0.6', 'schnell'], ['1', 'normal'], ['1.6', 'ruhig']], (v) => s({ tempo: Number(v) }))),
      this.reihe('Menüleiste oben', 'Zusätzlich zur Taskleiste, mit den Menüs des Programms.', this.schalter(a.menueleiste === true, (x) => s({ menueleiste: x }))))));
    inhalt.append(this.block('Mehr', this.karte(this.reihe('Taskleiste und Startmenü', null, el('button', { klasse: 'knopf', onclick: () => { this.bereich = 'taskleiste'; this.zeichnen(); } }, 'Öffnen')),
      this.reihe('Widgets und Symbole', 'Rechtsklick auf ein Widget: Form, Stil, Bild. Ecke ziehen: Grösse.', el('button', { klasse: 'knopf', onclick: () => { this.bereich = 'dock'; this.zeichnen(); } }, 'Öffnen')),
      this.reihe('Profil sichern', 'Alle Einstellungen als eine Datei exportieren oder importieren.', el('button', { klasse: 'knopf', onclick: () => { this.bereich = 'verhalten'; this.zeichnen(); } }, 'Öffnen')))));
    void altAussehen;
  };
  EinstellungenApp.taskleiste = function (inhalt) {
    const t = TL(); const s = async (teil) => { await Einst.setzenAsync({ taskleiste: { ...TL(), ...teil } }); Dock.bauen(); };
    this.kopf(inhalt, 'Taskleiste & Start', 'Rechtsklick auf ein Symbol in der Taskleiste oder im Startmenü heftet an oder löst.');
    inhalt.append(this.block('Aussehen', this.karte(
      this.reihe('Position', null, this.auswahl(t.position, [['unten', 'Unten'], ['oben', 'Oben']], (v) => s({ position: v }))),
      this.reihe('Symbole', null, this.auswahl(t.ausrichtung, [['mitte', 'In der Mitte'], ['links', 'Links']], (v) => s({ ausrichtung: v }))),
      this.reihe('Schwebend', 'Mit Abstand zum Rand und runden Ecken – oder über die ganze Breite.', this.schalter(t.schwebend, (x) => s({ schwebend: x }))),
      this.reihe('Höhe', null, this.regler(t.hoehe, 44, 68, (v) => s({ hoehe: v }))),
      this.reihe('Suchfeld', null, this.schalter(t.suche, (x) => s({ suche: x }))),
      this.reihe('Datum unter der Uhr', null, this.schalter(t.uhrDatum, (x) => s({ uhrDatum: x }))))));
    const liste = el('div', { klasse: 'ein-karte' });
    const malen = () => { const dock = Einst.daten.dock || []; leeren(liste).append(...dock.map((id, n) => this.reihe(Apps[id]?.name || id, null, el('div', { stil: { display: 'flex', gap: '6px' } },
      el('button', { klasse: 'knopf mini', disabled: n === 0, onclick: async () => { const d = [...dock]; [d[n - 1], d[n]] = [d[n], d[n - 1]]; await Einst.setzenAsync({ dock: d }); Dock.bauen(); malen(); } }, '←'),
      el('button', { klasse: 'knopf mini', disabled: n === dock.length - 1, onclick: async () => { const d = [...dock]; [d[n + 1], d[n]] = [d[n], d[n + 1]]; await Einst.setzenAsync({ dock: d }); Dock.bauen(); malen(); } }, '→'),
      el('button', { klasse: 'knopf mini gefahr', onclick: async () => { await Einst.setzenAsync({ dock: dock.filter((x) => x !== id) }); Dock.bauen(); malen(); } }, 'Lösen')))),
      this.reihe('Programm anheften', null, this.auswahl('', [['', 'auswählen …'], ...Launchpad.alle().filter((a) => !dock.includes(a.id) && a.id !== 'launchpad').map((a) => [a.id, a.name])], async (id) => { if (!id) return; await Einst.setzenAsync({ dock: [...dock, id] }); Dock.bauen(); malen(); }))); };
    malen(); inhalt.append(this.block('Angeheftete Programme', liste));
  };
}

// ---------------------------------------------------------------- Task-Manager (erweitert die Aktivitätsanzeige)
Object.assign(Aktivitaet, {
  reiter: 'prozesse', verlauf: { cpu: [], ram: [], netz: [] },
  oeffnen() {
    FM.oeffnen({ id: 'aktivitaet', appId: 'aktivitaet', titel: 'Task-Manager', symbol: 'aktivitaet', breite: 780, hoehe: 580, minBreite: 500, minHoehe: 340,
      aufbauen: (inhalt) => {
        this.kopf = el('div', { klasse: 'sy-kacheln' }); this.liste = el('div', { klasse: 'sy-tabelle' }); this.leisteEl = el('div', { klasse: 'sy-reiter' });
        inhalt.append(el('div', { klasse: 'sy-seite' }, this.leisteEl, this.kopf, this.liste)); this.reiterZeichnen();
        this.holen(); this.timer = setInterval(() => this.holen(), 2000);
      },
      beimSchliessen: () => { clearInterval(this.timer); return true; } });
  },
  reiterZeichnen() { leeren(this.leisteEl).append(...[['prozesse', 'Prozesse'], ['leistung', 'Leistung'], ['dienste', 'Dienste']].map(([id, n]) => el('button', { klasse: this.reiter === id ? 'an' : '', text: n, onclick: () => { this.reiter = id; this.reiterZeichnen(); leeren(this.liste); this.holen(); } }))); },
  kurve(werte, max, farbe) { const v = werte.slice(-60); const m = Math.max(max || 1, ...v, 1); const p = v.map((x, i) => `${(i / 59) * 100},${30 - (x / m) * 28}`).join(' ');
    const s = el('div'); s.innerHTML = `<svg class="sy-kurve" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${farbe}" stroke-width="1.6" vector-effect="non-scaling-stroke" points="${p}"/></svg>`; return s.firstElementChild; },
  async holen() {
    const r = await Z.sys.prozesse(); if (!r.ok || !this.kopf.isConnected) return;
    const V = this.verlauf; V.cpu.push(r.cpu); V.ram.push(prozent(r.ram - r.ramFrei, r.ram)); V.netz.push(r.netz.down); for (const k of Object.keys(V)) if (V[k].length > 60) V[k].shift();
    leeren(this.kopf).append(
      el('div', { klasse: 'sy-kachel' }, el('b', { text: r.cpu + ' %' }), el('span', { text: `CPU · ${r.kerne} Kerne · Last ${r.last[0].toFixed(2)}` }), this.kurve(V.cpu, 100, 'var(--akzent)')),
      el('div', { klasse: 'sy-kachel' }, el('b', { text: groesse(r.ram - r.ramFrei) }), el('span', { text: 'Arbeitsspeicher von ' + groesse(r.ram) }), this.kurve(V.ram, 100, 'var(--gruen)')),
      el('div', { klasse: 'sy-kachel' }, el('b', { text: groesse(r.netz.down) + '/s' }), el('span', { text: 'Netz · hoch ' + groesse(r.netz.up) + '/s' }), this.kurve(V.netz, 1024, 'var(--orange)')));
    if (this.reiter === 'leistung') { const i = await Z.sys.info(); if (this.reiter !== 'leistung') return;
      return leeren(this.liste).append(...[['Prozessor', i.cpu], ['Kerne', i.kerne], ['Arbeitsspeicher', `${groesse(i.ram - i.ramFrei)} von ${groesse(i.ram)} belegt`], ['System', `${groesse(i.wurzel.benutzt)} von ${groesse(i.wurzel.gross)} belegt`], ['Läuft seit', Math.floor(i.laufzeitS / 3600) + ' h ' + Math.floor((i.laufzeitS % 3600) / 60) + ' min'], ['Kernel', i.kernel]].map(([t, w]) => el('div', { klasse: 'sy-zeile', stil: { gridTemplateColumns: '180px 1fr' } }, el('span', { text: t }), el('span', { text: String(w) })))); }
    if (this.reiter === 'dienste') { if (this.liste.dataset.geladen === 'dienste') return; const d = await Z.sys.dienste(); if (this.reiter !== 'dienste') return; this.liste.dataset.geladen = 'dienste';
      return leeren(this.liste).append(el('div', { klasse: 'sy-zeile kopf', stil: { gridTemplateColumns: '240px 1fr' } }, el('span', { text: `Laufende Dienste (${d.liste.length})` }), el('span', { text: 'Beschreibung' })), ...d.liste.map((x) => el('div', { klasse: 'sy-zeile', stil: { gridTemplateColumns: '240px 1fr' } }, el('span', { text: x.name }), el('span', { text: x.text })))); }
    this.liste.dataset.geladen = '';
    const zeilen = [...r.liste].sort((a, b) => (this.sort === 'name' ? a.name.localeCompare(b.name) : b[this.sort] - a[this.sort])).slice(0, 80);
    const kopf = el('div', { klasse: 'sy-zeile kopf' }, ...[['name', 'Prozess'], ['pid', 'PID'], ['benutzer', 'Benutzer'], ['cpu', 'CPU %'], ['rss', 'Speicher'], ['', '']].map(([k, t]) => el('span', { text: t, onclick: () => { if (k && k !== 'benutzer') { this.sort = k; this.holen(); } } })));
    leeren(this.liste).append(kopf, ...zeilen.map((p) => el('div', { klasse: 'sy-zeile' }, el('span', { text: p.name }), el('span', { text: p.pid }), el('span', { text: p.benutzer }), el('span', { text: p.cpu.toFixed(1) }), el('span', { text: groesse(p.rss) }),
      el('button', { klasse: 'knopf mini', onclick: async () => { if (!await fragen(`«${p.name}» beenden?`, `Prozess ${p.pid} wird beendet. Nicht gespeicherte Daten gehen verloren.`, 'Beenden', true)) return; const b = await Z.sys.beenden(p.pid, false); b.ok ? hinweis('Prozess beendet', 'ok') : hinweis(b.fehler, 'fehler'); this.holen(); } }, 'Beenden'))));
  },
});
Apps.aktivitaet.name = 'Task-Manager';

// ---------------------------------------------------------------- Geräte-Manager
const Geraete = {
  zu: new Set(),
  oeffnen() {
    FM.oeffnen({ id: 'geraete', appId: 'geraete', titel: 'Geräte-Manager', symbol: 'chip', breite: 620, hoehe: 560, minBreite: 420, minHoehe: 300,
      werkzeuge: [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.laden() }],
      aufbauen: (inhalt) => { this.el = el('div', { stil: { height: '100%', overflow: 'auto', padding: '10px 0' } }); inhalt.append(this.el); this.laden(); } });
  },
  async laden() {
    leeren(this.el).append(el('div', { klasse: 'web-platz leer', stil: { position: 'static', padding: '40px' } }, 'Geräte werden eingelesen …'));
    const r = await Z.sys.geraete(); if (!this.el.isConnected) return; leeren(this.el);
    for (const g of r.gruppen) {
      const offen = !this.zu.has(g.name);
      this.el.append(el('div', { klasse: 'gm-gruppe' }, el('button', { klasse: 'gm-kopf', onclick: () => { offen ? this.zu.add(g.name) : this.zu.delete(g.name); this.laden(); } }, el('span', { text: offen ? '▾' : '▸', stil: { width: '14px', color: 'var(--text-sehr-leise)' } }), el('span', { text: g.name }), el('small', { text: String(g.liste.length) })),
        offen ? g.liste.map((x) => el('div', { klasse: 'gm-geraet' }, el('span', { text: x.name }), el('small', { text: x.info || '' }))) : null));
    }
    if (!r.werkzeuge.lspci) this.el.append(el('p', { klasse: 'unter', stil: { padding: '10px 20px' }, text: 'Hinweis: lspci fehlt – PCI-Geräte werden nicht aufgelistet.' }));
  },
};
Apps.geraete = { name: 'Geräte-Manager', symbol: 'chip', fensterId: 'geraete', farbe: 'linear-gradient(160deg,#64748b,#334155)', oeffnen: () => Geraete.oeffnen() };
Spotlight.BEFEHLE = ((alt) => () => [...alt(), { name: 'Geräte-Manager', unter: 'System', tun: () => Geraete.oeffnen() }, { name: 'Task-Manager', unter: 'System', tun: () => Aktivitaet.oeffnen() }, { name: 'Personalisierung', unter: 'Einstellungen', tun: () => Apps.einstellungen.oeffnen('aussehen') }])(Spotlight.BEFEHLE);

// ---------------------------------------------------------------- Frei platzieren
// Ohne «Am Raster einrasten» bleiben Symbole und Widgets genau dort, wo man sie loslässt,
// und Widgets lassen sich stufenlos in der Grösse ziehen. Gespeichert wird in Rastereinheiten
// mit Nachkommastellen, damit alte Einstellungen weiter gelten.
Schreibtischflaeche.frei = function () { return this.e.einrasten === false; };
Schreibtischflaeche.ziehbar = function (knoten, fertig) {
  knoten.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('button:not(.fl-symbol), textarea, input, a, .w-griff')) return;
    ev.preventDefault(); const r = this.raster;
    const start = { x: ev.clientX, y: ev.clientY, l: parseFloat(knoten.style.left), t: parseFloat(knoten.style.top) }; let bewegt = false;
    const grenze = this.wurzel.getBoundingClientRect();
    const bewegen = (e2) => {
      const dx = e2.clientX - start.x; const dy = e2.clientY - start.y;
      if (!bewegt && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!bewegt) { bewegt = true; knoten.classList.add('zieht'); FM.ueberlagernAn(); }
      knoten.style.left = Math.max(0, Math.min(grenze.width - 40, start.l + dx)) + 'px'; knoten.style.top = Math.max(0, Math.min(grenze.height - 40, start.t + dy)) + 'px';
    };
    const los = (e3) => {
      document.removeEventListener('mousemove', bewegen); document.removeEventListener('mouseup', los);
      if (!bewegt) return; knoten.classList.remove('zieht'); FM.ueberlagernAus();
      const l = parseFloat(knoten.style.left); const t = parseFloat(knoten.style.top); const raster = !this.frei() || e3.shiftKey;   // Umschalt beim Loslassen rastet trotzdem ein
      const gx = raster ? Math.max(0, Math.round(l / r)) : Math.round((l / r) * 1000) / 1000; const gy = raster ? Math.max(0, Math.round(t / r)) : Math.round((t / r) * 1000) / 1000;
      knoten.style.left = gx * r + 'px'; knoten.style.top = gy * r + 'px'; fertig(gx, gy);
    };
    document.addEventListener('mousemove', bewegen); document.addEventListener('mouseup', los);
  });
};
{ // Grösse stufenlos: den Griff neu verdrahten, wenn frei platziert wird
  const alt = Schreibtischflaeche.zeichnen;
  Schreibtischflaeche.zeichnen = function () {
    alt.call(this); if (!this.frei()) return; const r = this.raster;
    for (const w of this.e.widgets || []) {
      const k = this.wurzel.querySelector(`[data-widget="${w.id}"]`); const alterGriff = k && k.querySelector('.w-griff'); if (!alterGriff) continue;
      const griff = alterGriff.cloneNode(true); alterGriff.replaceWith(griff);
      griff.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); ev.stopPropagation(); const s = { x: ev.clientX, y: ev.clientY, b: k.offsetWidth, h: k.offsetHeight }; FM.ueberlagernAn();
        const bew = (e2) => { k.style.width = Math.max(70, s.b + e2.clientX - s.x) + 'px'; k.style.height = Math.max(50, s.h + e2.clientY - s.y) + 'px'; };
        const los = () => { document.removeEventListener('mousemove', bew); document.removeEventListener('mouseup', los); FM.ueberlagernAus();
          this.widgetSetzen(w.id, { breit: Math.round(((k.offsetWidth + 10) / r) * 1000) / 1000, hoch: Math.round(((k.offsetHeight + 10) / r) * 1000) / 1000 }); };
        document.addEventListener('mousemove', bew); document.addEventListener('mouseup', los);
      });
    }
  };
}

// ---------------------------------------------------------------- Netzplan: wie geht mein Verkehr ins Internet?
Object.assign(SYMBOL, { netzplan: S('<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.3 11l9.4-4M7.3 13l9.4 4"/>') });
const Netzplan = {
  vorschau: { exit: false, dns: true },
  oeffnen() {
    FM.oeffnen({ id: 'netzplan', appId: 'netzplan', titel: 'Netzplan', symbol: 'netzplan', breite: 900, hoehe: 640, minBreite: 620, minHoehe: 420,
      werkzeuge: [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.laden() }],
      aufbauen: (inhalt) => { this.el = el('div', { klasse: 'np' }); inhalt.append(this.el); this.laden(); this.timer = setInterval(() => { if (!this.beschaeftigt) this.laden(true); }, 15000); },
      beimSchliessen: () => { clearInterval(this.timer); return true; } });
  },
  knoten(titel, unter, art = '', marke = '') { return el('div', { klasse: 'np-knoten ' + art }, marke ? el('small', { klasse: 'np-marke', text: marke }) : null, el('b', { text: titel }), el('span', { text: unter || '' })); },
  pfeil(text, an = true) { return el('div', { klasse: 'np-pfeil' + (an ? '' : ' aus') }, el('i'), el('small', { text: text || '' })); },
  async laden(still = false) {
    if (!still) leeren(this.el).append(el('div', { klasse: 'web-platz leer', stil: { position: 'static', padding: '40px' } }, 'Netz wird eingelesen …'));
    const [weg, ts] = await Promise.all([Z.sys.netzweg(), Z.sys.tailscale()]); const z = Zustand.daten || {};
    if (!this.el.isConnected) return; const E = EinstellungenApp;
    const echt = ts.ok && ts.angemeldet; const exitGeraete = echt ? ts.geraete.filter((g) => g.exitMoeglich) : [{ name: 'pi-proton', ip: 'vorschau', exitAktiv: this.vorschau.exit }];
    const exit = exitGeraete.find((g) => g.exitAktiv); const dnsAn = echt ? !!weg.tailscale?.dnsAn : this.vorschau.dns;
    const pihole = (z.netz && z.netz.pihole) || null; const piName = (z.netz && z.netz.tailscale && z.netz.tailscale.dns) || 'Pi';
    const dnsServer = echt ? (weg.dns.join(', ') || 'unbekannt') : (dnsAn ? '100.x (Pi-hole)' : (weg.dns.join(', ') || 'Router'));
    const ich = Schreibtisch.zustand.rechner || 'Dieser Rechner';
    leeren(this.el);
    if (!echt) this.el.append(el('div', { klasse: 'np-hinweis', text: (ts.ok ? 'Tailscale ist auf diesem Rechner nicht angemeldet' : 'Tailscale ist nicht installiert') + ' – die Schalter unten zeigen eine Vorschau, wie der Weg aussähe. Anmelden: Einstellungen → Tailscale.' }));

    // 1) Der Weg einer Seite, am Beispiel YouTube
    this.el.append(el('h3', { text: 'Weg ins Internet – Beispiel youtube.com' }), el('div', { klasse: 'np-reihe' },
      this.knoten(ich, [weg.adresse, weg.schnittstelle].filter(Boolean).join(' · ') || 'kein Netz', 'ich'), this.pfeil(weg.schnittstelle && /^wl/.test(weg.schnittstelle) ? 'WLAN' : 'Kabel'),
      this.knoten('Router / Switch', weg.router || 'unbekannt', '', 'Heimnetz'),
      ...(exit ? [this.pfeil('verschlüsselt (Tailscale)'), this.knoten(exit.name, 'Exit-Node', 'akzent', echt ? '' : 'Vorschau'), this.pfeil('VPN')] : [this.pfeil('direkt')]),
      this.knoten('youtube.com', exit ? 'sieht die Adresse des Exit-Node' : 'sieht deine Heim-Adresse', exit ? 'gut' : 'warn')));

    // 2) Namensauflösung und Werbung
    this.el.append(el('h3', { text: 'DNS und Werbung' }), el('div', { klasse: 'np-reihe' },
      this.knoten('Frage: youtube.com?', 'jede Seite beginnt mit einer DNS-Anfrage', 'ich'), this.pfeil(dnsAn ? 'über Tailscale' : 'im Heimnetz'),
      this.knoten(dnsAn ? 'Pi-hole auf dem Pi' : 'DNS des Routers', dnsServer, dnsAn ? 'akzent' : '', echt ? '' : 'Vorschau'), this.pfeil(dnsAn ? 'gefiltert' : 'ungefiltert', true),
      this.knoten(dnsAn ? 'Werbung wird geblockt' : 'Werbung kommt durch', dnsAn && pihole && pihole.prozent != null ? `${pihole.prozent} % der Anfragen geblockt` : dnsAn ? 'Werbe- und Tracking-Adressen laufen ins Leere' : 'kein Filter aktiv', dnsAn ? 'gut' : 'warn')),
      el('p', { klasse: 'np-klein', text: 'Hinweis: Werbung innerhalb von YouTube-Videos kommt von denselben Servern wie die Videos und lässt sich per DNS nicht blocken – Pi-hole blockt Werbenetze und Tracker auf anderen Seiten und in Apps.' }));

    // 3) Schalter
    const exitWahl = E.auswahl(exit ? exit.ip : '', [['', 'aus – direkt ins Internet'], ...exitGeraete.map((g) => [g.ip, 'über ' + g.name])], async (ip) => {
      if (!echt) { this.vorschau.exit = !!ip; return this.laden(true); }
      this.beschaeftigt = true; const r = await Z.sys.tailscaleExit(ip); this.beschaeftigt = false; r.ok ? hinweis(ip ? 'Exit-Node eingeschaltet' : 'Exit-Node ausgeschaltet', 'ok') : hinweis((r.fehler || 'Hat nicht geklappt') + ' – einmal unter Einstellungen → Tailscale «Link erzeugen» ausführen.', 'fehler'); this.laden(true); });
    this.el.append(el('h3', { text: 'Schalten' }), E.karte(
      E.reihe('Exit-Node', 'Leitet den ganzen Internet-Verkehr dieses Rechners über ein anderes Gerät in deinem Tailscale-Netz.', exitWahl),
      E.reihe('DNS über Tailscale (Pi-hole)', 'Aus: der Rechner fragt den Router und sieht Werbung ungefiltert.', E.schalter(dnsAn, async (an) => { if (!echt) { this.vorschau.dns = an; return this.laden(true); } this.beschaeftigt = true; const r = await Z.sys.tailscaleDns(an); this.beschaeftigt = false; r.ok || hinweis(r.fehler, 'fehler'); this.laden(true); })),
      E.reihe('Firewall', 'Eingehende Verbindungen aus dem Heimnetz werden verworfen, Tailscale bleibt offen.', el('button', { klasse: 'knopf', onclick: () => Apps.einstellungen.oeffnen('firewall') }, 'Öffnen'))));

    // 4) Geräte
    const tsGeraete = echt ? ts.geraete : []; const heim = (z.netz && z.netz.geraete) || [];
    const zeile = (name, unter, online, marke) => el('div', { klasse: 'np-geraet' }, el('i', { klasse: online ? 'an' : '' }), el('b', { text: name }), el('span', { text: unter }), marke ? el('small', { text: marke }) : null);
    this.el.append(el('h3', { text: 'Geräte' }), el('div', { klasse: 'np-geraete' },
      el('div', {}, el('h4', { text: `Tailscale-Netz${echt ? ` (${tsGeraete.length})` : ''}` }), tsGeraete.length ? tsGeraete.map((g) => zeile(g.name, [g.ip, g.os].filter(Boolean).join(' · '), g.online, g.exitAktiv ? 'Exit-Node aktiv' : g.exitMoeglich ? 'kann Exit-Node' : '')) : el('p', { klasse: 'np-klein', text: 'Erst nach der Anmeldung bei Tailscale sichtbar.' })),
      el('div', {}, el('h4', { text: `Vom Pi gesehen${heim.length ? ` (${heim.length})` : ''}` + (Schreibtisch.zustand.demo ? ' · Demo' : '') }), heim.length ? heim.map((g) => zeile(g.name, [g.ip, g.os].filter(Boolean).join(' · '), g.online, g.dns != null ? g.dns + ' DNS-Anfragen' : '')) : el('p', { klasse: 'np-klein', text: 'Der Pi meldet gerade keine Geräte.' }))),
      el('p', { klasse: 'np-klein', text: 'Welches Gerät an welchem Anschluss des Switch hängt, lässt sich nicht auslesen (ein einfacher Switch gibt das nicht preis). Gezeigt wird, was der Rechner und der Pi selbst sehen.' }));
  },
};
Apps.netzplan = { name: 'Netzplan', symbol: 'netzplan', fensterId: 'netzplan', farbe: 'linear-gradient(160deg,#14b8a6,#0f766e)', oeffnen: () => { Zustand.abonnieren(() => {}); Netzplan.oeffnen(); } };
Spotlight.BEFEHLE = ((alt) => () => [...alt(), { name: 'Netzplan', unter: 'Netz', tun: () => Apps.netzplan.oeffnen() }])(Spotlight.BEFEHLE);

// ---------------------------------------------------------------- Fenster: aus dem Vollbild ziehen, einrasten, Layout-Auswahl
const Einrasten = {
  nutz() { const fl = FM.flaeche(); const dh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0; const oben = document.body.classList.contains('tl-oben');
    return { left: fl.left, top: fl.top + (oben ? dh : 0), width: fl.width, height: fl.height - dh }; },
  ZONEN: { voll: [0, 0, 1, 1], links: [0, 0, 0.5, 1], rechts: [0.5, 0, 0.5, 1], ol: [0, 0, 0.5, 0.5], or: [0.5, 0, 0.5, 0.5], ul: [0, 0.5, 0.5, 0.5], ur: [0.5, 0.5, 0.5, 0.5],
    d1: [0, 0, 1 / 3, 1], d2: [1 / 3, 0, 1 / 3, 1], d3: [2 / 3, 0, 1 / 3, 1], z1: [0, 0, 2 / 3, 1], z2: [2 / 3, 0, 1 / 3, 1] },
  rechteck(zone) { const n = this.nutz(); const [x, y, b, h] = this.ZONEN[zone]; const voll = zone === 'voll'; const g = voll ? 0 : 5;
    return { x: Math.round(n.left + x * n.width + g), y: Math.round(n.top + y * n.height + g), breite: Math.round(b * n.width - 2 * g), hoehe: Math.round(h * n.height - (voll ? 0 : 2 * g)) }; },
  setzen(f, zone) {
    if (!f.gezoomt && !f.eingerastet) f.vorZoom = { x: f.x, y: f.y, breite: f.breite, hoehe: f.hoehe };
    Object.assign(f, this.rechteck(zone)); f.eingerastet = zone; f.gezoomt = zone === 'voll'; f.wurzel.classList.toggle('voll', zone === 'voll'); f.geometrieAnwenden();
  },
  loesen(f) { if (f.vorZoom) Object.assign(f, f.vorZoom); f.eingerastet = null; f.gezoomt = false; f.wurzel.classList.remove('voll'); f.geometrieAnwenden(); },
  zoneBei(x, y) { const n = this.nutz(); const r = 14; const li = x < n.left + r; const re = x > n.left + n.width - r; const ob = y < n.top + r; const eckeO = y < n.top + n.height * 0.22; const eckeU = y > n.top + n.height * 0.78;
    if (li) return eckeO ? 'ol' : eckeU ? 'ul' : 'links'; if (re) return eckeO ? 'or' : eckeU ? 'ur' : 'rechts'; if (ob) return 'voll'; return null; },
  vorschau(zone) { let v = $('#einrast-vorschau'); if (!zone) { if (v) v.remove(); return; } if (!v) { v = el('div', { id: 'einrast-vorschau', klasse: 'einrast-vorschau' }); $('#fensterflaeche').append(v); }
    const r = this.rechteck(zone); const fl = FM.flaeche(); Object.assign(v.style, { left: r.x - fl.left + 'px', top: r.y - fl.top + 'px', width: r.breite + 'px', height: r.hoehe + 'px' }); },
  // Kleine Auswahl beim Zeigen auf den Maximieren-Knopf: Hälften, Drittel, zwei Drittel, Viertel
  auswahl(f, knopf) {
    this.auswahlZu(); const b = knopf.getBoundingClientRect();
    const gruppe = (zonen) => el('div', { klasse: 'el-gruppe' }, zonen.map((z) => { const [x, y, w, h] = this.ZONEN[z]; return el('button', { klasse: 'el-feld', 'aria-label': 'Einrasten', stil: { left: x * 100 + '%', top: y * 100 + '%', width: `calc(${w * 100}% - 3px)`, height: `calc(${h * 100}% - 3px)` }, onclick: () => { this.auswahlZu(); f.fokus(); this.setzen(f, z); } }); }));
    const m = el('div', { id: 'einrast-auswahl', klasse: 'einrast-auswahl' }, gruppe(['links', 'rechts']), gruppe(['d1', 'd2', 'd3']), gruppe(['z1', 'z2']), gruppe(['ol', 'or', 'ul', 'ur']));
    $('#ebenen').append(m); m.style.left = Math.max(8, Math.min(window.innerWidth - 310, b.left + b.width / 2 - 150)) + 'px'; m.style.top = b.bottom + 6 + 'px';
    m.addEventListener('mouseleave', () => this.auswahlZu());
  },
  auswahlZu() { const m = $('#einrast-auswahl'); if (m) m.remove(); clearTimeout(this.t); },
};
Fenster.prototype.zoomen = function () { if (this.gezoomt || this.eingerastet) Einrasten.loesen(this); else Einrasten.setzen(this, 'voll'); };
Fenster.prototype.ziehenStart = function (e) {
  if (e.button !== 0 || e.target.closest('button') || e.target.closest('input')) return;
  e.preventDefault(); this.fokus(); Einrasten.auswahlZu();
  const n = Einrasten.nutz(); const anfang = { x: e.clientX, y: e.clientY }; let startX = e.clientX - this.x; let startY = e.clientY - this.y; let zieht = false; let zone = null;
  const bewegen = (ev) => {
    if (!zieht) {
      if (Math.abs(ev.clientX - anfang.x) + Math.abs(ev.clientY - anfang.y) < 6) return;
      zieht = true; FM.ueberlagernAn();
      if (this.gezoomt || this.eingerastet) {            // aus Vollbild oder Hälfte herausziehen: alte Grösse, der Zeiger bleibt an derselben Stelle der Titelleiste
        const anteil = (anfang.x - this.x) / this.breite; Einrasten.loesen(this);
        this.x = Math.round(ev.clientX - this.breite * anteil); this.y = Math.max(n.top, ev.clientY - 18); startX = ev.clientX - this.x; startY = ev.clientY - this.y;
      }
    }
    this.x = Math.max(n.left - this.breite + 110, Math.min(ev.clientX - startX, n.left + n.width - 110));
    this.y = Math.max(n.top, Math.min(ev.clientY - startY, n.top + n.height - 46));
    this.geometrieAnwenden();
    const neu = Einrasten.zoneBei(ev.clientX, ev.clientY); if (neu !== zone) { zone = neu; Einrasten.vorschau(zone); }
  };
  const fertig = () => {
    document.removeEventListener('mousemove', bewegen); document.removeEventListener('mouseup', fertig);
    if (!zieht) return; FM.ueberlagernAus(); Einrasten.vorschau(null);
    if (zone) { this.x = Math.max(n.left, Math.min(this.x, n.left + n.width - this.breite)); Einrasten.setzen(this, zone); }
  };
  document.addEventListener('mousemove', bewegen); document.addEventListener('mouseup', fertig);
};
document.addEventListener('mouseover', (e) => {
  const knopf = e.target.closest && e.target.closest('.f-ampel .max'); if (!knopf) return;
  const f = FM.liste.find((x) => x.wurzel.contains(knopf)); if (!f) return;
  clearTimeout(Einrasten.t); Einrasten.t = setTimeout(() => { if (knopf.matches(':hover')) Einrasten.auswahl(f, knopf); }, 450);
});
document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.f-ampel .max') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#einrast-auswahl'))) setTimeout(() => { const m = $('#einrast-auswahl'); if (m && !m.matches(':hover')) Einrasten.auswahlZu(); }, 250); });
// Ändert sich der Bildschirm oder die Taskleiste, eingerastete Fenster neu einpassen.
window.addEventListener('resize', entprellen(() => { for (const f of FM.liste) if (f.eingerastet) Object.assign(f, Einrasten.rechteck(f.eingerastet)), f.geometrieAnwenden(); }, 120));

// ---------------------------------------------------------------- Ein Klick öffnet: Symbole und Widgets auf dem Schreibtisch
{ const altZiehbar = Schreibtischflaeche.ziehbar;
  Schreibtischflaeche.ziehbar = function (knoten, fertig) {
    let unten = null;
    knoten.addEventListener('mousedown', (ev) => { unten = ev.button === 0 && !ev.target.closest('button:not(.fl-symbol), textarea, input, a, .w-griff') ? { x: ev.clientX, y: ev.clientY } : null; });
    knoten.addEventListener('mouseup', (ev) => { if (unten && Math.abs(ev.clientX - unten.x) + Math.abs(ev.clientY - unten.y) < 4) knoten.dispatchEvent(new CustomEvent('zos-klick')); unten = null; });
    altZiehbar.call(this, knoten, fertig);
  };
  const alt = Schreibtischflaeche.zeichnen;
  Schreibtischflaeche.zeichnen = function () {
    alt.call(this);
    for (const s of this.e.symbole || []) { const k = this.wurzel.querySelector(`[data-symbol="${CSS.escape(s.app)}"]`); const app = Apps[s.app]; if (k && app) k.addEventListener('zos-klick', () => app.oeffnen()); }
    for (const w of this.e.widgets || []) { const k = this.wurzel.querySelector(`[data-widget="${w.id}"]`); const def = WIDGETS[w.typ]; if (k && def && def.tun) { k.addEventListener('zos-klick', () => def.tun()); k.style.cursor = 'pointer'; } }
  };
}
// Widgets ohne eigenes Ziel bekommen eines: Uhr → Datum & Uhrzeit, Bild → Bild wählen.
if (WIDGETS.uhr && !WIDGETS.uhr.tun) WIDGETS.uhr.tun = () => Apps.einstellungen.oeffnen('datum');

// ---------------------------------------------------------------- Super-Taste öffnet das Startmenü; Kabelverbindung anzeigen
window.addEventListener('DOMContentLoaded', () => Z.auf('befehl', (b) => { if (b === 'start') Startmenue.oeffnen(); }));
{ const alt = EinstellungenApp.wlan;
  EinstellungenApp.wlan = async function (i) {
    await alt.call(this, i); if (this.bereich !== 'wlan') return;
    const r = await Z.sys.wlan(); const kabel = (r.geraete || []).filter((g) => g.typ === 'ethernet'); if (!kabel.length || this.bereich !== 'wlan') return;
    const block = this.block('Kabel (LAN)', el('div', { klasse: 'ein-karte' }, kabel.map((g) => this.reihe(g.name, g.zustand === 'connected' ? 'Verbunden' + (g.verbindung ? ' · ' + g.verbindung : '') : 'Nicht verbunden (' + g.zustand + ')', this.wert(g.zustand === 'connected' ? '✓ verbunden' : '–')))));
    const kopf = i.querySelector('.unter') || i.firstElementChild; kopf.after(block);
  };
  const b = EinstellungenApp.BEREICHE.find((x) => x.id === 'wlan'); if (b) b.name = 'WLAN & Kabel';
}
