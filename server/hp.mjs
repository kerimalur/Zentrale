// Fernsteuerung des HP von der Zentrale aus.
//
// Der HP kann von aussen nicht erreicht werden (kein offener Port), darum holt die
// Desktop-App die Befehle selbst ab: sie fragt alle paar Sekunden nach und meldet
// dabei ihren Zustand zurück. Ausweisen tut sie sich mit ihrem Geräte-Token.
//
// Entsperren ist bewusst NICHT dabei: wer Zugriff auf die Zentrale hat, soll damit
// nicht am PIN vorbei auf den HP kommen.
import { db, save } from './store.mjs';
import { geraetVonToken } from './geraete.mjs';

const BEFEHLE = ['sperren', 'bildschirmAus', 'bildschirmAn'];
const ALT_MS = 2 * 60_000;      // ab wann die App als «nicht erreichbar» gilt
const BEFEHL_GUELTIG = 60_000;  // ältere Befehle werden verworfen

function zustand() {
  const d = db();
  d.hp ||= { offen: [], zustand: null };
  return d.hp;
}

function fehler(status, text) {
  const e = new Error(text);
  e.status = status;
  return e;
}

// Token aus dem Kopf der Anfrage holen.
export function geraetAusAnfrage(req) {
  const t = String(req.headers['x-geraet-token'] || '').trim();
  if (!t) return null;
  return geraetVonToken(t);
}

// ---------- Von der Zentrale aus ----------

export function befehlSenden(befehl) {
  const b = String(befehl || '');
  if (!BEFEHLE.includes(b)) throw fehler(400, 'Unbekannter Befehl');
  const h = zustand();
  h.offen = (h.offen || []).filter((x) => Date.now() - x.zeit < BEFEHL_GUELTIG);
  h.offen.push({ befehl: b, zeit: Date.now() });
  save();
  return { ok: true, befehl: b };
}

export function hpZustand() {
  const h = zustand();
  const z = h.zustand;
  const frisch = z && Date.now() - z.zeit < ALT_MS;
  return {
    erreichbar: !!frisch,
    gesperrt: frisch ? !!z.gesperrt : null,
    bildschirm: frisch ? (z.bildschirmAus ? 'aus' : 'an') : null,
    version: z?.version || null,
    rechner: z?.rechner || null,
    benutzer: z?.benutzer || null,
    seit: z?.zeit || null,
    offeneBefehle: (h.offen || []).filter((x) => Date.now() - x.zeit < BEFEHL_GUELTIG).map((x) => x.befehl),
  };
}

// ---------- Von der Desktop-App aus ----------

// Die App meldet ihren Zustand und bekommt die offenen Befehle zurück (und leert sie damit).
export function abholen(geraet, meldung = {}) {
  const h = zustand();
  h.zustand = {
    zeit: Date.now(),
    gesperrt: !!meldung.gesperrt,
    bildschirmAus: !!meldung.bildschirmAus,
    version: String(meldung.version || '').slice(0, 20),
    rechner: String(meldung.rechner || geraet?.name || '').slice(0, 60),
    benutzer: String(meldung.benutzer || '').slice(0, 60),
  };
  const jetzt = Date.now();
  const offen = (h.offen || []).filter((x) => jetzt - x.zeit < BEFEHL_GUELTIG);
  h.offen = [];
  save();
  return { ok: true, befehle: offen.map((x) => x.befehl) };
}
