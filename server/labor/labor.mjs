// Trading-Labor: Ideen (Strategien und Hypothesen) mit Vorab-Karte, Versionen, gesperrtem Forward-Zeitraum und Lauf-Warteschlange.
// Gespeichert in db().labor; Ergebnisse (mit allen Trades) als Dateien in data/labor/.
//   - Eine Version wird beim ersten «Starten» eingefroren. Jede Änderung danach ist eine neue Version.
//   - Getestete Varianten = Anzahl eingefrorener Versionen (mindestens die vorab geplanten) → strengere Grenze (Bonferroni).
//   - Der Forward-Zeitraum ist gesperrt, bis er pro Version bewusst geöffnet wird; das wird mit Zeit vermerkt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { config } from '../config.mjs';
import { db, save } from '../store.mjs';
import { PAARE, tradingEinstellungen, tradingDaten } from '../trading.mjs';
import { EREIGNISSE, FILTER, EREIGNIS, FILTER_ID } from './bausteine.mjs';
import { STRATEGIEN, STRATEGIE } from './strategien/index.mjs';
import { TF_LISTE, TF_TEXT } from './daten.mjs';

const ordner = () => path.join(config.dataDir, 'labor');
const JAHR = new Date().getUTCFullYear();
const ERSTES_JAHR = 2003;

function lab() {
  const d = db();
  d.labor ||= { ideen: [], laeufe: [] };
  return d.labor;
}

// ---------- Bausteine und Vorlagen für die Seite ----------
const meta = (x) => ({ id: x.id, name: x.name, beschreibung: x.beschreibung, parameter: x.parameter, gerichtet: x.gerichtet, mitEreignissen: !!x.mitEreignissen });
const ERFOLG_STD = 'Ø R nach Kosten > 0, besser als Zufall (p unter der Bonferroni-Grenze), beide Hälften positiv, Forward hält.';
export const VORLAGEN = [
  { id: 'gva', name: 'Kerims GVA + BOS + Fib', karte: { typ: 'strategie', name: 'GVA + BOS + Fib', modell: 'gva-bos-fib', parameter: {}, filter: [],
    mechanismus: 'Am ersten Treffer einer frischen GVA-Linie liegen unbearbeitete Orders; ein BOS auf 15/30 Min mit Schluss über Swing und Daily Open zeigt, dass sie greifen.',
    erwartung: 'Long nach Long-Linie, Short nach Short-Linie', erfolgskriterium: ERFOLG_STD } },
  { id: 'gva-h', name: 'Hypothese: GVA-Treffer kehrt', karte: { typ: 'hypothese', name: 'GVA-Treffer → Preis läuft von der Linie weg', tf: '1H', richtung: 'beide', nurNeu: true, ereignisse: [{ id: 'gva_treffer', p: { tfs: ['3D', 'W'] } }], filter: [], horizonte: [1, 2, 5, 10], hauptHorizont: 2,
    mechanismus: 'Offene Orders an der Linie drehen den Preis.', erwartung: 'Nach dem Treffer einer Long-Linie steigt der Preis, nach einer Short-Linie fällt er.', erfolgskriterium: 'Mehrwert über Saison und Zufall nach 2 Handelstagen, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
  { id: 'serie', name: 'Hypothese: 3 rote Tage → Erholung', karte: { typ: 'hypothese', name: '3 Tage gleiche Farbe → Gegenbewegung', tf: 'D', richtung: 'beide', nurNeu: true, ereignisse: [{ id: 'serie', p: { n: 3, modus: 'umkehr' } }], filter: [], horizonte: [1, 3, 5], hauptHorizont: 3,
    mechanismus: 'Nach mehreren Tagen in eine Richtung nehmen Händler Gewinne mit.', erwartung: 'Nach 3 roten Tagen steigt der Preis (nach 3 grünen fällt er).', erfolgskriterium: 'Mehrwert über Saison und Zufall nach 3 Handelstagen, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
  { id: 'donchian', name: 'Klassiker: Donchian-Ausbruch', karte: { typ: 'strategie', name: 'Donchian 20 Tage', modell: 'donchian', parameter: {}, filter: [], mechanismus: 'Trends laufen weiter.', erwartung: 'Ausbruch in Richtung des Ausbruchs', erfolgskriterium: ERFOLG_STD } },
  { id: 'eigen', name: 'Eigene Regel (leer)', karte: { typ: 'strategie', name: 'Neue Regel', modell: 'baukasten', parameter: { tf: '1H' }, ereignisse: [], filter: [], mechanismus: '', erwartung: '', erfolgskriterium: ERFOLG_STD } },
  { id: 'eigen-h', name: 'Eigene Hypothese (leer)', karte: { typ: 'hypothese', name: 'Neue Hypothese', tf: 'D', richtung: 'beide', nurNeu: true, ereignisse: [], filter: [], horizonte: [1, 5, 10], hauptHorizont: 5, mechanismus: '', erwartung: '', erfolgskriterium: 'Mehrwert über Saison und Zufall, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
];
export function laborBausteine() {
  return {
    strategien: STRATEGIEN.map(meta), ereignisse: EREIGNISSE.map(meta), filter: FILTER.map(meta),
    paare: PAARE, zeitrahmen: TF_LISTE.map((t) => ({ wert: t, text: TF_TEXT[t] })), vorlagen: VORLAGEN, jahre: { von: ERSTES_JAHR, bis: JAHR },
  };
}

// ---------- Vorab-Karte prüfen ----------
const text = (v, max = 600) => String(v ?? '').trim().slice(0, max);
const jahrIn = (v, std) => { const j = Math.round(Number(v)); return Number.isFinite(j) ? Math.min(JAHR, Math.max(ERSTES_JAHR, j)) : std; };
const bausteinListe = (liste, katalog) => (Array.isArray(liste) ? liste : []).filter((x) => x && katalog[x.id]).slice(0, 12).map((x) => ({ id: x.id, p: typeof x.p === 'object' && x.p ? x.p : {} }));

export function karteNormal(k = {}) {
  const typ = k.typ === 'hypothese' ? 'hypothese' : 'strategie';
  const btVon = jahrIn(k.backtest?.von, ERSTES_JAHR);
  const btBis = Math.max(btVon, jahrIn(k.backtest?.bis, Math.min(2022, JAHR - 1)));
  const fwVon = Math.min(JAHR, Math.max(btBis + 1, jahrIn(k.forward?.von, btBis + 1)));
  const out = {
    typ, name: text(k.name, 80) || (typ === 'hypothese' ? 'Neue Hypothese' : 'Neue Strategie'),
    beschreibung: text(k.beschreibung), mechanismus: text(k.mechanismus), erwartung: text(k.erwartung, 300), erfolgskriterium: text(k.erfolgskriterium, 400),
    geplanteVarianten: Math.min(100, Math.max(1, Math.round(Number(k.geplanteVarianten) || 1))),
    paare: Array.isArray(k.paare) ? k.paare.filter((p) => PAARE.includes(p)) : [],
    backtest: { von: btVon, bis: btBis }, forward: { von: fwVon },
    filter: bausteinListe(k.filter, FILTER_ID),
  };
  if (typ === 'strategie') {
    out.modell = STRATEGIE[k.modell] ? k.modell : 'baukasten';
    out.parameter = typeof k.parameter === 'object' && k.parameter ? k.parameter : {};
    if (STRATEGIE[out.modell].mitEreignissen) out.ereignisse = bausteinListe(k.ereignisse, EREIGNIS);
    if (k.bias && Array.isArray(k.bias.ereignisse) && k.bias.ereignisse.length) {
      out.bias = { tf: TF_LISTE.includes(k.bias.tf) ? k.bias.tf : 'D', richtung: ['long', 'short', 'beide'].includes(k.bias.richtung) ? k.bias.richtung : 'beide', tage: Math.min(60, Math.max(1, Math.round(Number(k.bias.tage) || 5))), ereignisse: bausteinListe(k.bias.ereignisse, EREIGNIS) };
    }
  } else {
    out.tf = TF_LISTE.includes(k.tf) ? k.tf : 'D';
    out.richtung = ['long', 'short', 'beide'].includes(k.richtung) ? k.richtung : 'beide';
    out.nurNeu = k.nurNeu !== false;
    out.ereignisse = bausteinListe(k.ereignisse, EREIGNIS);
    const h = [...new Set((Array.isArray(k.horizonte) ? k.horizonte : [1, 5, 10]).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 60))].sort((a, b) => a - b).slice(0, 6);
    out.horizonte = h.length ? h : [1, 5, 10];
    out.hauptHorizont = out.horizonte.includes(Number(k.hauptHorizont)) ? Number(k.hauptHorizont) : out.horizonte[Math.min(1, out.horizonte.length - 1)];
  }
  return out;
}

// ---------- Ideen ----------
const jetztIso = () => new Date().toISOString();
const aktuelle = (i) => i.versionen[i.versionen.length - 1];
const varianten = (i) => Math.max(i.versionen.filter((v) => v.eingefroren).length, ...i.versionen.filter((v) => v.eingefroren).map((v) => v.karte.geplanteVarianten || 1), 1);

function ideeKurz(i) {
  const v = aktuelle(i);
  const laeufe = lab().laeufe.filter((l) => l.idee === i.id);
  const letzter = laeufe[laeufe.length - 1] || null;
  const letzterFertig = [...laeufe].reverse().find((l) => l.status === 'fertig') || null;
  return {
    id: i.id, name: v.karte.name, typ: v.karte.typ, version: v.v, eingefroren: !!v.eingefroren, erstellt: i.erstellt, geaendert: i.geaendert,
    varianten: varianten(i), forwardOffen: !!i.forward?.[v.v], forwardGeoeffnet: i.forward || {},
    lauf: letzter, ergebnis: letzterFertig ? { lauf: letzterFertig.id, v: letzterFertig.v, art: letzterFertig.art, ...letzterFertig.kurz } : null,
  };
}

export function laborListe() {
  const l = lab();
  return { ideen: l.ideen.map(ideeKurz).sort((a, b) => (b.geaendert > a.geaendert ? 1 : -1)), warteschlange: l.laeufe.filter((x) => x.status === 'wartet' || x.status === 'laeuft').map((x) => x.id) };
}

export function laborIdee(id) {
  const i = lab().ideen.find((x) => x.id === id);
  if (!i) return null;
  return { ...ideeKurz(i), versionen: i.versionen, laeufe: lab().laeufe.filter((l) => l.idee === id).slice(-30) };
}

// Anlegen oder ändern: Ist die letzte Version eingefroren, entsteht eine neue Version.
export function laborIdeeSpeichern(b) {
  const l = lab();
  const karte = karteNormal(b.karte || {});
  let i = b.id ? l.ideen.find((x) => x.id === b.id) : null;
  if (!i) {
    i = { id: crypto.randomUUID(), erstellt: jetztIso(), geaendert: jetztIso(), versionen: [{ v: 1, karte, erstellt: jetztIso(), eingefroren: null }], forward: {} };
    l.ideen.push(i);
  } else {
    const v = aktuelle(i);
    if (v.eingefroren) i.versionen.push({ v: v.v + 1, karte, erstellt: jetztIso(), eingefroren: null });
    else v.karte = karte;
    i.geaendert = jetztIso();
  }
  save();
  return laborIdee(i.id);
}

export function laborIdeeLoeschen(id) {
  const l = lab();
  const i = l.ideen.findIndex((x) => x.id === id);
  if (i < 0) return false;
  l.ideen.splice(i, 1);
  for (const x of l.laeufe.filter((y) => y.idee === id)) { try { fs.unlinkSync(path.join(ordner(), `${x.id}.json`)); } catch {} }
  l.laeufe = l.laeufe.filter((y) => y.idee !== id || y.status === 'laeuft');
  save();
  return true;
}

// ---------- Läufe ----------
let aktiv = null; // { lauf, worker }

export function laborStarten(id, art = 'backtest') {
  const l = lab();
  const i = l.ideen.find((x) => x.id === id);
  if (!i) return { fehler: 'Idee nicht gefunden' };
  const v = aktuelle(i);
  const k = v.karte;
  if (k.typ === 'hypothese' && !k.ereignisse?.length) return { fehler: 'Die Hypothese braucht mindestens ein Ereignis' };
  if (k.typ === 'strategie' && STRATEGIE[k.modell]?.mitEreignissen && !k.ereignisse?.length) return { fehler: 'Die Regel braucht mindestens ein Ereignis' };
  if (art === 'forward' && !i.forward?.[v.v]) return { fehler: 'Forward-Zeitraum ist für diese Version noch gesperrt' };
  if (l.laeufe.some((x) => x.idee === id && (x.status === 'wartet' || x.status === 'laeuft'))) return { fehler: 'Für diese Idee läuft schon etwas' };
  if (!v.eingefroren) { v.eingefroren = jetztIso(); i.geaendert = jetztIso(); }
  const lauf = { id: crypto.randomUUID(), idee: id, v: v.v, art, status: 'wartet', erstellt: jetztIso(), start: null, ende: null, fortschritt: null, fehler: null, kurz: null };
  l.laeufe.push(lauf);
  if (l.laeufe.length > 300) l.laeufe.splice(0, l.laeufe.length - 300);
  save();
  naechster();
  return { ok: true, lauf };
}

// Forward einmal bewusst öffnen (pro Version). Danach rechnet ein Lauf Backtest und Forward zusammen.
export function laborForwardOeffnen(id) {
  const i = lab().ideen.find((x) => x.id === id);
  if (!i) return { fehler: 'Idee nicht gefunden' };
  const v = aktuelle(i);
  if (!v.eingefroren || !lab().laeufe.some((x) => x.idee === id && x.v === v.v && x.status === 'fertig')) return { fehler: 'Zuerst den Backtest dieser Version rechnen' };
  i.forward ||= {};
  const schonFrueher = Object.keys(i.forward).length > 0 && !i.forward[v.v];
  if (!i.forward[v.v]) i.forward[v.v] = jetztIso();
  save();
  const r = laborStarten(id, 'forward');
  return { ...r, schonFrueher };
}

export function laborLauf(id) {
  const x = lab().laeufe.find((y) => y.id === id);
  return x || null;
}

export function laborErgebnis(laufId) {
  try { return JSON.parse(fs.readFileSync(path.join(ordner(), `${laufId}.json`), 'utf8')); } catch { return null; }
}

function yahooFallback(paare) {
  // Nur für Paare ohne Dukascopy-Daten: Yahoo-Stunden (die letzten ~2 Jahre) aus dem Live-Speicher
  const out = {};
  for (const pair of paare) {
    const d = tradingDaten(pair);
    if (!d) continue;
    const t = [], o = [], h = [], l = [], c = [];
    for (let i = 0; i < d.t.length; i++) if (d.quelle[i] === 1) { t.push(d.t[i]); o.push(d.o[i]); h.push(d.h[i]); l.push(d.l[i]); c.push(d.c[i]); }
    out[pair] = { t, o, h, l, c };
  }
  return out;
}

function naechster() {
  if (aktiv) return;
  const l = lab();
  const lauf = l.laeufe.find((x) => x.status === 'wartet');
  if (!lauf) return;
  const i = l.ideen.find((x) => x.id === lauf.idee);
  const v = i?.versionen.find((x) => x.v === lauf.v);
  if (!v) { lauf.status = 'fehler'; lauf.fehler = 'Version nicht gefunden'; save(); return naechster(); }
  const k = v.karte;
  const paare = k.paare?.length ? k.paare : PAARE;
  const backtest = [Date.UTC(k.backtest.von, 0, 1) / 1000, Date.UTC(k.backtest.bis + 1, 0, 1) / 1000];
  const forward = lauf.art === 'forward' ? [Date.UTC(k.forward.von, 0, 1) / 1000, Math.floor(Date.now() / 1000)] : null;
  lauf.status = 'laeuft'; lauf.start = jetztIso(); lauf.fortschritt = { fertig: 0, gesamt: paare.length, paar: null };
  save();
  let worker;
  try {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), {
      workerData: { karte: k, e: { ...tradingEinstellungen() }, yahoo: yahooFallback(paare), paare, backtest, forward, varianten: varianten(i) },
      resourceLimits: { maxOldGenerationSizeMb: 1536 },
    });
  } catch (err) { lauf.status = 'fehler'; lauf.fehler = err.message; save(); return naechster(); }
  aktiv = { lauf, worker };
  const ende = (status, fehler, ergebnis) => {
    if (!aktiv || aktiv.lauf !== lauf) return;
    aktiv = null;
    lauf.status = status; lauf.ende = jetztIso(); lauf.fehler = fehler || null;
    if (ergebnis) {
      fs.mkdirSync(ordner(), { recursive: true });
      const datei = path.join(ordner(), `${lauf.id}.json`);
      fs.writeFileSync(datei + '.tmp', JSON.stringify({ ...ergebnis, lauf: { id: lauf.id, art: lauf.art, v: lauf.v, start: lauf.start, ende: lauf.ende }, karte: k, schonGesehen: lauf.art === 'forward' && Object.keys(i.forward || {}).some((x) => Number(x) < lauf.v) }));
      fs.renameSync(datei + '.tmp', datei);
      lauf.kurz = { urteil: ergebnis.urteil, warum: ergebnis.warum, n: ergebnis.n, nUnabhaengig: ergebnis.nUnabhaengig, avgR: ergebnis.kennzahlen?.avgR ?? null, quote: ergebnis.kennzahlen?.quote ?? null, dauerSek: ergebnis.dauerSek };
    }
    save();
    naechster();
  };
  worker.on('message', (m) => {
    if (m.typ === 'fortschritt') lauf.fortschritt = { fertig: m.fertig, gesamt: m.gesamt, paar: m.paar };
    else if (m.typ === 'fertig') ende('fertig', null, m.ergebnis);
    else if (m.typ === 'fehler') { console.error('[labor]', m.fehler); ende('fehler', String(m.fehler).split('\n')[0]); }
  });
  worker.on('error', (err) => { console.error('[labor]', err); ende('fehler', err.message); });
  worker.on('exit', (code) => { if (code !== 0) ende('fehler', `Rechnung abgebrochen (Code ${code})`); });
}

export function laborAbbrechen(laufId) {
  if (aktiv?.lauf.id === laufId) { aktiv.worker.terminate(); return true; }
  const x = lab().laeufe.find((y) => y.id === laufId && y.status === 'wartet');
  if (x) { x.status = 'fehler'; x.fehler = 'abgebrochen'; save(); return true; }
  return false;
}

// Nach einem Neustart: verwaiste Läufe als abgebrochen markieren und Warteschlange weiterführen
export function laborStart() {
  const l = lab();
  for (const x of l.laeufe) if (x.status === 'laeuft') { x.status = 'fehler'; x.fehler = 'Zentrale wurde neu gestartet'; }
  save();
  setTimeout(naechster, 5_000);
}
