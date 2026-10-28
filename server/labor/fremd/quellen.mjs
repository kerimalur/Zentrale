// Fremddaten holen und zwischenspeichern: FRED, Yahoo, NASA POWER, NOAA ONI, GPR, EIA, CFTC (COT), Kurse der Zentrale, eigene Reihen.
// Jede Reihe kommt als { id, name, einheit, freq, quelle, link, punkte: [[tag, wert], …], stand, veraltet, hinweis } zurück.
// tag = Tage seit 1.1.1970 (UTC). punkte sind nach Tag sortiert, ohne Lücken-Werte.
// Cache in data/fremd/: Tagesdaten werden nach 20 Std neu geholt; schlägt das fehl, gilt der letzte Stand (mit Vermerk «veraltet»).
// Bot-Sperren werden nicht umgangen: Ein 403/429 wird als Fehler gemeldet.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config } from '../../config.mjs';
import { holen } from '../../util.mjs';
import { db } from '../../store.mjs';
import { dukascopyStunden } from '../../dukascopy.mjs';
import { _intern, tradingEinstellungen } from '../../trading.mjs';
import { xlsLesen, excelDatum } from './xls.mjs';
import { MAERKTE, ORTE, REIHEN, COT_MAERKTE, WETTER_GROESSEN, COT_GROESSEN } from './katalog.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const ordner = () => path.join(config.dataDir, 'fremd');
const TAG_SEK = 86_400;
const heuteTag = () => Math.floor(Date.now() / 86_400_000);
const isoTag = (s) => { const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(s).trim()); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000) : null; };
export const tagIso = (t) => new Date(t * 86_400_000).toISOString().slice(0, 10);
const monatsEnde = (j, m) => Math.floor(Date.UTC(j, m + 1, 0) / 86_400_000); // m 0-basiert

// ---------- Cache ----------
const cacheDatei = (schluessel) => path.join(ordner(), `${crypto.createHash('sha1').update(schluessel).digest('hex').slice(0, 20)}.json`);
function cacheLesen(schluessel) { try { return JSON.parse(fs.readFileSync(cacheDatei(schluessel), 'utf8')); } catch { return null; } }
function cacheSchreiben(schluessel, wert) {
  fs.mkdirSync(ordner(), { recursive: true });
  const d = cacheDatei(schluessel);
  fs.writeFileSync(d + '.tmp', JSON.stringify(wert));
  fs.renameSync(d + '.tmp', d);
}
const laufend = new Map(); // gleiche Abrufe nicht doppelt starten

async function mitCache(schluessel, maxAlterStd, holenFn) {
  const alt = cacheLesen(schluessel);
  if (alt && Date.now() - alt.geholt < maxAlterStd * 3_600_000) return alt;
  if (laufend.has(schluessel)) return laufend.get(schluessel);
  const p = (async () => {
    try {
      const neu = await holenFn();
      if (!neu?.punkte?.length) throw new Error('keine Werte erhalten');
      const wert = { ...neu, geholt: Date.now() };
      cacheSchreiben(schluessel, wert);
      return wert;
    } catch (err) {
      if (alt) return { ...alt, veraltet: `Neu laden fehlgeschlagen (${err.message}) – Stand ${new Date(alt.geholt).toLocaleDateString('de-CH')}` };
      throw err;
    } finally { laufend.delete(schluessel); }
  })();
  laufend.set(schluessel, p);
  return p;
}

async function text(url, timeout = 60_000) {
  const { res } = await holen(url, { timeout, headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${new URL(url).host}`);
  return res.text();
}
async function puffer(url, timeout = 120_000) {
  const { res } = await holen(url, { timeout, headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${new URL(url).host}`);
  return Buffer.from(await res.arrayBuffer());
}

const sortiert = (punkte) => {
  const m = new Map();
  for (const [t, v] of punkte) if (t !== null && Number.isFinite(t) && Number.isFinite(v)) m.set(t, v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};
// Frequenz aus dem typischen Abstand
export function freqVon(punkte) {
  if (punkte.length < 3) return 'D';
  const d = [];
  for (let i = 1; i < Math.min(punkte.length, 400); i++) d.push(punkte[punkte.length - i][0] - punkte[punkte.length - i - 1][0]);
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  return med >= 25 ? 'M' : med >= 5 ? 'W' : 'D';
}

// ---------- Einzelne Quellen ----------
async function fred(id) {
  if (!/^[A-Z0-9_]{2,40}$/i.test(id)) throw new Error('FRED-ID ungültig');
  return mitCache(`fred:${id}`, 20, async () => {
    const csv = await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`);
    const zeilen = csv.trim().split(/\r?\n/);
    if (!/date/i.test(zeilen[0] || '')) throw new Error('FRED: unerwartete Antwort');
    const punkte = sortiert(zeilen.slice(1).map((z) => { const [d, v] = z.split(','); return [isoTag(d), v === '.' || v === '' ? NaN : Number(v)]; }));
    return { punkte, quelle: 'FRED', link: `https://fred.stlouisfed.org/series/${id}` };
  });
}

async function yahoo(symbol) {
  if (!/^[A-Z0-9.^=\-]{1,20}$/i.test(symbol)) throw new Error('Yahoo-Symbol ungültig');
  return mitCache(`yahoo:${symbol}`, 20, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${Math.floor(Date.now() / 1000) + 86_400}&interval=1d&events=div%2Csplit`;
    const { res } = await holen(url, { timeout: 60_000, headers: UA });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r?.timestamp) throw new Error(j?.chart?.error?.description || 'Yahoo: keine Kurse');
    const adj = r.indicators?.adjclose?.[0]?.adjclose;
    const close = r.indicators?.quote?.[0]?.close || [];
    const off = r.meta?.gmtoffset || 0;
    const punkte = sortiert(r.timestamp.map((ts, i) => [Math.floor((ts + off) / TAG_SEK), Number((adj?.[i] ?? close[i]) ?? NaN)]).filter(([, v]) => v > 0));
    return { punkte, quelle: `Yahoo (${adj ? 'bereinigt um Dividenden/Splits' : 'Schlusskurs'})`, link: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, name: r.meta?.longName || r.meta?.shortName || symbol };
  });
}

// NASA POWER: Tageswerte pro Ort, Mittel über die Orte einer Gruppe. HDD/CDD aus der Tagesmitteltemperatur (Basis 18 °C).
async function nasaOrt(lat, lon, parameter) {
  return mitCache(`nasa:${lat}:${lon}:${parameter}`, 20, async () => {
    const ende = new Date(Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${parameter}&community=AG&latitude=${lat}&longitude=${lon}&start=19810101&end=${ende}&format=JSON`;
    const { res } = await holen(url, { timeout: 120_000, headers: UA });
    if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
    const j = await res.json();
    const werte = j?.properties?.parameter?.[parameter];
    if (!werte) throw new Error('NASA POWER: keine Werte');
    const fehl = j?.header?.fill_value ?? -999;
    return { punkte: sortiert(Object.entries(werte).map(([d, v]) => [isoTag(d), v === fehl || v <= -990 ? NaN : Number(v)])) };
  });
}
async function nasa(gruppe, groesse) {
  const g = ORTE[gruppe] || eigeneOrte(gruppe);
  if (!g) throw new Error(`Unbekannte Orts-Gruppe: ${gruppe}`);
  if (!WETTER_GROESSEN.some((w) => w.wert === groesse)) throw new Error('Unbekannte Wetter-Grösse');
  const param = groesse === 'HDD' || groesse === 'CDD' ? 'T2M' : groesse;
  const reihen = [];
  for (const [, lat, lon] of g.orte) reihen.push(await nasaOrt(lat, lon, param)); // nacheinander: NASA mag keine Stösse
  const summe = new Map();
  for (const r of reihen) for (const [t, v] of r.punkte) { const s = summe.get(t) || [0, 0]; s[0] += v; s[1]++; summe.set(t, s); }
  const mind = Math.ceil(g.orte.length / 2);
  const punkte = [...summe.entries()].filter(([, [, n]]) => n >= mind).map(([t, [s, n]]) => {
    const m = s / n;
    return [t, groesse === 'HDD' ? Math.max(0, 18 - m) : groesse === 'CDD' ? Math.max(0, m - 18) : m];
  }).sort((a, b) => a[0] - b[0]);
  const veraltet = reihen.find((r) => r.veraltet)?.veraltet;
  return { punkte, quelle: 'NASA POWER (MERRA-2)', link: 'https://power.larc.nasa.gov/', veraltet, geholt: Math.min(...reihen.map((r) => r.geholt)), hinweis: `Mittel über ${g.orte.map((o) => o[0]).join(', ')}` };
}
// eigene Orte: "eigen-<lat>_<lon>~<lat>_<lon>"
function eigeneOrte(gruppe) {
  if (!gruppe.startsWith('eigen-')) return null;
  const orte = gruppe.slice(6).split('~').map((s) => s.split('_').map(Number)).filter(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) <= 180).slice(0, 10).map(([a, b]) => [`${a}/${b}`, a, b]);
  return orte.length ? { name: 'Eigene Orte', orte } : null;
}

const SAISON_ENDE = { DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6, JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 0 };
async function oni() {
  return mitCache('oni', 72, async () => {
    const t = await text('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt');
    const punkte = [];
    for (const z of t.split(/\r?\n/).slice(1)) {
      const [s, j, , anom] = z.trim().split(/\s+/);
      if (!(s in SAISON_ENDE)) continue;
      const jahr = Number(j) + (s === 'NDJ' ? 1 : 0);
      punkte.push([monatsEnde(jahr, SAISON_ENDE[s]), Number(anom)]);
    }
    return { punkte: sortiert(punkte), quelle: 'NOAA CPC (ONI, 3-Monats-Mittel)', link: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php' };
  });
}

async function gpr(spalte) {
  const monat = ['GPR', 'GPRT', 'GPRA', 'GPRH'].includes(spalte);
  if (!monat && !['GPRD', 'GPRD_ACT', 'GPRD_THREAT', 'GPRD_MA7', 'GPRD_MA30'].includes(spalte)) throw new Error('Unbekannte GPR-Spalte');
  const datei = monat ? 'data_gpr_export.xls' : 'data_gpr_daily_recent.xls';
  return mitCache(`gpr:${spalte}`, 20, async () => {
    const { blaetter } = xlsLesen(await puffer(`https://www.matteoiacoviello.com/gpr_files/${datei}`));
    const z = blaetter[0]?.zeilen || [];
    const kopf = (z[0] || []).map((x) => String(x ?? '').trim());
    const iWert = kopf.indexOf(spalte), iDatum = kopf.indexOf(monat ? 'month' : 'date');
    if (iWert < 0 || iDatum < 0) throw new Error('GPR: Spalte nicht gefunden');
    const punkte = [];
    for (const r of z.slice(1)) {
      if (!r || typeof r[iDatum] !== 'number' || typeof r[iWert] !== 'number') continue;
      const tag = Math.floor(excelDatum(r[iDatum]) / TAG_SEK);
      if (monat) { const d = new Date(tag * 86_400_000); punkte.push([monatsEnde(d.getUTCFullYear(), d.getUTCMonth()), r[iWert]]); }
      else punkte.push([tag, r[iWert]]);
    }
    return { punkte: sortiert(punkte), quelle: 'Caldara & Iacoviello, Geopolitical Risk Index', link: 'https://www.matteoiacoviello.com/gpr.htm' };
  });
}

async function eia(pfad) {
  if (!/^(ng|pet)\/hist_xls\/[A-Za-z0-9_]{3,40}$/.test(pfad)) throw new Error('EIA-Pfad ungültig');
  return mitCache(`eia:${pfad}`, 20, async () => {
    const { blaetter } = xlsLesen(await puffer(`https://www.eia.gov/dnav/${pfad}.xls`));
    const b = blaetter.find((x) => /^Data 1/.test(x.name)) || blaetter[1];
    const punkte = [];
    let name = null;
    for (const r of b?.zeilen || []) {
      if (!r) continue;
      if (r[0] === 'Date' && typeof r[1] === 'string') name = r[1];
      if (typeof r[0] === 'number' && typeof r[1] === 'number') punkte.push([Math.floor(excelDatum(r[0]) / TAG_SEK), r[1]]);
    }
    return { punkte: sortiert(punkte), quelle: 'EIA', link: `https://www.eia.gov/dnav/${pfad.split('/')[0]}/`, name };
  });
}

// CFTC Legacy-Bericht (nur Futures): Jahres-ZIPs, Stichtag Dienstag, veröffentlicht Freitag.
function zipErsteDatei(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP: kein Verzeichnis');
  const p = buf.readUInt32LE(e + 16);
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: kaputt');
  const methode = buf.readUInt16LE(p + 10), groesse = buf.readUInt32LE(p + 20), lokal = buf.readUInt32LE(p + 42);
  const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
  const daten = buf.subarray(start, start + groesse);
  return (methode === 8 ? zlib.inflateRawSync(daten) : daten).toString('latin1');
}
function csvZeile(z) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < z.length; i++) {
    const ch = z[i];
    if (q) { if (ch === '"') { if (z[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
async function cotDatei(name, maxAlterStd) {
  const d = path.join(ordner(), 'cot', name);
  try { const st = fs.statSync(d); if (Date.now() - st.mtimeMs < maxAlterStd * 3_600_000) return fs.readFileSync(d); } catch {}
  const buf = await puffer(`https://www.cftc.gov/files/dea/history/${name}`);
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('CFTC: keine ZIP-Datei erhalten');
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.writeFileSync(d, buf);
  return buf;
}
async function cot(code, groesse) {
  if (!/^\d{6}$/.test(code)) throw new Error('COT-Code ungültig');
  if (!COT_GROESSEN.some((g) => g.wert === groesse)) throw new Error('Unbekannte COT-Grösse');
  return mitCache(`cot:${code}:${groesse}`, 24, async () => {
    const jahr = new Date().getUTCFullYear();
    const dateien = [];
    try { dateien.push(await cotDatei('deacot1986_2016.zip', 24 * 365)); } catch {
      for (let j = 1986; j <= 2016; j++) { try { dateien.push(await cotDatei(`deacot${j}.zip`, 24 * 365)); } catch {} }
    }
    for (let j = 2017; j <= jahr; j++) { try { dateien.push(await cotDatei(`deacot${j}.zip`, j === jahr ? 24 : 24 * 365)); } catch (err) { if (j === jahr) throw err; } }
    const punkte = [];
    for (const buf of dateien) {
      const zeilen = zipErsteDatei(buf).split(/\r?\n/);
      const kopf = csvZeile(zeilen[0]);
      const i = (re) => kopf.findIndex((k) => re.test(k));
      const iCode = i(/CFTC Contract Market Code/i), iDatum = i(/YYYY-MM-DD/i), iOi = i(/^Open Interest \(All\)$/i);
      const iNl = i(/^Noncommercial Positions-Long \(All\)$/i), iNs = i(/^Noncommercial Positions-Short \(All\)$/i);
      const iKl = i(/^Commercial Positions-Long \(All\)$/i), iKs = i(/^Commercial Positions-Short \(All\)$/i);
      if ([iCode, iDatum, iOi, iNl, iNs, iKl, iKs].some((x) => x < 0)) throw new Error('CFTC: Spalten nicht gefunden');
      for (const z of zeilen.slice(1)) {
        if (!z.includes(code)) continue;
        const f = csvZeile(z);
        if (f[iCode] !== code) continue;
        const nl = Number(f[iNl]), ns = Number(f[iNs]), oi = Number(f[iOi]), kl = Number(f[iKl]), ks = Number(f[iKs]);
        const v = groesse === 'netto' ? nl - ns : groesse === 'kommerziell' ? kl - ks : oi > 0 ? ((nl - ns) / oi) * 100 : NaN;
        punkte.push([isoTag(f[iDatum]), v]);
      }
    }
    return { punkte: sortiert(punkte), quelle: 'CFTC Commitments of Traders (Legacy, nur Futures)', link: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm' };
  });
}

// Tagesschlüsse eines Paars aus den Kursdaten der Zentrale (Handelstag endet 17:00 New York)
function fx(pair) {
  const h = dukascopyStunden(pair);
  if (!h) throw new Error(`Keine Kursdaten für ${pair} in der Zentrale`);
  const e = tradingEinstellungen();
  const m = new Map();
  let altH = -1, altTag = 0;
  for (let i = 0; i < h.t.length; i++) {
    const hh = h.t[i] - (h.t[i] % 3_600_000);
    if (hh !== altH) { altH = hh; altTag = _intern.sessionTag(hh, e); }
    m.set(altTag, h.c[i]);
  }
  const punkte = [...m.entries()].sort((a, b) => a[0] - b[0]);
  if (punkte.length) punkte.pop(); // letzter Tag evtl. unvollständig
  return { punkte, quelle: 'Kursdaten der Zentrale (HistData/Dukascopy, Tagesschluss 17:00 New York)', link: null, geholt: Date.now() };
}

// Rollender Future aus EIA Kontrakt 1/2: am Tag nach dem drittletzten Handelstag eines Monats wird gerollt,
// die Rendite an diesem Tag ist K1 heute / K2 gestern. Danach mit den Renditen des ETF fortgesetzt.
async function roll(was) {
  const def = { gas: ['ng/hist_xls/RNGC1d', 'ng/hist_xls/RNGC2d', 'UNG'], oel: ['pet/hist_xls/RCLC1d', 'pet/hist_xls/RCLC2d', 'USO'] }[was];
  if (!def) throw new Error('Unbekannter rollender Future');
  const [k1, k2, etf] = await Promise.all([eia(def[0]), eia(def[1]), yahoo(def[2]).catch(() => null)]);
  const m2 = new Map(k2.punkte);
  const d = k1.punkte.filter(([t]) => m2.has(t)).map(([t, c1]) => ({ t, c1, c2: m2.get(t) }));
  const proMonat = new Map();
  for (const x of d) { const dt = new Date(x.t * 86_400_000); const k = dt.getUTCFullYear() * 12 + dt.getUTCMonth(); if (!proMonat.has(k)) proMonat.set(k, []); proMonat.get(k).push(x.t); }
  const verfall = [...proMonat.values()].filter((l) => l.length >= 4).map((l) => l[l.length - 3]);
  const rolltage = new Set();
  for (const v of verfall) { const n = d.find((x) => x.t > v); if (n) rolltage.add(n.t); }
  const punkte = [];
  let idx = 100;
  for (let i = 0; i < d.length; i++) {
    if (i > 0) { const r = rolltage.has(d[i].t) ? d[i].c1 / d[i - 1].c2 : d[i].c1 / d[i - 1].c1; if (Number.isFinite(r) && r > 0) idx *= r; }
    punkte.push([d[i].t, idx]);
  }
  let hinweis = `EIA Kontrakt 1/2 rollend bis ${tagIso(d[d.length - 1].t)}`;
  if (etf?.punkte?.length) {
    const letzter = d[d.length - 1].t;
    const e = etf.punkte.filter(([t]) => t >= letzter);
    if (e.length > 1 && e[0][0] === letzter) {
      for (let i = 1; i < e.length; i++) { idx *= e[i][1] / e[i - 1][1]; punkte.push([e[i][0], idx]); }
      hinweis += `, danach Renditen von ${def[2]}`;
    }
  }
  return { punkte, quelle: 'EIA (rollend)', link: 'https://www.eia.gov/dnav/ng/ng_pri_fut_s1_d.htm', hinweis, veraltet: k1.veraltet || k2.veraltet, geholt: Math.min(k1.geholt, k2.geholt) };
}

// Eigene Reihen (eingefügt) liegen in db().labor.reihen
export function eigeneReihen() { const l = db().labor ||= { ideen: [], laeufe: [] }; return (l.reihen ||= []); }
export function csvZuPunkten(text) {
  const punkte = [];
  for (const z of String(text || '').split(/\r?\n/)) {
    const f = z.split(/[;,\t]/).map((s) => s.trim());
    if (f.length < 2) continue;
    let tag = isoTag(f[0]);
    if (tag === null) { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(f[0]); if (m) tag = Math.floor(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86_400_000); }
    const v = Number(f[1].replace(/'/g, '').replace(/,(?=\d+$)/, '.'));
    if (tag !== null && Number.isFinite(v)) punkte.push([tag, v]);
  }
  return sortiert(punkte);
}

// ---------- Name einer Reihe ----------
export function reiheName(id) {
  const m = MAERKTE.find((x) => x.id === id); if (m) return m.name;
  const r = REIHEN.find((x) => x.id === id); if (r) return r.name;
  const [q, a, b] = id.split(':');
  if (q === 'nasa') return `${WETTER_GROESSEN.find((w) => w.wert === b)?.text || b} · ${ORTE[a]?.name || 'eigene Orte'}`;
  if (q === 'cot') return `COT ${COT_MAERKTE.find((c) => c[0] === a)?.[1] || a} · ${COT_GROESSEN.find((g) => g.wert === b)?.text || b}`;
  if (q === 'fx') return a;
  if (q === 'eigene') return eigeneReihen().find((x) => x.id === a)?.name || 'Eigene Reihe';
  if (q === 'oni') return 'El Niño (ONI)';
  return id;
}

// ---------- Einstieg ----------
export async function reiheHolen(id) {
  const [q, ...rest] = String(id).split(':');
  const a = rest.join(':');
  let r;
  if (q === 'fred') r = await fred(a);
  else if (q === 'yahoo') r = await yahoo(a);
  else if (q === 'nasa') { const [g, gr] = [rest.slice(0, -1).join(':'), rest[rest.length - 1]]; r = await nasa(g, gr); }
  else if (q === 'oni') r = await oni();
  else if (q === 'gpr') r = await gpr(a);
  else if (q === 'eia') r = await eia(a);
  else if (q === 'cot') r = await cot(rest[0], rest[1]);
  else if (q === 'fx') r = fx(a);
  else if (q === 'roll') r = await roll(a);
  else if (q === 'eigene') { const e = eigeneReihen().find((x) => x.id === a); if (!e) throw new Error('Eigene Reihe nicht gefunden'); r = { punkte: e.punkte, quelle: `Eigene Reihe${e.quelle ? ` (${e.quelle})` : ''}`, link: null, geholt: Date.parse(e.geaendert) || Date.now() }; }
  else throw new Error(`Unbekannte Quelle: ${q}`);
  const punkte = (r.punkte || []).filter(([t]) => t <= heuteTag());
  if (!punkte.length) throw new Error(`${reiheName(id)}: keine Werte`);
  return { id, name: reiheName(id), freq: freqVon(punkte), quelle: r.quelle, link: r.link, hinweis: r.hinweis || MAERKTE.find((x) => x.id === id)?.hinweis || REIHEN.find((x) => x.id === id)?.hinweis || null, punkte, stand: r.geholt || Date.now(), veraltet: r.veraltet || null };
}

// Kurze Vorschau für die Seite (Bereich, Anzahl, letzte Werte)
export async function reiheVorschau(id) {
  const r = await reiheHolen(id);
  const p = r.punkte;
  const schritt = Math.max(1, Math.floor(p.length / 300));
  return {
    id, name: r.name, freq: r.freq, quelle: r.quelle, link: r.link, hinweis: r.hinweis, veraltet: r.veraltet,
    von: tagIso(p[0][0]), bis: tagIso(p[p.length - 1][0]), n: p.length, letzte: p.slice(-5).map(([t, v]) => [tagIso(t), v]),
    verlauf: p.filter((_, i) => i % schritt === 0 || i === p.length - 1),
  };
}
