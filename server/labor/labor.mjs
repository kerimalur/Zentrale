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
import { PAARE, tradingEinstellungen, tradingDaten, _intern as tradingIntern } from '../trading.mjs';
import { EREIGNISSE, FILTER, EREIGNIS, FILTER_ID } from './bausteine.mjs';
import { STRATEGIEN, STRATEGIE } from './strategien/index.mjs';
import { TF_LISTE, TF_TEXT } from './daten.mjs';
import { MAERKTE, REIHEN, ORTE, WETTER_GROESSEN, COT_MAERKTE, COT_GROESSEN, WEGE, FALLEN, LEITFRAGEN, GRUPPEN, standardVerzoegerung } from './fremd/katalog.mjs';
import { reiheHolen, reiheVorschau, eigeneReihen, csvZuPunkten, tagIso } from './fremd/quellen.mjs';
import { bedingungenVorbereiten, ereignisseFinden } from './fremd/motor.mjs';
import { ideeMd, zettelMd, sammlungMd, mdLesen, katalogNamen } from './fremd/markdown.mjs';
import { fazitBauen, fazitKurz } from './fazit.mjs';
import { dukascopyFuenfMinuten, dukascopyStunden, DUKA_PAARE } from '../dukascopy.mjs';

const ordner = () => path.join(config.dataDir, 'labor');
const JAHR = new Date().getUTCFullYear();
const ERSTES_JAHR = 2003;
const ERSTES_JAHR_FREMD = 1950;
const isoZuTag = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

function lab() {
  const d = db();
  d.labor ||= { ideen: [], laeufe: [] };
  d.labor.zettel ||= [];
  d.labor.reihen ||= [];
  return d.labor;
}

// ---------- Bausteine und Vorlagen für die Seite ----------
const meta = (x) => ({ id: x.id, name: x.name, beschreibung: x.beschreibung, parameter: x.parameter, gerichtet: x.gerichtet, mitEreignissen: !!x.mitEreignissen });
const ERFOLG_STD = 'Ø R nach Kosten > 0, besser als Zufall (p unter der Bonferroni-Grenze), beide Hälften positiv, Forward hält.';
export const VORLAGEN = [
  { id: 'gva', name: 'Kerims GVA → BOS → Fib (Regelwerk)', karte: { typ: 'strategie', name: 'GVA → BOS → Fib', modell: 'gva-kerim', parameter: {}, filter: [],
    mechanismus: 'Am ersten Treffer einer frischen GVA-Linie liegen unbearbeitete Orders; ein BOS über dem letzten Hoch vor dem Hit und über dem Daily Open zeigt, dass sie greifen.',
    erwartung: 'Long nach Long-Linie, Short nach Short-Linie', erfolgskriterium: ERFOLG_STD } },
  // Zum Auswerten, welche Confluence funktioniert: alle Confluences erfassen und KEINEN Trade wegen fehlender Confluence auslassen.
  // Gefiltert wird danach auf der Ergebnis-Seite (Block «Confluences»), ohne neu zu rechnen.
  { id: 'gva-conf', name: 'Kerims GVA → BOS → Fib – Confluence-Auswertung (alle Trades, alle Confluences)', karte: { typ: 'strategie', name: 'GVA → BOS → Fib (Confluence-Auswertung)', modell: 'gva-kerim',
    parameter: { conf: ['gva', 'd', 'w', 'm', 'poc', 'va'], minConf: 0 }, filter: [],
    mechanismus: 'Wie das Regelwerk, aber ohne Confluence-Pflicht: jeder Trade wird mit allen Confluences in der Fib-Box erfasst (GVA, Daily/Weekly/Monthly Open, Volumen-POC, Value Area). So zeigt die Auswertung, welche Confluence etwas bringt.',
    erwartung: 'Trades mit mehr/bestimmten Confluences schneiden besser ab als Trades ohne', erfolgskriterium: ERFOLG_STD } },
  { id: 'gva-h', name: 'Hypothese: GVA-Treffer kehrt', karte: { typ: 'hypothese', name: 'GVA-Treffer → Preis läuft von der Linie weg', tf: '1H', richtung: 'beide', nurNeu: true, ereignisse: [{ id: 'gva_treffer', p: { tfs: ['3D', 'W'] } }], filter: [], horizonte: [1, 2, 5, 10], hauptHorizont: 2,
    mechanismus: 'Offene Orders an der Linie drehen den Preis.', erwartung: 'Nach dem Treffer einer Long-Linie steigt der Preis, nach einer Short-Linie fällt er.', erfolgskriterium: 'Mehrwert über Saison und Zufall nach 2 Handelstagen, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
  { id: 'serie', name: 'Hypothese: 3 rote Tage → Erholung', karte: { typ: 'hypothese', name: '3 Tage gleiche Farbe → Gegenbewegung', tf: 'D', richtung: 'beide', nurNeu: true, ereignisse: [{ id: 'serie', p: { n: 3, modus: 'umkehr' } }], filter: [], horizonte: [1, 3, 5], hauptHorizont: 3,
    mechanismus: 'Nach mehreren Tagen in eine Richtung nehmen Händler Gewinne mit.', erwartung: 'Nach 3 roten Tagen steigt der Preis (nach 3 grünen fällt er).', erfolgskriterium: 'Mehrwert über Saison und Zufall nach 3 Handelstagen, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
  { id: 'donchian', name: 'Klassiker: Donchian-Ausbruch', karte: { typ: 'strategie', name: 'Donchian 20 Tage', modell: 'donchian', parameter: {}, filter: [], mechanismus: 'Trends laufen weiter.', erwartung: 'Ausbruch in Richtung des Ausbruchs', erfolgskriterium: ERFOLG_STD } },
  { id: 'eigen', name: 'Eigene Regel (leer)', karte: { typ: 'strategie', name: 'Neue Regel', modell: 'baukasten', parameter: { tf: '1H' }, ereignisse: [], filter: [], mechanismus: '', erwartung: '', erfolgskriterium: ERFOLG_STD } },
  { id: 'eigen-h', name: 'Eigene Hypothese (leer)', karte: { typ: 'hypothese', name: 'Neue Hypothese', tf: 'D', richtung: 'beide', nurNeu: true, ereignisse: [], filter: [], horizonte: [1, 5, 10], hauptHorizont: 5, mechanismus: '', erwartung: '', erfolgskriterium: 'Mehrwert über Saison und Zufall, p < 0,05 nach Bonferroni, beide Hälften, Forward hält.' } },
  // Fremddaten-Hypothesen (Rohstoffe, Wetter, Krieg, Makro …) nach dem Skill «hypothese-testen»
  ...fremdVorlagen(),
];
function fremdVorlagen() {
  const ERFOLG_F = 'Mehrwert über der Saison > 0, p < 0,05 nach Bonferroni, beide Hälften gleiche Richtung, Pseudo-Forward hält.';
  const basis = { typ: 'fremd', modus: 'bedingung', start: 'beginn', warten: 0, geplanteVarianten: 1, erfolgskriterium: ERFOLG_F, backtest: { von: 1990, bis: 2022 }, forward: { von: 2023 }, wege: [] };
  const b = (reihe, agg, mess, vergleich, schwelle) => ({ reihe, verz: standardVerzoegerung(reihe), agg, diff: 0, mess, vergleich, schwelle });
  return [
    { id: 'f-gas', name: 'Fremddaten: Kältewelle → Erdgas short', karte: { ...basis, name: 'Kältewelle → Erdgas danach short', richtung: 'short', warten: 14, horizonte: [30, 61, 91], hauptHorizont: 61, saison: { von: '11-01', bis: '03-15' }, backtest: { von: 1996, bis: 2022 },
      kette: { ereignis: 'Kältewelle startet (Heizgradtage 7 Tage > 1 Std.-Abw. über 10 Vorjahren)', mechanismus: 'Nachfrage-Spitze ist schnell eingepreist, danach normalisiert sie sich', wirkung: 'Erdgas fällt nach der Kälte', markt: 'Erdgas-Future rollend, UNG', zeitraum: '14 Tage warten, 61 Tage halten' },
      bedingungen: [b('nasa:us-gas:HDD', { art: 'rollend', tage: 7, fn: 'summe' }, { art: 'anomalie', vorjahre: 10, fenster: 7, perioden: 1 }, '>', 1)],
      maerkte: [{ id: 'roll:gas' }, { id: 'yahoo:UNG' }], mechanismus: 'Kälte erhöht die Nachfrage kurzfristig, der Preis steigt schon während der Kälte. Danach fällt die Nachfrage wieder.', erwartung: 'Erdgas ist 2 Monate nach dem Beginn einer Kältewelle tiefer als der gleiche Kalendertag in anderen Jahren.', wege: ['spiegel', 'querschnitt', 'dosis'] } },
    { id: 'f-gpr', name: 'Fremddaten: Geopolitik-Schock → Gold long', karte: { ...basis, name: 'Geopolitischer Schock → Gold steigt', richtung: 'long', horizonte: [5, 20, 60], hauptHorizont: 20, backtest: { von: 2001, bis: 2022 },
      kette: { ereignis: 'GPR (7 Tage) springt > 2 z-Werte über das letzte Jahr', mechanismus: 'Angst-Kanal: Flucht in sichere Häfen', wirkung: 'Gold steigt', markt: 'Gold-Future, GLD', zeitraum: '20 Tage' },
      bedingungen: [b('gpr:GPRD', { art: 'rollend', tage: 7, fn: 'mittel' }, { art: 'zscore', perioden: 250, vorjahre: 10, fenster: 7 }, '>', 2)],
      maerkte: [{ id: 'yahoo:GC=F' }, { id: 'yahoo:GLD' }], mechanismus: 'Bei Krieg und Terror fliehen Anleger in sichere Häfen.', erwartung: 'Gold ist 20 Tage nach einem Sprung des GPR-Index höher als zu gleichen Kalendertagen.', wege: ['querschnitt', 'spiegel'] } },
    { id: 'f-mais', name: 'Fremddaten: Trockener Sommer → Mais long', karte: { ...basis, name: 'Trockener Sommer im Maisgürtel → Mais steigt', richtung: 'long', horizonte: [14, 30, 60], hauptHorizont: 30, saison: { von: '06-01', bis: '08-15' }, backtest: { von: 2001, bis: 2022 },
      kette: { ereignis: 'Regen 30 Tage deutlich unter den 10 Vorjahren', mechanismus: 'Ernte-Erwartung sinkt', wirkung: 'Mais steigt', markt: 'Mais-Future', zeitraum: '30 Tage' },
      bedingungen: [b('nasa:us-mais:PRECTOTCORR', { art: 'rollend', tage: 30, fn: 'summe' }, { art: 'anomalie', vorjahre: 10, fenster: 10, perioden: 1 }, '<', -1)],
      maerkte: [{ id: 'yahoo:ZC=F' }], mechanismus: 'Trockenheit in der Blütezeit senkt den Ertrag.', erwartung: 'Mais ist 30 Tage nach Beginn einer Trockenphase höher als üblich.', wege: ['spiegel', 'querschnitt', 'kette'] } },
    { id: 'f-oni', name: 'Fremddaten: El Niño → Kakao long', karte: { ...basis, name: 'El Niño → Kakao steigt', richtung: 'long', horizonte: [30, 91, 182], hauptHorizont: 91, backtest: { von: 1990, bis: 2022 },
      kette: { ereignis: 'ONI steigt über 1,0', mechanismus: 'Trockenheit in Westafrika', wirkung: 'Kakao-Ernte sinkt, Preis steigt', markt: 'Kakao-Future', zeitraum: '3 Monate' },
      bedingungen: [b('oni', { art: 'roh' }, { art: 'wert', perioden: 1, vorjahre: 10, fenster: 7 }, '>', 1)],
      maerkte: [{ id: 'yahoo:CC=F' }], mechanismus: 'El Niño bringt Westafrika Trockenheit.', erwartung: 'Kakao ist 3 Monate nach El-Niño-Beginn höher.', wege: ['historie', 'kette'] } },
    { id: 'f-liste', name: 'Fremddaten: Eigene Ereignis-Liste (z. B. Kriegsbeginne)', karte: { ...basis, name: 'Kriegsbeginn → Öl steigt', modus: 'liste', richtung: 'long', warten: 1, horizonte: [5, 20, 60], hauptHorizont: 20,
      kette: { ereignis: 'Beginn eines Kriegs mit Öl-Bezug', mechanismus: 'Angebotsangst', wirkung: 'Öl steigt', markt: 'WTI rollend', zeitraum: '20 Tage' },
      liste: [{ datum: '1990-08-02', text: 'Irak besetzt Kuwait' }, { datum: '2003-03-20', text: 'Irak-Krieg' }, { datum: '2011-02-17', text: 'Libyen' }, { datum: '2014-02-27', text: 'Krim' }, { datum: '2022-02-24', text: 'Ukraine' }],
      maerkte: [{ id: 'roll:oel' }], mechanismus: 'Kriege in Förderregionen bedrohen das Angebot.', erwartung: 'Öl ist 20 Tage nach Kriegsbeginn höher.', wege: ['querschnitt'] } },
    { id: 'f-leer', name: 'Fremddaten: Leere Vorlage (eigene Daten und Märkte)', karte: { ...basis, name: 'Neue Fremddaten-Hypothese', richtung: 'long', horizonte: [7, 30, 60], hauptHorizont: 30, bedingungen: [], maerkte: [], mechanismus: '', erwartung: '', kette: {} } },
  ];
}

export function laborBausteine() {
  return {
    strategien: STRATEGIEN.map(meta), ereignisse: EREIGNISSE.map(meta), filter: FILTER.map(meta),
    paare: PAARE, zeitrahmen: TF_LISTE.map((t) => ({ wert: t, text: TF_TEXT[t] })), vorlagen: VORLAGEN, jahre: { von: ERSTES_JAHR, bis: JAHR },
    fremd: {
      maerkte: [...MAERKTE, ...PAARE.map((p) => ({ id: `fx:${p}`, name: `${p} (Kursdaten der Zentrale)`, gruppe: 'Devisen', handelbar: true, kosten: 0.02 }))],
      gruppen: GRUPPEN, reihen: REIHEN, orte: Object.entries(ORTE).map(([id, o]) => ({ id, name: o.name, orte: o.orte.map((x) => x[0]) })),
      wetterGroessen: WETTER_GROESSEN, cotMaerkte: COT_MAERKTE.map(([wert, text]) => ({ wert, text })), cotGroessen: COT_GROESSEN,
      wege: WEGE, fallen: FALLEN, leitfragen: LEITFRAGEN, jahre: { von: ERSTES_JAHR_FREMD, bis: JAHR },
      eigene: eigeneReihen().map((r) => ({ id: r.id, name: r.name, n: r.punkte.length, von: r.punkte.length ? tagIso(r.punkte[0][0]) : null, bis: r.punkte.length ? tagIso(r.punkte[r.punkte.length - 1][0]) : null, quelle: r.quelle || '' })),
      verzoegerung: Object.fromEntries(REIHEN.map((r) => [r.id, r.verz])),
    },
  };
}

// ---------- Vorab-Karte prüfen ----------
const text = (v, max = 600) => String(v ?? '').trim().slice(0, max);
const bausteinListe = (liste, katalog) => (Array.isArray(liste) ? liste : []).filter((x) => x && katalog[x.id]).slice(0, 12).map((x) => ({ id: x.id, p: typeof x.p === 'object' && x.p ? x.p : {} }));

export const REIHE_RE = /^(fred:[A-Z0-9_]{2,40}|yahoo:[A-Z0-9.^=-]{1,20}|nasa:[a-z0-9_.~-]{2,200}:[A-Z0-9_]{2,15}|oni|gpr:[A-Z0-9_]{2,15}|eia:(ng|pet)\/hist_xls\/[A-Za-z0-9_]{3,40}|cot:\d{6}:[a-z]{4,12}|fx:[A-Z]{6}|roll:(gas|oel)|eigene:[0-9a-f-]{36})$/i;
const zahlIn = (v, min, max, std) => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std; };
const mmdd = (s) => (/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s || '')) ? s : null);

function fremdNormal(k, out) {
  out.modus = k.modus === 'liste' ? 'liste' : 'bedingung';
  out.richtung = k.richtung === 'short' ? 'short' : 'long';
  out.start = k.start === 'jede' ? 'jede' : 'beginn';
  const sv = mmdd(k.saison?.von), sb = mmdd(k.saison?.bis);
  out.saison = sv && sb ? { von: sv, bis: sb } : null;
  out.warten = Math.round(zahlIn(k.warten, 0, 365, 0));
  const h = [...new Set((Array.isArray(k.horizonte) ? k.horizonte : [7, 30, 60]).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 730))].sort((a, b) => a - b).slice(0, 6);
  out.horizonte = h.length ? h : [7, 30, 60];
  out.hauptHorizont = out.horizonte.includes(Number(k.hauptHorizont)) ? Number(k.hauptHorizont) : out.horizonte[Math.min(1, out.horizonte.length - 1)];
  out.bedingungen = (Array.isArray(k.bedingungen) ? k.bedingungen : []).filter((b) => b && REIHE_RE.test(String(b.reihe || ''))).slice(0, 4).map((b) => ({
    reihe: String(b.reihe), verz: Math.round(zahlIn(b.verz, 0, 120, standardVerzoegerung(String(b.reihe)))),
    agg: { art: ['roh', 'rollend', 'woche', 'monat'].includes(b.agg?.art) ? b.agg.art : 'roh', tage: Math.round(zahlIn(b.agg?.tage, 1, 365, 7)), fn: ['mittel', 'summe', 'min', 'max'].includes(b.agg?.fn) ? b.agg.fn : 'mittel' },
    diff: Math.round(zahlIn(b.diff, 0, 52, 0)),
    mess: { art: ['wert', 'aenderung', 'aenderungProzent', 'anomalie', 'zscore', 'perzentil'].includes(b.mess?.art) ? b.mess.art : 'wert', perioden: Math.round(zahlIn(b.mess?.perioden, 1, 520, 12)), vorjahre: Math.round(zahlIn(b.mess?.vorjahre, 2, 40, 10)), fenster: Math.round(zahlIn(b.mess?.fenster, 0, 60, 7)) },
    vergleich: b.vergleich === '<' ? '<' : '>', schwelle: zahlIn(b.schwelle, -1e12, 1e12, 0),
  }));
  out.liste = (Array.isArray(k.liste) ? k.liste : []).map((x) => ({
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(x?.datum || '')) && Number.isFinite(isoZuTag(x.datum)) ? x.datum : null, text: text(x?.text, 120),
    seite: x?.seite === -1 || x?.seite === 'short' ? -1 : x?.seite === 1 || x?.seite === 'long' ? 1 : null,
  })).filter((x) => x.datum).sort((a, b) => (a.datum < b.datum ? -1 : 1)).slice(0, 1000);
  const gesehen = new Set();
  out.maerkte = (Array.isArray(k.maerkte) ? k.maerkte : []).filter((m) => m && REIHE_RE.test(String(m.id || '')) && !gesehen.has(m.id) && gesehen.add(m.id)).slice(0, 8).map((m) => {
    const kat = MAERKTE.find((x) => x.id === m.id);
    return { id: String(m.id), kosten: zahlIn(m.kosten, 0, 10, kat?.kosten ?? (String(m.id).startsWith('fx:') ? 0.02 : 0.05)), handelbar: m.handelbar !== undefined ? !!m.handelbar : kat ? kat.handelbar : true };
  });
  out.stufe2 = k.stufe2?.aktiv ? { aktiv: true, modell: ['woche', 'ausbruch', 'ruecksetzer'].includes(k.stufe2.modell) ? k.stufe2.modell : 'ausbruch', n: Math.round(zahlIn(k.stufe2.n, 2, 60, 10)), halten: Math.round(zahlIn(k.stufe2.halten, 1, 60, 5)) } : null;
  const kt = k.kette || {};
  out.kette = { ereignis: text(kt.ereignis, 200), mechanismus: text(kt.mechanismus, 200), wirkung: text(kt.wirkung, 200), markt: text(kt.markt, 200), zeitraum: text(kt.zeitraum, 200) };
  out.bekanntAb = text(k.bekanntAb, 300);
  out.wege = (Array.isArray(k.wege) ? k.wege : []).filter((w) => WEGE.some((x) => x.id === w));
}

export function karteNormal(k = {}) {
  const typ = k.typ === 'hypothese' ? 'hypothese' : k.typ === 'fremd' ? 'fremd' : 'strategie';
  const erstes = typ === 'fremd' ? ERSTES_JAHR_FREMD : ERSTES_JAHR;
  const jahrIn = (v, std) => { const j = Math.round(Number(v)); return Number.isFinite(j) ? Math.min(JAHR, Math.max(erstes, j)) : std; };
  const btVon = jahrIn(k.backtest?.von, typ === 'fremd' ? 1990 : ERSTES_JAHR);
  const btBis = Math.max(btVon, jahrIn(k.backtest?.bis, Math.min(2022, JAHR - 1)));
  const fwVon = Math.min(JAHR, Math.max(btBis + 1, jahrIn(k.forward?.von, btBis + 1)));
  const out = {
    typ, name: text(k.name, 80) || (typ === 'strategie' ? 'Neue Strategie' : 'Neue Hypothese'),
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
    if (k.bias?.quelle === 'fremd' && typeof k.bias.idee === 'string' && k.bias.idee) {
      // Bias aus einer Fremddaten-Hypothese: Fenster = Ereignis bekannt + Wartezeit bis + tage Kalendertage
      out.bias = { quelle: 'fremd', idee: k.bias.idee.slice(0, 40), richtung: ['long', 'short', 'beide'].includes(k.bias.richtung) ? k.bias.richtung : 'beide', tage: Math.min(365, Math.max(1, Math.round(Number(k.bias.tage) || 30))), ereignisse: [] };
    } else if (k.bias && Array.isArray(k.bias.ereignisse) && k.bias.ereignisse.length) {
      out.bias = { tf: TF_LISTE.includes(k.bias.tf) ? k.bias.tf : 'D', richtung: ['long', 'short', 'beide'].includes(k.bias.richtung) ? k.bias.richtung : 'beide', tage: Math.min(60, Math.max(1, Math.round(Number(k.bias.tage) || 5))), ereignisse: bausteinListe(k.bias.ereignisse, EREIGNIS) };
    }
  } else if (typ === 'fremd') {
    delete out.paare; delete out.filter;
    fremdNormal(k, out);
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
    tags: i.tags || [], extern: i.extern?.length ? i.extern[i.extern.length - 1] : null, maerkte: v.karte.typ === 'fremd' ? (v.karte.maerkte || []).map((m) => m.id) : null,
  };
}

export function laborListe() {
  const l = lab();
  return { ideen: l.ideen.map(ideeKurz).sort((a, b) => (b.geaendert > a.geaendert ? 1 : -1)), warteschlange: l.laeufe.filter((x) => x.status === 'wartet' || x.status === 'laeuft').map((x) => x.id) };
}

export function laborIdee(id) {
  const i = lab().ideen.find((x) => x.id === id);
  if (!i) return null;
  return { ...ideeKurz(i), versionen: i.versionen, laeufe: lab().laeufe.filter((l) => l.idee === id).slice(-30), notizen: i.notizen || '', externAlle: i.extern || [], zettel: i.zettel || null };
}

// Notizen, Stichworte und Skill-Ergebnisse ändern – ohne neue Version (gehören nicht zur Vorab-Karte)
const tagsNormal = (t) => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map((x) => text(x, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
function externNormal(x) {
  const s = (v, m) => text(v, m);
  return { id: s(x.id, 40) || crypto.randomUUID(), datum: s(x.datum, 20) || jetztIso().slice(0, 10), urteil: ['Bestätigt', 'Hinweis', 'Nicht bestätigt', 'Zu wenig Daten'].includes(x.urteil) ? x.urteil : null, stufe: s(x.stufe, 60), kernzahl: s(x.kernzahl, 300), link: /^https?:\/\//.test(String(x.link || '')) ? s(x.link, 300) : '', text: s(x.text, 1500), n: Number.isFinite(Number(x.n)) && x.n !== null ? Number(x.n) : null, nUnabhaengig: Number.isFinite(Number(x.nUnabhaengig)) && x.nUnabhaengig !== null ? Number(x.nUnabhaengig) : null };
}
export function laborIdeeMeta(b) {
  const i = lab().ideen.find((x) => x.id === b.id);
  if (!i) return null;
  if (b.notizen !== undefined) i.notizen = text(b.notizen, 20_000);
  if (b.tags !== undefined) i.tags = tagsNormal(b.tags);
  if (Array.isArray(b.extern)) i.extern = b.extern.slice(0, 50).map(externNormal);
  i.geaendert = jetztIso();
  save();
  return laborIdee(i.id);
}
export function laborIdeeKopieren(id) {
  const i = lab().ideen.find((x) => x.id === id);
  if (!i) return null;
  const k = structuredClone(aktuelle(i).karte);
  k.name = `${k.name} (Kopie)`.slice(0, 80);
  const neu = laborIdeeSpeichern({ karte: k });
  return laborIdeeMeta({ id: neu.id, tags: i.tags || [], notizen: i.notizen || '' });
}

// ---------- Brainstorm-Zettel ----------
const ZSTATUS = ['roh', 'ausgearbeitet', 'getestet', 'verworfen'];
function zettelNormal(z, alt = {}) {
  const kt = z.kette || {};
  return {
    id: alt.id || crypto.randomUUID(), erstellt: alt.erstellt || jetztIso(), geaendert: jetztIso(),
    titel: text(z.titel, 120) || 'Neue Idee', text: text(z.text, 5000), tags: tagsNormal(z.tags), status: ZSTATUS.includes(z.status) ? z.status : 'roh',
    kette: { ereignis: text(kt.ereignis, 300), mechanismus: text(kt.mechanismus, 300), wirkung: text(kt.wirkung, 300), markt: text(kt.markt, 300), zeitraum: text(kt.zeitraum, 300) },
    spiegel: text(z.spiegel, 1000), fragen: text(z.fragen, 3000), quellen: text(z.quellen, 1500), wege: (Array.isArray(z.wege) ? z.wege : []).filter((w) => WEGE.some((x) => x.id === w)),
    links: (Array.isArray(z.links) ? z.links : []).map((x) => text(x, 40)).filter(Boolean).slice(0, 20), idee: typeof z.idee === 'string' ? z.idee.slice(0, 40) : alt.idee || null,
    farbe: ['gelb', 'blau', 'gruen', 'rot', 'grau'].includes(z.farbe) ? z.farbe : alt.farbe || 'gelb',
  };
}
export function laborZettel() { return { zettel: [...lab().zettel].sort((a, b) => (b.geaendert > a.geaendert ? 1 : -1)) }; }
export function laborZettelSpeichern(b) {
  const l = lab();
  const alt = b.id ? l.zettel.find((x) => x.id === b.id) : null;
  const z = zettelNormal(b, alt || {});
  if (alt) Object.assign(alt, z); else l.zettel.push(z);
  if (l.zettel.length > 2000) l.zettel.splice(0, l.zettel.length - 2000);
  save();
  return alt || z;
}
export function laborZettelLoeschen(id) {
  const l = lab();
  const i = l.zettel.findIndex((x) => x.id === id);
  if (i < 0) return false;
  l.zettel.splice(i, 1);
  for (const z of l.zettel) z.links = (z.links || []).filter((x) => x !== id);
  save();
  return true;
}

// ---------- Eigene Datenreihen (CSV einfügen) ----------
export function laborReiheSpeichern(b) {
  const l = lab();
  const punkte = csvZuPunkten(b.csv);
  if (punkte.length < 10) return { fehler: 'Zu wenige Werte erkannt (mindestens 10 Zeilen «Datum;Wert»)' };
  const alt = b.id ? l.reihen.find((x) => x.id === b.id) : null;
  const r = { id: alt?.id || crypto.randomUUID(), name: text(b.name, 80) || 'Eigene Reihe', quelle: text(b.quelle, 200), punkte: punkte.slice(-60_000), geaendert: jetztIso() };
  if (alt) Object.assign(alt, r); else l.reihen.push(r);
  save();
  return { ok: true, id: r.id, n: r.punkte.length, von: tagIso(r.punkte[0][0]), bis: tagIso(r.punkte[r.punkte.length - 1][0]) };
}
export function laborReiheLoeschen(id) {
  const l = lab();
  const n = l.reihen.length;
  l.reihen = l.reihen.filter((x) => x.id !== id);
  save();
  return l.reihen.length < n;
}
export async function laborReiheVorschau(id) {
  if (!REIHE_RE.test(String(id || ''))) return { fehler: 'Ungültige Reihe' };
  try { return await reiheVorschau(id); } catch (err) { return { fehler: err.message }; }
}

// ---------- Markdown ----------
function letztesErgebnis(i) {
  const fertig = [...lab().laeufe].reverse().find((x) => x.idee === i.id && x.status === 'fertig');
  return fertig ? laborErgebnis(fertig.id) : null;
}
export function laborExport({ ideen = [], zettel = [] } = {}) {
  const l = lab();
  const namen = katalogNamen(laborBausteine());
  const teile = [];
  for (const id of ideen) { const i = l.ideen.find((x) => x.id === id); if (i) teile.push({ name: aktuelle(i).karte.name, md: ideeMd(i, letztesErgebnis(i), namen) }); }
  for (const id of zettel) { const z = l.zettel.find((x) => x.id === id); if (z) teile.push({ name: z.titel, md: zettelMd(z) }); }
  if (!teile.length) return { fehler: 'Nichts ausgewählt' };
  const datei = (s) => s.toLowerCase().replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'labor';
  const heute = jetztIso().slice(0, 10);
  if (teile.length === 1) return { datei: `${heute}-${datei(teile[0].name)}.md`, md: teile[0].md };
  return { datei: `${heute}-labor-sammlung.md`, md: sammlungMd(teile.map((t) => t.md), `Labor-Export (${teile.length})`) };
}

// Import: erst Vorschau (was erkannt wurde), dann mit «uebernehmen» anlegen.
// Ideen mit bekannter id werden als neue Version gespeichert (bestehende Läufe bleiben), sonst neu angelegt.
// Skill-Ergebnisse werden der Idee mit gleicher id oder gleichem Namen zugeordnet; sonst einem neuen Zettel.
// zuordnung: { e0: ideeId | 'zettel' } – Skill-Ergebnisse von Hand einer Idee zuordnen
const gleicheKarte = (a, b) => JSON.stringify(karteNormal(a)) === JSON.stringify(karteNormal(b));
export function laborImport({ text: t, uebernehmen = false, auswahl = null, zuordnung = {} }) {
  const l = lab();
  const r = mdLesen(String(t || '').slice(0, 2_000_000));
  const ideeZiel = (x) => {
    const i = x.id && l.ideen.find((y) => y.id === x.id);
    if (!i) return 'neu';
    return gleicheKarte(aktuelle(i).karte, x.karte || {}) ? 'unverändert' : aktuelle(i).eingefroren ? 'neue Version' : 'Entwurf ersetzen';
  };
  const eintraege = [
    ...r.ideen.map((x, n) => ({ nr: `i${n}`, art: 'idee', name: x.karte?.name || 'Idee', typ: x.karte?.typ, ziel: ideeZiel(x) })),
    ...r.zettel.map((x, n) => ({ nr: `z${n}`, art: 'zettel', name: x.titel || 'Zettel', ziel: x.id && l.zettel.some((y) => y.id === x.id) ? 'aktualisieren' : 'neu' })),
    ...r.ergebnisse.map((x, n) => {
      const hand = zuordnung?.[`e${n}`];
      const idee = hand === 'zettel' ? null : (hand && l.ideen.find((y) => y.id === hand)) || (x.id && l.ideen.find((y) => y.id === x.id)) || l.ideen.find((y) => aktuelle(y).karte.name.toLowerCase() === (x.name || '').toLowerCase());
      return { nr: `e${n}`, art: 'ergebnis', name: x.name || 'Ergebnis', urteil: x.urteil, kernzahl: x.kernzahl, link: x.link, ziel: idee ? `zu «${aktuelle(idee).karte.name}»` : 'als Zettel', ideeId: idee?.id || null };
    }),
  ];
  if (!uebernehmen) return { eintraege, warnungen: r.warnungen };
  const nimm = (nr) => !Array.isArray(auswahl) || auswahl.includes(nr);
  const angelegt = { ideen: 0, zettel: 0, ergebnisse: 0 };
  r.ideen.forEach((x, n) => {
    if (!nimm(`i${n}`) || !x.karte) return;
    const vorhanden = x.id && l.ideen.find((y) => y.id === x.id);
    if (vorhanden && gleicheKarte(aktuelle(vorhanden).karte, x.karte)) { laborIdeeMeta({ id: vorhanden.id, tags: x.tags?.length ? x.tags : vorhanden.tags, notizen: x.notizen || vorhanden.notizen }); angelegt.ideen++; return; }
    const neu = laborIdeeSpeichern({ id: vorhanden ? x.id : undefined, karte: x.karte });
    laborIdeeMeta({ id: neu.id, tags: x.tags, notizen: x.notizen });
    angelegt.ideen++;
  });
  r.zettel.forEach((x, n) => {
    if (!nimm(`z${n}`)) return;
    const vorhanden = x.id && l.zettel.some((y) => y.id === x.id);
    laborZettelSpeichern({ ...x, id: vorhanden ? x.id : undefined });
    angelegt.zettel++;
  });
  r.ergebnisse.forEach((x, n) => {
    if (!nimm(`e${n}`)) return;
    const e = eintraege.find((y) => y.nr === `e${n}`);
    if (e?.ideeId) { const i = l.ideen.find((y) => y.id === e.ideeId); i.extern = [...(i.extern || []), externNormal(x)].slice(-50); i.geaendert = jetztIso(); }
    else {
      const z = l.zettel.find((y) => y.titel.toLowerCase() === (x.name || '').toLowerCase()) || laborZettelSpeichern({ titel: x.name || 'Skill-Ergebnis', status: 'getestet' });
      z.status = 'getestet';
      z.text = `${z.text ? `${z.text}\n\n` : ''}Skill-Ergebnis ${x.datum}: ${x.urteil || '—'}${x.kernzahl ? ` · ${x.kernzahl}` : ''}${x.link ? ` · ${x.link}` : ''}${x.text ? `\n${x.text}` : ''}`.slice(0, 5000);
    }
    angelegt.ergebnisse++;
  });
  save();
  return { ok: true, angelegt };
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

// Entwurf verwerfen: die letzte, noch nicht eingefrorene Version löschen (die vorige bleibt)
export function laborVersionVerwerfen(id) {
  const i = lab().ideen.find((x) => x.id === id);
  if (!i) return { fehler: 'Idee nicht gefunden' };
  const v = aktuelle(i);
  if (v.eingefroren) return { fehler: 'Eingefrorene Versionen bleiben – sie zählen als getestete Variante' };
  if (i.versionen.length < 2) return { fehler: 'Das ist die einzige Version – lösche stattdessen die ganze Idee' };
  i.versionen.pop();
  i.geaendert = jetztIso();
  save();
  return laborIdee(i.id);
}

// Ein Ergebnis (Lauf) löschen. Die Version bleibt eingefroren und zählt weiter als Variante.
export function laborLaufLoeschen(laufId) {
  const l = lab();
  const x = l.laeufe.find((y) => y.id === laufId);
  if (!x || x.status === 'laeuft' || x.status === 'wartet') return false;
  try { fs.unlinkSync(path.join(ordner(), `${x.id}.json`)); } catch {}
  l.laeufe = l.laeufe.filter((y) => y.id !== laufId);
  save();
  return true;
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
  if (k.typ === 'fremd') {
    if (!k.maerkte?.length) return { fehler: 'Die Hypothese braucht mindestens einen Markt' };
    if (k.modus === 'liste' ? !k.liste?.length : !k.bedingungen?.length) return { fehler: k.modus === 'liste' ? 'Die Ereignis-Liste ist leer' : 'Die Hypothese braucht mindestens eine Bedingung' };
  }
  if (k.bias?.quelle === 'fremd' && aktuelle(l.ideen.find((x) => x.id === k.bias.idee) || { versionen: [{ karte: {} }] }).karte.typ !== 'fremd') return { fehler: 'Die Fremddaten-Hypothese für das Bias-Fenster gibt es nicht mehr' };
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
  let e;
  try { e = JSON.parse(fs.readFileSync(path.join(ordner(), `${laufId}.json`), 'utf8')); } catch { return null; }
  // Fazit wird beim Laden gebaut (rechnet nichts neu), damit auch ältere Ergebnisse es bekommen
  try { e.fazit = fazitBauen(e); } catch (err) { console.error('[labor] Fazit:', err.message); e.fazit = null; }
  return e;
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

// Daten für einen Lauf vorbereiten (im Haupt-Thread, weil Netz): Rückgabe { url, daten } für den Worker
async function fremdDaten(k, lauf) {
  const ids = [...new Set([...(k.modus === 'liste' ? [] : (k.bedingungen || []).map((b) => b.reihe)), ...(k.maerkte || []).map((m) => m.id)])];
  const reihen = {};
  for (let x = 0; x < ids.length; x++) {
    lauf.fortschritt = { fertig: x, gesamt: ids.length, paar: `Daten: ${ids[x]}` };
    try { reihen[ids[x]] = await reiheHolen(ids[x]); }
    catch (err) {
      if ((k.maerkte || []).some((m) => m.id === ids[x]) && k.maerkte.length > 1) continue; // ein fehlender Markt von mehreren: weiter ohne ihn
      throw new Error(`${ids[x]}: ${err.message}`);
    }
  }
  return reihen;
}
const tagVonJahr = (j) => Math.floor(Date.UTC(j, 0, 1) / 86_400_000);
async function vorbereiten(k, lauf, i) {
  if (k.typ === 'fremd') {
    const reihen = await fremdDaten(k, lauf);
    const karte = { ...k, liste: (k.liste || []).map((x) => ({ ...x, tag: isoZuTag(x.datum) })) };
    const backtest = [tagVonJahr(k.backtest.von), tagVonJahr(k.backtest.bis + 1)];
    const forward = lauf.art === 'forward' ? [tagVonJahr(k.forward.von), Math.floor(Date.now() / 86_400_000) + 1] : null;
    return { url: new URL('./fremd/worker.mjs', import.meta.url), daten: { karte, reihen, backtest, forward, varianten: varianten(i) } };
  }
  const paare = k.paare?.length ? k.paare : PAARE;
  const backtest = [Date.UTC(k.backtest.von, 0, 1) / 1000, Date.UTC(k.backtest.bis + 1, 0, 1) / 1000];
  const forward = lauf.art === 'forward' ? [Date.UTC(k.forward.von, 0, 1) / 1000, Math.floor(Date.now() / 1000)] : null;
  let biasFenster = null;
  if (k.typ === 'strategie' && k.bias?.quelle === 'fremd') {
    // Ereignisse der Fremddaten-Hypothese (aktuelle Version) als Zeitfenster für die Strategie
    const fi = lab().ideen.find((x) => x.id === k.bias.idee);
    if (!fi) throw new Error('Fremddaten-Hypothese für das Bias-Fenster nicht gefunden');
    const fk = aktuelle(fi).karte;
    const reihen = await fremdDaten({ ...fk, maerkte: [] }, lauf);
    const fkt = { ...fk, liste: (fk.liste || []).map((x) => ({ ...x, tag: isoZuTag(x.datum) })) };
    const vorb = fkt.modus === 'liste' ? [] : bedingungenVorbereiten(fkt, reihen);
    const evs = ereignisseFinden(fkt, vorb, Math.floor(backtest[0] / 86_400), Math.floor((forward ? forward[1] : backtest[1]) / 86_400) + 1);
    const seite = k.bias.richtung === 'long' ? 1 : k.bias.richtung === 'short' ? -1 : 0;
    biasFenster = evs.map((e) => ({ von: (e.tag + (fkt.warten || 0)) * 86_400, bis: (e.tag + (fkt.warten || 0) + k.bias.tage) * 86_400, seite }));
  }
  return {
    url: new URL('./worker.mjs', import.meta.url),
    daten: { karte: k, e: { ...tradingEinstellungen() }, yahoo: yahooFallback(paare), paare, backtest, forward, varianten: varianten(i), biasFenster },
  };
}

async function naechster() {
  if (aktiv) return;
  const l = lab();
  const lauf = l.laeufe.find((x) => x.status === 'wartet');
  if (!lauf) return;
  const i = l.ideen.find((x) => x.id === lauf.idee);
  const v = i?.versionen.find((x) => x.v === lauf.v);
  if (!v) { lauf.status = 'fehler'; lauf.fehler = 'Version nicht gefunden'; save(); return naechster(); }
  const k = v.karte;
  lauf.status = 'laeuft'; lauf.start = jetztIso(); lauf.fortschritt = { fertig: 0, gesamt: 1, paar: 'Vorbereiten' };
  save();
  aktiv = { lauf, worker: null, abgebrochen: false };
  const schluss = (status, fehler) => { aktiv = null; lauf.status = status; lauf.fehler = fehler; lauf.ende = jetztIso(); save(); setTimeout(naechster, 0); };
  let vorb;
  try { vorb = await vorbereiten(k, lauf, i); } catch (err) { console.error('[labor]', err.message); return schluss('fehler', String(err.message).slice(0, 300)); }
  if (aktiv?.abgebrochen) return schluss('fehler', 'abgebrochen');
  lauf.fortschritt = { fertig: 0, gesamt: 1, paar: null };
  let worker;
  try {
    worker = new Worker(vorb.url, { workerData: vorb.daten, resourceLimits: { maxOldGenerationSizeMb: 1536 } });
  } catch (err) { return schluss('fehler', err.message); }
  aktiv.worker = worker;
  const ende = (status, fehler, ergebnis) => {
    if (!aktiv || aktiv.lauf !== lauf) return;
    aktiv = null;
    lauf.status = status; lauf.ende = jetztIso(); lauf.fehler = fehler || null;
    if (ergebnis) {
      fs.mkdirSync(ordner(), { recursive: true });
      const datei = path.join(ordner(), `${lauf.id}.json`);
      fs.writeFileSync(datei + '.tmp', JSON.stringify({ ...ergebnis, lauf: { id: lauf.id, art: lauf.art, v: lauf.v, start: lauf.start, ende: lauf.ende }, karte: k, schonGesehen: lauf.art === 'forward' && Object.keys(i.forward || {}).some((x) => Number(x) < lauf.v) }));
      fs.renameSync(datei + '.tmp', datei);
      const hh = ergebnis.typ === 'fremd' ? ergebnis.horizonte?.find((h) => h.h === ergebnis.haupt) : null;
      lauf.kurz = {
        urteil: ergebnis.urteil, warum: ergebnis.warum, n: ergebnis.n, nUnabhaengig: ergebnis.nUnabhaengig,
        avgR: ergebnis.typ === 'fremd' ? null : ergebnis.kennzahlen?.avgR ?? null, quote: ergebnis.typ === 'fremd' ? hh?.quote ?? null : ergebnis.kennzahlen?.quote ?? null,
        mittelProzent: hh?.mittel ?? null, mehrwertProzent: hh?.mehrwert ?? null, dauerSek: ergebnis.dauerSek,
        ...(() => { try { return fazitKurz({ ...ergebnis, karte: k, lauf: { id: lauf.id, art: lauf.art, v: lauf.v }, schonGesehen: lauf.art === 'forward' && Object.keys(i.forward || {}).some((x) => Number(x) < lauf.v) }); } catch { return {}; } })(),
      };
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
  if (aktiv?.lauf.id === laufId) { if (aktiv.worker) aktiv.worker.terminate(); else aktiv.abgebrochen = true; return true; }
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


// Kerzen rund um einen einzelnen Trade (zum Nachprüfen im Chart). von/bis in Unix-Sekunden, tf: 5m | 15m | 30m | 1H.
// Es werden nur Kerzen aus den gespeicherten Kursdaten geliefert; die Trades selbst stehen schon im (freigegebenen) Ergebnis.
const CHART_TF = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600 };
export function laborTradeChart({ pair, von, bis, tf = '15m' }) {
  if (!DUKA_PAARE.includes(pair)) return { fehler: 'Unbekanntes Paar' };
  von = Math.floor(Number(von)); bis = Math.floor(Number(bis));
  const sek = CHART_TF[tf];
  if (!sek || !(von > 0) || !(bis > von)) return { fehler: 'Ungültiger Zeitraum' };
  if ((bis - von) / sek > 2500) return { fehler: 'Zeitraum zu lang für diesen Zeitrahmen – gröberen Zeitrahmen wählen' };
  const mt = (x) => { const d = new Date(x * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  let t = [], o = [], h = [], l = [], c = [], res = 300, quelle = 'Kursdaten 5 Min';
  // Daily/Weekly/Monthly Opens (Handelstag ab 17:00 New York, Woche ab Sonntag 17:00, Monat nach Handelstag),
  // ab 35 Tagen vor dem Chart-Beginn, damit auch die laufende Woche und der laufende Monat ihr Open haben.
  // Open an Werktagen = Schluss der Kerze davor (Rollover-Sprung der Bid-Kurse), nach dem Wochenende das echte Open.
  const e = tradingEinstellungen();
  const VOR = 35 * 86_400;
  const art = { D: tradingIntern.keyFn('D', e), W: tradingIntern.keyFn('W', e), M: tradingIntern.keyFn('M', e) };
  const opens = { D: [], W: [], M: [] }, altK = { D: null, W: null, M: null };
  let altS = null, altC = null;
  const periodenOpen = (s, op, cl) => {
    const tag = tradingIntern.sessionTag(s * 1000, e);
    for (const x of ['D', 'W', 'M']) {
      const key = art[x](tag);
      if (key !== altK[x]) { altK[x] = key; opens[x].push({ t: s, o: altS !== null && s - altS < 86_400 ? altC : op }); }
    }
    altS = s; altC = cl;
  };
  const zuruecksetzen = () => { for (const x of ['D', 'W', 'M']) { opens[x].length = 0; altK[x] = null; } altS = null; altC = null; };
  const m5 = dukascopyFuenfMinuten(pair, mt(von - VOR), mt(bis));
  if (m5 && m5.n) {
    for (let i = 0; i < m5.n; i++) {
      if (m5.t[i] >= von - VOR && m5.t[i] <= bis) periodenOpen(m5.t[i], m5.o[i], m5.c[i]);
      if (m5.t[i] >= von && m5.t[i] <= bis) { t.push(m5.t[i]); o.push(m5.o[i]); h.push(m5.h[i]); l.push(m5.l[i]); c.push(m5.c[i]); }
    }
  }
  if (!t.length) {
    const h1 = dukascopyStunden(pair);
    if (!h1) return { fehler: 'Keine Kursdaten für dieses Paar' };
    res = 3600; quelle = 'Kursdaten 1 Std';
    zuruecksetzen();
    for (let i = 0; i < h1.t.length; i++) {
      const s = h1.t[i] / 1000;
      if (s >= von - VOR && s <= bis) periodenOpen(s, h1.o[i], h1.c[i]);
      if (s >= von && s <= bis) { t.push(s); o.push(h1.o[i]); h.push(h1.h[i]); l.push(h1.l[i]); c.push(h1.c[i]); }
    }
  }
  if (!t.length) return { fehler: 'Keine Kerzen in diesem Zeitraum' };
  // nur Perioden, die im Chart sichtbar sind (die Periode, die vor dem Chart begann, gilt ab Chart-Beginn)
  const sichtbar = (liste) => liste.filter((x, i) => (liste[i + 1]?.t ?? Infinity) > von);
  const dailyOpens = sichtbar(opens.D), weeklyOpens = sichtbar(opens.W), monthlyOpens = sichtbar(opens.M);
  const k = Math.max(sek, res);
  const kerzen = [];
  let letzter = null;
  for (let i = 0; i < t.length; i++) {
    const key = Math.floor(t[i] / k) * k;
    if (letzter && letzter.t === key) { if (h[i] > letzter.h) letzter.h = h[i]; if (l[i] < letzter.l) letzter.l = l[i]; letzter.c = c[i]; }
    else { letzter = { t: key, o: o[i], h: h[i], l: l[i], c: c[i] }; kerzen.push(letzter); }
  }
  return { pair, tf: k === sek ? tf : (k === 3600 ? '1H' : tf), zuGrob: k > sek, quelle, kerzen, dailyOpens, weeklyOpens, monthlyOpens };
}

// ---------- GVA-Muster: die 3D-Kerzen rund um eine Linie ----------
// Zum Nachprüfen, woher eine Linie kommt: `vor` Kerzen vor dem Muster, Kerze A, Kerze B (das Muster, die Linie ist ihr Open),
// dann `nach` Kerzen danach – bei 5/5 also 12 Kerzen. Linie = id aus dem Trade (info.linie): «PAAR|3D|Datum von B|long/short».
// Rechnet mit den Live-Kursdaten der Zentrale (HistData-Stunden bis zum letzten Monat, danach Yahoo) – dieselben Kerzen wie der GVA-Tab.
export function laborGvaMuster({ linie, vor = 5, nach = 5 }) {
  const m = /^([A-Z]{6})\|(3D|W|M)\|(\d{4}-\d{2}-\d{2})\|(long|short)$/.exec(String(linie || ''));
  if (!m) return { fehler: 'Ungültige Linie' };
  const [, pair, tf, tag, seite] = m;
  if (!PAARE.includes(pair)) return { fehler: 'Unbekanntes Paar' };
  const d = tradingDaten(pair);
  if (!d) return { fehler: 'Kurse für dieses Paar sind noch nicht geladen' };
  const e = tradingEinstellungen();
  const { kerzen } = tradingIntern.kerzenBauen(d, tf, e);
  const iB = kerzen.findIndex((k) => tradingIntern.tagIso(k.tag) === tag);
  if (iB < 1) return { fehler: 'Kerze B dieser Linie nicht gefunden' };
  const nv = Math.min(10, Math.max(0, Math.round(Number(vor)) || 0)), nn = Math.min(10, Math.max(0, Math.round(Number(nach)) || 0));
  const lang = seite === 'long';
  const pip = pair.endsWith('JPY') ? 0.01 : 0.0001;
  const r = (x) => Number(x.toFixed(pair.endsWith('JPY') ? 3 : 5));
  const A = kerzen[iB - 1], B = kerzen[iB];
  const atr = tradingIntern.atrReihe(kerzen, e.atrLen);
  const atrB = atr[iB] ?? 0;
  const bodyA = Math.abs(A.c - A.o), bodyB = Math.abs(B.c - B.o);
  const tol = e.tolBasis === 'atr' ? atrB * (e.tolPct / 100) : bodyA * (e.tolPct / 100);
  const lvl = lang ? Math.min(B.o, B.c) : Math.max(B.o, B.c);
  const aKante = lang ? Math.min(A.o, A.c) : Math.max(A.o, A.c);
  const von = Math.max(0, iB - 1 - nv), bis = Math.min(kerzen.length - 1, iB + nn);
  return {
    pair, tf, seite, tag, lvl: r(lvl), pip,
    ziel: r(lang ? lvl + atrB * e.touchTol : lvl - atrB * e.touchTol), // ab hier gilt die Linie als berührt
    muster: {
      aTag: tradingIntern.tagIso(A.tag), bTag: tag,
      aOpen: r(A.o), aClose: r(A.c), bOpen: r(B.o), bClose: r(B.c),
      aFarbe: A.c < A.o ? 'rot' : A.c > A.o ? 'grün' : 'neutral', bFarbe: B.c > B.o ? 'grün' : B.c < B.o ? 'rot' : 'neutral',
      koerperAPips: Number((bodyA / pip).toFixed(1)), koerperBPips: Number((bodyB / pip).toFixed(1)),
      verhaeltnis: bodyA > 0 ? Number((bodyB / bodyA).toFixed(2)) : null, noetig: Number((1 + e.k2Pct / 100).toFixed(2)),
      aKante: r(aKante), abstandPips: Number((Math.abs(aKante - lvl) / pip).toFixed(1)), tolPips: Number((tol / pip).toFixed(1)),
      messung: lvl === B.o ? 'Open von Kerze B' : lang ? 'Körper-Boden von Kerze B' : 'Körper-Top von Kerze B',
      alt: !!(A.alt || B.alt),
    },
    kerzen: kerzen.slice(von, bis + 1).map((k, j) => ({
      start: tradingIntern.tagIso(k.tag), t: d.t[k.s] / 1000, tEnde: d.t[k.e] / 1000 + 3600,
      o: r(k.o), h: r(k.h), l: r(k.l), c: r(k.c), rolle: von + j === iB - 1 ? 'A' : von + j === iB ? 'B' : null, fertig: von + j < kerzen.length - 1,
    })),
  };
}

// ---------- Läufe vergleichen ----------
// Alle fertigen Läufe (neueste zuerst) für die Auswahl
export function laborLaeufeFertig() {
  const l = lab();
  const out = [];
  for (const x of [...l.laeufe].reverse()) {
    if (x.status !== 'fertig') continue;
    const i = l.ideen.find((y) => y.id === x.idee);
    if (!i) continue;
    const v = i.versionen.find((y) => y.v === x.v) || aktuelle(i);
    out.push({ id: x.id, idee: x.idee, name: v.karte.name, typ: v.karte.typ, v: x.v, art: x.art, ende: x.ende, kurz: x.kurz });
  }
  return { laeufe: out };
}

// Spezifikation einer Karte als flache Zeilen { schluessel, name, wert } – Parameter mit ihren Namen aus dem Schema
export function spezifikation(k, parameter) {
  const zeilen = [];
  const add = (schluessel, name, wert) => zeilen.push({ schluessel, name, wert: wert === undefined || wert === null || wert === '' ? '—' : String(wert) });
  const teile = (liste, katalog) => (liste || []).map((t) => `${katalog[t.id]?.name || t.id}${Object.keys(t.p || {}).length ? ` (${Object.entries(t.p).map(([a, w]) => `${a} ${Array.isArray(w) ? w.join('/') : w}`).join(', ')})` : ''}`).join(' + ') || '—';
  add('typ', 'Art', k.typ === 'strategie' ? 'Strategie' : k.typ === 'fremd' ? 'Hypothese · Fremddaten' : 'Hypothese · Kurse');
  add('backtest', 'Backtest', `${k.backtest?.von}–${k.backtest?.bis}`);
  add('forward', 'Forward ab', k.forward?.von);
  if (k.typ !== 'fremd') add('paare', 'Paare', k.paare?.length ? k.paare.join(', ') : 'alle 28');
  if (k.typ === 'strategie') {
    const mod = STRATEGIE[k.modell];
    add('modell', 'Strategie', mod?.name || k.modell);
    const p = parameter || k.parameter || {};
    for (const s of mod?.parameter || []) {
      let w = p[s.key];
      if (w === undefined) w = s.standard;
      const optText = (x) => s.optionen?.find((o) => o.wert === x)?.text ?? x;
      const txt = s.typ === 'schalter' ? (w ? 'an' : 'aus') : s.typ === 'mehrfach' ? (Array.isArray(w) ? w.map(optText).join(', ') : w) : s.typ === 'auswahl' ? optText(w) : w;
      add(`p.${s.key}`, s.name, txt);
    }
    if (mod?.mitEreignissen) add('ereignisse', 'Ereignisse', teile(k.ereignisse, EREIGNIS));
    add('bias', 'Bias-Fenster', k.bias ? (k.bias.quelle === 'fremd' ? `Fremddaten-Hypothese · ${k.bias.tage} Tage · ${k.bias.richtung}` : `${teile(k.bias.ereignisse, EREIGNIS)} · ${k.bias.tage} Handelstage · ${k.bias.richtung}`) : null);
  } else if (k.typ === 'hypothese') {
    add('tf', 'Zeitrahmen', TF_TEXT[k.tf] || k.tf);
    add('richtung', 'Richtung', k.richtung);
    add('ereignisse', 'Ereignisse', teile(k.ereignisse, EREIGNIS));
    add('horizonte', 'Horizonte', (k.horizonte || []).join(', '));
  } else {
    add('richtung', 'Richtung', k.richtung);
    add('maerkte', 'Märkte', (k.maerkte || []).map((m) => m.id).join(', '));
    add('bedingungen', 'Bedingungen', (k.bedingungen || []).map((b) => `${b.reihe} ${b.mess?.art} ${b.vergleich} ${b.schwelle}`).join(' + ') || (k.liste?.length ? `${k.liste.length} Ereignisse aus Liste` : null));
    add('horizonte', 'Horizonte (Tage)', (k.horizonte || []).join(', '));
    add('warten', 'Wartezeit', k.warten);
  }
  if (k.typ !== 'fremd') add('filter', 'Filter', teile(k.filter, FILTER_ID));
  return zeilen;
}

export function laborVergleich(ids) {
  const liste = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x).replace(/[^0-9a-f-]/g, '')))].slice(0, 4);
  if (liste.length < 2) return { fehler: 'Mindestens zwei Läufe wählen' };
  const spalten = [], specs = [], tradeKeys = [];
  for (const id of liste) {
    const e = laborErgebnis(id);
    if (!e) return { fehler: `Ergebnis ${id.slice(0, 8)} nicht gefunden` };
    const x = lab().laeufe.find((y) => y.id === id);
    const i = lab().ideen.find((y) => y.id === x?.idee);
    const k = e.karte || {};
    specs.push(spezifikation(k, e.parameter));
    const trades = e.trades || [];
    tradeKeys.push(new Set(trades.map((t) => `${t.pair}|${t.seite}|${t.tEin}`)));
    spalten.push({
      id, idee: x?.idee || null, name: k.name || i?.versionen?.[0]?.karte?.name || 'Lauf', v: e.lauf?.v ?? x?.v, art: e.lauf?.art ?? x?.art, ende: e.lauf?.ende ?? x?.ende, typ: e.typ,
      urteil: e.urteil, warum: e.warum, n: e.n, nUnabhaengig: e.nUnabhaengig, varianten: e.varianten,
      kennzahlen: e.kennzahlen || null, forward: e.forward ? { kennzahlen: e.forward.kennzahlen } : null,
      kurve: e.kurve || null, forwardKurve: e.forward?.kurve || null,
      trichter: e.trichter || null, raster: (e.raster || []).map((z) => ({ id: z.id, name: z.name, status: z.status, text: z.text })),
      proJahr: e.proJahr || null, grundAusstieg: e.grundAusstieg || null, mfeMedian: e.mfeMedian ?? null, maeMedian: e.maeMedian ?? null,
      monteCarlo: e.monteCarlo ? { dd95: e.monteCarlo.dd95, serie95: e.monteCarlo.serie95 } : null, fazit: e.fazit ? { ampel: e.fazit.ampel, satz: e.fazit.satz } : null,
    });
  }
  // Spezifikation: alle Schlüssel, die in einem Lauf vorkommen; «verschieden», wenn die Werte nicht überall gleich sind
  const schluessel = [];
  for (const s of specs) for (const z of s) if (!schluessel.some((x) => x.schluessel === z.schluessel)) schluessel.push({ schluessel: z.schluessel, name: z.name });
  const spezifikationZeilen = schluessel.map(({ schluessel: sk, name }) => {
    const werte = specs.map((s) => s.find((z) => z.schluessel === sk)?.wert ?? '—');
    return { schluessel: sk, name, werte, verschieden: new Set(werte).size > 1 };
  });
  // Trades: wie viele gibt es in allen Läufen, wie viele nur in diesem
  const tradesVergleich = tradeKeys.map((s, i) => {
    let gemeinsam = 0, nurHier = 0;
    for (const t of s) { const anderswo = tradeKeys.filter((x, j) => j !== i && x.has(t)).length; if (anderswo === tradeKeys.length - 1) gemeinsam++; if (anderswo === 0) nurHier++; }
    return { gesamt: s.size, gemeinsam, nurHier };
  });
  return { spalten, spezifikation: spezifikationZeilen, trades: tradesVergleich };
}
