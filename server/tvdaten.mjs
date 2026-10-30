// Daten für den TV-Tab: Jellyfin (Filme/Serien), Start-Übersicht (Termine, Garmin, Homelab), Bilder-Proxy.
// Alles nur lesend – ausser Szenen und Sonos, die in index.mjs über die vorhandenen Funktionen laufen.
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { holen, holenJson, tagKey } from './util.mjs';
import { heuteZustand } from './google.mjs';
import { garminDaten } from './collect/garmin.mjs';
import { snapshot } from './monitor.mjs';
import { szenenListe } from './szenen.mjs';

const fehler = (text, status = 502) => Object.assign(new Error(text), { status });
const JF = () => `http://127.0.0.1:${config.dienste.find((d) => d.id === 'jellyfin').port}`;
const kopf = () => ({ Authorization: `MediaBrowser Token="${config.jellyfin.apiKey}"` });

async function jf(pfad, timeout = 8000) {
  if (!config.jellyfin.apiKey) throw fehler('JELLYFIN_API_KEY fehlt', 503);
  return holenJson(`${JF()}${pfad}`, { headers: kopf(), timeout });
}

// ---------- Jellyfin-Benutzer (der Konto-Inhaber, dessen Fortschritt gezeigt wird) ----------
let userCache = null;
async function userId() {
  if (userCache) return userCache;
  const gesetzt = process.env.JELLYFIN_TV_USER || '';
  const liste = await jf('/Users');
  const treffer =
    (gesetzt && liste.find((u) => u.Id === gesetzt || String(u.Name).toLowerCase() === gesetzt.toLowerCase())) ||
    liste.find((u) => u.Policy?.IsAdministrator && !u.Policy?.IsDisabled) ||
    liste.find((u) => !u.Policy?.IsDisabled) ||
    liste[0];
  if (!treffer) throw fehler('Kein Jellyfin-Benutzer gefunden', 404);
  userCache = treffer.Id;
  return userCache;
}

const FELDER = 'Overview,Genres,ProductionYear,RunTimeTicks,OfficialRating,MediaStreams,CommunityRating';
const minuten = (ticks) => (ticks ? Math.round(ticks / 600_000_000) : null);

function karte(i) {
  const serie = i.Type === 'Episode';
  const ticks = i.RunTimeTicks || 0;
  const pos = i.UserData?.PlaybackPositionTicks || 0;
  const video = (i.MediaStreams || []).find((s) => s.Type === 'Video');
  const audio = (i.MediaStreams || []).find((s) => s.Type === 'Audio');
  const hoehe = video?.Height || 0;
  const qualitaet = hoehe >= 2000 ? '4K' : hoehe >= 1000 ? 'HD' : hoehe ? 'SD' : null;
  return {
    id: i.Id,
    art: i.Type, // Movie | Series | Episode
    titel: serie ? i.SeriesName || i.Name : i.Name,
    untertitel: serie ? `S${i.ParentIndexNumber ?? '?'} · E${i.IndexNumber ?? '?'} · ${i.Name}` : null,
    jahr: i.ProductionYear || null,
    dauerMin: minuten(ticks),
    restMin: ticks && pos ? Math.max(1, Math.round((ticks - pos) / 600_000_000)) : null,
    fortschritt: ticks && pos ? Math.min(100, Math.round((pos / ticks) * 100)) : 0,
    sprache: audio?.Language ? String(audio.Language).toUpperCase().slice(0, 3) : null,
    qualitaet,
    genres: (i.Genres || []).slice(0, 3),
    bewertung: i.CommunityRating ? Math.round(i.CommunityRating * 10) / 10 : null,
    beschreibung: (i.Overview || '').slice(0, 600),
    bild: i.ImageTags?.Primary ? `/api/tv/bild?id=${i.Id}&art=Primary` : i.SeriesId && i.SeriesPrimaryImageTag ? `/api/tv/bild?id=${i.SeriesId}&art=Primary` : null,
    breit: i.BackdropImageTags?.length ? `/api/tv/bild?id=${i.Id}&art=Backdrop` : i.ParentBackdropItemId ? `/api/tv/bild?id=${i.ParentBackdropItemId}&art=Backdrop` : null,
  };
}

// Filme-Bildschirm und Start-Teaser: weiterschauen, neu, Bibliothek.
export async function filmeUebersicht() {
  const u = await userId();
  const [weiter, neu, filme, serien] = await Promise.all([
    jf(`/Users/${u}/Items/Resume?Limit=12&MediaTypes=Video&Fields=${FELDER}&EnableUserData=true`),
    jf(`/Users/${u}/Items/Latest?Limit=16&Fields=${FELDER}&IncludeItemTypes=Movie,Series`),
    jf(`/Users/${u}/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=60&Fields=${FELDER}&EnableUserData=true`),
    jf(`/Users/${u}/Items?Recursive=true&IncludeItemTypes=Series&SortBy=SortName&SortOrder=Ascending&Limit=60&Fields=${FELDER}&EnableUserData=true`),
  ]);
  return {
    weiter: (weiter.Items || []).map(karte),
    neu: (Array.isArray(neu) ? neu : neu.Items || []).map(karte),
    filme: (filme.Items || []).map(karte),
    serien: (serien.Items || []).map(karte),
  };
}

export async function filmDetail(id) {
  if (!/^[0-9a-f]{32}$/i.test(String(id || ''))) throw fehler('Ungültige ID', 400);
  const u = await userId();
  const i = await jf(`/Users/${u}/Items/${id}?Fields=${FELDER}`);
  return karte(i);
}

// Bilder laufen über die Zentrale, damit der Fernseher nie direkt mit Jellyfin spricht (kein API-Key am Gerät).
export async function bildHolen(id, art) {
  if (!/^[0-9a-f]{32}$/i.test(String(id || ''))) throw fehler('Ungültige ID', 400);
  const typ = art === 'Backdrop' ? 'Backdrop' : 'Primary';
  const breite = typ === 'Backdrop' ? 1280 : 400;
  const { res } = await holen(`${JF()}/Items/${id}/Images/${typ}?maxWidth=${breite}&quality=85`, { headers: kopf(), timeout: 10_000 });
  if (!res.ok) throw fehler('Kein Bild', res.status === 404 ? 404 : 502);
  return { typ: res.headers.get('content-type') || 'image/jpeg', daten: Buffer.from(await res.arrayBuffer()) };
}

// ---------- Start-Übersicht ----------
const heute = () => tagKey();

async function termineHeute() {
  try {
    const z = await heuteZustand();
    if (!z.verbunden) return { verbunden: false, termine: [], aufgaben: 0 };
    const tag = heute();
    const liste = (z.termine || [])
      .filter((t) => String(t.start).slice(0, 10) === tag)
      .map((t) => ({
        titel: t.titel,
        ganztaegig: t.ganztaegig,
        zeit: t.ganztaegig ? null : new Date(t.start).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }),
      }))
      .slice(0, 4);
    const offen = (z.aufgaben || []).filter((a) => !a.faellig || a.faellig <= tag).length;
    return { verbunden: true, termine: liste, aufgaben: offen };
  } catch {
    return { verbunden: false, termine: [], aufgaben: 0 };
  }
}

async function garminKurz() {
  try {
    const g = await garminDaten();
    if (!g?.bereit) return null;
    const n = g.letzteNacht;
    return {
      schlafS: n?.dauerS ?? null,
      schlafScore: n?.score ?? null,
      bodyBattery: g.bodyBattery?.jetzt ?? null,
      schritte: g.heute?.schritte ?? null,
      schritteZiel: g.heute?.schritteZiel ?? null,
    };
  } catch {
    return null;
  }
}

function homelabKurz() {
  try {
    const s = snapshot();
    const dienste = s.dienste || [];
    const probleme = dienste.filter((d) => d.status === 'gestoert' || d.status === 'offline').length;
    return {
      ok: probleme === 0,
      probleme,
      szene: s.szene?.name || null,
      moebelTemp: s.moebel?.vorhanden ? s.moebel.temp : null,
      piTemp: s.pi?.temp ?? null,
      updates: s.containerUpdates?.bereit ? s.containerUpdates.gesamt : (s.pi?.updates ?? null),
      tailscale: !!s.netz?.tailscale?.aktiv,
    };
  } catch {
    return null;
  }
}

// Wetter (optional): nur wenn WETTER_LAT und WETTER_LON gesetzt sind. Open-Meteo braucht keinen Schlüssel.
let wetterCache = null;
async function wetter() {
  const lat = Number(process.env.WETTER_LAT), lon = Number(process.env.WETTER_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !process.env.WETTER_LAT) return null;
  if (wetterCache && Date.now() - wetterCache.zeit < 15 * 60_000) return wetterCache.daten;
  try {
    const r = await holenJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Europe%2FZurich`, { timeout: 5000 });
    const daten = { temp: Math.round(r.current?.temperature_2m), code: r.current?.weather_code ?? null };
    wetterCache = { zeit: Date.now(), daten };
    return daten;
  } catch {
    return wetterCache?.daten || null;
  }
}

export async function startUebersicht() {
  const [kal, garmin, w, filme] = await Promise.all([
    termineHeute(),
    garminKurz(),
    wetter(),
    filmeUebersicht().then((f) => ({ weiter: f.weiter[0] || null, neu: f.neu.slice(0, 4) })).catch((e) => ({ weiter: null, neu: [], fehler: e.message })),
  ]);
  return { zeit: Date.now(), kalender: kal, garmin, homelab: homelabKurz(), wetter: w, filme };
}

// ---------- Steuerung ----------
export function tvSzenen() {
  const s = snapshot();
  return { aktiv: s.szene?.id || null, liste: szenenListe().map((x) => ({ id: x.id, name: x.name })) };
}

// Merkt sich die zuletzt gewählte Seite des Fernsehers (damit er nach dem Neustart dort weitermacht).
export function tvZustandSetzen(wert) {
  db().tvZustand = String(wert || '').slice(0, 40);
  save();
}
