'use client';
// Einstellungen → Sicherheit: Zwei-Faktor-Anmeldung (Authenticator-App) und Sitzungen.
import { useCallback, useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { holen, senden, kopieren } from '@/lib/api';
import { relativ } from '@/lib/format';

interface Sitzung { id: string; eigene: boolean; art: 'login' | 'geraet' | 'alt'; name: string; geraet: string; ip: string; erstellt: number; zuletzt: number | null; bis: number }
interface SitzungenZustand { anzahl: number; andere: number; liste: Sitzung[] }
interface SicherheitZustand { zweifaktor: { aktiv: boolean; seit: number | null; notfallUebrig: number }; sitzungen: SitzungenZustand }

function Qr({ text }: { text: string }) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return <div className="sh-qr" role="img" aria-label="QR-Code für die Authenticator-App" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}

export function SicherheitKarte() {
  const [d, setD] = useState<SicherheitZustand | null>(null);
  const [neu, setNeu] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [notfall, setNotfall] = useState<string[] | null>(null);
  const [modus, setModus] = useState<null | 'aus' | 'notfall'>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [listeOffen, setListeOffen] = useState(false);

  const laden = useCallback(async () => { try { setD(await holen<SicherheitZustand>('/api/sicherheit')); } catch {} }, []);
  useEffect(() => { laden(); }, [laden]);

  async function los<T>(fn: () => Promise<T>, danach?: (r: T) => void) {
    setLaeuft(true); setInfo(null);
    try { const r = await fn(); danach?.(r); setCode(''); await laden(); }
    catch (e) { setInfo((e as Error).message); }
    finally { setLaeuft(false); }
  }

  if (!d) return null;
  const z = d.zweifaktor;
  return (
    <section className="karte in" aria-label="Sicherheit" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="karte-titel">Sicherheit <small>{z.aktiv ? 'Zwei-Faktor aktiv' : 'nur Passwort'}</small></h2>

      {notfall && (
        <div className="sh-notfall">
          <b>Notfall-Codes – jetzt sichern (in Vaultwarden), sie werden nur einmal angezeigt</b>
          <div className="sh-codes tr-zahl">{notfall.map((c) => <span key={c}>{c}</span>)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="knopf-klein press" onClick={async () => setInfo((await kopieren(notfall.join('\n'))) ? 'Kopiert.' : 'Kopieren ging nicht – bitte abschreiben.')}>Alle kopieren</button>
            <button className="knopf-klein press tr-primaer" onClick={() => setNotfall(null)}>Gesichert</button>
          </div>
        </div>
      )}

      {!z.aktiv && !neu && (
        <>
          <p className="leise" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
            Die Zentrale hat volle Rechte auf dem Pi. Mit Zwei-Faktor brauchst du beim Login zusätzlich einen 6-stelligen Code aus Google Authenticator.
          </p>
          <button className="knopf-klein press tr-primaer" style={{ alignSelf: 'flex-start' }} disabled={laeuft} onClick={() => los(() => senden<{ secret: string; uri: string }>('/api/zweifaktor/start'), setNeu)}>Zwei-Faktor einrichten</button>
        </>
      )}

      {!z.aktiv && neu && (
        <div className="sh-einrichten">
          <Qr text={neu.uri} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              1. Google Authenticator öffnen → <b>+</b> → <b>QR-Code scannen</b>.<br />
              Am Handy selbst? <a href={neu.uri}>Direkt in der App öffnen</a> oder den Schlüssel von Hand eingeben:
            </div>
            <code className="sh-secret">{neu.secret.match(/.{1,4}/g)?.join(' ')}</code>
            <label className="nw-feld" style={{ marginBottom: 0 }}>2. Den angezeigten Code eingeben
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="knopf-klein press tr-primaer" disabled={laeuft || code.length !== 6}
                onClick={() => los(() => senden<{ notfall: string[] }>('/api/zweifaktor/bestaetigen', { code }), (r) => { setNotfall(r.notfall); setNeu(null); })}>Bestätigen und einschalten</button>
              <button className="knopf-klein press" onClick={() => { setNeu(null); setCode(''); }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {z.aktiv && (
        <>
          <div className="leise" style={{ fontSize: 13.5 }}>Aktiv {z.seit ? relativ(z.seit) : ''} · {z.notfallUebrig} von 8 Notfall-Codes übrig</div>
          {!modus && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="knopf-klein press" onClick={() => setModus('notfall')}>Neue Notfall-Codes</button>
              <button className="knopf-klein press" onClick={() => setModus('aus')}>Zwei-Faktor ausschalten</button>
            </div>
          )}
          {modus && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="nw-feld" style={{ marginBottom: 0 }}>Aktueller Code zur Bestätigung
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              <button className={`knopf-klein press ${modus === 'aus' ? 'ht-gefahr' : 'tr-primaer'}`} disabled={laeuft || !code.trim()}
                onClick={() => los(() => senden<{ notfall?: string[] }>(modus === 'aus' ? '/api/zweifaktor/aus' : '/api/zweifaktor/notfall', { code }), (r) => { if (r.notfall) setNotfall(r.notfall); setModus(null); })}>
                {modus === 'aus' ? 'Ausschalten' : 'Neu erzeugen'}
              </button>
              <button className="knopf-klein press" onClick={() => { setModus(null); setCode(''); }}>Abbrechen</button>
            </div>
          )}
        </>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="leise" style={{ fontSize: 13.5, flex: 1 }}>Angemeldet: {d.sitzungen.anzahl} {d.sitzungen.anzahl === 1 ? 'Sitzung' : 'Sitzungen'} · eine Anmeldung gilt 7 Tage</span>
        <button className="knopf-klein press" onClick={() => setListeOffen(!listeOffen)}>{listeOffen ? 'Liste schliessen' : 'Geräte zeigen'}</button>
        {d.sitzungen.andere > 0 && <button className="knopf-klein press" disabled={laeuft} onClick={() => los(() => senden('/api/sitzungen/andere-abmelden'), () => setInfo('Alle anderen Geräte sind abgemeldet.'))}>Alle anderen abmelden</button>}
      </div>
      {listeOffen && (
        <div className="sh-sitzungen">
          {d.sitzungen.liste.map((s) => (
            <div key={s.id} className="sh-sitzung">
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>
                  {s.eigene ? 'Dieses Gerät' : s.name || s.geraet || 'Unbekanntes Gerät'}
                  {s.art === 'geraet' && <span className="pille" style={{ marginLeft: 6 }}>gekoppelt</span>}
                </b>
                <span className="leise" style={{ display: 'block', fontSize: 12.5 }}>
                  {[s.eigene && (s.name || s.geraet), !s.eigene && s.name && s.geraet, s.ip, s.zuletzt ? `zuletzt ${relativ(s.zuletzt)}` : `angemeldet ${relativ(s.erstellt)}`, s.art === 'alt' ? 'ältere Anmeldung ohne Geräteangaben' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              {!s.eigene && (
                <button className="knopf-klein press" disabled={laeuft} onClick={() => los(() => senden('/api/sitzungen/abmelden', { id: s.id }), () => setInfo('Abgemeldet.'))}>Abmelden</button>
              )}
            </div>
          ))}
          <p className="leise" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Jede Anmeldung im Browser oder in der App zählt einzeln, bis sie nach 7 Tagen abläuft oder du dich abmeldest. Die Desktop-App auf dem HP hat früher alle 30 Minuten eine neue Sitzung angelegt – das ist behoben, sie hat jetzt nur noch eine.
          </p>
        </div>
      )}
      {info && <div className="leise" style={{ fontSize: 13 }}>{info}</div>}
    </section>
  );
}
