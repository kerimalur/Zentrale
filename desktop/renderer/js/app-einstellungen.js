// Einstellungen: Anmeldebildschirm, Aussehen, Verhalten, Verbindung, Finder, Freigaben.
const EinstellungenApp = {
  fenster: null, bereich: 'anmeldung', inhalt: null, seite: null,

  BEREICHE: [
    { id: 'anmeldung', name: 'Anmeldung', symbol: 'schloss' },
    { id: 'aussehen', name: 'Aussehen', symbol: 'bild' },
    { id: 'verhalten', name: 'Verhalten', symbol: 'strom' },
    { id: 'verbindung', name: 'Verbindung', symbol: 'pi' },
    { id: 'finder', name: 'Finder', symbol: 'finder' },
    { id: 'freigaben', name: 'Geteilte Links', symbol: 'teilen' },
    { id: 'ueber', name: 'Über', symbol: 'info' },
  ],

  oeffnen(bereich = null) {
    if (bereich) this.bereich = bereich;
    if (FM.finden('einstellungen')) { FM.oeffnen({ id: 'einstellungen' }); this.zeichnen(); return; }
    this.fenster = FM.oeffnen({
      id: 'einstellungen', appId: 'einstellungen', titel: 'Einstellungen', symbol: 'einstellungen',
      breite: 860, hoehe: 620, minBreite: 560, minHoehe: 400,
      aufbauen: (inhalt) => {
        this.seite = el('div', { klasse: 'ein-seite' });
        this.inhalt = el('div', { klasse: 'ein-haupt' });
        inhalt.append(el('div', { klasse: 'ein' }, this.seite, this.inhalt));
        this.zeichnen();
      },
      beimSchliessen: () => { this.fenster = null; return true; },
    });
  },

  zeichnen() {
    const s = leeren(this.seite);
    for (const b of this.BEREICHE) {
      s.append(el('button', {
        klasse: 'f-ort' + (this.bereich === b.id ? ' aktiv' : ''),
        onclick: () => { this.bereich = b.id; this.zeichnen(); },
      }, el('span', { html: symbol(b.symbol) }).firstElementChild, el('span', { klasse: 'name', text: b.name })));
    }
    const i = leeren(this.inhalt);
    const bauen = {
      anmeldung: () => this.anmeldung(i),
      aussehen: () => this.aussehen(i),
      verhalten: () => this.verhalten(i),
      verbindung: () => this.verbindung(i),
      finder: () => this.finder(i),
      freigaben: () => this.freigaben(i),
      ueber: () => this.ueber(i),
    }[this.bereich];
    bauen && bauen();
  },

  // ---------- Bausteine ----------
  karte(...reihen) { return el('div', { klasse: 'ein-karte' }, reihen.filter(Boolean)); },
  block(titel, ...kinder) { return el('div', { klasse: 'ein-block' }, titel ? el('h4', { text: titel }) : null, kinder.filter(Boolean)); },
  reihe(titel, unter, steuerung) {
    return el('div', { klasse: 'ein-reihe' },
      el('div', { klasse: 'text' }, el('div', { klasse: 't', text: titel }), unter ? el('div', { klasse: 'u', text: unter }) : null),
      steuerung);
  },
  schalter(an, tun) {
    const s = el('button', { klasse: 'schalter' + (an ? ' an' : '') });
    s.addEventListener('click', () => { const neu = !s.classList.contains('an'); s.classList.toggle('an', neu); tun(neu); });
    return s;
  },
  textfeld(wert, tun, { breit = false, typ = 'text', platzhalter = '' } = {}) {
    const f = el('input', { klasse: 'feld' + (breit ? ' breit' : ''), type: typ, value: wert ?? '', placeholder: platzhalter });
    f.addEventListener('change', () => tun(f.value));
    return f;
  },
  auswahl(wert, moeglich, tun) {
    const s = el('select', { klasse: 'feld' });
    for (const [v, t] of moeglich) s.append(el('option', { value: v, selected: v === wert }, t));
    s.addEventListener('change', () => tun(s.value));
    return s;
  },
  regler(wert, min, max, tun) {
    const anzeige = el('span', { stil: { width: '38px', textAlign: 'right', fontSize: '12px', color: 'var(--text-sehr-leise)' }, text: String(wert) });
    const r = el('input', { type: 'range', min, max, value: wert });
    r.addEventListener('input', () => { anzeige.textContent = r.value; });
    r.addEventListener('change', () => tun(Number(r.value)));
    return el('div', { stil: { display: 'flex', alignItems: 'center', gap: '8px' } }, r, anzeige);
  },

  // ---------- Bereiche ----------
  anmeldung(i) {
    const e = Einst.daten.anmeldung;
    const s = (teil) => Einst.setzen({ anmeldung: teil });
    i.append(el('h2', { text: 'Anmeldung' }),
      el('p', { klasse: 'unter', text: 'So sieht der Bildschirm aus, wenn der HP gesperrt ist. Angemeldet wird mit dem Zentrale-Passwort und, falls eingeschaltet, dem 2FA-Code. Es gibt keinen Benutzernamen.' }));

    const vorschau = el('div', { klasse: 'ein-vorschau' });
    this.vorschauSetzen(vorschau, e);

    i.append(this.block('Aussehen des Sperrbildschirms',
      vorschau,
      this.karte(
        this.reihe('Hintergrund', 'Eigenes Bild, einfarbig oder der eingebaute Verlauf.',
          el('div', { stil: { display: 'flex', gap: '8px', alignItems: 'center' } },
            this.auswahl(e.hintergrundArt, [['verlauf', 'Verlauf'], ['bild', 'Bild'], ['farbe', 'Farbe']], (v) => { s({ hintergrundArt: v }); this.zeichnen(); }),
            e.hintergrundArt === 'bild' ? el('button', { klasse: 'knopf', onclick: async () => {
              const r = await Z.einstellungen.bildWaehlen();
              if (r.ok) { s({ hintergrund: r.pfad }); this.zeichnen(); }
            } }, 'Bild wählen') : null,
            e.hintergrundArt === 'farbe' ? el('input', { klasse: 'farbfeld', type: 'color', value: e.farbe || '#0b1220', onchange: (ev) => { s({ farbe: ev.target.value }); this.zeichnen(); } }) : null,
          )),
        e.hintergrundArt === 'bild' && e.hintergrund ? this.reihe('Gewähltes Bild', e.hintergrund, el('button', { klasse: 'knopf klein', onclick: () => { s({ hintergrund: '' }); this.zeichnen(); } }, 'Entfernen')) : null,
        this.reihe('Weichzeichnen', 'Wie stark der Hintergrund unscharf wird, sobald das Passwortfeld erscheint.',
          this.regler(e.weichzeichnen, 0, 60, (v) => { s({ weichzeichnen: v }); })),
        this.reihe('Uhr zeigen', null, this.schalter(e.uhrZeigen, (v) => s({ uhrZeigen: v }))),
        this.reihe('Datum zeigen', null, this.schalter(e.datumZeigen, (v) => s({ datumZeigen: v }))),
      )));

    i.append(this.block('Benutzer',
      this.karte(
        this.reihe('Angezeigter Name', 'Steht unter dem Bild – rein kosmetisch, es gibt keinen Benutzernamen beim Anmelden.',
          this.textfeld(e.benutzerName, (v) => s({ benutzerName: v }))),
        this.reihe('Untertitel', 'Zum Beispiel «Zentrale · HP».', this.textfeld(e.untertitel, (v) => s({ untertitel: v }))),
        this.reihe('Profilbild', e.avatar || 'Ohne Bild wird der erste Buchstabe gezeigt.',
          el('div', { stil: { display: 'flex', gap: '8px' } },
            el('button', { klasse: 'knopf', onclick: async () => { const r = await Z.einstellungen.bildWaehlen(); if (r.ok) { s({ avatar: r.pfad }); this.zeichnen(); } } }, 'Wählen'),
            e.avatar ? el('button', { klasse: 'knopf', onclick: () => { s({ avatar: '' }); this.zeichnen(); } }, 'Entfernen') : null)),
      )));

    i.append(this.block('Sicherheit',
      this.karte(
        this.reihe('Anmelden ohne Pi erlauben', 'Ist der Pi nicht erreichbar, kann man sich mit dem zuletzt genutzten Passwort anmelden – ohne 2FA-Code. Aus: ohne Pi kommt niemand rein, auch du nicht.',
          this.schalter(e.offlineErlauben, (v) => s({ offlineErlauben: v }))),
        this.reihe('Automatisch sperren', 'Nach so vielen Minuten ohne Eingabe wird gesperrt. 0 = nie.',
          this.auswahl(String(e.autoSperrenMin), [['0', 'nie'], ['5', '5 Minuten'], ['10', '10 Minuten'], ['15', '15 Minuten'], ['30', '30 Minuten'], ['60', '1 Stunde']], (v) => s({ autoSperrenMin: Number(v) }))),
        this.reihe('Jetzt sperren', 'Bildschirm aus, Windows und der Trading-Bot laufen weiter.',
          el('button', { klasse: 'knopf', onclick: () => Schreibtisch.sperren() }, 'Sperren')),
        this.reihe('Gespeichertes Passwort löschen', 'Danach geht die Anmeldung nur noch mit erreichbarem Pi.',
          el('button', { klasse: 'knopf gefahr', onclick: () => Schreibtisch.abmelden() }, 'Abmelden')),
      )));
  },

  async vorschauSetzen(el2, e) {
    if (e.hintergrundArt === 'farbe') { el2.style.background = e.farbe || '#0b1220'; return; }
    if (e.hintergrundArt === 'bild' && e.hintergrund) {
      const r = await Z.lokal.url(e.hintergrund);
      if (r.ok) { el2.style.backgroundImage = `url("${r.url}")`; return; }
    }
    el2.style.background = 'radial-gradient(600px 400px at 20% 15%, #1e3a8a 0%, transparent 60%), radial-gradient(500px 350px at 82% 80%, #4c1d95 0%, transparent 62%), linear-gradient(165deg,#050a14,#0b1220)';
  },

  aussehen(i) {
    const a = Einst.daten.aussehen;
    const s = (teil) => { Einst.setzen({ aussehen: teil }); Schreibtisch.aussehenAnwenden(); };
    i.append(el('h2', { text: 'Aussehen' }), el('p', { klasse: 'unter', text: 'Schreibtisch, Dock und Farben.' }));

    const vorschau = el('div', { klasse: 'ein-vorschau' });
    this.schreibtischVorschau(vorschau, a);

    i.append(this.block('Schreibtisch', vorschau, this.karte(
      this.reihe('Hintergrund', null,
        el('div', { stil: { display: 'flex', gap: '8px', alignItems: 'center' } },
          this.auswahl(a.hintergrundArt, [['verlauf', 'Verlauf'], ['bild', 'Bild']], (v) => { s({ hintergrundArt: v }); this.zeichnen(); }),
          a.hintergrundArt === 'bild' ? el('button', { klasse: 'knopf', onclick: async () => { const r = await Z.einstellungen.bildWaehlen(); if (r.ok) { s({ hintergrund: r.pfad }); this.zeichnen(); } } }, 'Bild wählen') : null)),
      a.hintergrundArt === 'bild' && a.hintergrund ? this.reihe('Gewähltes Bild', a.hintergrund,
        el('button', { klasse: 'knopf klein', onclick: () => { s({ hintergrund: '' }); this.zeichnen(); } }, 'Entfernen')) : null,
      this.reihe('Helles Thema', 'Hell statt dunkel.', this.schalter(a.hell, (v) => { s({ hell: v }); })),
      this.reihe('Akzentfarbe', 'Für Auswahl, Knöpfe und Markierungen.',
        el('input', { klasse: 'farbfeld', type: 'color', value: a.akzent || '#2457f5', onchange: (ev) => s({ akzent: ev.target.value }) })),
    )));

    i.append(this.block('Dock', this.karte(
      this.reihe('Grösse der Symbole', null, this.regler(a.dockGroesse, 36, 84, (v) => { s({ dockGroesse: v }); Dock.bauen(); })),
      this.reihe('Menüleiste zeigen', null, this.schalter(a.menueleiste, (v) => { s({ menueleiste: v }); })),
    )));
  },

  async schreibtischVorschau(el2, a) {
    if (a.hintergrundArt === 'bild' && a.hintergrund) {
      const r = await Z.lokal.url(a.hintergrund);
      if (r.ok) { el2.style.backgroundImage = `url("${r.url}")`; return; }
    }
    el2.style.background = 'radial-gradient(600px 400px at 18% 12%, #1e3a8a 0%, transparent 60%), radial-gradient(500px 350px at 85% 78%, #4c1d95 0%, transparent 62%), linear-gradient(160deg,#060b16,#0b1220)';
  },

  verhalten(i) {
    const v = Einst.daten.verhalten;
    const s = (teil) => Einst.setzen({ verhalten: teil });
    i.append(el('h2', { text: 'Verhalten' }),
      el('p', { klasse: 'unter', text: 'Der HP soll nie wirklich ausgehen – darauf läuft der Trading-Bot. «Ausschalten» heisst hier: Bildschirm aus und Anmeldebildschirm.' }));

    i.append(this.block('Start', this.karte(
      this.reihe('Mit Windows starten', 'Die Zentrale startet automatisch mit, sobald sich Windows anmeldet.',
        this.schalter(Schreibtisch.zustand.autostart, (x) => s({ autostart: x }))),
      this.reihe('Nach dem Hochfahren sperren', 'Direkt der Anmeldebildschirm statt des Schreibtischs.',
        this.schalter(v.beimStartSperren, (x) => s({ beimStartSperren: x }))),
      this.reihe('Zentrale gleich öffnen', 'Nach dem Anmelden wird das Zentrale-Fenster geöffnet.',
        this.schalter(v.zentraleBeimStart, (x) => s({ zentraleBeimStart: x }))),
    )));

    i.append(this.block('Vollbild', this.karte(
      this.reihe('Wie ein Betriebssystem (Kiosk)', 'Vollbild ohne Windows-Rahmen. Notausstieg: Strg + Alt + Shift + K, Beenden: Strg + Alt + Shift + Q.',
        this.schalter(v.kiosk, (x) => Z.system.kiosk(x))),
    )));

    i.append(this.block('Strom', this.karte(
      this.reihe('Nie in den Energiesparmodus', 'Verhindert, dass Windows den Rechner schlafen legt. Für den Trading-Bot unbedingt an lassen.',
        this.schalter(v.niemalsSchlafen, (x) => s({ niemalsSchlafen: x }))),
      this.reihe('«Ausschalten» schaltet den Monitor ab', 'Aus: es wird nur gesperrt, der Monitor bleibt an.',
        this.schalter(v.bildschirmAusBeiSperre, (x) => s({ bildschirmAusBeiSperre: x }))),
      this.reihe('Monitor sofort ausschalten', 'Zum Ausprobieren. Maus bewegen schaltet ihn wieder an.',
        el('button', { klasse: 'knopf', onclick: async () => { const r = await Z.system.bildschirmAus(); if (!r.ok) hinweis(r.fehler || 'Hat nicht geklappt', 'fehler'); } }, 'Jetzt testen')),
    )));

    i.append(this.block('App', this.karte(
      this.reihe('Zentrale neu starten', null, el('button', { klasse: 'knopf', onclick: () => Z.system.neustart() }, 'Neu starten')),
      this.reihe('Einstellungen zurücksetzen', 'Alles wieder auf Werkseinstellung. Das gespeicherte Passwort bleibt.',
        el('button', { klasse: 'knopf gefahr', onclick: async () => {
          if (!await fragen('Zurücksetzen?', 'Alle Einstellungen gehen auf den Ausgangszustand zurück.', 'Zurücksetzen', true)) return;
          const r = await Z.einstellungen.zuruecksetzen();
          if (r.ok) { Einst.daten = r.einstellungen; Schreibtisch.aussehenAnwenden(); Dock.bauen(); this.zeichnen(); hinweis('Zurückgesetzt', 'ok'); }
        } }, 'Zurücksetzen')),
    )));
  },

  verbindung(i) {
    i.append(el('h2', { text: 'Verbindung' }), el('p', { klasse: 'unter', text: 'Adresse der Zentrale auf dem Raspberry Pi. Erreichbar nur über Tailscale.' }));
    const feld = this.textfeld(Einst.daten.zentraleUrl, () => {}, { breit: true, platzhalter: 'https://…ts.net:8443' });
    const zustand = el('div', { klasse: 'u', text: 'noch nicht geprüft' });

    i.append(this.block('Zentrale', this.karte(
      this.reihe('Adresse', 'Zum Beispiel https://homelabkerim.taila4b96b.ts.net:8443', feld),
      this.reihe('Speichern & prüfen', null, el('button', { klasse: 'knopf haupt', onclick: async () => {
        const url = feld.value.trim().replace(/\/+$/, '');
        if (!/^https?:\/\//.test(url)) return hinweis('Die Adresse muss mit https:// anfangen', 'fehler');
        await Einst.setzenAsync({ zentraleUrl: url });
        zustand.textContent = 'wird geprüft …';
        const r = await Z.anmeldungPruefen();
        zustand.textContent = r.online ? (r.angemeldet ? 'verbunden und angemeldet' : 'erreichbar, aber nicht angemeldet') : 'nicht erreichbar: ' + (r.fehler || '');
        Menueleiste.piTick();
      } }, 'Speichern & prüfen')),
      this.reihe('Zustand', null, zustand),
      this.reihe('Im Browser öffnen', 'Öffnet die Zentrale im normalen Browser.',
        el('button', { klasse: 'knopf', onclick: () => Z.system.linkOeffnen(Einst.daten.zentraleUrl) }, 'Öffnen')),
    )));
  },

  finder(i) {
    const f = Einst.daten.finder;
    const s = (teil) => Einst.setzen({ finder: teil });
    i.append(el('h2', { text: 'Finder' }), el('p', { klasse: 'unter', text: 'Wie Dateien angezeigt werden.' }));
    i.append(this.block('Anzeige', this.karte(
      this.reihe('Ansicht', null, this.auswahl(f.ansicht, [['liste', 'Liste'], ['symbole', 'Symbole']], (v) => s({ ansicht: v }))),
      this.reihe('Sortierung', null, this.auswahl(f.sortierung, [['name', 'Name'], ['groesse', 'Grösse'], ['geaendert', 'Geändert']], (v) => s({ sortierung: v }))),
      this.reihe('Versteckte Dateien zeigen', 'Dateien, die mit einem Punkt anfangen, und Windows-Systemordner.',
        this.schalter(f.versteckteZeigen, (v) => s({ versteckteZeigen: v }))),
    )));

    const liste = el('div');
    const zeichnen = () => {
      leeren(liste);
      for (const p of Einst.daten.finder.lokaleOrte || []) {
        liste.append(this.reihe(lokalName(p), p, el('button', {
          klasse: 'knopf klein gefahr', onclick: async () => {
            await Einst.setzenAsync({ finder: { lokaleOrte: Einst.daten.finder.lokaleOrte.filter((x) => x !== p) } });
            zeichnen();
          },
        }, 'Entfernen')));
      }
      if (!(Einst.daten.finder.lokaleOrte || []).length) liste.append(this.reihe('Keine eigenen Ordner', 'Hier kannst du Ordner vom HP in die Seitenleiste legen.', null));
    };
    zeichnen();

    i.append(this.block('Eigene Ordner in der Seitenleiste', this.karte(
      liste,
      this.reihe('Ordner hinzufügen', null, el('button', { klasse: 'knopf', onclick: async () => {
        const r = await Z.einstellungen.ordnerWaehlen();
        if (!r.ok) return;
        const alt = Einst.daten.finder.lokaleOrte || [];
        if (alt.includes(r.pfad)) return;
        await Einst.setzenAsync({ finder: { lokaleOrte: [...alt, r.pfad] } });
        zeichnen();
        if (Finder.offen) Finder.offen.orteLaden();
      } }, 'Wählen')),
    )));
  },

  async freigaben(i) {
    i.append(el('h2', { text: 'Geteilte Links' }), el('p', { klasse: 'unter', text: 'Dateien vom Pi, die du über einen Link freigegeben hast. Die Links funktionieren nur für Geräte in deinem Tailscale-Netz.' }));
    const kasten = el('div', { klasse: 'ein-karte' }, el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'lader' })));
    i.append(this.block(null, kasten));
    const r = await Z.pi.freigaben();
    leeren(kasten);
    if (!r.ok) { kasten.append(this.reihe('Nicht erreichbar', r.fehler, el('button', { klasse: 'knopf klein', onclick: () => this.zeichnen() }, 'Nochmal'))); return; }
    const liste = r.freigaben || [];
    if (!liste.length) { kasten.append(this.reihe('Keine Links', 'Im Finder mit Rechtsklick auf eine Datei → «Link teilen».', null)); return; }
    for (const f of liste) {
      const url = `https://${r.host}:8443/teilen/${f.token}`;
      kasten.append(this.reihe(f.name, `gültig bis ${datumZeit(f.bis)}`,
        el('div', { stil: { display: 'flex', gap: '6px' } },
          el('button', { klasse: 'knopf klein', onclick: () => { Z.system.kopieren(url); hinweis('Link kopiert', 'ok'); } }, 'Kopieren'),
          el('button', { klasse: 'knopf klein gefahr', onclick: async () => {
            const a = await Z.pi.freigabeWeg(f.token);
            if (pruefen(a)) { hinweis('Link gelöscht', 'ok'); this.zeichnen(); }
          } }, 'Löschen'))));
    }
  },

  ueber(i) {
    const z = Schreibtisch.zustand;
    i.append(el('h2', { text: 'Über diesen HP' }), el('p', { klasse: 'unter', text: 'Zentrale Desktop – die Oberfläche auf dem HP.' }));
    i.append(this.block(null, this.karte(
      this.reihe('Version', null, el('span', { klasse: 'u', text: z.version || '–' })),
      this.reihe('Rechner', null, el('span', { klasse: 'u', text: z.rechner || '–' })),
      this.reihe('Windows-Benutzer', null, el('span', { klasse: 'u', text: z.benutzer || '–' })),
      this.reihe('Zentrale', null, el('span', { klasse: 'u', text: Einst.daten.zentraleUrl })),
      this.reihe('Energiesparmodus', null, el('span', { klasse: 'u', text: Einst.daten.verhalten.niemalsSchlafen ? 'verhindert – Rechner bleibt wach' : 'erlaubt' })),
    )));
    i.append(this.block('Tastenkürzel', this.karte(
      this.reihe('Sperren (Bildschirm aus)', null, el('span', { klasse: 'u', text: 'Strg + L' })),
      this.reihe('Finder öffnen', null, el('span', { klasse: 'u', text: 'Strg + E' })),
      this.reihe('Fenster schliessen', null, el('span', { klasse: 'u', text: 'Strg + W' })),
      this.reihe('Kiosk-Modus umschalten', null, el('span', { klasse: 'u', text: 'Strg + Alt + Shift + K' })),
      this.reihe('Zentrale beenden', null, el('span', { klasse: 'u', text: 'Strg + Alt + Shift + Q' })),
    )));
  },
};
