// Sonos im Heimnetz steuern (TV-Tab «Musik»). Die Zentrale läuft im Host-Netz und findet die Boxen per SSDP.
// Spotify läuft dabei über das Sonos-Konto: gestartet wird, was in der Sonos-App als Favorit gespeichert ist
// oder schon in der Warteschlange liegt. Gesteuert wird immer der Koordinator der Gruppe.
import sonosPaket from 'sonos';
import { db, save } from './store.mjs';

const { Sonos, AsyncDeviceDiscovery } = sonosPaket;

let gruppenCache = null; // { zeit, liste }
let suche = null;

const fehler = (text, status = 409) => Object.assign(new Error(text), { status });

async function gruppenLaden() {
  // SONOS_IP in .env: feste Adresse einer Box, falls die automatische Suche im Netz nichts findet.
  const feste = String(process.env.SONOS_IP || '').trim();
  const einstieg = feste ? [new Sonos(feste)] : await new AsyncDeviceDiscovery().discoverMultiple({ timeout: 3000 }).catch(() => []);
  for (const d of einstieg) {
    try {
      const gruppen = await d.getAllGroups();
      const liste = gruppen
        .filter((g) => g.host)
        .map((g) => ({
          id: g.Coordinator,
          name: g.Name,
          host: g.host,
          port: g.port || 1400,
          zimmer: (g.ZoneGroupMember || []).map((m) => m.ZoneName),
        }));
      if (liste.length) return liste;
    } catch {}
  }
  return [];
}

export async function sonosRaeume(frisch = false) {
  if (!frisch && gruppenCache && Date.now() - gruppenCache.zeit < 30_000) return gruppenCache.liste;
  suche ||= gruppenLaden().finally(() => { suche = null; });
  const liste = await suche;
  if (liste.length || !gruppenCache) gruppenCache = { zeit: Date.now(), liste };
  return gruppenCache.liste;
}

function gewaehlt(liste) {
  const id = db().sonosRaum;
  return liste.find((g) => g.id === id) || liste[0] || null;
}

const geraet = (g) => new Sonos(g.host, g.port);

async function raum(id) {
  const liste = await sonosRaeume();
  if (!liste.length) throw fehler('Keine Sonos-Box im Netz gefunden');
  const g = (id && liste.find((x) => x.id === id)) || gewaehlt(liste);
  return { g, d: geraet(g), liste };
}

export async function sonosRaumWaehlen(id) {
  const liste = await sonosRaeume();
  if (!liste.some((g) => g.id === id)) throw fehler('Raum unbekannt', 404);
  db().sonosRaum = id;
  save();
  return { ok: true };
}

// Alles für den Bildschirm «Musik».
export async function sonosStatus() {
  let liste;
  try { liste = await sonosRaeume(); } catch { liste = []; }
  if (!liste.length) return { gefunden: false, raeume: [] };
  const g = gewaehlt(liste);
  const d = geraet(g);
  const [zustand, lied, laut, stumm, warteschlange] = await Promise.all([
    d.getCurrentState().catch(() => null),
    d.currentTrack().catch(() => null),
    d.getVolume().catch(() => null),
    d.getMuted().catch(() => null),
    queueLesen(d),
  ]);
  const art = lied?.albumArtURI ? (String(lied.albumArtURI).startsWith('http') ? lied.albumArtURI : `http://${g.host}:${g.port}${lied.albumArtURI}`) : null;
  return {
    gefunden: true,
    raeume: liste.map((x) => ({ id: x.id, name: x.name, aktiv: x.id === g.id })),
    raum: g.name,
    zustand, // playing | paused | stopped | transitioning
    lied: lied?.title ? { titel: lied.title, kuenstler: lied.artist || '', album: lied.album || '', position: lied.position || 0, dauer: lied.duration || 0 } : null,
    cover: art,
    lautstaerke: laut,
    stumm: !!stumm,
    warteschlange,
  };
}

async function queueLesen(d) {
  try {
    const r = await d.contentDirectoryService().GetResult({ ObjectID: 'Q:0', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: '0', RequestedCount: '8', SortCriteria: '' });
    return (r?.items || []).map((i) => ({ titel: i.title || '', kuenstler: i.artist || '' })).filter((i) => i.titel);
  } catch {
    return [];
  }
}

export async function sonosFavoriten() {
  const { d } = await raum();
  const r = await d.getFavorites();
  return (r?.items || []).slice(0, 20).map((f, index) => ({ index, titel: f.title || '' })).filter((f) => f.titel);
}

export async function sonosFavoritSpielen(index) {
  const { d } = await raum();
  const r = await d.getFavorites();
  const f = (r?.items || [])[Number(index)];
  if (!f?.uri) throw fehler('Favorit nicht gefunden', 404);
  await d.setAVTransportURI({ uri: f.uri, metadata: f.metadata });
  await d.play();
  return { ok: true };
}

const AKTIONEN = new Set(['spielen', 'pause', 'umschalten', 'weiter', 'zurueck', 'stumm']);

export async function sonosAktion(aktion, wert) {
  const { d } = await raum();
  if (!AKTIONEN.has(aktion) && aktion !== 'lautstaerke') throw fehler('Unbekannte Aktion', 400);
  if (aktion === 'spielen') await d.play();
  else if (aktion === 'pause') await d.pause();
  else if (aktion === 'umschalten') await d.togglePlayback();
  else if (aktion === 'weiter') await d.next();
  else if (aktion === 'zurueck') await d.previous();
  else if (aktion === 'stumm') await d.setMuted(!(await d.getMuted()));
  else if (aktion === 'lautstaerke') {
    const v = Math.max(0, Math.min(100, Math.round(Number(wert))));
    if (!Number.isFinite(v)) throw fehler('Lautstärke ungültig', 400);
    await d.setVolume(v);
  }
  return { ok: true };
}

// Relative Änderung (für die Fernbedienung: +5 / −5).
export async function sonosLauter(delta) {
  const { d } = await raum();
  const jetzt = Number(await d.getVolume());
  const neu = Math.max(0, Math.min(100, jetzt + Math.round(Number(delta) || 0)));
  await d.setVolume(neu);
  return { lautstaerke: neu };
}
