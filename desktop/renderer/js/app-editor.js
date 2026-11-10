// Vorschau (Bilder, PDF, Video, Musik) und einfacher Texteditor.

const Vorschau = {
  async oeffnen(ref) {
    const id = 'vorschau:' + ref.quelle + ':' + ref.pfad;
    if (FM.finden(id)) return FM.oeffnen({ id });
    const r = ref.quelle === 'pi' ? await Z.pi.url(ref.wurzel, ref.pfad) : await Z.lokal.url(ref.pfad);
    if (!r.ok) return hinweis('Datei konnte nicht geöffnet werden', 'fehler');

    FM.oeffnen({
      id, appId: 'finder', titel: ref.name || piName(ref.pfad), symbol: artSymbol(ref.art),
      breite: ref.art === 'pdf' ? 920 : 760, hoehe: ref.art === 'audio' ? 180 : 620,
      minBreite: 380, minHoehe: 160,
      werkzeuge: [
        ref.art === 'text' ? { symbol: 'stift', titel: 'Bearbeiten', tun: (f) => { f.schliessen(); Editor.oeffnen(ref); } } : null,
        ref.quelle === 'lokal' ? { symbol: 'browser', titel: 'Mit Windows öffnen', tun: () => Z.lokal.oeffnen(ref.pfad) } : null,
        ref.quelle === 'pi' ? { symbol: 'teilen', titel: 'Link teilen', tun: () => Vorschau.teilen(ref) } : null,
      ].filter(Boolean),
      aufbauen: (inhalt) => {
        const buehne = el('div', { klasse: 'buehne' });
        if (ref.art === 'bild') buehne.append(el('img', { src: r.url, alt: ref.name }));
        else if (ref.art === 'pdf') buehne.append(el('embed', { src: r.url, type: 'application/pdf' }));
        else if (ref.art === 'video') buehne.append(el('video', { src: r.url, controls: true, autoplay: false }));
        else if (ref.art === 'audio') buehne.append(el('audio', { src: r.url, controls: true, stil: { width: '92%' } }));
        else buehne.append(el('div', { klasse: 'leer' }, 'Für diesen Dateityp gibt es keine Vorschau.'));
        inhalt.append(el('div', { klasse: 'vorschau' },
          el('div', { klasse: 'leiste' },
            el('span', { klasse: 'name', text: (ref.quelle === 'pi' ? 'Pi · ' : 'HP · ') + ref.pfad }),
          ), buehne));
      },
    });
  },

  async teilen(ref) {
    const tage = await abfragen('Link teilen', `«${ref.name}» freigeben für wie viele Tage?`, '7', 'Link erstellen');
    if (tage === null) return;
    const r = await Z.pi.teilen(ref.wurzel, ref.pfad, Number(tage) || 7);
    if (!pruefen(r)) return;
    await Z.system.kopieren(r.url);
    await melden('Link erstellt und kopiert', `${r.url}\n\nGültig bis ${datumZeit(r.bis)}.`);
  },
};

const Editor = {
  async oeffnen(ref) {
    const id = 'editor:' + ref.quelle + ':' + ref.pfad;
    if (FM.finden(id)) return FM.oeffnen({ id });

    const r = ref.quelle === 'pi' ? await Z.pi.text(ref.wurzel, ref.pfad) : await Z.lokal.text(ref.pfad);
    if (!pruefen(r, 'Datei konnte nicht gelesen werden')) return;

    const zustand = { geaendert: false, speichert: false, inhalt: r.inhalt };
    let feld, marke, fenster;

    const speichern = async () => {
      if (zustand.speichert) return;
      zustand.speichert = true;
      marke.textContent = 'speichert …';
      const a = ref.quelle === 'pi'
        ? await Z.pi.textSchreiben(ref.wurzel, ref.pfad, feld.value)
        : await Z.lokal.textSchreiben(ref.pfad, feld.value);
      zustand.speichert = false;
      if (!a.ok) { marke.textContent = 'nicht gespeichert'; return hinweis(a.fehler || 'Speichern fehlgeschlagen', 'fehler'); }
      zustand.inhalt = feld.value;
      zustand.geaendert = false;
      marke.textContent = '';
      fenster.setzeTitel(ref.name || piName(ref.pfad));
      hinweis('Gespeichert', 'ok');
    };

    fenster = FM.oeffnen({
      id, appId: 'finder', titel: ref.name || piName(ref.pfad), symbol: 'text',
      breite: 860, hoehe: 640, minBreite: 400, minHoehe: 260,
      werkzeuge: [{ symbol: 'speichern', titel: 'Speichern (Strg+S)', tun: speichern }],
      menue: () => ({
        Datei: [
          { text: 'Speichern', kuerzel: '⌘S', tun: speichern },
          { text: 'Neu laden (Änderungen verwerfen)', tun: async () => {
            if (zustand.geaendert && !await fragen('Änderungen verwerfen?', 'Die ungespeicherten Änderungen gehen verloren.', 'Verwerfen', true)) return;
            const n = ref.quelle === 'pi' ? await Z.pi.text(ref.wurzel, ref.pfad) : await Z.lokal.text(ref.pfad);
            if (!pruefen(n)) return;
            feld.value = n.inhalt; zustand.inhalt = n.inhalt; zustand.geaendert = false; marke.textContent = '';
          } },
        ],
      }),
      aufbauen: (inhalt) => {
        feld = el('textarea', { spellcheck: 'false', wrap: 'off' });
        feld.value = r.inhalt;
        marke = el('span', { klasse: 'geaendert' });
        feld.addEventListener('input', () => {
          zustand.geaendert = feld.value !== zustand.inhalt;
          marke.textContent = zustand.geaendert ? 'geändert' : '';
          fenster.setzeTitel((zustand.geaendert ? '• ' : '') + (ref.name || piName(ref.pfad)));
        });
        feld.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); speichern(); }
          if (e.key === 'Tab') { e.preventDefault(); const s = feld.selectionStart; feld.setRangeText('  ', s, feld.selectionEnd, 'end'); }
        });
        inhalt.append(el('div', { klasse: 'editor' },
          el('div', { klasse: 'leiste' },
            el('span', { klasse: 'name', text: (ref.quelle === 'pi' ? 'Pi · ' : 'HP · ') + ref.pfad }),
            marke,
            el('button', { klasse: 'knopf klein haupt', onclick: speichern }, 'Speichern'),
          ), feld));
        setTimeout(() => feld.focus(), 60);
      },
      beimSchliessen: (f) => {
        if (!zustand.geaendert) return true;
        fragen('Ungespeicherte Änderungen', `«${ref.name}» wurde geändert. Vor dem Schliessen speichern?`, 'Speichern und schliessen')
          .then(async (ja) => {
            if (ja) await speichern();
            zustand.geaendert = false;
            f.schliessen();
          });
        return false;
      },
    });
  },
};
