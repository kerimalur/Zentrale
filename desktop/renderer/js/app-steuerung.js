// Steuerung: PC, Fernseher, Szenen und Dienste des Pi – als eigene App im Dock,
// damit man nicht jedes Mal die ganze Zentrale öffnen muss.
const Steuerung = {
  fenster: null, daten: null, timer: null,

  oeffnen() {
    if (FM.finden('steuerung')) return FM.oeffnen({ id: 'steuerung' });
    this.fenster = FM.oeffnen({
      id: 'steuerung', appId: 'steuerung', titel: 'Steuerung', symbol: 'steuerung',
      breite: 760, hoehe: 620, minBreite: 420, minHoehe: 360,
      werkzeuge: [{ symbol: 'neu', titel: 'Aktualisieren', tun: () => this.laden() }],
      menue: () => ({
        Steuerung: [
          { text: 'Aktualisieren', kuerzel: '⌘R', tun: () => this.laden() },
          { text: 'Zentrale öffnen', tun: () => Apps.zentrale.oeffnen() },
        ],
      }),
      aufbauen: (inhalt) => {
        this.inhalt = el('div', { klasse: 'st' }, el('div', { klasse: 'leer' }, el('div', { klasse: 'lader' })));
        inhalt.append(this.inhalt);
        this.laden();
        this.timer = setInterval(() => { if (!this.fenster?.minimiert) this.laden(true); }, 20000);
      },
      beimSchliessen: () => { clearInterval(this.timer); this.timer = null; this.fenster = null; return true; },
    });
  },

  async laden(leise = false) {
    const r = await Z.pi.status();
    if (!r.ok) {
      if (!leise) leeren(this.inhalt).append(el('div', { klasse: 'leer' },
        el('div', null, el('div', { text: r.fehler || 'Pi nicht erreichbar' }),
          el('div', { stil: { marginTop: '12px' } }, el('button', { klasse: 'knopf', onclick: () => this.laden() }, 'Nochmal')))));
      return;
    }
    this.daten = r;
    this.zeichnen();
  },

  async befehl(was, arg, frage) {
    if (frage && !await fragen(frage.titel, frage.text, frage.ok || 'Ja', !!frage.gefahr)) return;
    const r = await Z.pi.steuern(was, arg);
    if (!pruefen(r, 'Befehl fehlgeschlagen')) return;
    hinweis('Befehl gesendet', 'ok');
    setTimeout(() => this.laden(true), 1500);
  },

  zeichnen() {
    const d = this.daten;
    const w = leeren(this.inhalt);

    // --- Karten oben ---
    const karten = el('div', { klasse: 'st-gitter' });

    // PC
    if (d.pc) {
      const online = d.pc.online;
      karten.append(el('div', { klasse: 'st-karte' },
        el('h4', null, el('span', { html: symbol('pc') }).firstElementChild, d.pc.name || 'Windows-PC'),
        el('div', { klasse: 'wert', text: online === true ? 'An' : online === false ? 'Aus' : '–' }),
        el('div', { klasse: 'unter', text: d.pc.gewecktUm ? 'startet gerade …' : d.pc.eingerichtet ? (d.pc.zuletzt ? 'zuletzt ' + datumZeit(new Date(d.pc.zuletzt).getTime()) : '') : 'PC_MAC fehlt in der .env' }),
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', disabled: !d.pc.eingerichtet || online === true, onclick: () => this.befehl('pcWecken') }, 'Einschalten'),
          el('button', { klasse: 'knopf klein gefahr', disabled: !d.pc.ausBereit || online !== true, onclick: () => this.befehl('pcAus', null, { titel: 'PC ausschalten?', text: 'Der Windows-PC fährt in 30 Sekunden herunter.', ok: 'Ausschalten', gefahr: true }) }, 'Ausschalten'),
        ),
      ));
    }

    // Fernseher
    if (d.tv) {
      const t = d.tv;
      karten.append(el('div', { klasse: 'st-karte' },
        el('h4', null, el('span', { html: symbol('tv') }).firstElementChild, t.name || 'Fernseher'),
        el('div', { klasse: 'wert', text: t.an === true ? 'An' : t.an === false ? 'Standby' : '–' }),
        el('div', { klasse: 'unter', text: !t.eingerichtet ? 'TV_IP fehlt in der .env' : t.lautstaerke !== null && t.lautstaerke !== undefined ? `Lautstärke ${t.lautstaerke}${t.stumm ? ' · stumm' : ''}` : '' }),
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', disabled: !t.eingerichtet, onclick: () => this.befehl('tvAn') }, 'Einschalten'),
          el('button', { klasse: 'knopf klein', disabled: !t.eingerichtet || t.an !== true, html: symbol('leiser'), onclick: () => this.befehl('tvLautstaerke', Math.max(0, (t.lautstaerke || 0) - 2)) }),
          el('button', { klasse: 'knopf klein', disabled: !t.eingerichtet || t.an !== true, html: symbol('lauter'), onclick: () => this.befehl('tvLautstaerke', Math.min(60, (t.lautstaerke || 0) + 2)) }),
        ),
        t.eingerichtet && t.an === true ? el('div', { klasse: 'st-tasten', stil: { marginTop: '10px' } },
          ...['Home', 'Back', 'ConfirmSelect', 'CursorUp', 'CursorDown', 'CursorLeft', 'CursorRight', 'PlayPause', 'Mute']
            .map((k) => el('button', { klasse: 'knopf klein', title: k, text: { Home: '⌂', Back: '↩', ConfirmSelect: 'OK', CursorUp: '▲', CursorDown: '▼', CursorLeft: '◀', CursorRight: '▶', PlayPause: '⏯', Mute: '🔇' }[k], onclick: () => this.befehl('tvTaste', k) })),
        ) : null,
      ));
    }

    // Pi
    if (d.pi) {
      karten.append(el('div', { klasse: 'st-karte' },
        el('h4', null, el('span', { html: symbol('pi') }).firstElementChild, 'Raspberry Pi'),
        el('div', { klasse: 'wert', text: (d.pi.temp !== null && d.pi.temp !== undefined ? Math.round(d.pi.temp) + ' °C' : '–') }),
        el('div', { klasse: 'unter', text: `CPU ${Math.round(d.pi.cpu || 0)} % · RAM ${groesse(d.pi.ramBenutzt)} / ${groesse(d.pi.ramTotal)}` }),
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', onclick: () => this.befehl('piNeustart', null, { titel: 'Pi neu starten?', text: 'Alle Dienste sind für 1–2 Minuten weg.', ok: 'Neu starten', gefahr: true }) }, 'Neu starten'),
        ),
      ));
    }

    // Strom
    if (d.energie) {
      karten.append(el('div', { klasse: 'st-karte' },
        el('h4', null, el('span', { html: symbol('strom') }).firstElementChild, 'Strom'),
        el('div', { klasse: 'wert', text: d.energie.watt !== null && d.energie.watt !== undefined ? Math.round(d.energie.watt) + ' W' : '–' }),
        el('div', { klasse: 'unter', text: d.energie.chfMonat ? `ca. ${d.energie.chfMonat.toFixed(2).replace('.', ',')} CHF / Monat` : (d.energie.quelle === 'schaetzung' ? 'geschätzt' : '') }),
      ));
    }

    w.append(karten);

    // --- Szenen ---
    if (d.szenen?.length) {
      w.append(el('div', { klasse: 'st-titel', text: 'Szene' }));
      const reihe = el('div', { klasse: 'reihe', stil: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
      for (const s of d.szenen) {
        const aktiv = d.szene?.id === s.id;
        reihe.append(el('button', {
          klasse: 'knopf' + (aktiv ? ' haupt' : ''),
          html: symbol({ normal: 'sonne', film: 'film', nacht: 'mond' }[s.id] || 'sonne'),
          onclick: () => this.befehl('szene', s.id),
        }, ' ' + (s.name || s.id)));
      }
      w.append(reihe);
    }

    // --- Dienste ---
    if (d.dienste?.length) {
      w.append(el('div', { klasse: 'st-titel', text: 'Dienste' }));
      for (const s of d.dienste) {
        const an = s.status === 'online';
        w.append(el('div', { klasse: 'st-zeile' },
          el('span', { klasse: 'punkt ' + (an ? 'an' : s.status === 'unbekannt' ? '' : 'weg') }),
          el('span', { klasse: 'name', text: s.name }),
          el('span', { stil: { fontSize: '12px', color: 'var(--text-sehr-leise)' }, text: s.ausGrund || s.status + (s.ms ? ` · ${s.ms} ms` : '') }),
          el('button', { klasse: 'knopf klein', onclick: () => this.befehl('dienstNeustart', s.id, { titel: `${s.name} neu starten?`, text: 'Der Dienst ist kurz nicht erreichbar.', ok: 'Neu starten' }) }, 'Neu starten'),
          el('button', { klasse: 'knopf klein', onclick: () => s.url && Z.system.linkOeffnen(s.url), disabled: !s.url, html: symbol('browser') }),
        ));
      }
    }

    // --- Laufwerke ---
    if (d.laufwerke?.length) {
      w.append(el('div', { klasse: 'st-titel', text: 'Laufwerke' }));
      for (const l of d.laufwerke) {
        w.append(el('div', { klasse: 'st-zeile' },
          el('span', { klasse: 'punkt ' + (l.schlaeft ? '' : 'an') }),
          el('span', { klasse: 'name', text: l.name || l.mount }),
          el('span', { stil: { fontSize: '12px', color: 'var(--text-sehr-leise)' }, text: `${groesse(l.benutzt)} / ${groesse(l.gross)} · ${groesse(l.frei)} frei` }),
          el('button', { klasse: 'knopf klein', onclick: () => Finder.oeffnen({ quelle: 'pi', wurzel: l.mount, pfad: '/' }) }, 'Im Finder'),
        ));
      }
    }

    // --- Hinweise ---
    if (d.hinweise?.length) {
      w.append(el('div', { klasse: 'st-titel', text: 'Hinweise vom Pi' }));
      for (const h of d.hinweise.slice(0, 8)) {
        w.append(el('div', { klasse: 'st-zeile' }, el('span', { klasse: 'punkt' }), el('span', { klasse: 'name', text: h })));
      }
    }
  },
};
