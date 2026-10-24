// Möbel-Lüfter (4× 12 V) über ein Relais an GPIO 23 / Pin 16.
// Verdrahtung über NC: Relais aus = Lüfter an. Stürzt der Pi ab oder startet neu, laufen die Lüfter also weiter.
// Modi: auto (nach Temperatur, nachts erst bei mehr Wärme), an, aus. Bei Hitze laufen sie immer, egal welcher Modus.
import { execFileSync } from 'node:child_process';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { aufHost } from './util.mjs';
import { ereignis } from './ereignisse.mjs';

const PIN = /^\d+$/.test(config.relais.gpio) ? config.relais.gpio : null;
const MODI = ['auto', 'an', 'aus'];

const z = { vorhanden: PIN ? null : false, an: null, grund: '', seit: null, fehler: null, gesetztUm: 0 };

// Lüfter an/aus → Pegel am Pin. NC: Relais an (dh) = Lüfter aus.
const pegel = (luefterAn) => ((config.relais.nc ? !luefterAn : luefterAn) ? 'dh' : 'dl');

async function schalten(luefterAn) {
  const r = await aufHost('pinctrl', ['set', PIN, 'op', pegel(luefterAn)], { timeout: 5000 });
  if (!r.ok) throw new Error('pinctrl: ' + (r.stderr || 'Fehler').trim().slice(0, 160));
}

function entscheiden({ mt, pt, nacht }) {
  const e = db().einstellungen;
  const modus = MODI.includes(e.luefterModus) ? e.luefterModus : 'auto';
  const warnAb = e.moebelWarnAb ?? 40;
  const anAb = e.luefterAnAb ?? 30;
  const t = (x) => `${x.toFixed(1).replace('.', ',')} °C`;

  // Sicherheit zuerst: zu warm → immer an.
  if (mt !== null && mt >= warnAb) return { an: true, grund: `Schutz: Möbel ${t(mt)} (Warngrenze ${warnAb} °C)` };
  if (pt !== null && pt >= 70) return { an: true, grund: `Schutz: Pi ${t(pt)}` };
  if (modus === 'an') return { an: true, grund: 'von dir eingeschaltet' };
  if (modus === 'aus') return { an: false, grund: 'von dir ausgeschaltet' };

  // Auto
  if (mt === null) return { an: true, grund: 'Auto: kein Temperaturwert – sicherheitshalber an' };
  const grenze = nacht ? anAb + 5 : anAb;
  const vorher = z.an === true;
  const piWarm = pt !== null && (vorher ? pt >= 60 : pt >= 65);
  const moebelWarm = vorher ? mt > grenze - 2 : mt >= grenze;
  const zusatz = nacht ? ' (Nacht)' : '';
  if (moebelWarm) return { an: true, grund: `Auto${zusatz}: Möbel ${t(mt)}, an ab ${grenze} °C` };
  if (piWarm) return { an: true, grund: `Auto${zusatz}: Pi ${t(pt)}` };
  return { an: false, grund: `Auto${zusatz}: Möbel ${t(mt)}, kühl genug (an ab ${grenze} °C)` };
}

// Alle 15 s aus monitor.mjs aufgerufen.
export async function moebelLuefterRegeln({ mt, pt, szeneId }) {
  if (!PIN) return;
  const d = entscheiden({ mt, pt, nacht: szeneId === 'nacht' });
  z.grund = d.grund;
  // Relais war nicht erreichbar → höchstens alle 5 Min neu versuchen.
  if (z.vorhanden === false && z.fehler && Date.now() - z.gesetztUm < 5 * 60_000) return;
  // Nur bei Änderung schalten, sonst alle 10 Min zur Sicherheit erneut setzen.
  if (d.an === z.an && z.vorhanden && Date.now() - z.gesetztUm < 10 * 60_000) return;
  try {
    await schalten(d.an);
    if (z.an !== null && z.an !== d.an && !d.grund.startsWith('von dir')) {
      ereignis(d.grund.startsWith('Schutz') ? 'warnung' : 'info', `Möbel-Lüfter ${d.an ? 'an' : 'aus'} · ${d.grund}`, d.grund.startsWith('Schutz') ? { telegram: true, schluessel: 'luefter-schutz' } : {});
    }
    if (z.an !== d.an) z.seit = Date.now();
    z.an = d.an;
    z.vorhanden = true;
    z.fehler = null;
  } catch (e) {
    if (z.fehler !== e.message) console.warn('[möbel-lüfter]', e.message);
    z.vorhanden = false;
    z.fehler = e.message;
  }
  z.gesetztUm = Date.now();
}

export function moebelLuefterModus(modus) {
  if (!MODI.includes(modus)) {
    const e = new Error('Unbekannter Modus');
    e.status = 400;
    throw e;
  }
  db().einstellungen.luefterModus = modus;
  save();
  z.gesetztUm = 0; // beim nächsten Durchlauf sofort schalten
  ereignis('info', `Möbel-Lüfter: ${modus === 'auto' ? 'Automatik' : modus === 'an' ? 'dauernd an' : 'aus'} (von dir)`);
}

export function moebelLuefterStatus() {
  const e = db().einstellungen;
  return {
    vorhanden: !!PIN && z.vorhanden !== false,
    an: z.an,
    modus: MODI.includes(e.luefterModus) ? e.luefterModus : 'auto',
    grund: z.grund,
    seit: z.seit,
    anAb: e.luefterAnAb ?? 30,
    fehler: z.fehler,
  };
}

// Beim Beenden der Zentrale Lüfter einschalten (Relais loslassen), damit sie nicht aus bleiben.
if (PIN) {
  process.prependListener('SIGTERM', () => {
    try { execFileSync('nsenter', ['-t', '1', '-m', '-u', '-i', '-n', '-p', '--', 'pinctrl', 'set', PIN, 'op', pegel(true)], { timeout: 3000 }); } catch {}
  });
}
