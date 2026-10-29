// Kerims GVA-Strategie nach dem Regelwerk vom 29.10.2026 (Beschreibung für Long, Short gespiegelt).
// Strikte Reihenfolge – nichts darf vor dem vorherigen Schritt «vorbereitet» werden:
//   1. GVA-Hit: Eine Long-GVA-Linie (3D) wird zum ersten Mal berührt. Erst ab jetzt läuft der tiefe Zeitrahmen (15/30 Min).
//   2. Im Moment des Hits wird das LETZTE HOCH fixiert: letztes bestätigtes Swing-Hoch (Fractal mit N Kerzen links/rechts)
//      vor der Treffer-Kerze. Es bleibt das BOS-Level, auch wenn der Kurs danach tiefer läuft und neue, tiefere Hochs macht.
//   3. BOS = Körper-Schluss (Body Close) über dem letzten Hoch UND über dem Daily Open (17:00 New York).
//      Daily Open: vom Tag des Hits oder vom Tag des BOS – eines reicht (einstellbar). Liegt das Hoch unter dem Daily Open,
//      muss also auch das Daily Open per Schluss gebrochen werden.
//   4. Low (100 % = Stop-Loss) = tiefster Punkt zwischen Hit und BOS (läuft der Kurs vor dem BOS tiefer, wandert es mit).
//   5. Fib erst nach dem BOS: 100 % = Low, 0 % = Hoch. Das Hoch wird nachgezogen, solange der Kurs nicht in die Box zurückkommt
//      (eine Kerze mit neuem Hoch zählt erst ab der nächsten Kerze).
//   6. Einstieg mit Limit bei der Fib-Stufe (Standard 0,618). Box = 0,618–0,786: darin müssen genug Confluences liegen
//      (GVA-Linie, Daily/Weekly/Monthly Open) – sonst kein Trade.
//   7. Management: TP −100 %, Hälfte bei −62 %, Stop auf Break-Even ab −27 % (alles einstellbar).
// Alles, was noch getestet werden soll (Gegen-BOS, Ungültig-Marke, Zeitlimits, Anzahl Confluences …), ist ein Parameter.
// Jedes Setup bekommt in info alles mit, was der Chart zum Nachprüfen braucht (Zeiten und Preise jedes Schritts).
import { param } from '../bausteine.mjs';
import { swings } from '../indikatoren.mjs';
import { handelstagNr } from '../daten.mjs';
import { profil, profilKurz } from '../volumen.mjs';

const { zahl, auswahl, mehrfach, schalter } = param;

// Alle Confluence-Arten, die pro Trade erfasst werden (auch die, die nicht als Bedingung zählen) – daraus wertet die Labor-Seite aus,
// welche Confluence wie oft vorkam und wie sie abgeschnitten hat.
export const CONF_ARTEN = ['gva', 'd', 'w', 'm', 'poc', 'va'];

// Letzter Eintrag einer nach «bekannt» sortierten Swing-Liste mit bekannt < k (binäre Suche); Index oder -1
function letzterBekannt(liste, k) {
  let r = -1;
  for (let a = 0, b = liste.length - 1; a <= b;) { const m = (a + b) >> 1; if (liste[m].bekannt < k) { r = m; a = m + 1; } else b = m - 1; }
  return r;
}

export default {
  id: 'gva-kerim',
  name: 'GVA → BOS → Fib (Regelwerk Kerim)',
  beschreibung: 'Erst GVA-Hit, dann fixiertes letztes Hoch als BOS-Level, BOS per Körper-Schluss über Hoch und Daily Open, Fib vom Low (bis BOS) zum nachgezogenen Hoch, Einstieg in der Box mit Confluences, Teilgewinn und Break-Even.',
  aufloesung: (p) => (p.tiefTf === '30m' ? 1800 : 900),
  parameter: [
    mehrfach('tfs', 'GVA-Linien von', ['3D'], ['3D', 'W', 'M']),
    auswahl('tiefTf', 'Tiefer Zeitrahmen (Swings und BOS)', '15m', [{ wert: '15m', text: '15 Min' }, { wert: '30m', text: '30 Min' }]),
    zahl('swingN', 'Letztes Hoch: Kerzen links/rechts', 10, 1, 30, 1, 'Ein Hoch zählt, wenn es höher ist als N Kerzen davor und danach. Grösser = nur deutlichere Hochs (kleine Zwischenhochs im Abwärtszug zählen nicht).'),
    zahl('swingAlter', 'Letztes Hoch höchstens so alt (Handelstage vor dem Hit)', 3, 0, 15, 1),
    zahl('fenster', 'Zeit für den BOS (Handelstage ab dem Hit)', 2, 0, 10, 1, 'Der Treffertag zählt als Tag 0'),
    schalter('koerper', 'BOS nur mit Körper-Schluss', true, 'aus: schon der Docht über dem Hoch zählt'),
    auswahl('dailyOpen', 'BOS über dem Daily Open', 'eines', [
      { wert: 'eines', text: 'Open vom Hit-Tag oder BOS-Tag (eines reicht)' }, { wert: 'bos', text: 'Open vom BOS-Tag' },
      { wert: 'treffer', text: 'Open vom Hit-Tag' }, { wert: 'beide', text: 'über beiden' }, { wert: 'aus', text: 'nicht nötig (nur BOS)' },
    ]),
    auswahl('fib', 'Einstieg bei Fib', '0.618', [{ wert: '0.5', text: '0,5' }, { wert: '0.618', text: '0,618' }, { wert: '0.705', text: '0,705' }, { wert: '0.786', text: '0,786' }]),
    zahl('boxVon', 'Box von Fib', 0.618, 0.3, 0.9, 0.001),
    zahl('boxBis', 'Box bis Fib', 0.786, 0.4, 1, 0.001),
    mehrfach('conf', 'Confluences, die in der Box zählen', ['gva', 'd', 'w', 'm'], [
      { wert: 'gva', text: 'GVA-Linie' }, { wert: 'd', text: 'Daily Open' }, { wert: 'w', text: 'Weekly Open' }, { wert: 'm', text: 'Monthly Open' },
      { wert: 'poc', text: 'Volumen-POC (GVA-Hit bis Hoch/Tief)' }, { wert: 'va', text: 'Value Area Low (Long) / High (Short) (GVA-Hit bis Hoch/Tief)' },
    ], 'Welche Confluence der Trade hatte, steht in der Trade-Liste und im Chart – unabhängig davon, was hier als Bedingung angehakt ist. Für die Auswertung «welche Confluence funktioniert?» alle ankreuzen und «Mindestens» auf 0 setzen; ausgewertet und gefiltert wird dann auf der Ergebnis-Seite.'),
    zahl('minConf', 'Mindestens so viele Confluences in der Box', 1, 0, 6, 1, '0 = egal (dann entstehen auch Trades ohne Confluence)'),
    zahl('volZeilen', 'Volumenprofil: Anzahl Zeilen', 24, 8, 100, 1, 'Wie bei TradingView «Volume Profile» (24 Zeilen). Das Profil läuft vom GVA-Hit bis zum Hoch (Long) bzw. Tief (Short) = Fib 0 %. Datenbasis: Zeit auf Preis, da die Kursdaten kein Volumen enthalten.'),
    zahl('volVa', 'Volumenprofil: Value Area (%)', 70, 50, 95, 1),
    zahl('sl', 'Stop-Loss bei Fib', 1, 1, 1.5, 0.05, '1 = 100 % (das Low)'),
    zahl('tp', 'Take-Profit bei Fib', -1, -3, 0, 0.01, '−1 = −100 %'),
    schalter('teilAn', 'Teilgewinn nehmen', true),
    zahl('teilBei', 'Teilgewinn bei Fib', -0.62, -3, 0, 0.01),
    zahl('teilAnteil', 'Teilgewinn: Anteil der Position (%)', 50, 10, 90, 5),
    schalter('beAn', 'Stop auf Break-Even nachziehen', true),
    zahl('beBei', 'Break-Even ab Fib', -0.27, -3, 0, 0.01, 'Gilt ab der Kerze nach dem Erreichen (vorsichtig)'),
    schalter('ungueltigAn', 'Setup ungültig, wenn der Kurs vor dem Einstieg schon weg ist', true),
    zahl('ungueltig', 'Ungültig bei Fib', -0.4, -2, -0.05, 0.01, 'gemessen an der Spanne beim BOS'),
    auswahl('gegenBos', 'Gegen-BOS vor dem Einstieg', 'egal', [
      { wert: 'egal', text: 'egal (nur vermerken)' }, { wert: 'ungueltig', text: 'Setup ungültig' }, { wert: 'nur', text: 'nur Setups mit Gegen-BOS' },
    ], 'Gegen-BOS = Körper-Schluss unter dem letzten Swing-Tief, das sich nach dem BOS gebildet hat'),
    zahl('gegenN', 'Gegen-BOS: Swing-Kerzen links/rechts', 2, 1, 10, 1),
    zahl('einstiegStd', 'Einstieg spätestens so viele Stunden nach dem BOS', 0, 0, 240, 1, '0 = kein Limit'),
    auswahl('verfall', 'Setup verfällt zusätzlich', 'nie', [{ wert: 'nie', text: 'nie (nur Low-Bruch/Ungültig/Stunden)' }, { wert: 'tag', text: 'am Ende des BOS-Tages' }, { wert: 'fenster', text: 'am Ende des BOS-Zeitfensters' }]),
  ],
  nachbarn(p) {
    const fibs = ['0.5', '0.618', '0.705', '0.786'];
    const i = fibs.indexOf(p.fib);
    const out = [];
    if (i < fibs.length - 1) out.push({ ...p, fib: fibs[i + 1] });
    out.push({ ...p, swingN: p.swingN >= 10 ? p.swingN - 3 : p.swingN + 3 });
    return out;
  },
  setups(ctx, p) {
    const { basis, e } = ctx;
    const z = ctx.tf(p.tiefTf);
    const zIdx = ctx.htfIndex(p.tiefTf);
    const sw = ctx.merke(`swings-${p.tiefTf}-${p.swingN}`, () => swings(z, p.swingN));
    const gsw = ctx.merke(`swings-${p.tiefTf}-${p.gegenN}`, () => swings(z, p.gegenN));
    const { D, idx: dIdx } = ctx.tag();
    const W = ctx.tf('W'), wIdx = ctx.htfIndex('W');
    const M = ctx.tf('M'), mIdx = ctx.htfIndex('M');
    const fib = Number(p.fib);
    const boxA = Math.min(p.boxVon, p.boxBis), boxB = Math.max(p.boxVon, p.boxBis);
    const trichter = { linien: 0, keinHoch: 0, bosNurUnterOpen: 0, keinBos: 0, bos: 0, ungueltig: 0, gebrochen: 0, verfallen: 0, zuWenigConf: 0, gegenBos: 0, einstieg: 0 };
    const out = [];

    for (const L of ctx.linien(p.tfs)) {
      const zaehlt = ctx.imBereich(L.iTreffer);
      const zaehl = (k) => { if (zaehlt) trichter[k]++; };
      zaehl('linien');
      const lang = L.seite > 0;
      const ueber = (a, b) => (lang ? a > b : a < b);
      const iT = L.iTreffer;
      const kT = zIdx[iT];
      const htStart = handelstagNr(basis.sd[iT], e);

      // 2. Letztes Hoch (Short: letztes Tief) – bestätigt vor der Treffer-Kerze, danach fix
      const liste = lang ? sw.hoch : sw.tief;
      const si = letzterBekannt(liste, kT);
      const swing = si >= 0 ? liste[si] : null;
      if (!swing || handelstagNr(z.sd[swing.k], e) < htStart - p.swingAlter || !ueber(swing.preis, L.lvl)) { zaehl('keinHoch'); continue; }
      const level = swing.preis;

      // Zeitfenster für den BOS (Basis-Index)
      let iEnde = iT;
      while (iEnde + 1 < basis.n && handelstagNr(basis.sd[iEnde + 1], e) - htStart <= p.fenster) iEnde++;
      const kEnde = zIdx[iEnde];
      const openHit = D.o[dIdx[iT]];

      // 3. BOS: Schluss über dem Level und über dem Daily Open
      let bos = null, nurUnterOpen = false;
      for (let k = kT; k <= kEnde; k++) {
        const wert = p.koerper ? z.c[k] : lang ? z.h[k] : z.l[k];
        if (!ueber(wert, level)) continue;
        const openBos = D.o[dIdx[z.en[k]]];
        const opens = p.dailyOpen === 'eines' ? [openHit, openBos] : p.dailyOpen === 'bos' ? [openBos] : p.dailyOpen === 'treffer' ? [openHit] : p.dailyOpen === 'beide' ? [openHit, openBos] : [];
        const ok = !opens.length || (p.dailyOpen === 'beide' ? opens.every((o) => ueber(z.c[k], o)) : opens.some((o) => ueber(z.c[k], o)));
        if (!ok) { nurUnterOpen = true; continue; }
        // Bei «eines»: das Open, das tatsächlich gebrochen wurde (das nähere am Kurs zuerst)
        const genutzt = opens.length ? opens.filter((o) => ueber(z.c[k], o)).sort((a, b) => (lang ? b - a : a - b))[0] : null;
        bos = { k, open: genutzt };
        break;
      }
      if (!bos) { zaehl(nurUnterOpen ? 'bosNurUnterOpen' : 'keinBos'); continue; }
      zaehl('bos');

      // 4. Low: Extrem zwischen Hit und Ende der BOS-Kerze
      const iB = z.en[bos.k];
      let lo = lang ? Infinity : -Infinity, iLo = iT;
      for (let i = iT; i <= iB; i++) if (lang ? basis.l[i] < lo : basis.h[i] > lo) { lo = lang ? basis.l[i] : basis.h[i]; iLo = i; }
      let hi = lang ? -Infinity : Infinity, iHi = iLo;
      for (let i = iLo; i <= iB; i++) if (lang ? basis.h[i] > hi : basis.l[i] < hi) { hi = lang ? basis.h[i] : basis.l[i]; iHi = i; }
      const ungueltigPreis = p.ungueltigAn ? hi - p.ungueltig * (hi - lo) : null;

      // Verfall
      let verfall = basis.n - 1;
      if (p.verfall === 'fenster') verfall = Math.max(iB, iEnde);
      else if (p.verfall === 'tag') verfall = D.en[dIdx[iB]];
      if (p.einstiegStd > 0) { const grenze = basis.t[iB] + p.einstiegStd * 3600; while (verfall > iB && basis.t[verfall] > grenze) verfall--; }

      // Gegen-BOS: Schluss unter (Short: über) dem letzten Gegen-Swing, der sich nach dem BOS gebildet hat
      const gListe = lang ? gsw.tief : gsw.hoch;
      let gegen = null;

      let ende = 'verfallen';
      for (let i = iB + 1; i <= verfall && i < basis.n; i++) {
        const spanne = hi - lo;
        const limit = hi - fib * spanne;
        if (ungueltigPreis !== null && (lang ? basis.h[i] >= ungueltigPreis : basis.l[i] <= ungueltigPreis)) { ende = 'ungueltig'; break; }
        if (lang ? basis.l[i] <= limit : basis.h[i] >= limit) {
          // Box und Confluences zum Zeitpunkt des Einstiegs (alles, was hier benutzt wird, ist bekannt)
          const oben = hi - boxA * spanne, unten = hi - boxB * spanne;
          const inBox = (x) => x <= Math.max(oben, unten) && x >= Math.min(oben, unten);
          const kandidaten = { gva: L.lvl, d: D.o[dIdx[i]], w: W.o[wIdx[i]], m: M.o[mIdx[i]] };
          // Volumenprofil vom GVA-Hit bis zum Hoch (Short: Tief) – nur Kerzen bis zur Hoch-Kerze, also nichts aus der Zukunft.
          // Long: POC oder Value Area LOW, Short: POC oder Value Area HIGH.
          const vol = iHi >= iT && iHi < i ? profil(basis, iT, iHi, p.volZeilen, p.volVa) : null;
          if (vol) { kandidaten.poc = vol.poc; kandidaten.va = lang ? vol.val : vol.vah; }
          // confAlle: alles, was in der Box liegt (für die Auswertung); conf: nur die Arten, die als Bedingung angehakt sind
          const confAlle = CONF_ARTEN.filter((c) => kandidaten[c] !== undefined && inBox(kandidaten[c])).map((c) => ({ art: c, preis: kandidaten[c] }));
          const conf = confAlle.filter((c) => p.conf.includes(c.art));
          if (conf.length < p.minConf) { ende = 'zuWenigConf'; break; }
          if (p.gegenBos === 'ungueltig' && gegen) { ende = 'gegenBos'; break; }
          if (p.gegenBos === 'nur' && !gegen) { ende = 'gegenBos'; break; }
          const preis = lang ? Math.min(basis.o[i], limit) : Math.max(basis.o[i], limit);
          const fibPreis = (f) => hi - f * spanne;
          const tp = fibPreis(p.tp);
          const management = {};
          if (p.teilAn && ueber(tp, fibPreis(p.teilBei)) && ueber(fibPreis(p.teilBei), preis)) management.teil = { preis: fibPreis(p.teilBei), anteil: p.teilAnteil / 100 };
          if (p.beAn && ueber(fibPreis(p.beBei), preis)) management.be = { preis: fibPreis(p.beBei) };
          out.push({
            iSignal: iB, seite: L.seite, einstieg: { art: 'gefuellt', idx: i, preis },
            sl: fibPreis(p.sl), tp, management: management.teil || management.be ? management : null,
            info: {
              linie: L.id, tf: L.tf, lvl: L.lvl, tTreffer: basis.t[iT],
              swing: level, tSwing: z.t[swing.k], tBos: z.t[bos.k], dailyOpen: bos.open, openHit,
              fib0: hi, fib100: lo, tFib0: basis.t[iHi], tFib100: basis.t[iLo],
              box: [Math.min(oben, unten), Math.max(oben, unten)], conf, confAlle, vol: profilKurz(vol), tHoch: basis.t[iHi], gegenBos: gegen ? gegen.t : null,
              teil: management.teil ? management.teil.preis : null, be: management.be ? management.be.preis : null,
              ungueltig: ungueltigPreis,
            },
          });
          ende = 'einstieg';
          break;
        }
        if (lang ? basis.l[i] < lo : basis.h[i] > lo) { ende = 'gebrochen'; break; }
        if (lang ? basis.h[i] > hi : basis.l[i] < hi) { hi = lang ? basis.h[i] : basis.l[i]; iHi = i; } // zählt ab der nächsten Kerze (iHi = Kerze mit dem Hoch, Ende des Volumenprofils)
        // Am Schluss einer Kerze des tiefen Zeitrahmens: Gegen-BOS prüfen (nur Swings, die nach dem BOS entstanden und schon bestätigt sind)
        const kk = zIdx[i];
        if (!gegen && z.en[kk] === i) {
          const gi = letzterBekannt(gListe, kk + 1);
          if (gi >= 0 && gListe[gi].k > bos.k && (lang ? z.c[kk] < gListe[gi].preis : z.c[kk] > gListe[gi].preis)) gegen = { t: z.t[kk] };
        }
      }
      zaehl(ende);
    }
    return { setups: out, trichter };
  },
};
