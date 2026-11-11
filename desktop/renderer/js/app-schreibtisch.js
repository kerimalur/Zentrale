// Der Home-Bildschirm: frei anzuordnende App-Symbole und Widgets.
// Alles liegt auf einem Raster; Position und Grösse stehen in den Einstellungen.

const WIDGETS = {
  pi: {
    name: 'Pi-Zustand', symbol: 'pi', breit: 3, hoch: 2, quelle: 'state',
    zeichnen(k, z) {
      if (!z) return k.append(wLeer('Pi nicht erreichbar'));
      const p = z.pi || {};
      const gestoert = (z.dienste || []).filter((d) => d.status === 'gestoert' || d.status === 'offline').length;
      k.append(wKopf('Raspberry Pi', 'pi'),
        wGross(p.temp != null ? Math.round(p.temp) + ' °C' : '–'),
        wZeilen([
          ['CPU', Math.round(p.cpu || 0) + ' %'],
          ['RAM', `${groesse(p.ramBenutzt)} / ${groesse(p.ramTotal)}`],
          ['Dienste', gestoert ? `${gestoert} gestört` : 'alle laufen'],
          ['Container', p.container ? `${p.container.laufen} / ${p.container.gesamt}` : '–'],
        ]));
    },
    tun: () => Apps['zentrale:System']?.oeffnen(),
  },

  haus: {
    name: 'Haus & Steuerung', symbol: 'sonne', breit: 3, hoch: 2, quelle: 'state',
    zeichnen(k, z) {
      if (!z) return k.append(wLeer('Pi nicht erreichbar'));
      const m = z.moebel || {};
      const lf = m.luefter || {};
      k.append(wKopf('Haus', 'sonne'),
        wGross(m.temp != null ? String(m.temp).replace('.', ',') + ' °C' : '–'),
        wZeilen([
          ['Lüfter', !lf.vorhanden ? '–' : `${lf.an ? 'laufen' : 'aus'} · ${lf.modus === 'auto' ? 'Auto' : lf.modus === 'an' ? 'An' : 'Aus'}`],
          ['Szene', z.szene?.name || '–'],
          ['Fernseher', z.tv?.an === true ? 'an' : z.tv?.an === false ? 'Standby' : '–'],
          ['Strom', z.energie?.watt != null ? Math.round(z.energie.watt) + ' W' : '–'],
        ]));
    },
    tun: () => Apps.steuerung.oeffnen(),
  },

  dienste: {
    name: 'Dienste-Ampel', symbol: 'steuerung', breit: 2, hoch: 2, quelle: 'state',
    zeichnen(k, z) {
      if (!z) return k.append(wLeer('Pi nicht erreichbar'));
      k.append(wKopf('Dienste', 'steuerung'));
      const liste = el('div', { stil: { display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '6px' } });
      for (const d of z.dienste || []) {
        liste.append(el('div', { stil: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px' } },
          el('span', { klasse: 'punkt ' + (d.status === 'online' ? 'an' : d.status === 'unbekannt' ? '' : 'weg'), stil: { width: '8px', height: '8px', borderRadius: '50%', background: d.status === 'online' ? 'var(--gruen)' : d.status === 'unbekannt' ? 'var(--text-sehr-leise)' : 'var(--rot)', flex: 'none' } }),
          el('span', { stil: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: d.name })));
      }
      k.append(liste);
    },
    tun: () => Apps.steuerung.oeffnen(),
  },

  strom: {
    name: 'Stromverbrauch', symbol: 'strom', breit: 2, hoch: 1, quelle: 'state',
    zeichnen(k, z) {
      const e = z?.energie;
      k.append(wKopf('Strom', 'strom'),
        wGross(e?.watt != null ? Math.round(e.watt) + ' W' : '–'),
        wKlein(e?.chfMonat ? `ca. ${e.chfMonat.toFixed(2).replace('.', ',')} CHF / Monat` : ''));
    },
  },

  speicher: {
    name: 'Speicherplatz', symbol: 'speicher', breit: 3, hoch: 2, quelle: 'state',
    zeichnen(k, z) {
      if (!z) return k.append(wLeer('Pi nicht erreichbar'));
      k.append(wKopf('Speicher', 'speicher'));
      const liste = el('div', { stil: { display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '8px' } });
      for (const l of z.laufwerke || []) {
        const anteil = l.gross ? Math.min(100, Math.round((l.benutzt / l.gross) * 100)) : 0;
        liste.append(el('div', null,
          el('div', { stil: { display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '3px' } },
            el('span', { stil: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: l.name || l.mount }),
            el('span', { stil: { color: 'var(--text-sehr-leise)', flex: 'none', marginLeft: '8px' }, text: groesse(l.frei) + ' frei' })),
          el('div', { stil: { height: '5px', borderRadius: '3px', background: 'var(--flaeche)', overflow: 'hidden' } },
            el('div', { stil: { width: anteil + '%', height: '100%', background: anteil > 90 ? 'var(--rot)' : anteil > 75 ? 'var(--orange)' : 'var(--akzent)' } }))));
      }
      k.append(liste);
    },
    tun: () => Finder.oeffnen(),
  },

  netz: {
    name: 'Netzwerk', symbol: 'netz', breit: 2, hoch: 1, quelle: 'state',
    zeichnen(k, z) {
      const n = z?.netz;
      k.append(wKopf('Netz heute', 'netz'),
        wZeilen([
          ['Runter', n?.heute ? groesse(n.heute.down) : '–'],
          ['Hoch', n?.heute ? groesse(n.heute.up) : '–'],
          ['Geräte', String((n?.geraete || []).filter((g) => g.online).length || '–')],
        ]));
    },
    tun: () => Apps['zentrale:Netz']?.oeffnen(),
  },

  medien: {
    name: 'Downloads', symbol: 'film', breit: 2, hoch: 1, quelle: 'state',
    zeichnen(k, z) {
      const d = z?.medien?.downloads;
      const a = d?.anzahl || {};
      k.append(wKopf('Downloads', 'film'),
        wGross(d ? (a.laden || 0) + ' aktiv' : '–'),
        wKlein(d ? `↓ ${groesse(d.down)}/s${d.gedrosselt ? ' · gedrosselt' : ''}` : (z?.medien?.downloadsGrund || '')));
    },
    tun: () => Apps['zentrale:Medien']?.oeffnen(),
  },

  backup: {
    name: 'Backup', symbol: 'speichern', breit: 2, hoch: 1, quelle: 'state',
    zeichnen(k, z) {
      const b = z?.backup;
      k.append(wKopf('Backup', 'speichern'),
        wGross(!b?.eingerichtet ? '–' : b.laeuft ? 'läuft' : b.letzte?.ok ? 'ok' : b.letzte ? 'Fehler' : 'nie'),
        wKlein(b?.letzte ? datumZeit(b.letzte.zeit) : (b?.eingerichtet ? 'noch nie gelaufen' : 'nicht eingerichtet')));
    },
  },

  szene: {
    name: 'Szene umschalten', symbol: 'mond', breit: 3, hoch: 1, quelle: 'state',
    zeichnen(k, z) {
      k.append(wKopf('Szene', 'mond'));
      const reihe = el('div', { stil: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } });
      for (const s of z?.szenen || []) {
        reihe.append(el('button', {
          klasse: 'knopf klein' + (z.szene?.id === s.id ? ' haupt' : ''),
          onclick: async (ev) => {
            ev.stopPropagation();
            const r = await Z.pi.steuern('szene', s.id);
            if (pruefen(r)) { hinweis('Szene: ' + (s.name || s.id), 'ok'); Zustand.holen(true); }
          },
        }, s.name || s.id));
      }
      k.append(reihe);
    },
  },

  trading: {
    name: 'Trading', symbol: 'trading', breit: 3, hoch: 2, quelle: 'trading',
    zeichnen(k, t) {
      k.append(wKopf('Trading', 'trading'));
      if (!t) return k.append(wLeer('Keine Trading-Daten'));
      const paare = (t.paare || t.kurse || []).slice(0, 7);
      if (!paare.length) return k.append(wLeer('Keine Kurse'));
      const liste = el('div', { stil: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' } });
      for (const p of paare) {
        const name = p.paar || p.name || p.id || '';
        const kurs = p.kurs ?? p.preis ?? p.letzter ?? null;
        const aend = p.aenderung ?? p.veraenderung ?? null;
        liste.append(el('div', { stil: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } },
          el('span', { text: name }),
          el('span', { stil: { fontVariantNumeric: 'tabular-nums', color: aend == null ? 'var(--text-leise)' : aend >= 0 ? 'var(--gruen)' : 'var(--rot)' },
            text: kurs == null ? '–' : String(kurs) })));
      }
      k.append(liste);
    },
    tun: () => Apps['zentrale:Trading']?.oeffnen(),
  },

  heute: {
    name: 'Heute', symbol: 'heute', breit: 3, hoch: 2, quelle: 'heute',
    zeichnen(k, h) {
      k.append(wKopf('Heute', 'heute'));
      if (!h) return k.append(wLeer('Keine Daten – Google verbunden?'));
      k.append(wZeilen([
        ['Termine', String((h.termine || []).length)],
        ['Aufgaben', String((h.aufgaben || []).filter((a) => !a.erledigt).length)],
        ['Mails', String(h.mails?.anzahl ?? (h.mails || []).length ?? 0)],
      ]));
      const t = (h.termine || [])[0];
      if (t) k.append(wKlein(`Als Nächstes: ${t.titel || t.name || ''}${t.zeit ? ' · ' + t.zeit : ''}`));
    },
    tun: () => Apps['zentrale:Heute']?.oeffnen(),
  },

  gesundheit: {
    name: 'Gesundheit', symbol: 'herz', breit: 2, hoch: 2, quelle: 'garmin',
    zeichnen(k, g) {
      k.append(wKopf('Gesundheit', 'herz'));
      if (!g) return k.append(wLeer('Keine Garmin-Daten'));
      k.append(wGross(g.bodyBattery?.jetzt != null ? String(g.bodyBattery.jetzt) : '–'),
        wKlein('Body Battery'),
        wZeilen([
          ['Schritte', g.schritte?.heute != null ? String(g.schritte.heute) : '–'],
          ['Ruhepuls', g.ruhepuls?.jetzt != null ? g.ruhepuls.jetzt + ' bpm' : '–'],
        ]));
    },
    tun: () => Apps['zentrale:Gesundheit']?.oeffnen(),
  },

  uhr: {
    name: 'Uhr', symbol: 'heute', breit: 2, hoch: 1, quelle: 'keine',
    zeichnen(k) {
      const zeit = el('div', { klasse: 'w-gross', stil: { fontSize: '34px' }, text: uhr() });
      const dat = el('div', { klasse: 'w-klein', text: langesDatum() });
      k.append(zeit, dat);
      const t = setInterval(() => {
        if (!k.isConnected) return clearInterval(t);
        zeit.textContent = uhr();
        dat.textContent = langesDatum();
      }, 10000);
    },
  },

  notiz: {
    name: 'Notizzettel', symbol: 'stift', breit: 3, hoch: 2, quelle: 'keine',
    zeichnen(k, _d, widget) {
      k.append(wKopf('Notiz', 'stift'));
      const feld = el('textarea', {
        klasse: 'w-notiz', spellcheck: 'false', placeholder: 'Tippen …',
      });
      feld.value = widget.text || '';
      feld.addEventListener('mousedown', (e) => e.stopPropagation());
      feld.addEventListener('input', entprellen(() => Schreibtischflaeche.widgetSetzen(widget.id, { text: feld.value }), 600));
      k.append(feld);
    },
  },
};

// ---------- kleine Bausteine für Widgets ----------
const wKopf = (text, symbolName) => el('div', { klasse: 'w-kopf' },
  el('span', { html: symbol(symbolName) }).firstElementChild, el('span', { text }));
const wGross = (text) => el('div', { klasse: 'w-gross', text });
const wKlein = (text) => el('div', { klasse: 'w-klein', text });
const wLeer = (text) => el('div', { klasse: 'w-leer', text });
const wZeilen = (paare) => {
  const d = el('div', { klasse: 'w-zeilen' });
  for (const [a, b] of paare) d.append(el('span', { text: a }), el('b', { text: b }));
  return d;
};

// ---------------------------------------------------------------- Schreibtisch

const Schreibtischflaeche = {
  wurzel: null, abmelder: [], daten: { state: null, trading: null, heute: null, garmin: null },
  bearbeiten: false,

  get e() { return Einst.daten.schreibtisch || { raster: 110, einrasten: true, symbole: [], widgets: [] }; },
  get raster() { return Number(this.e.raster) || 110; },

  bauen() {
    this.wurzel = $('#flaeche') || el('div', { klasse: 'flaeche', id: 'flaeche' });
    if (!this.wurzel.isConnected) $('#schreibtisch').insertBefore(this.wurzel, $('#fensterflaeche'));
    this.zeichnen();
    this.datenHolen();
  },

  datenHolen() {
    for (const ab of this.abmelder) ab();
    this.abmelder = [];
    const typen = new Set((this.e.widgets || []).map((w) => WIDGETS[w.typ]?.quelle).filter(Boolean));

    if (typen.has('state')) {
      this.abmelder.push(Zustand.abonnieren((d) => { this.daten.state = d; this.widgetsAuffrischen('state'); }));
    }
    for (const [quelle, holen] of [['trading', () => Z.pi.trading()], ['heute', () => Z.pi.heute()], ['garmin', () => Z.pi.garmin()]]) {
      if (!typen.has(quelle)) continue;
      const lauf = async () => {
        const r = await holen();
        this.daten[quelle] = r && r.ok ? r : null;
        this.widgetsAuffrischen(quelle);
      };
      lauf();
      const t = setInterval(lauf, 60000);
      this.abmelder.push(() => clearInterval(t));
    }
  },

  widgetsAuffrischen(quelle) {
    for (const w of this.e.widgets || []) {
      const def = WIDGETS[w.typ];
      if (!def || def.quelle !== quelle) continue;
      const k = this.wurzel.querySelector(`[data-widget="${w.id}"] .w-inhalt`);
      if (!k) continue;
      leeren(k);
      try { def.zeichnen(k, this.datenFuer(def.quelle), w); } catch (e) { k.append(wLeer('Fehler: ' + e.message)); }
    }
  },

  datenFuer(quelle) {
    if (quelle === 'state') return this.daten.state;
    if (quelle === 'keine') return null;
    return this.daten[quelle];
  },

  // ---------- Zeichnen ----------
  zeichnen() {
    const w = leeren(this.wurzel);
    w.classList.toggle('bearbeiten', this.bearbeiten);
    const r = this.raster;

    for (const s of this.e.symbole || []) {
      const app = Apps[s.app];
      if (!app) continue;
      const k = el('button', {
        klasse: 'fl-symbol', daten: { symbol: s.app },
        stil: { left: s.x * r + 'px', top: s.y * r + 'px', width: r + 'px' },
        title: app.name,
      },
        el('span', { klasse: 'fl-bild', html: symbol(app.symbol), stil: app.farbe ? { background: app.farbe } : {} }),
        el('span', { klasse: 'fl-name', text: app.name }));
      k.addEventListener('dblclick', () => app.oeffnen());
      k.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        kontextmenue(ev.clientX, ev.clientY, [
          { text: 'Öffnen', tun: () => app.oeffnen() },
          '-',
          { text: 'Vom Schreibtisch entfernen', tun: () => this.symbolWeg(s.app) },
        ]);
      });
      this.ziehbar(k, (gx, gy) => this.symbolSetzen(s.app, gx, gy));
      w.append(k);
    }

    for (const widget of this.e.widgets || []) {
      const def = WIDGETS[widget.typ];
      if (!def) continue;
      const breit = widget.breit || def.breit;
      const hoch = widget.hoch || def.hoch;
      const k = el('div', {
        klasse: 'fl-widget', daten: { widget: widget.id },
        stil: {
          left: widget.x * r + 'px', top: widget.y * r + 'px',
          width: breit * r - 10 + 'px', height: hoch * r - 10 + 'px',
        },
      }, el('div', { klasse: 'w-inhalt' }));
      const inhalt = k.firstElementChild;
      try { def.zeichnen(inhalt, this.datenFuer(def.quelle), widget); } catch (e) { inhalt.append(wLeer('Fehler: ' + e.message)); }
      if (def.tun) {
        k.addEventListener('dblclick', (ev) => { if (!ev.target.closest('button, textarea')) def.tun(); });
        k.classList.add('klickbar');
      }
      k.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        kontextmenue(ev.clientX, ev.clientY, [
          { titel: def.name },
          def.tun ? { text: 'Öffnen', tun: () => def.tun() } : null,
          '-',
          { text: 'Breiter', tun: () => this.widgetSetzen(widget.id, { breit: Math.min(8, breit + 1) }) },
          { text: 'Schmaler', aus: breit <= 1, tun: () => this.widgetSetzen(widget.id, { breit: breit - 1 }) },
          { text: 'Höher', tun: () => this.widgetSetzen(widget.id, { hoch: Math.min(6, hoch + 1) }) },
          { text: 'Flacher', aus: hoch <= 1, tun: () => this.widgetSetzen(widget.id, { hoch: hoch - 1 }) },
          '-',
          { text: 'Widget entfernen', tun: () => this.widgetWeg(widget.id) },
        ].filter(Boolean));
      });
      this.ziehbar(k, (gx, gy) => this.widgetSetzen(widget.id, { x: gx, y: gy }));
      w.append(k);
    }
  },

  // ---------- Ziehen mit Einrasten ----------
  ziehbar(knoten, fertig) {
    knoten.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest('button, textarea, input, a')) return;
      ev.preventDefault();
      const r = this.raster;
      const start = { x: ev.clientX, y: ev.clientY, l: parseInt(knoten.style.left, 10), t: parseInt(knoten.style.top, 10) };
      let bewegt = false;
      knoten.classList.add('zieht');
      FM.ueberlagernAn();
      const bewegen = (e2) => {
        const dx = e2.clientX - start.x;
        const dy = e2.clientY - start.y;
        if (!bewegt && Math.abs(dx) + Math.abs(dy) < 4) return;
        bewegt = true;
        knoten.style.left = Math.max(0, start.l + dx) + 'px';
        knoten.style.top = Math.max(0, start.t + dy) + 'px';
      };
      const los = () => {
        document.removeEventListener('mousemove', bewegen);
        document.removeEventListener('mouseup', los);
        knoten.classList.remove('zieht');
        FM.ueberlagernAus();
        if (!bewegt) return;
        const l = parseInt(knoten.style.left, 10);
        const t = parseInt(knoten.style.top, 10);
        const gx = this.e.einrasten === false ? Math.round(l / r) : Math.max(0, Math.round(l / r));
        const gy = this.e.einrasten === false ? Math.round(t / r) : Math.max(0, Math.round(t / r));
        knoten.style.left = gx * r + 'px';
        knoten.style.top = gy * r + 'px';
        fertig(gx, gy);
      };
      document.addEventListener('mousemove', bewegen);
      document.addEventListener('mouseup', los);
    });
  },

  // ---------- Ändern ----------
  async speichern(teil) {
    await Einst.setzenAsync({ schreibtisch: { ...this.e, ...teil } });
  },

  symbolSetzen(app, x, y) {
    const liste = (this.e.symbole || []).map((s) => (s.app === app ? { ...s, x, y } : s));
    this.speichern({ symbole: liste });
  },
  symbolHinzu(app) {
    if ((this.e.symbole || []).some((s) => s.app === app)) return hinweis('Ist schon auf dem Schreibtisch', 'warnung');
    const frei = this.freierPlatz(1, 1);
    this.speichern({ symbole: [...(this.e.symbole || []), { app, ...frei }] }).then(() => this.zeichnen());
  },
  symbolWeg(app) {
    this.speichern({ symbole: (this.e.symbole || []).filter((s) => s.app !== app) }).then(() => this.zeichnen());
  },

  widgetSetzen(id, teil) {
    const liste = (this.e.widgets || []).map((w) => (w.id === id ? { ...w, ...teil } : w));
    this.speichern({ widgets: liste }).then(() => { if (teil.breit || teil.hoch || teil.x !== undefined) this.zeichnen(); });
  },
  widgetHinzu(typ) {
    const def = WIDGETS[typ];
    if (!def) return;
    const frei = this.freierPlatz(def.breit, def.hoch);
    const neu = { id: 'w' + Date.now().toString(36), typ, ...frei, breit: def.breit, hoch: def.hoch };
    this.speichern({ widgets: [...(this.e.widgets || []), neu] }).then(() => { this.zeichnen(); this.datenHolen(); });
  },
  widgetWeg(id) {
    this.speichern({ widgets: (this.e.widgets || []).filter((w) => w.id !== id) }).then(() => { this.zeichnen(); this.datenHolen(); });
  },

  // Erste freie Stelle im Raster suchen.
  freierPlatz(breit, hoch) {
    const r = this.raster;
    const spalten = Math.max(1, Math.floor(this.wurzel.clientWidth / r));
    const zeilen = Math.max(1, Math.floor(this.wurzel.clientHeight / r));
    const belegt = new Set();
    const merken = (x, y, b, h) => { for (let i = 0; i < b; i++) for (let j = 0; j < h; j++) belegt.add(`${x + i},${y + j}`); };
    for (const s of this.e.symbole || []) merken(s.x, s.y, 1, 1);
    for (const w of this.e.widgets || []) merken(w.x, w.y, w.breit || 1, w.hoch || 1);
    for (let y = 0; y + hoch <= zeilen; y++) {
      for (let x = 0; x + breit <= spalten; x++) {
        let frei = true;
        for (let i = 0; i < breit && frei; i++) for (let j = 0; j < hoch && frei; j++) if (belegt.has(`${x + i},${y + j}`)) frei = false;
        if (frei) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  },

  // ---------- Menü auf dem Schreibtisch ----------
  menue(x, y) {
    const appsFrei = Object.entries(Apps).filter(([id]) => !(this.e.symbole || []).some((s) => s.app === id));
    kontextmenue(x, y, [
      { text: 'Widget hinzufügen …', tun: () => this.widgetMenue(x, y) },
      appsFrei.length ? { text: 'App auf den Schreibtisch …', tun: () => {
        kontextmenue(x, y, [{ titel: 'App hinzufügen' }, ...appsFrei.map(([id, a]) => ({ text: a.name, tun: () => this.symbolHinzu(id) }))]);
      } } : null,
      '-',
      { text: 'Finder öffnen', kuerzel: '⌘E', tun: () => Apps.finder.oeffnen() },
      { text: 'Steuerung öffnen', tun: () => Apps.steuerung.oeffnen() },
      '-',
      { text: (this.e.einrasten === false ? '' : '✓ ') + 'Am Raster ausrichten', tun: () => this.speichern({ einrasten: this.e.einrasten === false }) },
      { text: 'Hintergrund ändern …', tun: () => Apps.einstellungen.oeffnen('aussehen') },
      { text: 'Einstellungen …', kuerzel: '⌘,', tun: () => Apps.einstellungen.oeffnen() },
    ].filter(Boolean));
  },

  widgetMenue(x, y) {
    kontextmenue(x, y, [
      { titel: 'Widget hinzufügen' },
      ...Object.entries(WIDGETS).map(([typ, def]) => ({ text: def.name, tun: () => this.widgetHinzu(typ) })),
    ]);
  },
};
