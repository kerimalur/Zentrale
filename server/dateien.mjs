// Datei-Verwaltung für den Finder der Desktop-App: lesen, schreiben, umbenennen,
// verschieben, kopieren, löschen (Papierkorb), hochladen und per Link teilen.
//
// Sicherheit (gleiche Regeln wie explorer.mjs, nur zusätzlich für Schreibzugriffe):
//  - Wurzel muss ein echter Einhängepunkt aus der Laufwerksliste sein
//  - kein "..", kein ".", keine NUL-Zeichen, keine Symlinks irgendwo im Pfad
//  - alles muss auf demselben Laufwerk wie die Wurzel liegen
//  - Geteilte Links laufen ab und geben nur genau eine Datei heraus (read-only)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hostPath } from './config.mjs';
import { db, save } from './store.mjs';

const MAX_EINTRAEGE = 2000;
const MAX_TEXT = 4 * 1024 * 1024;   // 4 MB als Text bearbeitbar
const PAPIERKORB = '.Papierkorb';

export function fehler(status, text) {
  const e = new Error(text);
  e.status = status;
  return e;
}

// ---------- Pfade ----------

function nameOk(name) {
  const n = String(name || '');
  if (!n || n === '.' || n === '..') return false;
  if (n.length > 255) return false;
  if (/[\0/\\]/.test(n)) return false;
  return true;
}

// Prüft Wurzel + relativen Pfad. art: 'ordner' | 'datei' | 'beides' | 'eltern'
// 'eltern' = der Pfad muss noch nicht existieren, aber sein übergeordneter Ordner schon.
export async function aufloesen(laufwerke, wurzel, rel, art = 'beides') {
  const lw = (laufwerke || []).find((l) => l.mount === wurzel);
  if (!lw) throw fehler(400, 'Unbekanntes Laufwerk');
  const teile = String(rel || '/').split('/').filter(Boolean);
  if (teile.some((t) => t === '..' || t === '.' || t.includes('\0'))) throw fehler(400, 'Ungültiger Pfad');

  const wurzelDev = (await fs.promises.stat(hostPath(wurzel))).dev;

  // Alle übergeordneten Teile müssen echte Ordner auf demselben Laufwerk sein.
  const eltern = teile.slice(0, -1);
  let ordner = wurzel;
  for (const t of eltern) {
    ordner = path.posix.join(ordner, t);
    const st = await fs.promises.lstat(hostPath(ordner)).catch(() => null);
    if (!st) throw fehler(404, 'Ordner nicht gefunden: ' + t);
    if (st.isSymbolicLink()) throw fehler(400, 'Verknüpfungen sind gesperrt');
    if (!st.isDirectory()) throw fehler(400, 'Kein Ordner: ' + t);
    if (st.dev !== wurzelDev) throw fehler(400, 'Dieser Ordner liegt auf einem anderen Laufwerk');
  }

  // «eltern»: das letzte Stück darf es noch nicht geben (neue Datei / neuer Ordner).
  if (art === 'eltern') {
    if (!teile.length) throw fehler(400, 'Pfad fehlt');
    const name = teile[teile.length - 1];
    if (!nameOk(name)) throw fehler(400, 'Ungültiger Name');
    return { lw, wurzelDev, ordner, name, absolut: path.posix.join(ordner, name), rel: '/' + teile.join('/') };
  }

  const absolut = teile.length ? path.posix.join(ordner, teile[teile.length - 1]) : wurzel;
  const st = await fs.promises.lstat(hostPath(absolut)).catch(() => null);
  if (!st) throw fehler(404, 'Nicht gefunden');
  if (st.isSymbolicLink()) throw fehler(400, 'Verknüpfungen sind gesperrt');
  if (st.dev !== wurzelDev) throw fehler(400, 'Liegt auf einem anderen Laufwerk');
  if (art === 'ordner' && !st.isDirectory()) throw fehler(400, 'Kein Ordner');
  if (art === 'datei' && !st.isFile()) throw fehler(400, 'Keine Datei');

  return { lw, wurzelDev, absolut, ordner, rel: '/' + teile.join('/'), stat: st };
}

// ---------- Dateityp ----------

const TYPEN = {
  bild: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'],
  pdf: ['.pdf'],
  video: ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'],
  audio: ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.opus', '.aac'],
  text: ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yml', '.yaml', '.ini', '.conf', '.cfg',
         '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.xml', '.sh', '.py', '.env', '.sql', '.toml'],
  archiv: ['.zip', '.tar', '.gz', '.xz', '.7z', '.rar', '.bz2', '.zst'],
};

export function dateiArt(name) {
  const ext = path.extname(String(name)).toLowerCase();
  for (const [art, liste] of Object.entries(TYPEN)) if (liste.includes(ext)) return art;
  return 'anders';
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.zip': 'application/zip',
};
export const mimeVon = (name) => MIME[path.extname(String(name)).toLowerCase()] || 'application/octet-stream';

// ---------- Auflisten ----------

export async function listen(laufwerke, wurzel, rel, { versteckte = false } = {}) {
  const { absolut, wurzelDev, rel: sauber } = await aufloesen(laufwerke, wurzel, rel, 'ordner');
  const dirents = await fs.promises.readdir(hostPath(absolut), { withFileTypes: true });
  const eintraege = [];
  for (const d of dirents) {
    if (!versteckte && d.name.startsWith('.')) continue;
    const st = await fs.promises.lstat(hostPath(path.posix.join(absolut, d.name))).catch(() => null);
    if (!st) continue;
    const typ = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'ordner' : st.isFile() ? 'datei' : 'anders';
    eintraege.push({
      name: d.name,
      typ,
      art: typ === 'datei' ? dateiArt(d.name) : typ,
      groesse: typ === 'datei' ? st.size : null,
      geaendert: Math.round(st.mtimeMs),
      fremdesLaufwerk: typ === 'ordner' && st.dev !== wurzelDev,
    });
  }
  const anzahl = eintraege.length;
  eintraege.sort((a, b) => (a.typ === 'ordner' ? 0 : 1) - (b.typ === 'ordner' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
  return {
    wurzel, pfad: sauber, eintraege: eintraege.slice(0, MAX_EINTRAEGE), anzahl, gekuerzt: anzahl > MAX_EINTRAEGE,
    schreibbar: await schreibbar(absolut),
  };
}

async function schreibbar(absolut) {
  try { await fs.promises.access(hostPath(absolut), fs.constants.W_OK); return true; } catch { return false; }
}

// ---------- Lesen ----------

// Gibt Angaben für das Ausliefern einer Datei zurück (der Server streamt selbst, wegen Range).
export async function dateiInfo(laufwerke, wurzel, rel) {
  const { absolut, stat } = await aufloesen(laufwerke, wurzel, rel, 'datei');
  return {
    host: hostPath(absolut),
    name: path.posix.basename(absolut),
    groesse: stat.size,
    mime: mimeVon(absolut),
    art: dateiArt(absolut),
    geaendert: Math.round(stat.mtimeMs),
  };
}

export async function textLesen(laufwerke, wurzel, rel) {
  const info = await dateiInfo(laufwerke, wurzel, rel);
  if (info.groesse > MAX_TEXT) throw fehler(413, `Zu gross zum Bearbeiten (${Math.round(info.groesse / 1048576)} MB, max. 4 MB)`);
  const inhalt = await fs.promises.readFile(info.host, 'utf8');
  return { name: info.name, inhalt, groesse: info.groesse, geaendert: info.geaendert };
}

// ---------- Schreiben ----------

// Atomar schreiben: erst .tmp daneben, dann umbenennen. So geht bei einem Absturz nichts kaputt.
export async function textSchreiben(laufwerke, wurzel, rel, inhalt) {
  if (typeof inhalt !== 'string') throw fehler(400, 'Inhalt fehlt');
  if (Buffer.byteLength(inhalt) > MAX_TEXT) throw fehler(413, 'Inhalt zu gross (max. 4 MB)');
  const { absolut } = await aufloesen(laufwerke, wurzel, rel, 'datei');
  const ziel = hostPath(absolut);
  const tmp = ziel + '.zentrale-tmp';
  await fs.promises.writeFile(tmp, inhalt, 'utf8');
  await fs.promises.rename(tmp, ziel);
  const st = await fs.promises.stat(ziel);
  return { ok: true, groesse: st.size, geaendert: Math.round(st.mtimeMs) };
}

export async function neueDatei(laufwerke, wurzel, rel, inhalt = '') {
  const { absolut } = await aufloesen(laufwerke, wurzel, rel, 'eltern');
  const ziel = hostPath(absolut);
  if (fs.existsSync(ziel)) throw fehler(409, 'Gibt es schon');
  await fs.promises.writeFile(ziel, String(inhalt), 'utf8');
  return { ok: true, pfad: absolut };
}

export async function neuerOrdner(laufwerke, wurzel, rel) {
  const { absolut } = await aufloesen(laufwerke, wurzel, rel, 'eltern');
  const ziel = hostPath(absolut);
  if (fs.existsSync(ziel)) throw fehler(409, 'Gibt es schon');
  await fs.promises.mkdir(ziel);
  return { ok: true, pfad: absolut };
}

export async function umbenennen(laufwerke, wurzel, rel, neuerName) {
  if (!nameOk(neuerName)) throw fehler(400, 'Ungültiger Name');
  const { absolut } = await aufloesen(laufwerke, wurzel, rel, 'beides');
  const ordner = path.posix.dirname(absolut);
  if (ordner === absolut) throw fehler(400, 'Das Laufwerk selbst kann nicht umbenannt werden');
  const ziel = path.posix.join(ordner, neuerName);
  if (fs.existsSync(hostPath(ziel))) throw fehler(409, 'Name ist schon vergeben');
  await fs.promises.rename(hostPath(absolut), hostPath(ziel));
  return { ok: true, pfad: ziel, name: neuerName };
}

// Freien Namen finden: "Bild.png" -> "Bild 2.png" -> "Bild 3.png"
function freierName(ordnerHost, name) {
  if (!fs.existsSync(path.join(ordnerHost, name))) return name;
  const ext = path.extname(name);
  const basis = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const k = `${basis} ${i}${ext}`;
    if (!fs.existsSync(path.join(ordnerHost, k))) return k;
  }
  throw fehler(409, 'Kein freier Name gefunden');
}

// Verschieben/Kopieren, auch über Laufwerke hinweg (dann kopieren + löschen).
export async function verschieben(laufwerke, quelle, ziel, { kopieren = false } = {}) {
  const q = await aufloesen(laufwerke, quelle.wurzel, quelle.pfad, 'beides');
  const z = await aufloesen(laufwerke, ziel.wurzel, ziel.pfad, 'ordner');
  const name = path.posix.basename(q.absolut);
  if (!kopieren && (z.absolut === q.absolut || z.absolut.startsWith(q.absolut + '/'))) {
    throw fehler(400, 'Ein Ordner kann nicht in sich selbst verschoben werden');
  }
  const zielName = freierName(hostPath(z.absolut), name);
  const zielPfad = path.posix.join(z.absolut, zielName);

  if (kopieren) {
    await fs.promises.cp(hostPath(q.absolut), hostPath(zielPfad), { recursive: true, dereference: false, errorOnExist: true, force: false });
  } else if (q.wurzelDev === z.wurzelDev) {
    await fs.promises.rename(hostPath(q.absolut), hostPath(zielPfad));
  } else {
    await fs.promises.cp(hostPath(q.absolut), hostPath(zielPfad), { recursive: true, dereference: false });
    await fs.promises.rm(hostPath(q.absolut), { recursive: true, force: true });
  }
  return { ok: true, pfad: zielPfad, name: zielName };
}

// Löschen = in den Papierkorb des Laufwerks verschieben. endgueltig:true löscht wirklich.
export async function loeschen(laufwerke, wurzel, rel, { endgueltig = false } = {}) {
  const { absolut } = await aufloesen(laufwerke, wurzel, rel, 'beides');
  if (absolut === wurzel) throw fehler(400, 'Das Laufwerk selbst kann nicht gelöscht werden');
  if (endgueltig || absolut.startsWith(path.posix.join(wurzel, PAPIERKORB) + '/')) {
    await fs.promises.rm(hostPath(absolut), { recursive: true, force: true });
    return { ok: true, endgueltig: true };
  }
  const korb = path.posix.join(wurzel, PAPIERKORB);
  await fs.promises.mkdir(hostPath(korb), { recursive: true });
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const name = `${stempel}__${path.posix.basename(absolut)}`;
  await fs.promises.rename(hostPath(absolut), hostPath(path.posix.join(korb, name)));
  return { ok: true, endgueltig: false, papierkorb: path.posix.join(korb, name) };
}

export async function papierkorbLeeren(laufwerke, wurzel) {
  const lw = (laufwerke || []).find((l) => l.mount === wurzel);
  if (!lw) throw fehler(400, 'Unbekanntes Laufwerk');
  const korb = hostPath(path.posix.join(wurzel, PAPIERKORB));
  if (!fs.existsSync(korb)) return { ok: true, geloescht: 0 };
  const namen = await fs.promises.readdir(korb);
  for (const n of namen) await fs.promises.rm(path.join(korb, n), { recursive: true, force: true });
  return { ok: true, geloescht: namen.length };
}

// Ziel für einen Upload: liefert den Host-Pfad, in den der Server den Datenstrom schreibt.
export async function uploadZiel(laufwerke, wurzel, ordnerRel, name) {
  if (!nameOk(name)) throw fehler(400, 'Ungültiger Dateiname');
  const z = await aufloesen(laufwerke, wurzel, ordnerRel, 'ordner');
  const frei = freierName(hostPath(z.absolut), name);
  const pfad = path.posix.join(z.absolut, frei);
  return { host: hostPath(pfad), tmp: hostPath(pfad) + '.zentrale-upload', pfad, name: frei };
}

// ---------- Teilen ----------
// Ein Link gibt genau eine Datei heraus, ohne Anmeldung, bis zum Ablauf.

function freigaben() {
  const d = db();
  d.freigaben ||= {};
  // abgelaufene aufräumen
  const jetzt = Date.now();
  for (const [t, f] of Object.entries(d.freigaben)) if (f.bis < jetzt) delete d.freigaben[t];
  return d.freigaben;
}

export async function teilen(laufwerke, wurzel, rel, { tage = 7, hostName = '' } = {}) {
  const info = await dateiInfo(laufwerke, wurzel, rel);
  const t = Math.min(Math.max(Number(tage) || 7, 1), 90);
  const token = crypto.randomBytes(18).toString('base64url');
  freigaben()[token] = { wurzel, pfad: rel, name: info.name, bis: Date.now() + t * 86400_000, erstellt: Date.now() };
  save();
  const url = hostName ? `https://${hostName}:8443/teilen/${token}` : `/teilen/${token}`;
  return { ok: true, token, url, name: info.name, bis: freigaben()[token].bis, tage: t };
}

export function freigabenListe() {
  return Object.entries(freigaben()).map(([token, f]) => ({ token, ...f }));
}

export function freigabeLoeschen(token) {
  const f = freigaben();
  if (!f[token]) throw fehler(404, 'Link gibt es nicht');
  delete f[token];
  save();
  return { ok: true };
}

// Für die öffentliche Route /teilen/<token>: Datei-Angaben oder null.
export async function freigabeAufloesen(laufwerke, token) {
  const f = freigaben()[String(token || '')];
  if (!f) return null;
  try { return await dateiInfo(laufwerke, f.wurzel, f.pfad); } catch { return null; }
}
