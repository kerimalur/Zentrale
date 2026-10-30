'use client';
// Einstellungen → Spotify: Verbindung für den TV-Tab «Musik» (Playlists auf der Sonos-Box abspielen).
import { useCallback, useEffect, useState } from 'react';
import { holen, senden, kopieren } from '@/lib/api';

interface SpotifyZustand { eingerichtet: boolean; verbunden: boolean; rueckUrl: string }

export function SpotifyKarte() {
  const [z, setZ] = useState<SpotifyZustand | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try { setZ(await holen<SpotifyZustand>('/api/spotify/status')); } catch (e) { setInfo((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  return (
    <section className="karte in" aria-label="Spotify" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="karte-titel">Spotify <small>{z ? (z.verbunden ? 'verbunden' : z.eingerichtet ? 'nicht verbunden' : 'nicht eingerichtet') : ''}</small></h2>
      {z && !z.eingerichtet && (
        <>
          <p className="leise" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
            Trage in der <b>.env</b> auf dem Pi <b>SPOTIFY_CLIENT_ID=…</b> ein (aus developer.spotify.com/dashboard) und starte die Zentrale neu. Als Redirect URI bei Spotify:
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <code style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{z.rueckUrl}</code>
            <button className="knopf-klein press" onClick={async () => setInfo((await kopieren(z.rueckUrl)) ? 'Kopiert.' : 'Kopieren ging nicht.')}>Kopieren</button>
          </div>
        </>
      )}
      {z && z.eingerichtet && !z.verbunden && (
        <>
          <p className="leise" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
            Danach zeigt der Fernseher deine Playlists und spielt sie auf der Sonos-Box ab. Braucht Spotify Premium.
          </p>
          <a className="knopf-klein press tr-primaer" href="/api/spotify/start" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>Mit Spotify verbinden</a>
        </>
      )}
      {z?.verbunden && (
        <button className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={async () => { await senden('/api/spotify/trennen'); await laden(); }}>Spotify trennen</button>
      )}
      {info && <div role="status" style={{ fontSize: 13.5 }}>{info}</div>}
    </section>
  );
}
