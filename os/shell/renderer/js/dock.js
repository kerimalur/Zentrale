// Dock am unteren Rand.
const Dock = {
  bauen() {
    const d = leeren($('#dock'));
    const ids = (Einst.daten.dock && Einst.daten.dock.length ? Einst.daten.dock : ['zentrale', 'finder', 'steuerung', 'einstellungen']);
    const gr = Number(Einst.daten.aussehen.dockGroesse) || 56;
    d.style.setProperty('--dock-gr', gr + 'px');

    for (const id of ids) {
      const app = Apps[id];
      if (!app) continue;
      const e = el('button', { klasse: 'dock-eintrag', daten: { app: id }, title: app.name },
        el('span', { klasse: 'dock-name', text: app.name }),
        el('span', { klasse: 'dock-symbol', html: symbol(app.symbol), stil: app.farbe ? { background: app.farbe } : {} }),
      );
      e.addEventListener('click', () => app.oeffnen());
      e.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const f = FM.finden(app.fensterId || id);
        kontextmenue(ev.clientX, ev.clientY - 90, [
          { titel: app.name },
          { text: 'Öffnen', tun: () => app.oeffnen() },
          { text: 'Fenster schliessen', aus: !f, tun: () => f && f.schliessen() },
        ]);
      });
      d.append(e);
    }

    d.append(el('div', { klasse: 'dock-trenner' }));
    const aus = el('button', { klasse: 'dock-eintrag', title: 'Ausschalten (Bildschirm aus)' },
      el('span', { klasse: 'dock-name', text: 'Ausschalten' }),
      el('span', { klasse: 'dock-symbol', html: symbol('strom'), stil: { background: 'linear-gradient(160deg,#4b5563,#1f2937)' } }),
    );
    aus.addEventListener('click', () => Schreibtisch.ausschaltenMenue(aus));
    d.append(aus);

    this.aktualisieren();
  },

  aktualisieren() {
    for (const e of $$('#dock .dock-eintrag[data-app]')) {
      const app = Apps[e.dataset.app];
      const offen = !!FM.finden(app?.fensterId || e.dataset.app);
      e.classList.toggle('laeuft', offen);
    }
  },

  verstecken(an) { $('#dock').classList.toggle('versteckt', !!an); },
};
