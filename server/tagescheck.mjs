// Tages-Check: kurze Zusammenfassung aufs Handy (Standard 8, 13 und 19 Uhr) –
// «Alles gut» oder die Probleme, dazu was seit der letzten Meldung passiert ist.
//
// Neue Prüfungen (Trading, Garmin, …) einhängen mit registrierePruefung():
//   registrierePruefung('trading', async (snap) => [{ stufe: 'warnung', text: 'Prop-Firm: Tagesverlust bei 80 %' }]);
// Rückgabe: Liste von { stufe: 'fehler' | 'warnung' | 'info' | 'ok', text }.
//   fehler/warnung = Problem (Check wird «nicht alles gut»), info = nur eine Zeile, ok = zählt als Hinweis «alles gut».
import { db, save } from './store.mjs';
import { nachrichtSenden, telegramBereit } from './ereignisse.mjs';
import { uhrzeit } from './util.mjs';

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

// ---------- Text bauen ----------
export async function tagescheckBauen(s, { seit, zeit, manuell = false } = {}) {
  const alle = eingebaut(s);
  for (const [name, fn] of pruefungen) {
    try {
      const x = await fn(s);
      if (Array.isArray(x)) alle.push(...x.filter((e) => e && e.text));
    } catch (e) {
      console.error(`[tagescheck:${name}]`, e.message);
    }
  }

  const fehler = alle.filter((x) => x.stufe === 'fehler');
  const warnungen = alle.filter((x) => x.stufe === 'warnung');
  const infos = alle.filter((x) => x.stufe === 'info');
  const probleme = [...fehler, ...warnungen];

  const zeilen = [];
  if (!probleme.length) zeilen.push('✅ Alles gut');
  else zeilen.push(`${fehler.length ? '🔴' : '🟠'} ${probleme.length} ${probleme.length === 1 ? 'Problem' : 'Probleme'}`);
  for (const p of probleme) zeilen.push(`• ${p.text}`);

  const werte = [];
  if (s.pi?.temp != null) werte.push(`Pi ${Math.round(s.pi.temp)} °C`);
  if (s.moebel?.temp != null) werte.push(`Möbel ${s.moebel.temp.toFixed(1)} °C`);
  const evo = (s.laufwerke || []).filter((l) => l.gross > 0).map((l) => Math.round((l.benutzt / l.gross) * 100));
  if (evo.length) werte.push(`Platz max. ${Math.max(...evo)} % belegt`);
  if (s.backup?.letzte?.ok) werte.push(`Backup ${zeitFormat(s.backup.letzte.zeit)} ok`);
  if (werte.length) zeilen.push('', werte.join(' · '));
  for (const i of infos) zeilen.push(i.text);

  // Neu seit der letzten Meldung (Ereignisse der Zentrale)
  const neu = (db().ereignisse || []).filter((e) => e.t > seit && ['fehler', 'warnung', 'ok', 'film', 'gast'].includes(e.art));
  if (neu.length) {
    const zaehl = (a) => neu.filter((e) => e.art === a).length;
    const teile = [zaehl('fehler') && `${zaehl('fehler')} ${zaehl('fehler') === 1 ? 'Fehler' : 'Fehler'}`, zaehl('warnung') && `${zaehl('warnung')} ${zaehl('warnung') === 1 ? 'Warnung' : 'Warnungen'}`, zaehl('ok') && `${zaehl('ok')} wieder ok`, zaehl('film') && `${zaehl('film')} ${zaehl('film') === 1 ? 'Film' : 'Filme'}`, zaehl('gast') && `${zaehl('gast')} ${zaehl('gast') === 1 ? 'Gast' : 'Gäste'}`].filter(Boolean);
    zeilen.push('', `Neu seit ${seit ? zeitFormat(seit) : 'dem letzten Check'}: ${teile.join(', ')}`);
    for (const e of neu.slice(0, 4)) zeilen.push(`• ${zeitFormat(e.t)} ${e.text.length > 90 ? e.text.slice(0, 87) + '…' : e.text}`);
    if (neu.length > 4) zeilen.push(`… und ${neu.length - 4} weitere`);
  } else if (!manuell) {
    zeilen.push('', 'Nichts Neues seit dem letzten Check');
  }

  return {
    titel: titelFuer(zeit, manuell),
    text: zeilen.join('\n'),
    art: fehler.length ? 'fehler' : warnungen.length ? 'warnung' : 'ok',
    probleme: probleme.length,
  };
}

// ---------- Senden ----------
export async function tagescheckSenden(snap, { zeit = null, manuell = false } = {}) {
  if (!telegramBereit()) return { ok: false, grund: 'Kein Kanal eingerichtet (NTFY_URL/NTFY_TOKEN in .env)' };
  const d = db();
  const seit = d.letzterCheck || Date.now() - 8 * 3600_000;
  const c = await tagescheckBauen(snap, { seit, zeit, manuell });
  const ok = await nachrichtSenden(c.text, c.art, c.titel);
  if (ok) {
    d.letzterCheck = Date.now();
    save();
  }
  return { ok, grund: ok ? null : 'Senden fehlgeschlagen', vorschau: c.text };
}

export const checkZeiten = () => {
  const z = db().einstellungen.checkZeiten;
  return Array.isArray(z) && z.length ? z : STANDARD_ZEITEN;
};
