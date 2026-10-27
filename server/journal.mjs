// Trading-Journal (von Hand geführt). Speichert Trades und Einstellungen in der Zentrale-Datenbank (data/zentrale.json,
// wird nachts mitgesichert). Alle Auswertungen rechnet die Seite selbst (lib/journal.ts), der Server prüft nur die Eingaben.
import crypto from 'node:crypto';
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
  if (!(entry > 0)) f('Entry fehlt');
  if (!(sl > 0)) f('Stop-Loss fehlt');
  if (richtung === 'long' && !(sl < entry)) f('Long: Stop-Loss muss unter dem Entry liegen');
  if (richtung === 'short' && !(sl > entry)) f('Short: Stop-Loss muss über dem Entry liegen');
  if (tp !== null && !(tp > 0)) f('Take-Profit ungültig');
  if (tp !== null && (richtung === 'long' ? tp <= entry : tp >= entry)) f('Take-Profit liegt auf der falschen Seite');
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
  return {
    pair, richtung, art, eroeffnet: String(b.eroeffnet), geschlossen,
    entry, sl, tp, exit, lots, risikoEur, ergebnisEur, rManuell,
    tf, gvaLevel: zahl(b.gvaLevel), gefuehl: gefuehl && gefuehl >= 1 && gefuehl <= 5 ? Math.round(gefuehl) : null,
    tags, fehler, notiz: String(b.notiz || '').slice(0, 4000), bild,
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
  const vorher = j.trades.length;
  j.trades = j.trades.filter((t) => t.id !== id);
  save();
  return j.trades.length < vorher;
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
