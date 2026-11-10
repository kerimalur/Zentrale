// Obere Menüleiste: links das Zentrale-Menü und die Menüs des vordersten Fensters,
// rechts Pi-Zustand, Datum und Uhr.
const Menueleiste = {
  el: null, uhrEl: null, punktEl: null, appEl: null, menueEl: null, piOnline: null,

  bauen() {
    const leiste = leeren($('#menueleiste'));
    this.el = leiste;

    const logo = el('button', { klasse: 'mb-knopf', html: symbol('zentrale'), stil: { padding: '0 8px' } });
    logo.querySelector('svg').style.width = '15px';
    logo.querySelector('svg').style.height = '15px';
    logo.addEventListener('click', (e) => this.systemMenue(e.currentTarget));

    this.appEl = el('button', { klasse: 'mb-knopf fett', text: 'Zentrale' });
    this.appEl.addEventListener('click', (e) => this.appMenue(e.currentTarget));
    this.menueEl = el('div', { stil: { display: 'flex', gap: '2px' } });

    this.punktEl = el('span', { klasse: 'mb-punkt unklar', title: 'Pi wird geprüft' });
    this.uhrEl = el('span', { klasse: 'mb-uhr' });

    const piKnopf = el('button', { klasse: 'mb-knopf', title: 'Zustand des Pi' }, this.punktEl, 'Pi');
    piKnopf.addEventListener('click', (e) => this.piMenue(e.currentTarget));

    leiste.append(logo, this.appEl, this.menueEl, el('div', { klasse: 'fuellung' }),
      el('div', { klasse: 'mb-rechts' }, piKnopf, this.uhrEl));

    this.uhrTick();
    setInterval(() => this.uhrTick(), 15000);
    this.piTick();
    setInterval(() => this.piTick(), 30000);
  },

  uhrTick() { if (this.uhrEl) this.uhrEl.textContent = `${kurzesDatum()}  ${uhr()}`; },

  async piTick() {
    const r = await Z.anmeldungPruefen();
    this.piOnline = r && r.online;
    if (!this.punktEl) return;
    this.punktEl.className = 'mb-punkt ' + (this.piOnline ? 'an' : 'weg');
    this.punktEl.title = this.piOnline ? 'Pi verbunden' : 'Pi nicht erreichbar';
  },

  aktualisieren() {
    if (!this.appEl) return;
    const f = FM.oben;
    const app = f ? (Apps[f.appId] || null) : null;
    this.appEl.textContent = app ? app.name : 'Zentrale';
    leeren(this.menueEl);
    const menues = (f && f.aufMenue) ? f.aufMenue(f) : null;
    if (!menues) return;
    for (const [name, eintraege] of Object.entries(menues)) {
      const k = el('button', { klasse: 'mb-knopf', text: name });
      k.addEventListener('click', () => this.aufklappen(k, typeof eintraege === 'function' ? eintraege() : eintraege));
      this.menueEl.append(k);
    }
  },

  aufklappen(knopf, eintraege) {
    const offen = knopf.classList.contains('offen');
    schliesseMenues();
    if (offen) return;
    knopf.classList.add('offen');
    const r = knopf.getBoundingClientRect();
    FM.ueberlagernAn();
    const m = kontextmenue(r.left, r.bottom + 3, eintraege);
    const beobachter = new MutationObserver(() => {
      if (!m.isConnected) { FM.ueberlagernAus(); beobachter.disconnect(); }
    });
    beobachter.observe($('#ebenen'), { childList: true });
  },

  systemMenue(knopf) {
    this.aufklappen(knopf, [
      { text: 'Über diesen HP', tun: () => Apps.einstellungen.oeffnen('ueber') },
      { text: 'Einstellungen …', kuerzel: '⌘,', tun: () => Apps.einstellungen.oeffnen() },
      '-',
      { text: 'Zentrale im Browser öffnen', tun: () => Z.web.imBrowser() },
      { text: 'Alle Fenster schliessen', tun: () => FM.schliessenAlle() },
      '-',
      { text: 'Sperren (Bildschirm aus)', kuerzel: '⌘L', tun: () => Schreibtisch.sperren() },
      { text: 'Vom Pi abmelden …', tun: () => Schreibtisch.abmelden() },
      '-',
      { text: 'Zentrale neu starten', tun: () => Z.system.neustart() },
      { text: 'Zentrale beenden …', tun: () => Schreibtisch.beenden() },
    ]);
  },

  appMenue(knopf) {
    const f = FM.oben;
    const app = f ? Apps[f.appId] : null;
    this.aufklappen(knopf, [
      { text: `Über ${app ? app.name : 'Zentrale'}`, tun: () => Apps.einstellungen.oeffnen('ueber') },
      '-',
      { text: 'Fenster schliessen', kuerzel: '⌘W', aus: !f, tun: () => f && f.schliessen() },
      { text: 'Fenster zoomen', aus: !f, tun: () => f && f.zoomen() },
      { text: 'Fenster minimieren', kuerzel: '⌘M', aus: !f, tun: () => f && f.minimieren() },
    ]);
  },

  piMenue(knopf) {
    this.aufklappen(knopf, [
      { titel: this.piOnline ? 'Pi verbunden' : 'Pi nicht erreichbar' },
      { text: 'Jetzt neu prüfen', tun: () => this.piTick() },
      { text: 'Zentrale öffnen', tun: () => Apps.zentrale.oeffnen() },
      { text: 'Steuerung öffnen', tun: () => Apps.steuerung.oeffnen() },
      '-',
      { text: 'Zentrale neu laden', tun: () => Z.web.befehl('neu') },
    ]);
  },
};
