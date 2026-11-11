// Anmeldebildschirm. Sieht aus wie die Windows-Anmeldung: erst nur Uhr, bei einer
// Eingabe kommt das Feld. Standard ist der PIN; über den Link unten geht es
// jederzeit auch mit Zentrale-Passwort und 2FA-Code.
const Sperre = {
  el: null, offen: false, laeuft: false, codeNoetig: false,
  modus: 'pin', zustand: {}, uhrTimer: null, piTimer: null,

  async zeigen() {
    const z = await Z.anmeldungZustand();
    this.zustand = z && z.ok ? z : { pin: false };
    this.modus = this.zustand.pin ? 'pin' : 'passwort';
    this.offen = false;
    this.codeNoetig = false;
    this.bauen(Einst.daten.anmeldung);
    $('#sperre').hidden = false;
    $('#schreibtisch').setAttribute('aria-hidden', 'true');
    this.uhrStart();
    this.piPruefenSchleife();
    setTimeout(() => this.el.wurzel.focus(), 50);
  },

  verstecken() {
    $('#sperre').hidden = true;
    $('#schreibtisch').setAttribute('aria-hidden', 'false');
    clearInterval(this.uhrTimer); this.uhrTimer = null;
    clearInterval(this.piTimer); this.piTimer = null;
  },

  bauen(e) {
    const wurzel = leeren($('#sperre'));
    wurzel.className = 'sperre';
    wurzel.tabIndex = -1;

    const hg = el('div', { klasse: 'sperre-hintergrund' });
    this.hintergrundSetzen(hg, e);

    const zeit = el('div', { klasse: 'zeit', text: uhr() });
    const datum = el('div', { klasse: 'datum', text: langesDatum() });
    const uhrBlock = el('div', { klasse: 'sperre-uhr' }, e.uhrZeigen ? zeit : null, e.datumZeigen ? datum : null);

    const avatar = el('div', { klasse: 'sperre-avatar' },
      e.avatar ? el('img', { src: '', alt: '' }) : (e.benutzerName || 'Z').trim().charAt(0).toUpperCase());
    if (e.avatar) Z.lokal.url(e.avatar).then((r) => { if (r.ok) avatar.querySelector('img').src = r.url; });

    const haupt = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false' });
    const code = el('input', { type: 'text', placeholder: '6-stelliger Code', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });
    const codeFeld = el('div', { klasse: 'sperre-eingabe', stil: { display: 'none' } }, code,
      el('button', { klasse: 'sperre-pfeil', html: symbol('pfeilRechts'), onclick: () => this.absenden() }));

    haupt.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.absenden(); });
    code.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.absenden(); });
    // Vierstelliger PIN: abschicken, sobald die Länge stimmt – wie bei Windows.
    haupt.addEventListener('input', () => {
      if (this.modus !== 'pin' || this.laeuft) return;
      if (haupt.value.length === (this.zustand.pinLaenge || 4)) this.absenden();
    });

    const fehler = el('div', { klasse: 'sperre-fehler' });
    const info = el('div', { klasse: 'sperre-info' });
    const lader = el('div', { klasse: 'lader sperre-lader', stil: { display: 'none' } });

    const wechsel = el('button', {
      klasse: 'sperre-wechsel',
      onclick: () => this.modusWechseln(this.modus === 'pin' ? 'passwort' : 'pin'),
    });

    const karte = el('div', { klasse: 'sperre-karte' },
      avatar,
      el('div', { klasse: 'sperre-name', text: e.benutzerName || 'Zentrale' }),
      e.untertitel ? el('div', { klasse: 'sperre-unter', text: e.untertitel }) : null,
      el('div', { klasse: 'sperre-eingabe' }, haupt,
        el('button', { klasse: 'sperre-pfeil', html: symbol('pfeilRechts'), onclick: () => this.absenden() })),
      codeFeld, fehler, info, lader, wechsel,
    );

    const punkt = el('span', { klasse: 'punkt' });
    const zustandText = el('span', { text: 'Pi wird geprüft …' });
    const fuss = el('div', { klasse: 'sperre-fuss' },
      el('div', { klasse: 'zustand' }, punkt, zustandText),
      el('button', {
        klasse: 'sperre-rund', title: 'Bildschirm aus', html: symbol('strom'),
        onclick: (ev) => {
          ev.stopPropagation();
          kontextmenue(ev.clientX - 190, ev.clientY - 90, [
            { text: 'Bildschirm ausschalten', tun: () => Z.system.bildschirmAus() },
            '-',
            { text: 'Zentrale neu starten', tun: () => Z.system.neustart() },
            { text: 'Zentrale beenden', tun: async () => { if (await fragen('Zentrale beenden?', 'Die Oberfläche wird geschlossen. das System läuft weiter.', 'Beenden', true)) Z.system.beenden(); } },
          ]);
        },
      }),
    );

    wurzel.append(hg, el('div', { klasse: 'sperre-schleier' }), uhrBlock, karte,
      el('div', { klasse: 'sperre-hinweis', text: 'Taste drücken oder klicken zum Anmelden' }), fuss);

    this.el = { wurzel, zeit, datum, haupt, code, codeFeld, fehler, info, lader, punkt, zustandText, wechsel };
    this.modusAnwenden();

    const aufmachen = (ev) => {
      if (this.offen) return;
      if (ev.type === 'keydown' && (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(ev.key) || ev.ctrlKey || ev.altKey || ev.metaKey)) return;
      this.aufmachen();
      // Das Zeichen, das den Bildschirm geöffnet hat, selbst übernehmen – das Feld
      // bekommt es sonst nicht mit. Alle weiteren landen direkt im Feld.
      if (ev.type === 'keydown' && ev.key.length === 1) {
        ev.preventDefault();
        this.el.haupt.value = ev.key;
        this.el.haupt.setSelectionRange(1, 1);
      }
    };
    wurzel.addEventListener('mousedown', aufmachen);
    wurzel.addEventListener('wheel', aufmachen, { passive: true });
    wurzel.addEventListener('keydown', aufmachen);
  },

  modusWechseln(neu) {
    this.modus = neu;
    this.codeNoetig = false;
    this.el.haupt.value = '';
    this.el.code.value = '';
    this.el.fehler.textContent = '';
    this.modusAnwenden();
    setTimeout(() => this.el.haupt.focus(), 30);
  },

  modusAnwenden() {
    const pinDa = !!this.zustand.pin;
    const istPin = this.modus === 'pin' && pinDa;
    this.el.haupt.placeholder = istPin ? 'PIN' : 'Zentrale-Passwort';
    this.el.haupt.maxLength = istPin ? 12 : 200;
    this.el.haupt.inputMode = istPin ? 'numeric' : 'text';
    this.el.codeFeld.style.display = 'none';
    this.el.wechsel.textContent = istPin
      ? 'Mit Zentrale-Passwort anmelden'
      : (pinDa ? 'Mit PIN anmelden' : '');
    this.el.wechsel.style.display = pinDa ? 'block' : 'none';
    if (!pinDa) this.modus = 'passwort';
  },

  async hintergrundSetzen(hg, e) {
    hg.style.filter = `blur(${this.offen ? Number(e.weichzeichnen) || 0 : 0}px)`;
    if (e.hintergrundArt === 'farbe') { hg.style.background = e.farbe || '#0b1220'; return; }
    if (e.hintergrundArt === 'bild' && e.hintergrund) {
      const r = await Z.lokal.url(e.hintergrund);
      if (r.ok) { hg.style.backgroundImage = `url("${r.url}")`; return; }
    }
    hg.style.background = 'radial-gradient(1200px 820px at 20% 15%, #1e3a8a 0%, transparent 60%),'
      + 'radial-gradient(1000px 700px at 82% 80%, #4c1d95 0%, transparent 62%),'
      + 'linear-gradient(165deg, #050a14 0%, #0b1220 50%, #0a0f1c 100%)';
  },

  // Wichtig: sofort scharfstellen, nicht erst nach der Animation – sonst gehen
  // die ersten getippten Zeichen verloren.
  aufmachen() {
    this.offen = true;
    this.el.wurzel.classList.add('offen');
    const e = Einst.daten.anmeldung;
    const hg = this.el.wurzel.querySelector('.sperre-hintergrund');
    hg.style.filter = `blur(${Number(e.weichzeichnen) || 0}px)`;
    hg.style.transform = 'scale(1.04)';
    this.el.haupt.focus();
    setTimeout(() => { if (document.activeElement !== this.el.haupt) this.el.haupt.focus(); }, 80);
  },

  uhrStart() {
    const tick = () => {
      if (!this.el) return;
      this.el.zeit.textContent = uhr();
      this.el.datum.textContent = langesDatum();
    };
    tick();
    clearInterval(this.uhrTimer);
    this.uhrTimer = setInterval(tick, 10000);
  },

  async piPruefenSchleife() {
    const pruefen = async () => {
      if (!this.el) return;
      const r = await Z.anmeldungPruefen();
      const online = r && r.online;
      this.el.punkt.className = 'punkt ' + (online ? 'an' : 'weg');
      this.el.zustandText.textContent = online ? 'Pi verbunden' : 'Pi nicht erreichbar';
      if (!online && this.modus === 'passwort' && Einst.daten.anmeldung.offlineErlauben && r?.passwortGemerkt) {
        this.el.info.textContent = 'Ohne Pi: nur Passwort, kein Code.';
      }
    };
    pruefen();
    clearInterval(this.piTimer);
    this.piTimer = setInterval(pruefen, 20000);
  },

  async absenden() {
    if (this.laeuft) return;
    const wert = this.el.haupt.value;
    if (!wert) { this.el.haupt.focus(); return; }
    this.laeuft = true;
    this.el.fehler.textContent = '';
    this.el.lader.style.display = 'block';

    const r = await Z.anmelden(wert, this.codeNoetig ? this.el.code.value.trim() : '', this.modus);

    this.laeuft = false;
    this.el.lader.style.display = 'none';

    if (r && r.ok) {
      this.el.haupt.value = '';
      this.el.code.value = '';
      this.verstecken();
      Schreibtisch.nachAnmeldung(r);
      return;
    }

    if (r && r.codeNoetig) {
      this.codeNoetig = true;
      this.el.codeFeld.style.display = 'block';
      this.el.info.textContent = 'Code aus der Authenticator-App eingeben.';
      setTimeout(() => this.el.code.focus(), 40);
    }
    this.el.fehler.textContent = (r && r.fehler) || 'Anmeldung fehlgeschlagen.';
    this.el.haupt.value = '';
    if (!this.codeNoetig) this.el.haupt.focus();
  },
};
