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

function jd() {
  const d = db();
  d.journal ||= { trades: [], einstellungen: {} };
  d.journal.einstellungen = { ...STANDARD, ...d.journal.einstellungen };
  return d.journal;
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
  return { trades: j.trades, einstellungen: j.einstellungen, umrechnung: umrechnung(), paare: PAARE };
}

export const BILD = /^[0-9a-f-]{36}\.(jpg|png)$/;
const bildOrdner = () => path.join(config.dataDir, 'journal-bilder');
const zahl = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const DATUM = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function pruefen(b) {
  const f = (t) => { throw Object.assign(new Error(t), { status: 400 }); };
  const pair = String(b.pair || '').toUpperCase().replace('/', '');
  if (!PAARE.includes(pair)) f('Unbekanntes Paar');
  const richtung = b.richtung === 'short' ? 'short' : b.richtung === 'long' ? 'long' : f('Richtung fehlt');
  const art = b.art === 'backtest' ? 'backtest' : 'live';
  if (!DATUM.test(String(b.eroeffnet || ''))) f('Eröffnung: Datum fehlt');
  const geschlossen = b.geschlossen ? String(b.geschlossen) : null;
  if (geschlossen && !DATUM.test(geschlossen)) f('Schliessung: Datum ungültig');
  const entry = zahl(b.entry), sl = zahl(b.sl), tp = zahl(b.tp), exit = zahl(b.exit);
  const nurR = zahl(b.rManuell) !== null && entry === null && sl === null; // z. B. importierte Backtests nur mit R
  if (!nurR) {
    if (!(entry > 0)) f('Entry fehlt');
    if (!(sl > 0)) f('Stop-Loss fehlt');
    if (richtung === 'long' && !(sl < entry)) f('Long: Stop-Loss muss unter dem Entry liegen');
    if (richtung === 'short' && !(sl > entry)) f('Short: Stop-Loss muss über dem Entry liegen');
    if (tp !== null && !(tp > 0)) f('Take-Profit ungültig');
    if (tp !== null && (richtung === 'long' ? tp <= entry : tp >= entry)) f('Take-Profit liegt auf der falschen Seite');
  } else if (tp !== null || exit !== null) f('Ohne Entry und Stop-Loss bitte nur R eintragen');
  if (exit !== null && !(exit > 0)) f('Ausstieg ungültig');
  const lots = zahl(b.lots), risikoEur = zahl(b.risikoEur), ergebnisEur = zahl(b.ergebnisEur), rManuell = zahl(b.rManuell);
  if (lots !== null && !(lots > 0)) f('Lots ungültig');
  if (risikoEur !== null && !(risikoEur > 0)) f('Risiko in EUR muss positiv sein');
  if (ergebnisEur !== null && !Number.isFinite(ergebnisEur)) f('Ergebnis ungültig');
  if (rManuell !== null && !Number.isFinite(rManuell)) f('R ungültig');
  const tf = ['3D', 'W', 'M'].includes(b.tf) ? b.tf : null;
  const gefuehl = zahl(b.gefuehl);
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [];
  const fehler = Array.isArray(b.fehler) ? [...new Set(b.fehler.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [];
  const bild = String(b.bild || '').trim().slice(0, 500);
  if (bild && !/^https?:\/\//.test(bild)) f('Screenshot: bitte einen Link (https://…)');
  const bilder = Array.isArray(b.bilder) ? b.bilder.map(String).filter((x) => BILD.test(x)).slice(0, 12) : [];
  const session = /^[\w-]{1,60}$/.test(String(b.session || '')) ? String(b.session) : null;
  return {
    pair, richtung, art, eroeffnet: String(b.eroeffnet), geschlossen,
    entry, sl, tp, exit, lots, risikoEur, ergebnisEur, rManuell,
    tf, gvaLevel: zahl(b.gvaLevel), gefuehl: gefuehl && gefuehl >= 1 && gefuehl <= 5 ? Math.round(gefuehl) : null,
    tags, fehler, notiz: String(b.notiz || '').slice(0, 4000), bild, bilder, session,
    checks: b.checks && typeof b.checks === 'object' ? Object.fromEntries(Object.entries(b.checks).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), !!v])) : {},
  };
}

export function tradeSpeichern(b) {
  const j = jd();
  const t = pruefen(b);
  const jetzt = Date.now();
  if (b.id) {
    const i = j.trades.findIndex((x) => x.id === b.id);
    if (i < 0) throw Object.assign(new Error('Trade nicht gefunden'), { status: 404 });
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
  const j = jd();
  const weg = j.trades.find((t) => t.id === id);
  if (!weg) return false;
  j.trades = j.trades.filter((t) => t.id !== id);
  save();
  for (const b of weg.bilder || []) { try { fs.unlinkSync(path.join(bildOrdner(), b)); } catch {} }
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
