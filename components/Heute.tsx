'use client';
// Tab «Heute»: wichtige Mails, Termine der nächsten 7 Tage, Google-Aufgaben und Mail aufräumen (bewusst klein).
import { useCallback, useEffect, useState } from 'react';
import { holen, senden, kopieren } from '@/lib/api';
import { relativ } from '@/lib/format';
import type { HAbsender, HTermin, HWerbefilter, HeuteZustand } from '@/lib/heute';
import { Icon, Schalter } from './ui';

const tagText = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tag = new Date(d); tag.setHours(0, 0, 0, 0);
  const diff = Math.round((tag.getTime() - heute.getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
};
const uhr = (iso: string) => new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const heuteIso = () => new Date().toLocaleDateString('sv-SE');

export function Heute() {
  const [d, setD] = useState<HeuteZustand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async (frisch = false) => {
    setLaedt(true);
    try { setD(await holen<HeuteZustand>('/api/heute' + (frisch ? '?frisch=1' : ''))); setFehler(null); }
    catch (e) { setFehler((e as Error).message); }
    finally { setLaedt(false); }
  }, []);
  useEffect(() => {
    laden();
    const t = setInterval(() => { if (!document.hidden) laden(); }, 120_000);
    return () => clearInterval(t);
  }, [laden]);

  if (fehler && !d) return <div className="karte fehlerbox">Heute nicht ladbar: {fehler}</div>;
  if (!d) return <div className="karte leise">Lade …</div>;
  if (!d.eingerichtet) return <Einrichten d={d} />;
  if (!d.verbunden || d.abgelaufen) return <Verbinden abgelaufen={!!d.abgelaufen} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="karte in tr-kopf" aria-label="Heute">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="karte-titel" style={{ marginBottom: 2 }}>{new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <div className="leise" style={{ fontSize: 13 }}>Verbunden mit {d.email || 'Google'}</div>
        </div>
        <div className="tr-kopf-rechts">
          <button className="icon-knopf press" onClick={() => laden(true)} aria-label="Neu laden" title="Neu laden" disabled={laedt}><Icon name="neustart" size={18} className={laedt ? 'dreh' : undefined} /></button>
        </div>
      </section>

      <div className="ht-raster">
        <Wichtig d={d} />
        <Termine d={d} neu={() => laden(true)} />
        <Aufgaben d={d} neu={() => laden(true)} />
      </div>

      <Aufraeumen d={d} neu={() => laden()} />

      <div className="leise" style={{ fontSize: 12.5, textAlign: 'center' }}>
        <button className="knopf-klein press" onClick={async () => { await senden('/api/google/trennen'); laden(); }}>Google-Verbindung trennen</button>
      </div>
    </div>
  );
}

function Einrichten({ d }: { d: HeuteZustand }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <section className="karte in" aria-label="Google einrichten">
      <h2 className="karte-titel">Google einrichten</h2>
      <p className="leise" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>
        Für Mail, Kalender und Aufgaben braucht die Zentrale einen eigenen Google-Zugang. Den legst du einmal in der Google Cloud an und trägst
        <code> GOOGLE_CLIENT_ID</code> und <code>GOOGLE_CLIENT_SECRET</code> in die <code>.env</code> ein. Claude führt dich Schritt für Schritt durch.
      </p>
      <div className="nw-feld" style={{ maxWidth: 640 }}>Weiterleitungs-URI (bei Google eintragen)
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={d.rueckUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
          <button className="knopf-klein press" onClick={async () => setKopiert(await kopieren(d.rueckUrl))}><Icon name="kopieren" size={14} /> {kopiert ? 'Kopiert' : 'Kopieren'}</button>
        </div>
      </div>
    </section>
  );
}

function Verbinden({ abgelaufen }: { abgelaufen: boolean }) {
  return (
    <section className="karte in" aria-label="Mit Google verbinden">
      <h2 className="karte-titel">{abgelaufen ? 'Google-Zugang abgelaufen' : 'Mit Google verbinden'}</h2>
      <p className="leise" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 600 }}>
        Die Zentrale bekommt Zugriff auf Gmail (lesen, aufräumen, Filter), Kalender und Google Tasks. Der Schlüssel bleibt nur auf dem Pi.
      </p>
      <a className="knopf-klein press tr-primaer" href="/api/google/start" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Mit Google verbinden</a>
    </section>
  );
}

// ---------- Wichtige Mails ----------
function Wichtig({ d }: { d: HeuteZustand }) {
  const [weg, setWeg] = useState<Set<string>>(new Set());
  async function aktion(id: string, a: 'gelesen' | 'archivieren' | 'loeschen') {
    setWeg((s) => new Set(s).add(id));
    try { await senden('/api/heute/mail', { id, aktion: a }); } catch { setWeg((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }
  const mails = (d.wichtig || []).filter((m) => !weg.has(m.id));
  return (
    <section className="karte in" aria-label="Wichtige Mails">
      <h2 className="karte-titel">Mail <small>ungelesen, ohne Werbung</small></h2>
      {d.wichtigFehler && <div className="fehlerbox" style={{ fontSize: 13 }}>{d.wichtigFehler}</div>}
      {!d.wichtigFehler && mails.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Nichts Ungelesenes. 👌</div>}
      {mails.map((m) => (
        <div key={m.id} className="zeile ht-mail">
          <a className="ht-mail-text" href={`https://mail.google.com/mail/u/0/#inbox/${m.thread}`} target="_blank" rel="noreferrer">
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b className="ht-eine-zeile">{m.von}</b><small className="leise" style={{ whiteSpace: 'nowrap' }}>{relativ(m.zeit)}</small></span>
            <span className="ht-eine-zeile" style={{ fontSize: 13.5 }}>{m.betreff}</span>
            <span className="ht-eine-zeile leise" style={{ fontSize: 12 }}>{m.vorschau}</span>
          </a>
          <div className="ht-mail-knoepfe">
            <button className="icon-knopf press" title="Als gelesen markieren" aria-label="Als gelesen markieren" onClick={() => aktion(m.id, 'gelesen')}><Icon name="ok" size={16} /></button>
            <button className="icon-knopf press" title="Archivieren" aria-label="Archivieren" onClick={() => aktion(m.id, 'archivieren')}><Icon name="ordner" size={16} /></button>
          </div>
        </div>
      ))}
      <a className="leise" style={{ fontSize: 12.5 }} href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer">Gmail öffnen ↗</a>
    </section>
  );
}

// ---------- Termine ----------
function Termine({ d, neu }: { d: HeuteZustand; neu: () => void }) {
  const [form, setForm] = useState(false);
  const gruppen: [string, HTermin[]][] = [];
  for (const t of d.termine || []) {
    const tag = t.start.slice(0, 10);
    const g = gruppen.find((x) => x[0] === tag);
    if (g) g[1].push(t); else gruppen.push([tag, [t]]);
  }
  return (
    <section className="karte in" aria-label="Termine">
      <h2 className="karte-titel">Kalender <small><button className="knopf-klein press" onClick={() => setForm((x) => !x)}>{form ? 'Abbrechen' : 'Neuer Termin'}</button></small></h2>
      {form && <TerminForm fertig={() => { setForm(false); neu(); }} />}
      {d.termineFehler && <div className="fehlerbox" style={{ fontSize: 13 }}>{d.termineFehler}</div>}
      {!d.termineFehler && gruppen.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Keine Termine in den nächsten 7 Tagen.</div>}
      {gruppen.map(([tag, liste]) => (
        <div key={tag} className="ht-tag">
          <h4 className="nw-h" style={{ marginTop: 8 }}>{tagText(tag)}</h4>
          {liste.map((t) => (
            <a key={t.id + t.start} className="ht-termin" href={t.link || undefined} target="_blank" rel="noreferrer">
              <span className="ht-farbe" style={{ background: t.farbe }} />
              <span className="ht-zeit tr-zahl">{t.ganztaegig ? 'ganzer Tag' : uhr(t.start)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="ht-eine-zeile" style={{ display: 'block' }}>{t.titel}</span>
                {t.ort && <small className="leise ht-eine-zeile" style={{ display: 'block' }}>{t.ort}</small>}
              </span>
            </a>
          ))}
        </div>
      ))}
    </section>
  );
}

function TerminForm({ fertig }: { fertig: () => void }) {
  const [titel, setTitel] = useState('');
  const [datum, setDatum] = useState(heuteIso());
  const [von, setVon] = useState('09:00');
  const [bis, setBis] = useState('10:00');
  const [ganz, setGanz] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function speichern() {
    setLaeuft(true); setInfo(null);
    try { await senden('/api/heute/termin', { titel, datum, von, bis, ganztaegig: ganz }); fertig(); }
    catch (e) { setInfo((e as Error).message); setLaeuft(false); }
  }
  return (
    <form className="ht-form" onSubmit={(e) => { e.preventDefault(); speichern(); }}>
      <label className="nw-feld">Titel<input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={200} required /></label>
      <div className="ht-form-zeile">
        <label className="nw-feld">Datum<input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required /></label>
        {!ganz && <label className="nw-feld">Von<input type="time" value={von} onChange={(e) => setVon(e.target.value)} /></label>}
        {!ganz && <label className="nw-feld">Bis<input type="time" value={bis} onChange={(e) => setBis(e.target.value)} /></label>}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}><input type="checkbox" checked={ganz} onChange={(e) => setGanz(e.target.checked)} /> ganzer Tag</label>
      {info && <div className="fehlerbox" style={{ fontSize: 13 }}>{info}</div>}
      <button className="knopf-klein press tr-primaer" type="submit" disabled={laeuft || !titel.trim()}>{laeuft ? 'Speichere …' : 'Eintragen'}</button>
    </form>
  );
}

// ---------- Aufgaben ----------
function Aufgaben({ d, neu }: { d: HeuteZustand; neu: () => void }) {
  const [titel, setTitel] = useState('');
  const [faellig, setFaellig] = useState('');
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<string | null>(null);
  async function hinzufuegen() {
    if (!titel.trim()) return;
    setInfo(null);
    try { await senden('/api/heute/aufgabe', { titel, faellig: faellig || null }); setTitel(''); setFaellig(''); neu(); }
    catch (e) { setInfo((e as Error).message); }
  }
  async function abhaken(id: string) {
    setErledigt((s) => new Set(s).add(id));
    try { await senden('/api/heute/aufgabe/erledigt', { id }); } catch { setErledigt((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }
  const heute = heuteIso();
  const liste = (d.aufgaben || []).filter((a) => !erledigt.has(a.id));
  return (
    <section className="karte in" aria-label="Aufgaben">
      <h2 className="karte-titel">Aufgaben <small>Google Tasks</small></h2>
      <form className="ht-neu" onSubmit={(e) => { e.preventDefault(); hinzufuegen(); }}>
        <input placeholder="Neue Aufgabe …" value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={300} aria-label="Neue Aufgabe" />
        <input type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} aria-label="Fällig am" />
        <button className="knopf-klein press tr-primaer" type="submit" disabled={!titel.trim()}>+</button>
      </form>
      {info && <div className="fehlerbox" style={{ fontSize: 13 }}>{info}</div>}
      {d.aufgabenFehler && <div className="fehlerbox" style={{ fontSize: 13 }}>{d.aufgabenFehler}</div>}
      {!d.aufgabenFehler && liste.length === 0 && <div className="leise" style={{ padding: '8px 0' }}>Alles erledigt.</div>}
      {liste.map((a) => {
        const ueberfaellig = a.faellig && a.faellig < heute;
        return (
          <div key={a.id} className="zeile" style={{ padding: '9px 0' }}>
            <button className="ht-haken press" onClick={() => abhaken(a.id)} aria-label={`${a.titel} erledigt`} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block' }}>{a.titel}</span>
              {a.faellig && <small style={{ color: ueberfaellig ? 'var(--fehler)' : 'var(--muted)' }}>{ueberfaellig ? 'überfällig · ' : ''}{tagText(a.faellig)}</small>}
            </span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- Mail aufräumen ----------
function Aufraeumen({ d, neu }: { d: HeuteZustand; neu: () => void }) {
  const [scan, setScan] = useState(d.scan!);
  const [filter, setFilter] = useState<'alle' | 'werbung'>('werbung');
  useEffect(() => { setScan(d.scan!); }, [d.scan]);
  useEffect(() => {
    if (!scan.laeuft) return;
    const t = setTimeout(async () => { try { setScan(await holen('/api/heute/scan')); } catch {} }, 2000);
    return () => clearTimeout(t);
  }, [scan]);
  async function starten() { try { setScan(await senden('/api/heute/scan')); } catch {} }

  const liste = scan.absender.filter((a) => a.n > 0 || a.regel || a.behalten).filter((a) => filter === 'alle' || a.werbung > 0);
  return (
    <section className="karte in" aria-label="Mail aufräumen">
      <h2 className="karte-titel">Mail aufräumen
        <small><button className="knopf-klein press" onClick={starten} disabled={scan.laeuft}>{scan.laeuft ? `Lese ${scan.fortschritt}/${scan.gesamt || '…'}` : scan.zeit ? 'Neu einlesen' : 'Posteingang einlesen'}</button></small>
      </h2>
      <Werbefilter w={d.werbefilter!} neu={neu} />

      <h4 className="nw-h" style={{ marginTop: 18 }}>Absender im Posteingang</h4>
      {scan.fehler && <div className="fehlerbox" style={{ fontSize: 13 }}>{scan.fehler}</div>}
      {!scan.zeit && !scan.laeuft && <div className="leise" style={{ padding: '6px 0', fontSize: 13.5 }}>Tippe auf «Posteingang einlesen». Die Zentrale gruppiert bis zu 3000 Mails nach Absender, damit du ganze Absender auf einmal aufräumen kannst.</div>}
      {scan.laeuft && <div className="ht-fortschritt"><span style={{ width: `${scan.gesamt ? (scan.fortschritt / scan.gesamt) * 100 : 5}%` }} /></div>}
      {scan.zeit && (
        <>
          <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 320, margin: '6px 0 8px' }}>
            <button aria-pressed={filter === 'werbung'} onClick={() => setFilter('werbung')}>Nur Werbung/Newsletter</button>
            <button aria-pressed={filter === 'alle'} onClick={() => setFilter('alle')}>Alle</button>
          </div>
          <div className="leise" style={{ fontSize: 12.5, marginBottom: 6 }}>Eingelesen {relativ(scan.zeit)} · {scan.gesamt} Mails · {scan.absender.length} Absender</div>
          {liste.length === 0 && <div className="leise" style={{ padding: '6px 0' }}>Hier ist nichts mehr aufzuräumen.</div>}
          {liste.map((a) => <AbsenderZeile key={a.email} a={a} setScan={setScan} />)}
        </>
      )}
    </section>
  );
}

function AbsenderZeile({ a, setScan }: { a: HAbsender; setScan: (s: HeuteZustand['scan'] & object) => void }) {
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [frage, setFrage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  async function tun(aktion: string) {
    if ((aktion === 'loeschen' || aktion === 'immerLoeschen') && frage !== aktion) { setFrage(aktion); return; }
    setFrage(null); setLaeuft(aktion); setInfo(null);
    try {
      const r = await senden<{ anzahl?: number; art?: string; link?: string; an?: string; scan: HeuteZustand['scan'] & object }>('/api/heute/absender', { email: a.email, aktion });
      setScan(r.scan);
      if (r.art === 'link' && r.link) { setLink(r.link); setInfo(`${r.anzahl ?? 0} Mails archiviert. Abmelden geht bei diesem Absender nur auf seiner Seite:`); }
      else if (typeof r.anzahl === 'number') setInfo(`${r.anzahl} Mails ${aktion === 'loeschen' || aktion === 'immerLoeschen' ? 'gelöscht' : 'archiviert'}${r.art === 'einklick' || r.art === 'mail' ? ', abgemeldet' : ''}.`);
    } catch (e) { setInfo((e as Error).message); }
    finally { setLaeuft(null); }
  }
  const knopf = (aktion: string, text: string, gefaehrlich = false) => (
    <button className={`knopf-klein press${gefaehrlich && frage === aktion ? ' ht-gefahr' : ''}`} onClick={() => tun(aktion)} disabled={!!laeuft}>
      {laeuft === aktion ? '…' : frage === aktion ? 'Sicher?' : text}
    </button>
  );
  return (
    <div className="ht-absender">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b className="ht-eine-zeile">{a.name}</b>
          <span className="pille" style={{ background: 'var(--bg)' }}>{a.n} Mails</span>
          {a.ungelesen > 0 && <span className="leise" style={{ fontSize: 12 }}>{a.ungelesen} ungelesen</span>}
          {a.behalten && <span className="pille tr-pille-an">immer behalten</span>}
          {a.regel && <span className="pille" style={{ background: '#fbebeb', color: 'var(--fehler)' }}>Regel: {a.regel === 'loeschen' ? 'immer löschen' : 'immer archivieren'}</span>}
        </div>
        <div className="leise ht-eine-zeile" style={{ fontSize: 12 }}>{a.email} · {a.betreff}</div>
        {info && <div className="leise" style={{ fontSize: 12.5, marginTop: 4 }}>{info} {link && <a href={link} target="_blank" rel="noreferrer noopener">Abmeldeseite öffnen ↗</a>}</div>}
      </div>
      <div className="ht-absender-knoepfe">
        {a.abmelden && !a.regel && knopf('abmelden', 'Abmelden')}
        {a.n > 0 && knopf('archivieren', 'Archivieren')}
        {a.n > 0 && knopf('loeschen', 'Löschen', true)}
        {!a.regel ? knopf('immerWeg', 'Immer archivieren') : knopf('regelWeg', 'Regel aufheben')}
        {!a.regel && knopf('immerLoeschen', 'Immer löschen', true)}
        {a.behalten ? knopf('nichtBehalten', 'Nicht mehr schützen') : knopf('behalten', 'Behalten')}
      </div>
    </div>
  );
}

function Werbefilter({ w, neu }: { w: HWerbefilter; neu: () => void }) {
  const [an, setAn] = useState(w.an);
  const [aktion, setAktion] = useState(w.aktion);
  const [absender, setAbsender] = useState(w.absenderAusnahmen.join(', '));
  const [woerter, setWoerter] = useState(w.woerterAusnahmen.join(', '));
  const [bestehende, setBestehende] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const teile = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  async function speichern() {
    setLaeuft(true); setInfo(null);
    try {
      const r = await senden<{ anzahl: number }>('/api/heute/werbefilter', { an, aktion, absenderAusnahmen: teile(absender), woerterAusnahmen: teile(woerter), bestehende });
      setInfo(an ? `Gmail-Filter aktiv${r.anzahl ? `, ${r.anzahl} bestehende Werbe-Mails ${aktion === 'loeschen' ? 'gelöscht' : 'archiviert'}` : ''}.` : 'Gmail-Filter entfernt.');
      neu();
    } catch (e) { setInfo((e as Error).message); }
    finally { setLaeuft(false); }
  }
  return (
    <div className="ht-werbefilter">
      <Schalter an={an} onClick={() => setAn(!an)} titel="Werbung automatisch wegräumen" unter="Echter Gmail-Filter: wirkt auf allen Geräten, auch wenn der Pi aus ist" />
      {an && (
        <>
          <div className="segment" style={{ gridTemplateColumns: '1fr 1fr', margin: '10px 0' }}>
            <button aria-pressed={aktion === 'archivieren'} onClick={() => setAktion('archivieren')}>Archivieren</button>
            <button aria-pressed={aktion === 'loeschen'} onClick={() => setAktion('loeschen')}>Löschen</button>
          </div>
          <label className="nw-feld">Diese Absender nie anfassen (Domain oder Adresse, mit Komma)
            <input value={absender} onChange={(e) => setAbsender(e.target.value)} placeholder="digitec.ch, galaxus.ch" />
          </label>
          <label className="nw-feld">Mails mit diesen Wörtern im Betreff bleiben immer (Komma)
            <input value={woerter} onChange={(e) => setWoerter(e.target.value)} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}>
            <input type="checkbox" checked={bestehende} onChange={(e) => setBestehende(e.target.checked)} /> bestehende Werbung im Posteingang jetzt auch wegräumen
          </label>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="knopf-klein press tr-primaer" onClick={speichern} disabled={laeuft}>{laeuft ? 'Speichere …' : 'Speichern'}</button>
        {w.aktiv && <span className="pille tr-pille-an">Filter aktiv</span>}
        {info && <span className="leise" style={{ fontSize: 12.5 }}>{info}</span>}
      </div>
      {w.aktiv && <div className="leise tr-zahl" style={{ fontSize: 11.5, marginTop: 8, wordBreak: 'break-word' }}>Gmail-Suche: {w.query}</div>}
    </div>
  );
}
