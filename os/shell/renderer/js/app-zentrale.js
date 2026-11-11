// Die Zentrale als eigene Apps: jeder Tab bekommt ein Symbol und ein eigenes Fenster.
// Der Inhalt ist die echte Seite vom Pi (oder im Demo-Modus vom Demo-Server), «nackt» –
// ohne deren Kopfzeile und Tab-Leiste.
//
// Anders als in Version 1 ist die Seite ein <iframe> IM Fenster. Darum funktionieren
// Menüs, Dialoge, Weichzeichner und Animationen darüber ganz normal, und alle offenen
// Zentrale-Fenster sind gleichzeitig live.

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
  offen: new Map(),   // tabId -> { fenster, rahmen, fehlerEl, lader }

  fensterId: (tabId) => 'zentrale:' + tabId,
  basis: () => String(Schreibtisch.zustand.piBasis || Einst.daten.zentraleUrl || '').replace(/\/+$/, ''),

  url(tabId) {
    const t = tabInfo(tabId);
    return `${this.basis()}/?nackt=1#${encodeURIComponent(tabName(t))}`;
  },

  // Fenstergrösse je App merken (lokal, pro Gerät).
  groesseLesen(tabId) { try { return JSON.parse(localStorage.getItem('zos.fenster.' + tabId) || 'null'); } catch { return null; } },
  groesseMerken(tabId, f) { try { if (!f.gezoomt && !f.minimiert) localStorage.setItem('zos.fenster.' + tabId, JSON.stringify({ b: f.el.offsetWidth, h: f.el.offsetHeight })); } catch {} },

  oeffnen(tabId = 'Übersicht') {
    const t = tabInfo(tabId);
    const fid = this.fensterId(t.id);
    if (this.offen.has(t.id) && FM.finden(fid)) return FM.oeffnen({ id: fid });

    const fl = FM.flaeche();
    const gemerkt = this.groesseLesen(t.id);
    const eintrag = { fenster: null, rahmen: null, fehlerEl: null, lader: null };
    this.offen.set(t.id, eintrag);

    eintrag.fenster = FM.oeffnen({
      id: fid,
      appId: fid,
      titel: t.name,
      symbol: t.symbol,
      breite: Math.min(gemerkt?.b || 1240, fl.width - 60),
      hoehe: Math.min(gemerkt?.h || 800, fl.height - 60),
      minBreite: 480, minHoehe: 340,
      werkzeuge: [
        { id: 'neu', symbol: 'neu', titel: 'Neu laden', tun: () => this.neuLaden(t.id) },
        { id: 'browser', symbol: 'browser', titel: 'Im Browser öffnen', tun: () => Z.sys.browser(this.basis() + '/#' + encodeURIComponent(tabName(t))) },
      ],
      menue: () => ({
        'Gehe zu': ZENTRALE_TABS.map((x) => ({ text: x.name, tun: () => this.oeffnen(x.id) })),
        Ansicht: [{ text: 'Neu laden', kuerzel: 'Strg R', tun: () => this.neuLaden(t.id) }],
      }),
      aufbauen: (inhalt) => {
        inhalt.classList.add('web-inhalt');
        eintrag.lader = el('div', { klasse: 'web-platz leer' }, t.name + ' wird geladen …');
        eintrag.rahmen = el('iframe', { klasse: 'web-rahmen', title: t.name, src: this.url(t.id) });
        // Erst zeigen, wenn die Seite da ist – so flackert nichts.
        eintrag.rahmen.addEventListener('load', () => { eintrag.rahmen.classList.add('da'); eintrag.lader.style.opacity = '0'; });
        inhalt.append(eintrag.lader, eintrag.rahmen);
      },
      beimAendern: () => this.groesseMerken(t.id, eintrag.fenster),
      beimSchliessen: () => {
        this.groesseMerken(t.id, eintrag.fenster);
        this.offen.delete(t.id);
        Dock.aktualisieren();
        return true;
      },
    });

    Dock.aktualisieren();
    return eintrag.fenster;
  },

  neuLaden(tabId) {
    const e = this.offen.get(tabId);
    if (!e || !e.rahmen) return;
    if (e.fehlerEl) { e.fehlerEl.remove(); e.fehlerEl = null; }
    e.rahmen.classList.remove('da');
    e.lader.style.opacity = '1';
    e.rahmen.src = 'about:blank';
    setTimeout(() => { e.rahmen.src = this.url(tabId); }, 30);
  },

  alleNeuLaden() { for (const id of this.offen.keys()) this.neuLaden(id); },

  // Für alte Aufrufer aus Version 1: Es gibt nichts mehr ein- oder auszublenden.
  anpassen() {},

  // Der Hauptprozess meldet, wenn ein eingebetteter Rahmen nicht laden konnte.
  fehlerZeigen(d) {
    const basis = this.basis();
    if (d.url && basis && !String(d.url).startsWith(basis)) return;
    for (const [tabId, e] of this.offen) {
      if (!e.fenster || e.fehlerEl || e.rahmen.classList.contains('da')) continue;
      e.fehlerEl = el('div', { klasse: 'web-fehler' },
        el('div', { klasse: 'box' },
          el('h3', { text: 'Zentrale nicht erreichbar' }),
          el('p', { text: `Der Pi antwortet nicht (${d.text || 'Fehler'}${d.code ? ', ' + d.code : ''}). Läuft Tailscale, und ist der Pi eingeschaltet? Das System selbst funktioniert auch ohne Pi.` }),
          el('div', { stil: { display: 'flex', gap: '8px', justifyContent: 'center' } },
            el('button', { klasse: 'knopf haupt', onclick: () => this.neuLaden(tabId) }, 'Erneut versuchen'),
            el('button', { klasse: 'knopf', onclick: () => Apps.einstellungen.oeffnen('verbindung') }, 'Adresse prüfen'),
          ),
        ),
      );
      e.fenster.inhalt.append(e.fehlerEl);
    }
  },
};
