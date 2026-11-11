// Steuerung: PC, Fernseher, Möbel, Szenen, Dienste, Medien, Backup – als eigene App,
// damit man nicht für jeden Handgriff die ganze Zentrale öffnen muss.
const Steuerung = {
  fenster: null, daten: null, timer: null, inhalt: null,

  oeffnen() {
    if (FM.finden('steuerung')) return FM.oeffnen({ id: 'steuerung' });
    this.fenster = FM.oeffnen({
      id: 'steuerung', appId: 'steuerung', titel: 'Steuerung', symbol: 'steuerung',
      breite: 820, hoehe: 660, minBreite: 440, minHoehe: 360,
      werkzeuge: [{ symbol: 'neu', titel: 'Aktualisieren', tun: () => this.laden() }],
      menue: () => ({
        Steuerung: [
          { text: 'Aktualisieren', kuerzel: '⌘R', tun: () => this.laden() },
          { text: 'Übersicht öffnen', tun: () => Apps['zentrale:Übersicht'].oeffnen() },
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
    hinweis(frage?.erledigt || 'Befehl gesendet', 'ok');
    setTimeout(() => this.laden(true), 1500);
  },

  // ---------- Bausteine ----------
  karte(symbolName, titel, wert, unter, ...rest) {
    return el('div', { klasse: 'st-karte' },
      el('h4', null, el('span', { html: symbol(symbolName) }).firstElementChild, titel),
      wert !== null && wert !== undefined ? el('div', { klasse: 'wert', text: wert }) : null,
      el('div', { klasse: 'unter', text: unter || '' }),
      rest.filter(Boolean));
  },
  titel(t) { return el('div', { klasse: 'st-titel', text: t }); },
  zeile(punkt, name, info, ...knoepfe) {
    return el('div', { klasse: 'st-zeile' },
      el('span', { klasse: 'punkt ' + (punkt === true ? 'an' : punkt === false ? 'weg' : '') }),
      el('span', { klasse: 'name', text: name }),
      info ? el('span', { stil: { fontSize: '12px', color: 'var(--text-sehr-leise)', textAlign: 'right' }, text: info }) : null,
      knoepfe.filter(Boolean));
  },

  zeichnen() {
    const d = this.daten;
    const w = leeren(this.inhalt);
    const karten = el('div', { klasse: 'st-gitter' });

    // ---------- PC ----------
    if (d.pc) {
      const online = d.pc.online;
      karten.append(this.karte('pc', d.pc.name || 'Windows-PC',
        online === true ? 'An' : online === false ? 'Aus' : '–',
        d.pc.gewecktUm ? 'startet gerade …' : !d.pc.eingerichtet ? 'PC_MAC fehlt in der .env' : d.pc.zuletzt ? 'zuletzt ' + datumZeit(new Date(d.pc.zuletzt).getTime()) : '',
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', disabled: !d.pc.eingerichtet || online === true, onclick: () => this.befehl('pcWecken', null, { erledigt: 'Einschalt-Signal gesendet' }) }, 'Einschalten'),
          el('button', { klasse: 'knopf klein gefahr', disabled: !d.pc.ausBereit || online !== true, onclick: () => this.befehl('pcAus', null, { titel: 'PC ausschalten?', text: 'Der Windows-PC fährt in 30 Sekunden herunter.', ok: 'Ausschalten', gefahr: true, erledigt: 'PC fährt herunter' }) }, 'Ausschalten'),
        )));
    }

    // ---------- Fernseher ----------
    if (d.tv) {
      const t = d.tv;
      const an = t.an === true;
      karten.append(this.karte('tv', t.name || 'Fernseher',
        t.an === true ? 'An' : t.an === false ? 'Standby' : '–',
        !t.eingerichtet ? 'TV_IP fehlt in der .env' : t.lautstaerke !== null && t.lautstaerke !== undefined ? `Lautstärke ${t.lautstaerke}${t.stumm ? ' · stumm' : ''}` : '',
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', disabled: !t.eingerichtet || an, onclick: () => this.befehl('tvAn', null, { erledigt: 'Fernseher wird eingeschaltet' }) }, 'Einschalten'),
          el('button', { klasse: 'knopf klein', disabled: !an, html: symbol('leiser'), onclick: () => this.befehl('tvLautstaerke', Math.max(0, (t.lautstaerke || 0) - 2)) }),
          el('button', { klasse: 'knopf klein', disabled: !an, html: symbol('lauter'), onclick: () => this.befehl('tvLautstaerke', Math.min(60, (t.lautstaerke || 0) + 2)) }),
          el('button', { klasse: 'knopf klein', disabled: !an, text: 'Stumm', onclick: () => this.befehl('tvTaste', 'Mute') }),
        ),
        an ? el('div', { klasse: 'st-tasten', stil: { marginTop: '10px' } },
          el('button', { klasse: 'knopf klein', title: 'Zurück', text: '↩', onclick: () => this.befehl('tvTaste', 'Back') }),
          el('button', { klasse: 'knopf klein', title: 'Hoch', text: '▲', onclick: () => this.befehl('tvTaste', 'CursorUp') }),
          el('button', { klasse: 'knopf klein', title: 'Start', text: '⌂', onclick: () => this.befehl('tvTaste', 'Home') }),
          el('button', { klasse: 'knopf klein', title: 'Links', text: '◀', onclick: () => this.befehl('tvTaste', 'CursorLeft') }),
          el('button', { klasse: 'knopf klein', title: 'OK', text: 'OK', onclick: () => this.befehl('tvTaste', 'ConfirmSelect') }),
          el('button', { klasse: 'knopf klein', title: 'Rechts', text: '▶', onclick: () => this.befehl('tvTaste', 'CursorRight') }),
          el('button', { klasse: 'knopf klein', title: 'Wiedergabe/Pause', text: '⏯', onclick: () => this.befehl('tvTaste', 'PlayPause') }),
          el('button', { klasse: 'knopf klein', title: 'Runter', text: '▼', onclick: () => this.befehl('tvTaste', 'CursorDown') }),
          el('button', { klasse: 'knopf klein', title: 'Aus', text: '⏻', onclick: () => this.befehl('tvTaste', 'Standby') }),
        ) : null));
    }

    // ---------- Möbel: Temperatur und Lüfter ----------
    if (d.moebel?.vorhanden) {
      const m = d.moebel;
      const lf = m.luefter || {};
      const warm = m.temp !== null && m.temp >= (m.warnAb ?? 40);
      const modusKnopf = (id, text) => el('button', {
        klasse: 'knopf klein' + (lf.modus === id ? ' haupt' : ''),
        onclick: () => this.befehl('luefter', id, { erledigt: 'Lüfter: ' + text }),
      }, text);

      karten.append(this.karte('mond', 'Möbel',
        m.temp === null || m.temp === undefined ? '–' : m.temp.toFixed(1).replace('.', ',') + ' °C',
        [
          m.min24 !== null && m.max24 !== null ? `24 Std: ${String(m.min24).replace('.', ',')} – ${String(m.max24).replace('.', ',')} °C` : '',
          warm ? `über der Warnschwelle von ${m.warnAb} °C` : '',
        ].filter(Boolean).join(' · '),
        this.verlaufBalken(m.verlauf),
        el('div', { stil: { marginTop: '10px', fontSize: '12px', color: 'var(--text-sehr-leise)' },
          text: !lf.vorhanden ? 'Relais nicht erreichbar' : lf.an === null ? 'Lüfter: wird geprüft' : `Lüfter ${lf.an ? 'laufen' : 'aus'}` }),
        el('div', { klasse: 'reihe' }, modusKnopf('auto', 'Auto'), modusKnopf('an', 'An'), modusKnopf('aus', 'Aus')),
      ));
    }

    // ---------- Pi ----------
    if (d.pi) {
      karten.append(this.karte('pi', 'Raspberry Pi',
        d.pi.temp !== null && d.pi.temp !== undefined ? Math.round(d.pi.temp) + ' °C' : '–',
        `CPU ${Math.round(d.pi.cpu || 0)} % · RAM ${groesse(d.pi.ramBenutzt)} / ${groesse(d.pi.ramTotal)}`,
        el('div', { klasse: 'reihe' },
          el('button', { klasse: 'knopf klein', onclick: () => this.befehl('piNeustart', null, { titel: 'Pi neu starten?', text: 'Alle Dienste sind für 1–2 Minuten weg.', ok: 'Neu starten', gefahr: true, erledigt: 'Pi startet neu' }) }, 'Neu starten'),
        )));
    }

    // ---------- Strom ----------
    if (d.energie) {
      karten.append(this.karte('strom', 'Strom',
        d.energie.watt !== null && d.energie.watt !== undefined ? Math.round(d.energie.watt) + ' W' : '–',
        d.energie.chfMonat ? `ca. ${d.energie.chfMonat.toFixed(2).replace('.', ',')} CHF / Monat` : (d.energie.quelle === 'schaetzung' ? 'geschätzt' : '')));
    }

    w.append(karten);

    // ---------- Szene ----------
    if (d.szenen?.length) {
      w.append(this.titel('Szene'));
      const reihe = el('div', { stil: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
      for (const s of d.szenen) {
        reihe.append(el('button', {
          klasse: 'knopf' + (d.szene?.id === s.id ? ' haupt' : ''),
          html: symbol({ normal: 'sonne', film: 'film', nacht: 'mond' }[s.id] || 'sonne'),
          onclick: () => this.befehl('szene', s.id, { erledigt: 'Szene: ' + (s.name || s.id) }),
        }, ' ' + (s.name || s.id)));
      }
      w.append(reihe);
    }

    // ---------- Dienste ----------
    if (d.dienste?.length) {
      w.append(this.titel('Dienste'));
      for (const s of d.dienste) {
        const an = s.status === 'online';
        w.append(this.zeile(an ? true : s.status === 'unbekannt' ? null : false, s.name,
          s.ausGrund || s.status + (s.ms ? ` · ${s.ms} ms` : ''),
          el('button', { klasse: 'knopf klein', onclick: () => this.befehl('dienstNeustart', s.id, { titel: `${s.name} neu starten?`, text: 'Der Dienst ist kurz nicht erreichbar.', ok: 'Neu starten', erledigt: s.name + ' startet neu' }) }, 'Neu starten'),
          el('button', { klasse: 'knopf klein', disabled: !s.url, html: symbol('browser'), title: 'Im Browser öffnen', onclick: () => s.url && Z.system.linkOeffnen(s.url) })));
      }
    }

    // ---------- Medien & Downloads ----------
    if (d.medien) {
      const med = d.medien;
      w.append(this.titel('Medien & Downloads'));

      const v = med.vpn || {};
      const vpnAn = v.gluetun === 'running';
      w.append(this.zeile(v.geschuetzt === true ? true : v.geschuetzt === false ? false : vpnAn ? null : false,
        'VPN (Gluetun)',
        v.ausgeschaltet ? 'von dir ausgeschaltet' : v.geschuetzt === true ? 'geschützt' + (v.land ? ' · ' + v.land : '') : v.geschuetzt === false ? 'NICHT geschützt' : vpnAn ? 'wird geprüft' : 'läuft nicht',
        el('button', { klasse: 'knopf klein' + (vpnAn ? ' gefahr' : ''), onclick: () => this.containerSchalten(this.vpnContainer(), !vpnAn, 'VPN') }, vpnAn ? 'Stoppen' : 'Starten')));

      if (med.downloads) {
        const dl = med.downloads;
        const a = dl.anzahl || {};
        w.append(this.zeile(dl.verbindung === 'connected' ? true : dl.verbindung === 'disconnected' ? false : null, 'Downloads',
          [a.laden ? `${a.laden} laden` : null,
           a.pausiert ? `${a.pausiert} pausiert` : null,
           a.fehler ? `${a.fehler} mit Fehler` : null,
           dl.down ? '↓ ' + groesse(dl.down) + '/s' : null,
           dl.up ? '↑ ' + groesse(dl.up) + '/s' : null,
           dl.gedrosselt ? 'gedrosselt' : null].filter(Boolean).join(' · ') || 'nichts läuft'));
      } else if (med.downloadsGrund) {
        w.append(this.zeile(false, 'Downloads', med.downloadsGrund));
      }

      for (const a of med.apps || []) {
        if (a.id === 'gluetun') continue;
        const an = a.zustand === 'online';
        w.append(this.zeile(an ? true : a.zustand === 'gestoert' ? false : null, a.name,
          [a.ausgeschaltet ? 'von dir ausgeschaltet' : a.zustand,
           a.anzahl !== null && a.anzahl !== undefined ? `${a.anzahl} ${a.anzahlLabel || ''}`.trim() : null,
           a.warteschlange ? `${a.warteschlange} in der Warteschlange` : null].filter(Boolean).join(' · '),
          el('button', { klasse: 'knopf klein' + (an ? ' gefahr' : ''), onclick: () => this.containerSchalten(a.container || a.id, !an, a.name) }, an ? 'Stoppen' : 'Starten'),
          el('button', { klasse: 'knopf klein', disabled: !a.url, html: symbol('browser'), title: 'Im Browser öffnen', onclick: () => a.url && Z.system.linkOeffnen(a.url) })));
      }
    }

    // ---------- Backup & Notbetrieb ----------
    w.append(this.titel('Backup & Notbetrieb'));
    const b = d.backup || {};
    w.append(this.zeile(b.laeuft ? null : b.letzte?.ok === true ? true : b.letzte?.ok === false ? false : null,
      'Backup auf die HDD',
      !b.eingerichtet ? 'nicht eingerichtet (BACKUP_ZIEL in .env)'
        : b.laeuft ? 'läuft gerade …'
          : b.letzte ? (b.letzte.ok ? `zuletzt ${datumZeit(b.letzte.zeit)} · ${groesse(b.letzte.bytes)}` : `Fehler: ${b.letzte.fehler}`)
            : 'noch nie gelaufen',
      el('button', { klasse: 'knopf klein', disabled: !b.eingerichtet || b.laeuft, onclick: () => this.befehl('backupStart', null, { titel: 'Backup jetzt starten?', text: 'Das kann je nach Datenmenge eine Weile dauern.', ok: 'Starten', erledigt: 'Backup gestartet' }) }, 'Jetzt starten')));

    const notAn = !!d.steuerung?.notbetrieb?.an;
    w.append(this.zeile(notAn ? false : true, 'Notbetrieb',
      notAn ? 'an – nur die nötigsten Dienste laufen' : 'aus – alles läuft normal',
      el('button', { klasse: 'knopf klein' + (notAn ? '' : ' gefahr'),
        onclick: () => this.befehl('notbetrieb', !notAn, {
          titel: notAn ? 'Notbetrieb beenden?' : 'Notbetrieb einschalten?',
          text: notAn ? 'Alle Dienste werden wieder gestartet.' : 'Alles ausser den nötigsten Diensten wird gestoppt.',
          ok: notAn ? 'Beenden' : 'Einschalten', gefahr: !notAn,
          erledigt: notAn ? 'Notbetrieb beendet' : 'Notbetrieb an',
        }) }, notAn ? 'Beenden' : 'Einschalten')));

    // ---------- Laufwerke ----------
    if (d.laufwerke?.length) {
      w.append(this.titel('Laufwerke'));
      for (const l of d.laufwerke) {
        w.append(this.zeile(l.schlaeft ? null : true, l.name || l.mount,
          `${groesse(l.benutzt)} / ${groesse(l.gross)} · ${groesse(l.frei)} frei${l.schlaeft ? ' · schläft' : ''}`,
          el('button', { klasse: 'knopf klein', onclick: () => Finder.oeffnen({ quelle: 'pi', wurzel: l.mount, pfad: '/' }) }, 'Im Finder')));
      }
    }

    // ---------- Hinweise ----------
    if (d.hinweise?.length) {
      w.append(this.titel('Hinweise vom Pi'));
      for (const h of d.hinweise.slice(0, 8)) w.append(this.zeile(null, h, null));
    }
  },

  // Der VPN-Container heisst in der Medien-Liste "gluetun"; falls umbenannt, nehmen wir den Eintrag daraus.
  vpnContainer() {
    const a = (this.daten?.medien?.apps || []).find((x) => x.id === 'gluetun');
    return a?.container || 'gluetun';
  },

  async containerSchalten(name, an, anzeige) {
    const r = await Z.pi.steuern('container', { name, an });
    if (!pruefen(r, `${anzeige} liess sich nicht ${an ? 'starten' : 'stoppen'}`)) return;
    hinweis(`${anzeige} wird ${an ? 'gestartet' : 'gestoppt'}`, 'ok');
    setTimeout(() => this.laden(true), 2000);
  },

  // Kleiner Balkenverlauf für die Möbel-Temperatur.
  verlaufBalken(verlauf) {
    const werte = (verlauf || []).filter((x) => typeof x === 'number');
    if (werte.length < 2) return null;
    const min = Math.min(...werte);
    const max = Math.max(...werte);
    const spanne = Math.max(max - min, 1);
    const reihe = el('div', { stil: { display: 'flex', alignItems: 'flex-end', gap: '2px', height: '28px', marginTop: '10px' } });
    for (const v of werte) {
      const h = Math.max(3, Math.round(((v - min) / spanne) * 26));
      reihe.append(el('div', {
        title: String(v).replace('.', ',') + ' °C',
        stil: { flex: '1', height: h + 'px', borderRadius: '2px', background: 'var(--akzent)', opacity: '0.75' },
      }));
    }
    return reihe;
  },
};
