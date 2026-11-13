// Sicherheit, Anonymität und kleinere Systemlücken: Meldungen des Wächters, USB-Geräte, gesperrte Adressen,
// Schnappschüsse, TPM-Bindung, Kill-Switch und Anonymitäts-Check, Nachtlicht, Lautstärke pro Programm,
// Standardprogramme, Rechte der Programme, Aufräumen, Firmware-Updates.
const ART_TEXT = { info: 'Info', warnung: 'Warnung', alarm: 'Alarm' };
const zeitKurz = (ms) => { const d = new Date(ms); const heute = new Date().toDateString() === d.toDateString(); return heute ? uhr(d) : `${zweiStellig(d.getDate())}.${zweiStellig(d.getMonth() + 1)}. ${uhr(d)}`; };
const meldungZeile = (e) => el('div', { klasse: 'ein-reihe wm-zeile ' + e.art }, el('span', { klasse: 'si-rund klein ' + (e.art === 'alarm' ? 'schlecht' : e.art === 'warnung' ? 'warnung' : 'info'), text: e.art === 'alarm' ? '!' : e.art === 'warnung' ? '!' : 'i' }),
  el('div', { klasse: 'text' }, el('div', { klasse: 't', text: e.text }), el('div', { klasse: 'u', text: `${zeitKurz(e.zeit)} · ${ART_TEXT[e.art] || e.art} · ${e.quelle}` })));

// ---------------------------------------------------------------- Meldungen des Wächters auf dem Bildschirm
if (typeof IST_EBENE === 'undefined' || !IST_EBENE) {
  let gesehen = Date.now();
  setInterval(async () => {
    if (!$('#sperre').hidden || document.hidden) return;
    const r = await Z.mehr.meldungen().catch(() => null); if (!r || !r.ok) return;
    const neu = r.liste.filter((e) => e.zeit > gesehen && e.art !== 'info').reverse();
    if (r.liste[0]) gesehen = Math.max(gesehen, r.liste[0].zeit);
    for (const e of neu.slice(-3)) hinweis(e.text, e.art === 'alarm' ? 'fehler' : 'warnung', e.art === 'alarm' ? 'Alarm' : 'Wächter');
  }, 8000);
}

// ---------------------------------------------------------------- Sicherheits-Zentrale: Meldungen, USB, gesperrte Adressen
Object.assign(Sicherheit.ZIEL, {
  usb: () => UsbGeraete.oeffnen(), schnappschuesse: () => Apps.einstellungen.oeffnen('schnappschuesse'), anonym: () => Apps.einstellungen.oeffnen('anonym'), tpm: () => Tpm.binden(),
});
{
  const alt = Sicherheit.laden;
  Sicherheit.laden = async function () {
    await alt.call(this); if (!this.el || !this.el.isConnected) return;
    const [m, n] = await Promise.all([Z.mehr.meldungen(), Z.mehr.netz().catch(() => ({}))]); if (!this.el.isConnected) return;
    const block = (titel, ...k) => el('div', { klasse: 'ein-block' }, el('h4', { text: titel }), ...k);
    this.el.append(
      block('Meldungen des Wächters', m.waechter ? null : el('p', { klasse: 'unter', text: 'Der Wächter-Dienst läuft nicht – es kommen keine neuen Meldungen.' }),
        el('div', { klasse: 'ein-karte wm-liste' }, m.liste.length ? m.liste.slice(0, 40).map(meldungZeile) : E.reihe('Noch keine Meldungen', null, null))),
      block('Gesperrte Adressen', el('div', { klasse: 'ein-karte' }, (n.gesperrt || []).length ? n.gesperrt.map((g) => E.reihe(g.ip, 'gesperrt bis ' + zeitKurz(g.bis), el('button', { klasse: 'knopf klein', text: 'Freigeben', onclick: async () => { const a = await mitAdmin((pw) => M.rootMehr('ip-entsperren', [g.ip], pw), 'Die Adresse wird wieder zugelassen.'); a.ok ? hinweis('Freigegeben', 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); this.laden(); } }))) : [E.reihe('Keine', 'Nach einem Portscan sperrt der Wächter die Adresse für 24 Stunden.', null)])),
      block('Prüfen', el('div', { klasse: 'ein-karte' },
        E.reihe('Wochenprüfung jetzt starten', 'Lynis (Einrichtung), rkhunter (Rootkits), AIDE (veränderte Systemdateien). Läuft im Hintergrund, das Ergebnis kommt als Meldung.', el('button', { klasse: 'knopf klein', text: 'Starten', onclick: async () => { const a = await mitAdmin((pw) => M.rootMehr('pruefung-jetzt', [], pw), 'Die Sicherheitsprüfung wird gestartet.'); a.ok ? hinweis('Prüfung läuft – das dauert einige Minuten.', 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); } })),
        E.reihe('USB-Geräte', 'Welche Geräte erlaubt oder gesperrt sind.', el('button', { klasse: 'knopf klein', text: 'Öffnen', onclick: () => UsbGeraete.oeffnen() })),
        E.reihe('Köder-Datei', '«Passwörter.xlsx» in Dokumente. Öffnet sie jemand, gibt es Alarm und der Bildschirm sperrt sich. Nicht selbst öffnen.', E.wert('aktiv')))));
  };
}

// ---------------------------------------------------------------- USB-Geräte (USBGuard)
const UsbGeraete = {
  oeffnen() { einfachesFenster('usb', 'USB-Geräte', 'schild', 620, 520, (k) => { this.el = k; this.laden(); }, [{ id: 'neu', symbol: 'neu', titel: 'Neu einlesen', tun: () => this.laden() }]); },
  async laden() {
    const w = await Z.mehr.waechterStand(); if (!this.el.isConnected) return; leeren(this.el);
    this.el.append(el('h2', { text: 'USB-Geräte' }), el('p', { klasse: 'unter', text: 'Neue Geräte bleiben gesperrt, bis du sie hier erlaubst – ausser reine Speichersticks. Das schützt gegen Sticks, die sich als Tastatur ausgeben und Befehle tippen.' }));
    if (!w.laeuft || !Array.isArray(w.usb)) return this.el.append(el('div', { klasse: 'ein-karte' }, E.reihe('Nicht verfügbar', 'Wächter oder USBGuard laufen nicht.', null)));
    this.el.append(el('div', { klasse: 'ein-karte' }, w.usb.map((g) => E.reihe(g.name || g.kennung, `${g.kennung} · ${g.regel === 'allow' ? 'erlaubt' : 'gesperrt'}`,
      el('button', { klasse: 'knopf klein' + (g.regel === 'allow' ? '' : ' haupt'), text: g.regel === 'allow' ? 'Sperren' : 'Erlauben', onclick: async () => {
        const a = await mitAdmin((pw) => M.rootMehr(g.regel === 'allow' ? 'usb-sperren' : 'usb-erlauben', [String(g.id)], pw), 'Die Regel für dieses USB-Gerät wird geändert.');
        a.ok ? hinweis(g.regel === 'allow' ? 'Gesperrt' : 'Erlaubt – auch beim nächsten Einstecken', 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); setTimeout(() => this.laden(), 1500);
      } })))));
  },
};

// ---------------------------------------------------------------- TPM: verschlüsselte Platte an den Chip binden
const Tpm = {
  async binden() {
    const a = await dialog({ titel: 'Platte an den TPM-Chip binden', text: 'Danach startet der Rechner ohne Eingabe, die ausgebaute Platte bleibt unlesbar. Gib das Verschlüsselungs-Passwort ein (das von der Installation).', felder: [{ type: 'password', platzhalter: 'Verschlüsselungs-Passwort' }], okText: 'Binden' });
    if (!a || !a[0]) return;
    hinweis('Wird gebunden …');
    const r = await mitAdmin((pw) => M.tpmBinden(a[0], pw), 'Die Plattenverschlüsselung wird an den TPM-Chip gebunden.');
    r.ok ? hinweis('Gebunden. Ab dem nächsten Start ohne Passwort.', 'ok') : r.abgebrochen || hinweis(r.fehler || 'Nicht möglich', 'fehler');
  },
};

// ---------------------------------------------------------------- Netzwerkwächter: Ziele je Programm
{
  const alt = Netzwaechter.laden;
  Netzwaechter.laden = async function () {
    await alt.call(this); if (!this.el || !this.el.isConnected) return;
    const n = await Z.mehr.netz().catch(() => ({})); const ziele = Object.entries(n.ziele || {}).sort((a, b) => b[1].length - a[1].length);
    if (!ziele.length) return;
    const oben = this.el.scrollTop;
    this.el.append(el('div', { klasse: 'ein-block' }, el('h4', { text: 'Wohin Programme verbinden (seit dem Start gemerkt)' }),
      el('div', { klasse: 'ein-karte' }, ziele.slice(0, 25).map(([prog, l]) => E.reihe(`${prog} · ${l.length} Ziele`, l.slice(0, 8).map((x) => `${x.ip}:${x.port}`).join(', ') + (l.length > 8 ? ' …' : ''), null)))));
    this.el.scrollTop = oben;
  };
}

// ---------------------------------------------------------------- Einstellungen: neue Bereiche
E.BEREICHE.splice(E.BEREICHE.findIndex((b) => b.id === 'updates') + 1, 0, { id: 'schnappschuesse', name: 'Schnappschüsse', symbol: 'update' });
E.BEREICHE.splice(E.BEREICHE.findIndex((b) => b.id === 'firewall') + 1, 0, { id: 'anonym', name: 'Anonymität', symbol: 'tailscale' });
E.BEREICHE.splice(E.BEREICHE.findIndex((b) => b.id === 'finder') + 1, 0, { id: 'standardapps', name: 'Standardprogramme', symbol: 'raster' }, { id: 'rechte', name: 'Rechte der Programme', symbol: 'schloss' });
Object.assign(E, {
  async schnappschuesse(i) {
    this.kopf(i, 'Schnappschüsse', 'Wie eine Zeitmaschine: der Stand des Systems wird festgehalten – täglich, wöchentlich und vor jedem Update. Geht etwas kaputt, setzt du zurück. Deine eigenen Dateien (persönlicher Ordner) bleiben dabei unberührt.');
    const w = await Z.mehr.waechterStand(); if (this.bereich !== 'schnappschuesse') return; const sy = (w && w.system) || {};
    if (sy.live) return i.append(this.block(null, this.karte(this.reihe('Nur im installierten System', 'Im Live-System vom Stick gibt es keine Schnappschüsse.', null))));
    if (sy.schnappschuesse === null || (sy.schnappschuesse && !sy.schnappschuesse.eingerichtet)) i.append(this.block(null, this.karte(this.reihe('Nicht eingerichtet', 'Schnappschüsse gibt es nur, wenn ZentraleOS mit der neuen Installation (Btrfs) installiert wurde.', null))));
    const liste = el('div', { klasse: 'ein-karte' }, this.reihe('Wird gelesen …', null, null));
    i.append(this.block(null, this.karte(this.reihe('Jetzt einen Schnappschuss machen', null, el('button', { klasse: 'knopf haupt', text: 'Erstellen', onclick: async (ev) => {
      ev.target.disabled = true; const a = await mitAdmin((pw) => M.rootMehr('schnappschuss-erstellen', ['von Hand'], pw), 'Ein Schnappschuss des Systems wird erstellt.'); ev.target.disabled = false;
      a.ok ? hinweis('Schnappschuss erstellt', 'ok') : a.abgebrochen || hinweis(a.fehler || a.aus, 'fehler'); this.schnappFrisch = true; this.zeichnen(); } })))), this.block('Vorhanden', liste));
    // Die Liste liefert der Wächter (ohne Passwort). Nach eigenen Änderungen frisch lesen – das Passwort ist dann noch gemerkt.
    let r = { ok: true }; let zeilen = ((sy.schnappschuesse && sy.schnappschuesse.liste) || []).map((x) => [null, x.name, x.tags, x.kommentar]).reverse();
    if (this.schnappFrisch) { this.schnappFrisch = false; r = await mitAdmin((pw) => M.rootMehr('schnappschuss-liste', [], pw), 'Die Liste der Schnappschüsse wird gelesen.'); if (this.bereich !== 'schnappschuesse') return;
      zeilen = String(r.aus || '').split('\n').map((z) => z.match(/(\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d)\s+(\S*)\s*(.*)$/)).filter(Boolean).reverse(); }
    leeren(liste).append(...(zeilen.length ? zeilen.map(([, name, tags, kommentar]) => this.reihe(name.replace('_', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2'), [{ O: 'von Hand / vor Update', D: 'täglich', W: 'wöchentlich', M: 'monatlich', B: 'beim Start', H: 'stündlich' }[tags[0]] || tags, kommentar].filter(Boolean).join(' · '),
      el('div', { stil: { display: 'flex', gap: '6px' } },
        el('button', { klasse: 'knopf klein', text: 'Zurücksetzen', onclick: async () => {
          if (!await fragen('Auf diesen Stand zurücksetzen?', `Das System kehrt zum Stand vom ${name.replace('_', ' ')} zurück. Danach startet der Rechner neu. Deine Dateien im persönlichen Ordner bleiben.`, 'Zurücksetzen und neu starten', true)) return;
          const a = await mitAdmin((pw) => M.rootMehr('schnappschuss-zurueck', [name], pw), 'Das System wird auf einen Schnappschuss zurückgesetzt.');
          if (!a.ok) return a.abgebrochen || hinweis(a.fehler || a.aus, 'fehler'); hinweis('Zurückgesetzt – starte neu …', 'ok'); setTimeout(() => M.energie('neustart'), 2500);
        } }),
        el('button', { klasse: 'knopf klein gefahr', text: 'Löschen', onclick: async () => { if (!await fragen('Schnappschuss löschen?', name, 'Löschen', true)) return; const a = await mitAdmin((pw) => M.rootMehr('schnappschuss-loeschen', [name], pw)); a.ok ? hinweis('Gelöscht', 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); this.schnappFrisch = true; this.zeichnen(); } }))))
      : [this.reihe(r.ok ? 'Noch keiner' : 'Liste nicht lesbar', r.ok ? null : (r.fehler || ''), null)]));
  },
  async anonym(i) {
    this.kopf(i, 'Anonymität', 'Ganz anonym ist dieser Rechner nie (Broker, Tailscale-Konto). Hier stellst du ein, dass Webseiten deine Heim-Adresse nicht sehen, und prüfst, ob nichts durchrutscht.');
    const fw = await Z.sys.firewall(); if (this.bereich !== 'anonym') return;
    const ergebnis = el('div', { klasse: 'ein-karte' }, this.reihe('Noch nicht geprüft', null, null));
    const pruefen = async () => {
      leeren(ergebnis).append(this.reihe('Wird geprüft …', null, null));
      const a = await M.anonymCheck(); if (!ergebnis.isConnected) return; leeren(ergebnis);
      ergebnis.append(this.reihe('Sichtbare Adresse', a.ip ? `${a.land || ''}${a.stadt ? ', ' + a.stadt : ''} · ${a.anbieter || ''}` : 'Kein Internet', this.wert(a.ip || '–')),
        this.reihe('Exit-Node', a.exitNode ? 'Aller Verkehr geht über ' + a.exitNode : 'Keiner – Webseiten sehen deine Heim-Adresse.', this.wert(a.exitNode ? '✓ ' + a.exitNode : '✕ aus')),
        this.reihe('IPv6', a.ipv6 ? 'Über IPv6 ist eine Adresse sichtbar – prüfen, ob sie zum VPN gehört.' : 'Keine IPv6-Verbindung nach aussen (gut, kein Leck).', this.wert(a.ipv6 || 'keine')),
        this.reihe('DNS-Server', a.dns.includes('100.100.100.100') ? 'Über Tailscale (Pi-hole/Proton) – kein DNS-Leck.' : 'Nicht über Tailscale – der Anbieter sieht, welche Seiten du aufrufst.', this.wert(a.dns.join(', ') || '–')));
    };
    i.append(this.block('Prüfen', ergebnis, el('button', { klasse: 'knopf', text: 'Jetzt prüfen', stil: { marginTop: '8px' }, onclick: pruefen })),
      this.block('Kill-Switch', this.karte(this.reihe('Nur durch den Tunnel ins Internet', 'Programme kommen nur noch über Tailscale (Exit-Node pi-proton) ins Internet. Fällt der Tunnel weg, geht nichts mehr hinaus statt an Proton vorbei. Heimnetz und Tailscale selbst bleiben erreichbar. Achtung: dann laufen auch MT5 und der Bot über Proton.',
        this.schalter(!!fw.killswitch, async (x) => { const a = await mitAdmin((pw) => Z.sys.firewallSetzen({ ...fw, killswitch: x }, pw), 'Die Firewall wird geändert.'); if (!a.ok) { a.abgebrochen || hinweis(a.fehler, 'fehler'); return this.zeichnen(); } hinweis('Gilt jetzt. Unter Firewall innerhalb von 60 Sekunden bestätigen, sonst wird es zurückgenommen.', 'ok'); Apps.einstellungen.oeffnen('firewall'); })),
        this.reihe('Exit-Node wählen', 'In Tailscale pi-proton als Exit-Node einschalten.', el('button', { klasse: 'knopf klein', text: 'Tailscale öffnen', onclick: () => Apps.einstellungen.oeffnen('tailscale') })))),
      this.block('Browser für Anonymes', this.karte(
        this.reihe('Tor Browser', 'Für wirklich anonymes Surfen – auch Proton sieht dann nicht, was du aufrufst.', el('button', { klasse: 'knopf klein', text: 'Installieren', onclick: () => Software.installieren ? Software.installieren('org.torproject.torbrowser-launcher') : Z.sys.flatpakInstallieren('org.torproject.torbrowser-launcher').then((r) => hinweis(r.ok ? 'Installiert' : r.fehler, r.ok ? 'ok' : 'fehler')) })),
        this.reihe('Mullvad Browser', 'Gegen Wiedererkennen über den Browser-Fingerabdruck.', el('button', { klasse: 'knopf klein', text: 'Installieren', onclick: () => Z.sys.flatpakInstallieren('net.mullvad.MullvadBrowser').then((r) => hinweis(r.ok ? 'Installiert' : r.fehler, r.ok ? 'ok' : 'fehler')) })),
        this.reihe('Metadaten aus Bildern entfernen', 'In Fotos beim grossen Bild: «Metadaten entfernen» (Ort, Gerät, Zeit).', null))));
  },
  async standardapps(i) {
    this.kopf(i, 'Standardprogramme', 'Womit Links und Dateien geöffnet werden.');
    const [s, p] = await Promise.all([M.standardApps(), Z.sys.programme()]); if (this.bereich !== 'standardapps') return;
    const progs = (p.liste || []).map((x) => [x.id + '.desktop', x.name]);
    i.append(this.block(null, this.karte(...s.liste.map((x) => this.reihe(x.name, x.app ? null : 'Nicht festgelegt', this.auswahl(x.app, [['', '–'], ...progs], async (v) => { if (!v) return; const r = await M.standardAppSetzen(x.typ, v); r.ok ? hinweis('Gespeichert', 'ok') : hinweis(r.fehler, 'fehler'); }))))));
  },
  async rechte(i) {
    this.kopf(i, 'Rechte der Programme', 'Was installierte Programme (aus Software) dürfen. Ausschalten wirkt beim nächsten Start des Programms.');
    const r = await M.appRechte(); if (this.bereich !== 'rechte') return;
    if (!r.ok || !r.liste.length) return i.append(this.block(null, this.karte(this.reihe(r.ok ? 'Keine Programme aus Software installiert' : r.fehler, null, null))));
    for (const a of r.liste) {
      const sch = (recht, wert) => this.schalter(wert, async (x) => { const e = await M.appRechtSetzen(a.id, recht, x); e.ok ? hinweis('Gespeichert – gilt beim nächsten Start', 'ok') : hinweis(e.fehler, 'fehler'); });
      i.append(this.block(a.name, this.karte(this.reihe('Internet', null, sch('netz', a.netz)), this.reihe('Ton und Mikrofon', null, sch('ton', a.ton)), this.reihe('Kamera und Geräte', null, sch('kamera', a.kamera)), this.reihe('Persönlicher Ordner', null, sch('dateien', a.dateien)))));
    }
  },
});
{ // Anzeige: Nachtlicht
  const alt = E.anzeige;
  E.anzeige = async function (i) {
    await alt.call(this, i); if (this.bereich !== 'anzeige') return; const n = Einst.daten.nachtlicht || {};
    const s = async (teil) => { await Einst.setzenAsync({ nachtlicht: teil }); const r = await M.nachtlicht(); r.ok || hinweis('Nachtlicht: wlsunset fehlt', 'fehler'); };
    i.append(this.block('Nachtlicht', this.karte(this.reihe('Nachtlicht', 'Wärmere Farben am Abend, schont die Augen.', this.schalter(!!n.an, (x) => s({ an: x }))),
      this.reihe('Von – bis', null, el('div', { stil: { display: 'flex', gap: '6px' } }, this.textfeld(n.ab || '20:00', (v) => s({ ab: v })), this.textfeld(n.bis || '07:00', (v) => s({ bis: v })))),
      this.reihe('Wärme', null, this.auswahl(String(n.temperatur || 3800), [['5000', 'leicht'], ['4200', 'mittel'], ['3800', 'warm'], ['3200', 'sehr warm']], (v) => s({ temperatur: Number(v) }))))));
  };
}
{ // Ton: Lautstärke pro Programm
  const alt = E.ton;
  E.ton = async function (i) {
    await alt.call(this, i); if (this.bereich !== 'ton') return; const r = await M.tonProgramme(); if (this.bereich !== 'ton' || !r.ok) return;
    i.append(this.block('Lautstärke pro Programm', this.karte(...(r.liste.length ? r.liste.map((p) => this.reihe(p.name, p.medien || null, this.regler(p.lautstaerke, 0, 150, (v) => M.tonProgrammSetzen(p.id, v)))) : [this.reihe('Gerade spielt kein Programm Ton ab', null, null)]))));
  };
}
{ // Speicher: aufräumen
  const alt = E.speicherplatz;
  E.speicherplatz = async function (i) {
    await alt.call(this, i); if (this.bereich !== 'speicherplatz') return;
    i.append(this.block('Aufräumen', this.karte(this.reihe('Speicher aufräumen', 'Löscht heruntergeladene Update-Pakete, alte Protokolle und unbenutzte Laufzeiten. Deine Dateien bleiben.', el('button', { klasse: 'knopf', text: 'Aufräumen', onclick: async () => {
      const a = await mitAdmin((pw) => M.rootMehr('aufraeumen', [], pw), 'Zwischenspeicher und alte Protokolle werden gelöscht.'); a.ok ? hinweis(`Aufgeräumt: ${Number(String(a.aus).trim()) || 0} MB frei geworden`, 'ok') : a.abgebrochen || hinweis(a.fehler, 'fehler'); } })),
      this.reihe('Papierkorb leeren', null, el('button', { klasse: 'knopf', text: 'Papierkorb öffnen', onclick: () => Papierkorb.oeffnen() })))));
  };
}
{ // Software-Updates: Firmware
  const alt = E.updates;
  E.updates = async function (i) {
    await alt.call(this, i); if (this.bereich !== 'updates') return; const aus = el('pre', { klasse: 'dt-smart', hidden: true });
    i.append(this.block('Firmware (BIOS, Platte)', this.karte(this.reihe('Nach Firmware-Updates suchen', 'Über fwupd – nur, wenn der Hersteller sie dort anbietet.', el('div', { stil: { display: 'flex', gap: '6px' } },
      el('button', { klasse: 'knopf klein', text: 'Suchen', onclick: async () => { aus.hidden = false; aus.textContent = 'Suche …'; const a = await mitAdmin((pw) => M.rootMehr('firmware-suchen', [], pw), 'Firmware-Updates werden gesucht.'); aus.textContent = (a.aus || a.fehler || '').trim() || 'Keine Updates.'; } }),
      el('button', { klasse: 'knopf klein', text: 'Einspielen', onclick: async () => { if (!await fragen('Firmware einspielen?', 'Nicht ausschalten, bis es fertig ist. Manche Updates brauchen einen Neustart.', 'Einspielen', true)) return; aus.hidden = false; aus.textContent = 'Läuft …'; const a = await mitAdmin((pw) => M.rootMehr('firmware-einspielen', [], pw), 'Firmware wird aktualisiert.'); aus.textContent = (a.aus || a.fehler || '').trim(); } }))), aus)));
  };
}
{ // Fotos: Metadaten entfernen
  const alt = Fotos.zeigen;
  Fotos.zeigen = function (n, schau) {
    alt.call(this, n, schau); const leiste = $('#foto-gross .fg-leiste'); if (!leiste) return;
    leiste.insertBefore(el('button', { klasse: 'knopf klein', text: 'Metadaten entfernen', title: 'Ort, Gerät und Aufnahmezeit aus der Datei löschen', onclick: async () => { const f = this.liste[this.nr]; const r = await M.metadatenWeg(f.pfad); r.ok ? hinweis('Metadaten entfernt', 'ok') : hinweis(r.fehler, 'fehler'); } }), leiste.lastElementChild);
  };
}
EIN_STICHWORTE.nachtlicht = 'nachtlicht';
Software.EMPFOHLEN.push({ id: 'org.torproject.torbrowser-launcher', name: 'Tor Browser', beschreibung: 'Anonym surfen über das Tor-Netz' }, { id: 'net.mullvad.MullvadBrowser', name: 'Mullvad Browser', beschreibung: 'Browser gegen Fingerabdruck-Verfolgung' },
  { id: 'com.nextcloud.desktopclient.nextcloud', name: 'Nextcloud', beschreibung: 'Dateien mit dem Pi abgleichen' }, { id: 'org.mozilla.Thunderbird', name: 'Thunderbird', beschreibung: 'E-Mail und Kalender' }, { id: 'com.github.tchx84.Flatseal', name: 'Flatseal', beschreibung: 'Rechte der Programme im Detail' });
