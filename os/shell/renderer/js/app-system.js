// Systemprogramme von ZentraleOS: Terminal, Aktivitätsanzeige, Software, Launchpad,
// Spotlight, Kontrollzentrum und die System-Bereiche der Einstellungen.
// Jede Funktion ruft echte Systemwerkzeuge über Z.sys.* auf (siehe electron/lib/system.js).

// ---------- eigene Symbole ----------
Object.assign(SYMBOL, {
  terminal: S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
  software: S('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
  aktivitaet: S('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
  launchpad: S('<circle cx="6" cy="6" r="1.6" fill="currentColor"/><circle cx="12" cy="6" r="1.6" fill="currentColor"/><circle cx="18" cy="6" r="1.6" fill="currentColor"/><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/><circle cx="6" cy="18" r="1.6" fill="currentColor"/><circle cx="12" cy="18" r="1.6" fill="currentColor"/><circle cx="18" cy="18" r="1.6" fill="currentColor"/>'),
  wlan: S('<path d="M3 9c5-5 13-5 18 0M6 12.5c3.5-3.4 8.5-3.4 12 0M9 16c1.8-1.7 4.2-1.7 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>'),
  bluetooth: S('<path d="M7 7l10 10-5 4V3l5 4L7 17"/>'),
  ton: S('<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9c1.2 1.6 1.2 4.4 0 6M18.5 6.5c2.6 3 2.6 8 0 11"/>'),
  anzeige: S('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'),
  schild: S('<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  uhr: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  tastatur: S('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  benutzer: S('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'),
  update: S('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
  akku: S('<rect x="2" y="8" width="17" height="9" rx="2"/><path d="M22 11v3M6 11v3M9 11v3"/>'),
  tailscale: S('<circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="6" r="1.8"/><circle cx="12" cy="18" r="1.8" fill="currentColor"/><circle cx="6" cy="6" r="1.8"/><circle cx="18" cy="6" r="1.8"/>'),
});

const prozent = (teil, ganz) => (ganz ? Math.round((teil / ganz) * 100) : 0);
const balken = (p, farbe = 'var(--akzent)') => el('div', { klasse: 'sy-balken' }, el('i', { stil: { width: Math.max(0, Math.min(100, p)) + '%', background: farbe } }));

// Führt eine Root-Aktion aus. Fehlt das Administrator-Passwort, wird im Look des Systems
// danach gefragt (kein Root ohne Passwort; es wird höchstens 5 Minuten im Speicher gehalten).
async function alsAdmin(aufruf, grund = 'Diese Aktion ändert das System.') {
  let r = await aufruf(null);
  let versuch = 0;
  while (r && r.passwortNoetig && versuch < 3) {
    versuch++;
    const a = await dialog({ titel: 'Administrator-Passwort', text: (r.falsch ? 'Das Passwort war falsch. ' : '') + grund, felder: [{ type: 'password', platzhalter: 'Passwort' }], okText: 'Freigeben' });
    if (!a || !a[0]) return { ok: false, abgebrochen: true, fehler: 'Abgebrochen' };
    r = await aufruf(a[0]);
  }
  return r;
}
const root = (aktion, args = [], grund) => alsAdmin((pw) => Z.sys.root(aktion, args, pw), grund);

// ---------- Terminal ----------
const TerminalApp = {
  zaehler: 0, sitzungen: new Map(),
  SCHEMATA: {
    Nacht: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff', selectionBackground: '#264f78' },
    Hell: { background: '#fbfbfd', foreground: '#1c1c1e', cursor: '#2457f5', selectionBackground: '#b6d0ff' },
    Grün: { background: '#06120b', foreground: '#7ee787', cursor: '#7ee787', selectionBackground: '#1f4d2c' },
  },
  oeffnen(opt = {}) {
    const nr = ++this.zaehler; const id = 'terminal-' + nr;
    const es = Einst.daten.terminal || {};
    let term; let fit; let abmelden;
    const f = FM.oeffnen({
      id, appId: 'terminal', titel: opt.titel || 'Terminal', symbol: 'terminal', breite: 820, hoehe: 500, minBreite: 380, minHoehe: 220,
      werkzeuge: [
        { id: 'neu', symbol: 'plus', titel: 'Neues Terminal', tun: () => this.oeffnen() },
        { id: 'kleiner', symbol: 'minus', titel: 'Schrift kleiner', tun: () => this.schrift(term, fit, -1) },
        { id: 'groesser', symbol: 'plus', titel: 'Schrift grösser', tun: () => this.schrift(term, fit, 1) },
      ],
      menue: () => ({ Shell: [{ text: 'Neues Terminal', tun: () => this.oeffnen() }, { text: 'Leeren', tun: () => term.clear() }],
        Darstellung: Object.keys(this.SCHEMATA).map((n) => ({ text: 'Farben: ' + n, tun: () => { term.options.theme = this.SCHEMATA[n]; Einst.setzen({ terminal: { schema: n } }); } })) }),
      aufbauen: (inhalt) => {
        inhalt.classList.add('term-inhalt');
        if (typeof Terminal === 'undefined') { inhalt.append(el('div', { klasse: 'web-platz leer' }, 'Terminal-Baustein (xterm) fehlt.')); return; }
        term = new Terminal({ fontFamily: '"JetBrains Mono", monospace', fontSize: es.schrift || 14, cursorBlink: true, theme: this.SCHEMATA[es.schema] || this.SCHEMATA.Nacht, scrollback: 5000, allowProposedApi: false });
        fit = new FitAddon.FitAddon(); term.loadAddon(fit);
        term.open(inhalt);
        const passen = () => { try { fit.fit(); Z.sys.terminalGroesse(id, term.cols, term.rows); } catch {} };
        term.onData((d) => Z.sys.terminalEingabe(id, d));
        abmelden = Z.auf('terminal:daten', (d) => {
          if (d.id !== id) return;
          if (d.daten) term.write(d.daten);
          if (d.ende) { term.write('\r\n\x1b[2m[Sitzung beendet' + (d.fehler ? ': ' + d.fehler : '') + ']\x1b[0m\r\n'); if (opt.schliessenAmEnde) setTimeout(() => f.schliessen(), 600); }
        });
        Z.sys.terminalStarten(id, { befehl: opt.befehl || null }).then((r) => { if (!r.ok) term.write('\x1b[31m' + (r.fehler || 'Terminal konnte nicht starten') + '\x1b[0m\r\n'); setTimeout(passen, 60); term.focus(); });
        new ResizeObserver(entprellen(passen, 60)).observe(inhalt);
        inhalt.addEventListener('mousedown', () => setTimeout(() => term.focus(), 0));
        this.sitzungen.set(id, term);
      },
      beimSchliessen: () => { Z.sys.terminalBeenden(id); abmelden && abmelden(); this.sitzungen.delete(id); try { term && term.dispose(); } catch {} return true; },
    });
    return f;
  },
  schrift(term, fit, d) { if (!term) return; term.options.fontSize = Math.max(9, Math.min(28, term.options.fontSize + d)); Einst.setzen({ terminal: { schrift: term.options.fontSize } }); try { fit.fit(); } catch {} },
};

// ---------- Aktivitätsanzeige ----------
const Aktivitaet = {
  timer: null, sort: 'cpu',
  oeffnen() {
    FM.oeffnen({ id: 'aktivitaet', appId: 'aktivitaet', titel: 'Aktivitätsanzeige', symbol: 'aktivitaet', breite: 760, hoehe: 560, minBreite: 480, minHoehe: 320,
      aufbauen: (inhalt) => {
        this.kopf = el('div', { klasse: 'sy-kacheln' }); this.liste = el('div', { klasse: 'sy-tabelle' });
        inhalt.append(el('div', { klasse: 'sy-seite' }, this.kopf, this.liste));
        this.holen(); this.timer = setInterval(() => this.holen(), 2500);
      },
      beimSchliessen: () => { clearInterval(this.timer); return true; } });
  },
  async holen() {
    const r = await Z.sys.prozesse(); if (!r.ok || !this.kopf.isConnected) return;
    leeren(this.kopf).append(
      el('div', { klasse: 'sy-kachel' }, el('b', { text: r.cpu + ' %' }), el('span', { text: `CPU · ${r.kerne} Kerne · Last ${r.last[0].toFixed(2)}` }), balken(r.cpu)),
      el('div', { klasse: 'sy-kachel' }, el('b', { text: groesse(r.ram - r.ramFrei) }), el('span', { text: 'Arbeitsspeicher von ' + groesse(r.ram) }), balken(prozent(r.ram - r.ramFrei, r.ram), 'var(--gruen)')),
      el('div', { klasse: 'sy-kachel' }, el('b', { text: groesse(r.netz.down) + '/s' }), el('span', { text: 'Netz · hoch ' + groesse(r.netz.up) + '/s' }), balken(Math.min(100, r.netz.down / 50000), 'var(--orange)')));
    const zeilen = [...r.liste].sort((a, b) => (this.sort === 'name' ? a.name.localeCompare(b.name) : b[this.sort] - a[this.sort])).slice(0, 80);
    const kopf = el('div', { klasse: 'sy-zeile kopf' }, ...[['name', 'Prozess'], ['pid', 'PID'], ['benutzer', 'Benutzer'], ['cpu', 'CPU %'], ['rss', 'Speicher'], ['', '']].map(([k, t]) => el('span', { text: t, onclick: () => { if (k && k !== 'benutzer') { this.sort = k; this.holen(); } } })));
    leeren(this.liste).append(kopf, ...zeilen.map((p) => el('div', { klasse: 'sy-zeile' }, el('span', { text: p.name }), el('span', { text: p.pid }), el('span', { text: p.benutzer }), el('span', { text: p.cpu.toFixed(1) }), el('span', { text: groesse(p.rss) }),
      el('button', { klasse: 'knopf mini', onclick: async () => { if (!await fragen(`«${p.name}» beenden?`, `Prozess ${p.pid} wird beendet. Nicht gespeicherte Daten gehen verloren.`, 'Beenden', true)) return; const b = await Z.sys.beenden(p.pid, false); b.ok ? hinweis('Prozess beendet', 'ok') : hinweis(b.fehler, 'fehler'); this.holen(); } }, 'Beenden'))));
  },
};

// ---------- Software (Flatpak, Web-Apps, Windows-Programme, Updates) ----------
const Software = {
  EMPFOHLEN: [
    { id: 'org.mozilla.firefox', name: 'Firefox', beschreibung: 'Webbrowser' }, { id: 'org.videolan.VLC', name: 'VLC', beschreibung: 'Spielt fast jedes Video und jede Musik' },
    { id: 'md.obsidian.Obsidian', name: 'Obsidian', beschreibung: 'Notizen und Wissen' }, { id: 'com.visualstudio.code', name: 'Visual Studio Code', beschreibung: 'Code-Editor' },
    { id: 'org.libreoffice.LibreOffice', name: 'LibreOffice', beschreibung: 'Texte, Tabellen, Präsentationen' }, { id: 'org.telegram.desktop', name: 'Telegram', beschreibung: 'Nachrichten' },
  ],
  oeffnen(ansicht = 'empfohlen') {
    this.ansicht = ansicht;
    if (FM.finden('software')) { FM.oeffnen({ id: 'software' }); return this.zeichnen(); }
    FM.oeffnen({ id: 'software', appId: 'software', titel: 'Software', symbol: 'software', breite: 880, hoehe: 620, minBreite: 560, minHoehe: 380,
      aufbauen: (inhalt) => {
        this.seite = el('div', { klasse: 'ein-seite' }); this.haupt = el('div', { klasse: 'ein-haupt' });
        inhalt.append(el('div', { klasse: 'ein' }, this.seite, this.haupt)); this.zeichnen();
      } });
  },
  zeichnen() {
    const b = [['empfohlen', 'Empfohlen', 'software'], ['suche', 'Flathub durchsuchen', 'suche'], ['installiert', 'Installiert', 'haken'], ['web', 'Web-Apps', 'browser'], ['windows', 'Windows-Programme', 'pc'], ['updates', 'Updates', 'update']];
    leeren(this.seite).append(...b.map(([id, name, s]) => el('button', { klasse: 'f-ort' + (this.ansicht === id ? ' aktiv' : ''), onclick: () => { this.ansicht = id; this.zeichnen(); } }, el('span', { html: symbol(s) }).firstElementChild, el('span', { klasse: 'name', text: name }))));
    leeren(this.haupt); this[this.ansicht](this.haupt);
  },
  karte(a, installiert) {
    const knopf = el('button', { klasse: 'knopf' + (installiert ? ' gefahr' : ' haupt') }, installiert ? 'Entfernen' : 'Installieren');
    knopf.addEventListener('click', async () => {
      knopf.disabled = true; knopf.textContent = installiert ? 'Wird entfernt …' : 'Wird installiert …';
      const r = installiert ? await Z.sys.flatpakEntfernen(a.id) : await Z.sys.flatpakInstallieren(a.id);
      r.ok ? hinweis(`${a.name} ${installiert ? 'entfernt' : 'installiert'}`, 'ok') : hinweis(r.fehler || 'Hat nicht geklappt', 'fehler', a.name);
      Launchpad.neuLaden(); this.zeichnen();
    });
    return el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'text' }, el('div', { klasse: 't', text: a.name }), el('div', { klasse: 'u', text: [a.beschreibung, a.id, a.version].filter(Boolean).join(' · ') })), knopf);
  },
  async empfohlen(i) {
    const E = EinstellungenApp;
    i.append(el('h2', { text: 'Empfohlen' }), el('p', { klasse: 'unter', text: 'Programme kommen von Flathub und werden nur für dein Benutzerkonto installiert – ohne Administrator-Passwort.' }));
    i.append(E.block('Trading', E.karte(E.reihe('MetaTrader 5', 'Windows-Programm, läuft über Wine. Der Assistent lädt den offiziellen Installer von MetaQuotes; nichts davon ist im System mitgeliefert.',
      el('button', { klasse: 'knopf haupt', onclick: () => Software.mt5() }, 'Assistent starten')))));
    const inst = await Z.sys.flatpakListe(); const da = new Set((inst.liste || []).map((x) => x.id));
    i.append(E.block('Programme', el('div', { klasse: 'ein-karte' }, this.EMPFOHLEN.map((a) => this.karte(a, da.has(a.id))))));
  },
  suche(i) {
    const feld = el('input', { klasse: 'feld breit', placeholder: 'Programm suchen, z. B. «gimp»', value: this.letzteSuche || '' });
    const liste = el('div', { klasse: 'ein-karte' });
    const los = async () => {
      const t = feld.value.trim(); if (t.length < 2) return; this.letzteSuche = t;
      leeren(liste).append(el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'lader' }), el('div', { klasse: 'u', text: 'Flathub wird durchsucht (beim ersten Mal dauert das länger) …' })));
      const [r, inst] = await Promise.all([Z.sys.flatpakSuche(t), Z.sys.flatpakListe()]); const da = new Set((inst.liste || []).map((x) => x.id));
      leeren(liste);
      if (!r.ok) return liste.append(el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'u', text: 'Suche fehlgeschlagen: ' + r.fehler })));
      if (!r.liste.length) return liste.append(el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'u', text: 'Nichts gefunden.' })));
      liste.append(...r.liste.map((a) => this.karte(a, da.has(a.id))));
    };
    feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') los(); });
    i.append(el('h2', { text: 'Flathub durchsuchen' }), el('div', { stil: { display: 'flex', gap: '8px', marginBottom: '14px' } }, feld, el('button', { klasse: 'knopf haupt', onclick: los }, 'Suchen')), liste);
    setTimeout(() => feld.focus(), 50);
  },
  async installiert(i) {
    i.append(el('h2', { text: 'Installiert' }));
    const r = await Z.sys.flatpakListe();
    const k = el('div', { klasse: 'ein-karte' });
    if (!r.ok) k.append(el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'u', text: r.fehler })));
    else if (!r.liste.length) k.append(el('div', { klasse: 'ein-reihe' }, el('div', { klasse: 'u', text: 'Noch keine Flatpak-Programme installiert.' })));
    else k.append(...r.liste.map((a) => this.karte(a, true)));
    i.append(k);
  },
  async web(i) {
    const E = EinstellungenApp;
    const name = el('input', { klasse: 'feld', placeholder: 'Name' }); const adr = el('input', { klasse: 'feld breit', placeholder: 'https://…' });
    i.append(el('h2', { text: 'Web-Apps' }), el('p', { klasse: 'unter', text: 'Eine Webseite als eigenes Programm: eigenes Fenster ohne Adressleiste, erscheint im Launchpad und in Spotlight.' }));
    i.append(E.block('Neue Web-App', E.karte(E.reihe('Name', null, name), E.reihe('Adresse', null, adr), E.reihe('Anlegen', null, el('button', { klasse: 'knopf haupt', onclick: async () => {
      const r = await Z.sys.webAppAnlegen({ name: name.value, adresse: adr.value.trim() }); if (!r.ok) return hinweis(r.fehler, 'fehler'); hinweis('Web-App angelegt', 'ok'); Launchpad.neuLaden(); this.zeichnen(); } }, 'Anlegen')))));
    const p = await Z.sys.programme(); const eigene = (p.liste || []).filter((x) => x.id.startsWith('zos-webapp-'));
    if (eigene.length) i.append(E.block('Deine Web-Apps', el('div', { klasse: 'ein-karte' }, eigene.map((a) => E.reihe(a.name, a.exec.replace(/^chromium --app=/, '').split(' ')[0], el('div', { stil: { display: 'flex', gap: '6px' } },
      el('button', { klasse: 'knopf', onclick: () => Z.sys.programmStarten(a.id) }, 'Öffnen'), el('button', { klasse: 'knopf gefahr', onclick: async () => { await Z.sys.eigenesEntfernen(a.id); Launchpad.neuLaden(); this.zeichnen(); } }, 'Entfernen')))))));
  },
  windows(i) {
    const E = EinstellungenApp;
    i.append(el('h2', { text: 'Windows-Programme' }), el('p', { klasse: 'unter', text: 'Windows-Programme laufen über Wine, jedes in einem eigenen Ordner («Präfix»). Wine wird beim ersten Mal nachinstalliert (Administrator-Passwort, Internet nötig).' }));
    i.append(E.block(null, E.karte(
      E.reihe('MetaTrader 5 installieren', 'Lädt den offiziellen Installer von MetaQuotes und richtet ein eigenes Präfix ein.', el('button', { klasse: 'knopf haupt', onclick: () => this.mt5() }, 'Assistent starten')),
      E.reihe('Anderes Windows-Programm (.exe)', 'Wähle einen Installer. Er läuft in einem eigenen Präfix.', el('button', { klasse: 'knopf', onclick: async () => {
        const a = await abfragen('Windows-Programm installieren', 'Voller Pfad zum Installer (.exe), z. B. /home/…/Downloads/setup.exe', '', 'Weiter'); if (!a) return;
        TerminalApp.oeffnen({ titel: 'Windows-Programm installieren', befehl: `/opt/zentraleos/erweiterungen/wine-assistent.sh '${String(a).replace(/'/g, '')}'` }); } }, 'Installer wählen')))));
    i.append(el('p', { klasse: 'unter', text: 'Stand: Der Assistent ist gebaut, aber in dieser Version noch nicht in einer VM durchgetestet. Siehe MT5-BERICHT.md.' }));
  },
  mt5() { TerminalApp.oeffnen({ titel: 'MetaTrader 5 installieren', befehl: '/opt/zentraleos/erweiterungen/mt5-installieren.sh' }); },
  updates(i) {
    const E = EinstellungenApp; const aus = el('pre', { klasse: 'sy-aus', text: 'Noch nicht gesucht.' });
    const tun = async (text, fn) => { aus.textContent = text + ' …'; const r = await fn(); aus.textContent = r.abgebrochen ? 'Abgebrochen.' : (r.aus || r.fehler || (r.ok ? 'Alles aktuell.' : 'Fehler')).trim() || 'Alles aktuell.'; };
    i.append(el('h2', { text: 'Updates' }), E.block('System (apt)', E.karte(
      E.reihe('Nach Updates suchen', 'Braucht das Administrator-Passwort.', el('button', { klasse: 'knopf haupt', onclick: () => tun('Suche', () => root('updates-suchen', [], 'Paketlisten werden aktualisiert.')) }, 'Suchen')),
      E.reihe('Updates einspielen', 'Lädt und installiert alle verfügbaren Systemupdates.', el('button', { klasse: 'knopf', onclick: () => tun('Installiere', () => root('updates-einspielen', [], 'Systemupdates werden installiert.')) }, 'Einspielen')))),
    E.block('Programme (Flatpak)', E.karte(E.reihe('Programme aktualisieren', 'Ohne Passwort, nur dein Konto.', el('button', { klasse: 'knopf', onclick: () => tun('Aktualisiere', () => Z.sys.flatpakAktualisieren()) }, 'Aktualisieren')))), aus,
    el('p', { klasse: 'unter', text: 'Rollback (zurück zum Stand vor einem Update) gibt es in dieser Version noch nicht – siehe LIESMICH, Abschnitt Ausbaupfad.' }));
  },
};

// ---------- Launchpad ----------
const Launchpad = {
  liste: null,
  async laden() { if (!this.liste) { const r = await Z.sys.programme(); this.liste = r.ok ? r.liste : []; this.eintragen(); } return this.liste; },
  neuLaden() { this.liste = null; return this.laden(); },
  // Fremde Programme bekommen einen Eintrag in Apps, damit Dock, Schreibtisch und Spotlight sie kennen.
  eintragen() {
    for (const k of Object.keys(Apps)) if (k.startsWith('prog:')) delete Apps[k];
    for (const p of this.liste) Apps['prog:' + p.id] = { name: p.name, symbol: 'datei', bild: p.symbol, fremd: true, farbe: 'linear-gradient(160deg,#475569,#1e293b)', oeffnen: () => Z.sys.programmStarten(p.id).then((r) => r.ok || hinweis(r.fehler, 'fehler')) };
  },
  alle() { return Object.entries(Apps).filter(([id, a]) => id !== 'zentrale' && id !== 'launchpad' && a && a.name).map(([id, a]) => ({ id, ...a })); },
  symbolEl(a, klasse = 'lp-symbol') {
    const s = el('span', { klasse, html: a.bild ? '' : symbol(a.symbol), stil: a.bild ? {} : { background: a.farbe || 'var(--flaeche)' } });
    if (a.bild) Z.sys.symbolUrl(a.bild).then((r) => { if (r.ok) s.append(el('img', { src: r.url, alt: '', onerror: () => { s.innerHTML = symbol(a.symbol || 'datei'); s.style.background = a.farbe || 'linear-gradient(160deg,#475569,#1e293b)'; } })); });
    return s;
  },
  async oeffnen() {
    if ($('#launchpad')) return this.schliessen();
    await this.laden();
    const feld = el('input', { klasse: 'lp-suche', placeholder: 'Suchen' }); const gitter = el('div', { klasse: 'lp-gitter' });
    const zeichnen = () => { const t = feld.value.trim().toLowerCase(); leeren(gitter).append(...this.alle().filter((a) => !t || a.name.toLowerCase().includes(t)).map((a) => el('button', { klasse: 'lp-app', onclick: () => { this.schliessen(); a.oeffnen(); } }, this.symbolEl(a), el('span', { klasse: 'lp-name', text: a.name })))); };
    feld.addEventListener('input', zeichnen);
    const lp = el('div', { id: 'launchpad', klasse: 'launchpad', onclick: (e) => { if (e.target === lp || e.target === gitter) this.schliessen(); } }, feld, gitter);
    lp.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.schliessen(); if (e.key === 'Enter') { const erste = gitter.querySelector('.lp-app'); erste && erste.click(); } });
    $('#ebenen').append(lp); zeichnen(); requestAnimationFrame(() => { lp.classList.add('da'); feld.focus(); });
  },
  schliessen() { const lp = $('#launchpad'); if (!lp) return; lp.classList.remove('da'); setTimeout(() => lp.remove(), 180); },
};

// ---------- Spotlight ----------
const Spotlight = {
  BEFEHLE: () => [
    { name: 'Sperren', unter: 'Systembefehl', tun: () => Z.sperren({ bildschirmAus: false }) },
    { name: 'Bildschirmfoto', unter: 'Systembefehl', tun: () => Z.sys.bildschirmfoto(false).then((r) => (r.ok ? hinweis('Gespeichert: ' + r.pfad, 'ok') : hinweis(r.fehler, 'fehler'))) },
    { name: 'Neustart', unter: 'Systembefehl', tun: () => Schreibtisch.energie('neustart') }, { name: 'Ausschalten', unter: 'Systembefehl', tun: () => Schreibtisch.energie('aus') },
    { name: 'MetaTrader 5 installieren', unter: 'Assistent', tun: () => Software.mt5() }, { name: 'WLAN-Einstellungen', unter: 'Einstellungen', tun: () => Apps.einstellungen.oeffnen('wlan') },
    { name: 'Firewall', unter: 'Einstellungen', tun: () => Apps.einstellungen.oeffnen('firewall') }, { name: 'Updates', unter: 'Software', tun: () => Software.oeffnen('updates') },
  ],
  EINHEITEN: { km: ['mi', 0.621371], mi: ['km', 1.609344], kg: ['lb', 2.204623], lb: ['kg', 0.453592], chf: null },
  rechnen(t) {
    const e = t.match(/^\s*([\d.]+)\s*(km|mi|kg|lb)\s*$/i);
    if (e) { const [ziel, f] = this.EINHEITEN[e[2].toLowerCase()]; return `${e[1]} ${e[2]} = ${(parseFloat(e[1]) * f).toFixed(2)} ${ziel}`; }
    const g = t.match(/^\s*([\d.]+)\s*°?c\s*$/i); if (g) return `${g[1]} °C = ${(parseFloat(g[1]) * 9 / 5 + 32).toFixed(1)} °F`;
    if (!/^[\d\s+\-*/().,%^]+$/.test(t) || !/\d/.test(t) || !/[+\-*/%^]/.test(t)) return null;
    return this.ausdruck(t.replace(/,/g, '.'));
  },
  // Kleiner Rechner ohne eval: + - * / ^ % und Klammern.
  ausdruck(text) {
    const z = text.replace(/\s+/g, ''); let i = 0;
    const zahl = () => { if (z[i] === '(') { i++; const v = summe(); if (z[i] === ')') i++; return v; } if (z[i] === '-') { i++; return -zahl(); } const m = z.slice(i).match(/^\d*\.?\d+/); if (!m) throw 0; i += m[0].length; let v = parseFloat(m[0]); if (z[i] === '%') { i++; v /= 100; } return v; };
    const potenz = () => { const b = zahl(); if (z[i] === '^') { i++; return b ** potenz(); } return b; };
    const produkt = () => { let v = potenz(); while (z[i] === '*' || z[i] === '/') { const o = z[i++]; const w = potenz(); v = o === '*' ? v * w : v / w; } return v; };
    const summe = () => { let v = produkt(); while (z[i] === '+' || z[i] === '-') { const o = z[i++]; const w = produkt(); v = o === '+' ? v + w : v - w; } return v; };
    try { const v = summe(); return i === z.length && Number.isFinite(v) ? `${text.trim()} = ${Math.round(v * 1e10) / 1e10}` : null; } catch { return null; }
  },
  async oeffnen() {
    if ($('#spotlight')) return this.schliessen();
    await Launchpad.laden();
    const feld = el('input', { klasse: 'sp-feld', placeholder: 'Spotlight: Programme, Rechnen, Befehle' }); const liste = el('div', { klasse: 'sp-liste' }); let treffer = []; let wahl = 0;
    const zeichnen = () => {
      const t = feld.value.trim().toLowerCase(); treffer = [];
      if (t) {
        const r = this.rechnen(feld.value); if (r) treffer.push({ name: r, unter: 'Rechner · Enter kopiert', symbolName: 'info', tun: () => { Z.system.kopieren(r.split('= ').pop()); hinweis('Ergebnis kopiert', 'ok'); } });
        treffer.push(...Launchpad.alle().filter((a) => a.name.toLowerCase().includes(t)).slice(0, 7).map((a) => ({ name: a.name, unter: a.fremd ? 'Programm' : a.zentrale ? 'Zentrale' : 'ZentraleOS', app: a, tun: () => a.oeffnen() })));
        treffer.push(...this.BEFEHLE().filter((b) => b.name.toLowerCase().includes(t)).map((b) => ({ ...b, symbolName: 'einstellungen' })));
      }
      wahl = Math.min(wahl, Math.max(0, treffer.length - 1));
      leeren(liste).append(...treffer.map((x, n) => el('button', { klasse: 'sp-zeile' + (n === wahl ? ' gewaehlt' : ''), onclick: () => { this.schliessen(); x.tun(); } }, x.app ? Launchpad.symbolEl(x.app, 'sp-symbol') : el('span', { klasse: 'sp-symbol', html: symbol(x.symbolName || 'datei') }), el('span', { klasse: 'sp-name', text: x.name }), el('span', { klasse: 'sp-unter', text: x.unter }))));
    };
    feld.addEventListener('input', () => { wahl = 0; zeichnen(); });
    feld.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.schliessen();
      else if (e.key === 'ArrowDown') { e.preventDefault(); wahl = Math.min(treffer.length - 1, wahl + 1); zeichnen(); } else if (e.key === 'ArrowUp') { e.preventDefault(); wahl = Math.max(0, wahl - 1); zeichnen(); }
      else if (e.key === 'Enter' && treffer[wahl]) { this.schliessen(); treffer[wahl].tun(); }
    });
    const sp = el('div', { id: 'spotlight', klasse: 'spotlight', onmousedown: (e) => { if (e.target === sp) this.schliessen(); } }, el('div', { klasse: 'sp-kasten' }, el('div', { klasse: 'sp-kopf' }, el('span', { html: symbol('suche') }), feld), liste));
    $('#ebenen').append(sp); requestAnimationFrame(() => { sp.classList.add('da'); feld.focus(); });
  },
  schliessen() { const sp = $('#spotlight'); if (sp) sp.remove(); },
};

// ---------- Kontrollzentrum ----------
const Kontrollzentrum = {
  async oeffnen(knopf) {
    if ($('#kontrollzentrum')) return this.schliessen();
    const kz = el('div', { id: 'kontrollzentrum', klasse: 'kontrollzentrum' }, el('div', { klasse: 'lader' }));
    $('#ebenen').append(kz);
    const zu = (e) => { if (!kz.contains(e.target) && e.target !== knopf && !knopf.contains(e.target)) { this.schliessen(); document.removeEventListener('mousedown', zu, true); } };
    setTimeout(() => document.addEventListener('mousedown', zu, true), 0);
    const [w, b, t, h, ts] = await Promise.all([Z.sys.wlan(), Z.sys.bluetooth(), Z.sys.ton(), Z.sys.helligkeit(), Z.sys.tailscale()]);
    if (!kz.isConnected) return;
    const kachel = (name, unter, an, symbolName, tun, mehr) => { const k = el('button', { klasse: 'kz-kachel' + (an ? ' an' : '') }, el('span', { klasse: 'kz-symbol', html: symbol(symbolName) }), el('span', { klasse: 'kz-text' }, el('b', { text: name }), el('small', { text: unter }))); k.addEventListener('click', tun); k.addEventListener('contextmenu', (e) => { e.preventDefault(); mehr && mehr(); }); return k; };
    const aktiv = (w.netze || []).find((n) => n.aktiv); const kabel = (w.geraete || []).find((g) => g.typ === 'ethernet' && g.zustand === 'connected');
    const regler = (name, wert, tun, aus) => { const r = el('input', { type: 'range', min: 0, max: 100, value: wert, disabled: !!aus }); r.addEventListener('input', entprellen(() => tun(Number(r.value)), 60)); return el('div', { klasse: 'kz-regler' }, el('small', { text: name }), r); };
    const exit = (ts.geraete || []).filter((g) => g.exitMoeglich);
    leeren(kz).append(...[
      el('div', { klasse: 'kz-gitter' },
        kachel(aktiv || !kabel ? 'WLAN' : 'Netzwerk', !w.ok ? 'nicht verfügbar' : aktiv ? aktiv.ssid : kabel ? 'Kabel verbunden' : !w.wlanGeraet ? 'kein WLAN-Gerät' : w.an ? 'nicht verbunden' : 'aus', w.ok && (!!aktiv || !!kabel), 'wlan', async () => { if (w.wlanGeraet) await Z.sys.wlanSchalten(!w.an); this.neu(knopf); }, () => { this.schliessen(); Apps.einstellungen.oeffnen('wlan'); }),
        kachel('Bluetooth', !b.ok || !b.vorhanden ? 'kein Gerät' : b.an ? 'an' : 'aus', b.ok && b.an, 'bluetooth', async () => { if (b.vorhanden) await Z.sys.bluetoothSchalten(!b.an); this.neu(knopf); }),
        kachel('Tailscale', !ts.ok ? 'nicht installiert' : ts.angemeldet ? (exit.find((g) => g.exitAktiv)?.name ? 'über ' + exit.find((g) => g.exitAktiv).name : 'verbunden') : 'nicht angemeldet', ts.ok && ts.angemeldet, 'tailscale', () => { this.schliessen(); Apps.einstellungen.oeffnen('tailscale'); }),
        kachel('Dunkelmodus', Einst.daten.aussehen.hell ? 'aus' : 'an', !Einst.daten.aussehen.hell, 'mond', async () => { await Einst.setzenAsync({ aussehen: { hell: !Einst.daten.aussehen.hell } }); Schreibtisch.aussehenAnwenden(); this.neu(knopf); }),
        kachel('Nicht stören', Mitteilungen.ruhe ? 'an' : 'aus', Mitteilungen.ruhe, 'mond', () => { Mitteilungen.ruhe = !Mitteilungen.ruhe; this.neu(knopf); }),
        kachel('Sperren', 'Super + L', false, 'schloss', () => { this.schliessen(); Z.sperren({ bildschirmAus: false }); })),
      regler('Ton' + (t.ok && t.vorhanden ? '' : ' (kein Ausgabegerät)'), t.lautstaerke || 0, (v) => Z.sys.tonSetzen(v), !t.ok || !t.vorhanden),
      regler('Helligkeit' + (h.vorhanden ? '' : ' (nicht steuerbar)'), h.prozent || 100, (v) => Z.sys.helligkeitSetzen(v), !h.vorhanden),
      exit.length ? el('div', { klasse: 'kz-regler' }, el('small', { text: 'Exit-Node' }), EinstellungenApp.auswahl(exit.find((g) => g.exitAktiv)?.ip || '', [['', 'keiner'], ...exit.map((g) => [g.ip, g.name])], async (ip) => { const r = await Z.sys.tailscaleExit(ip); r.ok ? hinweis('Exit-Node gesetzt', 'ok') : hinweis(r.fehler, 'fehler'); })) : null].filter(Boolean));
  },
  neu(knopf) { this.schliessen(); this.oeffnen(knopf); },
  schliessen() { const k = $('#kontrollzentrum'); if (k) k.remove(); },
};

// ---------- Mitteilungen (Verlauf der Hinweise) ----------
const Mitteilungen = {
  liste: [], ruhe: false,
  merken(text, art, titel) { this.liste.unshift({ text: String(text), art, titel, zeit: Date.now() }); this.liste.length = Math.min(this.liste.length, 40); },
  oeffnen(knopf) {
    if ($('#mitteilungen')) return $('#mitteilungen').remove();
    const m = el('div', { id: 'mitteilungen', klasse: 'kontrollzentrum mitteilungen' }, el('div', { klasse: 'kz-titel' }, el('b', { text: 'Mitteilungen' }), el('button', { klasse: 'knopf mini', onclick: () => { this.liste = []; m.remove(); } }, 'Leeren')),
      this.liste.length ? this.liste.map((x) => el('div', { klasse: 'mt-eintrag ' + x.art }, el('small', { text: `${uhr(new Date(x.zeit))} · ${x.titel || { fehler: 'Fehler', warnung: 'Achtung', ok: 'Erledigt' }[x.art] || 'Hinweis'}` }), el('div', { text: x.text }))) : el('div', { klasse: 'u', text: 'Keine Mitteilungen.' }));
    $('#ebenen').append(m);
    const zu = (e) => { if (!m.contains(e.target) && !knopf.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', zu, true); } };
    setTimeout(() => document.addEventListener('mousedown', zu, true), 0);
  },
};
{ const alt = hinweis; window.hinweis = function (text, art = 'info', titel = null) { Mitteilungen.merken(text, art, titel); if (Mitteilungen.ruhe && art !== 'fehler') return null; return alt(text, art, titel); }; }

// ---------- Einstellungen: System-Bereiche ----------
EinstellungenApp.BEREICHE = [
  { id: 'wlan', name: 'WLAN', symbol: 'wlan' }, { id: 'bluetooth', name: 'Bluetooth', symbol: 'bluetooth' }, { id: 'netzwerk', name: 'Netzwerk', symbol: 'netz' }, { id: 'tailscale', name: 'Tailscale', symbol: 'tailscale' },
  { id: 'anzeige', name: 'Anzeige', symbol: 'anzeige' }, { id: 'ton', name: 'Ton', symbol: 'ton' }, { id: 'energie', name: 'Energie', symbol: 'akku' }, { id: 'tastatur', name: 'Tastatur', symbol: 'tastatur' },
  { id: 'datum', name: 'Datum & Uhrzeit', symbol: 'uhr' }, { id: 'benutzer', name: 'Benutzer & Passwort', symbol: 'benutzer' }, { id: 'firewall', name: 'Firewall & Sicherheit', symbol: 'schild' },
  { id: 'updates', name: 'Software-Updates', symbol: 'update' }, { id: 'speicherplatz', name: 'Speicher', symbol: 'festplatte' },
  { id: 'aussehen', name: 'Erscheinungsbild', symbol: 'bild' }, { id: 'dock', name: 'Dock & Schreibtisch', symbol: 'raster' }, { id: 'anmeldung', name: 'Anmeldung & Sperre', symbol: 'schloss' },
  { id: 'verbindung', name: 'Zentrale', symbol: 'pi' }, { id: 'finder', name: 'Finder', symbol: 'finder' }, { id: 'freigaben', name: 'Geteilte Links', symbol: 'teilen' }, { id: 'verhalten', name: 'Verhalten', symbol: 'strom' }, { id: 'ueber', name: 'Über', symbol: 'info' },
];
EinstellungenApp.bereich = 'wlan';
Object.assign(EinstellungenApp, {
  kopf(i, titel, unter) { i.append(el('h2', { text: titel })); if (unter) i.append(el('p', { klasse: 'unter', text: unter })); },
  wert: (t) => el('span', { klasse: 'u', text: t }),
  nichtDa(i, r) { i.append(this.block(null, this.karte(this.reihe('Nicht verfügbar', r.fehler || 'Dieses Gerät oder Werkzeug ist auf diesem Rechner nicht vorhanden.', null)))); },
  neu() { if (this.fenster) this.zeichnen(); },

  async wlan(i) {
    this.kopf(i, 'WLAN', 'Netze in Reichweite. Verbindungen verwaltet der NetworkManager.');
    const r = await Z.sys.wlan(); if (this.bereich !== 'wlan') return; if (!r.ok) return this.nichtDa(i, r);
    i.append(this.block(null, this.karte(this.reihe('WLAN', r.wlanGeraet ? null : 'Kein WLAN-Gerät gefunden (in einer VM normal).', r.wlanGeraet ? this.schalter(r.an, async (x) => { await Z.sys.wlanSchalten(x); setTimeout(() => this.neu(), 1500); }) : null),
      this.reihe('Netze neu suchen', null, el('button', { klasse: 'knopf', onclick: () => this.neu() }, 'Aktualisieren')))));
    if (r.netze.length) i.append(this.block('Netze', el('div', { klasse: 'ein-karte' }, r.netze.map((n) => this.reihe((n.aktiv ? '✓ ' : '') + n.ssid, `Signal ${n.signal} %${n.sicher ? ' · gesichert' : ' · offen'}`, el('button', { klasse: 'knopf' + (n.aktiv ? '' : ' haupt'), onclick: async () => {
      if (n.aktiv) return;
      const pw = n.sicher ? await dialog({ titel: `Mit «${n.ssid}» verbinden`, text: 'WLAN-Passwort eingeben. Ist das Netz schon gespeichert, einfach leer lassen.', felder: [{ type: 'password', platzhalter: 'Passwort' }], okText: 'Verbinden' }) : [''];
      if (!pw) return; hinweis('Verbinde mit ' + n.ssid + ' …');
      const v = await Z.sys.wlanVerbinden(n.ssid, pw[0]); v.ok ? hinweis('Verbunden mit ' + n.ssid, 'ok') : hinweis(v.fehler || 'Verbindung fehlgeschlagen', 'fehler'); this.neu();
    } }, n.aktiv ? 'Verbunden' : 'Verbinden'))))));
  },
  async bluetooth(i) {
    this.kopf(i, 'Bluetooth'); const r = await Z.sys.bluetooth(); if (this.bereich !== 'bluetooth') return; if (!r.ok) return this.nichtDa(i, r);
    i.append(this.block(null, this.karte(this.reihe('Bluetooth', r.vorhanden ? null : 'Kein Bluetooth-Gerät gefunden.', r.vorhanden ? this.schalter(r.an, async (x) => { await Z.sys.bluetoothSchalten(x); setTimeout(() => this.neu(), 800); }) : null))));
    if (r.geraete.length) i.append(this.block('Bekannte Geräte', el('div', { klasse: 'ein-karte' }, r.geraete.map((g) => this.reihe(g.name, g.adresse, null)))));
    i.append(el('p', { klasse: 'unter', text: 'Neue Geräte koppeln geht in dieser Version im Terminal: bluetoothctl → scan on → pair <Adresse>.' }));
  },
  async netzwerk(i) {
    this.kopf(i, 'Netzwerk'); const [r, inf] = await Promise.all([Z.sys.wlan(), Z.sys.info()]); if (this.bereich !== 'netzwerk') return; if (!r.ok) return this.nichtDa(i, r);
    i.append(this.block('Verbindungen', el('div', { klasse: 'ein-karte' }, r.geraete.map((g) => this.reihe(g.name, `${g.typ} · ${g.zustand}${g.verbindung ? ' · ' + g.verbindung : ''}`, g.zustand === 'connected' && g.typ !== 'tun' ? el('button', { klasse: 'knopf', onclick: async () => { await Z.sys.wlanTrennen(g.name); this.neu(); } }, 'Trennen') : null)))));
    i.append(this.block('Adressen', this.karte(...r.adressen.map((a) => this.reihe(a, null, null)), r.adressen.length ? null : this.reihe('Keine Adresse', null, null))));
    const name = this.textfeld(inf.rechner, () => {});
    i.append(this.block('Rechnername', this.karte(this.reihe('Hostname', 'So heisst der Rechner im Netz.', el('div', { stil: { display: 'flex', gap: '6px' } }, name, el('button', { klasse: 'knopf', onclick: async () => {
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(name.value)) return hinweis('Nur Buchstaben, Ziffern und Bindestrich.', 'fehler');
      const x = await root('hostname', [name.value], 'Der Rechnername wird geändert.'); x.ok ? hinweis('Rechnername geändert', 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); } }, 'Setzen'))))));
  },
  async tailscale(i) {
    this.kopf(i, 'Tailscale', 'Sicheres Netz zu deinen Geräten und zur Zentrale.'); const r = await Z.sys.tailscale(); if (this.bereich !== 'tailscale') return; if (!r.ok) return this.nichtDa(i, r);
    const link = el('div', { klasse: 'u', stil: { userSelect: 'text', wordBreak: 'break-all' } });
    i.append(this.block(null, this.karte(this.reihe('Zustand', r.selbst ? `${r.selbst.name} · ${r.selbst.ip || ''}` : null, this.wert(r.angemeldet ? 'verbunden' : r.zustand || 'nicht angemeldet')),
      this.reihe('Anmelden', 'Erzeugt einen Anmelde-Link. Öffne ihn hier oder am Handy.', el('button', { klasse: 'knopf haupt', onclick: async () => {
        const x = await root('tailscale-anmelden', [], 'Tailscale wird für dein Konto freigegeben und ein Anmelde-Link erzeugt.'); const url = (x.aus || '').trim();
        if (url.startsWith('https://')) { link.textContent = url; Z.system.kopieren(url); hinweis('Anmelde-Link kopiert', 'ok'); } else x.abgebrochen || hinweis(x.ok ? 'Schon angemeldet oder kein Link erhalten.' : x.fehler, x.ok ? 'info' : 'fehler'); this.neu; } }, 'Link erzeugen')), this.reihe('Link', null, link))));
    const exit = r.geraete.filter((g) => g.exitMoeglich);
    i.append(this.block('Exit-Node', this.karte(this.reihe('Internet über ein anderes Gerät leiten', exit.length ? null : 'Kein Gerät bietet einen Exit-Node an.', exit.length ? this.auswahl(exit.find((g) => g.exitAktiv)?.ip || '', [['', 'keiner'], ...exit.map((g) => [g.ip, g.name])], async (ip) => { const x = await Z.sys.tailscaleExit(ip); x.ok ? hinweis('Exit-Node gesetzt', 'ok') : hinweis(x.fehler + ' – zuerst «Link erzeugen» ausführen.', 'fehler'); }) : null))));
    if (r.geraete.length) i.append(this.block('Geräte', el('div', { klasse: 'ein-karte' }, r.geraete.map((g) => this.reihe(g.name, `${g.ip || ''} · ${g.os || ''}`, this.wert(g.online ? 'online' : 'offline'))))));
  },
  async anzeige(i) {
    this.kopf(i, 'Anzeige'); const r = await Z.sys.anzeige(); if (this.bereich !== 'anzeige') return; if (!r.ok) return this.nichtDa(i, r);
    for (const b of r.bildschirme) {
      const akt = b.modi.find((m) => m.aktiv);
      i.append(this.block(b.name + (b.beschreibung ? ' · ' + b.beschreibung : ''), this.karte(
        this.reihe('Auflösung', null, this.auswahl(akt ? `${akt.breite}x${akt.hoehe}@${akt.hz}Hz` : '', b.modi.map((m) => [`${m.breite}x${m.hoehe}@${m.hz}Hz`, `${m.breite} × ${m.hoehe} · ${m.hz} Hz`]), async (m) => { const x = await Z.sys.anzeigeSetzen(b.name, { modus: m.replace(/@.*/, '') }); x.ok || hinweis(x.fehler, 'fehler'); })),
        this.reihe('Skalierung', 'Grösser für hochauflösende Bildschirme.', this.auswahl(String(b.skalierung), [['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %'], ['2', '200 %']], async (s) => { const x = await Z.sys.anzeigeSetzen(b.name, { skalierung: s }); x.ok || hinweis(x.fehler, 'fehler'); })))));
    }
    const h = await Z.sys.helligkeit();
    i.append(this.block('Helligkeit', this.karte(this.reihe('Helligkeit', h.vorhanden ? null : 'Auf diesem Gerät nicht steuerbar (externer Bildschirm oder VM).', h.vorhanden ? this.regler(h.prozent, 3, 100, (v) => Z.sys.helligkeitSetzen(v)) : null))));
    i.append(el('p', { klasse: 'unter', text: 'Auflösung und Skalierung gelten bis zum nächsten Abmelden; dauerhaft speichern und Nachtmodus folgen (Ausbaupfad).' }));
  },
  async ton(i) {
    this.kopf(i, 'Ton'); const r = await Z.sys.ton(); if (this.bereich !== 'ton') return; if (!r.ok) return this.nichtDa(i, r);
    i.append(this.block('Ausgabe', this.karte(this.reihe('Lautstärke', r.vorhanden ? null : 'Kein Ausgabegerät gefunden.', r.vorhanden ? this.regler(r.lautstaerke, 0, 100, (v) => Z.sys.tonSetzen(v)) : null),
      r.vorhanden ? this.reihe('Stumm', null, this.schalter(r.stumm, (x) => Z.sys.tonStumm(x))) : null,
      r.ausgaben.length ? this.reihe('Ausgabegerät', null, this.auswahl(String(r.ausgaben.find((a) => a.aktiv)?.id ?? ''), r.ausgaben.map((a) => [String(a.id), a.name]), async (id) => { await Z.sys.tonAusgabe(id); this.neu(); })) : null)));
  },
  async energie(i) {
    this.kopf(i, 'Energie', 'ZentraleOS geht von sich aus nie in den Ruhezustand – als Dauerläufer gedacht. Der Bildschirm darf ausgehen.'); const r = await Z.sys.energie(); if (this.bereich !== 'energie') return;
    const N = { 'power-saver': 'Sparsam', balanced: 'Ausgewogen', performance: 'Leistung' };
    i.append(this.block(null, this.karte(
      this.reihe('Energieprofil', r.profil ? null : 'Auf diesem Gerät nicht verfügbar.', r.profil ? this.auswahl(r.profil, r.profile.map((p) => [p, N[p] || p]), async (p) => { const x = await Z.sys.energieSetzen(p); x.ok ? hinweis('Profil: ' + (N[p] || p), 'ok') : hinweis(x.fehler, 'fehler'); }) : null),
      this.reihe('Akku', r.akku ? null : 'Kein Akku gefunden.', r.akku ? this.wert(`${r.akku.prozent} % · ${r.akku.zustand}`) : null),
      this.reihe('Bildschirm jetzt ausschalten', 'Maus oder Taste schaltet ihn wieder an.', el('button', { klasse: 'knopf', onclick: async () => { const x = await Z.system.bildschirmAus(); x.ok || hinweis(x.fehler, 'fehler'); } }, 'Ausschalten')),
      this.reihe('Neu starten', null, el('button', { klasse: 'knopf', onclick: () => Schreibtisch.energie('neustart') }, 'Neu starten')), this.reihe('Ausschalten', null, el('button', { klasse: 'knopf gefahr', onclick: () => Schreibtisch.energie('aus') }, 'Ausschalten')))));
  },
  async tastatur(i) {
    this.kopf(i, 'Tastatur'); const r = await Z.sys.tastatur();
    i.append(this.block(null, this.karte(this.reihe('Layout', `Aktiv in dieser Sitzung: ${r.aktiv || r.layout}. Eine Änderung gilt nach dem nächsten Neustart.`, this.auswahl(r.layout, [['ch', 'Schweiz (Deutsch)'], ['de', 'Deutschland'], ['us', 'USA'], ['fr', 'Frankreich'], ['it', 'Italien'], ['gb', 'Grossbritannien']], async (l) => { const x = await root('tastatur', [l], 'Das Tastaturlayout wird geändert.'); x.ok ? hinweis('Layout gespeichert – gilt nach dem Neustart', 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); })))));
    i.append(this.block('Tastenkürzel', this.karte(...[['Super + Leertaste', 'Spotlight'], ['Super + L', 'Sperren'], ['Super + Enter', 'Terminal-Fenster (foot)'], ['Super + Q', 'Fenster schliessen'], ['Super + ← / →', 'Fenster links / rechts einrasten'], ['Super + ↑ / ↓', 'Maximieren / Minimieren'], ['Strg + Super + ← / →', 'Schreibtisch wechseln'], ['Alt + Tab', 'Zwischen Fenstern wechseln'], ['Druck', 'Bildschirmfoto'], ['Strg + E', 'Finder'], ['Strg + ,', 'Einstellungen'], ['Strg + W / M', 'Shell-Fenster schliessen / minimieren']].map(([k, t]) => this.reihe(t, null, this.wert(k))))));
  },
  async datum(i) {
    this.kopf(i, 'Datum & Uhrzeit'); const [r, z] = await Promise.all([Z.sys.zeit(), Z.sys.zeitzonen()]); if (this.bereich !== 'datum') return;
    i.append(this.block(null, this.karte(this.reihe('Jetzt', null, this.wert(new Date().toLocaleString('de-CH'))),
      this.reihe('Zeitzone', null, this.auswahl(r.zeitzone, z.liste.map((t) => [t, t]), async (t) => { const x = await root('zeitzone', [t], 'Die Zeitzone wird geändert.'); x.ok ? hinweis('Zeitzone: ' + t, 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); this.neu(); })),
      this.reihe('Zeit automatisch stellen (NTP)', r.synchron ? 'Uhr ist synchron.' : 'Noch nicht synchron.', this.schalter(r.ntp, async (an) => { const x = await root('ntp', [an ? 'true' : 'false'], 'Die automatische Zeit wird umgestellt.'); x.ok || x.abgebrochen || hinweis(x.fehler, 'fehler'); })))));
  },
  async benutzer(i) {
    this.kopf(i, 'Benutzer & Passwort', 'Du bist kein Administrator im Alltag: Alles, was das System ändert, fragt nach deinem Passwort.'); const inf = await Z.sys.info();
    i.append(this.block(null, this.karte(this.reihe('Angemeldet als', inf.live ? 'Live-System vom USB-Stick: Benutzer «zentrale», Passwort «zentrale».' : null, this.wert(inf.benutzer)),
      this.reihe('Passwort ändern', 'Das Administrator-Passwort deines Kontos.', el('button', { klasse: 'knopf', onclick: async () => {
        const a = await dialog({ titel: 'Passwort ändern', text: 'Neues Passwort zweimal eingeben. Danach wirst du nach dem bisherigen gefragt.', felder: [{ type: 'password', platzhalter: 'Neues Passwort' }, { type: 'password', platzhalter: 'Nochmal' }], okText: 'Weiter' });
        if (!a) return; if (a[0] !== a[1] || a[0].length < 6) return hinweis('Die Eingaben stimmen nicht überein oder sind kürzer als 6 Zeichen.', 'fehler');
        await Z.sys.rootVergessen(); const x = await alsAdmin((pw) => Z.sys.passwortAendern(a[0], pw), 'Zur Bestätigung das bisherige Passwort eingeben.'); await Z.sys.rootVergessen();
        x.ok ? hinweis('Passwort geändert', 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); } }, 'Ändern')),
      this.reihe('PIN für den Sperrbildschirm', 'Unter «Anmeldung & Sperre».', el('button', { klasse: 'knopf', onclick: () => { this.bereich = 'anmeldung'; this.zeichnen(); } }, 'Öffnen')),
      this.reihe('Freigabe vergessen', 'Das Administrator-Passwort wird höchstens 5 Minuten gemerkt.', el('button', { klasse: 'knopf', onclick: async () => { await Z.sys.rootVergessen(); hinweis('Freigabe vergessen', 'ok'); } }, 'Jetzt vergessen')))));
  },
  async firewall(i) {
    this.kopf(i, 'Firewall & Sicherheit', 'Eingehende Verbindungen werden verworfen, ausgehende sind erlaubt. Tailscale bleibt erreichbar (ausser im Profil «Strikt»).');
    const k = await Z.sys.firewall(); if (this.bereich !== 'firewall') return;
    const anwenden = async (neu) => {
      const r = await alsAdmin((pw) => Z.sys.firewallSetzen(neu, pw), 'Die Firewall-Regeln werden geändert.');
      if (!r.ok) { r.abgebrochen || hinweis(r.fehler || 'Regeln nicht angewendet', 'fehler'); return this.neu(); }
      // Sicherheitsnetz: ohne Bestätigung nimmt das System die Änderung nach 60 Sekunden zurück.
      const ja = await Promise.race([fragen('Änderung behalten?', 'Die neuen Regeln sind aktiv. Bestätige innerhalb von 60 Sekunden – sonst stellt das System den alten Stand wieder her (Schutz vor Aussperren).', 'Behalten'), warte(58000).then(() => null)]);
      if (ja) { const b = await root('firewall-bestaetigen'); b.ok ? hinweis('Firewall-Regeln gespeichert', 'ok') : hinweis(b.fehler, 'fehler'); } else { if (ja === null) schliesseMenues(); await root('firewall-zuruecknehmen'); hinweis('Änderung zurückgenommen', 'warnung'); }
      this.neu();
    };
    const konfig = () => ({ an: k.an, profil: k.profil, regeln: k.regeln });
    i.append(this.block(null, this.karte(this.reihe('Firewall', k.ausstehend ? 'Eine Änderung wartet auf Bestätigung.' : null, this.schalter(k.an, (x) => anwenden({ ...konfig(), an: x }))),
      this.reihe('Profil', 'Zuhause: Ping und Geräte-Erkennung erlaubt. Öffentlich: nur das Nötigste. Strikt: auch Tailscale gesperrt.', this.auswahl(k.profil, Object.entries(k.profile), (p) => anwenden({ ...konfig(), profil: p }))))));
    const port = el('input', { klasse: 'feld', placeholder: 'Port, z. B. 8080', stil: { width: '130px' } }); const proto = this.auswahl('tcp', [['tcp', 'TCP'], ['udp', 'UDP']], () => {}); const quelle = el('input', { klasse: 'feld', placeholder: 'Quelle (leer = alle)', stil: { width: '160px' } }); const akt = this.auswahl('erlauben', [['erlauben', 'erlauben'], ['verwerfen', 'verwerfen']], () => {});
    i.append(this.block('Regeln', el('div', { klasse: 'ein-karte' }, k.regeln.map((r, n) => this.reihe(`${r.aktion === 'erlauben' ? 'Erlauben' : 'Verwerfen'}: ${r.protokoll.toUpperCase()} ${r.port}`, r.quelle ? 'von ' + r.quelle : 'von überall', el('button', { klasse: 'knopf gefahr', onclick: () => anwenden({ ...konfig(), regeln: k.regeln.filter((_x, m) => m !== n) }) }, 'Entfernen'))),
      el('div', { klasse: 'ein-reihe' }, el('div', { stil: { display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 } }, port, proto, quelle, akt), el('button', { klasse: 'knopf haupt', onclick: () => { if (!/^\d{1,5}(-\d{1,5})?$/.test(port.value.trim())) return hinweis('Port als Zahl (oder Bereich 8000-8010) angeben.', 'fehler'); anwenden({ ...konfig(), regeln: [...k.regeln, { port: port.value.trim(), protokoll: proto.value, quelle: quelle.value.trim(), aktion: akt.value }] }); } }, 'Hinzufügen')))));
    const aus = el('pre', { klasse: 'sy-aus', text: 'Noch nichts abgefragt.' }); const zeig = async (aktion, grund) => { const r = await root(aktion, [], grund); aus.textContent = r.abgebrochen ? 'Abgebrochen.' : (r.aus || r.fehler || '').trim() || 'Keine Einträge.'; };
    i.append(this.block('Einblick', this.karte(this.reihe('Verworfene Verbindungen', 'Die letzten Einträge aus dem Protokoll.', el('button', { klasse: 'knopf', onclick: () => zeig('firewall-protokoll', 'Das Firewall-Protokoll wird gelesen.') }, 'Anzeigen')),
      this.reihe('Offene Ports', 'Welche Programme auf Verbindungen warten.', el('button', { klasse: 'knopf', onclick: () => zeig('ports', 'Offene Ports werden gelesen.') }, 'Anzeigen')),
      this.reihe('Aktive Regeln', 'So, wie sie im Kernel geladen sind.', el('button', { klasse: 'knopf', onclick: () => zeig('firewall-zustand', 'Die geladenen Regeln werden gelesen.') }, 'Anzeigen')))), aus);
    i.append(this.block('Weitere Sicherheit', this.karte(this.reihe('SSH-Zugang', 'Standard: aus. Wenn an, mit der Firewall auf Tailscale beschränkt.', el('div', { stil: { display: 'flex', gap: '6px' } }, el('button', { klasse: 'knopf', onclick: async () => { const x = await root('ssh', ['an'], 'SSH wird eingeschaltet.'); x.ok ? hinweis('SSH an', 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); } }, 'An'), el('button', { klasse: 'knopf', onclick: async () => { const x = await root('ssh', ['aus'], 'SSH wird ausgeschaltet.'); x.ok ? hinweis('SSH aus', 'ok') : x.abgebrochen || hinweis(x.fehler, 'fehler'); } }, 'Aus'))),
      this.reihe('Automatische Sicherheitsupdates', 'Standard: an.', el('div', { stil: { display: 'flex', gap: '6px' } }, el('button', { klasse: 'knopf', onclick: async () => { const x = await root('auto-updates', ['1']); x.ok && hinweis('Automatische Updates an', 'ok'); } }, 'An'), el('button', { klasse: 'knopf', onclick: async () => { const x = await root('auto-updates', ['0']); x.ok && hinweis('Automatische Updates aus', 'ok'); } }, 'Aus'))))));
  },
  updates(i) { Software.updates(i); },
  async speicherplatz(i) {
    this.kopf(i, 'Speicher'); const r = await Z.sys.info(); if (this.bereich !== 'speicherplatz') return;
    i.append(this.block('System', this.karte(this.reihe(`${groesse(r.wurzel.frei)} frei von ${groesse(r.wurzel.gross)}`, r.live ? 'Live-System: das ist Arbeitsspeicher, nicht die SSD.' : null, balken(prozent(r.wurzel.benutzt, r.wurzel.gross))))));
    if (r.platz.length) i.append(this.block('Laufwerke', el('div', { klasse: 'ein-karte' }, r.platz.map((p) => this.reihe(`${p.ort} · ${p.typ}`, `${p.geraet} · ${groesse(p.frei)} frei von ${groesse(p.gross)}`, balken(prozent(p.benutzt, p.gross)))))));
    i.append(this.block('Aufräumen', this.karte(this.reihe('Papierkorb und Zwischenspeicher', 'Im Terminal: «flatpak uninstall --unused» entfernt nicht mehr gebrauchte Laufzeiten.', el('button', { klasse: 'knopf', onclick: () => TerminalApp.oeffnen() }, 'Terminal')))));
  },
  verhalten(i) {
    const v = Einst.daten.verhalten; const s = (teil) => Einst.setzen({ verhalten: teil });
    this.kopf(i, 'Verhalten');
    i.append(this.block('Start', this.karte(this.reihe('Nach dem Hochfahren sperren', 'Direkt der Anmeldebildschirm statt des Schreibtischs.', this.schalter(v.beimStartSperren, (x) => s({ beimStartSperren: x }))),
      this.reihe('Zentrale gleich öffnen', 'Nach dem Anmelden wird die Übersicht geöffnet.', this.schalter(v.zentraleBeimStart, (x) => s({ zentraleBeimStart: x }))))));
    i.append(this.block('Sperren', this.karte(this.reihe('Beim Sperren den Bildschirm ausschalten', 'Aus: es wird nur gesperrt.', this.schalter(v.bildschirmAusBeiSperre, (x) => s({ bildschirmAusBeiSperre: x }))))));
    i.append(this.block('Oberfläche', this.karte(this.reihe('Oberfläche neu starten', 'Offene Shell-Fenster werden geschlossen, fremde Programme laufen weiter.', el('button', { klasse: 'knopf', onclick: () => Z.system.neustart() }, 'Neu starten')),
      this.reihe('Einstellungen zurücksetzen', 'Alles wieder auf Werkseinstellung. PIN und Kopplung bleiben.', el('button', { klasse: 'knopf gefahr', onclick: async () => { if (!await fragen('Zurücksetzen?', 'Alle Einstellungen der Oberfläche gehen auf den Ausgangszustand zurück.', 'Zurücksetzen', true)) return; const r = await Z.einstellungen.zuruecksetzen(); if (r.ok) { Einst.daten = r.einstellungen; Schreibtisch.aussehenAnwenden(); Dock.bauen(); this.zeichnen(); hinweis('Zurückgesetzt', 'ok'); } } }, 'Zurücksetzen')),
      this.reihe('Profil exportieren', 'Alle Einstellungen als eine Datei in deinem Benutzerordner.', el('button', { klasse: 'knopf', onclick: async () => { const p = Schreibtisch.zustand.heim + '/zentraleos-profil.json'; const r = await Z.lokal.textSchreiben(p, JSON.stringify(Einst.daten, null, 2)).catch(() => null) || await Z.lokal.neu(Schreibtisch.zustand.heim, 'zentraleos-profil.json', false, JSON.stringify(Einst.daten, null, 2)); r && r.ok ? hinweis('Gespeichert: ' + p, 'ok') : hinweis((r && r.fehler) || 'Export fehlgeschlagen', 'fehler'); } }, 'Exportieren')),
      this.reihe('Profil importieren', 'Liest ~/zentraleos-profil.json wieder ein.', el('button', { klasse: 'knopf', onclick: async () => { const r = await Z.lokal.text(Schreibtisch.zustand.heim + '/zentraleos-profil.json'); if (!r.ok) return hinweis('Keine Profildatei gefunden.', 'fehler'); try { const d = JSON.parse(r.inhalt); delete d.demo; await Einst.setzenAsync(d); Schreibtisch.aussehenAnwenden(); Dock.bauen(); Schreibtischflaeche.bauen(); hinweis('Profil geladen', 'ok'); } catch { hinweis('Die Datei ist kein gültiges Profil.', 'fehler'); } } }, 'Importieren')))));
  },
  verbindung(i) {
    this.kopf(i, 'Zentrale', 'Adresse der Zentrale auf dem Raspberry Pi. Erreichbar nur über Tailscale.');
    const demo = !!Schreibtisch.zustand.demo;
    i.append(this.block('Demo-Modus', this.karte(this.reihe('Demo-Modus mit Testdaten', demo ? 'An: Alle Zentrale-Daten sind Testdaten von diesem Rechner. Zum Ausschalten startet die Oberfläche neu; danach meldest du dich mit Zentrale-Passwort und 2FA an.' : 'Aus: Die Oberfläche spricht mit dem echten Pi.',
      this.schalter(demo, async (x) => { if (!await fragen(x ? 'Demo-Modus einschalten?' : 'Demo-Modus ausschalten?', 'Die Oberfläche startet dafür neu.', 'Neu starten')) return this.zeichnen(); Einst.setzen({ demo: x }); })))));
    const feld = this.textfeld(Einst.daten.zentraleUrl, () => {}, { breit: true, platzhalter: 'https://…ts.net:8443' }); const zustand = el('div', { klasse: 'u', text: 'noch nicht geprüft' });
    i.append(this.block('Zentrale auf dem Pi', this.karte(this.reihe('Adresse', 'Zum Beispiel https://homelabkerim.taila4b96b.ts.net:8443', feld),
      this.reihe('Prüfen', demo ? 'Im Demo-Modus wird der Demo-Server geprüft.' : null, el('button', { klasse: 'knopf', onclick: async () => { zustand.textContent = 'wird geprüft …'; const r = await Z.anmeldungPruefen(); zustand.textContent = r.online ? (r.angemeldet ? 'verbunden und angemeldet' : 'erreichbar, aber nicht angemeldet') : 'nicht erreichbar: ' + (r.fehler || ''); Menueleiste.piTick(); } }, 'Prüfen')),
      this.reihe('Adresse speichern', 'Die Oberfläche startet danach neu.', el('button', { klasse: 'knopf haupt', onclick: () => { const url = feld.value.trim().replace(/\/+$/, ''); if (!/^https?:\/\//.test(url)) return hinweis('Die Adresse muss mit https:// anfangen', 'fehler'); Einst.setzen({ zentraleUrl: url }); } }, 'Speichern')), this.reihe('Zustand', null, zustand))));
  },
  async ueber(i) {
    this.kopf(i, 'Über ZentraleOS'); const r = await Z.sys.info(); if (this.bereich !== 'ueber') return; const z = Schreibtisch.zustand;
    i.append(this.block(null, this.karte(...[['System', r.name], ['Oberfläche', 'Version ' + (z.version || '–') + (z.demo ? ' · Demo-Modus' : '')], ['Kernel', r.kernel], ['Rechner', r.rechner], ['Prozessor', `${r.cpu} · ${r.kerne} Kerne`], ['Arbeitsspeicher', groesse(r.ram)], ['Läuft seit', Math.floor(r.laufzeitS / 3600) + ' h ' + Math.floor((r.laufzeitS % 3600) / 60) + ' min'], ['Art', r.live ? 'Live-System (USB-Stick)' : 'Installiert'], ['Basis', 'Debian 13 «trixie», labwc, Electron']].map(([t, w]) => this.reihe(t, null, this.wert(w))))));
    const aus = el('pre', { klasse: 'sy-aus', text: '' });
    i.append(this.block('Systemprotokoll', this.karte(this.reihe('Letzte Meldungen', 'Braucht das Administrator-Passwort.', el('button', { klasse: 'knopf', onclick: async () => { const x = await root('protokoll', ['120'], 'Das Systemprotokoll wird gelesen.'); aus.textContent = x.abgebrochen ? '' : (x.aus || x.fehler || ''); } }, 'Anzeigen')),
      r.live ? this.reihe('Auf die SSD installieren', 'Startet das Installationsprogramm (Calamares). In dieser Version noch nicht durchgetestet.', el('button', { klasse: 'knopf', onclick: () => Z.sys.programmStarten('calamares-install-debian').then((x) => x.ok || Z.sys.programmStarten('calamares').then((y) => y.ok || hinweis('Installationsprogramm nicht gefunden', 'fehler'))) }, 'Installieren')) : null)), aus);
    i.append(el('p', { klasse: 'unter', text: 'Lizenzen: Debian und die enthaltenen Programme stehen unter ihren jeweiligen freien Lizenzen (/usr/share/doc/*/copyright). Schriften: Inter, JetBrains Mono (SIL OFL). Symbole und Hintergründe: eigenes Material.' }));
  },
});
{ // Bereichswechsel allgemein: jede Methode mit dem Namen des Bereichs zeichnet ihn.
  const alt = EinstellungenApp.zeichnen;
  EinstellungenApp.zeichnen = function () {
    const s = leeren(this.seite);
    for (const b of this.BEREICHE) s.append(el('button', { klasse: 'f-ort' + (this.bereich === b.id ? ' aktiv' : ''), onclick: () => { this.bereich = b.id; this.zeichnen(); } }, el('span', { html: symbol(b.symbol) }).firstElementChild, el('span', { klasse: 'name', text: b.name })));
    const i = leeren(this.inhalt); i.scrollTop = 0;
    if (typeof this[this.bereich] === 'function') Promise.resolve(this[this.bereich](i)).catch((e) => { console.error(e); hinweis(String(e.message || e), 'fehler'); });
    else alt.call(this);
  };
  // Erscheinungsbild: zusätzliche Regler, live wirksam.
  const altAussehen = EinstellungenApp.aussehen;
  EinstellungenApp.aussehen = function (i) {
    altAussehen.call(this, i);
    const a = Einst.daten.aussehen; const s = (teil) => { Einst.setzen({ aussehen: teil }); Schreibtisch.aussehenAnwenden(); };
    i.append(this.block('Fenster und Glas', this.karte(
      this.reihe('Hintergrund-Verlauf', 'Eigene, erzeugte Hintergründe.', this.auswahl(a.verlauf || 'blau', [['blau', 'Blau'], ['abend', 'Abend'], ['wald', 'Wald'], ['graphit', 'Graphit']], (v) => s({ verlauf: v, hintergrundArt: 'verlauf' }))),
      this.reihe('Weichzeichner (Glas)', '0 = aus, spart Rechenleistung.', this.regler(a.glas ?? 22, 0, 40, (v) => s({ glas: v }))),
      this.reihe('Eckenradius', null, this.regler(a.radius ?? 12, 0, 22, (v) => s({ radius: v }))),
      this.reihe('Schriftgrösse', null, this.regler(a.schrift ?? 14, 12, 18, (v) => s({ schrift: v }))),
      this.reihe('Animationen', 'Geschwindigkeit der Übergänge.', this.auswahl(String(a.tempo ?? 1), [['0', 'aus'], ['0.6', 'schnell'], ['1', 'normal'], ['1.6', 'ruhig']], (v) => s({ tempo: Number(v) }))))));
  };
}

// ---------- Einhängen in die Oberfläche ----------
Object.assign(Apps, {
  launchpad: { name: 'Launchpad', symbol: 'launchpad', farbe: 'linear-gradient(160deg,#64748b,#334155)', oeffnen: () => Launchpad.oeffnen() },
  terminal: { name: 'Terminal', symbol: 'terminal', fensterId: 'terminal-1', farbe: 'linear-gradient(160deg,#374151,#0b0f17)', oeffnen: () => TerminalApp.oeffnen() },
  aktivitaet: { name: 'Aktivitätsanzeige', symbol: 'aktivitaet', fensterId: 'aktivitaet', farbe: 'linear-gradient(160deg,#22c55e,#15803d)', oeffnen: () => Aktivitaet.oeffnen() },
  software: { name: 'Software', symbol: 'software', fensterId: 'software', farbe: 'linear-gradient(160deg,#60a5fa,#2563eb)', oeffnen: () => Software.oeffnen() },
  web: { name: 'Web', symbol: 'browser', farbe: 'linear-gradient(160deg,#22d3ee,#0e7490)', oeffnen: () => Z.sys.browser('').then((r) => r.ok || hinweis(r.fehler, 'fehler')) },
});

Schreibtisch.energie = async function (was) {
  if (!await fragen(was === 'neustart' ? 'Neu starten?' : 'Ausschalten?', 'Alle Programme werden beendet. Nicht gespeicherte Daten gehen verloren.', was === 'neustart' ? 'Neu starten' : 'Ausschalten', true)) return;
  const r = await root('energie', [was], 'Der Rechner wird ' + (was === 'neustart' ? 'neu gestartet' : 'ausgeschaltet') + '.'); r.ok || r.abgebrochen || hinweis(r.fehler, 'fehler');
};
Schreibtisch.ausschaltenMenue = function (knopf) {
  const r = knopf.getBoundingClientRect();
  kontextmenue(r.left - 90, r.top - 200, [{ text: 'Sperren', kuerzel: 'Super L', tun: () => Z.sperren({ bildschirmAus: false }) }, { text: 'Bildschirm aus & sperren', tun: () => Z.sperren({ bildschirmAus: true }) }, '-',
    { text: 'Alle Fenster schliessen', tun: () => FM.schliessenAlle() }, { text: 'Oberfläche neu starten', tun: () => Z.system.neustart() }, '-', { text: 'Neu starten …', tun: () => this.energie('neustart') }, { text: 'Ausschalten …', tun: () => this.energie('aus') }]);
};
Schreibtisch.beenden = () => Schreibtisch.energie('aus');

{ // Erscheinungsbild live anwenden (Glas, Radius, Tempo, Schrift, Verlauf)
  const alt = Schreibtisch.aussehenAnwenden;
  const VERLAUF = { blau: ['#0b1530', '#1a3a8f', '#3b82f6'], abend: ['#1a0f2e', '#7c2d6b', '#f97316'], wald: ['#06150f', '#0f5132', '#34d399'], graphit: ['#0c0d10', '#2a2d36', '#6b7280'] };
  Schreibtisch.aussehenAnwenden = function () {
    alt.call(this);
    const a = Einst.daten.aussehen || {}; const w = document.documentElement.style; const v = VERLAUF[a.verlauf] || VERLAUF.blau;
    w.setProperty('--glas-blur', (a.glas ?? 22) + 'px'); w.setProperty('--radius', (a.radius ?? 12) + 'px'); w.setProperty('--tempo', String(a.tempo ?? 1)); w.setProperty('--schrift-gr', (a.schrift ?? 14) + 'px');
    w.setProperty('--tapete', `radial-gradient(120% 90% at 15% 10%, ${v[2]}55 0%, transparent 55%), radial-gradient(90% 80% at 90% 95%, ${v[1]} 0%, transparent 60%), linear-gradient(160deg, ${v[0]}, ${v[1]})`);
    document.body.classList.toggle('ohne-animation', Number(a.tempo) === 0);
    document.body.classList.toggle('demo', !!this.zustand.demo);
  };
}

{ // Menüleiste: Demo-Marke, Mitteilungen, Kontrollzentrum
  const alt = Menueleiste.bauen;
  Menueleiste.bauen = function () {
    alt.call(this);
    const rechts = $('.mb-rechts', this.el); if (!rechts) return;
    const kz = el('button', { klasse: 'mb-knopf', title: 'Kontrollzentrum', html: symbol('steuerung') }); kz.addEventListener('click', () => Kontrollzentrum.oeffnen(kz));
    const mt = el('button', { klasse: 'mb-knopf', title: 'Mitteilungen', html: symbol('liste') }); mt.addEventListener('click', () => Mitteilungen.oeffnen(mt));
    const su = el('button', { klasse: 'mb-knopf', title: 'Spotlight (Super + Leertaste)', html: symbol('suche') }); su.addEventListener('click', () => Spotlight.oeffnen());
    for (const k of [kz, mt, su]) { const s = k.querySelector('svg'); s.style.width = '15px'; s.style.height = '15px'; }
    rechts.prepend(su, kz, mt);
    if (Schreibtisch.zustand.demo) rechts.prepend(el('button', { klasse: 'mb-demo', title: 'Demo-Modus: Testdaten statt Pi. Klick öffnet die Einstellung.', text: 'DEMO', onclick: () => Apps.einstellungen.oeffnen('verbindung') }));
  };
}

{ // Dock: laufende fremde Programme (Fenster des Compositors) hinter einem Trenner zeigen
  const alt = Dock.bauen;
  Dock.fremde = [];
  Dock.bauen = function () { alt.call(this); this.fremdeZeichnen(); };
  Dock.fremdeZeichnen = function () {
    $$('#dock .fremd').forEach((e) => e.remove());
    const anker = $('#dock .dock-trenner'); if (!anker || !this.fremde.length) return;
    const proApp = new Map(); for (const f of this.fremde) if (!proApp.has(f.app)) proApp.set(f.app, f);
    for (const f of proApp.values()) {
      const p = (Launchpad.liste || []).find((x) => x.id === f.app || x.wmKlasse === f.app || x.id.toLowerCase().endsWith('.' + f.app.toLowerCase()) || f.app.toLowerCase().includes(x.id.toLowerCase()));
      const e = el('button', { klasse: 'dock-eintrag fremd laeuft', title: f.titel }, el('span', { klasse: 'dock-name', text: p ? p.name : f.titel || f.app }), Launchpad.symbolEl({ bild: p && p.symbol, symbol: 'datei', farbe: 'linear-gradient(160deg,#475569,#1e293b)' }, 'dock-symbol'));
      e.addEventListener('click', () => Z.sys.fensterFokus(f.app));
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); kontextmenue(ev.clientX, ev.clientY - 80, [{ titel: p ? p.name : f.app }, { text: 'Nach vorne holen', tun: () => Z.sys.fensterFokus(f.app) }, { text: 'Schliessen', tun: () => Z.sys.fensterZu(f.app) }]); });
      anker.before(e);
    }
  };
  setInterval(async () => { if (document.hidden || !$('#sperre').hidden) return; const r = await Z.sys.fremdeFenster(); const neu = r.liste || []; if (JSON.stringify(neu) !== JSON.stringify(Dock.fremde)) { Dock.fremde = neu; Dock.fremdeZeichnen(); } }, 2500);
}

window.addEventListener('DOMContentLoaded', () => {
  Z.auf('befehl', (b) => { if (b === 'spotlight') Spotlight.oeffnen(); else if (b === 'launchpad') Launchpad.oeffnen(); });
  Z.auf('zentrale:neuLaden', () => ZentraleFenster.alleNeuLaden());
  document.addEventListener('keydown', (e) => {
    if (!$('#sperre').hidden) return;
    if ((e.metaKey || e.ctrlKey) && e.code === 'Space') { e.preventDefault(); Spotlight.oeffnen(); }
    else if (e.key === 'F4') { e.preventDefault(); Launchpad.oeffnen(); }
    else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); TerminalApp.oeffnen(); }
  }, true);
  Launchpad.laden();
});
