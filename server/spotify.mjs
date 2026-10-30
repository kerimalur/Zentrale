// Spotify für den TV-Tab «Musik»: Playlists anzeigen und auf der Sonos-Box abspielen (Spotify Connect über die Web-API).
// Anmeldung mit PKCE: Es wird nur die Client-ID gebraucht, kein Geheimnis. Der dauerhafte Schlüssel bleibt in /data auf dem Pi.
// Braucht Spotify Premium (sonst erlaubt Spotify keine Steuerung von aussen).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { holen } from './util.mjs';
import { sonosRaeume } from './sonos.mjs';

const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-recently-played', 'playlist-read-private', 'playlist-read-collaborative', 'user-library-read'];
const CLIENT_ID = () => String(process.env.SPOTIFY_CLIENT_ID || '').trim();
export const spotifyRueckUrl = () => process.env.SPOTIFY_REDIRECT_URI || `https://${config.hostName}:8443/api/spotify/zurueck`;
const tokenDatei = () => path.join(config.dataDir, 'spotify.json');
const fehler = (text, status = 409) => Object.assign(new Error(text), { status }); // nie 401: sonst hält der Fernseher sich für ungekoppelt

let tok = null; // { refresh, access, bis }
const offen = new Map(); // state -> { verifier, bis }
const cache = new Map(); // key -> { zeit, daten }

function tokLaden() {
  if (tok) return tok;
  try { tok = JSON.parse(fs.readFileSync(tokenDatei(), 'utf8')); } catch { tok = null; }
  return tok;
}
function tokSpeichern(t) {
  tok = t;
  fs.writeFileSync(tokenDatei(), JSON.stringify(t), { mode: 0o600 });
  try { fs.chmodSync(tokenDatei(), 0o600); } catch {}
}

export const spotifyZustand = () => ({ eingerichtet: !!CLIENT_ID(), verbunden: !!tokLaden()?.refresh, rueckUrl: spotifyRueckUrl() });

// ---------- Anmeldung ----------
export function spotifyAnmeldeUrl() {
  if (!CLIENT_ID()) throw fehler('SPOTIFY_CLIENT_ID fehlt in der .env', 400);
  const verifier = crypto.randomBytes(48).toString('base64url');
  const state = crypto.randomBytes(24).toString('hex');
  const jetzt = Date.now();
  for (const [k, v] of offen) if (v.bis < jetzt) offen.delete(k);
  offen.set(state, { verifier, bis: jetzt + 10 * 60_000 });
  const q = new URLSearchParams({
    client_id: CLIENT_ID(), response_type: 'code', redirect_uri: spotifyRueckUrl(), scope: SCOPES.join(' '), state,
    code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenAnfrage(params) {
  const { res } = await holen('https://accounts.spotify.com/api/token', {
    method: 'POST', timeout: 15_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID(), ...params }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw fehler(j.error_description || j.error || `Spotify HTTP ${res.status}`, 502);
  return j;
}

// Rückkehr von Spotify (ohne Zentrale-Cookie) → geschützt über «state».
export async function spotifyRueckkehr(url) {
  const state = url.searchParams.get('state') || '';
  const e = offen.get(state);
  offen.delete(state);
  if (!e || e.bis < Date.now()) throw fehler('Anmeldung abgelaufen oder ungültig. Bitte in der Zentrale neu starten.', 400);
  if (url.searchParams.get('error')) throw fehler(`Spotify: ${url.searchParams.get('error')}`, 400);
  const j = await tokenAnfrage({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: spotifyRueckUrl(), code_verifier: e.verifier });
  if (!j.refresh_token) throw fehler('Spotify hat keinen dauerhaften Schlüssel geliefert.', 502);
  tokSpeichern({ refresh: j.refresh_token, access: j.access_token, bis: Date.now() + (j.expires_in - 60) * 1000, seit: Date.now() });
  cache.clear();
}

export function spotifyTrennen() {
  tok = null;
  try { fs.unlinkSync(tokenDatei()); } catch {}
  cache.clear();
}

async function accessToken() {
  const t = tokLaden();
  if (!t?.refresh) throw fehler('Spotify ist nicht verbunden');
  if (t.access && t.bis > Date.now()) return t.access;
  const j = await tokenAnfrage({ grant_type: 'refresh_token', refresh_token: t.refresh });
  tokSpeichern({ ...t, access: j.access_token, bis: Date.now() + (j.expires_in - 60) * 1000, refresh: j.refresh_token || t.refresh });
  return tok.access;
}

async function api(method, pfad, body) {
  const t = await accessToken();
  const { res } = await holen(`https://api.spotify.com/v1${pfad}`, {
    method, timeout: 10_000,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch {}
  if (res.status === 401) { tok = { ...tokLaden(), access: null }; throw fehler('Spotify-Zugang abgelaufen – in der Zentrale neu verbinden'); }
  if (res.status === 403) throw fehler(j.error?.message || 'Spotify verweigert den Zugriff (Premium nötig?)');
  if (res.status === 429) throw fehler('Spotify: zu viele Anfragen, kurz warten', 429);
  if (!res.ok) throw fehler(j.error?.message || `Spotify HTTP ${res.status}`, 502);
  return j;
}

async function gecacht(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.zeit < ms) return c.daten;
  const daten = await fn();
  cache.set(key, { zeit: Date.now(), daten });
  return daten;
}

const bild = (liste) => (liste || []).slice().sort((a, b) => (a.width || 0) - (b.width || 0)).find((x) => (x.width || 0) >= 200)?.url || liste?.[0]?.url || null;

// ---------- Inhalte für den Fernseher ----------
export async function spotifyListe() {
  const z = spotifyZustand();
  if (!z.eingerichtet || !z.verbunden) return { ...z, playlists: [], zuletzt: [] };
  const daten = await gecacht('liste', 60_000, async () => {
    const [pl, zu] = await Promise.all([
      api('GET', '/me/playlists?limit=20'),
      api('GET', '/me/player/recently-played?limit=30').catch(() => ({ items: [] })),
    ]);
    const playlists = (pl.items || []).filter(Boolean).map((p) => ({ uri: p.uri, name: p.name, bild: bild(p.images) }));
    // «Zuletzt gehört»: pro Album/Playlist/Künstler nur einmal, mit dem Cover des Titels.
    const gesehen = new Set(playlists.map((p) => p.uri));
    const zuletzt = [];
    for (const i of zu.items || []) {
      const uri = i.context?.uri || i.track?.album?.uri;
      if (!uri || gesehen.has(uri)) continue;
      gesehen.add(uri);
      const album = uri === i.track?.album?.uri || i.context?.type === 'album';
      zuletzt.push({ uri, name: album ? i.track?.album?.name || i.track?.name : i.track?.name, bild: bild(i.track?.album?.images) });
      if (zuletzt.length >= 8) break;
    }
    return { playlists, zuletzt };
  });
  return { ...z, ...daten };
}

// Die Sonos-Box erscheint bei Spotify als Connect-Gerät mit dem Namen der Box.
async function geraetFinden() {
  const j = await api('GET', '/me/player/devices');
  const liste = j.devices || [];
  const wunsch = String(process.env.SPOTIFY_GERAET || '').trim().toLowerCase();
  if (wunsch) {
    const d = liste.find((x) => x.name.toLowerCase() === wunsch);
    if (d) return d;
  }
  let namen = new Set();
  try { namen = new Set((await sonosRaeume()).flatMap((g) => [g.name, ...g.zimmer]).map((n) => String(n).toLowerCase())); } catch {}
  const d = liste.find((x) => namen.has(x.name.toLowerCase())) || liste.find((x) => x.type === 'Speaker');
  if (!d) throw fehler('Sonos nicht in Spotify gefunden – einmal in der Spotify-App auf die Sonos-Box abspielen, dann geht es hier');
  return d;
}

export async function spotifySpielen({ uri, art }) {
  const d = await geraetFinden();
  let body;
  if (art === 'likes') {
    const l = await api('GET', '/me/tracks?limit=50');
    const uris = (l.items || []).map((i) => i.track?.uri).filter(Boolean);
    if (!uris.length) throw fehler('Keine gespeicherten Songs gefunden', 404);
    body = { uris };
  } else {
    const u = String(uri || '');
    if (!/^spotify:(playlist|album|artist|show|track):[A-Za-z0-9]+$/.test(u)) throw fehler('Ungültiger Spotify-Link', 400);
    body = u.startsWith('spotify:track:') ? { uris: [u] } : { context_uri: u };
  }
  await api('PUT', `/me/player/play?device_id=${encodeURIComponent(d.id)}`, body);
  return { ok: true, geraet: d.name };
}
