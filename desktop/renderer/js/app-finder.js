// Finder: Dateien auf dem Pi und auf dem HP in einem Fenster.
// Links die Orte, rechts der Inhalt. Umbenennen, verschieben, kopieren, löschen,
// teilen (Pi) und öffnen. Kopieren zwischen Pi und HP geht über Kopieren/Einfügen.

const Zwischenablage = { art: null, eintraege: [] }; // art: 'kopieren' | 'ausschneiden'

class FinderFenster {
  constructor(start) {
    this.quelle = start?.quelle || 'lokal';
    this.wurzel = start?.wurzel || '';
    this.pfad = start?.pfad || '';
    this.eintraege = [];
    this.auswahl = new Set();
    this.letzteAuswahl = null;
    this.verlauf = [];
    this.index = -1;
    this.orte = { lokal: [], laufwerke: [], pi: [] };
    this.filter = '';
    this.laedt = false;

    this.fenster = FM.oeffnen({
      id: 'finder',
      appId: 'finder',
      titel: 'Finder',
      symbol: 'finder',
      breite: 1060, hoehe: 660, minBreite: 620, minHoehe: 380,
      werkzeuge: [
        { id: 'zurueck', symbol: 'zurueck', titel: 'Zurück', tun: () => this.zurueck() },
        { id: 'vor', symbol: 'vor', titel: 'Vorwärts', tun: () => this.vor() },
        { id: 'hoch', symbol: 'hoch', titel: 'Übergeordneter Ordner', tun: () => this.hoch() },
        { id: 'neu', symbol: 'neu', titel: 'Aktualisieren', tun: () => this.laden() },
      ],
      menue: () => this.menues(),
      aufbauen: (inhalt) => this.aufbauen(inhalt),
      beimSchliessen: () => { Finder.offen = null; return true; },
    });
  }

  // ---------------------------------------------------------- Aufbau
  aufbauen(inhalt) {
    this.seite = el('div', { klasse: 'f-seite' });
    this.pfadEl = el('div', { klasse: 'f-pfad' });
    this.filterEl = el('input', { klasse: 'feld klein', type: 'search', placeholder: 'Filtern', stil: { width: '150px', height: '25px' } });
    this.filterEl.addEventListener('input', entprellen(() => { this.filter = this.filterEl.value.trim().toLowerCase(); this.zeichnen(); }, 160));

    this.ansichtKnopf = el('button', { klasse: 'knopf klein', title: 'Ansicht wechseln', html: symbol('gitter') });
    this.ansichtKnopf.addEventListener('click', () => this.ansichtWechseln());

    const werk = el('div', { klasse: 'f-werk' },
      this.pfadEl,
      el('button', { klasse: 'knopf klein', title: 'Neuer Ordner', html: symbol('plus'), onclick: () => this.neuerOrdner() }),
      this.ansichtKnopf,
      this.filterEl,
    );

    this.listeEl = el('div', { klasse: 'f-liste', tabindex: '0' });
    this.listeEl.addEventListener('mousedown', (e) => { if (e.target === this.listeEl || e.target.classList.contains('f-gitter')) this.auswahlLeeren(); });
    this.listeEl.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.f-zeile, .f-kachel')) return;
      e.preventDefault();
      this.hintergrundMenue(e.clientX, e.clientY);
    });
    this.listeEl.addEventListener('keydown', (e) => this.taste(e));

    this.fussEl = el('div', { klasse: 'f-fuss' });

    const haupt = el('div', { klasse: 'f-haupt' }, werk, this.listeEl, this.fussEl);
    inhalt.append(el('div', { klasse: 'finder' }, this.seite, haupt));

    if (!this.pfad && this.quelle === 'lokal') {
      Z.lokal.orte().then((r) => {
        this.orte.lokal = r.ok ? r.orte : [];
        this.orte.laufwerke = r.ok ? r.laufwerke : [];
        const erst = this.orte.lokal[0] || this.orte.laufwerke[0];
        this.gehe('lokal', '', erst ? (erst.pfad || erst.mount) : '/', true);
        this.orteLaden();
      });
    } else {
      this.gehe(this.quelle, this.wurzel, this.pfad, true);
      this.orteLaden();
    }
  }

  menues() {
    const e = this.ersterGewaehlter();
    return {
      Datei: [
        { text: 'Neuer Ordner', kuerzel: '⇧⌘N', tun: () => this.neuerOrdner() },
        { text: 'Neue Textdatei', tun: () => this.neueDatei() },
        '-',
        { text: 'Öffnen', aus: !e, tun: () => e && this.oeffnen(e) },
        { text: 'Umbenennen …', aus: !e, tun: () => e && this.umbenennen(e) },
        { text: 'Teilen (Link) …', aus: !e || this.quelle !== 'pi' || e.typ !== 'datei', tun: () => e && this.teilen(e) },
        '-',
        { text: 'In den Papierkorb', aus: !this.auswahl.size, tun: () => this.loeschen() },
      ],
      Bearbeiten: [
        { text: 'Kopieren', kuerzel: '⌘C', aus: !this.auswahl.size, tun: () => this.merken('kopieren') },
        { text: 'Ausschneiden', kuerzel: '⌘X', aus: !this.auswahl.size, tun: () => this.merken('ausschneiden') },
        { text: `Einfügen${Zwischenablage.eintraege.length ? ` (${Zwischenablage.eintraege.length})` : ''}`, kuerzel: '⌘V', aus: !Zwischenablage.eintraege.length, tun: () => this.einfuegen() },
        '-',
        { text: 'Alles auswählen', kuerzel: '⌘A', tun: () => this.allesWaehlen() },
      ],
      Ansicht: [
        { text: 'Als Liste', tun: () => this.ansichtSetzen('liste') },
        { text: 'Als Symbole', tun: () => this.ansichtSetzen('symbole') },
        '-',
        { text: (Einst.daten.finder.versteckteZeigen ? '✓ ' : '') + 'Versteckte Dateien zeigen', tun: () => this.versteckteUmschalten() },
        '-',
        { text: 'Aktualisieren', kuerzel: '⌘R', tun: () => this.laden() },
      ],
      Gehe: [
        { titel: 'HP' },
        ...this.orte.lokal.slice(0, 7).map((o) => ({ text: o.name, tun: () => this.gehe('lokal', '', o.pfad) })),
        '-',
        { titel: 'Pi' },
        ...this.orte.pi.map((l) => ({ text: l.name || l.mount, tun: () => this.gehe('pi', l.mount, '/') })),
      ],
    };
  }

  // ---------------------------------------------------------- Orte
  // Die beiden Quellen getrennt laden: Der Pi kann langsam sein, die HP-Orte
  // sollen trotzdem sofort in der Seitenleiste stehen.
  orteLaden() {
    Z.lokal.orte().then((l) => {
      this.orte.lokal = l.ok ? l.orte : [];
      this.orte.laufwerke = l.ok ? l.laufwerke : [];
      this.seiteZeichnen();
    });
    this.piLaedt = true;
    this.seiteZeichnen();
    return Z.pi.laufwerke().then((p) => {
      this.piLaedt = false;
      this.orte.pi = p.ok ? (p.laufwerke || []) : [];
      this.piFehler = p.ok ? null : p.fehler;
      this.seiteZeichnen();
    });
  }

  seiteZeichnen() {
    const s = leeren(this.seite);
    const ort = (name, symbolName, aktiv, tun, klein) =>
      el('button', { klasse: 'f-ort' + (aktiv ? ' aktiv' : ''), onclick: tun },
        el('span', { html: symbol(symbolName) }).firstElementChild,
        el('span', { klasse: 'name', text: name }),
        klein ? el('span', { klasse: 'klein', text: klein }) : null);

    if (this.orte.lokal.length) {
      const g = el('div', { klasse: 'f-gruppe' }, el('div', { klasse: 'f-gruppe-titel', text: 'Favoriten' }));
      for (const o of this.orte.lokal) {
        g.append(ort(o.name, o.symbol || 'ordner', this.quelle === 'lokal' && this.pfad === o.pfad, () => this.gehe('lokal', '', o.pfad)));
      }
      s.append(g);
    }
    if (this.orte.laufwerke.length) {
      const g = el('div', { klasse: 'f-gruppe' }, el('div', { klasse: 'f-gruppe-titel', text: 'HP' }));
      for (const l of this.orte.laufwerke) {
        g.append(ort(l.name, 'festplatte', this.quelle === 'lokal' && this.pfad === l.mount, () => this.gehe('lokal', '', l.mount)));
      }
      s.append(g);
    }
    const gp = el('div', { klasse: 'f-gruppe' }, el('div', { klasse: 'f-gruppe-titel', text: 'Pi · Zentrale' }));
    if (this.orte.pi.length) {
      for (const l of this.orte.pi) {
        gp.append(ort(l.name || l.mount, 'pi', this.quelle === 'pi' && this.wurzel === l.mount,
          () => this.gehe('pi', l.mount, '/'), l.frei ? groesse(l.frei) + ' frei' : null));
      }
    } else {
      gp.append(el('div', { stil: { padding: '4px 8px', fontSize: '12px', color: 'var(--text-sehr-leise)' } },
        this.piLaedt ? 'wird geladen …' : (this.piFehler || 'Keine Laufwerke')));
      if (!this.piLaedt) {
        gp.append(el('button', { klasse: 'f-ort', onclick: () => this.orteLaden() },
          el('span', { html: symbol('neu') }).firstElementChild, el('span', { klasse: 'name', text: 'Nochmal versuchen' })));
      }
    }
    s.append(gp);
  }

  // ---------------------------------------------------------- Navigation
  gehe(quelle, wurzel, pfad, ersetzen = false) {
    const eintrag = { quelle, wurzel, pfad };
    if (!ersetzen) {
      this.verlauf = this.verlauf.slice(0, this.index + 1);
      this.verlauf.push(eintrag);
      this.index = this.verlauf.length - 1;
    } else if (this.index < 0) {
      this.verlauf = [eintrag];
      this.index = 0;
    } else {
      this.verlauf[this.index] = eintrag;
    }
    this.quelle = quelle; this.wurzel = wurzel; this.pfad = pfad;
    this.auswahl.clear();
    this.filter = ''; if (this.filterEl) this.filterEl.value = '';
    this.laden();
  }

  zurueck() { if (this.index > 0) { this.index--; this.anwenden(); } }
  vor() { if (this.index < this.verlauf.length - 1) { this.index++; this.anwenden(); } }
  anwenden() {
    const e = this.verlauf[this.index];
    this.quelle = e.quelle; this.wurzel = e.wurzel; this.pfad = e.pfad;
    this.auswahl.clear();
    this.laden();
  }
  hoch() {
    if (this.quelle === 'pi') {
      if (this.pfad === '/' || !this.pfad) return;
      this.gehe('pi', this.wurzel, piEltern(this.pfad));
    } else {
      const eltern = this.elternLokal;
      if (eltern) this.gehe('lokal', '', eltern);
    }
  }

  async laden() {
    this.laedt = true;
    leeren(this.listeEl).append(el('div', { klasse: 'leer' }, el('div', { klasse: 'lader' })));
    const r = this.quelle === 'pi'
      ? await Z.pi.liste(this.wurzel, this.pfad || '/', Einst.daten.finder.versteckteZeigen)
      : await Z.lokal.liste(this.pfad, Einst.daten.finder.versteckteZeigen);
    this.laedt = false;
    if (!r.ok) {
      leeren(this.listeEl).append(el('div', { klasse: 'leer' },
        el('div', null, el('div', { text: r.fehler || 'Konnte nicht geladen werden' }),
          el('div', { stil: { marginTop: '12px' } },
            el('button', { klasse: 'knopf', onclick: () => this.laden() }, 'Nochmal')))));
      this.kopfAktualisieren();
      return;
    }
    this.eintraege = r.eintraege || [];
    this.schreibbar = r.schreibbar !== false;
    this.elternLokal = r.eltern || null;
    if (this.quelle === 'pi') this.pfad = r.pfad || this.pfad;
    else this.pfad = r.pfad || this.pfad;
    this.kopfAktualisieren();
    this.seiteZeichnen();
    this.zeichnen();
  }

  kopfAktualisieren() {
    const f = this.fenster;
    f.werkzeugSetzen('zurueck', { aus: this.index <= 0 });
    f.werkzeugSetzen('vor', { aus: this.index >= this.verlauf.length - 1 });
    f.werkzeugSetzen('hoch', { aus: this.quelle === 'pi' ? (this.pfad === '/' || !this.pfad) : !this.elternLokal });
    const name = this.quelle === 'pi' ? (piName(this.pfad) === '/' ? this.wurzelName() : piName(this.pfad)) : (lokalName(this.pfad) || this.pfad);
    f.setzeTitel(name);
    this.brotkrumen();
  }

  wurzelName() {
    const l = this.orte.pi.find((x) => x.mount === this.wurzel);
    return l ? (l.name || l.mount) : this.wurzel;
  }

  brotkrumen() {
    const p = leeren(this.pfadEl);
    const knopf = (text, tun, letzter) => el('button', { klasse: letzter ? 'letzter' : '', text, onclick: tun });
    const pfeil = () => el('span', { klasse: 'pfeil', text: '›' });

    if (this.quelle === 'pi') {
      const teile = String(this.pfad || '/').split('/').filter(Boolean);
      p.append(knopf(this.wurzelName(), () => this.gehe('pi', this.wurzel, '/'), !teile.length));
      teile.forEach((t, i) => {
        p.append(pfeil(), knopf(t, () => this.gehe('pi', this.wurzel, '/' + teile.slice(0, i + 1).join('/')), i === teile.length - 1));
      });
    } else {
      const teile = String(this.pfad || '').split(/[\\/]/).filter(Boolean);
      const windows = this.pfad.includes('\\') || /^[A-Za-z]:/.test(this.pfad);
      let auf = windows ? '' : '';
      teile.forEach((t, i) => {
        auf = windows ? (i === 0 ? t + '\\' : auf.replace(/[\\]+$/, '\\') + t + '\\') : auf + '/' + t;
        const ziel = windows ? (i === 0 ? t + '\\' : teile.slice(0, i + 1).join('\\')) : '/' + teile.slice(0, i + 1).join('/');
        if (i > 0) p.append(pfeil());
        p.append(knopf(t, () => this.gehe('lokal', '', ziel), i === teile.length - 1));
      });
      if (!teile.length) p.append(knopf(this.pfad || '/', () => {}, true));
    }
  }

  // ---------------------------------------------------------- Zeichnen
  gefiltert() {
    if (!this.filter) return this.eintraege;
    return this.eintraege.filter((e) => e.name.toLowerCase().includes(this.filter));
  }

  zeichnen() {
    const liste = leeren(this.listeEl);
    const eintraege = this.sortieren(this.gefiltert());
    if (!eintraege.length) {
      liste.append(el('div', { klasse: 'leer' }, this.filter ? 'Nichts gefunden' : 'Dieser Ordner ist leer'));
      this.fussZeichnen(0);
      return;
    }
    if (Einst.daten.finder.ansicht === 'symbole') this.gitterZeichnen(liste, eintraege);
    else this.listeZeichnen(liste, eintraege);
    this.fussZeichnen(eintraege.length);
  }

  sortieren(liste) {
    const art = Einst.daten.finder.sortierung || 'name';
    const k = [...liste];
    k.sort((a, b) => {
      const o = (a.typ === 'ordner' ? 0 : 1) - (b.typ === 'ordner' ? 0 : 1);
      if (o) return o;
      if (art === 'groesse') return (b.groesse || 0) - (a.groesse || 0);
      if (art === 'geaendert') return (b.geaendert || 0) - (a.geaendert || 0);
      return a.name.localeCompare(b.name, 'de');
    });
    return k;
  }

  listeZeichnen(wo, eintraege) {
    const sortKnopf = (text, id) => el('button', {
      text: text + (Einst.daten.finder.sortierung === id ? ' ↓' : ''),
      onclick: () => { Einst.setzen({ finder: { sortierung: id } }); this.zeichnen(); },
    });
    wo.append(el('div', { klasse: 'f-kopf' }, sortKnopf('Name', 'name'), sortKnopf('Grösse', 'groesse'), sortKnopf('Geändert', 'geaendert')));
    for (const e of eintraege) wo.append(this.zeile(e));
  }

  zeile(e) {
    const z = el('div', {
      klasse: 'f-zeile' + (this.auswahl.has(e.name) ? ' gewaehlt' : ''),
      daten: { name: e.name },
      draggable: 'true',
    },
      el('div', { klasse: 'name' }, el('span', { html: symbol(artSymbol(e.art)) }).firstElementChild, el('span', { text: e.name })),
      el('div', { klasse: 'leise', text: e.typ === 'ordner' ? '–' : groesse(e.groesse) }),
      el('div', { klasse: 'leise', text: datumZeit(e.geaendert) }),
    );
    this.zeileEreignisse(z, e);
    return z;
  }

  gitterZeichnen(wo, eintraege) {
    const g = el('div', { klasse: 'f-gitter' });
    for (const e of eintraege) {
      const bild = el('div', { klasse: 'bild' }, el('span', { html: symbol(artSymbol(e.art)) }).firstElementChild);
      const k = el('div', { klasse: 'f-kachel' + (this.auswahl.has(e.name) ? ' gewaehlt' : ''), daten: { name: e.name }, draggable: 'true' },
        bild, el('div', { klasse: 'titel', text: e.name }));
      this.zeileEreignisse(k, e);
      if (e.art === 'bild') this.vorschauLaden(e, bild);
      g.append(k);
    }
    wo.append(g);
  }

  async vorschauLaden(e, wo) {
    const r = this.quelle === 'pi'
      ? await Z.pi.url(this.wurzel, piVerbinden(this.pfad, e.name))
      : await Z.lokal.url(lokalVerbinden(this.pfad, e.name));
    if (!r.ok || !wo.isConnected) return;
    const bild = el('img', { src: r.url, alt: '', loading: 'lazy' });
    bild.onload = () => { leeren(wo).append(bild); };
    bild.onerror = () => {};
  }

  zeileEreignisse(z, e) {
    z.addEventListener('mousedown', (ev) => {
      if (ev.button === 2 && this.auswahl.has(e.name)) return;
      this.waehlen(e, ev);
    });
    z.addEventListener('dblclick', () => this.oeffnen(e));
    z.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      if (!this.auswahl.has(e.name)) this.waehlen(e, { ctrlKey: false, shiftKey: false });
      this.eintragMenue(ev.clientX, ev.clientY, e);
    });
    z.addEventListener('dragstart', (ev) => {
      if (!this.auswahl.has(e.name)) this.waehlen(e, { ctrlKey: false, shiftKey: false });
      ev.dataTransfer.effectAllowed = 'copyMove';
      ev.dataTransfer.setData('text/plain', e.name);
      this.ziehen = this.gewaehlteEintraege().map((x) => this.ref(x));
    });
    if (e.typ === 'ordner') {
      z.addEventListener('dragover', (ev) => { if (this.ziehen) { ev.preventDefault(); z.classList.add('ziel'); } });
      z.addEventListener('dragleave', () => z.classList.remove('ziel'));
      z.addEventListener('drop', (ev) => {
        ev.preventDefault();
        z.classList.remove('ziel');
        if (!this.ziehen) return;
        const ziel = this.ref(e);
        const quelle = this.ziehen;
        this.ziehen = null;
        if (quelle.some((q) => q.pfad === ziel.pfad && q.quelle === ziel.quelle)) return;
        this.uebertragen(quelle, { quelle: ziel.quelle, wurzel: ziel.wurzel, pfad: ziel.pfad }, ev.ctrlKey ? 'kopieren' : 'ausschneiden');
      });
    }
  }

  fussZeichnen(anzahl) {
    const f = leeren(this.fussEl);
    const gew = this.auswahl.size;
    const gesamt = this.eintraege.filter((e) => e.typ === 'datei').reduce((s, e) => s + (e.groesse || 0), 0);
    f.append(el('span', { text: gew ? `${gew} von ${anzahl} ausgewählt` : `${anzahl} Objekte` }));
    f.append(el('span', { text: (this.quelle === 'pi' ? 'Pi · ' : 'HP · ') + groesse(gesamt) + (this.schreibbar === false ? ' · nur lesen' : '') }));
  }

  // ---------------------------------------------------------- Auswahl
  ref(e) {
    return this.quelle === 'pi'
      ? { quelle: 'pi', wurzel: this.wurzel, pfad: piVerbinden(this.pfad, e.name), name: e.name, typ: e.typ, art: e.art }
      : { quelle: 'lokal', wurzel: '', pfad: lokalVerbinden(this.pfad, e.name), name: e.name, typ: e.typ, art: e.art };
  }
  gewaehlteEintraege() { return this.sortieren(this.gefiltert()).filter((e) => this.auswahl.has(e.name)); }
  ersterGewaehlter() { return this.gewaehlteEintraege()[0] || null; }

  waehlen(e, ev) {
    const sichtbar = this.sortieren(this.gefiltert());
    if (ev.shiftKey && this.letzteAuswahl) {
      const a = sichtbar.findIndex((x) => x.name === this.letzteAuswahl);
      const b = sichtbar.findIndex((x) => x.name === e.name);
      if (a >= 0 && b >= 0) {
        this.auswahl.clear();
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.auswahl.add(sichtbar[i].name);
      }
    } else if (ev.ctrlKey || ev.metaKey) {
      this.auswahl.has(e.name) ? this.auswahl.delete(e.name) : this.auswahl.add(e.name);
      this.letzteAuswahl = e.name;
    } else {
      this.auswahl.clear();
      this.auswahl.add(e.name);
      this.letzteAuswahl = e.name;
    }
    this.auswahlZeichnen();
  }
  auswahlLeeren() { this.auswahl.clear(); this.auswahlZeichnen(); }
  allesWaehlen() { for (const e of this.gefiltert()) this.auswahl.add(e.name); this.auswahlZeichnen(); }
  auswahlZeichnen() {
    for (const z of $$('.f-zeile, .f-kachel', this.listeEl)) z.classList.toggle('gewaehlt', this.auswahl.has(z.dataset.name));
    this.fussZeichnen(this.gefiltert().length);
    Menueleiste.aktualisieren();
  }

  taste(e) {
    const strg = e.ctrlKey || e.metaKey;
    if (strg && e.key.toLowerCase() === 'a') { e.preventDefault(); this.allesWaehlen(); }
    else if (strg && e.key.toLowerCase() === 'c') { e.preventDefault(); this.merken('kopieren'); }
    else if (strg && e.key.toLowerCase() === 'x') { e.preventDefault(); this.merken('ausschneiden'); }
    else if (strg && e.key.toLowerCase() === 'v') { e.preventDefault(); this.einfuegen(); }
    else if (strg && e.key.toLowerCase() === 'r') { e.preventDefault(); this.laden(); }
    else if (e.key === 'Delete') { e.preventDefault(); this.loeschen(); }
    else if (e.key === 'F2') { e.preventDefault(); const x = this.ersterGewaehlter(); if (x) this.umbenennen(x); }
    else if (e.key === 'Enter') { const x = this.ersterGewaehlter(); if (x) this.oeffnen(x); }
    else if (e.key === 'Backspace') { e.preventDefault(); this.hoch(); }
  }

  // ---------------------------------------------------------- Aktionen
  oeffnen(e) {
    if (e.typ === 'ordner') {
      if (this.quelle === 'pi') this.gehe('pi', this.wurzel, piVerbinden(this.pfad, e.name));
      else this.gehe('lokal', '', lokalVerbinden(this.pfad, e.name));
      return;
    }
    const r = this.ref(e);
    if (e.art === 'text') Editor.oeffnen(r);
    else if (['bild', 'pdf', 'video', 'audio'].includes(e.art)) Vorschau.oeffnen(r);
    else if (r.quelle === 'lokal') Z.lokal.oeffnen(r.pfad).then((x) => { if (!x.ok) hinweis(x.fehler || 'Konnte nicht geöffnet werden', 'fehler'); });
    else Vorschau.oeffnen(r);
  }

  async neuerOrdner() {
    const name = await abfragen('Neuer Ordner', 'Name des Ordners:', 'Neuer Ordner', 'Anlegen');
    if (!name) return;
    const r = this.quelle === 'pi'
      ? await Z.pi.neu(this.wurzel, piVerbinden(this.pfad, name), true)
      : await Z.lokal.neu(this.pfad, name, true);
    if (!pruefen(r, 'Ordner konnte nicht angelegt werden')) return;
    await this.laden();
    this.auswahl = new Set([name]);
    this.auswahlZeichnen();
  }

  async neueDatei() {
    const name = await abfragen('Neue Textdatei', 'Name der Datei:', 'Notiz.txt', 'Anlegen');
    if (!name) return;
    const r = this.quelle === 'pi'
      ? await Z.pi.neu(this.wurzel, piVerbinden(this.pfad, name), false, '')
      : await Z.lokal.neu(this.pfad, name, false, '');
    if (!pruefen(r, 'Datei konnte nicht angelegt werden')) return;
    await this.laden();
  }

  async umbenennen(e) {
    const neu = await abfragen('Umbenennen', `«${e.name}» umbenennen in:`, e.name, 'Umbenennen');
    if (!neu || neu === e.name) return;
    const r = this.quelle === 'pi'
      ? await Z.pi.umbenennen(this.wurzel, piVerbinden(this.pfad, e.name), neu)
      : await Z.lokal.umbenennen(lokalVerbinden(this.pfad, e.name), neu);
    if (!pruefen(r, 'Umbenennen hat nicht geklappt')) return;
    await this.laden();
    this.auswahl = new Set([neu]);
    this.auswahlZeichnen();
  }

  async loeschen() {
    const liste = this.gewaehlteEintraege();
    if (!liste.length) return;
    const was = liste.length === 1 ? `«${liste[0].name}»` : `${liste.length} Objekte`;
    const ziel = this.quelle === 'pi' ? 'in den Papierkorb des Laufwerks' : 'in den Windows-Papierkorb';
    if (!await fragen('In den Papierkorb legen?', `${was} wird ${ziel} verschoben.`, 'In den Papierkorb', true)) return;
    let fehler = 0;
    for (const e of liste) {
      const r = this.quelle === 'pi'
        ? await Z.pi.loeschen(this.wurzel, piVerbinden(this.pfad, e.name), false)
        : await Z.lokal.loeschen(lokalVerbinden(this.pfad, e.name), false);
      if (!r.ok) { fehler++; hinweis(`${e.name}: ${r.fehler}`, 'fehler'); }
    }
    if (!fehler) hinweis(`${was} in den Papierkorb gelegt`, 'ok');
    this.auswahl.clear();
    await this.laden();
  }

  async teilen(e) {
    const tage = await abfragen('Link teilen', `«${e.name}» über einen Link freigeben. Gültig für wie viele Tage?`, '7', 'Link erstellen');
    if (tage === null) return;
    const r = await Z.pi.teilen(this.wurzel, piVerbinden(this.pfad, e.name), Number(tage) || 7);
    if (!pruefen(r, 'Link konnte nicht erstellt werden')) return;
    await Z.system.kopieren(r.url);
    await melden('Link erstellt und kopiert', `${r.url}\n\nGültig bis ${datumZeit(r.bis)}. Der Link funktioniert nur für Geräte in deinem Tailscale-Netz.`);
  }

  merken(art) {
    const liste = this.gewaehlteEintraege();
    if (!liste.length) return;
    Zwischenablage.art = art;
    Zwischenablage.eintraege = liste.map((e) => this.ref(e));
    hinweis(`${liste.length} ${liste.length === 1 ? 'Objekt' : 'Objekte'} ${art === 'kopieren' ? 'kopiert' : 'ausgeschnitten'}`, 'ok', 'Zwischenablage');
    Menueleiste.aktualisieren();
  }

  async einfuegen() {
    if (!Zwischenablage.eintraege.length) return;
    await this.uebertragen(Zwischenablage.eintraege, { quelle: this.quelle, wurzel: this.wurzel, pfad: this.pfad }, Zwischenablage.art);
    if (Zwischenablage.art === 'ausschneiden') { Zwischenablage.eintraege = []; Zwischenablage.art = null; }
  }

  // Kopiert/verschiebt eine Liste von Objekten an ein Ziel – auch zwischen Pi und HP.
  async uebertragen(quellen, ziel, art) {
    const kopieren = art === 'kopieren';
    const h = hinweis(`${quellen.length} ${quellen.length === 1 ? 'Objekt wird' : 'Objekte werden'} ${kopieren ? 'kopiert' : 'verschoben'} …`, 'info', 'Finder');
    let fehler = 0;
    for (const q of quellen) {
      let r;
      if (q.quelle === ziel.quelle && q.quelle === 'pi') {
        r = await Z.pi.verschieben({ wurzel: q.wurzel, pfad: q.pfad, zielWurzel: ziel.wurzel, zielPfad: ziel.pfad, kopieren });
      } else if (q.quelle === ziel.quelle) {
        r = await Z.lokal.verschieben(q.pfad, ziel.pfad, kopieren);
      } else if (q.quelle === 'pi') {
        r = await Z.uebertragen.piZuLokal(q.wurzel, q.pfad, ziel.pfad);
        if (r.ok && !kopieren) await Z.pi.loeschen(q.wurzel, q.pfad, false);
      } else {
        r = await Z.uebertragen.lokalZuPi(q.pfad, ziel.wurzel, ziel.pfad);
        if (r.ok && !kopieren) await Z.lokal.loeschen(q.pfad, false);
      }
      if (!r.ok) { fehler++; hinweis(`${q.name}: ${r.fehler}`, 'fehler'); }
    }
    h.remove();
    if (!fehler) hinweis(`${quellen.length} ${quellen.length === 1 ? 'Objekt' : 'Objekte'} ${kopieren ? 'kopiert' : 'verschoben'}`, 'ok');
    await this.laden();
  }

  ansichtWechseln() { this.ansichtSetzen(Einst.daten.finder.ansicht === 'liste' ? 'symbole' : 'liste'); }
  ansichtSetzen(a) {
    Einst.setzen({ finder: { ansicht: a } });
    this.ansichtKnopf.innerHTML = symbol(a === 'liste' ? 'gitter' : 'liste');
    this.zeichnen();
  }
  versteckteUmschalten() {
    Einst.setzen({ finder: { versteckteZeigen: !Einst.daten.finder.versteckteZeigen } });
    this.laden();
  }

  // ---------------------------------------------------------- Menüs
  eintragMenue(x, y, e) {
    const mehrere = this.auswahl.size > 1;
    const eintraege = [
      { titel: mehrere ? `${this.auswahl.size} Objekte` : e.name },
      { text: 'Öffnen', tun: () => this.oeffnen(e) },
    ];
    if (e.typ === 'datei' && ['bild', 'pdf', 'video', 'audio', 'text'].includes(e.art)) {
      eintraege.push({ text: 'Vorschau', tun: () => Vorschau.oeffnen(this.ref(e)) });
    }
    if (e.art === 'text') eintraege.push({ text: 'Bearbeiten', tun: () => Editor.oeffnen(this.ref(e)) });
    if (this.quelle === 'lokal') {
      eintraege.push({ text: 'Mit Windows öffnen', tun: () => Z.lokal.oeffnen(lokalVerbinden(this.pfad, e.name)) });
      eintraege.push({ text: 'Im Explorer zeigen', tun: () => Z.lokal.imOrdner(lokalVerbinden(this.pfad, e.name)) });
    }
    eintraege.push('-',
      { text: 'Kopieren', kuerzel: '⌘C', tun: () => this.merken('kopieren') },
      { text: 'Ausschneiden', kuerzel: '⌘X', tun: () => this.merken('ausschneiden') },
      { text: 'Umbenennen …', aus: mehrere, kuerzel: 'F2', tun: () => this.umbenennen(e) },
    );
    if (this.quelle === 'pi' && e.typ === 'datei') eintraege.push({ text: 'Link teilen …', aus: mehrere, tun: () => this.teilen(e) });
    eintraege.push('-', { text: 'In den Papierkorb', kuerzel: 'Entf', tun: () => this.loeschen() });
    eintraege.push('-', { text: 'Informationen', aus: mehrere, tun: () => this.infos(e) });
    kontextmenue(x, y, eintraege);
  }

  hintergrundMenue(x, y) {
    kontextmenue(x, y, [
      { text: 'Neuer Ordner', tun: () => this.neuerOrdner() },
      { text: 'Neue Textdatei', tun: () => this.neueDatei() },
      '-',
      { text: `Einfügen${Zwischenablage.eintraege.length ? ` (${Zwischenablage.eintraege.length})` : ''}`, aus: !Zwischenablage.eintraege.length, tun: () => this.einfuegen() },
      '-',
      { text: (Einst.daten.finder.ansicht === 'liste' ? '✓ ' : '') + 'Als Liste', tun: () => this.ansichtSetzen('liste') },
      { text: (Einst.daten.finder.ansicht === 'symbole' ? '✓ ' : '') + 'Als Symbole', tun: () => this.ansichtSetzen('symbole') },
      { text: (Einst.daten.finder.versteckteZeigen ? '✓ ' : '') + 'Versteckte zeigen', tun: () => this.versteckteUmschalten() },
      '-',
      { text: 'Aktualisieren', tun: () => this.laden() },
      this.quelle === 'pi' ? { text: 'Papierkorb des Laufwerks leeren …', tun: () => this.papierkorbLeeren() } : null,
    ].filter(Boolean));
  }

  async papierkorbLeeren() {
    if (!await fragen('Papierkorb leeren?', `Alles im Papierkorb von «${this.wurzelName()}» wird endgültig gelöscht.`, 'Endgültig löschen', true)) return;
    const r = await Z.pi.papierkorb(this.wurzel);
    if (!pruefen(r)) return;
    hinweis(`${r.geloescht ?? 0} Objekte endgültig gelöscht`, 'ok');
    this.laden();
  }

  async infos(e) {
    const ref = this.ref(e);
    const zeilen = [
      `Name: ${e.name}`,
      `Art: ${e.typ === 'ordner' ? 'Ordner' : e.art}`,
      e.typ === 'datei' ? `Grösse: ${groesse(e.groesse)} (${(e.groesse || 0).toLocaleString('de-CH')} Bytes)` : null,
      `Geändert: ${datumZeit(e.geaendert)}`,
      `Ort: ${ref.quelle === 'pi' ? 'Pi · ' + this.wurzelName() : 'HP'}`,
      `Pfad: ${ref.pfad}`,
    ].filter(Boolean);
    await melden('Informationen', zeilen.join('\n'));
  }
}

const Finder = {
  offen: null,
  oeffnen(start) {
    if (this.offen && FM.finden('finder')) {
      FM.oeffnen({ id: 'finder' });
      if (start) this.offen.gehe(start.quelle, start.wurzel || '', start.pfad || '/');
      return this.offen;
    }
    this.offen = new FinderFenster(start);
    return this.offen;
  },
};
