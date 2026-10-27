// Bausteine des Labors: Ereignisse (wann?), Filter (nur wenn …) und Ausstiege (wie raus?).
// Jeder Baustein beschreibt seine Parameter selbst (Name, Standard, Grenzen, Hilfe) – daraus baut die Labor-Seite das Formular.
// Ereignisse werden am SCHLUSS einer Kerze des gewählten Zeitrahmens ausgewertet; sie nutzen nur Kerzen bis dorthin.
import { linienFinden, pipVon } from '../trading.mjs';
import { zeitrahmen, stundenFuerGva, handelstagNr } from './daten.mjs';
import { sma, atr, rsi, hoechstesVorher, tiefstesVorher } from './indikatoren.mjs';
import { zuerich, sitzungVon, SITZUNGEN, WOCHENTAGE } from './zeit.mjs';

// ---------- Parameter-Helfer (Schema für die Seite) ----------
const zahl = (key, name, standard, min, max, schritt, hilfe) => ({ key, name, typ: 'zahl', standard, min, max, schritt, hilfe });
const auswahl = (key, name, standard, optionen, hilfe) => ({ key, name, typ: 'auswahl', standard, optionen: optionen.map((o) => (typeof o === 'string' ? { wert: o, text: o } : o)), hilfe });
const mehrfach = (key, name, standard, optionen, hilfe) => ({ key, name, typ: 'mehrfach', standard, optionen: optionen.map((o) => (typeof o === 'string' ? { wert: o, text: o } : o)), hilfe });
const schalter = (key, name, standard, hilfe) => ({ key, name, typ: 'schalter', standard, hilfe });
export const param = { zahl, auswahl, mehrfach, schalter };

export function mitStandard(schema, p = {}) {
  const out = {};
  for (const s of schema) {
    let v = p[s.key] ?? s.standard;
    if (s.typ === 'zahl') { v = Number(v); if (!Number.isFinite(v)) v = s.standard; if (s.min !== undefined) v = Math.max(s.min, v); if (s.max !== undefined) v = Math.min(s.max, v); }
    if (s.typ === 'schalter') v = !!v;
    if (s.typ === 'auswahl' && !s.optionen.some((o) => o.wert === v)) v = s.standard;
    if (s.typ === 'mehrfach') v = Array.isArray(v) ? v.filter((x) => s.optionen.some((o) => o.wert === x)) : s.standard;
    out[s.key] = v;
  }
  return out;
}

// ---------- Kontext pro Paar (wird von Ereignissen, Filtern und Strategien geteilt) ----------
export function kontext(basis, e, pair) {
  const ctx = { basis, e, pair, pip: pipVon(pair), cache: new Map() };
  ctx.tf = (tf) => zeitrahmen(basis, tf);
  ctx.merke = (k, fn) => { if (!ctx.cache.has(k)) ctx.cache.set(k, fn()); return ctx.cache.get(k); };
  // Tages-Infos: Index des Handelstags je Basis-Kerze, ATR 14 und SMA 200 der Tagesschlüsse
  ctx.tag = () => ctx.merke('tag', () => {
    const D = ctx.tf('D');
    const idx = new Int32Array(basis.n);
    for (let k = 0; k < D.n; k++) for (let i = D.s[k]; i <= D.en[k]; i++) idx[i] = k;
    const a = atr(D, 14), s200 = sma(D.c, 200);
    // ATR-Perzentil über die letzten 250 Tage (0–100)
    const perz = new Float64Array(D.n).fill(NaN);
    for (let k = 250; k < D.n; k++) {
      let unter = 0;
      for (let j = k - 250; j < k; j++) if (a[j] < a[k]) unter++;
      perz[k] = (unter / 250) * 100;
    }
    return { D, idx, atr: a, sma200: s200, perz };
  });
  // Werte des VORTAGS (am Signalzeitpunkt sicher bekannt)
  ctx.tagesAtr = (i) => { const t = ctx.tag(); const k = t.idx[i] - 1; return k >= 0 ? t.atr[k] : NaN; };
  ctx.htfIndex = (tf) => ctx.merke(`idx-${tf}`, () => {
    const z = ctx.tf(tf);
    const idx = new Int32Array(basis.n);
    for (let k = 0; k < z.n; k++) for (let i = z.s[k]; i <= z.en[k]; i++) idx[i] = k;
    return idx;
  });
  // GVA-Linien (wie Live/Statistik) mit genauem ersten Treffer in den Basis-Kerzen
  ctx.linien = (tfs) => ctx.merke(`gva-${tfs.join(',')}`, () => {
    const d = stundenFuerGva(basis);
    if (d.t.length < 50) return [];
    const out = [];
    for (const l of linienFinden(pair, d, e, tfs)) {
      if (l.status !== 'treffer') continue;
      const lang = l.seite === 'long';
      const ziel = lang ? l.lvlRoh + l.atrB * e.touchTol : l.lvlRoh - l.atrB * e.touchTol;
      let iT = d.s[l.j];
      for (let i = d.s[l.j]; i <= d.en[l.j]; i++) {
        const w = e.docht ? (lang ? basis.l[i] : basis.h[i]) : (lang ? Math.min(basis.o[i], basis.c[i]) : Math.max(basis.o[i], basis.c[i]));
        if (lang ? w <= ziel : w >= ziel) { iT = i; break; }
      }
      out.push({ id: l.id, tf: l.tf, seite: lang ? 1 : -1, lvl: l.lvlRoh, iTreffer: iT, entstanden: l.entstanden, atrB: l.atrB, B: l.B });
    }
    out.sort((a, b) => a.iTreffer - b.iTreffer);
    return out;
  });
  return ctx;
}

// ---------- Ereignisse ----------
// berechnen(ctx, z, p) → { long: Uint8Array, short: Uint8Array } je Kerze von z (1 = Ereignis am Schluss dieser Kerze)
const leer = (n) => ({ long: new Uint8Array(n), short: new Uint8Array(n) });
const gleich = (a) => ({ long: a, short: a });

function htfOpen(ctx, z, bezug) {
  // Open der laufenden Bezugs-Kerze (Tag/Woche/Monat) am Schluss jeder Kerze von z – das Open ist ab Beginn bekannt
  const H = ctx.tf(bezug), idx = ctx.htfIndex(bezug);
  const out = new Float64Array(z.n);
  for (let k = 0; k < z.n; k++) out[k] = H.o[idx[z.en[k]]];
  return out;
}

export const EREIGNISSE = [
  {
    id: 'schluss_open', name: 'Schluss über/unter Open', gerichtet: true,
    beschreibung: 'Long: Kerze schliesst über dem Open des laufenden Tages/der Woche/des Monats. Short: darunter.',
    parameter: [auswahl('bezug', 'Open von', 'D', [{ wert: 'D', text: 'Tag' }, { wert: 'W', text: 'Woche' }, { wert: 'M', text: 'Monat' }])],
    berechnen(ctx, z, p) {
      const op = htfOpen(ctx, z, p.bezug), r = leer(z.n);
      for (let k = 0; k < z.n; k++) { r.long[k] = z.c[k] > op[k] ? 1 : 0; r.short[k] = z.c[k] < op[k] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'kerze', name: 'Starke Kerze', gerichtet: true,
    beschreibung: 'Long: grüne Kerze mit Körper mindestens X × ATR. Short: rote Kerze.',
    parameter: [zahl('atr', 'Körper mind. (× ATR 14)', 1, 0.1, 5, 0.1)],
    berechnen(ctx, z, p) {
      const a = atr(z, 14), r = leer(z.n);
      for (let k = 1; k < z.n; k++) { const b = z.c[k] - z.o[k]; r.long[k] = b >= p.atr * a[k - 1] ? 1 : 0; r.short[k] = -b >= p.atr * a[k - 1] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'ausbruch', name: 'Ausbruch (n-Kerzen-Hoch/Tief)', gerichtet: true,
    beschreibung: 'Long: Schluss über dem höchsten Hoch der letzten n Kerzen (Donchian). Short: unter dem tiefsten Tief.',
    parameter: [zahl('n', 'Kerzen', 20, 2, 300, 1)],
    berechnen(ctx, z, p) {
      const hh = hoechstesVorher(z.h, p.n), ll = tiefstesVorher(z.l, p.n), r = leer(z.n);
      for (let k = 0; k < z.n; k++) { r.long[k] = z.c[k] > hh[k] ? 1 : 0; r.short[k] = z.c[k] < ll[k] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'rsi', name: 'RSI', gerichtet: true,
    beschreibung: 'Long: RSI kommt von unter der Schwelle zurück darüber (oder ist darunter). Short gespiegelt (100 − Schwelle).',
    parameter: [zahl('n', 'Länge', 14, 2, 100, 1), zahl('schwelle', 'Schwelle (Long)', 30, 1, 49, 1), auswahl('modus', 'Auslöser', 'zurueck', [{ wert: 'zurueck', text: 'kommt zurück' }, { wert: 'drin', text: 'ist jenseits' }])],
    berechnen(ctx, z, p) {
      const v = rsi(z.c, p.n), r = leer(z.n), o = 100 - p.schwelle;
      for (let k = 1; k < z.n; k++) {
        if (p.modus === 'drin') { r.long[k] = v[k] < p.schwelle ? 1 : 0; r.short[k] = v[k] > o ? 1 : 0; }
        else { r.long[k] = v[k - 1] < p.schwelle && v[k] >= p.schwelle ? 1 : 0; r.short[k] = v[k - 1] > o && v[k] <= o ? 1 : 0; }
      }
      return r;
    },
  },
  {
    id: 'ma_kreuz', name: 'Gleitende Durchschnitte kreuzen', gerichtet: true,
    beschreibung: 'Long: schneller SMA kreuzt über den langsamen. Short: darunter.',
    parameter: [zahl('schnell', 'Schnell', 20, 2, 300, 1), zahl('langsam', 'Langsam', 50, 3, 500, 1)],
    berechnen(ctx, z, p) {
      const a = sma(z.c, p.schnell), b = sma(z.c, p.langsam), r = leer(z.n);
      for (let k = 1; k < z.n; k++) { r.long[k] = a[k - 1] <= b[k - 1] && a[k] > b[k] ? 1 : 0; r.short[k] = a[k - 1] >= b[k - 1] && a[k] < b[k] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'ma_lage', name: 'Über/unter Durchschnitt', gerichtet: true,
    beschreibung: 'Long: Schluss über dem SMA n (Trend). Short: darunter.',
    parameter: [zahl('n', 'SMA-Länge', 200, 2, 500, 1)],
    berechnen(ctx, z, p) {
      const a = sma(z.c, p.n), r = leer(z.n);
      for (let k = 0; k < z.n; k++) { r.long[k] = z.c[k] > a[k] ? 1 : 0; r.short[k] = z.c[k] < a[k] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'abstand_ma', name: 'Weit vom Durchschnitt', gerichtet: true,
    beschreibung: 'Long: Schluss mehr als X ATR unter dem SMA n (überdehnt, Rücklauf erwartet). Short: darüber.',
    parameter: [zahl('n', 'SMA-Länge', 20, 2, 500, 1), zahl('atr', 'Abstand (× ATR 14)', 2, 0.2, 10, 0.1)],
    berechnen(ctx, z, p) {
      const a = sma(z.c, p.n), t = atr(z, 14), r = leer(z.n);
      for (let k = 0; k < z.n; k++) { r.long[k] = z.c[k] < a[k] - p.atr * t[k] ? 1 : 0; r.short[k] = z.c[k] > a[k] + p.atr * t[k] ? 1 : 0; }
      return r;
    },
  },
  {
    id: 'gap', name: 'Lücke zum Vorschluss', gerichtet: true,
    beschreibung: 'Erste Kerze eines Tages/einer Woche öffnet mehr als X Tages-ATR vom letzten Schluss entfernt. «Füllen»: Long nach Lücke nach unten. «Folgen»: Long nach Lücke nach oben.',
    parameter: [auswahl('bezug', 'Lücke beim', 'W', [{ wert: 'D', text: 'Tag' }, { wert: 'W', text: 'Wochenstart' }]), zahl('atr', 'Mindestens (× Tages-ATR)', 0.3, 0.05, 5, 0.05), auswahl('modus', 'Erwartung', 'fuellen', [{ wert: 'fuellen', text: 'Lücke füllt sich' }, { wert: 'folgen', text: 'Lücke läuft weiter' }])],
    berechnen(ctx, z, p) {
      const H = ctx.tf(p.bezug), idx = ctx.htfIndex(p.bezug), r = leer(z.n);
      for (let k = 1; k < z.n; k++) {
        const hk = idx[z.s[k]];
        if (hk < 1 || H.s[hk] !== z.s[k]) continue; // nur die erste Kerze des Tages/der Woche
        const a = ctx.tagesAtr(z.s[k]);
        const gap = (H.o[hk] - H.c[hk - 1]) / a;
        if (!(Math.abs(gap) >= p.atr)) continue;
        const runter = gap < 0;
        if (p.modus === 'fuellen') { r.long[k] = runter ? 1 : 0; r.short[k] = runter ? 0 : 1; }
        else { r.long[k] = runter ? 0 : 1; r.short[k] = runter ? 1 : 0; }
      }
      return r;
    },
  },
  {
    id: 'serie', name: 'Serie gleicher Kerzen', gerichtet: true,
    beschreibung: 'n Kerzen in Folge gleicher Farbe. «Umkehr»: Long nach n roten. «Folgen»: Long nach n grünen.',
    parameter: [zahl('n', 'Kerzen in Folge', 3, 2, 15, 1), auswahl('modus', 'Erwartung', 'umkehr', [{ wert: 'umkehr', text: 'Umkehr' }, { wert: 'folgen', text: 'Weiterlaufen' }])],
    berechnen(ctx, z, p) {
      const r = leer(z.n);
      let gruen = 0, rot = 0;
      for (let k = 0; k < z.n; k++) {
        if (z.c[k] > z.o[k]) { gruen++; rot = 0; } else if (z.c[k] < z.o[k]) { rot++; gruen = 0; } else { gruen = 0; rot = 0; }
        const nachRot = rot === p.n, nachGruen = gruen === p.n;
        if (p.modus === 'umkehr') { r.long[k] = nachRot ? 1 : 0; r.short[k] = nachGruen ? 1 : 0; }
        else { r.long[k] = nachGruen ? 1 : 0; r.short[k] = nachRot ? 1 : 0; }
      }
      return r;
    },
  },
  {
    id: 'gva_treffer', name: 'GVA-Linie erster Treffer', gerichtet: true,
    beschreibung: 'Die Kerze, in der eine GVA-Linie (Regeln wie Live/Statistik) zum ersten Mal getroffen wird. Long-Linie → Long, Short-Linie → Short.',
    parameter: [mehrfach('tfs', 'Linien von', ['3D', 'W'], ['3D', 'W', 'M'])],
    berechnen(ctx, z, p) {
      const r = leer(z.n);
      if (!p.tfs.length) return r;
      const idx = ctx.merke(`idx-z-${z.tf}`, () => { const a = new Int32Array(ctx.basis.n); for (let k = 0; k < z.n; k++) for (let i = z.s[k]; i <= z.en[k]; i++) a[i] = k; return a; });
      for (const l of ctx.linien(p.tfs)) (l.seite > 0 ? r.long : r.short)[idx[l.iTreffer]] = 1;
      return r;
    },
  },
  {
    id: 'kalender', name: 'Kalender', gerichtet: false,
    beschreibung: 'Nur an bestimmten Wochentagen, in bestimmten Monaten oder am Monatsanfang/-ende (Zürcher Zeit). Ohne Richtung.',
    parameter: [
      mehrfach('wochentage', 'Wochentage', ['Mo', 'Di', 'Mi', 'Do', 'Fr'], ['Mo', 'Di', 'Mi', 'Do', 'Fr']),
      mehrfach('monate', 'Monate', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((m) => ({ wert: m, text: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][Number(m) - 1] }))),
      auswahl('monatsteil', 'Teil des Monats', 'alle', [{ wert: 'alle', text: 'ganzer Monat' }, { wert: 'anfang', text: 'erste 3 Handelstage' }, { wert: 'ende', text: 'letzte 3 Handelstage' }]),
    ],
    berechnen(ctx, z, p) {
      const a = new Uint8Array(z.n);
      const M = ctx.tf('M'), mIdx = ctx.htfIndex('M'), dIdx = ctx.tag().idx;
      for (let k = 0; k < z.n; k++) {
        const zt = zuerich(z.t[k]);
        if (!p.wochentage.includes(WOCHENTAGE[zt.wochentag]) || !p.monate.includes(String(zt.monat))) continue;
        if (p.monatsteil !== 'alle') {
          const mk = mIdx[z.s[k]], dk = dIdx[z.s[k]];
          const ersterTag = dIdx[M.s[mk]], letzterTag = dIdx[M.en[mk]];
          if (p.monatsteil === 'anfang' && dk - ersterTag > 2) continue;
          if (p.monatsteil === 'ende' && letzterTag - dk > 2) continue;
        }
        a[k] = 1;
      }
      return gleich(a);
    },
  },
  {
    id: 'uhrzeit', name: 'Uhrzeit', gerichtet: false,
    beschreibung: 'Nur Kerzen, die in diesem Zeitfenster (Zürcher Zeit) beginnen. Ohne Richtung.',
    parameter: [zahl('von', 'Von (Stunde)', 8, 0, 23, 1), zahl('bis', 'Bis (Stunde, ausschl.)', 12, 1, 24, 1)],
    berechnen(ctx, z, p) {
      const a = new Uint8Array(z.n);
      for (let k = 0; k < z.n; k++) { const h = zuerich(z.t[k]).stunde; a[k] = h >= p.von && h < p.bis ? 1 : 0; }
      return gleich(a);
    },
  },
];
export const EREIGNIS = Object.fromEntries(EREIGNISSE.map((x) => [x.id, x]));

// Alle Ereignisse einer Liste UND-verknüpft auf Zeitrahmen tf. nurNeu: nur wenn die Bedingung bei der Kerze davor nicht galt.
export function ereignisseAuswerten(ctx, tf, liste, richtung, nurNeu = true) {
  const z = ctx.tf(tf);
  const long = new Uint8Array(z.n).fill(1), short = new Uint8Array(z.n).fill(1);
  if (!liste.length) { long.fill(0); short.fill(0); }
  for (const { id, p } of liste) {
    const def = EREIGNIS[id];
    if (!def) throw new Error(`Unbekanntes Ereignis: ${id}`);
    const r = def.berechnen(ctx, z, mitStandard(def.parameter, p));
    for (let k = 0; k < z.n; k++) { long[k] &= r.long[k]; short[k] &= r.short[k]; }
  }
  const out = [];
  for (let k = 1; k < z.n - 1; k++) { // letzte Kerze auslassen (evtl. unvollständig)
    if ((richtung === 'long' || richtung === 'beide') && long[k] && (!nurNeu || !long[k - 1])) out.push({ k, seite: 1 });
    if ((richtung === 'short' || richtung === 'beide') && short[k] && (!nurNeu || !short[k - 1])) out.push({ k, seite: -1 });
  }
  return { z, signale: out };
}

// ---------- Filter (auf fertige Setups, am Signalzeitpunkt) ----------
export const FILTER = [
  { id: 'sitzung', name: 'Sitzung', beschreibung: 'Nur Signale in diesen Sitzungen (Zürcher Zeit).', parameter: [mehrfach('sitzungen', 'Sitzungen', SITZUNGEN, SITZUNGEN)],
    pruefen: (ctx, s, p) => p.sitzungen.includes(sitzungVon(zuerich(ctx.basis.t[s.iSignal]).stunde)) },
  { id: 'wochentag', name: 'Wochentag', beschreibung: 'Nur Signale an diesen Tagen (Zürcher Zeit).', parameter: [mehrfach('tage', 'Tage', ['Mo', 'Di', 'Mi', 'Do', 'Fr'], ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr'])],
    pruefen: (ctx, s, p) => p.tage.includes(WOCHENTAGE[zuerich(ctx.basis.t[s.iSignal]).wochentag]) },
  { id: 'trend', name: 'Trend (SMA 200 Tag)', beschreibung: 'Mit dem Trend: Long nur über dem SMA 200 der Tagesschlüsse (Vortag), Short nur darunter. Gegen: umgekehrt.', parameter: [auswahl('art', 'Richtung', 'mit', [{ wert: 'mit', text: 'mit dem Trend' }, { wert: 'gegen', text: 'gegen den Trend' }])],
    pruefen: (ctx, s, p) => { const t = ctx.tag(); const k = t.idx[s.iSignal] - 1; if (k < 0 || !Number.isFinite(t.sma200[k])) return false; const ueber = t.D.c[k] > t.sma200[k]; return (ueber === (s.seite > 0)) === (p.art === 'mit'); } },
  { id: 'volatilitaet', name: 'Volatilität', beschreibung: 'Tages-ATR (Vortag) im Vergleich zu den letzten 250 Tagen, als Perzentil 0–100.', parameter: [zahl('von', 'Von (Perzentil)', 0, 0, 100, 5), zahl('bis', 'Bis (Perzentil)', 100, 0, 100, 5)],
    pruefen: (ctx, s, p) => { const t = ctx.tag(); const k = t.idx[s.iSignal] - 1; const v = k >= 0 ? t.perz[k] : NaN; return Number.isFinite(v) && v >= p.von && v <= p.bis; } },
  { id: 'monat', name: 'Monat', beschreibung: 'Nur Signale in diesen Monaten.', parameter: [mehrfach('monate', 'Monate', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])],
    pruefen: (ctx, s, p) => p.monate.includes(String(zuerich(ctx.basis.t[s.iSignal]).monat)) },
];
export const FILTER_ID = Object.fromEntries(FILTER.map((x) => [x.id, x]));

export function filterAnwenden(ctx, setups, liste) {
  if (!liste?.length) return setups;
  const aktiv = liste.map(({ id, p }) => { const f = FILTER_ID[id]; if (!f) throw new Error(`Unbekannter Filter: ${id}`); return [f, mitStandard(f.parameter, p)]; });
  return setups.filter((s) => aktiv.every(([f, p]) => f.pruefen(ctx, s, p)));
}

// ---------- Ausstieg für Ereignis-Strategien ----------
export const AUSSTIEG = [
  auswahl('slArt', 'Stop-Loss', 'atr', [{ wert: 'atr', text: 'X × ATR des Zeitrahmens' }, { wert: 'pips', text: 'X Pips' }, { wert: 'kerze', text: 'hinter der Signal-Kerze' }]),
  zahl('sl', 'Stop-Loss-Wert', 1.5, 0.1, 500, 0.1, 'bei «hinter der Signal-Kerze»: Puffer in × ATR'),
  auswahl('tpArt', 'Take-Profit', 'r', [{ wert: 'r', text: 'X × Risiko (R)' }, { wert: 'keins', text: 'keins (nur Zeit-Ausstieg)' }]),
  zahl('tp', 'Take-Profit-Wert (R)', 2, 0.2, 20, 0.1),
  zahl('zeit', 'Zeit-Ausstieg nach Kerzen (0 = keiner)', 0, 0, 1000, 1, 'Kerzen des gewählten Zeitrahmens'),
];

// Setups aus Signalen: Einstieg zum Open der nächsten Basis-Kerze, SL/TP wie eingestellt.
export function setupsAusSignalen(ctx, z, signale, a) {
  const t = atr(z, 14);
  const out = [];
  for (const { k, seite } of signale) {
    const iSignal = z.en[k];
    if (iSignal + 1 >= ctx.basis.n) continue;
    const ref = z.c[k];
    let risiko;
    if (a.slArt === 'pips') risiko = a.sl * ctx.pip;
    else if (a.slArt === 'kerze') risiko = (seite > 0 ? ref - z.l[k] : z.h[k] - ref) + a.sl * t[k];
    else risiko = a.sl * t[k];
    if (!(risiko > 0)) continue;
    // SL/TP relativ zum (noch unbekannten) Einstieg: der Motor setzt sie beim Füllen
    out.push({ iSignal, seite, einstieg: { art: 'markt' }, risiko, rZiel: a.tpArt === 'r' ? a.tp : null, zeitEnde: a.zeit > 0 ? z.en[Math.min(z.n - 1, k + a.zeit)] : null, info: {} });
  }
  return out;
}

export { handelstagNr };
