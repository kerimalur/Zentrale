// Meldungen aufs Handy in zwei Stufen:
//  1) SOFORT: alles Wichtige (Ausfälle, Fehler, Warnungen, Updates der Kernsysteme, neue Folgen/Filme der Favoriten,
//     später Trading) – kommt direkt, über ereignis(..., { telegram: true }) bzw. sofortMelden().
//  2) ZWISCHENBERICHT (Standard 8, 13, 19 Uhr): «Alles okay» + Nebensächliches, das trotzdem interessiert
//     (neue Filme/Folgen, Garmin, offene Updates). Was schon sofort kam, steht hier nicht nochmal.
//
// Neue Prüfungen (Trading, Garmin, …) einhängen mit registrierePruefung():
//   registrierePruefung('trading', async (snap) => [{ stufe: 'warnung', text: 'Prop-Firm: Tagesverlust bei 80 %' }]);
// Rückgabe: Liste von { stufe: 'fehler' | 'warnung' | 'info' | 'ok', text }.
//   fehler/warnung = Problem (Check wird «nicht alles gut»), info = nur eine Zeile, ok = zählt als Hinweis «alles gut».
import { db, save } from './store.mjs';
import { nachrichtSenden, telegramBereit, melden } from './ereignisse.mjs';
import { uhrzeit, tagKey } from './util.mjs';
import { garminDaten } from './collect/garmin.mjs';
import { dauer } from './garminText.mjs';

export const STANDARD_ZEITEN = ['08:00', '13:00', '19:00'];
const GRUPPEN = { '08:00': 'Morgen', '13:00': 'Mittag', '19:00': 'Abend' };

const pruefungen = new Map();
export function registrierePruefung(name, fn) {
  pruefungen.set(name, fn);
}

const zeitFormat = (t) => uhrzeit(t);
const titelFuer = (zeit, manuell) => {
  if (manuell) return 'Zentrale Check';
  const h = Number(String(zeit).slice(0, 2));
  return `Zentrale ${GRUPPEN[zeit] || (h < 11 ? 'Morgen' : h < 17 ? 'Mittag' : 'Abend')}-Check`;
};

// ---------- Eingebaute Prüfungen (aus dem Gesamtstand) ----------
function eingebaut(s) {
  const r = [];

  for (const d of s.dienste || []) {
    if (d.ausGrund) continue; // bewusst ausgeschaltet
    if (d.status === 'gestoert') r.push({ stufe: 'fehler', text: `${d.name} ist gestört` });
    else if (d.status === 'offline') r.push({ stufe: 'fehler', text: `${d.name} ist offline` });
  }

  const v = s.medien?.vpn;
  if (v && !v.ausgeschaltet) {
    if (v.geschuetzt === false) r.push({ stufe: 'fehler', text: 'VPN-Leck: Downloads nutzen die Pi-IP' });
    else if (v.ok === false) r.push({ stufe: 'warnung', text: 'VPN getrennt, Downloads stehen still' });
  }

  if (s.pi) {
    if (s.pi.temp >= 75) r.push({ stufe: 'warnung', text: `Pi ist heiss: ${Math.round(s.pi.temp)} °C` });
    if (s.pi.unterspannung) r.push({ stufe: 'warnung', text: 'Unterspannung erkannt' });
  }

  const m = s.moebel;
  if (m?.vorhanden) {
    if (m.temp === null || m.temp === undefined) r.push({ stufe: 'warnung', text: 'Möbel-Sensor liefert keine Werte' });
    else if (m.temp >= m.warnAb) r.push({ stufe: 'warnung', text: `Möbel warm: ${m.temp.toFixed(1)} °C` });
  }

  for (const l of s.laufwerke || []) {
    if (l.gross > 0 && l.benutzt / l.gross >= 0.9) r.push({ stufe: 'warnung', text: `${l.name} ist zu ${Math.round((l.benutzt / l.gross) * 100)} % voll` });
  }

  const b = s.backup;
  if (b?.eingerichtet) {
    if (b.letzte && !b.letzte.ok) r.push({ stufe: 'fehler', text: `Backup fehlgeschlagen: ${b.letzte.fehler || 'unbekannt'}` });
    else if (b.auto && b.letzte && Date.now() - b.letzte.zeit > 30 * 3600_000) r.push({ stufe: 'warnung', text: 'Letztes Backup ist älter als 30 Std' });
    else if (b.auto && !b.letzte) r.push({ stufe: 'warnung', text: 'Backup ist automatisch an, lief aber noch nie' });
  }

  const sync = (s.sync || []).filter((x) => x.art === 'fehler' || x.art === 'warnung').filter((x) => !/Backup/.test(x.titel));
  for (const x of sync) r.push({ stufe: x.art === 'fehler' ? 'fehler' : 'warnung', text: `${x.titel}: ${x.unter}` });

  const up = s.containerUpdates;
  if (up?.bereit && up.gesamt > 0) r.push({ stufe: 'info', text: `${up.gesamt} Container-${up.gesamt === 1 ? 'Update' : 'Updates'} offen` });

  return r;
}

// ---------- Sofort melden (für neue Module: Trading, Garmin, …) ----------
// sofortMelden('Prop-Firm: Tagesverlust bei 80 %', { art: 'warnung', schluessel: 'prop-verlust' })
export const sofortMelden = (text, { art = 'warnung', schluessel = null } = {}) => melden(text, schluessel || text, art);

// Updates dieser Container sind wichtig genug für eine Sofort-Meldung (Rest: nur im Zwischenbericht).
export const KERN_UPDATES = /nextcloud|vaultwarden|tailscale|authelia|caddy|pihole|pi-hole|gluetun/i;

// ---------- Neue Filme/Folgen ----------
// Erster Abruf: alles als «bekannt» merken (nichts melden). Danach: Favoriten sofort, der Rest in den Zwischenbericht.
export async function neuesAbgleichen(neu) {
  const d = db();
  if (!Array.isArray(neu)) return;
  if (!d.neuGesehen) {
    if (!neu.length) return; // Daten noch nicht geladen → später baselinen, sonst käme alles Alte als «neu»
    d.neuGesehen = neu.map((x) => x.id);
    d.neuOffen = [];
    save();
    return;
  }
  const gesehen = new Set(d.neuGesehen);
  const frisch = neu.filter((x) => x.id && !gesehen.has(x.id));
  if (!frisch.length) return;
  const fav = (d.einstellungen.favoriten || []).map((f) => f.toLowerCase());
  for (const x of frisch) {
    d.neuGesehen.push(x.id);
    const istFavorit = fav.some((f) => String(x.titel || '').toLowerCase().includes(f));
    if (istFavorit) await sofortMelden(`${x.art === 'film' ? '🎬 Neuer Film' : '📺 Neue Folge'}: ${x.titel}`, { art: 'ok', schluessel: 'neu-' + x.id });
    else (d.neuOffen ||= []).push({ titel: x.titel, art: x.art });
  }
  if (d.neuGesehen.length > 300) d.neuGesehen = d.neuGesehen.slice(-300);
  if ((d.neuOffen || []).length > 100) d.neuOffen = d.neuOffen.slice(-100);
  save();
}

// ---------- Zwischenbericht bauen ----------
export async function tagescheckBauen(s, { zeit, manuell = false } = {}) {
  const alle = eingebaut(s);
  for (const [name, fn] of pruefungen) {
    try {
      const x = await fn(s);
      if (Array.isArray(x)) alle.push(...x.filter((e) => e && e.text));
    } catch (e) {
      console.error(`[tagescheck:${name}]`, e.message);
    }
  }

  const probleme = alle.filter((x) => x.stufe === 'fehler' || x.stufe === 'warnung');
  const infos = alle.filter((x) => x.stufe === 'info');
  const fehler = probleme.some((x) => x.stufe === 'fehler');

  // Probleme kamen schon sofort aufs Handy – hier nur der Stand: alles okay oder was noch offen ist.
  const zeilen = [];
  if (!probleme.length) zeilen.push('✅ Alles okay');
  else {
    zeilen.push(`${fehler ? '🔴' : '🟠'} Noch offen (schon gemeldet):`);
    for (const p of probleme.slice(0, 4)) zeilen.push(`• ${p.text}`);
    if (probleme.length > 4) zeilen.push(`(+${probleme.length - 4} weitere)`);
  }

  // Neu & interessant (Filme/Folgen, Garmin, offene Updates …)
  const offen = db().neuOffen || [];
  const neues = [];
  const filme = offen.filter((x) => x.art === 'film').map((x) => x.titel);
  const folgen = offen.filter((x) => x.art !== 'film').map((x) => x.titel);
  const liste = (a, n = 3) => a.slice(0, n).join(', ') + (a.length > n ? ` (+${a.length - n})` : '');
  if (filme.length) neues.push(`🎬 Neue Filme: ${liste(filme)}`);
  if (folgen.length) neues.push(`📺 Neue Folgen: ${liste(folgen)}`);
  for (const i of infos) neues.push(i.text);
  if (neues.length) zeilen.push('', ...neues);

  return {
    titel: titelFuer(zeit, manuell),
    text: zeilen.join('\n'),
    art: probleme.length ? (fehler ? 'fehler' : 'warnung') : 'ok',
    probleme: probleme.length,
  };
}

// ---------- Senden ----------
export async function tagescheckSenden(snap, { zeit = null, manuell = false } = {}) {
  if (!telegramBereit()) return { ok: false, grund: 'Kein Kanal eingerichtet (NTFY_URL/NTFY_TOKEN in .env)' };
  const d = db();
  const c = await tagescheckBauen(snap, { zeit, manuell });
  const ok = await nachrichtSenden(c.text, c.art, c.titel);
  if (ok) {
    d.letzterCheck = Date.now();
    d.neuOffen = []; // im Bericht gezeigt → beim nächsten nicht nochmal
    save();
  }
  return { ok, grund: ok ? null : 'Senden fehlgeschlagen', vorschau: c.text };
}

export const checkZeiten = () => {
  const z = db().einstellungen.checkZeiten;
  return Array.isArray(z) && z.length ? z : STANDARD_ZEITEN;
};

// ---------- Garmin: eine Zeile im Zwischenbericht, Ausfall der Synchronisation sofort ----------
registrierePruefung('garmin', async () => {
  let g;
  try { g = await garminDaten(); } catch { return []; }
  if (!g?.bereit) return [];
  const r = [];
  const teile = [];
  if (g.letzteNacht) teile.push(`😴 ${dauer(g.letzteNacht.dauerS)}${g.letzteNacht.score ? ` (Score ${g.letzteNacht.score})` : ''}`);
  if (g.heute?.schritte != null) teile.push(`🚶 ${g.heute.schritte.toLocaleString('de-CH')} Schritte`);
  if (g.bodyBattery?.jetzt != null) teile.push(`🔋 ${g.bodyBattery.jetzt}`);
  if (teile.length) r.push({ stufe: 'info', text: `Garmin: ${teile.join(' · ')}` });
  // Uhr seit über 2 Tagen nicht synchronisiert → einmal pro Tag sofort melden
  const alter = g.letzterSync ? Date.now() - new Date(g.letzterSync).getTime() : null;
  if (alter !== null && alter > 2 * 86400_000 && db().garminSyncGemeldet !== tagKey()) {
    db().garminSyncGemeldet = tagKey();
    save();
    await sofortMelden(`Garmin: Uhr seit ${Math.floor(alter / 86400_000)} Tagen nicht synchronisiert`, { art: 'warnung', schluessel: 'garmin-sync' });
  }
  return r;
});
