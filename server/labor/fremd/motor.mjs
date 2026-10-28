// Rechenmotor für Fremddaten-Hypothesen nach dem Skill «hypothese-testen» (Monty-Methode).
// Ereignis (Wetter, Geopolitik, Makro, Positionierung, eigene Liste) → Mechanismus → Wirkung auf einen oder mehrere Märkte.
//   - Kein Look-ahead: Ein Ereignis gilt erst ab «bekannt» = Periodenende + Verzögerung. «Normal» wird nur gegen Vorjahre gemessen.
//   - Gleichzeitig (Mechanismus sichtbar, nicht handelbar) UND danach (ab Bekanntwerden, handelbar).
//   - Saison-Vergleich (gleicher Kalendertag ±3 in allen anderen Jahren), Zufall aus denselben Monaten (p-Wert),
//     Hälften, Pseudo-Forward, Placebo, Spiegel, ohne Ausreisser, handelbar nach Kosten, Bonferroni, Dosis-Wirkung,
//     Varianten-Raster (nur zur Übersicht), Stufe 2 (Bias-Fenster + Entry-Model), Forward, Monte Carlo.
// Reine Rechnung ohne Netz – läuft im Worker. Zeiten sind Tage seit 1.1.1970 (UTC).
import { mittel, quantil, wilson, monteCarlo } from '../statistik.mjs';
import { zufall } from '../simulation.mjs';

const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const datum = (t) => new Date(t * 86_400_000);
const jahrVon = (t) => datum(t).getUTCFullYear();
const monatVon = (t) => datum(t).getUTCMonth();
const tagIso = (t) => datum(t).toISOString().slice(0, 10);
const tagAus = (j, m, d) => Math.floor(Date.UTC(j, m, d) / 86_400_000);
const monatsAnfang = (t) => { const d = datum(t); return tagAus(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const monatsEnde = (t) => { const d = datum(t); return tagAus(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); };
const PERIODE_TAGE = { D: 1, W: 7, M: 30 };

// Index des ersten Punkts mit Tag ≥ t (punkte = [[tag, wert], …] sortiert)
function abIndex(p, t) { let lo = 0, hi = p.length; while (lo < hi) { const m = (lo + hi) >> 1; if (p[m][0] < t) lo = m + 1; else hi = m; } return lo; }
// Index des letzten Punkts mit Tag ≤ t
const bisIndex = (p, t) => abIndex(p, t + 1) - 1;
function varianz(a) { const m = mittel(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : null; }
const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

// ---------- 1. Aggregieren: Rohpunkte → Perioden { s, e, v } ----------
export function aggregieren(punkte, freq, agg = {}) {
  const art = agg.art || 'roh', fn = agg.fn || 'mittel';
  const zus = (werte, laenge) => {
    if (fn === 'summe') return mittel(werte) * laenge; // fehlende Tage werden mit dem Mittel aufgefüllt
    if (fn === 'min') return Math.min(...werte);
    if (fn === 'max') return Math.max(...werte);
    return mittel(werte);
  };
  if (art === 'roh') {
    return punkte.map(([t, v]) => {
      if (freq === 'M') { const d = datum(t).getUTCDate(); return d <= 3 ? { s: t, e: monatsEnde(t), v } : { s: monatsAnfang(t), e: t, v }; }
      if (freq === 'W') return { s: t - 6, e: t, v };
      return { s: t, e: t, v };
    });
  }
  if (art === 'rollend') {
    const n = Math.max(1, Math.min(365, Math.round(agg.tage || 7)));
    const mind = freq === 'D' ? Math.ceil(n * 0.7) : 1;
    const out = [];
    let lo = 0;
    for (let i = 0; i < punkte.length; i++) {
      const t = punkte[i][0];
      while (punkte[lo][0] <= t - n) lo++;
      const werte = [];
      for (let k = lo; k <= i; k++) werte.push(punkte[k][1]);
      if (werte.length >= mind) out.push({ s: t - n + 1, e: t, v: zus(werte, n) });
    }
    return out;
  }
  // Kalender-Woche (Mo–So) oder Monat
  const gruppe = new Map();
  for (const [t, v] of punkte) {
    let s, e;
    if (art === 'woche') { const wt = (datum(t).getUTCDay() + 6) % 7; s = t - wt; e = s + 6; } else { s = monatsAnfang(t); e = monatsEnde(t); }
    if (!gruppe.has(s)) gruppe.set(s, { s, e, werte: [] });
    gruppe.get(s).werte.push(v);
  }
  const laenge = art === 'woche' ? 7 : 30;
  const mind = freq === 'D' ? Math.ceil(laenge * 0.7) : freq === 'W' ? (art === 'woche' ? 1 : 3) : 1;
  return [...gruppe.values()].filter((g) => g.werte.length >= mind).sort((a, b) => a.s - b.s).map((g) => ({ s: g.s, e: g.e, v: zus(g.werte, g.e - g.s + 1) }));
}

// ---------- 2. Messen: Wert, Veränderung, Anomalie gegen Vorjahre, z-Wert, Perzentil ----------
function saisonVergleich(per, i, vorjahre, fenster) {
  const e = per[i].e, d = datum(e), j = d.getUTCFullYear();
  const werte = [];
  for (let y = j - vorjahre; y < j; y++) {
    const ziel = tagAus(y, d.getUTCMonth(), d.getUTCDate());
    let lo = 0, hi = i;
    while (lo < hi) { const m = (lo + hi) >> 1; if (per[m].e < ziel - fenster) lo = m + 1; else hi = m; }
    for (let k = lo; k < i && per[k].e <= ziel + fenster; k++) werte.push(per[k].v);
  }
  return werte;
}
export function messen(per, mess = {}, diff = 0) {
  let p = per;
  if (diff > 0) p = per.slice(diff).map((x, i) => ({ ...x, v: x.v - per[i].v }));
  const art = mess.art || 'wert';
  const k = Math.max(1, Math.round(mess.perioden || 1));
  const vorjahre = Math.max(2, Math.min(40, Math.round(mess.vorjahre || 10)));
  const fenster = Math.max(0, Math.min(60, Math.round(mess.fenster ?? 7)));
  const out = [];
  for (let i = 0; i < p.length; i++) {
    let m = null;
    if (art === 'wert') m = p[i].v;
    else if (art === 'aenderung') m = i >= k ? p[i].v - p[i - k].v : null;
    else if (art === 'aenderungProzent') m = i >= k && p[i - k].v !== 0 ? (p[i].v / p[i - k].v - 1) * 100 : null;
    else if (art === 'zscore') {
      if (i >= k && k >= 3) { const w = p.slice(i - k, i).map((x) => x.v); const sd = Math.sqrt(varianz(w)); m = sd > 0 ? (p[i].v - mittel(w)) / sd : null; }
    } else if (art === 'anomalie' || art === 'perzentil') {
      const w = saisonVergleich(p, i, vorjahre, fenster);
      if (w.length >= 5) {
        if (art === 'anomalie') { const sd = Math.sqrt(varianz(w)); m = sd > 0 ? (p[i].v - mittel(w)) / sd : null; }
        else m = (w.filter((x) => x < p[i].v).length / w.length) * 100;
      }
    }
    if (m !== null && Number.isFinite(m)) out.push({ s: p[i].s, e: p[i].e, v: p[i].v, m });
  }
  return out;
}

// ---------- 3. Ereignisse finden (Tages-Raster ab «bekannt») ----------
const passt = (m, vergleich, schwelle) => (vergleich === '<' ? m < schwelle : m > schwelle);
function inSaison(t, saison) {
  if (!saison?.von || !saison?.bis) return true;
  const d = datum(t), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const [vm, vd] = saison.von.split('-').map(Number), [bm, bd] = saison.bis.split('-').map(Number);
  const von = vm * 100 + vd, bis = bm * 100 + bd;
  return von <= bis ? md >= von && md <= bis : md >= von || md <= bis;
}

// Bereitet die gemessenen Punkte jeder Bedingung vor (einmal pro Reihe/Einstellung)
export function bedingungenVorbereiten(karte, reihen) {
  return (karte.bedingungen || []).map((b) => {
    const r = reihen[b.reihe];
    if (!r) throw new Error(`Reihe fehlt: ${b.reihe}`);
    const per = aggregieren(r.punkte, r.freq, b.agg);
    const pkt = messen(per, b.mess, b.diff || 0).map((x) => ({ ...x, bekannt: x.e + Math.max(0, Math.round(b.verz ?? 1)) }));
    // Gültigkeit: ein Wert gilt höchstens bis zur nächsten erwarteten Periode (+ Puffer), danach ist es eine Datenlücke
    const laenge = b.agg?.art === 'monat' ? 31 : b.agg?.art === 'woche' ? 7 : b.agg?.art === 'rollend' ? 1 : PERIODE_TAGE[r.freq] || 1;
    return { def: b, pkt, gueltig: Math.max(5, laenge * 2 + 5) };
  });
}

// Ereignisse in [von, bis): { tag (bekannt), s, e (Periode der 1. Bedingung), m (Messwert 1. Bedingung), seite }
export function ereignisseFinden(karte, vorb, von, bis, { schwelleFaktor = 1, spiegel = false } = {}) {
  const richtung = karte.richtung === 'short' ? -1 : 1;
  if (karte.modus === 'liste') {
    return (karte.liste || []).filter((x) => x.tag >= von && x.tag < bis && inSaison(x.tag, karte.saison)).map((x) => ({ tag: x.tag, s: x.tag, e: x.tag, m: null, seite: (x.seite || richtung) * (spiegel ? -1 : 1), text: x.text || '' }))
      .sort((a, b) => a.tag - b.tag);
  }
  if (!vorb.length) return [];
  const bed = vorb.map((v) => {
    let schwelle = Number(v.def.schwelle) || 0;
    let vergleich = v.def.vergleich === '<' ? '<' : '>';
    if (schwelleFaktor !== 1) schwelle = schwelle === 0 ? schwelleFaktor - 1 : schwelle * schwelleFaktor;
    if (spiegel) {
      vergleich = vergleich === '<' ? '>' : '<';
      const art = v.def.mess?.art || 'wert';
      if (art === 'perzentil') schwelle = 100 - schwelle;
      else if (art !== 'wert') schwelle = -schwelle;
    }
    return { ...v, schwelle, vergleich, i: -1 };
  });
  const start = Math.max(von, Math.min(...bed.map((b) => (b.pkt[0]?.bekannt ?? Infinity))));
  const evs = [];
  const baender = [];
  let vorher = false, bandStart = null;
  for (let g = start; g < bis; g++) {
    let neu = false, alle = true;
    for (const b of bed) {
      while (b.i + 1 < b.pkt.length && b.pkt[b.i + 1].bekannt <= g) { b.i++; neu = true; }
      const p = b.pkt[b.i];
      if (!p || g - p.bekannt > b.gueltig || !passt(p.m, b.vergleich, b.schwelle)) alle = false;
    }
    if (alle && bandStart === null) bandStart = g;
    if (!alle && bandStart !== null) { baender.push([bandStart, g - 1]); bandStart = null; }
    const ausloesen = karte.start === 'jede' ? alle && neu : alle && !vorher;
    if (ausloesen && inSaison(g, karte.saison)) {
      const p = bed[0].pkt[bed[0].i];
      evs.push({ tag: g, s: p.s, e: p.e, m: p.m, seite: spiegel ? -richtung : richtung });
    }
    vorher = alle;
  }
  if (bandStart !== null) baender.push([bandStart, bis - 1]);
  evs.baender = baender;
  return evs;
}

// ---------- 4. Renditen eines Markts ----------
function marktWerkzeug(markt, bereich) {
  const p = markt.punkte;
  const [von, bis] = bereich;
  const maxLuecke = markt.freq === 'M' ? 40 : markt.freq === 'W' ? 12 : 8;
  // Rendite in % (in Richtung seite) von Einstieg ab Tag t bis h Kalendertage später; null wenn ausserhalb/keine Daten
  const rendite = (t, h, seite) => {
    const i0 = abIndex(p, t);
    if (i0 >= p.length || p[i0][0] - t > maxLuecke || p[i0][0] >= bis || p[i0][0] < von) return null;
    const i1 = abIndex(p, p[i0][0] + h);
    if (i1 >= p.length || p[i1][0] >= bis || p[i1][0] - (p[i0][0] + h) > maxLuecke) return null;
    return { en: p[i0][0], ex: p[i1][0], r: seite * (p[i1][1] / p[i0][1] - 1) * 100 };
  };
  // Gleichzeitig: Schluss vor Periodenbeginn bis Schluss am Periodenende
  const gleichzeitig = (s, e, seite) => {
    const a = bisIndex(p, s - 1), b = bisIndex(p, e);
    if (a < 0 || b <= a || p[b][0] >= bis || p[a][0] < von - 10) return null;
    return seite * (p[b][1] / p[a][1] - 1) * 100;
  };
  // Saison: gleicher Kalendertag ±3 in allen anderen Jahren (im Bereich)
  const saison = (t, h, seite) => {
    const d = datum(t), werte = [];
    for (let y = jahrVon(von); y <= jahrVon(bis - 1); y++) {
      if (y === d.getUTCFullYear()) continue;
      for (const off of [-3, 0, 3]) { const x = rendite(tagAus(y, d.getUTCMonth(), d.getUTCDate() + off), h, seite); if (x) werte.push(x.r); }
    }
    return werte.length ? mittel(werte) : null;
  };
  // Zufalls-Pool: Renditen für jeden Kalendertag als Einstieg, nach Monat
  const poolCache = new Map();
  const pool = (h, seite) => {
    const k = `${h}:${seite}`;
    if (poolCache.has(k)) return poolCache.get(k);
    const proMonat = Array.from({ length: 12 }, () => []);
    const schritt = markt.freq === 'D' ? 1 : 3;
    for (let t = Math.max(von, p[0]?.[0] ?? von); t < bis; t += schritt) { const x = rendite(t, h, seite); if (x) proMonat[monatVon(t)].push(x.r); }
    poolCache.set(k, proMonat);
    return proMonat;
  };
  return { rendite, gleichzeitig, saison, pool };
}

// Fälle eines Markts für einen Horizont, ohne Überlappung (neuer Fall erst nach Ende des vorigen)
function faelleMarkt(evs, wz, warten, h) {
  const out = [];
  let frei = -Infinity;
  for (const ev of evs) {
    const x = wz.rendite(ev.tag + warten, h, ev.seite);
    if (!x || x.en < frei) continue;
    frei = x.ex;
    out.push({ ...ev, en: x.en, ex: x.ex, r: x.r });
  }
  return out;
}

// p-Wert: N zufällige Einstiege aus denselben Monaten, 4000-mal → wie oft ist der Schnitt mindestens so gut?
function pZufall(faelle, pools, n = 4000, seed = 11) {
  if (faelle.length < 3) return { p: null, mittel: null };
  const rnd = zufall(seed);
  const quellen = faelle.map((f) => pools[f.markt][monatVon(f.en)]).filter((q) => q.length);
  if (quellen.length < faelle.length * 0.8) return { p: null, mittel: null };
  const echt = mittel(faelle.map((f) => f.r));
  let besser = 0, summe = 0, anzahl = 0;
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (const q of quellen) { const v = q[Math.floor(rnd() * q.length)]; s += v; summe += v; anzahl++; }
    if (s / quellen.length >= echt) besser++;
  }
  return { p: (besser + 1) / (n + 1), mittel: summe / anzahl };
}

function gruppen(liste, schluessel, wert) {
  const m = new Map();
  for (const x of liste) { const k = schluessel(x); if (!m.has(k)) m.set(k, []); m.get(k).push(wert(x)); }
  return [...m.entries()].map(([k, v]) => ({ schluessel: String(k), n: v.length, avg: r4(mittel(v)), quote: v.filter((x) => x > 0).length / v.length })).sort((a, b) => (a.schluessel < b.schluessel ? -1 : 1));
}
function spearman(xs, ys) {
  const rang = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const n = xs.length;
  if (n < 10) return null;
  const rx = rang(xs), ry = rang(ys), mx = mittel(rx), my = mittel(ry);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (rx[i] - mx) * (ry[i] - my); b += (rx[i] - mx) ** 2; c += (ry[i] - my) ** 2; }
  const rho = a / Math.sqrt(b * c);
  const t = rho * Math.sqrt((n - 2) / Math.max(1e-9, 1 - rho * rho));
  return { rho: r4(rho), p: r4(2 * (1 - phi(Math.abs(t)))), n };
}
function handelsKennzahlen(rs) {
  if (!rs.length) return { n: 0 };
  const gew = rs.filter((r) => r > 0), verl = rs.filter((r) => r < 0);
  let kum = 0, spitze = 0, dd = 0;
  for (const r of rs) { kum += r; spitze = Math.max(spitze, kum); dd = Math.max(dd, spitze - kum); }
  const gs = gew.reduce((s, x) => s + x, 0), vs = -verl.reduce((s, x) => s + x, 0);
  return { n: rs.length, quote: gew.length / rs.length, bereich: wilson(gew.length, rs.length), avg: r4(mittel(rs)), median: r4(quantil(rs, 0.5)), avgGewinn: r4(mittel(gew)), avgVerlust: r4(mittel(verl)), pf: vs > 0 ? r4(gs / vs) : null, maxDD: r4(dd), schlechtester: r4(Math.min(...rs)), bester: r4(Math.max(...rs)), summe: r4(kum) };
}

// ---------- 5. Ganze Auswertung ----------
// eingabe: { karte, reihen: { id → { punkte, freq, name, … } }, backtest: [vonTag, bisTag], forward: [vonTag, bisTag] | null, varianten, melde }
export function fremdRechnen({ karte, reihen, backtest, forward, varianten = 1, melde = () => {} }) {
  const t0 = Date.now();
  const H = karte.horizonte;
  const haupt = karte.hauptHorizont;
  const warten = Math.max(0, Math.round(karte.warten || 0));
  const maerkte = (karte.maerkte || []).map((m) => ({ ...m, ...reihen[m.id], id: m.id, kosten: m.kosten ?? 0 })).filter((m) => m.punkte?.length);
  if (!maerkte.length) throw new Error('Kein Markt mit Kursdaten');
  melde('Ereignisse');
  const vorb = karte.modus === 'liste' ? [] : bedingungenVorbereiten(karte, reihen);
  const evsBt = ereignisseFinden(karte, vorb, backtest[0], backtest[1]);
  const wzBt = Object.fromEntries(maerkte.map((m) => [m.id, marktWerkzeug(m, backtest)]));
  const seite0 = karte.richtung === 'short' ? -1 : 1;

  // Fälle je Horizont und Markt
  const auswerten = (evs, wz, h, w = warten) => {
    const out = [];
    for (const m of maerkte) {
      const f = faelleMarkt(evs, wz[m.id], w, h);
      for (const x of f) out.push({ ...x, markt: m.id, s0: null });
    }
    return out.sort((a, b) => a.en - b.en);
  };
  const mitSaison = (faelle, wz, h) => { for (const f of faelle) f.s0 = wz[f.markt].saison(f.en, h, f.seite); return faelle; };
  const poolsFuer = (wz, h, seite) => Object.fromEntries(maerkte.map((m) => [m.id, wz[m.id].pool(h, seite)]));

  melde('Horizonte');
  const proH = H.map((h) => {
    const f = mitSaison(auswerten(evsBt, wzBt, h), wzBt, h);
    const rs = f.map((x) => x.r), ss = f.map((x) => x.s0).filter((x) => x !== null);
    const z = pZufall(f, poolsFuer(wzBt, h, seite0));
    const gl = f.map((x) => wzBt[x.markt].gleichzeitig(x.s, x.e, x.seite)).filter((x) => x !== null);
    const m = mittel(rs), s = mittel(ss);
    return {
      h, n: f.length, nUnabhaengig: new Set(f.map((x) => x.tag)).size, mittel: r4(m), median: r4(quantil(rs, 0.5)), quote: rs.length ? rs.filter((x) => x > 0).length / rs.length : null,
      bereich: wilson(rs.filter((x) => x > 0).length, rs.length), saison: r4(s), mehrwert: m !== null && s !== null ? r4(m - s) : null, zufall: r4(z.mittel), p: r4(z.p),
      gleichzeitig: r4(mittel(gl)), gleichzeitigN: gl.length,
      faelle: f.map((x) => ({ markt: x.markt, tag: x.tag, en: x.en, ex: x.ex, r: r4(x.r), s: r4(x.s0), m: r4(x.m), text: x.text })),
    };
  });
  const HI = Math.max(0, H.indexOf(haupt));
  const HH = proH[HI];
  const F = HH.faelle;
  const mw = (liste) => { const a = liste.filter((x) => x.s !== null); return a.length ? mittel(a.map((x) => x.r - x.s)) : null; };

  // Robustheit
  melde('Robustheit');
  const mitte = F.length ? F[Math.floor(F.length / 2)].en : 0;
  const h1 = F.filter((x) => x.en < mitte), h2 = F.filter((x) => x.en >= mitte);
  const drittel = F.length ? F[Math.floor((F.length * 2) / 3)].en : 0;
  const alt = F.filter((x) => x.en < drittel), neu = F.filter((x) => x.en >= drittel);
  // Placebo: alle Ereignisse um ein halbes Jahr verschoben (dort sollte nichts sein)
  const placeboEvs = evsBt.map((e) => ({ ...e, tag: e.tag + 182, s: e.s + 182, e: e.e + 182 })).filter((e) => e.tag < backtest[1]);
  const placebo = mitSaison(auswerten(placeboEvs, wzBt, haupt), wzBt, haupt).map((x) => ({ r: x.r, s: x.s0 }));
  // Spiegel: Gegen-Ereignis, Gegenrichtung
  let spiegel = null;
  const spiegelbar = karte.modus !== 'liste' && vorb.every((v) => (v.def.mess?.art || 'wert') !== 'wert');
  if (spiegelbar) {
    const sev = ereignisseFinden(karte, vorb, backtest[0], backtest[1], { spiegel: true });
    const sf = mitSaison(auswerten(sev, wzBt, haupt), wzBt, haupt).map((x) => ({ r: x.r, s: x.s0 }));
    spiegel = { n: sf.length, mittel: r4(mittel(sf.map((x) => x.r))), mehrwert: r4(mw(sf)) };
  }
  const sortR = F.map((x) => x.r).sort((a, b) => a - b);
  const ohne = sortR.length >= 10 ? mittel(sortR.slice(3, -3)) : null;
  const handelbar = maerkte.map((m) => {
    const f = F.filter((x) => x.markt === m.id);
    const netto = f.length ? mittel(f.map((x) => x.r)) - m.kosten : null;
    return { id: m.id, name: m.name, handelbar: !!m.handelbar, n: f.length, netto: r4(netto), mehrwert: r4(mw(f)), kosten: m.kosten };
  });
  const bonf = 0.05 / Math.max(1, varianten);
  const ok = (b) => (b === null || b === undefined ? 'offen' : b ? 'ja' : 'nein');
  const pz = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)} %`);
  const proz = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);

  // Forward
  let fw = null;
  if (forward) {
    melde('Forward');
    const evsFw = ereignisseFinden(karte, vorb, forward[0], forward[1]);
    const wzFw = Object.fromEntries(maerkte.map((m) => [m.id, marktWerkzeug(m, [backtest[0], forward[1]])]));
    const f = mitSaison(auswerten(evsFw, wzFw, haupt), wzFw, haupt);
    const rs = f.map((x) => x.r);
    fw = { n: f.length, mittel: r4(mittel(rs)), quote: rs.length ? rs.filter((x) => x > 0).length / rs.length : null, mehrwert: r4(mw(f.map((x) => ({ r: x.r, s: x.s0 })))),
      faelle: f.map((x) => ({ markt: x.markt, tag: x.tag, en: x.en, ex: x.ex, r: r4(x.r), s: r4(x.s0), m: r4(x.m) })) };
  }

  const raster = [
    { id: 'saison', name: 'Mehrwert über der Saison', status: ok(HH.mehrwert === null ? null : HH.mehrwert > 0), text: `Ereignis ${pz(HH.mittel)} · gleicher Kalendertag in anderen Jahren ${pz(HH.saison)} · Mehrwert ${pz(HH.mehrwert)}` },
    { id: 'zufall', name: 'Besser als Zufall (gleiche Monate)', status: ok(HH.p === null ? null : HH.p < 0.05), text: `4'000 × gleich viele zufällige Einstiege aus denselben Monaten: Ø ${pz(HH.zufall)} · p = ${HH.p ?? '—'}` },
    { id: 'haelften', name: 'Beide Hälften gleiche Richtung', status: ok(h1.length < 3 || h2.length < 3 ? null : mw(h1) > 0 && mw(h2) > 0), text: `Mehrwert 1. Hälfte ${pz(mw(h1))} (${h1.length}) · 2. Hälfte ${pz(mw(h2))} (${h2.length})` },
    { id: 'pseudo', name: 'Pseudo-Forward (letztes Drittel)', status: ok(neu.length < 3 ? null : mittel(neu.map((x) => x.r)) > 0 && mw(neu) > 0), text: `ältere zwei Drittel ${pz(mittel(alt.map((x) => x.r)))}, Mehrwert ${pz(mw(alt))} · letztes Drittel ${pz(mittel(neu.map((x) => x.r)))}, Mehrwert ${pz(mw(neu))} (${neu.length})` },
    { id: 'placebo', name: 'Placebo (halbes Jahr verschoben)', status: ok(HH.mehrwert === null || HH.mehrwert <= 0 || placebo.length < 5 ? null : (mw(placebo) ?? 0) < HH.mehrwert / 2), text: `gleiche Ereignisse 182 Tage später: Ø ${pz(mittel(placebo.map((x) => x.r)))}, Mehrwert ${pz(mw(placebo))} (${placebo.length})` },
    { id: 'spiegel', name: 'Spiegel: Gegen-Ereignis wirkt gegenteilig', status: spiegel ? ok(spiegel.n < 5 ? null : spiegel.mittel > 0 && (spiegel.mehrwert ?? 0) > 0) : 'offen', text: spiegel ? `Gegen-Ereignis in Gegenrichtung: Ø ${pz(spiegel.mittel)}, Mehrwert ${pz(spiegel.mehrwert)} (${spiegel.n})` : 'nur bei Anomalie, Veränderung, z-Wert oder Perzentil automatisch prüfbar' },
    { id: 'ausreisser', name: 'Ohne Ausreisser', status: ok(ohne === null ? null : ohne > 0), text: `Ø ohne die 3 besten und 3 schlechtesten ${pz(ohne)} · Median ${pz(HH.median)}` },
    { id: 'handelbar', name: 'Handelbar nach Kosten', status: ok(handelbar.some((x) => x.handelbar && x.n) ? handelbar.some((x) => x.handelbar && x.netto > 0 && (x.mehrwert ?? 0) > 0) : null), text: handelbar.map((x) => `${x.name}: ${x.handelbar ? `netto ${pz(x.netto)}` : 'nicht handelbar'}`).join(' · ') },
    { id: 'forward', name: 'Forward hält', status: fw ? ok(fw.n < 5 ? null : fw.mittel > 0 && (fw.quote ?? 0) >= ((HH.quote ?? 0) * 2) / 3) : 'offen', text: fw ? `Forward ${fw.n} Fälle, ${pz(fw.mittel)}, Treffer ${proz(fw.quote)} (Backtest ${proz(HH.quote)})${fw.n < 5 ? ' – zu wenige Fälle für ein Urteil' : ''}` : 'Forward-Zeitraum noch gesperrt' },
    { id: 'bonferroni', name: 'Hält Mehrfachtests', status: ok(HH.p === null ? null : HH.p < bonf), text: `${varianten} getestete Variante${varianten === 1 ? '' : 'n'} → Grenze p < ${bonf.toFixed(4)}` },
  ];
  const st = Object.fromEntries(raster.map((z) => [z.id, z.status]));

  // Urteil (Skill, Abschnitt 6)
  const nU = HH.nUnabhaengig;
  let urteil, warum;
  if (nU < 15) { urteil = 'Zu wenig Daten'; warum = `nur ${nU} unabhängige Ereignisse (mindestens 15, für «Bestätigt» 30)`; }
  else if (!(HH.mittel > 0) || ((HH.mehrwert ?? 0) <= 0 && (HH.p ?? 1) >= 0.2)) { urteil = 'Nicht bestätigt'; warum = HH.mittel > 0 ? 'kein Unterschied zur Saison und zum Zufall' : 'Wirkung geht nicht in die erwartete Richtung'; }
  else if (nU >= 30 && st.bonferroni === 'ja' && st.haelften === 'ja' && st.saison === 'ja' && st.pseudo === 'ja' && st.forward !== 'nein') { urteil = 'Bestätigt'; warum = 'genug Fälle, signifikant, über der Saison, beide Hälften, Pseudo-Forward hält'; }
  else { urteil = 'Hinweis'; warum = st.saison === 'nein' ? 'Richtung stimmt, aber vor allem Saison' : st.forward === 'nein' ? 'Forward deutlich schwächer – Overfitting möglich' : 'Richtung stimmt, aber zu schwach oder nicht überall'; }
  const aendern = urteil === 'Zu wenig Daten' ? 'Mehr unabhängige Ereignisse – feinere Ereignisse, mehr Märkte/Regionen (Querschnitt), Spiegel-Ereignis oder längere Historie.'
    : urteil === 'Nicht bestätigt' ? 'Ein klarer Mehrwert über der Saison mit p < 0,05, der in beiden Hälften und im Spiegel auftaucht.'
      : urteil === 'Bestätigt' ? 'Ein Forward-Test, der deutlich schwächer ist, oder ein Mehrwert, der nach Kosten verschwindet.'
        : st.saison === 'nein' ? 'Ein Mehrwert über dem gleichen Kalendertag ohne Ereignis – sonst handelt man nur die Saison.'
          : st.bonferroni === 'nein' || st.zufall === 'nein' ? `Ein p-Wert unter ${bonf.toFixed(4)} bei gleich vielen Varianten – mehr Fälle helfen am meisten.`
            : 'Mindestens 30 unabhängige Fälle, beide Hälften und ein bestandener Forward-Test.';

  // Dosis-Wirkung: alle Perioden der 1. Bedingung (ohne Überlappung) nach Stärke in Quintile
  let dosis = null;
  if (vorb.length && karte.modus !== 'liste') {
    melde('Dosis-Wirkung');
    const b = vorb[0];
    const orient = b.def.vergleich === '<' ? -1 : 1;
    const xs = [], ys = [];
    for (const m of maerkte) {
      let frei = -Infinity;
      for (const p of b.pkt) {
        if (p.bekannt < backtest[0] || p.bekannt >= backtest[1] || !inSaison(p.bekannt, karte.saison)) continue;
        const x = wzBt[m.id].rendite(p.bekannt + warten, haupt, seite0);
        if (!x || x.en < frei) continue;
        frei = x.ex;
        xs.push(orient * p.m); ys.push(x.r);
      }
    }
    if (xs.length >= 25) {
      const grenzen = [0.2, 0.4, 0.6, 0.8].map((q) => quantil(xs, q));
      const q = Array.from({ length: 5 }, () => []);
      xs.forEach((x, i) => { let k = 0; while (k < 4 && x > grenzen[k]) k++; q[k].push(ys[i]); });
      dosis = { quintile: q.map((v, k) => ({ q: k + 1, n: v.length, avg: r4(mittel(v)), quote: v.length ? v.filter((x) => x > 0).length / v.length : null })), spearman: spearman(xs, ys), n: xs.length };
    }
  }

  // Varianten-Raster (nur Übersicht – beste Zelle auszusuchen wäre Overfitting)
  melde('Varianten');
  const wartenListe = [...new Set([0, 7, 14, 28, warten])].sort((a, b) => a - b);
  const faktoren = karte.modus === 'liste' || !vorb.length ? [1] : [0.75, 1, 1.5];
  const varRaster = faktoren.map((fk) => {
    const evs = fk === 1 ? evsBt : ereignisseFinden(karte, vorb, backtest[0], backtest[1], { schwelleFaktor: fk });
    return {
      faktor: fk, schwelle: vorb.length ? r4(fk === 1 ? Number(vorb[0].def.schwelle) : (Number(vorb[0].def.schwelle) || 0) === 0 ? fk - 1 : Number(vorb[0].def.schwelle) * fk) : null,
      zellen: wartenListe.flatMap((w) => H.map((h) => {
        const f = mitSaison(auswerten(evs, wzBt, h, w), wzBt, h).map((x) => ({ r: x.r, s: x.s0 }));
        return { warten: w, h, n: f.length, mittel: r4(mittel(f.map((x) => x.r))), mehrwert: r4(mw(f)), quote: f.length ? f.filter((x) => x.r > 0).length / f.length : null };
      })),
    };
  });

  // Stufe 2: Bias-Fenster + Entry-Model
  let stufe2 = null;
  if (karte.stufe2?.aktiv) { melde('Stufe 2'); stufe2 = stufe2Rechnen(karte, maerkte, evsBt, backtest, warten, haupt, seite0, forward ? ereignisseFinden(karte, vorb, forward[0], forward[1]) : null, forward); }
  if (stufe2) raster.push({ id: 'bias', name: 'Bias-Fenster hilft (Stufe 2)', status: ok(stufe2.innen.n < 10 || stufe2.aussen.n < 10 ? null : stufe2.innen.avg > stufe2.aussen.avg && stufe2.innen.avg > 0 && (stufe2.p ?? 1) < 0.1), text: `im Fenster Ø ${pz(stufe2.innen.avg)} (${stufe2.innen.n}) · ausserhalb Ø ${pz(stufe2.aussen.avg)} (${stufe2.aussen.n}) · Gegenrichtung im Fenster Ø ${pz(stufe2.gegen.avg)} (${stufe2.gegen.n}) · p = ${stufe2.p ?? '—'}` });

  // Handels-Kennzahlen und Risiko (Haupt-Horizont, alle Märkte in zeitlicher Reihenfolge)
  const rsZeit = F.map((x) => x.r);
  const kennzahlen = handelsKennzahlen(rsZeit);
  const mc = monteCarlo(fw ? [...rsZeit, ...fw.faelle.map((x) => x.r)] : rsZeit);
  const verluste = [...F].sort((a, b) => a.r - b.r).slice(0, 3).filter((x) => x.r < 0).map((x) => ({ markt: x.markt, en: x.en, ex: x.ex, r: x.r }));

  // Pro Jahr: kleine Grafik je Saisonjahr für den Hauptmarkt
  melde('Grafiken');
  const hm = maerkte[0];
  const startMonat = karte.saison?.von ? Math.max(0, Number(karte.saison.von.split('-')[0]) - 2) : 0;
  const baender = evsBt.baender || [];
  const proJahrGrafik = [];
  const bisAlle = forward ? forward[1] : backtest[1];
  const alleFaelle = [...F, ...(fw?.faelle || [])].filter((x) => x.markt === hm.id);
  for (let y = jahrVon(backtest[0]); y <= jahrVon(bisAlle - 1) && proJahrGrafik.length < 60; y++) {
    const a = tagAus(y, startMonat, 1), b = tagAus(y + 1, startMonat, 1);
    if (a >= bisAlle) break;
    const p = hm.punkte;
    const i0 = abIndex(p, a), i1 = abIndex(p, Math.min(b, bisAlle)); // nie über das Ende des (gesperrten) Zeitraums hinaus
    if (i1 - i0 < 3) continue;
    const basis = p[i0][1];
    const schritt = hm.freq === 'D' ? 5 : 1;
    const pts = [];
    for (let i = i0; i < i1; i += schritt) pts.push([p[i][0] - a, r2((p[i][1] / basis) * 100)]);
    if (pts[pts.length - 1][0] !== p[i1 - 1][0] - a) pts.push([p[i1 - 1][0] - a, r2((p[i1 - 1][1] / basis) * 100)]);
    const bd = baender.filter(([s, e]) => e >= a && s < b).map(([s, e]) => [Math.max(0, s - a), Math.min(b - a - 1, e - a)]);
    const tr = alleFaelle.filter((x) => x.en >= a && x.en < b).map((x) => ({ en: x.en - a, ex: x.ex - a, r: x.r, fw: forward ? x.en >= forward[0] : false }));
    let staerke = null;
    if (vorb.length) { const w = vorb[0].pkt.filter((q) => q.bekannt >= a && q.bekannt < b).map((q) => q.m); staerke = w.length ? r2(mittel(w)) : null; }
    proJahrGrafik.push({ jahr: startMonat ? `${y}/${String(y + 1).slice(2)}` : String(y), start: a, laenge: b - a, pts, baender: bd, trades: tr, staerke });
  }

  // Quellen-Abdeckung
  const abdeckung = Object.values(reihen).map((r) => ({ id: r.id, name: r.name, quelle: r.quelle, link: r.link, von: tagIso(r.punkte[0][0]), bis: tagIso(r.punkte[r.punkte.length - 1][0]), n: r.punkte.length, freq: r.freq, veraltet: r.veraltet || null, hinweis: r.hinweis || null }));

  return {
    typ: 'fremd', urteil, warum, aendern, haupt, n: HH.n, nUnabhaengig: nU, varianten, raster,
    horizonte: proH.map(({ faelle, ...rest }) => rest), faelle: F, forward: fw,
    proJahr: gruppen(F, (x) => jahrVon(x.en), (x) => x.r), proJahrzehnt: gruppen(F, (x) => `${Math.floor(jahrVon(x.en) / 10) * 10}er`, (x) => x.r),
    proMarkt: maerkte.map((m) => { const f = F.filter((x) => x.markt === m.id); return { id: m.id, name: m.name, n: f.length, avg: r4(mittel(f.map((x) => x.r))), mehrwert: r4(mw(f)), quote: f.length ? f.filter((x) => x.r > 0).length / f.length : null }; }),
    handelbar, kennzahlen, monteCarlo: mc, verluste, dosis, varianten_raster: { warten: wartenListe, horizonte: H, schwellen: varRaster, aktuell: { warten, h: haupt, faktor: 1 } },
    stufe2, proJahrGrafik, hauptmarkt: { id: hm.id, name: hm.name }, ereignisseGesamt: evsBt.length, abdeckung,
    marktNamen: Object.fromEntries(maerkte.map((m) => [m.id, m.name])), dauerSek: Math.round((Date.now() - t0) / 100) / 10,
  };
}

// Stufe 2: Im Bias-Fenster (Ereignis bekannt + Wartezeit bis + Haupt-Horizont) mit festem Entry-Model viele kleinere Trades.
// Gegenprobe: dasselbe Entry-Model ausserhalb der Fenster (gleiche Richtung) und im Fenster in Gegenrichtung.
function stufe2Rechnen(karte, maerkte, evs, bereich, warten, haupt, seite0, evsFw, forward) {
  const s2 = karte.stufe2;
  const n = Math.max(2, Math.min(60, Math.round(s2.n || 10)));
  const halten = Math.max(1, Math.min(60, Math.round(s2.halten || 5)));
  const innen = [], aussen = [], gegen = [], fwInnen = [];
  const fenster = (liste) => liste.map((e) => [e.tag + warten, e.tag + warten + haupt, e.seite]);
  const imFenster = (t, fl) => fl.find(([a, b]) => t >= a && t < b) || null;
  const lauf = (m, von, bis, fl, zielInnen, mitAussen) => {
    const p = m.punkte;
    const freiSeite = { 1: -Infinity, '-1': -Infinity };
    for (let i = Math.max(n, abIndex(p, von)); i < p.length && p[i][0] < bis; i++) {
      const t = p[i][0];
      const f = imFenster(t, fl);
      for (const seite of [1, -1]) {
        let signal = false;
        if (s2.modell === 'woche') signal = i > 0 && Math.floor((p[i][0] - 4) / 7) !== Math.floor((p[i - 1][0] - 4) / 7);
        else {
          let hi = -Infinity, lo = Infinity;
          for (let k = i - n; k < i; k++) { hi = Math.max(hi, p[k][1]); lo = Math.min(lo, p[k][1]); }
          if (s2.modell === 'ausbruch') signal = seite > 0 ? p[i][1] > hi : p[i][1] < lo;
          else signal = seite > 0 ? p[i][1] < lo : p[i][1] > hi; // Rücksetzer: gegen die Richtung gelaufen
        }
        if (!signal || t < freiSeite[seite]) continue;
        const j = abIndex(p, t + halten);
        if (j >= p.length || p[j][0] >= bis) continue;
        const r = seite * (p[j][1] / p[i][1] - 1) * 100 - (m.kosten || 0);
        const trade = { markt: m.id, en: t, ex: p[j][0], seite, r };
        if (f) { if (seite === f[2]) { zielInnen.push(trade); freiSeite[seite] = p[j][0]; } else if (mitAussen) { gegen.push(trade); freiSeite[seite] = p[j][0]; } }
        else if (mitAussen && seite === seite0) { aussen.push(trade); freiSeite[seite] = p[j][0]; }
      }
    }
  };
  for (const m of maerkte) {
    lauf(m, bereich[0], bereich[1], fenster(evs), innen, true);
    if (evsFw && forward) lauf(m, forward[0], forward[1], fenster(evsFw), fwInnen, false);
  }
  const k = (l) => ({ n: l.length, avg: r4(mittel(l.map((x) => x.r))), quote: l.length ? l.filter((x) => x.r > 0).length / l.length : null });
  const a = innen.map((x) => x.r), b = aussen.map((x) => x.r);
  let p = null;
  if (a.length >= 5 && b.length >= 5) { const se = Math.sqrt(varianz(a) / a.length + varianz(b) / b.length); if (se > 0) p = r4(1 - phi((mittel(a) - mittel(b)) / se)); }
  const MODELLE = { woche: 'Einstieg zu Wochenbeginn', ausbruch: `Ausbruch über das ${n}-Tage-Hoch/-Tief`, ruecksetzer: `Rücksetzer auf das ${n}-Tage-Tief/-Hoch` };
  return { modell: MODELLE[s2.modell] || s2.modell, halten, innen: k(innen), aussen: k(aussen), gegen: k(gegen), forward: evsFw ? k(fwInnen) : null, p, kennzahlen: handelsKennzahlen(innen.sort((x, y) => x.en - y.en).map((x) => x.r)), trades: innen.slice(-300).map((x) => ({ ...x, r: r4(x.r) })) };
}
