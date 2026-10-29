// ALT – nur für bestehende Versionen. Fehler: Das Swing-Hoch wird nach dem Treffer laufend neu gewählt (auch Hochs, die erst
// nach dem Treffer entstehen), dadurch BOS an Zwischenhochs. Neu: gva-kerim.mjs (Regelwerk 29.10.2026).
// Kerims Fix Entry Model: GVA-Linie (erster Treffer) → BOS auf 15/30 Min → Einstieg in der Fib-Zone.
//   1. Eine GVA-Linie (3D/W/M, Regeln wie Live) wird zum ersten Mal getroffen.
//   2. Innerhalb des Zeitfensters (Handelstage ab dem Treffer) kommt ein BOS: Körper-Schluss ÜBER dem letzten Swing-Hoch
//      UND über dem Daily Open (Short: unter dem letzten Swing-Tief und unter dem Daily Open).
//      Swing = Fractal mit N Kerzen links/rechts, gilt erst, wenn die N rechten Kerzen geschlossen sind.
//   3. Fib: 100 % = tiefstes Tief vor dem BOS (seit Treffer bzw. Swing), 0 % = höchstes Hoch der BOS-Bewegung bis zum Einstieg.
//      Einstieg mit Limit bei der Fib-Stufe (Standard 0,618), SL bei 100 %, TP bei −100 % (Ausdehnung).
//      Das 0 %-Hoch wird bis zum Einstieg nachgeführt; eine Kerze, die ein neues Hoch macht, zählt erst ab der nächsten Kerze.
//   4. Läuft der Preis vor dem Einstieg unter die 100 % oder endet das Fenster, verfällt das Setup.
//   5. Ungültig: Läuft der Preis vor dem Einstieg schon weit in Trade-Richtung weg (Standard −40 %, gemessen an der Spanne
//      beim BOS: 0 % − 0,4 × Spanne), war der Zug ohne uns und das Setup zählt nicht mehr. Ein Hoch, das in derselben Kerze
//      wie die Zone liegt, gilt als zuerst gelaufen (vorsichtig, wie beim Stop-Loss). Abschaltbar.
import { param } from '../bausteine.mjs';
import { swings } from '../indikatoren.mjs';
import { handelstagNr } from '../daten.mjs';

const { zahl, auswahl, mehrfach, schalter } = param;

export default {
  id: 'gva-bos-fib',
  name: 'GVA + BOS + Fib (alt, vor Regelwerk 29.10.)',
  beschreibung: 'Erster Treffer einer GVA-Linie, danach BOS auf 15/30 Min mit Körper-Schluss über/unter Swing und Daily Open, Einstieg in der Fib-Zone.',
  aufloesung: (p) => (p.swingTf === '30m' ? 1800 : 900),
  parameter: [
    mehrfach('tfs', 'GVA-Linien von', ['3D', 'W'], ['3D', 'W', 'M']),
    zahl('fenster', 'Zeitfenster für den BOS (Handelstage)', 2, 1, 5, 1, 'ab dem Treffer; der Treffertag zählt als Tag 0'),
    auswahl('swingTf', 'Swings auf', '15m', [{ wert: '15m', text: '15 Min' }, { wert: '30m', text: '30 Min' }]),
    zahl('swingN', 'Swing: Kerzen links/rechts', 2, 1, 5, 1),
    zahl('swingAlter', 'Swing höchstens so alt (Handelstage vor dem Treffer)', 3, 0, 10, 1),
    schalter('koerper', 'BOS nur mit Körper-Schluss', true, 'aus: schon der Docht über dem Swing zählt'),
    schalter('dailyOpen', 'BOS auch über/unter dem Daily Open', true),
    auswahl('fib', 'Einstieg bei Fib', '0.618', [{ wert: '0.5', text: '0,5' }, { wert: '0.618', text: '0,618' }, { wert: '0.705', text: '0,705' }, { wert: '0.786', text: '0,786' }]),
    zahl('sl', 'Stop-Loss bei Fib', 1, 1, 1.5, 0.05, '1 = 100 % (das Tief vor dem BOS)'),
    zahl('tp', 'Take-Profit bei Fib', -1, -3, 0, 0.1, '−1 = −100 % (Ausdehnung über das Hoch)'),
    schalter('ungueltigAn', 'Setup ungültig, wenn der Kurs schon weg ist', true, 'Der Kurs läuft vor dem Einstieg über die 0 %-Marke hinaus in Trade-Richtung: der Zug fand ohne Einstieg statt.'),
    zahl('ungueltig', 'Ungültig bei Fib', -0.4, -1.5, -0.1, 0.05, '−0,4 = −40 %, gemessen an der Spanne beim BOS. Die Break-Even-Marke (z. B. −27 %) liegt davor.'),
    auswahl('verfall', 'Setup verfällt','fenster', [{ wert: 'fenster', text: 'am Ende des Zeitfensters' }, { wert: 'tag', text: 'am Ende des BOS-Tages' }, { wert: 'nie', text: 'erst wenn die 100 % brechen' }]),
  ],
  // Nachbar-Parameter für den Robustheits-Check (kein Aussuchen!)
  nachbarn(p) {
    const fibs = ['0.5', '0.618', '0.705', '0.786'];
    const i = fibs.indexOf(p.fib);
    const out = [];
    if (i < fibs.length - 1) out.push({ ...p, fib: fibs[i + 1] });
    out.push({ ...p, swingN: p.swingN === 2 ? 3 : 2 });
    return out;
  },
  setups(ctx, p) {
    const { basis, e } = ctx;
    const z = ctx.tf(p.swingTf);
    const zIdx = ctx.htfIndex(p.swingTf);
    const sw = ctx.merke(`swings-${p.swingTf}-${p.swingN}`, () => swings(z, p.swingN));
    const D = ctx.tag().D, dIdx = ctx.tag().idx;
    const fib = Number(p.fib);
    const trichter = { linien: 0, bos: 0, einstieg: 0, ungueltig: 0 };
    const out = [];

    for (const L of ctx.linien(p.tfs)) {
      const zaehlt = ctx.imBereich(L.iTreffer);
      if (zaehlt) trichter.linien++;
      const lang = L.seite > 0;
      const iT = L.iTreffer;
      const htStart = handelstagNr(basis.sd[iT], e);
      // Fensterende: letzter Basis-Index mit (Handelstag − Treffertag) ≤ fenster
      let iEnde = iT;
      while (iEnde + 1 < basis.n && handelstagNr(basis.sd[iEnde + 1], e) - htStart <= p.fenster) iEnde++;
      const kT = zIdx[iT], kEnde = zIdx[iEnde];
      const liste = lang ? sw.hoch : sw.tief;
      // ältester erlaubter Pivot (Handelstage vor dem Treffer)
      const htMin = htStart - p.swingAlter;

      let bos = null;
      for (let k = kT; k <= kEnde && !bos; k++) {
        // letzter Swing, der vor dieser Kerze bestätigt war
        let s = null;
        for (let a = 0, b = liste.length - 1; a <= b;) { const m = (a + b) >> 1; if (liste[m].bekannt < k) { s = liste[m]; a = m + 1; } else b = m - 1; }
        if (!s || handelstagNr(z.sd[s.k], e) < htMin) continue;
        const wert = p.koerper ? z.c[k] : lang ? z.h[k] : z.l[k];
        if (lang ? !(wert > s.preis) : !(wert < s.preis)) continue;
        if (p.dailyOpen) {
          const dOpen = D.o[dIdx[z.en[k]]];
          if (lang ? !(z.c[k] > dOpen) : !(z.c[k] < dOpen)) continue;
        }
        bos = { k, swing: s };
      }
      if (!bos) continue;
      if (zaehlt) trichter.bos++;

      // 100 %: Extrem zwischen min(Treffer, Swing-Pivot) und BOS-Kerze
      const iA = Math.min(iT, z.s[bos.swing.k]), iB = z.en[bos.k];
      let lo = lang ? Infinity : -Infinity, iLo = iA;
      for (let i = iA; i <= iB; i++) { if (lang ? basis.l[i] < lo : basis.h[i] > lo) { lo = lang ? basis.l[i] : basis.h[i]; iLo = i; } }
      let hi = lang ? -Infinity : Infinity;
      for (let i = iLo; i <= iB; i++) { if (lang ? basis.h[i] > hi : basis.l[i] < hi) hi = lang ? basis.h[i] : basis.l[i]; }
      const verfall = p.verfall === 'fenster' ? iEnde : p.verfall === 'tag' ? D.en[dIdx[iB]] : basis.n - 1;

      // Ungültig-Marke: fest an der Spanne beim BOS (hi/lo am Ende der BOS-Kerze), nicht am nachgeführten Hoch
      const ungueltigPreis = p.ungueltigAn ? hi - p.ungueltig * (hi - lo) : null;

      for (let i = iB + 1; i <= verfall && i < basis.n; i++) {
        const spanne = hi - lo; // bei Short negativ
        const limit = hi - fib * spanne;
        if (ungueltigPreis !== null && (lang ? basis.h[i] >= ungueltigPreis : basis.l[i] <= ungueltigPreis)) {
          if (zaehlt) trichter.ungueltig++;
          break; // schon in Trade-Richtung weggelaufen, bevor die Zone erreicht wurde
        }
        const bruch = lang ? basis.l[i] < lo : basis.h[i] > lo;
        const gefuellt = lang ? basis.l[i] <= limit : basis.h[i] >= limit;
        if (gefuellt) {
          const preis = lang ? Math.min(basis.o[i], limit) : Math.max(basis.o[i], limit);
          out.push({
            iSignal: iB, seite: L.seite, einstieg: { art: 'gefuellt', idx: i, preis },
            sl: hi - p.sl * spanne, tp: hi - p.tp * spanne,
            info: { linie: L.id, tf: L.tf, lvl: L.lvl, swing: bos.swing.preis, fib0: hi, fib100: lo },
          });
          if (zaehlt) trichter.einstieg++;
          break;
        }
        if (bruch) break; // 100 % gebrochen, bevor die Zone erreicht wurde
        if (lang ? basis.h[i] > hi : basis.l[i] < hi) hi = lang ? basis.h[i] : basis.l[i]; // neues Hoch zählt ab der nächsten Kerze
      }
    }
    return { setups: out, trichter };
  },
};
