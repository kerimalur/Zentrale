// Fensterverwaltung: öffnen, ziehen, grössern, zoomen, minimieren, Reihenfolge.
const FM = {
  liste: [],
  zIndex: 20,
  oben: null,
  horcher: [],
  sperrenZaehler: 0,   // > 0 = ein Dialog/Menü liegt über allem (eingebettete Zentrale muss weg)

  flaeche() { return $('#fensterflaeche').getBoundingClientRect(); },

  aufAenderung(fn) { this.horcher.push(fn); return () => { this.horcher = this.horcher.filter((f) => f !== fn); }; },
  melden(grund = '') { for (const f of this.horcher) { try { f(grund); } catch (e) { console.error(e); } } },

  finden(id) { return this.liste.find((f) => f.id === id); },

  // Öffnet ein Fenster oder holt ein vorhandenes nach vorne.
  oeffnen(opt) {
    const da = this.finden(opt.id);
    if (da) {
      if (da.minimiert) da.wiederherstellen();
      da.fokus();
      return da;
    }
    const f = new Fenster(opt);
    this.liste.push(f);
    f.fokus();
    this.melden('oeffnen');
    Dock.aktualisieren();
    return f;
  },

  schliessenAlle() { [...this.liste].forEach((f) => f.schliessen()); },

  ueberlagernAn() { this.sperrenZaehler++; this.melden('ueberlagern'); },
  ueberlagernAus() { this.sperrenZaehler = Math.max(0, this.sperrenZaehler - 1); this.melden('ueberlagern'); },
  ueberlagert() { return this.sperrenZaehler > 0; },
};

class Fenster {
  constructor(opt) {
    this.id = opt.id;
    this.appId = opt.appId || opt.id;
    this.titel = opt.titel || 'Fenster';
    this.symbolName = opt.symbol || 'datei';
    this.minBreite = opt.minBreite || 340;
    this.minHoehe = opt.minHoehe || 220;
    this.beimSchliessen = opt.beimSchliessen || null;
    this.beimAendern = opt.beimAendern || null;
    this.aufMenue = opt.menue || null;
    this.minimiert = false;
    this.gezoomt = false;
    this.vorZoom = null;
    this.aktiv = false;

    const fl = FM.flaeche();
    const b = Math.min(opt.breite || 980, fl.width - 40);
    const h = Math.min(opt.hoehe || 640, fl.height - 60);
    const versatz = (FM.liste.length % 6) * 26;
    this.x = opt.x !== undefined ? opt.x : Math.round(fl.left + (fl.width - b) / 2 + versatz - 60);
    this.y = opt.y !== undefined ? opt.y : Math.round(fl.top + Math.max(10, (fl.height - h) / 2 - 20) + versatz);
    this.breite = b;
    this.hoehe = h;

    this.bauen(opt);
    this.geometrieAnwenden();
    if (opt.aufbauen) opt.aufbauen(this.inhalt, this);
  }

  bauen(opt) {
    this.titelEl = el('div', { klasse: 'f-titel', text: this.titel });
    this.werkzeugeEl = el('div', { klasse: 'f-werkzeuge' });
    this.werkzeuge = new Map();
    for (const w of opt.werkzeuge || []) this.werkzeugHinzu(w);

    this.ampel = el('div', { klasse: 'f-ampel' },
      el('button', { klasse: 'zu', title: 'Schliessen', html: symbol('mal'), onclick: () => this.schliessen() }),
      el('button', { klasse: 'min', title: 'Minimieren', html: symbol('minus'), onclick: () => this.minimieren() }),
      el('button', { klasse: 'max', title: 'Zoomen', html: symbol('voll'), onclick: () => this.zoomen() }),
    );

    this.leiste = el('div', { klasse: 'f-leiste' }, this.ampel, this.titelEl, this.werkzeugeEl);
    this.leiste.addEventListener('mousedown', (e) => this.ziehenStart(e));
    this.leiste.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.zoomen(); });

    this.inhalt = el('div', { klasse: 'f-inhalt' });
    this.wurzel = el('div', { klasse: 'fenster', daten: { id: this.id } }, this.leiste, this.inhalt);
    for (const r of ['n', 's', 'w', 'o', 'nw', 'no', 'sw', 'so']) {
      const g = el('div', { klasse: 'f-griff ' + r });
      g.addEventListener('mousedown', (e) => this.groessernStart(e, r));
      this.wurzel.append(g);
    }
    this.wurzel.addEventListener('mousedown', () => this.fokus(), true);
    $('#fensterflaeche').append(this.wurzel);
  }

  werkzeugHinzu(w) {
    const b = el('button', { klasse: 'wz', title: w.titel || '', html: symbol(w.symbol), onclick: (e) => { e.stopPropagation(); w.tun(this); } });
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    if (w.id) this.werkzeuge.set(w.id, b);
    this.werkzeugeEl.append(b);
    return b;
  }
  werkzeugSetzen(id, { aus, titel, symbolName } = {}) {
    const b = this.werkzeuge.get(id);
    if (!b) return;
    if (aus !== undefined) b.disabled = !!aus;
    if (titel !== undefined) b.title = titel;
    if (symbolName !== undefined) b.innerHTML = symbol(symbolName);
  }

  setzeTitel(t) { this.titel = t; this.titelEl.textContent = t; if (this.aktiv) Menueleiste.aktualisieren(); }

  geometrieAnwenden() {
    const s = this.wurzel.style;
    s.left = this.x + 'px'; s.top = this.y + 'px';
    s.width = this.breite + 'px'; s.height = this.hoehe + 'px';
    if (this.beimAendern) this.beimAendern(this);
    FM.melden('geometrie');
  }

  fokus() {
    if (FM.oben === this && this.aktiv) return;
    for (const f of FM.liste) { f.aktiv = false; f.wurzel.classList.remove('aktiv'); }
    this.aktiv = true;
    this.wurzel.classList.add('aktiv');
    this.wurzel.style.zIndex = ++FM.zIndex;
    FM.oben = this;
    Menueleiste.aktualisieren();
    FM.melden('fokus');
  }

  minimieren() {
    this.minimiert = true;
    this.wurzel.classList.add('minimiert');
    this.aktiv = false;
    this.wurzel.classList.remove('aktiv');
    if (FM.oben === this) FM.oben = FM.liste.filter((f) => !f.minimiert).sort((a, b) => b.wurzel.style.zIndex - a.wurzel.style.zIndex)[0] || null;
    if (FM.oben) FM.oben.fokus();
    else { Menueleiste.aktualisieren(); FM.melden('minimieren'); }
    Dock.aktualisieren();
  }

  wiederherstellen() {
    this.minimiert = false;
    this.wurzel.classList.remove('minimiert');
    this.fokus();
    Dock.aktualisieren();
  }

  zoomen() {
    const fl = FM.flaeche();
    if (this.gezoomt) {
      Object.assign(this, this.vorZoom);
      this.gezoomt = false;
      this.wurzel.classList.remove('voll');
    } else {
      this.vorZoom = { x: this.x, y: this.y, breite: this.breite, hoehe: this.hoehe };
      this.x = fl.left; this.y = fl.top;
      this.breite = fl.width; this.hoehe = fl.height - 14;
      this.gezoomt = true;
      this.wurzel.classList.add('voll');
    }
    this.geometrieAnwenden();
  }

  schliessen() {
    if (this.beimSchliessen && this.beimSchliessen(this) === false) return;
    this.wurzel.classList.add('zu');
    FM.liste = FM.liste.filter((f) => f !== this);
    if (FM.oben === this) FM.oben = null;
    setTimeout(() => {
      this.wurzel.remove();
      const naechstes = FM.liste.filter((f) => !f.minimiert).sort((a, b) => b.wurzel.style.zIndex - a.wurzel.style.zIndex)[0];
      if (naechstes) naechstes.fokus(); else { Menueleiste.aktualisieren(); FM.melden('schliessen'); }
      Dock.aktualisieren();
    }, 140);
    FM.melden('schliessen');
    Dock.aktualisieren();
  }

  // ---------- Ziehen ----------
  ziehenStart(e) {
    if (e.button !== 0 || e.target.closest('button') || e.target.closest('input')) return;
    if (this.gezoomt) return;
    e.preventDefault();
    this.fokus();
    const fl = FM.flaeche();
    const startX = e.clientX - this.x;
    const startY = e.clientY - this.y;
    FM.ueberlagernAn();                       // beim Ziehen die eingebettete Seite ausblenden
    const bewegen = (ev) => {
      this.x = Math.max(fl.left - this.breite + 110, Math.min(ev.clientX - startX, fl.right - 110));
      this.y = Math.max(fl.top, Math.min(ev.clientY - startY, fl.bottom - 46));
      this.geometrieAnwenden();
    };
    const fertig = () => {
      document.removeEventListener('mousemove', bewegen);
      document.removeEventListener('mouseup', fertig);
      FM.ueberlagernAus();
    };
    document.addEventListener('mousemove', bewegen);
    document.addEventListener('mouseup', fertig);
  }

  // ---------- Grössern ----------
  groessernStart(e, richtung) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.fokus();
    if (this.gezoomt) { this.gezoomt = false; this.wurzel.classList.remove('voll'); }
    const fl = FM.flaeche();
    const start = { x: e.clientX, y: e.clientY, bx: this.x, by: this.y, bb: this.breite, bh: this.hoehe };
    FM.ueberlagernAn();
    const bewegen = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (richtung.includes('o')) this.breite = Math.max(this.minBreite, start.bb + dx);
      if (richtung.includes('s')) this.hoehe = Math.max(this.minHoehe, start.bh + dy);
      if (richtung.includes('w')) {
        const b = Math.max(this.minBreite, start.bb - dx);
        this.x = start.bx + (start.bb - b);
        this.breite = b;
      }
      if (richtung.includes('n')) {
        const h = Math.max(this.minHoehe, start.bh - dy);
        this.y = Math.max(fl.top, start.by + (start.bh - h));
        this.hoehe = h;
      }
      this.geometrieAnwenden();
    };
    const fertig = () => {
      document.removeEventListener('mousemove', bewegen);
      document.removeEventListener('mouseup', fertig);
      FM.ueberlagernAus();
    };
    document.addEventListener('mousemove', bewegen);
    document.addEventListener('mouseup', fertig);
  }

  // Fläche des Inhalts in Fensterkoordinaten (für die eingebettete Zentrale).
  inhaltFlaeche() {
    const r = this.inhalt.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }
}
