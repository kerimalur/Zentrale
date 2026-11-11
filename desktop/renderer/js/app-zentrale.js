// Die Zentrale als eigene Apps: jeder Tab bekommt ein Dock-Symbol und ein eigenes
// Fenster. Der Inhalt ist die echte Seite vom Pi, aber «nackt» – ohne deren eigene
// Kopfzeile und Tab-Leiste, damit es aussieht wie eine native App.
//
// Technisch liegen diese Ansichten über der Oberfläche. Darum ist immer nur die
// vorderste wirklich sichtbar; die anderen Fenster zeigen den letzten Schnappschuss.

const ZENTRALE_TABS = [
  { id: 'Übersicht', name: 'Übersicht', symbol: 'zentrale', farbe: 'linear-gradient(160deg,#3b82f6,#1d4ed8)' },
  { id: 'Heute', name: 'Heute', symbol: 'heute', farbe: 'linear-gradient(160deg,#f97316,#c2410c)' },
  { id: 'Gesundheit', name: 'Gesundheit', symbol: 'herz', farbe: 'linear-gradient(160deg,#fb7185,#be123c)' },
  { id: 'Fokus', name: 'Fokus', symbol: 'fokus', farbe: 'linear-gradient(160deg,#a78bfa,#6d28d9)' },
  { id: 'Trading', name: 'Trading', symbol: 'trading', farbe: 'linear-gradient(160deg,#34d399,#047857)' },
  { id: 'System', name: 'System', symbol: 'pi', farbe: 'linear-gradient(160deg,#94a3b8,#334155)' },
  { id: 'Netz', name: 'Netz', symbol: 'netz', farbe: 'linear-gradient(160deg,#38bdf8,#0369a1)' },
  { id: 'Speicher', name: 'Speicher', symbol: 'speicher', farbe: 'linear-gradient(160deg,#fbbf24,#b45309)' },
  { id: 'Cloud', name: 'Cloud', symbol: 'cloud', farbe: 'linear-gradient(160deg,#60a5fa,#1e40af)' },
  { id: 'Medien', name: 'Medien', symbol: 'film', farbe: 'linear-gradient(160deg,#f472b6,#9d174d)' },
  { id: 'Gäste', name: 'Gäste', symbol: 'gaeste', farbe: 'linear-gradient(160deg,#5eead4,#0f766e)' },
  { id: 'Konsole', name: 'Konsole', symbol: 'konsole', farbe: 'linear-gradient(160deg,#4b5563,#111827)' },
  { id: 'ZentraleEinstellungen', tab: 'Einstellungen', name: 'Zentrale-Einstellungen', symbol: 'einstellungen', farbe: 'linear-gradient(160deg,#9ca3af,#4b5563)' },
];

const tabInfo = (id) => ZENTRALE_TABS.find((t) => t.id === id) || ZENTRALE_TABS[0];
const tabName = (eintrag) => eintrag.tab || eintrag.id;

const ZentraleFenster = {
  offen: new Map(),   // tabId -> { fenster, platz, fehlerEl, sichtbar }

  fensterId: (tabId) => 'zentrale:' + tabId,

  url(tabId) {
    const t = tabInfo(tabId);
    return `${Einst.daten.zentraleUrl.replace(/\/+$/, '')}/?nackt=1#${encodeURIComponent(tabName(t))}`;
  },

  oeffnen(tabId = 'Übersicht') {
    const t = tabInfo(tabId);
    const fid = this.fensterId(t.id);
    if (this.offen.has(t.id) && FM.finden(fid)) return FM.oeffnen({ id: fid });

    const fl = FM.flaeche();
    const eintrag = { fenster: null, platz: null, fehlerEl: null, sichtbar: false };
    this.offen.set(t.id, eintrag);

    eintrag.fenster = FM.oeffnen({
      id: fid,
      appId: fid,
      titel: t.name,
      symbol: t.symbol,
      breite: Math.min(1240, fl.width - 60),
      hoehe: Math.min(800, fl.height - 60),
      minBreite: 480, minHoehe: 340,
      werkzeuge: [
        { id: 'zurueck', symbol: 'zurueck', titel: 'Zurück', tun: () => Z.web.befehl(fid, 'zurueck') },
        { id: 'vor', symbol: 'vor', titel: 'Vorwärts', tun: () => Z.web.befehl(fid, 'vor') },
        { id: 'neu', symbol: 'neu', titel: 'Neu laden', tun: () => Z.web.befehl(fid, 'neu') },
        { id: 'browser', symbol: 'browser', titel: 'Im Browser öffnen', tun: () => Z.system.linkOeffnen(Einst.daten.zentraleUrl + '/#' + encodeURIComponent(tabName(t))) },
      ],
      menue: () => ({
        'Gehe zu': ZENTRALE_TABS.map((x) => ({ text: x.name, tun: () => this.oeffnen(x.id) })),
        Ansicht: [
          { text: 'Neu laden', kuerzel: '⌘R', tun: () => Z.web.befehl(fid, 'neu') },
          '-',
          { text: 'Grösser', kuerzel: '⌘+', tun: () => Z.web.befehl(fid, 'groesser') },
          { text: 'Kleiner', kuerzel: '⌘−', tun: () => Z.web.befehl(fid, 'kleiner') },
          { text: 'Normale Grösse', kuerzel: '⌘0', tun: () => Z.web.befehl(fid, 'normal') },
          '-',
          { text: 'Entwicklerwerkzeuge', tun: () => Z.web.befehl(fid, 'werkzeuge') },
        ],
      }),
      aufbauen: (inhalt) => {
        eintrag.platz = el('div', { klasse: 'web-platz leer' }, t.name + ' wird geladen …');
        inhalt.append(eintrag.platz);
      },
      beimAendern: () => this.anpassen(),
      beimSchliessen: () => {
        Z.web.schliessen(fid);
        this.offen.delete(t.id);
        Dock.aktualisieren();
        return true;
      },
    });

    this.anpassen();
    Dock.aktualisieren();
    return eintrag.fenster;
  },

  darfSichtbar(tabId) {
    const e = this.offen.get(tabId);
    if (!e || !e.fenster) return false;
    if (e.fenster.minimiert) return false;
    if (FM.oben !== e.fenster) return false;
    if (FM.ueberlagert()) return false;
    if ($('#sperre').hidden === false) return false;
    return true;
  },

  // Nach jeder Änderung: genau eine Ansicht zeigen, alle anderen ausblenden.
  async anpassen() {
    for (const [tabId, e] of this.offen) {
      const fid = this.fensterId(tabId);
      if (this.darfSichtbar(tabId)) {
        await Z.web.zeigen(fid, e.fenster.inhaltFlaeche(), this.url(tabId));
        e.sichtbar = true;
        if (e.platz) e.platz.style.opacity = '0';
      } else if (e.sichtbar) {
        e.sichtbar = false;
        const r = await Z.web.verstecken(fid, true);
        if (e.platz) {
          if (r && r.bild) {
            e.platz.classList.remove('leer');
            e.platz.textContent = '';
            e.platz.style.backgroundImage = `url("${r.bild}")`;
          }
          e.platz.style.opacity = '1';
        }
      } else if (e.platz) {
        e.platz.style.opacity = '1';
      }
    }
  },

  zustandSetzen(z) {
    const tabId = String(z.id || '').replace(/^zentrale:/, '');
    const e = this.offen.get(tabId);
    if (!e || !e.fenster) return;
    e.fenster.werkzeugSetzen('zurueck', { aus: !z.zurueck });
    e.fenster.werkzeugSetzen('vor', { aus: !z.vor });
    const t = tabInfo(tabId);
    e.fenster.setzeTitel(z.laedt ? t.name + ' …' : t.name);
    if (!z.laedt && e.fehlerEl) { e.fehlerEl.remove(); e.fehlerEl = null; }
  },

  fehlerZeigen(d) {
    const tabId = String(d.id || '').replace(/^zentrale:/, '');
    const e = this.offen.get(tabId);
    if (!e || !e.fenster) return;
    if (e.fehlerEl) e.fehlerEl.remove();
    e.fehlerEl = el('div', { klasse: 'web-fehler' },
      el('div', { klasse: 'box' },
        el('h3', { text: 'Zentrale nicht erreichbar' }),
        el('p', { text: `Der Pi antwortet nicht (${d.text || 'Fehler'}${d.code ? ', ' + d.code : ''}). Läuft Tailscale, und ist der Pi eingeschaltet?` }),
        el('div', { stil: { display: 'flex', gap: '8px', justifyContent: 'center' } },
          el('button', { klasse: 'knopf haupt', onclick: () => Z.web.befehl(this.fensterId(tabId), 'neu') }, 'Nochmal versuchen'),
          el('button', { klasse: 'knopf', onclick: () => Apps.einstellungen.oeffnen('verbindung') }, 'Adresse prüfen'),
        ),
      ),
    );
    e.fenster.inhalt.append(e.fehlerEl);
  },
};
