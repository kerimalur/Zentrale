// Garmin-Daten aus der InfluxDB von garmin-grafana (/mnt/daten/garmin-grafana).
// Nur lesen. Die Datenbank ist nur auf 127.0.0.1:8086 des Pi erreichbar.
// Wird nur abgefragt, wenn jemand den Tab «Gesundheit» offen hat (Zwischenspeicher 60 s).
import { config } from '../config.mjs';
import { holen } from '../util.mjs';

const TZ = 'Europe/Zurich';
const tagVon = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ }); // JJJJ-MM-TT in Schweizer Zeit
const runden = (x, s = 0) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 10 ** s) / 10 ** s);
const mittel = (a) => { const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

let cache = null;

async function abfragen(statements) {
  const g = config.garmin;
  const url = new URL(`http://127.0.0.1:${g.influxPort}/query`);
  url.searchParams.set('db', g.db);
  url.searchParams.set('epoch', 'ms');
  url.searchParams.set('q', statements.join(';'));
  const headers = {};
  if (g.passwort) headers.Authorization = 'Basic ' + Buffer.from(`${g.user}:${g.passwort}`).toString('base64');
  let res;
  try {
    ({ res } = await holen(url.toString(), { timeout: 10_000, headers }));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Garmin-Datenbank antwortet nicht' : `Garmin-Datenbank nicht erreichbar (Port ${g.influxPort} auf 127.0.0.1 freigegeben?)`);
  }
  if (res.status === 401) throw new Error('Garmin-Datenbank: Anmeldung abgelehnt (GARMIN_INFLUX_PASSWORD prüfen)');
  if (!res.ok) throw new Error(`Garmin-Datenbank: HTTP ${res.status}`);
  const j = await res.json();
  // Jede Abfrage → Liste von Zeilen-Objekten { time, feld: wert, … }
  return (j.results || []).map((r) => {
    if (r.error) return [];
    const s = r.series?.[0];
    if (!s) return [];
    return s.values.map((v) => Object.fromEntries(s.columns.map((c, i) => [c, v[i]])));
  });
}

function hrvStatus(letzte, vorher) {
  if (letzte === null || vorher === null) return { stufe: 'unbekannt', text: 'noch zu wenig Daten' };
  const r = letzte / vorher;
  if (r < 0.88) return { stufe: 'tief', text: 'unter deinem Schnitt' };
  if (r > 1.12) return { stufe: 'hoch', text: 'über deinem Schnitt' };
  return { stufe: 'normal', text: 'im Schnitt' };
}

export async function garminDaten({ frisch = false } = {}) {
  if (cache && !frisch && Date.now() - cache.zeit < 60_000) return cache.daten;
  const daten = await laden();
  cache = { zeit: Date.now(), daten };
  return daten;
}

async function laden() {
  const [sync, bbJetzt, bbVerlauf, hrVerlauf, stressVerlauf, schlafRoh, tageRoh, aktivRoh, vo2, fitAlter] = await abfragen([
    'SELECT last("Device_Name") AS geraet FROM "DeviceSync"',
    'SELECT last("BodyBatteryLevel") AS bb FROM "BodyBatteryIntraday"',
    'SELECT mean("BodyBatteryLevel") AS v FROM "BodyBatteryIntraday" WHERE time > now() - 24h GROUP BY time(15m) fill(none)',
    'SELECT mean("HeartRate") AS v FROM "HeartRateIntraday" WHERE time > now() - 24h GROUP BY time(15m) fill(none)',
    'SELECT mean("stressLevel") AS v FROM "StressIntraday" WHERE time > now() - 24h AND "stressLevel" >= 0 GROUP BY time(15m) fill(none)',
    'SELECT "sleepTimeSeconds","deepSleepSeconds","lightSleepSeconds","remSleepSeconds","awakeSleepSeconds","sleepScore","avgOvernightHrv","restingHeartRate","bodyBatteryChange","awakeCount","averageRespirationValue","averageSpO2Value" FROM "SleepSummary" WHERE time > now() - 65d',
    'SELECT "totalSteps","activeKilocalories","totalDistanceMeters","restingHeartRate","moderateIntensityMinutes","vigorousIntensityMinutes","floorsAscended","bodyBatteryChargedValue","bodyBatteryDrainedValue","bodyBatteryHighestValue","bodyBatteryLowestValue","stressPercentage","highStressDuration" FROM "DailyStats" WHERE time > now() - 65d',
    'SELECT "activityName","activityType","elapsedDuration","distance","averageHR","maxHR","calories","aerobicTrainingEffect","activityTrainingLoad" FROM "ActivitySummary" WHERE "activityName" != \'END\' AND time > now() - 180d ORDER BY time DESC LIMIT 8',
    'SELECT last("VO2_max_value") AS v FROM "VO2_Max"',
    'SELECT last("fitnessAge") AS fa, last("chronologicalAge") AS ca FROM "FitnessAge"',
  ]);

  if (!sync.length && !schlafRoh.length && !tageRoh.length) {
    return { bereit: false, grund: 'Noch keine Garmin-Daten in der Datenbank' };
  }

  // ---------- Schlaf: ein Eintrag pro Aufwach-Tag ----------
  const schlafMap = new Map();
  for (const s of schlafRoh) {
    if (!s.sleepTimeSeconds) continue;
    const imBett = (s.deepSleepSeconds || 0) + (s.lightSleepSeconds || 0) + (s.remSleepSeconds || 0) + (s.awakeSleepSeconds || 0);
    schlafMap.set(tagVon(s.time), {
      tag: tagVon(s.time),
      ende: s.time,
      start: s.time - (imBett || s.sleepTimeSeconds) * 1000,
      dauerS: s.sleepTimeSeconds,
      tiefS: s.deepSleepSeconds || 0,
      leichtS: s.lightSleepSeconds || 0,
      remS: s.remSleepSeconds || 0,
      wachS: s.awakeSleepSeconds || 0,
      score: runden(s.sleepScore),
      hrv: runden(s.avgOvernightHrv),
      ruhepuls: runden(s.restingHeartRate),
      bbPlus: runden(s.bodyBatteryChange),
      aufgewacht: runden(s.awakeCount),
      atmung: runden(s.averageRespirationValue, 1),
      spo2: runden(s.averageSpO2Value),
    });
  }
  const schlaf = [...schlafMap.values()].sort((a, b) => a.ende - b.ende);
  const letzteNacht = schlaf.at(-1) || null;

  // ---------- Tageswerte ----------
  const tageMap = new Map();
  for (const t of tageRoh) {
    tageMap.set(tagVon(t.time), {
      tag: tagVon(t.time),
      schritte: runden(t.totalSteps),
      kcalAktiv: runden(t.activeKilocalories),
      distanzM: runden(t.totalDistanceMeters),
      ruhepuls: runden(t.restingHeartRate),
      intensitaet: (t.moderateIntensityMinutes || 0) + 2 * (t.vigorousIntensityMinutes || 0), // Garmin zählt intensive Minuten doppelt
      stockwerke: runden(t.floorsAscended),
      bbGeladen: runden(t.bodyBatteryChargedValue),
      bbVerbraucht: runden(t.bodyBatteryDrainedValue),
      bbMax: runden(t.bodyBatteryHighestValue),
      bbMin: runden(t.bodyBatteryLowestValue),
      stressProzent: runden(t.stressPercentage),
    });
  }
  const tage = [...tageMap.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  const heuteTag = tagVon(Date.now());
  const heute = tageMap.get(heuteTag) || null;

  // Intensitätsminuten dieser Woche (ab Montag)
  const wt = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const montag = new Date(wt); montag.setDate(wt.getDate() - ((wt.getDay() + 6) % 7));
  const montagTag = `${montag.getFullYear()}-${String(montag.getMonth() + 1).padStart(2, '0')}-${String(montag.getDate()).padStart(2, '0')}`;
  const wocheIntensitaet = tage.filter((t) => t.tag >= montagTag).reduce((s, t) => s + (t.intensitaet || 0), 0);

  // ---------- HRV und Ruhepuls mit Vergleich ----------
  const hrvWerte = schlaf.map((s) => s.hrv);
  const hrvLetzte = letzteNacht?.hrv ?? null;
  const hrv7 = mittel(hrvWerte.slice(-8, -1));
  const ruhepulsWerte = tage.map((t) => t.ruhepuls);
  const ruhepulsJetzt = heute?.ruhepuls ?? letzteNacht?.ruhepuls ?? ruhepulsWerte.filter((x) => x !== null).at(-1) ?? null;
  const ruhepuls30 = mittel(ruhepulsWerte.slice(0, -1));

  // ---------- Verläufe der letzten 24 Std ----------
  const reihe = (rows) => rows.map((r) => ({ t: r.time, v: runden(r.v) })).filter((p) => p.v !== null);
  const stress = reihe(stressVerlauf);

  // ---------- Letzte 30 Tage gegen die 30 Tage davor ----------
  const grenze = tagVon(Date.now() - 30 * 86400_000);
  const grenze2 = tagVon(Date.now() - 60 * 86400_000);
  const vergleich = (liste, wert) => {
    const jetzt = mittel(liste.filter((x) => x.tag > grenze).map(wert));
    const vorher = mittel(liste.filter((x) => x.tag > grenze2 && x.tag <= grenze).map(wert));
    return { jetzt: jetzt === null ? null : runden(jetzt, 1), vorher: vorher === null ? null : runden(vorher, 1) };
  };
  const vergleich30 = {
    schlaf: vergleich(schlaf, (s) => s.dauerS),
    schlafScore: vergleich(schlaf, (s) => s.score),
    hrv: vergleich(schlaf, (s) => s.hrv),
    ruhepuls: vergleich(tage, (t) => t.ruhepuls),
    schritte: vergleich(tage, (t) => t.schritte),
    stress: vergleich(tage, (t) => t.stressProzent),
  };

  return {
    bereit: true,
    zeit: Date.now(),
    geraet: sync[0]?.geraet || null,
    letzterSync: sync[0]?.time || null,
    grafanaUrl: config.garmin.grafanaUrl || `http://${config.hostName}:${config.garmin.grafanaPort}`,
    bodyBattery: {
      jetzt: runden(bbJetzt[0]?.bb),
      zeit: bbJetzt[0]?.time || null,
      verlauf: reihe(bbVerlauf),
      geladen: heute?.bbGeladen ?? null,
      verbraucht: heute?.bbVerbraucht ?? null,
    },
    puls: { verlauf: reihe(hrVerlauf), ruhe: ruhepulsJetzt, ruhe30: runden(ruhepuls30, 1) },
    stress: { verlauf: stress, schnitt: runden(mittel(stress.map((p) => p.v))) },
    hrv: { letzte: hrvLetzte, schnitt7: runden(hrv7), ...hrvStatus(hrvLetzte, hrv7) },
    letzteNacht,
    heute: heute ? { ...heute, schritteZiel: config.garmin.schritteZiel } : null,
    wocheIntensitaet,
    vergleich30,
    schlaf: schlaf.slice(-30),
    tage: tage.slice(-30),
    aktivitaeten: aktivRoh.map((a) => ({
      zeit: a.time,
      name: a.activityName || '',
      typ: a.activityType || 'other',
      dauerS: runden(a.elapsedDuration),
      distanzM: runden(a.distance),
      pulsSchnitt: runden(a.averageHR),
      pulsMax: runden(a.maxHR),
      kcal: runden(a.calories),
      effekt: runden(a.aerobicTrainingEffect, 1),
      last: runden(a.activityTrainingLoad),
    })),
    vo2max: runden(vo2[0]?.v, 1),
    fitnessAlter: runden(fitAlter[0]?.fa, 1),
    alter: runden(fitAlter[0]?.ca),
  };
}

// ---------- Ganze Historie für die Detailansichten (Zwischenspeicher 15 Min) ----------
let historieCache = null;

export async function garminHistorie({ frisch = false } = {}) {
  if (historieCache && !frisch && Date.now() - historieCache.zeit < 15 * 60_000) return historieCache.daten;
  const [schlafRoh, tageRoh, stressRoh, aktivRoh, vo2Roh] = await abfragen([
    'SELECT "sleepTimeSeconds","deepSleepSeconds","lightSleepSeconds","remSleepSeconds","awakeSleepSeconds","sleepScore","avgOvernightHrv","restingHeartRate","bodyBatteryChange","awakeCount" FROM "SleepSummary"',
    'SELECT "totalSteps","activeKilocalories","totalDistanceMeters","restingHeartRate","moderateIntensityMinutes","vigorousIntensityMinutes","floorsAscended","bodyBatteryChargedValue","bodyBatteryDrainedValue","bodyBatteryHighestValue","bodyBatteryLowestValue","bodyBatteryAtWakeTime","stressPercentage" FROM "DailyStats"',
    `SELECT mean("stressLevel") AS v FROM "StressIntraday" WHERE "stressLevel" >= 0 AND time > now() - 2000d GROUP BY time(1d) fill(none) tz('${TZ}')`,
    'SELECT "activityName","activityType","elapsedDuration","distance","averageHR","calories","aerobicTrainingEffect","activityTrainingLoad" FROM "ActivitySummary" WHERE "activityName" != \'END\'',
    'SELECT "VO2_max_value" AS v FROM "VO2_Max"',
  ]);
  const naechte = new Map();
  for (const s of schlafRoh) {
    if (!s.sleepTimeSeconds) continue;
    const imBett = (s.deepSleepSeconds || 0) + (s.lightSleepSeconds || 0) + (s.remSleepSeconds || 0) + (s.awakeSleepSeconds || 0);
    naechte.set(tagVon(s.time), {
      tag: tagVon(s.time), ende: s.time, start: Math.round(s.time - (imBett || s.sleepTimeSeconds) * 1000),
      dauerS: s.sleepTimeSeconds, tiefS: s.deepSleepSeconds || 0, leichtS: s.lightSleepSeconds || 0, remS: s.remSleepSeconds || 0, wachS: s.awakeSleepSeconds || 0,
      score: runden(s.sleepScore), hrv: runden(s.avgOvernightHrv), ruhepuls: runden(s.restingHeartRate), bbPlus: runden(s.bodyBatteryChange), aufgewacht: runden(s.awakeCount),
    });
  }
  const stressTag = new Map(stressRoh.map((r) => [tagVon(r.time), runden(r.v)]));
  const tage = new Map();
  for (const t of tageRoh) {
    const tag = tagVon(t.time);
    tage.set(tag, {
      tag, schritte: runden(t.totalSteps), kcalAktiv: runden(t.activeKilocalories), distanzM: runden(t.totalDistanceMeters), ruhepuls: runden(t.restingHeartRate),
      intensitaet: (t.moderateIntensityMinutes || 0) + 2 * (t.vigorousIntensityMinutes || 0), stockwerke: runden(t.floorsAscended),
      bbGeladen: runden(t.bodyBatteryChargedValue), bbVerbraucht: runden(t.bodyBatteryDrainedValue), bbMax: runden(t.bodyBatteryHighestValue), bbMin: runden(t.bodyBatteryLowestValue),
      bbWach: runden(t.bodyBatteryAtWakeTime), stressProzent: runden(t.stressPercentage), stress: stressTag.get(tag) ?? null,
    });
  }
  const vo2 = new Map();
  for (const r of vo2Roh) if (r.v) vo2.set(tagVon(r.time), runden(r.v, 1));
  const daten = {
    bereit: true,
    zeit: Date.now(),
    naechte: [...naechte.values()].sort((a, b) => a.ende - b.ende),
    tage: [...tage.values()].sort((a, b) => a.tag.localeCompare(b.tag)),
    aktivitaeten: aktivRoh.map((a) => ({
      zeit: a.time, name: a.activityName || '', typ: a.activityType || 'other', dauerS: runden(a.elapsedDuration), distanzM: runden(a.distance),
      pulsSchnitt: runden(a.averageHR), kcal: runden(a.calories), effekt: runden(a.aerobicTrainingEffect, 1), last: runden(a.activityTrainingLoad),
    })).sort((a, b) => b.zeit - a.zeit),
    vo2: [...vo2.entries()].map(([tag, v]) => ({ tag, v })).sort((a, b) => a.tag.localeCompare(b.tag)),
  };
  historieCache = { zeit: Date.now(), daten };
  return daten;
}
