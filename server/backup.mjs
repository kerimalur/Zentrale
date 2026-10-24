// Nächtliches Backup auf die Backup-HDD:
// 1. Nextcloud-Datenbank und Vaultwarden-Tresor konsistent sichern
// 2. /mnt/daten per rsync spiegeln; geänderte/gelöschte Dateien 30 Tage aufbewahren
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from './config.mjs';
import { db, save } from './store.mjs';
import { ausfuehren, tagKey } from './util.mjs';
import { container, pausieren, fortsetzen, execZuDatei } from './collect/docker.mjs';
import { vaultwardenDaten } from './collect/services.mjs';
import { ereignis } from './ereignisse.mjs';
import { hddSchlafen } from './szenen.mjs';

export const backupEingerichtet = () => !!config.backup.ziel;

export async function backupStarten() {
  const b = db().backup;
  if (!config.backup.ziel) throw new Error('Kein Backup-Ziel (BACKUP_ZIEL in .env)');
  if (b.laeuft) throw new Error('Backup läuft bereits');

  const ziel = hostPath(config.backup.ziel);
  const quelle = hostPath(config.backup.quelle);
  // Schutz: Ziel muss existieren und auf einer anderen Platte liegen als die Quelle.
  let zielDev, quelleDev;
  try { zielDev = fs.statSync(ziel).dev; quelleDev = fs.statSync(quelle).dev; } catch { throw new Error('Backup-Laufwerk ist nicht eingehängt'); }
  if (zielDev === quelleDev || zielDev === fs.statSync(hostPath('/')).dev) throw new Error('Backup-Ziel liegt nicht auf der Backup-HDD (nicht eingehängt?)');

  b.laeuft = true;
  save();
  const start = Date.now();
  const hinweise = [];
  try {
    const sicherungen = path.join(config.dataDir, 'sicherungen');
    fs.mkdirSync(sicherungen, { recursive: true });

    // 1a. MariaDB von Nextcloud (falls pausiert: kurz fortsetzen)
    const liste = await container().catch(() => []);
    const dbC = liste.find((c) => c.name === 'nextcloud-db');
    if (dbC) {
      const warPausiert = dbC.state === 'paused';
      if (warPausiert) await fortsetzen('nextcloud-db');
      try {
        const r = await execZuDatei('nextcloud-db', ['sh', '-c', 'exec mariadb-dump --all-databases --single-transaction --quick -uroot -p"${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}"'], path.join(sicherungen, 'nextcloud-db.sql'));
        if (r.exitCode !== 0) hinweise.push('Nextcloud-Datenbank: ' + (r.fehler || 'Fehler beim Sichern'));
      } finally {
        if (warPausiert) await pausieren('nextcloud-db').catch(() => {});
      }
    }

    // 1b. Vaultwarden-Datenbank.
    // sqlite3 kann die Datei nicht direkt über /proc/1/root öffnen (es löst den Pfad als Symlink zu „/" auf).
    // Darum: Vaultwarden 1–2 Sekunden einfrieren, Datenbank + WAL-Datei kopieren, wieder freigeben,
    // dann aus der Kopie eine saubere Sicherung erstellen und prüfen.
    const vw = vaultwardenDaten();
    if (vw) {
      const tmp = path.join(sicherungen, 'vw-tmp');
      const zielVw = path.join(sicherungen, 'vaultwarden.sqlite3');
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      const quelleDb = hostPath(vw.dbPfad);
      const vwC = liste.find((c) => c.name === 'vaultwarden');
      const einfrieren = vwC?.state === 'running';
      try {
        if (einfrieren) await pausieren('vaultwarden');
        try {
          for (const endung of ['', '-wal']) {
            if (fs.existsSync(quelleDb + endung)) fs.copyFileSync(quelleDb + endung, path.join(tmp, 'db.sqlite3' + endung));
          }
        } finally {
          if (einfrieren) await fortsetzen('vaultwarden').catch(() => {});
        }
        fs.rmSync(zielVw, { force: true });
        const r = await ausfuehren('sqlite3', [path.join(tmp, 'db.sqlite3'), `.backup '${zielVw}'`], { timeout: 120_000 });
        if (!r.ok) hinweise.push('Vaultwarden: ' + (r.stderr || '').slice(0, 200));
        else {
          const pruef = await ausfuehren('sqlite3', [zielVw, 'PRAGMA integrity_check;'], { timeout: 120_000 });
          if (!pruef.ok || pruef.stdout.trim() !== 'ok') hinweise.push('Vaultwarden: Sicherung ist beschädigt (' + (pruef.stdout || pruef.stderr).trim().slice(0, 100) + ')');
        }
      } catch (e) {
        hinweise.push('Vaultwarden: ' + e.message);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }

    // 2. Spiegeln
    const spiegel = path.join(ziel, 'zentrale-backup', 'aktuell');
    const aeltere = path.join(ziel, 'zentrale-backup', 'aeltere', tagKey());
    fs.mkdirSync(spiegel, { recursive: true });
    const args = ['-a', '--delete', '--backup', `--backup-dir=${aeltere}`, '--stats', '--exclude=*.tmp'];
    for (const x of config.backup.ausschliessen) args.push(`--exclude=${x}`);
    args.push(quelle.replace(/\/?$/, '/'), spiegel + '/');
    const r = await ausfuehren('nice', ['-n', '19', 'ionice', '-c3', 'rsync', ...args], { timeout: 6 * 3600_000 });
    if (!r.ok && r.code !== 24) throw new Error('rsync: ' + (r.stderr || '').slice(0, 300)); // 24 = Dateien verschwanden während Kopie (harmlos)
    const bytes = Number((r.stdout.match(/Total transferred file size: ([\d,.']+)/) || [])[1]?.replace(/[,.']/g, '') || 0);

    // 3. Alte Versionen nach 30 Tagen löschen
    const aeltereBasis = path.join(ziel, 'zentrale-backup', 'aeltere');
    // Beim ersten Lauf legt rsync den Ordner nicht an (es gab noch nichts Älteres).
    fs.mkdirSync(aeltereBasis, { recursive: true });
    for (const d of fs.readdirSync(aeltereBasis, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const alter = (Date.now() - new Date(d.name).getTime()) / 86400_000;
      if (alter > 30) fs.rmSync(path.join(aeltereBasis, d.name), { recursive: true, force: true });
    }

    b.letzte = { zeit: Date.now(), ok: hinweise.length === 0, bytes, dauerS: Math.round((Date.now() - start) / 1000), fehler: hinweise.join(' · ') || null };
    ereignis(hinweise.length ? 'warnung' : 'ok', `Backup auf HDD fertig · ${formatBytes(bytes)} übertragen${hinweise.length ? ' · ' + hinweise.join(' · ') : ''}`, { telegram: hinweise.length > 0, schluessel: 'backup' });
  } catch (e) {
    b.letzte = { zeit: Date.now(), ok: false, bytes: 0, dauerS: Math.round((Date.now() - start) / 1000), fehler: e.message };
    ereignis('fehler', `Backup fehlgeschlagen: ${e.message}`, { telegram: true, schluessel: 'backup' });
  } finally {
    b.laeuft = false;
    save();
    if (db().szene.id === 'nacht') hddSchlafen().catch(() => {});
  }
}

export function formatBytes(b) {
  if (!b) return '0 B';
  const e = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(e.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace('.', ',')} ${e[i]}`;
}
