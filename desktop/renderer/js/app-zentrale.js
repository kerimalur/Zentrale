// Fenster mit der echten Zentrale vom Pi. Die Seite selbst liegt in einer
// eingebetteten Ansicht (WebContentsView) im Hauptprozess – sie liegt technisch
// über der Oberfläche, darum wird sie ausgeblendet, sobald ein anderes Fenster
// oder ein Menü davor liegt. Statt eines schwarzen Lochs zeigt das Fenster dann
// den letzten Schnappschuss der Seite.
const TABS = ['Übersicht', 'Heute', 'Gesundheit', 'Fokus', 'Trading', 'System', 'Netz', 'Speicher', 'Cloud', 'Medien', 'Gäste', 'Konsole', 'Einstellungen'];

const ZentraleFenster = {
  fenster: null, platz: null, fehlerEl: null, sichtbar: false, letztesBild: null, zustand: { zurueck: false, vor: false, laedt: false },

  oeffnen(tab = null) {
    if (this.fenster) {
      FM.oeffnen({ id: 'zentrale' });
      if (tab) Z.web.oeffnen('/#' + encodeURIComponent(tab));
      return this.fenster;
    }
    const fl = FM.flaeche();
    this.fenster = FM.oeffnen({
      id: 'zentrale',
      appId: 'zentrale',
      titel: 'Zentrale',
      symbol: 'zentrale',
      breite: Math.min(1280, fl.width - 60),
      hoehe: Math.min(820, fl.height - 60),
      minBreite: 520, minHoehe: 380,
      werkzeuge: [
        { id: 'zurueck', symbol: 'zurueck', titel: 'Zurück', tun: () => Z.web.befehl('zurueck') },
        { id: 'vor', symbol: 'vor', titel: 'Vorwärts', tun: () => Z.web.befehl('vor') },
        { id: 'neu', symbol: 'neu', titel: 'Neu laden', tun: () => Z.web.befehl('neu') },
        { id: 'browser', symbol: 'browser', titel: 'Im Browser öffnen', tun: () => Z.system.linkOeffnen(Einst.daten.zentraleUrl) },
      ],
      menue: () => ({
        'Gehe zu': TABS.map((t) => ({ text: t, tun: () => Z.web.oeffnen('/#' + encodeURIComponent(t)) })),
        Ansicht: [
          { text: 'Neu laden', kuerzel: '⌘R', tun: () => Z.web.befehl('neu') },
          { text: 'Startseite', tun: () => Z.web.befehl('start') },
          '-',
          { text: 'Grösser', kuerzel: '⌘+', tun: () => Z.web.befehl('groesser') },
          { text: 'Kleiner', kuerzel: '⌘−', tun: () => Z.web.befehl('kleiner') },
          { text: 'Normale Grösse', kuerzel: '⌘0', tun: () => Z.web.befehl('normal') },
          '-',
          { text: 'Entwicklerwerkzeuge', tun: () => Z.web.befehl('werkzeuge') },
        ],
      }),
      aufbauen: (inhalt) => {
        this.platz = el('div', { klasse: 'web-platz leer' }, 'Zentrale wird geladen …');
        inhalt.append(this.platz);
      },
      beimAendern: () => this.anpassen(),
      beimSchliessen: () => {
        Z.web.verstecken(false);
        this.fenster = null;
        this.sichtbar = false;
        return true;
      },
    });
    this.anpassen();
    if (tab) setTimeout(() => Z.web.oeffnen('/#' + encodeURIComponent(tab)), 200);
    return this.fenster;
  },

  // Entscheidet, ob die eingebettete Seite sichtbar sein darf.
  darfSichtbar() {
    const f = this.fenster;
    if (!f) return false;
    if (f.minimiert) return false;
    if (FM.oben !== f) return false;
    if (FM.ueberlagert()) return false;
    if ($('#sperre').hidden === false) return false;
    return true;
  },

  async anpassen() {
    const f = this.fenster;
    if (!f) return;
    if (this.darfSichtbar()) {
      const b = f.inhaltFlaeche();
      await Z.web.zeigen(b);
      this.sichtbar = true;
      if (this.platz) this.platz.style.opacity = '0';
    } else if (this.sichtbar) {
      this.sichtbar = false;
      const r = await Z.web.verstecken(true);
      if (r && r.bild) {
        this.letztesBild = r.bild;
        if (this.platz) {
          this.platz.classList.remove('leer');
          this.platz.textContent = '';
          this.platz.style.backgroundImage = `url("${r.bild}")`;
          this.platz.style.opacity = '1';
        }
      } else if (this.platz) {
        this.platz.style.opacity = '1';
      }
    } else if (this.platz) {
      this.platz.style.opacity = '1';
    }
  },

  zustandSetzen(z) {
    this.zustand = z;
    const f = this.fenster;
    if (!f) return;
    f.werkzeugSetzen('zurueck', { aus: !z.zurueck });
    f.werkzeugSetzen('vor', { aus: !z.vor });
    let titel = 'Zentrale';
    try {
      const h = decodeURIComponent(new URL(z.url).hash.slice(1));
      if (h) titel = 'Zentrale – ' + h;
    } catch {}
    f.setzeTitel(z.laedt ? titel + ' …' : titel);
    if (!z.laedt && this.fehlerEl) { this.fehlerEl.remove(); this.fehlerEl = null; }
  },

  fehlerZeigen({ text, code }) {
    const f = this.fenster;
    if (!f) return;
    if (this.fehlerEl) this.fehlerEl.remove();
    this.fehlerEl = el('div', { klasse: 'web-fehler' },
      el('div', { klasse: 'box' },
        el('h3', { text: 'Zentrale nicht erreichbar' }),
        el('p', { text: `Der Pi antwortet nicht (${text || 'Fehler'}${code ? ', ' + code : ''}). Läuft Tailscale, und ist der Pi eingeschaltet?` }),
        el('div', { stil: { display: 'flex', gap: '8px', justifyContent: 'center' } },
          el('button', { klasse: 'knopf haupt', onclick: () => Z.web.befehl('neu') }, 'Nochmal versuchen'),
          el('button', { klasse: 'knopf', onclick: () => Apps.einstellungen.oeffnen('verbindung') }, 'Adresse prüfen'),
        ),
      ),
    );
    f.inhalt.append(this.fehlerEl);
  },
};
