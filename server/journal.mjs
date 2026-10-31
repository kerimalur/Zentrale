// Trading-Journal (von Hand geführt). Speichert Trades und Einstellungen in der Zentrale-Datenbank (data/zentrale.json,
// wird nachts mitgesichert). Alle Auswertungen rechnet die Seite selbst (lib/journal.ts), der Server prüft nur die Eingaben.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { PAARE, tradingKurs } from './trading.mjs';

const STANDARD = {
  startkapital: 10000, // EUR, für Kapitalkurve in EUR und Drawdown in %
  waehrung: 'EUR',
  beSchwelle: 0.1, // |R| bis zu diesem Wert gilt als Breakeven
  risikoProzent: 1, // für Monte Carlo und Lot-Rechner
  checkliste: [], // Regel-Checkliste (kommt später)
};

// Im Journal darf zusätzlich Gold gehandelt sein (der Screener bleibt bei den 28 Währungspaaren).
const JPAARE = [...PAARE, 'XAUUSD'];
const fehler400 = (t, status = 400) => Object.assign(new Error(t), { status });

function jd() {
  const d = db();
  d.journal ||= { trades: [], einstellungen: {} };
  const j = d.journal;
  j.einstellungen = { ...STANDARD, ...j.einstellungen };
  // Konten und Ein-/Auszahlungen (neu): immer mindestens ein Konto, alte Live-Trades gehören dem ersten.
  if (!Array.isArray(j.konten) || !j.konten.length) j.konten = [{ id: 'haupt', name: 'Hauptkonto' }];
  if (!Array.isArray(j.cashflows)) j.cashflows = [];
  for (const t of j.trades) if (t.art !== 'backtest' && !t.konto) t.konto = j.konten[0].id;
  return j;
}

// Umrechnung Quote-Währung → EUR (1 Einheit Quote-Währung = x EUR) aus den Live-Kursen des Trading-Tabs.
function umrechnung() {
  const r = { EUR: 1 };
  for (const q of ['USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']) {
    const k = tradingKurs('EUR' + q);
    r[q] = k ? Number((1 / k).toPrecision(6)) : null;
  }
  return r;
}

export function journalZustand() {
  const j = jd();
  return { trades: j.trades, konten: j.konten, cashflows: j.cashflows, einstellungen: j.einstellungen, umrechnung: umrechnung(), paare: JPAARE };
}

export const BILD = /^[0-9a-f-]{36}\.(jpg|png)$/;
const bildOrdner = () => path.join(config.dataDir, 'journal-bilder');
const zahl = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const DATUM = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

const AUSGAENGE = ['tp', 'sl', 'be', 'trail'];

// Pflicht sind nur Paar, Datum und Ergebnis in EUR. Alles andere ist freiwillig.
// Ein Trade ohne Ergebnis (noch offen) braucht dafür Entry und Stop-Loss.
function pruefen(b) {
  const f = (t) => { throw fehler400(t); };
  const j = jd();
  const pair = String(b.pair || '').toUpperCase().replace('/', '');
  if (!JPAARE.includes(pair)) f('Unbekanntes Paar');
  const art = b.art === 'backtest' ? 'backtest' : 'live';
  if (!DATUM.test(String(b.eroeffnet || ''))) f('Datum fehlt');
  const geschlossen = b.geschlossen ? String(b.geschlossen) : null;
  if (geschlossen && !DATUM.test(geschlossen)) f('Schliessung: Datum ungültig');
  const entry = zahl(b.entry), sl = zahl(b.sl), tp = zahl(b.tp), exit = zahl(b.exit);
  const lots = zahl(b.lots), risikoEur = zahl(b.risikoEur), ergebnisEur = zahl(b.ergebnisEur), rManuell = zahl(b.rManuell);
  if (lots !== null && !(lots > 0)) f('Lots ungültig');
  if (risikoEur !== null && !(risikoEur > 0)) f('Risiko in EUR muss positiv sein');
  if (ergebnisEur !== null && !Number.isFinite(ergebnisEur)) f('Ergebnis ungültig');
  if (rManuell !== null && !Number.isFinite(rManuell)) f('R ungültig');
  const hatKurse = entry !== null || sl !== null;
  if (!hatKurse && ergebnisEur === null && rManuell === null) f('Ergebnis in EUR fehlt (offene Trades brauchen Entry und Stop-Loss)');
  let richtung = b.richtung === 'short' ? 'short' : b.richtung === 'long' ? 'long' : null;
  if (hatKurse) {
    if (!(entry > 0)) f('Entry fehlt');
    if (!(sl > 0)) f('Stop-Loss fehlt');
    if (entry === sl) f('Entry und Stop-Loss dürfen nicht gleich sein');
    const echt = sl < entry ? 'long' : 'short';
    if (richtung && richtung !== echt) f(richtung === 'long' ? 'Long: Stop-Loss muss unter dem Entry liegen' : 'Short: Stop-Loss muss über dem Entry liegen');
    richtung = echt; // ohne Angabe ergibt sich die Richtung aus Entry und Stop-Loss
    if (tp !== null && !(tp > 0)) f('Take-Profit ungültig');
    if (tp !== null && (richtung === 'long' ? tp <= entry : tp >= entry)) f('Take-Profit liegt auf der falschen Seite');
  } else if (tp !== null || exit !== null) f('Take-Profit und Ausstieg brauchen Entry und Stop-Loss');
  if (exit !== null && !(exit > 0)) f('Ausstieg ungültig');
  // Wie der Trade endete: von Hand gesetzt, sonst automatisch aus dem Vorzeichen (Plus = TP, Minus = SL, 0 = Break-Even).
  let ausgang = AUSGAENGE.includes(b.ausgang) ? b.ausgang : null;
  if (ausgang === null && ergebnisEur !== null) ausgang = ergebnisEur > 0 ? 'tp' : ergebnisEur < 0 ? 'sl' : 'be';
  let konto = null;
  if (art === 'live') {
    konto = b.konto ? String(b.konto) : j.konten[0].id;
    if (!j.konten.some((k) => k.id === konto)) f('Konto unbekannt');
  }
  const tf = ['3D', 'W', 'M'].includes(b.tf) ? b.tf : null;
  const gefuehl = zahl(b.gefuehl);
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [];
  const fehler = Array.isArray(b.fehler) ? [...new Set(b.fehler.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [];
  const bild = String(b.bild || '').trim().slice(0, 500);
  if (bild && !/^https?:\/\//.test(bild)) f('Screenshot: bitte einen Link (https://…)');
  const bilder = Array.isArray(b.bilder) ? b.bilder.map(String).filter((x) => BILD.test(x)).slice(0, 12) : [];
  const session = /^[\w-]{1,60}$/.test(String(b.session || '')) ? String(b.session) : null;
  return {
    pair, richtung, art, konto, ausgang, eroeffnet: String(b.eroeffnet), geschlossen,
    entry, sl, tp, exit, lots, risikoEur, ergebnisEur, rManuell,
    tf, gvaLevel: zahl(b.gvaLevel), gefuehl: gefuehl && gefuehl >= 1 && gefuehl <= 5 ? Math.round(gefuehl) : null,
    tags, fehler, notiz: String(b.notiz || '').slice(0, 4000), bild, bilder, session,
    checks: b.checks && typeof b.checks === 'object' ? Object.fromEntries(Object.entries(b.checks).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), !!v])) : {},
  };
}

export function tradeSpeichern(b) {
  const j = jd();
  const alt = b.id ? j.trades.find((x) => x.id === b.id) : null;
  if (b.id && !alt) throw Object.assign(new Error('Trade nicht gefunden'), { status: 404 });
  const t = pruefen(alt && !b.konto ? { ...b, konto: alt.konto } : b); // beim Bearbeiten bleibt das Konto, wenn keins mitkommt
  const jetzt = Date.now();
  if (b.id) {
    const i = j.trades.findIndex((x) => x.id === b.id);
    j.trades[i] = { ...j.trades[i], ...t, geaendert: jetzt };
    save();
    return j.trades[i];
  }
  const neu = { id: crypto.randomUUID(), ...t, erstellt: jetzt, geaendert: jetzt };
  j.trades.push(neu);
  save();
  return neu;
}

export function tradeLoeschen(id) {
  return tradesLoeschen([id]) > 0;
}

// Mehrere Trades auf einmal löschen (Mehrfachauswahl im Journal). Gibt die Anzahl der gelöschten Trades zurück.
export function tradesLoeschen(ids) {
  const j = jd();
  const liste = new Set((Array.isArray(ids) ? ids : []).map(String));
  if (!liste.size) return 0;
  const weg = j.trades.filter((t) => liste.has(t.id));
  if (!weg.length) return 0;
  j.trades = j.trades.filter((t) => !liste.has(t.id));
  save();
  for (const t of weg) for (const b of t.bilder || []) { try { fs.unlinkSync(path.join(bildOrdner(), b)); } catch {} }
  return weg.length;
}

// ---------- Konten und Ein-/Auszahlungen ----------
export function kontoSpeichern(b) {
  const j = jd();
  const name = String(b.name || '').trim().slice(0, 40);
  if (!name) throw fehler400('Name fehlt');
  if (j.konten.some((k) => k.id !== b.id && k.name.toLowerCase() === name.toLowerCase())) throw fehler400('Ein Konto mit diesem Namen gibt es schon');
  if (b.id) {
    const k = j.konten.find((x) => x.id === b.id);
    if (!k) throw fehler400('Konto nicht gefunden', 404);
    k.name = name;
    save();
    return k;
  }
  if (j.konten.length >= 20) throw fehler400('Höchstens 20 Konten');
  const neu = { id: crypto.randomUUID(), name };
  j.konten.push(neu);
  save();
  return neu;
}

export function kontoLoeschen(id) {
  const j = jd();
  if (!j.konten.some((k) => k.id === id)) return false;
  if (j.konten.length <= 1) throw fehler400('Mindestens ein Konto muss bleiben');
  if (j.trades.some((t) => t.konto === id)) throw fehler400('Das Konto hat noch Trades. Lösche zuerst die Trades.');
  if (j.cashflows.some((c) => c.konto === id)) throw fehler400('Das Konto hat noch Ein- oder Auszahlungen. Lösche zuerst diese.');
  j.konten = j.konten.filter((k) => k.id !== id);
  save();
  return true;
}

export function cashflowSpeichern(b) {
  const j = jd();
  const konto = String(b.konto || '');
  if (!j.konten.some((k) => k.id === konto)) throw fehler400('Konto unbekannt');
  const datum = String(b.datum || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) throw fehler400('Datum fehlt');
  const betrag = Number(b.betrag);
  if (!Number.isFinite(betrag) || !(betrag > 0) || betrag > 1e9) throw fehler400('Betrag muss grösser als 0 sein');
  const art = b.art === 'auszahlung' ? 'auszahlung' : b.art === 'einzahlung' ? 'einzahlung' : null;
  if (!art) throw fehler400('Einzahlung oder Auszahlung wählen');
  const wert = { konto, datum, betrag: Math.round(betrag * 100) / 100, art };
  if (b.id) {
    const i = j.cashflows.findIndex((c) => c.id === b.id);
    if (i < 0) throw fehler400('Eintrag nicht gefunden', 404);
    j.cashflows[i] = { ...j.cashflows[i], ...wert };
    save();
    return j.cashflows[i];
  }
  if (j.cashflows.length >= 5000) throw fehler400('Zu viele Einträge');
  const neu = { id: crypto.randomUUID(), ...wert };
  j.cashflows.push(neu);
  save();
  return neu;
}

export function cashflowLoeschen(id) {
  const j = jd();
  const n = j.cashflows.length;
  j.cashflows = j.cashflows.filter((c) => c.id !== id);
  if (j.cashflows.length === n) return false;
  save();
  return true;
}

// ---------- Screenshots (Backtest-Session) ----------
export function bildSpeichern(daten, typ) {
  const endung = typ === 'image/png' ? 'png' : typ === 'image/jpeg' ? 'jpg' : null;
  if (!endung) throw Object.assign(new Error('Nur JPG oder PNG'), { status: 400 });
  if (!daten.length || daten.length > 8 * 1024 * 1024) throw Object.assign(new Error('Bild leer oder grösser als 8 MB'), { status: 400 });
  fs.mkdirSync(bildOrdner(), { recursive: true });
  const name = `${crypto.randomUUID()}.${endung}`;
  fs.writeFileSync(path.join(bildOrdner(), name), daten);
  return { name };
}
export function bildPfad(name) {
  if (!BILD.test(name)) return null;
  const p = path.join(bildOrdner(), name);
  return fs.existsSync(p) ? p : null;
}

// ---------- Import (CSV/Excel, schon in der Seite zugeordnet) ----------
export function importieren(liste) {
  const j = jd();
  if (!Array.isArray(liste) || !liste.length) throw Object.assign(new Error('Keine Trades zum Importieren'), { status: 400 });
  if (liste.length > 2000) throw Object.assign(new Error('Höchstens 2000 Trades pro Import'), { status: 400 });
  const ok = [], fehler = [];
  const jetzt = Date.now();
  liste.forEach((b, i) => {
    try { ok.push({ id: crypto.randomUUID(), ...pruefen(b), importiert: jetzt, erstellt: jetzt, geaendert: jetzt }); }
    catch (e) { fehler.push({ zeile: Number(b?.zeile) || i + 1, text: e.message }); }
  });
  if (j.trades.length + ok.length > 20_000) throw Object.assign(new Error('Zu viele Trades'), { status: 400 });
  j.trades.push(...ok);
  save();
  return { importiert: ok.length, fehler: fehler.slice(0, 100), fehlerAnzahl: fehler.length };
}

export function journalEinstellungenSetzen(b) {
  const j = jd();
  const e = j.einstellungen;
  const z = (v, min, max, f) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : f; };
  j.einstellungen = {
    ...e,
    startkapital: z(b.startkapital ?? e.startkapital, 1, 1e9, e.startkapital),
    beSchwelle: z(b.beSchwelle ?? e.beSchwelle, 0, 1, e.beSchwelle),
    risikoProzent: z(b.risikoProzent ?? e.risikoProzent, 0.05, 10, e.risikoProzent),
    checkliste: Array.isArray(b.checkliste) ? b.checkliste.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 20) : e.checkliste,
  };
  save();
  return j.einstellungen;
}
