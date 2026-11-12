// Weitere Programme und Funktionen: Fensterwechsel (Alt+Tab), Schreibtische, Zwischenablage, Papierkorb, Fotos,
// Bildschirmfoto, Datenträger, Sicherheits-Zentrale, Netzwerkwächter, Sicherheitslabor, Fernzugriff, Fokus,
// dazu die Einstellungen Grösse, Ruhe, Bot-Wächter, Backup und die Installation auf die Platte.
Object.assign(SYMBOL, {
  papierkorb: S('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/>'),
  fotos: S('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4 3 2 4-4 4 4"/>'),
  kamera: S('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>'),
  platte: S('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3.5"/><path d="M8 17h.01M12 17h4"/>'),
  waechter: S('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  labor: S('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M8 15h8"/>'),
  fern: S('<rect x="3" y="4" width="13" height="10" rx="2"/><path d="M7 18h5M9.5 14v4"/><path d="M19 9v9M16.5 15.5L19 18l2.5-2.5"/>'),
  ziel: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  ablage: S('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'),
  roboter: S('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9.5 16.5h5"/><circle cx="12" cy="3.5" r="1"/>'),
  sichern: S('<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1-.5 8.5"/><path d="M12 12v8M9 15l3-3 3 3"/>'),
});
const M = Z.mehr;
const E = EinstellungenApp;
const leerText = (t) => el('div', { klasse: 'web-platz leer', stil: { position: 'static', padding: '36px 20px' } }, t);
const dauer = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${zweiStellig(s % 60)}`; };
const mitAdmin = (aufruf, grund) => alsAdmin(aufruf, grund);
function einfachesFenster(id, titel, sym, breite, hoehe, bauen, werkzeuge = []) {
  return FM.oeffnen({ id, appId: id, titel, symbol: sym, breite, hoehe, minBreite: 420, minHoehe: 300, werkzeuge, aufbauen: (inhalt) => { const k = el('div', { klasse: 'mehr-seite' }); inhalt.append(k); bauen(k); } });
}

// ---------------------------------------------------------------- Schreibtische (4 Stück)
const Arbeit = {
  aktuell: 0, anzahl: 4, erwartet: null,
  anwenden() {
    for (const f of FM.liste) { if (f.desk === undefined) f.desk = this.aktuell; f.wurzel.classList.toggle('anderer-desk', f.desk !== this.aktuell); }
    const sichtbar = FM.liste.filter((f) => f.desk === this.aktuell && !f.minimiert).sort((a, b) => b.wurzel.style.zIndex - a.wurzel.style.zIndex)[0];
    if (sichtbar) sichtbar.fokus(); else { for (const f of FM.liste) { f.aktiv = false; f.wurzel.classList.remove('aktiv'); } FM.oben = null; Menueleiste.aktualisieren(); FM.melden('desk'); }
    this.zeichnen(); Dock.aktualisieren();
  },
  setzen(n) { n = Math.max(0, Math.min(this.anzahl - 1, n)); if (n === this.aktuell) return; this.aktuell = n; this.anwenden(); hinweis('Schreibtisch ' + (n + 1)); },
  // Vom Tastenkürzel (labwc wechselt seinen Schreibtisch gleichzeitig) oder von der Taskleiste.
  schritt(d) { clearTimeout(this.erwartet); this.erwartet = null; this.setzen(this.aktuell + d); },
  async gehe(n) {
    const d = n - this.aktuell; if (!d) return;
    for (let i = 0; i < Math.abs(d); i++) {
      const vorher = this.aktuell; M.desktopTaste(d < 0 ? 'links' : 'rechts');
      await warte(260); if (this.aktuell === vorher) this.setzen(vorher + Math.sign(d));   // ohne labwc (Vorschau) selbst wechseln
    }
  },
  zeichnen() {
    let e = $('#tl-desks'); const rechts = $('#dock .tl-rechts'); if (!rechts) return;
    if (!e) {
      e = el('button', { id: 'tl-desks', klasse: 'tl-knopf tl-desks', title: 'Schreibtische: Klick = Übersicht, Mausrad oder Strg + Super + Pfeil = wechseln' }); rechts.prepend(e);
      e.addEventListener('click', () => Wechsler.uebersicht());
      e.addEventListener('wheel', (ev) => { ev.preventDefault(); this.gehe0(this.aktuell + (ev.deltaY > 0 ? 1 : -1)); }, { passive: false });
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); kontextmenue(ev.clientX, ev.clientY - 150, [{ titel: 'Schreibtisch' }, ...Array.from({ length: this.anzahl }, (_, i) => ({ text: 'Schreibtisch ' + (i + 1) + (i === this.aktuell ? '  ✓' : ''), tun: () => this.gehe(i) }))]); });
    }
    leeren(e).append(...Array.from({ length: this.anzahl }, (_, i) => el('i', { klasse: i === this.aktuell ? 'an' : '' })), el('b', { text: String(this.aktuell + 1) }));
  },
  gehe0(n) { return this.gehe(Math.max(0, Math.min(this.anzahl - 1, n))); },
};
{ const alt = FM.oeffnen; FM.oeffnen = function (opt) { const neuFenster = !this.finden(opt.id); const f = alt.call(this, opt); if (f) {
    if (neuFenster) { // nie grösser als der Bildschirm, nie ausserhalb
      const fl = FM.flaeche(); let g = false;
      if (f.breite > fl.width - 12) { f.breite = Math.max(320, fl.width - 12); g = true; } if (f.hoehe > fl.height - 20) { f.hoehe = Math.max(240, fl.height - 20); g = true; }
      if (f.x + f.breite > fl.left + fl.width) { f.x = Math.max(fl.left + 4, fl.left + fl.width - f.breite - 6); g = true; } if (f.y + f.hoehe > fl.top + fl.height) { f.y = Math.max(fl.top + 2, fl.top + fl.height - f.hoehe - 10); g = true; }
      if (f.x < fl.left) { f.x = fl.left + 4; g = true; } if (f.y < fl.top) { f.y = fl.top + 2; g = true; }
      if (g && !f.gezoomt) f.geometrieAnwenden();
    } if (f.desk !== Arbeit.aktuell) { f.desk = Arbeit.aktuell; f.wurzel.classList.remove('anderer-desk'); } } return f; };
  const altBauen = Dock.bauen; Dock.bauen = function () { altBauen.call(this); Arbeit.zeichnen(); Fokus.zeichnen(); }; }

// ---------------------------------------------------------------- Fensterwechsel (Alt + Tab) und Übersicht (Super + Tab)
const Wechsler = {
  verlauf: [], liste: null, nr: 0, timer: null,
  merken() { if (FM.oben) { this.verlauf = [FM.oben.id, ...this.verlauf.filter((x) => x !== FM.oben.id)].slice(0, 40); } },
  async sammeln(alle = false) {
    const eigene = FM.liste.filter((f) => alle || f.desk === Arbeit.aktuell).sort((a, b) => { const ia = this.verlauf.indexOf(a.id); const ib = this.verlauf.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); })
      .map((f) => ({ art: 'eigen', f, titel: f.titel || f.id, app: Apps[f.appId] || null, desk: f.desk }));
    const r = await Z.sys.fremdeFenster().catch(() => ({ liste: [] }));
    return [...eigene, ...(r.liste || []).map((x) => ({ art: 'fremd', x, titel: x.titel || x.app, app: null, name: x.app }))];
  },
  kachel(e, aktiv) {
    const sym = e.app ? Launchpad.symbolEl(e.app, 'wx-symbol') : el('span', { klasse: 'wx-symbol fremd', text: (e.name || e.titel || '?').replace(/^.*\./, '').slice(0, 1).toUpperCase() });
    return el('button', { klasse: 'wx-kachel' + (aktiv ? ' an' : '') }, sym, el('span', { klasse: 'wx-titel', text: e.titel }), e.art === 'fremd' ? el('small', { text: e.name }) : (e.desk !== undefined && e.desk !== Arbeit.aktuell ? el('small', { text: 'Schreibtisch ' + (e.desk + 1) }) : null));
  },
  async schritt(d) {
    if (!$('#sperre').hidden) return;
    if (!this.liste) { this.liste = await this.sammeln(); this.nr = 0; if (this.liste.length < 1) { this.liste = null; return; } if (FM.oben && this.liste[0].f !== FM.oben) this.nr = -1; }
    this.nr = (this.nr + d + this.liste.length) % this.liste.length; this.zeigen();
    clearTimeout(this.timer); this.timer = setTimeout(() => this.fertig(), 1100);
  },
  zeigen() {
    let e = $('#wechsler'); if (!e) { e = el('div', { id: 'wechsler', klasse: 'wechsler' }); $('#ebenen').append(e); }
    leeren(e).append(...this.liste.map((x, i) => { const k = this.kachel(x, i === this.nr); k.addEventListener('click', () => { this.nr = i; this.fertig(); }); return k; }));
  },
  fertig() {
    clearTimeout(this.timer); const e = this.liste && this.liste[this.nr]; this.liste = null; const w = $('#wechsler'); if (w) w.remove();
    if (e) this.gehe(e);
  },
  gehe(e) {
    if (e.art === 'eigen') { if (e.f.desk !== Arbeit.aktuell) Arbeit.gehe(e.f.desk); if (e.f.minimiert) e.f.wiederherstellen(); else e.f.fokus(); Z.sys.fensterFokus('zentraleos-shell'); }
    else Z.sys.fensterFokus(e.x.app, e.x.titel);
  },
  async uebersicht() {
    if ($('#uebersicht')) return this.uebersichtZu();
    schliesseMenues(); Startmenue.schliessen(); const liste = await this.sammeln(true);
    const e = el('div', { id: 'uebersicht', klasse: 'uebersicht' },
      el('div', { klasse: 'ue-desks' }, Array.from({ length: Arbeit.anzahl }, (_, i) => el('button', { klasse: 'ue-desk' + (i === Arbeit.aktuell ? ' an' : ''), onclick: () => { this.uebersichtZu(); Arbeit.gehe(i); } }, el('b', { text: 'Schreibtisch ' + (i + 1) }), el('small', { text: liste.filter((x) => x.desk === i).length + ' Fenster' })))),
      liste.length ? el('div', { klasse: 'ue-gitter' }, liste.map((x) => { const k = this.kachel(x, false); k.addEventListener('click', () => { this.uebersichtZu(); this.gehe(x); }); return k; })) : el('div', { klasse: 'ue-leer', text: 'Kein Fenster offen.' }));
    e.addEventListener('mousedown', (ev) => { if (ev.target === e) this.uebersichtZu(); });
    $('#ebenen').append(e); FM.ueberlagernAn();
  },
  uebersichtZu() { const e = $('#uebersicht'); if (e) { e.remove(); FM.ueberlagernAus(); } },
};
FM.aufAenderung((g) => { if (g === 'fokus') Wechsler.merken(); });

// ---------------------------------------------------------------- Zwischenablage-Verlauf (Super + V)
const Ablage = {
  async oeffnen() {
    if ($('#ablage')) return this.zu();
    schliesseMenues(); const r = await M.ablageListe();
    const e = el('div', { id: 'ablage', klasse: 'ablage' }, el('div', { klasse: 'ab-kopf' }, el('b', { text: 'Zwischenablage' }), el('button', { klasse: 'knopf klein', text: 'Leeren', onclick: async () => { await M.ablageLeeren(); this.zu(); } })),
      (r.liste || []).length ? el('div', { klasse: 'ab-liste' }, r.liste.map((x) => el('button', { klasse: 'ab-eintrag', onclick: async () => { const a = await M.ablageNehmen(x.nr); this.zu(); a.ok ? hinweis('Kopiert. Mit Strg + V einfügen.', 'ok') : hinweis(a.fehler, 'fehler'); } }, el('span', { text: x.text }), el('small', { text: uhr(new Date(x.zeit)) + (x.lang > 400 ? ` · ${x.lang} Zeichen` : '') }))))
        : el('div', { klasse: 'ab-leer', text: 'Noch nichts kopiert. Hier erscheint, was du mit Strg + C kopierst (nur Text, nur bis zum Neustart).' }));
    $('#ebenen').append(e);
    this.weg = (ev) => { if (!e.contains(ev.target)) this.zu(); }; setTimeout(() => document.addEventListener('mousedown', this.weg, true), 0);
  },
  zu() { const e = $('#ablage'); if (e) e.remove(); document.removeEventListener('mousedown', this.weg, true); },
};

// ---------------------------------------------------------------- Papierkorb
const Papierkorb = {
  oeffnen() { einfachesFenster('papierkorb', 'Papierkorb', 'papierkorb', 720, 520, (k) => { this.el = k; this.laden(); }, [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.laden() }, { id: 'leeren', symbol: 'muell', titel: 'Papierkorb leeren', tun: () => this.leeren() }]); },
  async laden() {
    const r = await M.papierkorb(); if (!this.el || !this.el.isConnected) return; leeren(this.el);
    this.el.append(el('h2', { text: 'Papierkorb' }), el('p', { klasse: 'unter', text: r.liste.length ? `${r.liste.length} Einträge. Gelöschtes vom Rechner landet hier, bis du den Papierkorb leerst.` : 'Der Papierkorb ist leer.' }));
    if (!r.liste.length) return;
    this.el.append(el('div', { klasse: 'ein-karte' }, r.liste.map((x) => E.reihe((x.ordner ? '📁 ' : '') + x.name, `${x.von || 'Ort unbekannt'}${x.geloescht ? ' · gelöscht ' + x.geloescht.replace('T', ' ').slice(0, 16) : ''}${x.ordner ? '' : ' · ' + groesse(x.groesse)}`,
      el('div', { stil: { display: 'flex', gap: '6px' } }, el('button', { klasse: 'knopf klein', text: 'Zurücklegen', onclick: async () => { const a = await M.papierkorbZurueck(x.name); a.ok ? hinweis('Zurückgelegt nach ' + a.pfad, 'ok') : hinweis(a.fehler, 'fehler'); this.laden(); } }),
        el('button', { klasse: 'knopf klein gefahr', text: 'Löschen', onclick: async () => { if (!await fragen('Endgültig löschen?', `«${x.name}» lässt sich danach nicht wiederherstellen.`, 'Löschen', true)) return; await M.papierkorbLeeren(x.name); this.laden(); } }))))));
  },
  async leeren() { if (!await fragen('Papierkorb leeren?', 'Alle Einträge werden endgültig gelöscht.', 'Leeren', true)) return; await M.papierkorbLeeren(); hinweis('Papierkorb geleert', 'ok'); this.laden(); },
};

// ---------------------------------------------------------------- Fotos
const Fotos = {
  liste: [], nr: 0, schau: null,
  oeffnen() { einfachesFenster('fotos', 'Fotos', 'fotos', 980, 660, (k) => { this.el = k; k.classList.add('fotos'); this.laden(); }, [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.laden() }, { id: 'ordner', symbol: 'ordner', titel: 'Ordner hinzufügen', tun: () => this.ordner() }, { id: 'schau', symbol: 'film', titel: 'Diashow', tun: () => this.zeigen(0, true) }]); },
  async laden() {
    leeren(this.el).append(leerText('Fotos werden eingelesen …'));
    const r = await M.fotos(); if (!this.el.isConnected) return; leeren(this.el); this.liste = r.liste || [];
    if (!this.liste.length) return this.el.append(leerText(`Keine Bilder gefunden. Lege Bilder in den Ordner «${lokalName(r.ordner[0])}» oder füge oben einen Ordner hinzu.`));
    const monate = new Map();
    this.liste.forEach((f, i) => { const d = new Date(f.zeit); const k = `${MONAT[d.getMonth()]} ${d.getFullYear()}`; if (!monate.has(k)) monate.set(k, []); monate.get(k).push(i); });
    this.el.append(el('p', { klasse: 'unter', text: `${this.liste.length} Bilder aus ${r.ordner.length} Ordner${r.ordner.length > 1 ? 'n' : ''}` }));
    for (const [name, nrn] of monate) this.el.append(el('h4', { klasse: 'fo-monat', text: name }), el('div', { klasse: 'fo-gitter' }, nrn.map((i) => el('button', { klasse: 'fo-bild', title: this.liste[i].name, onclick: () => this.zeigen(i) }, el('img', { src: this.liste[i].url, loading: 'lazy', decoding: 'async', alt: '' })))));
  },
  async ordner() { const r = await Z.einstellungen.ordnerWaehlen(); if (!r.ok) return; const o = [...new Set([...(Einst.daten.fotos?.ordner || []), r.pfad])]; await Einst.setzenAsync({ fotos: { ordner: o } }); this.laden(); },
  zeigen(i, schau = false) {
    if (!this.liste.length) return; this.nr = i; this.zu();
    const bild = el('img', { alt: '' }); const titel = el('span');
    const setze = () => { const f = this.liste[this.nr]; bild.src = f.url; titel.textContent = `${f.name} · ${datumZeit(f.zeit)} · ${groesse(f.groesse)}  (${this.nr + 1}/${this.liste.length})`; };
    const weiter = (d) => { this.nr = (this.nr + d + this.liste.length) % this.liste.length; setze(); };
    const e = el('div', { id: 'foto-gross', klasse: 'foto-gross' }, bild,
      el('div', { klasse: 'fg-leiste' }, titel, el('span', { stil: { flex: '1' } }),
        el('button', { klasse: 'knopf klein', text: '‹', onclick: () => weiter(-1) }), el('button', { klasse: 'knopf klein', text: '›', onclick: () => weiter(1) }),
        el('button', { klasse: 'knopf klein', text: this.schau ? 'Stopp' : 'Diashow', onclick: () => { const an = !this.schau; this.zeigen(this.nr, an); } }),
        el('button', { klasse: 'knopf klein', text: 'Als Hintergrund', onclick: async () => { await Einst.setzenAsync({ aussehen: { hintergrund: this.liste[this.nr].pfad, hintergrundArt: 'bild' } }); Schreibtisch.aussehenAnwenden(); hinweis('Hintergrund gesetzt', 'ok'); } }),
        el('button', { klasse: 'knopf klein', text: 'Im Ordner', onclick: () => { const p = this.liste[this.nr].pfad; this.zu(); Apps.finder.oeffnen({ quelle: 'lokal', pfad: p.slice(0, p.lastIndexOf('/')) }); } }),
        el('button', { klasse: 'knopf klein gefahr', text: 'Löschen', onclick: async () => { const f = this.liste[this.nr]; const a = await Z.lokal.loeschen(f.pfad, false); if (!a.ok) return hinweis(a.fehler, 'fehler'); this.liste.splice(this.nr, 1); if (!this.liste.length) { this.zu(); return this.laden(); } this.nr %= this.liste.length; setze(); hinweis('In den Papierkorb gelegt', 'ok'); } }),
        el('button', { klasse: 'knopf klein', text: 'Schliessen', onclick: () => { this.zu(); this.laden(); } })));
    this.taste = (ev) => { if (ev.key === 'ArrowRight') weiter(1); else if (ev.key === 'ArrowLeft') weiter(-1); else if (ev.key === 'Escape') this.zu(); };
    document.addEventListener('keydown', this.taste, true);
    $('#ebenen').append(e); FM.ueberlagernAn(); setze();
    if (schau) this.schau = setInterval(() => weiter(1), 4000);
  },
  zu() { clearInterval(this.schau); this.schau = null; const e = $('#foto-gross'); if (e) { e.remove(); FM.ueberlagernAus(); } document.removeEventListener('keydown', this.taste, true); },
};

// ---------------------------------------------------------------- Bildschirmfoto
const Foto = {
  oeffnen() {
    einfachesFenster('bildschirmfoto', 'Bildschirmfoto', 'kamera', 460, 380, (k) => {
      const auf = async (bereich, sek = 0) => { const f = FM.finden('bildschirmfoto'); if (f) f.minimieren(); await warte(sek * 1000 + 350); const r = await Z.sys.bildschirmfoto(bereich); if (f) f.wiederherstellen(); r.ok ? hinweis('Gespeichert und kopiert: ' + lokalName(r.pfad), 'ok') : hinweis(r.fehler || 'Abgebrochen', 'fehler'); };
      k.append(el('h2', { text: 'Bildschirmfoto' }), el('p', { klasse: 'unter', text: 'Das Bild landet im Ordner Bilder und in der Zwischenablage.' }),
        el('div', { klasse: 'ein-karte' }, E.reihe('Ganzer Bildschirm', 'Taste Druck', el('button', { klasse: 'knopf haupt', text: 'Aufnehmen', onclick: () => auf(false) })),
          E.reihe('Bereich auswählen', 'Umschalt + Druck oder Super + Umschalt + S. Mit der Maus einen Rahmen ziehen.', el('button', { klasse: 'knopf', text: 'Auswählen', onclick: () => auf(true) })),
          E.reihe('In 5 Sekunden', 'Zeit, um ein Menü zu öffnen.', el('button', { klasse: 'knopf', text: 'Starten', onclick: () => auf(false, 5) })),
          E.reihe('Aufnahmen ansehen', null, el('button', { klasse: 'knopf', text: 'Fotos öffnen', onclick: () => Fotos.oeffnen() }))));
    });
  },
};

// ---------------------------------------------------------------- Datenträger
const Datentraeger = {
  reiter: 'platten', pfad: null,
  oeffnen() { einfachesFenster('datentraeger', 'Datenträger', 'platte', 900, 640, (k) => { this.el = k; this.zeichnen(); }, [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.zeichnen() }]); },
  kopf() { return el('div', { klasse: 'mehr-reiter' }, [['platten', 'Platten und Partitionen'], ['analyse', 'Speicher-Analyse']].map(([id, n]) => el('button', { klasse: 'knopf' + (this.reiter === id ? ' haupt' : ''), text: n, onclick: () => { this.reiter = id; this.zeichnen(); } }))); },
  async zeichnen() { if (!this.el || !this.el.isConnected) return; leeren(this.el).append(this.kopf()); const k = el('div'); this.el.append(k); await this[this.reiter](k); },
  async platten(k) {
    k.append(leerText('Wird eingelesen …')); const r = await M.datentraeger(); leeren(k); if (!r.ok) return k.append(leerText(r.fehler));
    for (const p of r.platten) {
      const teile = p.teile.length ? p.teile : [p]; const summe = teile.reduce((a, t) => a + t.groesse, 0) || 1;
      const zeile = (t, tiefe = 0) => [E.reihe(`${'   '.repeat(tiefe)}${t.name}${t.label ? ' · ' + t.label : ''}`, [t.fs || (t.typ === 'crypt' ? 'entschlüsselt' : 'kein Dateisystem'), groesse(t.groesse), t.orte.length ? 'eingehängt: ' + t.orte.join(', ') : 'nicht eingehängt', t.benutzt ? `belegt ${groesse(t.benutzt)} (${prozent(t.benutzt, t.benutzt + t.frei)} %)` : '', t.uuid ? 'UUID ' + t.uuid : ''].filter(Boolean).join(' · '),
        t.fs && !['swap', 'crypto_LUKS', 'LVM2_member'].includes(t.fs) ? el('button', { klasse: 'knopf klein', text: t.orte.length ? 'Aushängen' : 'Einhängen', disabled: t.orte.some((o) => ['/', '/boot', '/boot/efi'].includes(o) || o.startsWith('/run/live')), onclick: async () => { const a = t.orte.length ? await M.aushaengen(t.pfad) : await M.einhaengen(t.pfad); a.ok ? hinweis(t.orte.length ? 'Ausgehängt' : (a.aus || 'Eingehängt').trim(), 'ok') : hinweis(a.fehler, 'fehler'); this.zeichnen(); } }) : null), ...(t.teile || []).flatMap((u) => zeile(u, tiefe + 1))];
      const smartKasten = el('pre', { klasse: 'dt-smart', hidden: true });
      k.append(el('div', { klasse: 'ein-block' }, el('h4', { text: `${p.modell || p.name} · ${groesse(p.groesse)}` }),
        el('p', { klasse: 'unter', text: [p.pfad, p.bus ? p.bus.toUpperCase() : '', p.dreht ? 'Festplatte (dreht)' : 'SSD/Flash', p.wechsel ? 'Wechselmedium' : 'fest eingebaut', p.tabelle ? 'Tabelle ' + p.tabelle.toUpperCase() : '', p.serie ? 'Seriennr. ' + p.serie : ''].filter(Boolean).join(' · ') }),
        el('div', { klasse: 'dt-balken' }, teile.map((t, i) => el('i', { title: `${t.name} · ${groesse(t.groesse)}`, stil: { flex: String(Math.max(0.02, t.groesse / summe)), background: `color-mix(in srgb, var(--akzent) ${90 - (i % 5) * 16}%, #223)` } }, el('span', { text: t.label || t.fs || t.name })))),
        el('div', { klasse: 'ein-karte' }, teile.flatMap((t) => zeile(t)), E.reihe('Zustand der Platte (SMART)', 'Liest Gesundheit, Temperatur und Fehlerzähler. Braucht das Administrator-Passwort.', el('button', { klasse: 'knopf klein', text: 'Prüfen', onclick: async () => { const a = await mitAdmin((pw) => M.smart(p.pfad, pw), 'Die Platte wird ausgelesen.'); smartKasten.hidden = false; smartKasten.textContent = a.ok || a.aus ? (a.aus || '').trim() || 'Keine Angaben.' : (a.fehler || 'Nicht lesbar'); } })), smartKasten)));
    }
  },
  async analyse(k) {
    const pfad = this.pfad || Schreibtisch.zustand.heim || '/'; k.append(leerText('Grössen werden berechnet … (grosse Ordner brauchen einen Moment)'));
    const r = await M.ordnerAnalyse(pfad); leeren(k); if (!r.ok) return k.append(leerText(r.fehler));
    const gehe = (p) => { this.pfad = p; this.zeichnen(); };
    k.append(el('div', { klasse: 'ein-block' }, el('h4', { text: r.pfad + ' · ' + groesse(r.gesamt) }),
      el('div', { stil: { display: 'flex', gap: '6px', marginBottom: '8px' } }, el('button', { klasse: 'knopf klein', text: '↑ Übergeordnet', disabled: r.pfad === '/', onclick: () => gehe(r.eltern) }), el('button', { klasse: 'knopf klein', text: 'Persönlicher Ordner', onclick: () => gehe(Schreibtisch.zustand.heim) }), el('button', { klasse: 'knopf klein', text: 'Ganzes System (/)', onclick: () => gehe('/') })),
      el('div', { klasse: 'ein-karte' }, r.liste.map((x) => el('button', { klasse: 'dt-zeile', onclick: () => gehe(x.pfad) }, el('span', { text: x.name }), el('div', { klasse: 'sy-balken' }, el('i', { stil: { width: prozent(x.groesse, r.gesamt) + '%' } })), el('b', { text: groesse(x.groesse) }))),
        r.dateienHier ? el('div', { klasse: 'dt-zeile' }, el('span', { text: 'Dateien direkt hier' }), el('div', { klasse: 'sy-balken' }, el('i', { stil: { width: prozent(r.dateienHier, r.gesamt) + '%' } })), el('b', { text: groesse(r.dateienHier) })) : null)));
  },
};

// ---------------------------------------------------------------- Sicherheits-Zentrale
const Sicherheit = {
  oeffnen() { einfachesFenster('sicherheit', 'Sicherheits-Zentrale', 'schild', 760, 640, (k) => { this.el = k; this.laden(); }, [{ id: 'neu', symbol: 'neu', titel: 'Neu prüfen', tun: () => this.laden() }]); },
  ZIEL: { firewall: () => Apps.einstellungen.oeffnen('firewall'), updates: () => Apps.einstellungen.oeffnen('updates'), anmeldung: () => Apps.einstellungen.oeffnen('anmeldung'), ruhe: () => Apps.einstellungen.oeffnen('ruhe'), tailscale: () => Apps.einstellungen.oeffnen('tailscale'), netzwaechter: () => Netzwaechter.oeffnen(), fernzugriff: () => Fernzugriff.oeffnen(), datentraeger: () => Datentraeger.oeffnen() },
  async laden() {
    leeren(this.el).append(leerText('Wird geprüft …')); const r = await M.sicherheit(); if (!this.el.isConnected) return; leeren(this.el);
    const TEXT = { gut: 'Alles in Ordnung', warnung: 'Es gibt Hinweise', schlecht: 'Handlungsbedarf' }; const ZEICHEN = { gut: '✓', warnung: '!', schlecht: '✕', info: 'i' };
    this.el.append(el('div', { klasse: 'si-kopf ' + r.note }, el('span', { klasse: 'si-rund', text: ZEICHEN[r.note] }), el('div', null, el('h2', { text: TEXT[r.note] }), el('p', { klasse: 'unter', text: `${r.punkte.filter((p) => p.zustand === 'gut').length} von ${r.punkte.length} Punkten sind gut.` }))),
      el('div', { klasse: 'ein-karte' }, r.punkte.map((p) => el('div', { klasse: 'ein-reihe si-punkt', daten: { id: p.id, zustand: p.zustand } }, el('span', { klasse: 'si-rund klein ' + p.zustand, text: ZEICHEN[p.zustand] }), el('div', { klasse: 'text' }, el('div', { klasse: 't', text: p.name }), el('div', { klasse: 'u', text: p.text })), p.bereich && this.ZIEL[p.bereich] ? el('button', { klasse: 'knopf klein', text: 'Öffnen', onclick: this.ZIEL[p.bereich] }) : null))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Werkzeuge' }), el('div', { klasse: 'ein-karte' }, E.reihe('Netzwerkwächter', 'Verbindungen, lauschende Dienste, neue Geräte im Netz.', el('button', { klasse: 'knopf klein', text: 'Öffnen', onclick: () => Netzwaechter.oeffnen() })), E.reihe('Sicherheitslabor', 'Werkzeuge zum Prüfen des eigenen Netzes und Systems.', el('button', { klasse: 'knopf klein', text: 'Öffnen', onclick: () => Labor.oeffnen() })))));
  },
};

// ---------------------------------------------------------------- Netzwerkwächter
const Netzwaechter = {
  timer: null,
  oeffnen() { einfachesFenster('netzwaechter', 'Netzwerkwächter', 'waechter', 860, 640, (k) => { this.el = k; this.laden(); clearInterval(this.timer); this.timer = setInterval(() => (this.el.isConnected ? this.laden() : clearInterval(this.timer)), 6000); }); },
  async laden() {
    const r = await M.netz(); if (!this.el.isConnected) return; const oben = this.el.scrollTop; leeren(this.el);
    const an = !!(Einst.daten.netzwaechter || {}).an;
    const proProg = new Map(); for (const v of r.verbindungen) { const n = v.name || 'unbekannt'; if (!proProg.has(n)) proProg.set(n, []); proProg.get(n).push(v); }
    this.el.append(el('h2', { text: 'Netzwerkwächter' }), el('p', { klasse: 'unter', text: 'Zeigt, welche Programme gerade mit wem sprechen, und meldet neue Geräte und neue lauschende Dienste.' }),
      el('div', { klasse: 'ein-karte' }, E.reihe('Wächter', an ? 'An. Meldet neue Geräte im Netz und neue Dienste, die auf Verbindungen warten.' : 'Aus.', E.schalter(an, (x) => { Einst.setzen({ netzwaechter: { an: x } }); })),
        E.reihe('Bekannte Geräte', `${r.bekannt} gemerkt. Nach dem Zurücksetzen gilt der jetzige Stand als bekannt.`, el('button', { klasse: 'knopf klein', text: 'Zurücksetzen', onclick: async () => { await M.netzVergessen(); hinweis('Zurückgesetzt', 'ok'); } }))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: `Aktive Verbindungen (${r.verbindungen.length})` }), proProg.size ? el('div', { klasse: 'ein-karte' }, [...proProg].sort((a, b) => b[1].length - a[1].length).map(([n, l]) => E.reihe(`${n} · ${l.length}`, [...new Set(l.map((v) => `${v.dort} (${v.art})`))].slice(0, 6).join(', ') + (l.length > 6 ? ' …' : ''), null))) : leerText('Keine Verbindungen nach aussen.')),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Lauschende Dienste' }), el('div', { klasse: 'ein-karte' }, r.lauscher.length ? r.lauscher.map((l) => E.reihe(`${l.art.toUpperCase()} ${l.port}${l.name ? ' · ' + l.name : ''}`, l.lokal ? 'nur dieser Rechner' : 'hört im Netz (' + l.hier + ') – erreichbar nur, wenn die Firewall es erlaubt', E.wert(l.lokal ? 'lokal' : 'Netz'))) : E.reihe('Keine', null, null))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: `Geräte im Netz (${r.nachbarn.length})` }), el('div', { klasse: 'ein-karte' }, r.nachbarn.length ? r.nachbarn.map((n) => E.reihe(n.ip, `${n.mac} · ${n.geraet} · ${n.zustand}`, null)) : E.reihe('Keine gesehen', 'Die Liste füllt sich, sobald der Rechner mit anderen Geräten spricht.', null))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Ereignisse' }), el('div', { klasse: 'ein-karte' }, r.ereignisse.length ? r.ereignisse.map((x) => E.reihe(x.text, datumZeit(x.zeit), null)) : E.reihe('Noch keine', null, null))));
    this.el.scrollTop = oben;
  },
};

// ---------------------------------------------------------------- Sicherheitslabor
const Labor = {
  WERKZEUGE: [
    { paket: 'nmap', name: 'nmap', text: 'Geräte und offene Ports im eigenen Netz finden.', da: true },
    { paket: 'lynis', name: 'Lynis', text: 'Prüft dieses System auf Schwachstellen in der Einrichtung.' },
    { paket: 'tcpdump', name: 'tcpdump', text: 'Netzwerkverkehr mitschneiden (Textmodus).' },
    { paket: 'wireshark', name: 'Wireshark', text: 'Netzwerkverkehr mitschneiden und auswerten (grafisch).' },
    { paket: 'rkhunter', name: 'rkhunter', text: 'Sucht nach bekannten Rootkits.' },
    { paket: 'clamav', name: 'ClamAV', text: 'Virenscanner für Dateien.' },
    { paket: 'nikto', name: 'Nikto', text: 'Prüft einen eigenen Webserver auf bekannte Schwächen.' },
  ],
  oeffnen() {
    einfachesFenster('labor', 'Sicherheitslabor', 'labor', 760, 620, (k) => {
      const term = (titel, befehl) => TerminalApp.oeffnen({ titel, befehl });
      k.append(el('h2', { text: 'Sicherheitslabor' }), el('p', { klasse: 'unter', text: 'Werkzeuge zum Lernen und zum Prüfen deiner eigenen Geräte. Fremde Netze und Geräte ohne Erlaubnis zu prüfen ist verboten.' }),
        el('div', { klasse: 'ein-block' }, el('h4', { text: 'Schnell prüfen' }), el('div', { klasse: 'ein-karte' },
          E.reihe('Eigenes Netz: wer ist da?', 'Findet die Geräte im Netz dieses Rechners (nmap -sn).', el('button', { klasse: 'knopf klein haupt', text: 'Starten', onclick: () => term('Netz-Übersicht', `netz=$(ip -o -4 route show scope link | awk '!/tailscale|docker/ {print $1; exit}'); echo "Prüfe $netz"; nmap -sn "$netz"; echo; read -p "Fertig. Eingabetaste schliesst." x`) })),
          E.reihe('Dieser Rechner: offene Ports', 'Prüft den eigenen Rechner von innen (nmap localhost).', el('button', { klasse: 'knopf klein', text: 'Starten', onclick: () => term('Eigene Ports', `nmap -sT -p- --min-rate 2000 localhost; echo; read -p "Fertig. Eingabetaste schliesst." x`) })),
          E.reihe('Ein eigenes Gerät genauer ansehen', 'Dienste und Versionen auf einem Gerät in deinem Netz.', el('button', { klasse: 'knopf klein', text: 'Adresse wählen', onclick: async () => { const a = await abfragen('Gerät prüfen', 'IP-Adresse eines eigenen Geräts (z. B. 192.168.1.20 oder die Tailscale-Adresse des Pi):', '', 'Prüfen'); if (!a || !/^[0-9a-fA-F.:]{3,45}$/.test(a.trim())) return a === null ? null : hinweis('Das ist keine IP-Adresse', 'fehler'); term('Gerät ' + a.trim(), `nmap -sV -T4 '${a.trim()}'; echo; read -p "Fertig. Eingabetaste schliesst." x`); } })),
          E.reihe('System-Audit', 'Lynis prüft die Einrichtung dieses Systems (muss installiert sein, braucht das Passwort).', el('button', { klasse: 'knopf klein', text: 'Starten', onclick: () => term('System-Audit', `command -v lynis >/dev/null || { echo "Lynis ist nicht installiert – unten installieren."; read x; exit; }; sudo lynis audit system --quick; read -p "Fertig. Eingabetaste schliesst." x`) })))),
        el('div', { klasse: 'ein-block' }, el('h4', { text: 'Werkzeuge' }), el('div', { klasse: 'ein-karte' }, this.WERKZEUGE.map((w) => E.reihe(w.name, w.text, w.da ? E.wert('vorinstalliert') : el('button', { klasse: 'knopf klein', text: 'Installieren', onclick: async () => { hinweis(w.name + ' wird installiert …'); const r = await root('paket-installieren', [w.paket], w.name + ' wird aus den Debian-Paketquellen installiert.'); r.ok ? hinweis(w.name + ' installiert', 'ok') : r.abgebrochen || hinweis(r.fehler || 'Fehlgeschlagen', 'fehler'); } }))))),
        el('p', { klasse: 'unter', text: 'Einen Honeypot (Lockvogel-Dienst) betreibst du besser auf dem Pi oder in einer virtuellen Maschine, nicht auf diesem Rechner.' }));
    });
  },
};

// ---------------------------------------------------------------- Fernzugriff
const Fernzugriff = {
  oeffnen() { einfachesFenster('fernzugriff', 'Fernzugriff', 'fern', 700, 560, (k) => { this.el = k; this.laden(); }); },
  async laden() {
    const r = await M.fernzugriff(); if (!this.el.isConnected) return; leeren(this.el);
    this.el.append(el('h2', { text: 'Fernzugriff' }), el('p', { klasse: 'unter', text: 'Zugriff auf diesen Rechner von deinen anderen Geräten. Alles ist aus, bis du es einschaltest. Die Sperre mit Code bleibt: aus der Ferne entsperren geht nicht.' }),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Konsole (SSH) – nur über Tailscale' }), el('div', { klasse: 'ein-karte' },
        E.reihe('SSH über Tailscale', r.tailscaleIp ? (r.ssh ? `An. Verbinden mit:  ssh ${r.benutzer}@${r.tailscaleIp}` : 'Aus. Beim Einschalten hört der Dienst nur auf der Tailscale-Adresse ' + r.tailscaleIp + '.') : 'Tailscale ist nicht verbunden. Zuerst unter Einstellungen → Tailscale anmelden.',
          E.schalter(r.ssh, async (x) => { const a = await mitAdmin((pw) => M.rootMehr('ssh-fern', [x ? 'an' : 'aus'], pw), 'Der SSH-Dienst wird ' + (x ? 'eingeschaltet' : 'ausgeschaltet') + '.'); a.ok ? hinweis('SSH ' + (x ? 'an' : 'aus'), 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); this.laden(); })),
        r.ssh && !r.nurTailscale ? E.reihe('Achtung', 'SSH läuft, ist aber nicht auf Tailscale beschränkt. Aus- und wieder einschalten behebt das.', null) : null)),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Bildschirm (RustDesk)' }), el('div', { klasse: 'ein-karte' },
        E.reihe('RustDesk', r.rustdesk ? 'Installiert. Starte es, um die Kennung zu sehen. Hinweis: Unter dieser Oberfläche (Wayland) ist die Bildschirmübertragung von RustDesk nicht getestet.' : 'Fernsteuerung des Bildschirms, auch vom Handy. Hinweis: unter dieser Oberfläche (Wayland) nicht getestet.',
          r.rustdesk ? el('button', { klasse: 'knopf klein', text: 'Starten', onclick: () => Z.sys.programmStarten('com.rustdesk.RustDesk') }) : el('button', { klasse: 'knopf klein', text: 'Installieren', onclick: async () => { hinweis('RustDesk wird installiert …'); const a = await Z.sys.flatpakInstallieren('com.rustdesk.RustDesk'); a.ok ? hinweis('RustDesk installiert', 'ok') : hinweis(a.fehler || 'Fehlgeschlagen', 'fehler'); this.laden(); } })))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Aus der Zentrale' }), el('div', { klasse: 'ein-karte' }, E.reihe('Sperren, Bildschirm aus/an, Schlafen', 'Diese Befehle kann die Zentrale auf dem Pi schicken, sobald der Rechner gekoppelt ist (Einstellungen → Anmeldung & Sperre).', null))));
  },
};

// ---------------------------------------------------------------- Fokusmodus
const Fokus = {
  stand: { aktiv: false }, timer: null,
  oeffnen() { einfachesFenster('fokus', 'Fokus', 'ziel', 640, 620, (k) => { this.el = k; this.laden(); }); },
  async holen() { this.stand = await M.fokusStand(); this.zeichnen(); return this.stand; },
  zeichnen() {
    let e = $('#tl-fokus'); const rechts = $('#dock .tl-rechts');
    if (!this.stand.aktiv) { if (e) e.remove(); clearInterval(this.timer); this.timer = null; return; }
    if (!rechts) return; if (!e) { e = el('button', { id: 'tl-fokus', klasse: 'tl-knopf tl-fokus', title: 'Fokus läuft', onclick: () => this.oeffnen() }); rechts.prepend(e); }
    const tick = () => { const rest = this.stand.bis - Date.now(); if (rest <= 0) { this.holen(); if (this.el && this.el.isConnected) this.laden(); return; } e.textContent = '◎ ' + dauer(rest); const u = $('#fokus-uhr'); if (u) u.textContent = dauer(rest); };
    tick(); if (!this.timer) this.timer = setInterval(tick, 1000);
  },
  async laden() {
    const s = await this.holen(); if (!this.el || !this.el.isConnected) return; leeren(this.el); const f = Einst.daten.fokus || {};
    const liste = (wert, speichern, platz) => { const t = el('textarea', { klasse: 'feld', rows: 5, placeholder: platz, stil: { width: '100%', resize: 'vertical' } }); t.value = (wert || []).join('\n'); t.addEventListener('change', () => speichern(t.value.split('\n').map((x) => x.trim()).filter(Boolean))); return t; };
    if (s.aktiv) {
      this.el.append(el('div', { klasse: 'fokus-gross' }, el('small', { text: s.streng ? 'Strenger Fokus läuft' : 'Fokus läuft' }), el('b', { id: 'fokus-uhr', text: dauer(s.bis - Date.now()) }),
        el('p', { klasse: 'unter', text: 'Die gesperrten Seiten sind nicht erreichbar, gesperrte Programme werden geschlossen. Die Sperre endet von selbst.' }),
        s.streng ? null : el('button', { klasse: 'knopf', text: 'Vorzeitig beenden …', onclick: async () => { const a = await mitAdmin((pw) => M.fokusEnde(pw), 'Fokus vorzeitig beenden.'); a.ok ? hinweis('Fokus beendet') : a.abgebrochen || hinweis(a.fehler, 'fehler'); this.laden(); } })));
      return this.zeichnen();
    }
    this.el.append(el('h2', { text: 'Fokus' }), el('p', { klasse: 'unter', text: 'Sperrt ablenkende Seiten für alle Browser auf diesem Rechner und schliesst ablenkende Programme, bis die Zeit um ist.' }),
      el('div', { klasse: 'ein-karte' }, E.reihe('Dauer', 'Minuten', E.auswahl(String(f.minuten || 50), [['25', '25'], ['50', '50'], ['90', '90'], ['120', '120'], ['180', '180']], (v) => Einst.setzen({ fokus: { minuten: Number(v) } }))),
        E.reihe('Streng', 'Lässt sich nicht vorzeitig beenden – auch nicht mit Passwort.', E.schalter(!!f.streng, (x) => Einst.setzen({ fokus: { streng: x } })))),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Gesperrte Seiten (eine pro Zeile)' }), liste(f.seiten, (l) => Einst.setzen({ fokus: { seiten: l } }), 'youtube.com')),
      el('div', { klasse: 'ein-block' }, el('h4', { text: 'Gesperrte Programme (Teil des Namens, eines pro Zeile)' }), liste(f.programme, (l) => Einst.setzen({ fokus: { programme: l } }), 'steam\ndiscord')),
      el('button', { klasse: 'knopf haupt', text: 'Fokus starten', stil: { marginTop: '10px' }, onclick: async () => { await warte(150); const a = await mitAdmin((pw) => M.fokusStart(pw), 'Fürs Sperren der Seiten wird die Datei /etc/hosts geändert.'); if (a.ok) { hinweis('Fokus läuft', 'ok'); this.laden(); } else a.abgebrochen || hinweis(a.fehler, 'fehler'); } }));
  },
};

// ---------------------------------------------------------------- Einstellungen: neue Bereiche
E.BEREICHE.splice(E.BEREICHE.findIndex((b) => b.id === 'aussehen') + 1, 0, { id: 'groesse', name: 'Grösse & Schrift', symbol: 'suche' });
E.BEREICHE.splice(E.BEREICHE.findIndex((b) => b.id === 'verhalten'), 0, { id: 'ruhe', name: 'Ruhe & Schlafen', symbol: 'mond' }, { id: 'bot', name: 'Bot-Wächter', symbol: 'roboter' }, { id: 'backup', name: 'Backup', symbol: 'sichern' }, { id: 'installation', name: 'Installation', symbol: 'platte' });
Object.assign(E, {
  groesse(i) {
    const a = Einst.daten.aussehen || {}; const t = TL();
    const s = (teil) => { Einst.setzen({ aussehen: teil }); Schreibtisch.aussehenAnwenden(); };
    const stufen = (wert, liste, tun) => el('div', { klasse: 'stufen' }, liste.map(([v, n]) => el('button', { klasse: 'knopf klein' + (Math.abs(Number(wert) - v) < 0.01 ? ' haupt' : ''), text: n, onclick: () => { tun(v); setTimeout(() => this.zeichnen(), 250); } })));
    this.kopf(i, 'Grösse & Schrift', 'Alles wird scharf neu gezeichnet, nicht als Bild vergrössert. Jede Grösse lässt sich einzeln einstellen.');
    i.append(this.block('Ganze Oberfläche', this.karte(this.reihe('Grösse', 'Schrift, Symbole, Fenster und Leisten zusammen.', stufen(a.skala ?? 1.25, [[1, '100 %'], [1.1, '110 %'], [1.25, '125 %'], [1.4, '140 %'], [1.5, '150 %'], [1.75, '175 %'], [2, '200 %']], (v) => s({ skala: v }))))),
      this.block('Einzeln', this.karte(
        this.reihe('Symbole auf dem Schreibtisch', null, stufen(a.symbolGroesse ?? 1.15, [[0.85, 'klein'], [1, 'normal'], [1.15, 'gross'], [1.35, 'grösser'], [1.6, 'riesig']], (v) => s({ symbolGroesse: v }))),
        this.reihe('Inhalt der Widgets', 'Die Fläche eines Widgets ziehst du an seiner Ecke.', stufen(a.widgetGroesse ?? 1, [[0.85, 'klein'], [1, 'normal'], [1.15, 'gross'], [1.3, 'grösser']], (v) => s({ widgetGroesse: v }))),
        this.reihe('Taskleiste', 'Höhe der Leiste samt Symbolen.', stufen(t.hoehe, [[44, 'klein'], [52, 'normal'], [60, 'gross'], [70, 'grösser']], (v) => { Einst.setzen({ taskleiste: { hoehe: v } }); Dock.bauen(); })),
        this.reihe('Schrift in Listen und Texten', null, stufen(a.schrift ?? 13, [[12, 'klein'], [13, 'normal'], [14.5, 'gross'], [16, 'grösser']], (v) => s({ schrift: v }))))),
      this.block('Andere Programme', this.karte(this.reihe('Browser, Obsidian und Co.', 'Fremde Programme folgen der Bildschirm-Skalierung unter Einstellungen → Anzeige. Ganze Stufen (100 %, 200 %) sind scharf, Zwischenstufen je nach Programm leicht weich.', el('button', { klasse: 'knopf klein', text: 'Anzeige öffnen', onclick: () => Apps.einstellungen.oeffnen('anzeige') })))));
  },
  ruhe(i) {
    const r = Einst.daten.ruhe || {}; const v = Einst.daten.verhalten || {}; const an = Einst.daten.anmeldung || {};
    this.kopf(i, 'Ruhe & Schlafen', 'Der Rechner läuft immer weiter. Nur der Bildschirm geht aus – wie ausgeschaltet. Zum Weiterarbeiten braucht es den Code.');
    const minuten = [['0', 'nie'], ['2', '2 Minuten'], ['5', '5 Minuten'], ['10', '10 Minuten'], ['15', '15 Minuten'], ['30', '30 Minuten'], ['60', '1 Stunde']];
    const t = el('textarea', { klasse: 'feld', rows: 4, stil: { width: '100%', resize: 'vertical' } }); t.value = (r.ausnahmen || []).join('\n'); t.addEventListener('change', () => Einst.setzen({ ruhe: { ausnahmen: t.value.split('\n').map((x) => x.trim()).filter(Boolean) } }));
    i.append(this.block('Bildschirm', this.karte(
        this.reihe('Bildschirm aus und sperren nach', 'Ohne Eingabe. Maus oder Taste schaltet den Bildschirm wieder ein, dann kommt die Code-Eingabe.', this.auswahl(String(r.bildschirmAusMin ?? 10), minuten, (x) => Einst.setzen({ ruhe: { bildschirmAusMin: Number(x) } }))),
        this.reihe('Nur sperren nach', 'Bildschirm bleibt an.', this.auswahl(String(an.autoSperrenMin ?? 0), minuten, (x) => Einst.setzen({ anmeldung: { autoSperrenMin: Number(x) } }))),
        this.reihe('Jetzt: Bildschirm aus und sperren', 'Programme laufen weiter.', el('button', { klasse: 'knopf', text: 'Bildschirm aus', onclick: () => Z.sperren({ bildschirmAus: true }) })))),
      this.block('Schlafen gehen', this.karte(this.reihe('Schlafen gehen', 'Schliesst alle Programme ausser den Ausnahmen, sperrt und schaltet den Bildschirm aus. Der Rechner läuft weiter.', el('button', { klasse: 'knopf haupt', text: 'Schlafen gehen', onclick: () => Schreibtisch.schlafen() }))),
        el('h4', { text: 'Ausnahmen: bleibt am Leben (Teil von Programmname oder Fenstertitel, eines pro Zeile)', stil: { marginTop: '12px' } }), t),
      this.block('Dauerbetrieb', this.karte(
        this.reihe('Ruhezustand des Rechners', 'Ist fest ausgeschaltet: der Rechner schläft nie von selbst ein, auch nicht beim Zuklappen.', this.wert('aus')),
        this.reihe('Nach dem Einschalten', v.beimStartSperren !== false ? 'Startet ohne Rückfrage bis zum Sperrbildschirm. Bot-Wächter und Backup laufen schon vor der Code-Eingabe.' : 'Startet ohne Sperre.', this.schalter(v.beimStartSperren !== false, (x) => Einst.setzen({ verhalten: { beimStartSperren: x } }))),
        this.reihe('Nach einem Stromausfall von selbst einschalten', 'Das stellt man in der Firmware des Rechners ein (HP: Advanced → Boot Options → «After Power Loss: Power On»). Der Knopf startet direkt in die Firmware.', el('button', { klasse: 'knopf klein', text: 'In die Firmware starten', onclick: async () => { if (!await fragen('In die Firmware starten?', 'Der Rechner startet neu und öffnet die UEFI-Einstellungen.', 'Neu starten', true)) return; const a = await root('energie', ['firmware'], 'Neustart in die Firmware.'); a.ok || a.abgebrochen || hinweis(a.fehler, 'fehler'); } })))));
  },
  async bot(i) {
    const b = Einst.daten.bot || {}; const s = (teil) => Einst.setzen({ bot: teil });
    this.kopf(i, 'Bot-Wächter', 'Schaut alle 30 Sekunden, ob dein Bot läuft. Fehlt er, wird er neu gestartet und du bekommst eine Meldung. Läuft auch bei gesperrtem Bildschirm.');
    const r = await M.botStand(); if (this.bereich !== 'bot') return;
    i.append(this.block(null, this.karte(
        this.reihe('Wächter', !b.an ? 'Aus.' : r.laeuft === true ? '✓ ' + b.name + ' läuft.' : r.laeuft === false ? '✕ ' + b.name + ' läuft nicht.' : 'Wird gleich geprüft.', this.schalter(!!b.an, async (x) => { await Einst.setzenAsync({ bot: { an: x } }); await M.botPruefen(); this.zeichnen(); })),
        this.reihe('Name', 'Für Meldungen.', this.textfeld(b.name || '', (v) => s({ name: v }))),
        this.reihe('Erkennen an', 'Teil der Befehlszeile des Programms, z. B. terminal64.exe für MetaTrader 5.', this.textfeld(b.muster || '', (v) => s({ muster: v }))),
        this.reihe('Startbefehl', 'Damit wird neu gestartet. Leer = nur melden. Höchstens fünf Versuche pro Stunde.', this.textfeld(b.start || '', (v) => s({ start: v }), { breit: true, platzhalter: 'z. B. /opt/zentraleos/erweiterungen/mt5-starten.sh' })))),
      this.block('Meldung aufs Handy', this.karte(
        this.reihe('Melde-Adresse', 'Eine Adresse, an die der Text geschickt wird (POST). Passt zu ntfy: https://ntfy.sh/dein-geheimes-thema – oder eine eigene ntfy-Instanz auf dem Pi.', this.textfeld(b.meldeAdresse || '', (v) => s({ meldeAdresse: v }), { breit: true, platzhalter: 'https://…' })),
        this.reihe('Testen', null, el('button', { klasse: 'knopf klein', text: 'Testmeldung schicken', onclick: async () => { const a = await M.meldeTest(); a.ok ? hinweis('Gesendet', 'ok') : hinweis(a.fehler, 'fehler'); } })))),
      this.block('Offene Positionen', this.karte(this.reihe('Updates zurückhalten', r.positionenOffen ? 'Markierung gesetzt: automatische Updates sind ausgesetzt.' : 'Legt dein Bot bei offenen Positionen die Datei ~/.config/ZentraleOS/positionen-offen an, laufen keine automatischen Updates. Er löscht sie, wenn alles zu ist.', this.wert(r.positionenOffen ? 'gesetzt' : 'nicht gesetzt')))),
      this.block('Protokoll', this.karte(...(r.protokoll.length ? r.protokoll.map((p) => this.reihe(p.text, datumZeit(p.zeit), null)) : [this.reihe('Noch nichts', null, null)]))));
  },
  backup(i) {
    const b = Einst.daten.backup || {}; const s = (teil) => Einst.setzen({ backup: teil });
    this.kopf(i, 'Backup', 'Sichert gewählte Ordner auf den Pi (rsync über SSH, am besten über Tailscale). Gelöschtes wird auch im Backup gelöscht – es ist ein Spiegel.');
    const t = el('textarea', { klasse: 'feld', rows: 3, stil: { width: '100%', resize: 'vertical' } }); t.value = (b.ordner || []).join('\n'); t.addEventListener('change', () => s({ ordner: t.value.split('\n').map((x) => x.trim()).filter(Boolean) }));
    const schl = el('pre', { klasse: 'dt-smart', hidden: true });
    i.append(this.block('Ziel', this.karte(
        this.reihe('Ziel', 'Form: benutzer@rechner:/pfad – z. B. kerim@homelabkerim:/mnt/daten/backup/hp', this.textfeld(b.ziel || '', (v) => s({ ziel: v.trim() }), { breit: true, platzhalter: 'benutzer@rechner:/pfad' })),
        this.reihe('Schlüssel für den Pi', 'Einmalig: Diesen Schlüssel auf dem Pi in ~/.ssh/authorized_keys eintragen. Dann braucht das Backup kein Passwort.', el('button', { klasse: 'knopf klein', text: 'Schlüssel zeigen', onclick: async () => { const a = await M.backupSchluessel(); schl.hidden = false; schl.textContent = a.ok ? a.schluessel : a.fehler; if (a.ok) { Z.system.kopieren(a.schluessel); hinweis('Schlüssel kopiert', 'ok'); } } })), schl)),
      this.block('Ordner (einer pro Zeile, im persönlichen Ordner oder als voller Pfad)', t),
      this.block('Zeitplan', this.karte(
        this.reihe('Jeden Tag sichern', null, this.schalter(!!b.taeglich, (x) => s({ taeglich: x }))),
        this.reihe('Uhrzeit', null, this.auswahl(String(b.stunde ?? 3), Array.from({ length: 24 }, (_, h) => [String(h), zweiStellig(h) + ':00']), (v) => s({ stunde: Number(v) }))),
        this.reihe('Letztes Backup', b.zuletzt ? `${datumZeit(new Date(b.zuletzt).getTime())} · ${b.ergebnis === 'ok' ? 'erfolgreich' : 'Fehler: ' + b.ergebnis}` : 'Noch keines.', el('button', { klasse: 'knopf haupt', text: 'Jetzt sichern', onclick: async (ev) => { ev.target.disabled = true; hinweis('Backup läuft …'); const a = await M.backupJetzt(); a.ok ? hinweis('Backup fertig', 'ok') : hinweis(a.fehler, 'fehler'); const neu = await Z.einstellungen.alle(); if (neu.ok) Einst.daten = neu.einstellungen; this.zeichnen(); } })))));
  },
  async installation(i) {
    this.kopf(i, 'Installation', 'Installiert ZentraleOS fest auf eine Platte dieses Rechners. Danach startet er ohne Stick.');
    const r = await M.installPlatten(); if (this.bereich !== 'installation') return;
    if (!r.live) return i.append(this.block(null, this.karte(this.reihe('Schon installiert', 'Dieses System läuft von der Platte. Die Installation gibt es nur im Live-System vom Stick.', this.wert('✓')))));
    if (!r.uefi) return i.append(this.block(null, this.karte(this.reihe('Nicht möglich', 'Der Rechner wurde nicht im UEFI-Modus gestartet.', null))));
    const ziele = r.platten.filter((p) => !p.live && p.groesse >= 15e9);
    const k = { geraet: ziele[0]?.pfad || '', name: 'kerim', passwort: '', passwort2: '', verschluesselung: '', luks: false, code: '' };
    const feld = (typ, platz, setzen) => { const f = el('input', { klasse: 'feld', type: typ, placeholder: platz, stil: { width: '230px' } }); f.addEventListener('input', () => setzen(f.value)); return f; };
    const nameFeld = feld('text', 'benutzername', (v) => { k.name = v.trim(); }); nameFeld.value = k.name;
    const luksFeld = feld('password', 'Passwort für die Verschlüsselung', (v) => { k.verschluesselung = v; }); const luksReihe = this.reihe('Verschlüsselungs-Passwort', 'Wird bei JEDEM Start am Gerät abgefragt. Nach einem Stromausfall startet der Rechner dann nicht allein durch – für einen Bot-Rechner darum besser aus lassen.', luksFeld); luksReihe.hidden = true;
    const stand = el('pre', { klasse: 'dt-smart', hidden: true });
    i.append(this.block('Ziel', el('div', { klasse: 'ein-karte' }, ziele.length ? ziele.map((p, n) => { const radio = el('input', { type: 'radio', name: 'inst-platte', checked: n === 0 }); radio.addEventListener('change', () => { k.geraet = p.pfad; }); return this.reihe(`${p.modell} · ${groesse(p.groesse)}`, `${p.pfad}${p.bus ? ' · ' + p.bus.toUpperCase() : ''}${p.wechsel ? ' · Wechselmedium' : ''}${p.inhalt ? ' · enthält: ' + p.inhalt : ' · leer'}`, radio); }) : [this.reihe('Keine passende Platte gefunden', 'Es braucht eine Platte mit mindestens 15 GB, die nicht der Start-Stick ist.', null)])),
      this.block('Benutzer', this.karte(this.reihe('Benutzername', 'Kleinbuchstaben, Ziffern, Bindestrich.', nameFeld), this.reihe('Passwort', 'Das Administrator-Passwort des neuen Systems. Mindestens 4 Zeichen.', feld('password', 'Passwort', (v) => { k.passwort = v; })), this.reihe('Passwort wiederholen', null, feld('password', 'Passwort', (v) => { k.passwort2 = v; })), this.reihe('Code für die Sperre', 'Den gibst du ein, wenn der Bildschirm gesperrt ist. 4 bis 12 Ziffern oder Buchstaben. Später änderbar unter Anmeldung & Sperre.', feld('password', 'Code', (v) => { k.code = v.trim(); })))),
      this.block('Verschlüsselung', this.karte(this.reihe('Platte verschlüsseln', 'Schützt die Daten, wenn jemand den Rechner mitnimmt.', this.schalter(false, (x) => { k.luks = x; luksReihe.hidden = !x; })), luksReihe)),
      this.block(null, this.karte(this.reihe('Installieren', 'Die gewählte Platte wird VOLLSTÄNDIG GELÖSCHT – auch Windows und alle Daten darauf.', el('button', { klasse: 'knopf gefahr', id: 'inst-start', text: 'Installieren …', disabled: !ziele.length, onclick: async (ev) => {
        if (!/^[a-z][a-z0-9-]{0,30}$/.test(k.name)) return hinweis('Benutzername: Kleinbuchstaben, Ziffern, Bindestrich', 'fehler');
        if (k.passwort.length < 4) return hinweis('Das Passwort braucht mindestens 4 Zeichen', 'fehler'); if (k.passwort !== k.passwort2) return hinweis('Die Passwörter sind nicht gleich', 'fehler');
        if (!/^[0-9A-Za-z]{4,12}$/.test(k.code)) return hinweis('Der Code braucht 4 bis 12 Ziffern oder Buchstaben', 'fehler');
        if (k.luks && k.verschluesselung.length < 8) return hinweis('Das Verschlüsselungs-Passwort braucht mindestens 8 Zeichen', 'fehler');
        const p = ziele.find((x) => x.pfad === k.geraet); const a = await dialog({ titel: 'Platte wirklich löschen?', text: `«${p.modell}» (${groesse(p.groesse)}, ${p.pfad}) wird vollständig gelöscht${p.inhalt ? ' – samt ' + p.inhalt : ''}. Das lässt sich nicht rückgängig machen.\n\nZum Bestätigen LÖSCHEN eintippen.`, felder: [{ platzhalter: 'LÖSCHEN' }], okText: 'Löschen und installieren', gefahr: true });
        if (!a || a[0] !== 'LÖSCHEN') return a && hinweis('Nicht bestätigt – nichts geändert', 'info');
        ev.target.disabled = true; stand.hidden = false; stand.textContent = 'Startet …';
        const t = setInterval(async () => { const s = await M.installStand(); if (s.zeilen.length) stand.textContent = s.zeilen.join('\n'); }, 2000);
        const e = await mitAdmin((pw) => M.installieren({ geraet: k.geraet, name: k.name, passwort: k.passwort, verschluesselung: k.luks ? k.verschluesselung : '', code: k.code }, pw), 'Die Installation braucht das Administrator-Passwort des Live-Systems (zentrale).');
        clearInterval(t); const s = await M.installStand(); if (s.zeilen.length) stand.textContent = s.zeilen.join('\n'); ev.target.disabled = false;
        if (e.ok) await melden('Installation fertig', 'ZentraleOS ist installiert. Fahre den Rechner herunter, zieh den Stick ab und schalte wieder ein. Am Sperrbildschirm gilt dein neuer Code. Das System startet im Demo-Modus (Testdaten); ausschalten unter Einstellungen → Zentrale.'); else e.abgebrochen || hinweis('Installation fehlgeschlagen: ' + (e.fehler || 'siehe Protokoll'), 'fehler');
      } })), stand)));
  },
});
{ // Über: der Installations-Knopf führt zum neuen Bereich; Updates: Wartungsfenster
  const alt = E.ueber; E.ueber = async function (i) { await alt.call(this, i); const k = [...i.querySelectorAll('button')].find((b) => b.textContent === 'Installieren'); if (k) { const neu = k.cloneNode(true); neu.addEventListener('click', () => Apps.einstellungen.oeffnen('installation')); k.replaceWith(neu); const u = neu.closest('.ein-reihe')?.querySelector('.u'); if (u) u.textContent = 'Öffnet die Installation: Platte wählen, Benutzer anlegen, fertig.'; } };
  const altU = E.updates; if (altU) E.updates = async function (i) {
    await altU.call(this, i); if (this.bereich !== 'updates') return; const u = Einst.daten.updates || {};
    const setze = async (teil) => { const n = { ...u, ...teil }; const a = await mitAdmin((pw) => M.rootMehr('update-fenster', n.fenster ? [n.tag, String(n.stunde)] : ['aus'], pw), 'Der Zeitplan der automatischen Updates wird geändert.'); if (a.ok) { Einst.setzen({ updates: n }); hinweis('Gespeichert', 'ok'); } else a.abgebrochen || hinweis(a.fehler, 'fehler'); this.zeichnen(); };
    i.append(this.block('Wartungsfenster', this.karte(this.reihe('Automatische Updates nur im Wartungsfenster', 'Einmal pro Woche zur gewählten Zeit, und nie, solange dein Bot offene Positionen meldet (siehe Bot-Wächter). Neu gestartet wird nie von selbst.', this.schalter(u.fenster !== false, (x) => setze({ fenster: x }))),
      this.reihe('Tag', null, this.auswahl(u.tag || 'Sat', [['Sat', 'Samstag'], ['Sun', 'Sonntag'], ['Mon', 'Montag'], ['Tue', 'Dienstag'], ['Wed', 'Mittwoch'], ['Thu', 'Donnerstag'], ['Fri', 'Freitag']], (v) => setze({ tag: v }))),
      this.reihe('Uhrzeit', null, this.auswahl(String(u.stunde ?? 10), Array.from({ length: 24 }, (_, h) => [String(h), zweiStellig(h) + ':00']), (v) => setze({ stunde: Number(v) }))))));
  };
}

// ---------------------------------------------------------------- Einhängen: Apps, Startmenü, Kürzel, Energie
Object.assign(Apps, {
  fotos: { name: 'Fotos', symbol: 'fotos', fensterId: 'fotos', farbe: 'linear-gradient(160deg,#f472b6,#be185d)', oeffnen: () => Fotos.oeffnen() },
  papierkorb: { name: 'Papierkorb', symbol: 'papierkorb', fensterId: 'papierkorb', farbe: 'linear-gradient(160deg,#94a3b8,#475569)', oeffnen: () => Papierkorb.oeffnen() },
  bildschirmfoto: { name: 'Bildschirmfoto', symbol: 'kamera', fensterId: 'bildschirmfoto', farbe: 'linear-gradient(160deg,#fbbf24,#b45309)', oeffnen: () => Foto.oeffnen() },
  datentraeger: { name: 'Datenträger', symbol: 'platte', fensterId: 'datentraeger', farbe: 'linear-gradient(160deg,#a3a3a3,#404040)', oeffnen: () => Datentraeger.oeffnen() },
  sicherheit: { name: 'Sicherheit', symbol: 'schild', fensterId: 'sicherheit', farbe: 'linear-gradient(160deg,#34d399,#047857)', oeffnen: () => Sicherheit.oeffnen() },
  netzwaechter: { name: 'Netzwerkwächter', symbol: 'waechter', fensterId: 'netzwaechter', farbe: 'linear-gradient(160deg,#38bdf8,#1d4ed8)', oeffnen: () => Netzwaechter.oeffnen() },
  labor: { name: 'Sicherheitslabor', symbol: 'labor', fensterId: 'labor', farbe: 'linear-gradient(160deg,#c084fc,#7e22ce)', oeffnen: () => Labor.oeffnen() },
  fernzugriff: { name: 'Fernzugriff', symbol: 'fern', fensterId: 'fernzugriff', farbe: 'linear-gradient(160deg,#fb923c,#c2410c)', oeffnen: () => Fernzugriff.oeffnen() },
  fokusmodus: { name: 'Fokus', symbol: 'ziel', fensterId: 'fokus', farbe: 'linear-gradient(160deg,#f87171,#b91c1c)', oeffnen: () => Fokus.oeffnen() },
});
Software.EMPFOHLEN.unshift({ id: 'com.brave.Browser', name: 'Brave', beschreibung: 'Webbrowser mit Werbeblocker (ist im System schon dabei, falls der Bau ihn laden konnte)' }, { id: 'net.ankiweb.Anki', name: 'Anki', beschreibung: 'Karteikarten zum Lernen, z. B. für die Berufsmatura' }, { id: 'com.bitwarden.desktop', name: 'Bitwarden', beschreibung: 'Passwort-Manager' });
Software.EMPFOHLEN.push({ id: 'com.rustdesk.RustDesk', name: 'RustDesk', beschreibung: 'Fernzugriff auf den Bildschirm' }, { id: 'org.wireshark.Wireshark', name: 'Wireshark', beschreibung: 'Netzwerkverkehr auswerten' }, { id: 'org.keepassxc.KeePassXC', name: 'KeePassXC', beschreibung: 'Passwort-Manager ohne Cloud' });

Schreibtisch.schlafen = async function () {
  if (!await fragen('Schlafen gehen?', 'Alle Programme werden geschlossen – ausser den Ausnahmen (Einstellungen → Ruhe & Schlafen). Der Rechner läuft weiter, der Bildschirm geht aus. Nicht Gespeichertes geht verloren.', 'Schlafen gehen', true)) return;
  const r = await M.schlafen(); if (r && r.geblieben && r.geblieben.length) hinweis('Läuft weiter: ' + r.geblieben.join(', '));
};
Schreibtisch.energie = async function (was) {
  if (!await fragen(was === 'neustart' ? 'Neu starten?' : 'Ausschalten?', 'Alle Programme werden beendet, auch ein laufender Bot. Nicht gespeicherte Daten gehen verloren.', was === 'neustart' ? 'Neu starten' : 'Ausschalten', true)) return;
  let r = await M.energie(was);
  if (!r.ok) r = await root('energie', [was], 'Der Rechner wird ' + (was === 'neustart' ? 'neu gestartet' : 'ausgeschaltet') + '.');
  r.ok || r.abgebrochen || hinweis(r.fehler, 'fehler');
};
Schreibtisch.ausschaltenMenue = function (knopf) {
  const r = knopf.getBoundingClientRect();
  kontextmenue(r.left - 110, r.top - 250, [{ titel: 'Der Rechner bleibt an' }, { text: 'Sperren', kuerzel: 'Super L', tun: () => Z.sperren({ bildschirmAus: false }) }, { text: 'Bildschirm aus & sperren', tun: () => Z.sperren({ bildschirmAus: true }) }, { text: 'Schlafen gehen …', tun: () => this.schlafen() }, '-',
    { text: 'Alle Fenster schliessen', tun: () => FM.schliessenAlle() }, { text: 'Oberfläche neu starten', tun: () => Z.system.neustart() }, '-', { titel: 'Der Rechner geht aus' }, { text: 'Neu starten …', tun: () => this.energie('neustart') }, { text: 'Ausschalten …', tun: () => this.energie('aus') }]);
};

{ // Symbole und Widgets nie ausserhalb des Bildschirms (z. B. nach einer anderen Grösse der Oberfläche)
  const alt = Schreibtischflaeche.zeichnen;
  const einpassen = () => { const w = $('#flaeche'); if (!w) return; const B = w.clientWidth; const H = w.clientHeight; if (!B || !H) return;
    for (const k of w.children) { if (k.offsetLeft + k.offsetWidth > B) k.style.left = Math.max(0, B - k.offsetWidth - 8) + 'px'; if (k.offsetTop + k.offsetHeight > H) k.style.top = Math.max(0, H - k.offsetHeight - 8) + 'px'; } };
  Schreibtischflaeche.zeichnen = function (...a) { const r = alt.apply(this, a); requestAnimationFrame(einpassen); return r; };
  window.addEventListener('resize', entprellen(einpassen, 150));
}

{ // Grössen anwenden
  const alt = Schreibtisch.aussehenAnwenden;
  Schreibtisch.aussehenAnwenden = function () { alt.call(this); const a = Einst.daten.aussehen || {}; const w = document.documentElement.style; w.setProperty('--symbol-gr', String(a.symbolGroesse ?? 1.15)); w.setProperty('--widget-gr', String(a.widgetGroesse ?? 1)); document.body.classList.toggle('eigener-code', !!(Einst.daten.anmeldung || {}).eigenerCode); };
}

window.addEventListener('DOMContentLoaded', () => {
  Z.auf('befehl', (b) => {
    if (b === 'alleSchliessen') { Fotos.zu(); Wechsler.uebersichtZu(); return FM.schliessenAlle(); }
    if (!$('#sperre').hidden) return;
    if (b === 'wechsler') Wechsler.schritt(1); else if (b === 'wechsler-zurueck') Wechsler.schritt(-1); else if (b === 'uebersicht') Wechsler.uebersicht();
    else if (b === 'zwischenablage') Ablage.oeffnen(); else if (b === 'terminal') TerminalApp.oeffnen();
    else if (b === 'desktop-rechts') Arbeit.schritt(1); else if (b === 'desktop-links') Arbeit.schritt(-1);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#sperre').hidden) return;
    if (e.altKey && e.key === 'Tab') { e.preventDefault(); Wechsler.schritt(e.shiftKey ? -1 : 1); }
    else if (e.metaKey && e.key === 'Tab') { e.preventDefault(); Wechsler.uebersicht(); }
    else if (e.metaKey && e.key.toLowerCase() === 'v') { e.preventDefault(); Ablage.oeffnen(); }
    else if (e.ctrlKey && e.metaKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); Arbeit.schritt(e.key === 'ArrowRight' ? 1 : -1); }
    else if (e.key === 'Escape') { Wechsler.uebersichtZu(); Ablage.zu(); }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === 'Alt' && Wechsler.liste) Wechsler.fertig(); }, true);
  // Gesperrt und Bildschirm disabled: jede Eingabe schaltet den Bildschirm wieder ein (entsperrt nicht).
  let zuletzt = 0; const wecken = () => { if ($('#sperre').hidden) return; const j = Date.now(); if (j - zuletzt < 1500) return; zuletzt = j; Z.system.bildschirmAn(); };
  for (const art of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(art, wecken, true);
  setTimeout(() => { Schreibtisch.aussehenAnwenden(); Arbeit.zeichnen(); Fokus.holen(); }, 300);
});
