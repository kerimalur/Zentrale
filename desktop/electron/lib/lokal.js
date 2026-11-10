// Dateien auf dem HP selbst (Windows). Spiegelt die Pi-Datei-API, damit der Finder
// beide Quellen gleich behandelt.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { shell, app } = require('electron');

const MAX_TEXT = 4 * 1024 * 1024;

function fehler(text) { const e = new Error(text); e.sanft = true; return e; }

const TYPEN = {
  bild: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'],
  pdf: ['.pdf'],
  video: ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'],
  audio: ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.opus', '.aac'],
  text: ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yml', '.yaml', '.ini', '.conf', '.cfg',
         '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.xml', '.sh', '.py', '.env', '.sql', '.toml', '.bat', '.ps1'],
  archiv: ['.zip', '.tar', '.gz', '.xz', '.7z', '.rar', '.bz2', '.zst'],
};
function dateiArt(name) {
  const ext = path.extname(String(name)).toLowerCase();
  for (const [art, liste] of Object.entries(TYPEN)) if (liste.includes(ext)) return art;
  return 'anders';
}

// Standard-Orte in der Seitenleiste.
function orte(extra = []) {
  const kandidaten = [
    { id: 'home', name: 'Privat', pfad: os.homedir(), symbol: 'home' },
    { id: 'desktop', name: 'Schreibtisch', pfad: sicherPfad('desktop'), symbol: 'desktop' },
    { id: 'documents', name: 'Dokumente', pfad: sicherPfad('documents'), symbol: 'doc' },
    { id: 'downloads', name: 'Downloads', pfad: sicherPfad('downloads'), symbol: 'download' },
    { id: 'pictures', name: 'Bilder', pfad: sicherPfad('pictures'), symbol: 'bild' },
    { id: 'videos', name: 'Videos', pfad: sicherPfad('videos'), symbol: 'video' },
    { id: 'music', name: 'Musik', pfad: sicherPfad('music'), symbol: 'musik' },
  ].filter((o) => o.pfad && fs.existsSync(o.pfad));

  for (const p of extra || []) {
    if (p && fs.existsSync(p)) kandidaten.push({ id: 'extra:' + p, name: path.basename(p) || p, pfad: p, symbol: 'ordner', eigener: true });
  }
  // Doppelte Pfade raus: auf manchen Systemen zeigen mehrere Standard-Orte auf denselben Ordner.
  const gesehen = new Set();
  return kandidaten.filter((o) => {
    const k = path.resolve(o.pfad).toLowerCase();
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

function sicherPfad(name) {
  try { return app.getPath(name); } catch { return null; }
}

// Laufwerke unter Windows (C:\, D:\ …). Unter Linux/Mac: /
function laufwerke() {
  if (process.platform !== 'win32') return [{ mount: '/', name: 'System' }];
  const out = [];
  for (let c = 65; c <= 90; c++) {
    const b = String.fromCharCode(c) + ':\\';
    try { fs.accessSync(b); out.push({ mount: b, name: b.slice(0, 2) }); } catch {}
  }
  return out;
}

async function liste(pfad, { versteckte = false } = {}) {
  const ziel = path.resolve(String(pfad || os.homedir()));
  const st = await fsp.stat(ziel).catch(() => null);
  if (!st) throw fehler('Ordner nicht gefunden');
  if (!st.isDirectory()) throw fehler('Kein Ordner');
  const dirents = await fsp.readdir(ziel, { withFileTypes: true });
  const eintraege = [];
  for (const d of dirents) {
    if (!versteckte && d.name.startsWith('.')) continue;
    const s = await fsp.lstat(path.join(ziel, d.name)).catch(() => null);
    if (!s) continue;
    if (!versteckte && process.platform === 'win32' && istSystemVersteckt(d.name)) continue;
    const typ = s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'ordner' : s.isFile() ? 'datei' : 'anders';
    eintraege.push({
      name: d.name, typ, art: typ === 'datei' ? dateiArt(d.name) : typ,
      groesse: typ === 'datei' ? s.size : null, geaendert: Math.round(s.mtimeMs),
    });
  }
  eintraege.sort((a, b) => (a.typ === 'ordner' ? 0 : 1) - (b.typ === 'ordner' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
  let schreibbar = true;
  try { await fsp.access(ziel, fs.constants.W_OK); } catch { schreibbar = false; }
  return { pfad: ziel, eltern: path.dirname(ziel) === ziel ? null : path.dirname(ziel), eintraege, anzahl: eintraege.length, schreibbar };
}

const SYSTEM = new Set(['$recycle.bin', 'system volume information', 'pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'recovery', 'dumpstack.log.tmp']);
const istSystemVersteckt = (n) => SYSTEM.has(String(n).toLowerCase());

async function text(pfad) {
  const st = await fsp.stat(pfad);
  if (!st.isFile()) throw fehler('Keine Datei');
  if (st.size > MAX_TEXT) throw fehler(`Zu gross zum Bearbeiten (${Math.round(st.size / 1048576)} MB, max. 4 MB)`);
  return { name: path.basename(pfad), inhalt: await fsp.readFile(pfad, 'utf8'), groesse: st.size, geaendert: Math.round(st.mtimeMs) };
}

async function textSchreiben(pfad, inhalt) {
  if (typeof inhalt !== 'string') throw fehler('Inhalt fehlt');
  if (Buffer.byteLength(inhalt) > MAX_TEXT) throw fehler('Inhalt zu gross (max. 4 MB)');
  const tmp = pfad + '.zentrale-tmp';
  await fsp.writeFile(tmp, inhalt, 'utf8');
  await fsp.rename(tmp, pfad);
  const st = await fsp.stat(pfad);
  return { ok: true, groesse: st.size, geaendert: Math.round(st.mtimeMs) };
}

function frei(ordner, name) {
  if (!fs.existsSync(path.join(ordner, name))) return name;
  const ext = path.extname(name);
  const basis = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const k = `${basis} ${i}${ext}`;
    if (!fs.existsSync(path.join(ordner, k))) return k;
  }
  throw fehler('Kein freier Name gefunden');
}

function nameOk(n) {
  const s = String(n || '');
  if (!s || s === '.' || s === '..' || s.length > 255) return false;
  if (/[\0<>:"/\\|?*]/.test(s)) return false;
  if (process.platform === 'win32' && /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) return false;
  return true;
}

async function neu(ordner, name, istOrdner, inhalt = '') {
  if (!nameOk(name)) throw fehler('Ungültiger Name');
  const ziel = path.join(ordner, name);
  if (fs.existsSync(ziel)) throw fehler('Gibt es schon');
  if (istOrdner) await fsp.mkdir(ziel);
  else await fsp.writeFile(ziel, String(inhalt), 'utf8');
  return { ok: true, pfad: ziel, name };
}

async function umbenennen(pfad, name) {
  if (!nameOk(name)) throw fehler('Ungültiger Name');
  const ziel = path.join(path.dirname(pfad), name);
  if (fs.existsSync(ziel)) throw fehler('Name ist schon vergeben');
  await fsp.rename(pfad, ziel);
  return { ok: true, pfad: ziel, name };
}

async function verschieben(quelle, zielOrdner, { kopieren = false } = {}) {
  const name = frei(zielOrdner, path.basename(quelle));
  const ziel = path.join(zielOrdner, name);
  if (!kopieren && (path.resolve(ziel) === path.resolve(quelle) || path.resolve(ziel).startsWith(path.resolve(quelle) + path.sep))) {
    throw fehler('Ein Ordner kann nicht in sich selbst verschoben werden');
  }
  if (kopieren) await fsp.cp(quelle, ziel, { recursive: true, errorOnExist: true, force: false });
  else {
    try { await fsp.rename(quelle, ziel); }
    catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await fsp.cp(quelle, ziel, { recursive: true });
      await fsp.rm(quelle, { recursive: true, force: true });
    }
  }
  return { ok: true, pfad: ziel, name };
}

// Löschen = in den Windows-Papierkorb (wiederherstellbar).
async function loeschen(pfad, { endgueltig = false } = {}) {
  if (endgueltig) { await fsp.rm(pfad, { recursive: true, force: true }); return { ok: true, endgueltig: true }; }
  await shell.trashItem(pfad);
  return { ok: true, endgueltig: false };
}

// Freien Zielpfad in einem Ordner ermitteln (für Downloads vom Pi).
function freierZielpfad(ordner, name) {
  const n = frei(ordner, name);
  return { pfad: path.join(ordner, n), name: n };
}

async function schreibenPuffer(ordner, name, puffer) {
  const n = frei(ordner, name);
  const ziel = path.join(ordner, n);
  await fsp.writeFile(ziel, puffer);
  return { ok: true, pfad: ziel, name: n };
}

async function info(pfad) {
  const st = await fsp.stat(pfad);
  return { pfad, name: path.basename(pfad), groesse: st.size, geaendert: Math.round(st.mtimeMs), art: st.isDirectory() ? 'ordner' : dateiArt(pfad) };
}

module.exports = { orte, laufwerke, liste, text, textSchreiben, neu, umbenennen, verschieben, loeschen, schreibenPuffer, freierZielpfad, info, dateiArt, nameOk, MAX_TEXT };
