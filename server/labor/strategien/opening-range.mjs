// Opening-Range-Ausbruch: Spanne einer Startphase (Standard London 08:00–09:00 Zürich) messen; die erste Basis-Kerze, die danach
// bis zur Schlusszeit über/unter der Spanne schliesst, löst den Einstieg aus (nächstes Open). SL auf der anderen Seite der Spanne,
// TP als Vielfaches des Risikos, spätestens Ausstieg zur Endzeit. Höchstens ein Trade pro Tag.
import { param } from '../bausteine.mjs';
import { RICHTUNG } from './baukasten.mjs';
import { zuerichSchnell } from '../zeit.mjs';

const { zahl } = param;

export default {
  id: 'opening-range',
  name: 'Opening-Range-Ausbruch',
  beschreibung: 'Spanne der ersten Stunde einer Sitzung, Ausbruch darüber/darunter, SL auf der anderen Seite.',
  aufloesung: () => 300,
  parameter: [
    zahl('von', 'Spanne ab (Uhr, Zürich)', 8, 0, 23, 1), zahl('bis', 'Spanne bis (Uhr)', 9, 1, 23, 1),
    zahl('schluss', 'Ausbruch möglich bis / Ausstieg um (Uhr)', 17, 2, 24, 1),
    RICHTUNG, zahl('tp', 'Take-Profit (R)', 2, 0.5, 10, 0.1),
  ],
  nachbarn: (p) => [{ ...p, tp: Math.max(0.5, p.tp - 0.5) }, { ...p, tp: p.tp + 0.5 }],
  setups(ctx, p) {
    const b = ctx.basis;
    const out = [];
    let tagKey = null, hoch = -Infinity, tief = Infinity, fertig = false, iSchluss = null;
    for (let i = 0; i < b.n; i++) {
      const z = zuerichSchnell(b.t[i]);
      if (z.tag !== tagKey) { tagKey = z.tag; hoch = -Infinity; tief = Infinity; fertig = false; iSchluss = null; }
      if (fertig || z.wochentag === 0 || z.wochentag === 6) continue;
      const h = z.stunde;
      if (h >= p.von && h < p.bis) { hoch = Math.max(hoch, b.h[i]); tief = Math.min(tief, b.l[i]); continue; }
      if (h < p.bis || !(hoch > tief)) continue;
      if (h >= p.schluss) { fertig = true; continue; }
      const lang = b.c[i] > hoch, kurz = b.c[i] < tief;
      if (!lang && !kurz) continue;
      fertig = true;
      const seite = lang ? 1 : -1;
      if ((seite > 0 && p.richtung === 'short') || (seite < 0 && p.richtung === 'long')) continue;
      // Ausstiegs-Index: letzte Basis-Kerze vor der Schlusszeit
      let j = i;
      while (j + 1 < b.n) { const zz = zuerichSchnell(b.t[j + 1]); if (zz.tag !== tagKey || zz.stunde >= p.schluss) break; j++; }
      iSchluss = j;
      out.push({ iSignal: i, seite, einstieg: { art: 'markt' }, sl: seite > 0 ? tief : hoch, rZiel: p.tp, zeitEnde: iSchluss, info: { spanne: [tief, hoch] } });
    }
    return { setups: out, trichter: { ausbrueche: out.filter((s) => ctx.imBereich(s.iSignal)).length } };
  },
};
