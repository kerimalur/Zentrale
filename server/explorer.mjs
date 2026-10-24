// Datei-Explorer (nur lesen): Ordner eines Laufwerks auflisten + Ordnergrössen per du.
// Sicherheit: nur echte Laufwerks-Einhängepunkte als Wurzel, kein ".." und keine Symlinks im Pfad.
import fs from 'node:fs';
import path from 'node:path';
import { hostPath } from './config.mjs';
import { ausfuehren } from './util.mjs';

const MAX_EINTRAEGE = 500;
const CACHE_MS = 10 * 60_000;
const groessenCache = new Map(); // hostPfad -> { zeit, groessen, gesamt }
const laufend = new Map(); // hostPfad -> Promise

function fehler(status, text) {
  const e = new Error(text);
  e.status = status;
  return e;
}

// Prüft Wurzel + relativen Pfad und liefert den absoluten Pfad auf dem Pi.
async function aufloesen(laufwerke, wurzel, rel) {
  const lw = laufwerke.find((l) => l.mount === wurzel);
  if (!lw) throw fehler(400, 'Unbekanntes Laufwerk');
  const teile = String(rel || '/').split('/').filter(Boolean);
  if (teile.some((t) => t === '..' || t === '.' || t.includes('\0'))) throw fehler(400, 'Ungültiger Pfad');
  let aktuell = wurzel;
  const wurzelDev = (await fs.promises.stat(hostPath(wurzel))).dev;
  for (const t of teile) {
    aktuell = path.posix.join(aktuell, t);
    const st = await fs.promises.lstat(hostPath(aktuell)).catch(() => null);
    if (!st) throw fehler(404, 'Ordner nicht gefunden');
    if (st.isSymbolicLink() || !st.isDirectory()) throw fehler(400, 'Kein Ordner');
    if (st.dev !== wurzelDev) throw fehler(400, 'Dieser Ordner liegt auf einem anderen Laufwerk');
  }
  return { lw, absolut: aktuell, wurzelDev, rel: '/' + teile.join('/') };
}

// Gerätenummer → Laufwerksname (für Ordner, die auf einem anderen Laufwerk liegen, z. B. Bind-Mounts).
async function geraeteNamen(laufwerke) {
  const m = new Map();
  for (const l of laufwerke) {
    try { m.set((await fs.promises.stat(hostPath(l.mount))).dev, { name: l.name, mount: l.mount }); } catch {}
  }
  return m;
}

export async function ordnerLesen(laufwerke, wurzel, rel) {
  const { absolut, wurzelDev, rel: sauber } = await aufloesen(laufwerke, wurzel, rel);
  const namen = await geraeteNamen(laufwerke);
  const dirents = await fs.promises.readdir(hostPath(absolut), { withFileTypes: true });
  const eintraege = [];
  for (const d of dirents) {
    const st = await fs.promises.lstat(hostPath(path.posix.join(absolut, d.name))).catch(() => null);
    if (!st) continue;
    const typ = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'ordner' : st.isFile() ? 'datei' : 'anders';
    const e = { name: d.name, typ, groesse: typ === 'datei' ? st.size : null, geaendert: st.mtimeMs };
    if (typ === 'ordner' && st.dev !== wurzelDev) {
      const ziel = namen.get(st.dev);
      e.anderes = ziel ? ziel.name : 'System (virtuell)';
      e.anderesMount = ziel ? ziel.mount : null;
    }
    eintraege.push(e);
  }
  const anzahl = eintraege.length;
  // Ordner zuerst, dann alphabetisch; die Oberfläche sortiert nach Grösse, sobald die da ist.
  eintraege.sort((a, b) => (a.typ === 'ordner' ? 0 : 1) - (b.typ === 'ordner' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
  return { wurzel, pfad: sauber, eintraege: eintraege.slice(0, MAX_EINTRAEGE), anzahl, gekuerzt: anzahl > MAX_EINTRAEGE };
}

// Grösse aller Unterordner (nur auf diesem Laufwerk: du -x), gecacht.
export async function ordnerGroessen(laufwerke, wurzel, rel) {
  const { absolut } = await aufloesen(laufwerke, wurzel, rel);
  const hp = hostPath(absolut);
  const c = groessenCache.get(hp);
  if (c && Date.now() - c.zeit < CACHE_MS) return { groessen: c.groessen, gesamt: c.gesamt, zeit: c.zeit };
  if (!laufend.has(hp)) {
    laufend.set(hp, (async () => {
      const r = await ausfuehren('nice', ['-n', '19', 'ionice', '-c3', 'du', '-x', '-b', '--max-depth=1', hp], { timeout: 120_000 });
      const groessen = {};
      let gesamt = null;
      const basis = hp.replace(/\/$/, '');
      for (const z of r.stdout.split('\n')) {
        const m = z.match(/^(\d+)\t(.+)$/);
        if (!m) continue;
        const p = m[2].replace(/\/$/, '');
        if (p === basis) gesamt = Number(m[1]);
        else if (path.posix.dirname(p) === basis) groessen[path.posix.basename(p)] = Number(m[1]);
      }
      const eintrag = { zeit: Date.now(), groessen, gesamt };
      if (r.ok) groessenCache.set(hp, eintrag);
      if (groessenCache.size > 200) groessenCache.delete(groessenCache.keys().next().value);
      return eintrag;
    })().finally(() => laufend.delete(hp)));
  }
  const e = await laufend.get(hp);
  return { groessen: e.groessen, gesamt: e.gesamt, zeit: e.zeit };
}
