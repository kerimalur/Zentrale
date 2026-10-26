'use client';
// Tab «Fokus»: Zeit auf allen Geräten, Kategorien, Sperren, Geräte koppeln.
import { useCallback, useEffect, useState } from 'react';
import { holen, senden, kopieren } from '@/lib/api';
import { relativ } from '@/lib/format';
import type { FEintrag, FGeraet, FKategorie, FSperre, FokusZustand } from '@/lib/fokus';
import { Icon, Schalter, type IconName } from './ui';
import { Popup } from './NetzBausteine';

const KAT: { id: FKategorie; text: string; farbe: string }[] = [
  { id: 'produktiv', text: 'Produktiv', farbe: 'var(--gruen)' },
  { id: 'neutral', text: 'Neutral', farbe: '#9db4fb' },
  { id: 'ablenkung', text: 'Ablenkung', farbe: 'var(--orange)' },
];
const GICON: Record<FGeraet['art'], IconName> = { android: 'handy', windows: 'pc', linux: 'laptop', browser: 'geraet' };
const ART_TEXT: Record<string, string> = { app: 'App', prog: 'Programm', web: 'Webseite' };

export function dauer(sek: number): string {
  if (sek < 60) return sek > 0 ? '< 1 Min' : '0 Min';
  const h = Math.floor(sek / 3600);
  const m = Math.round((sek % 3600) / 60);
  return h ? `${h} Std ${m} Min` : `${m} Min`;
}

export function Fokus() {
  const [d, setD] = useState<FokusZustand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [koppeln, setKoppeln] = useState(false);
  const [sperrePopup, setSperrePopup] = useState<FSperre | 'neu' | null>(null);
  const [eintrag, setEintrag] = useState<FEintrag | null>(null);
  const [geraet, setGeraet] = useState<FGeraet | null>(null);
  const [diag, setDiag] = useState(false);

  const laden = useCallback(async () => {
    try { setD(await holen<FokusZustand>('/api/fokus' + (tag ? `?tag=${tag}` : ''))); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
  }, [tag]);
  useEffect(() => {
    laden();
    const t = setInterval(() => { if (!document.hidden) laden(); }, 15_000);
    return () => clearInterval(t);
  }, [laden]);

  if (fehler && !d) return <div className="karte fehlerbox">Fokus nicht ladbar: {fehler}</div>;
  if (!d) return <div className="karte leise">Lade …</div>;

  const total = d.gesamt.produktiv + d.gesamt.neutral + d.gesamt.ablenkung;
  const maxStunde = Math.max(1, ...d.stunden);
  const maxTag = Math.max(1, ...d.verlauf.map((v) => v.produktiv + v.neutral + v.ablenkung));
  const istHeute = d.tag === d.heute;
  const tagVerschieben = (delta: number) => {
    const t = new Date(d.tag + 'T12:00:00');
    t.setDate(t.getDate() + delta);
    const neu = t.toLocaleDateString('sv-SE');
    setTag(neu >= d.heute ? null : neu);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in fk-kopf" aria-label="Zeit heute">
        <div className="fk-tag">
          <button className="icon-knopf press" onClick={() => tagVerschieben(-1)} aria-label="Vortag"><Icon name="zurueck" size={18} /></button>
          <div style={{ textAlign: 'center', minWidth: 130 }}>
            <b>{istHeute ? 'Heute' : new Date(d.tag + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
            <div className="leise" style={{ fontSize: 12 }}>{dauer(total)} aktiv</div>
          </div>
          <button className="icon-knopf press" onClick={() => tagVerschieben(1)} disabled={istHeute} aria-label="Folgetag"><Icon name="weiter" size={18} /></button>
        </div>
        <div className="fk-summen">
          {KAT.map((k) => (
            <div key={k.id}><span className="fk-punkt" style={{ background: k.farbe }} /><b>{dauer(d.gesamt[k.id])}</b><small>{k.text}</small></div>
          ))}
        </div>
        <div className="fk-balken" role="img" aria-label="Verteilung der Zeit">
          {total === 0 ? <span className="leer" /> : KAT.map((k) => d.gesamt[k.id] > 0 && <span key={k.id} style={{ width: `${(d.gesamt[k.id] / total) * 100}%`, background: k.farbe }} />)}
        </div>
      </section>

      <section className="karte in" aria-label="Geräte">
        <h2 className="karte-titel">Geräte <small><button className="knopf-klein press" onClick={() => setKoppeln(true)}>Gerät koppeln</button></small></h2>
        {d.geraete.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Noch kein Gerät gekoppelt. Tippe auf «Gerät koppeln» und folge den Schritten.</div>}
        <div className="fk-geraete">
          {d.geraete.map((g) => {
            const s = d.proGeraet[g.id];
            return (
              <button key={g.id} className="press fk-geraet" onClick={() => setGeraet(g)}>
                <span className="geraet-ico"><Icon name={GICON[g.art]} size={22} stroke={1.9} /></span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <b>{g.name}</b>
                  <div className="leise" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.online ? (g.jetzt ? `jetzt: ${g.jetzt.name}` : 'online · inaktiv') : g.zuletzt ? `zuletzt ${relativ(g.zuletzt)}` : 'noch nichts gemeldet'}
                  </div>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <b>{dauer(s?.gesamt || 0)}</b>
                  <div className="fk-mini">{KAT.map((k) => <span key={k.id} style={{ flex: s?.[k.id] || 0, background: k.farbe }} />)}</div>
                </span>
                <span className={`nw-punkt ${g.online ? 'gruen' : 'grau'}`} aria-hidden />
              </button>
            );
          })}
        </div>
      </section>

      <div className="fk-zwei">
        <section className="karte in" aria-label="Tagesverlauf">
          <h2 className="karte-titel">Über den Tag <small>aktive Zeit pro Stunde</small></h2>
          <div className="fk-stunden" role="img" aria-label="Aktive Zeit pro Stunde">
            {d.stunden.map((v, i) => <div key={i} title={`${i}:00 · ${dauer(v)}`}><span style={{ height: `${Math.max(2, (v / maxStunde) * 100)}%` }} /></div>)}
          </div>
          <div className="leise" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>0 Uhr</span><span>12</span><span>24</span></div>
        </section>
        <section className="karte in" aria-label="14 Tage">
          <h2 className="karte-titel">14 Tage</h2>
          <div className="fk-tage" role="img" aria-label="Aktive Zeit der letzten 14 Tage">
            {d.verlauf.map((v) => {
              const t = v.produktiv + v.neutral + v.ablenkung;
              return (
                <button key={v.tag} className="fk-tagbalken" title={`${v.tag} · ${dauer(t)}`} onClick={() => setTag(v.tag >= d.heute ? null : v.tag)} aria-label={`${v.tag}: ${dauer(t)}`}>
                  <span style={{ height: `${(t / maxTag) * 100}%` }}>
                    {KAT.slice().reverse().map((k) => <i key={k.id} style={{ flex: v[k.id], background: k.farbe }} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="leise" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>vor 14 Tagen</span><span>heute</span></div>
        </section>
      </div>

      <section className="karte in" aria-label="Apps und Seiten">
        <h2 className="karte-titel">Apps, Programme, Webseiten <small>Tippen zum Einordnen</small></h2>
        {d.eintraege.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Für diesen Tag liegen keine Daten vor.</div>}
        {d.eintraege.map((e) => {
          const k = KAT.find((x) => x.id === e.kategorie)!;
          return (
            <button key={e.key} className="zeile press nw-zeile" onClick={() => setEintrag(e)}>
              <span className="fk-punkt" style={{ background: k.farbe }} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <b>{e.name}</b> <span className="leise" style={{ fontSize: 12 }}>{ART_TEXT[e.art]}</span>
                <div className="fk-zeilbalken"><span style={{ width: `${(e.sek / d.eintraege[0].sek) * 100}%`, background: k.farbe }} /></div>
              </span>
              <b style={{ fontSize: 14 }}>{dauer(e.sek)}</b>
            </button>
          );
        })}
      </section>

      <section className="karte in" aria-label="Sperren">
        <h2 className="karte-titel">Sperren <small><button className="knopf-klein press" onClick={() => setSperrePopup('neu')}>Neue Sperre</button></small></h2>
        {d.sperren.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Keine Sperren. Du kannst Webseiten (für alle Geräte über Pi-hole), Apps und einzelne Bereiche wie Reels sperren – immer, zu bestimmten Zeiten oder nach einem Tageslimit.</div>}
        {d.sperren.map((s) => (
          <button key={s.id} className="zeile press nw-zeile" onClick={() => setSperrePopup(s)}>
            <span className={`nw-punkt ${s.an ? (s.aktiv ? 'rot' : 'gelb') : 'grau'}`} aria-hidden />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <b>{s.typ === 'bereich' ? d.bereiche[s.wert] : s.wert}</b> <span className="leise" style={{ fontSize: 12 }}>{s.typ === 'domain' ? 'Webseite' : s.typ === 'app' ? 'App' : 'Bereich'}</span>
              <div className="leise" style={{ fontSize: 12 }}>{beschreibung(s)}</div>
            </span>
            <span className={`pille nw-erreich ${!s.an ? 'unbekannt' : s.aktiv ? 'offen' : 'teil'}`}>{!s.an ? 'aus' : s.aktiv ? 'gesperrt' : 'wartet'}</span>
          </button>
        ))}
        <div className="leise" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
          Webseiten sperrt <b>Pi-hole</b> für alle Geräte, die «Websperre» an haben und Tailscale (oder das Heim-WLAN mit Pi-hole als DNS) nutzen.
          {d.pihole.fehler ? <span style={{ color: 'var(--fehler)' }}> Pi-hole-Abgleich fehlgeschlagen: {d.pihole.fehler}</span> : d.pihole.zeit ? <> Abgleich {relativ(d.pihole.zeit)}: {d.pihole.domains} Adressen, {d.pihole.clients} Geräte-Adressen.</> : null}
          {' '}Browser mit «Sicheres DNS» umgehen Pi-hole – dort ist die Erweiterung nötig.
        </div>
      </section>

      {d.diagnose && (
        <section className="karte in" aria-label="Inspektor">
          <h2 className="karte-titel">Inspektor-Ergebnis <small>{d.diagnose.geraet} · {relativ(d.diagnose.zeit)}</small></h2>
          <button className="knopf-klein press" onClick={() => setDiag(true)}>Anzeigen und kopieren</button>
        </section>
      )}
      {diag && d.diagnose && <DiagnosePopup text={d.diagnose.text} onClose={() => setDiag(false)} />}
      {koppeln && <KoppelPopup onClose={() => { setKoppeln(false); laden(); }} />}
      {sperrePopup && <SperrePopup s={sperrePopup === 'neu' ? null : sperrePopup} d={d} onClose={() => { setSperrePopup(null); laden(); }} />}
      {eintrag && <EintragPopup e={eintrag} d={d} onClose={() => { setEintrag(null); laden(); }} onSperre={(wert, typ) => { setEintrag(null); setSperrePopup({ id: '', typ, wert, modus: 'immer', von: '08:00', bis: '18:00', limitMin: 30, geraete: 'alle', an: true, aktiv: false, nutzungMin: null }); }} />}
      {geraet && <GeraetPopup g={geraet} onClose={() => { setGeraet(null); laden(); }} />}
    </div>
  );
}

function beschreibung(s: FSperre): string {
  const w = s.modus === 'immer' ? 'immer' : s.modus === 'zeit' ? `${s.von}–${s.bis} Uhr` : `ab ${s.limitMin} Min pro Tag${s.nutzungMin !== null ? ` (heute ${s.nutzungMin} Min)` : ''}`;
  return w;
}

function EintragPopup({ e, d, onClose, onSperre }: { e: FEintrag; d: FokusZustand; onClose: () => void; onSperre: (wert: string, typ: 'domain' | 'app') => void }) {
  const [laeuft, setLaeuft] = useState(false);
  async function setzen(kategorie: string) {
    setLaeuft(true);
    try { await senden('/api/fokus/kategorie', { key: e.key, kategorie }); onClose(); } catch { setLaeuft(false); }
  }
  return (
    <Popup titel={e.name} unter={`${ART_TEXT[e.art]} · ${dauer(e.sek)}`} onClose={onClose}>
      <h4 className="nw-h">Einordnung</h4>
      <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {KAT.map((k) => <button key={k.id} aria-pressed={e.kategorie === k.id} onClick={() => setzen(k.id)} disabled={laeuft}>{k.text}</button>)}
      </div>
      {e.manuell && <button className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={() => setzen('auto')} disabled={laeuft}>Automatisch einordnen</button>}
      <h4 className="nw-h">Auf diesen Geräten</h4>
      {Object.entries(e.geraete).map(([id, s]) => <div key={id} className="zeile" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{d.geraete.find((g) => g.id === id)?.name || id}</span><b>{dauer(s)}</b></div>)}
      {e.art !== 'prog' && <button className="knopf-akzent press" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => onSperre(e.art === 'web' ? e.name : e.name, e.art === 'web' ? 'domain' : 'app')}>Sperre dafür anlegen</button>}
    </Popup>
  );
}

function GeraetPopup({ g, onClose }: { g: FGeraet; onClose: () => void }) {
  const [name, setName] = useState(g.name);
  const [ws, setWs] = useState(g.websperre);
  const [sicher, setSicher] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function speichern() {
    try { await senden('/api/fokus/geraet', { id: g.id, name, websperre: ws }); onClose(); } catch (e) { setFehler((e as Error).message); }
  }
  async function entfernen() {
    try { await senden('/api/fokus/geraet', { id: g.id }, 'DELETE'); onClose(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <Popup titel={g.name} unter={`${g.art} · ${g.online ? 'online' : 'offline'}${g.version ? ' · Version ' + g.version : ''}`} onClose={onClose}>
      <label className="nw-feld">Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
      <Schalter an={ws} onClick={() => setWs(!ws)} titel="Websperre (Pi-hole)" unter="Webseiten-Sperren gelten für dieses Gerät, solange es den Pi als DNS nutzt." />
      <div className="leise" style={{ fontSize: 12.5 }}>Adressen: {g.ips.length ? g.ips.join(', ') : 'noch keine'} · gekoppelt {relativ(g.erstellt)}</div>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="knopf-akzent press" onClick={speichern}>Speichern</button>
        {!sicher ? <button className="knopf-klein press" onClick={() => setSicher(true)}>Entfernen</button> : <button className="knopf-klein press" style={{ color: 'var(--fehler)' }} onClick={entfernen}>Wirklich entfernen</button>}
      </div>
    </Popup>
  );
}

function SperrePopup({ s, d, onClose }: { s: FSperre | null; d: FokusZustand; onClose: () => void }) {
  const [typ, setTyp] = useState<FSperre['typ']>(s?.typ || 'domain');
  const [wert, setWert] = useState(s?.wert || (s?.typ === 'bereich' ? s.wert : ''));
  const [modus, setModus] = useState<FSperre['modus']>(s?.modus || 'immer');
  const [von, setVon] = useState(s?.von || '08:00');
  const [bis, setBis] = useState(s?.bis || '18:00');
  const [limit, setLimit] = useState(String(s?.limitMin || 30));
  const [an, setAn] = useState(s?.an ?? true);
  const [fehler, setFehler] = useState<string | null>(null);
  const bestehend = !!s?.id;
  async function speichern() {
    try { await senden('/api/fokus/sperre', { id: s?.id || undefined, typ, wert: typ === 'bereich' && !wert ? Object.keys(d.bereiche)[0] : wert, modus, von, bis, limitMin: Number(limit), geraete: s?.geraete || 'alle', an }); onClose(); }
    catch (e) { setFehler((e as Error).message); }
  }
  async function loeschen() {
    try { await senden('/api/fokus/sperre', { id: s!.id }, 'DELETE'); onClose(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <Popup titel={bestehend ? 'Sperre bearbeiten' : 'Neue Sperre'} onClose={onClose}>
      <div className="nw-feld">Was
        <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button aria-pressed={typ === 'domain'} onClick={() => { setTyp('domain'); setWert(''); }}>Webseite</button>
          <button aria-pressed={typ === 'app'} onClick={() => { setTyp('app'); setWert(''); }}>App</button>
          <button aria-pressed={typ === 'bereich'} onClick={() => { setTyp('bereich'); setWert(Object.keys(d.bereiche)[0]); }}>Bereich</button>
        </div>
      </div>
      {typ === 'bereich'
        ? <label className="nw-feld">Bereich (nur Handy)<select value={wert} onChange={(e) => setWert(e.target.value)}>{Object.entries(d.bereiche).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        : <label className="nw-feld">{typ === 'domain' ? 'Adresse (z. B. reddit.com)' : 'App-Name (so wie in der Liste, z. B. Snapchat)'}<input value={wert} onChange={(e) => setWert(e.target.value)} maxLength={80} /></label>}
      <div className="nw-feld">Wann
        <div className="segment" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button aria-pressed={modus === 'immer'} onClick={() => setModus('immer')}>Immer</button>
          <button aria-pressed={modus === 'zeit'} onClick={() => setModus('zeit')}>Zeitfenster</button>
          <button aria-pressed={modus === 'limit'} onClick={() => setModus('limit')}>Tageslimit</button>
        </div>
      </div>
      {modus === 'zeit' && <div className="fk-zeiten"><label className="nw-feld">Von<input type="time" value={von} onChange={(e) => setVon(e.target.value)} /></label><label className="nw-feld">Bis<input type="time" value={bis} onChange={(e) => setBis(e.target.value)} /></label></div>}
      {modus === 'limit' && <label className="nw-feld">Gesperrt, sobald heute so viele Minuten genutzt wurden<input type="number" min={1} max={1440} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>}
      <Schalter an={an} onClick={() => setAn(!an)} titel="Sperre aktiv" />
      {typ === 'app' && <div className="nw-box nw-merke"><b>Hinweis</b><span>App-Sperren setzt die Handy-App um. Auf PC und Laptop wird die App nur gemeldet, nicht beendet.</span></div>}
      {fehler && <div className="fehlerbox">{fehler}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="knopf-akzent press" onClick={speichern}>Speichern</button>
        {bestehend && <button className="knopf-klein press" style={{ color: 'var(--fehler)' }} onClick={loeschen}>Löschen</button>}
      </div>
    </Popup>
  );
}

function KoppelPopup({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<{ code: string; bis: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => { senden<{ code: string; bis: number }>('/api/fokus/koppelcode').then(setCode).catch((e) => setFehler(e.message)); }, []);
  const adresse = typeof location !== 'undefined' ? location.origin : '';
  return (
    <Popup titel="Gerät koppeln" unter="Der Code gilt 10 Minuten und nur einmal." onClose={onClose}>
      {fehler && <div className="fehlerbox">{fehler}</div>}
      {code && (
        <>
          <div className="fk-code" aria-live="polite">{code.code.slice(0, 3)} {code.code.slice(3)}</div>
          <div className="zeile" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            <span className="leise">Adresse der Zentrale</span><b style={{ overflowWrap: 'anywhere' }}>{adresse}</b>
          </div>
          <button className="knopf-klein press" style={{ alignSelf: 'flex-start' }} onClick={async () => { await kopieren(code.code); setKopiert(true); setTimeout(() => setKopiert(false), 1500); }}>{kopiert ? 'Kopiert ✓' : 'Code kopieren'}</button>
          <p className="nw-text">Gib diesen Code und die Adresse im Programm auf dem Gerät ein. Danach erscheint das Gerät hier. Die Schritte pro Gerät (Windows, Laptop, Handy) bekommst du von Claude im Chat.</p>
        </>
      )}
    </Popup>
  );
}

function DiagnosePopup({ text, onClose }: { text: string; onClose: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <Popup titel="Inspektor-Ergebnis" unter="Welche Elemente die App auf dem Bildschirm gesehen hat (* = ausgewählt)" onClose={onClose} breit>
      <button className="knopf-akzent press" style={{ alignSelf: 'flex-start' }} onClick={async () => { await kopieren(text); setKopiert(true); setTimeout(() => setKopiert(false), 1500); }}>{kopiert ? 'Kopiert ✓' : 'Alles kopieren'}</button>
      <textarea readOnly value={text} style={{ width: '100%', minHeight: 300, font: '12px ui-monospace, monospace', padding: 10, borderRadius: 10, border: '1px solid var(--track)', boxSizing: 'border-box' }} />
    </Popup>
  );
}
