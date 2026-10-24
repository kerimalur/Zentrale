// Nextcloud-Übersicht: Uploads (laufend, letzte Stunde, heute, letzte Dateien), Zielordner, Fehler, Platz und Ordner.
// Liest direkt aus der Nextcloud-Datenbank (nur lesen) und aus dem Datenordner auf dem Pi.
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from '../config.mjs';
import { container, execAusgabe } from './docker.mjs';

const P = config.nextcloud.prefix.replace(/[^a-zA-Z0-9_]/g, '');

// Upload-Zeit kommt aus filecache_extended.upload_time (setzt Nextcloud bei jedem Upload).
const SQL = `
SELECT '##speicher';
SELECT s.numeric_id, s.id, f.fileid, f.size FROM ${P}storages s JOIN ${P}filecache f ON f.storage = s.numeric_id AND f.path = 'files' WHERE s.id LIKE 'home::%';
SELECT '##ordner';
SELECT f.storage, f.name, f.size, IF(m.mimetype = 'httpd/unix-directory', 1, 0) FROM ${P}filecache f
  JOIN ${P}filecache p ON p.fileid = f.parent AND p.path = 'files'
  JOIN ${P}storages s ON s.numeric_id = p.storage AND s.id LIKE 'home::%'
  JOIN ${P}mimetypes m ON m.id = f.mimetype
  ORDER BY f.size DESC LIMIT 80;
SELECT '##neu';
SELECT f.storage, f.path, f.name, f.size, e.upload_time FROM ${P}filecache f JOIN ${P}filecache_extended e ON e.fileid = f.fileid
  WHERE e.upload_time > UNIX_TIMESTAMP() - 7 * 86400 AND f.path LIKE 'files/%' ORDER BY e.upload_time DESC LIMIT 25;
SELECT '##zeitraum';
SELECT
  COALESCE(SUM(e.upload_time > UNIX_TIMESTAMP() - 600), 0), COALESCE(SUM(IF(e.upload_time > UNIX_TIMESTAMP() - 600, f.size, 0)), 0),
  COALESCE(SUM(e.upload_time > UNIX_TIMESTAMP() - 3600), 0), COALESCE(SUM(IF(e.upload_time > UNIX_TIMESTAMP() - 3600, f.size, 0)), 0),
  COALESCE(SUM(e.upload_time >= UNIX_TIMESTAMP(CURDATE())), 0), COALESCE(SUM(IF(e.upload_time >= UNIX_TIMESTAMP(CURDATE()), f.size, 0)), 0),
  COALESCE(MAX(e.upload_time), 0)
  FROM ${P}filecache f JOIN ${P}filecache_extended e ON e.fileid = f.fileid
  WHERE e.upload_time > UNIX_TIMESTAMP() - 86400 AND f.path LIKE 'files/%';
SELECT '##ziele';
SELECT f.storage, SUBSTRING(f.path, 7, GREATEST(0, CHAR_LENGTH(f.path) - CHAR_LENGTH(f.name) - 7)) AS ordner, COUNT(*), SUM(f.size), MAX(e.upload_time)
  FROM ${P}filecache f JOIN ${P}filecache_extended e ON e.fileid = f.fileid
  WHERE e.upload_time > UNIX_TIMESTAMP() - 86400 AND f.path LIKE 'files/%'
  GROUP BY f.storage, ordner ORDER BY MAX(e.upload_time) DESC LIMIT 8;
`;

function teile(text) {
  const out = {};
  let akt = null;
  for (const zeile of text.split('\n')) {
    if (!zeile.trim()) continue;
    if (zeile.startsWith('##')) { akt = zeile.slice(2).trim(); out[akt] = []; continue; }
    if (akt) out[akt].push(zeile.split('\t').map((x) => x.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')));
  }
  return out;
}

function datenOrdner() {
  const basis = config.nextcloud.daten;
  for (const p of ['html/data', 'data', '']) {
    const d = path.join(basis, p);
    try { if (fs.existsSync(hostPath(path.join(d, 'nextcloud.log'))) || fs.readdirSync(hostPath(d)).some((n) => n.startsWith('appdata_'))) return d; } catch {}
  }
  return null;
}

// Grosse Dateien lädt die App in Stücken hoch (data/<nutzer>/uploads/<id>/…) – so sieht man laufende Uploads.
function laufendeUploads(daten, nutzer) {
  const laufend = [];
  let haengend = 0;
  for (const n of nutzer) {
    const ordner = hostPath(path.join(daten, n, 'uploads'));
    let ids = [];
    try { ids = fs.readdirSync(ordner); } catch { continue; }
    for (const id of ids) {
      let bytes = 0;
      let zuletzt = 0;
      let erstes = Infinity;
      try {
        for (const teil of fs.readdirSync(path.join(ordner, id))) {
          const st = fs.statSync(path.join(ordner, id, teil));
          bytes += st.size;
          zuletzt = Math.max(zuletzt, st.mtimeMs);
          erstes = Math.min(erstes, st.birthtimeMs || st.mtimeMs);
        }
      } catch { continue; }
      if (!zuletzt) continue;
      if (Date.now() - zuletzt < 15 * 60_000) laufend.push({ nutzer: n, bytes, seit: Number.isFinite(erstes) ? erstes : zuletzt, zuletzt });
      else haengend++;
    }
  }
  return { laufend: laufend.sort((a, b) => b.zuletzt - a.zuletzt).slice(0, 5), haengend };
}

// Fehler der letzten 24 Std aus nextcloud.log (nur die letzten ~400 KB lesen).
function fehlerLesen(daten) {
  const datei = hostPath(path.join(daten, 'nextcloud.log'));
  let text;
  try {
    const st = fs.statSync(datei);
    const laenge = Math.min(st.size, 400 * 1024);
    const fd = fs.openSync(datei, 'r');
    const buf = Buffer.alloc(laenge);
    fs.readSync(fd, buf, 0, laenge, st.size - laenge);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch {
    return [];
  }
  const grenze = Date.now() - 24 * 3600_000;
  const gruppen = new Map();
  for (const zeile of text.split('\n')) {
    if (!zeile.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(zeile); } catch { continue; }
    if ((e.level ?? 0) < 3) continue;
    const t = Date.parse(e.time);
    if (!Number.isFinite(t) || t < grenze) continue;
    const msg = String(e.message || e.exception?.Message || 'Fehler').replace(/\s+/g, ' ').slice(0, 220);
    const k = (e.app || '') + '|' + msg.slice(0, 120);
    const g = gruppen.get(k);
    if (g) { g.anzahl++; g.zeit = Math.max(g.zeit, t); } else gruppen.set(k, { zeit: t, app: e.app || 'nextcloud', text: msg, anzahl: 1, stufe: e.level >= 4 ? 'schwer' : 'fehler' });
  }
  return [...gruppen.values()].sort((a, b) => b.zeit - a.zeit).slice(0, 8);
}

export async function cloudDaten() {
  const liste = await container();
  const dbC = liste.find((c) => c.name === config.nextcloud.dbContainer);
  if (!dbC) return { bereit: false, grund: 'Nextcloud-Datenbank nicht gefunden' };
  if (dbC.state !== 'running') return { bereit: false, grund: dbC.state === 'paused' ? 'Nextcloud ist gerade pausiert (Szene)' : 'Nextcloud-Datenbank läuft nicht' };

  const r = await execAusgabe(dbC.name, ['sh', '-c', 'exec mariadb -N -B -uroot -p"${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE:-${MARIADB_DATABASE:-nextcloud}}" -e "$ZENTRALE_SQL"'], { env: ['ZENTRALE_SQL=' + SQL], timeout: 20_000 });
  if (r.exitCode !== 0) throw new Error('Nextcloud-Datenbank: ' + (r.fehler || 'Abfrage fehlgeschlagen').slice(0, 200));
  const d = teile(r.ausgabe);

  const nutzerVon = {};
  const nutzer = (d.speicher || []).map(([id, sid, , size]) => {
    const name = sid.replace(/^home::/, '');
    nutzerVon[id] = name;
    return { name, belegt: Number(size) || 0 };
  }).sort((a, b) => b.belegt - a.belegt);
  const haupt = nutzer[0]?.name || null;

  const ordner = (d.ordner || [])
    .filter(([sid]) => nutzerVon[sid] === haupt)
    .map(([, name, size, istOrdner]) => ({ name, bytes: Math.max(0, Number(size) || 0), ordner: istOrdner === '1' }));

  const neu = (d.neu || []).map(([sid, p, name, size, t]) => ({
    nutzer: nutzerVon[sid] || '?',
    name,
    ordner: '/' + p.replace(/^files\/?/, '').split('/').slice(0, -1).join('/'),
    bytes: Number(size) || 0,
    zeit: Number(t) * 1000,
  }));

  const z = (d.zeitraum && d.zeitraum[0]) || [];
  const zahl = (i) => Number(z[i]) || 0;
  const ziele = (d.ziele || []).map(([sid, o, anzahl, bytes, t]) => ({ nutzer: nutzerVon[sid] || '?', ordner: '/' + (o || ''), anzahl: Number(anzahl) || 0, bytes: Number(bytes) || 0, zuletzt: Number(t) * 1000 }));

  const daten = datenOrdner();
  let platz = null;
  if (daten) {
    try {
      const s = await fs.promises.statfs(hostPath(daten));
      platz = { gross: s.blocks * s.bsize, frei: s.bavail * s.bsize };
    } catch {}
  }
  const { laufend, haengend } = daten ? laufendeUploads(daten, nutzer.map((n) => n.name)) : { laufend: [], haengend: 0 };
  const letzter = zahl(6) * 1000;

  return {
    bereit: true,
    grund: null,
    zeit: Date.now(),
    nutzer,
    haupt,
    platz,
    ordner,
    neu,
    zehnMin: { anzahl: zahl(0), bytes: zahl(1) },
    stunde: { anzahl: zahl(2), bytes: zahl(3) },
    heute: { anzahl: zahl(4), bytes: zahl(5) },
    letzter: letzter || null,
    aktiv: laufend.length > 0 || (letzter > 0 && Date.now() - letzter < 3 * 60_000),
    ziele,
    laufend,
    haengend,
    fehler: daten ? fehlerLesen(daten) : [],
  };
}
