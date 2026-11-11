// Gemeinsame Datenquelle: holt den Zustand vom Pi einmal für alle, die ihn brauchen
// (Widgets, Steuerung, Menüleiste). Läuft nur, solange jemand zuhört.
const Zustand = {
  daten: null,
  fehler: null,
  zeit: 0,
  horcher: new Set(),
  timer: null,
  laeuft: false,
  takt: 10000,

  abonnieren(fn) {
    this.horcher.add(fn);
    if (this.daten || this.fehler) fn(this.daten, this.fehler);
    this.start();
    return () => {
      this.horcher.delete(fn);
      if (!this.horcher.size) this.stopp();
    };
  },

  start() {
    if (this.timer) return;
    this.holen();
    this.timer = setInterval(() => this.holen(), this.takt);
  },

  stopp() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  async holen(erzwingen = false) {
    if (this.laeuft) return;
    if (!erzwingen && document.hidden) return;
    this.laeuft = true;
    const r = await Z.pi.status();
    this.laeuft = false;
    if (r && r.ok) { this.daten = r; this.fehler = null; this.zeit = Date.now(); }
    else { this.fehler = (r && r.fehler) || 'Pi nicht erreichbar'; }
    for (const fn of this.horcher) { try { fn(this.daten, this.fehler); } catch (e) { console.error(e); } }
  },
};
