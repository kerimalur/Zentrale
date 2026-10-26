// Zentrale Konfiguration. Alles kommt aus der .env-Datei (siehe .env.example).
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const str = (k, d = '') => (env[k] ?? '').trim() || d;
const num = (k, d) => {
  const v = Number(str(k, ''));
  return Number.isFinite(v) && str(k, '') !== '' ? v : d;
};

// Host-Dateisystem: Der Container läuft mit pid: host und privileged,
// darum ist das Dateisystem des Pi unter /proc/1/root erreichbar.
export const HOST_ROOT = str('HOST_ROOT', '/proc/1/root');
export const hostPath = (p) => path.join(HOST_ROOT, p);

export const config = {
  port: num('PORT', 3030),
  bind: str('BIND', '127.0.0.1'),
  dataDir: str('DATA_DIR', '/data'),
  staticDir: str('STATIC_DIR', path.resolve('out')),
  zeitzone: str('ZEITZONE', 'Europe/Zurich'),

  passwort: str('ZENTRALE_PASSWORT'),
  hostName: str('HOST_NAME', 'homelabkerim.taila4b96b.ts.net'),

  ssh: {
    host: str('SSH_HOST', '127.0.0.1'),
    port: num('SSH_PORT', 22),
    user: str('SSH_USER', 'kerim'),
    keyPath: str('SSH_KEY', '/data/ssh/id_ed25519'),
  },

  // Die sechs Dienste. container = Docker-Name, port = Port auf dem Pi.
  dienste: [
    { id: 'nextcloud', name: 'Nextcloud', container: 'nextcloud', extra: ['nextcloud-db'], port: num('NEXTCLOUD_PORT', 8080), check: '/status.php' },
    { id: 'jellyfin', name: 'Jellyfin', container: 'jellyfin', port: num('JELLYFIN_PORT', 8096), check: '/health' },
    { id: 'vaultwarden', name: 'Vaultwarden', container: 'vaultwarden', port: num('VAULTWARDEN_PORT', 8222), check: '/alive', urlOverride: str('VAULTWARDEN_URL', '') },
    { id: 'pihole', name: 'Pi-hole', container: 'pihole', port: num('PIHOLE_PORT', 8053), check: '/api/info/login', pfad: '/admin/' },
    { id: 'syncthing', name: 'Syncthing', container: 'syncthing', port: num('SYNCTHING_PORT', 8384), check: '/rest/noauth/health' },
    { id: 'kuma', name: 'Uptime Kuma', container: 'uptime-kuma', port: num('KUMA_PORT', 3001), check: '/' },
  ],

  pihole: { passwort: str('PIHOLE_PASSWORT') },
  syncthing: { apiKey: str('SYNCTHING_API_KEY') },
  jellyfin: { apiKey: str('JELLYFIN_API_KEY') },
  nextcloud: { token: str('NEXTCLOUD_TOKEN'), daten: str('NEXTCLOUD_DATEN', '/mnt/daten/nextcloud'), prefix: str('NEXTCLOUD_TABELLEN_PREFIX', 'oc_'), dbContainer: str('NEXTCLOUD_DB_CONTAINER', 'nextcloud-db') },
  // Möbel-Lüfter über Relais an GPIO 23 (Pin 16). NC verdrahtet: Relais an = Lüfter aus (fällt der Pi aus, laufen die Lüfter).
  // Statusbericht: wird im Ordner «Homelab» des Obsidian-Vaults unter diesem Syncthing-Ordner gesucht.
  statusBasis: str('STATUS_BASIS', '/mnt/daten/syncthing'),
  // Laufwerke, die eingehängt sein müssen (sonst Alarm, und das Backup startet nicht).
  pflichtMounts: str('PFLICHT_MOUNTS', '/mnt/evo,/mnt/daten').split(',').map((s) => s.trim()).filter(Boolean),
  relais: { gpio: str('RELAIS_GPIO', '23'), nc: str('RELAIS_NC', 'ja') !== 'nein' },
  vaultwarden: { daten: str('VAULTWARDEN_DATEN', '/mnt/daten/vaultwarden') },
  kuma: { apiKey: str('KUMA_API_KEY') },

  tailscale: {
    socket: str('TAILSCALE_SOCKET', '/var/run/tailscale/tailscaled.sock'),
    apiKey: str('TS_API_KEY'),
  },

  telegram: { token: str('TELEGRAM_BOT_TOKEN'), chatId: str('TELEGRAM_CHAT_ID') },

  energie: { shellyUrl: str('SHELLY_URL').replace(/\/$/, ''), strompreis: num('STROMPREIS', 0.3) },

  backup: {
    ziel: str('BACKUP_ZIEL'),
    disk: str('BACKUP_DISK'),
    zeit: str('BACKUP_ZEIT', '03:00'),
    // Einhängepunkt der Backup-HDD (Alarm + automatisch einhängen, wenn sie wieder da ist)
    mount: str('BACKUP_MOUNT', '/mnt/backup'),
    quelle: str('BACKUP_QUELLE', '/mnt/daten'),
    ausschliessen: str('BACKUP_AUSSCHLIESSEN', '').split(',').map((s) => s.trim()).filter(Boolean),
  },

  // Speicher-Kategorien für "Wofür der Speicher gebraucht wird".
  speicherKategorien: parseJson(str('SPEICHER_KATEGORIEN'), [
    { name: 'Filme & Musik', pfad: str('MEDIEN', '/mnt/daten/medien') },
    { name: 'Nextcloud', pfad: str('NEXTCLOUD_DATEN', '/mnt/daten/nextcloud') },
    { name: 'Syncthing', pfad: str('SYNCTHING_DATEN', '/mnt/daten/syncthing') },
    { name: 'Jellyfin (Daten)', pfad: str('JELLYFIN_DATEN', '/mnt/daten/jellyfin') },
    { name: 'Vaultwarden', pfad: str('VAULTWARDEN_DATEN', '/mnt/daten/vaultwarden') },
  ]),

  // Namen für Laufwerke nach Einhängepunkt.
  laufwerkNamen: parseJson(str('LAUFWERK_NAMEN'), {
    '/mnt/daten': 'Kingston SSD · Daten',
  }),

  // Szenen: welche Container pausiert werden und welcher CPU-Modus gilt.
  szenen: {
    normal: { name: 'Normal', pause: [], governor: null },
    film: { name: 'Filmabend', pause: ['nextcloud', 'nextcloud-db', 'syncthing'], governor: 'performance' },
    // Nextcloud läuft nachts weiter (Handy-Uploads beim Laden), nur Jellyfin pausiert.
    nacht: { name: 'Nacht', pause: ['jellyfin'], governor: 'powersave', hddSchlaf: true, luefterMax: 40 },
  },

  // Medien: Download über VPN (Gluetun + qBittorrent) und Arr-Stack.
  medien: {
    vpnContainer: str('VPN_CONTAINER', 'gluetun'),
    downloadContainer: str('DOWNLOAD_CONTAINER', 'qbittorrent'),
    qbit: { port: num('QBIT_PORT', 8085), user: str('QBIT_USER', 'admin'), passwort: str('QBIT_PASSWORT') },
    arr: [
      { id: 'sonarr', name: 'Sonarr', container: 'sonarr', port: num('SONARR_PORT', 8989), api: 'v3', key: str('SONARR_API_KEY') },
      { id: 'radarr', name: 'Radarr', container: 'radarr', port: num('RADARR_PORT', 7878), api: 'v3', key: str('RADARR_API_KEY') },
      { id: 'lidarr', name: 'Lidarr', container: 'lidarr', port: num('LIDARR_PORT', 8686), api: 'v1', key: str('LIDARR_API_KEY') },
      // Bazarr (Untertitel): eigene API ohne Versionsnummer im Pfad
      { id: 'bazarr', name: 'Bazarr', container: 'bazarr', port: num('BAZARR_PORT', 6767), api: '', key: str('BAZARR_API_KEY') },
      { id: 'prowlarr', name: 'Prowlarr', container: 'prowlarr', port: num('PROWLARR_PORT', 9696), api: 'v1', key: str('PROWLARR_API_KEY') },
    ],
    seerr: { container: 'seerr', port: num('SEERR_PORT', 5055), key: str('SEERR_API_KEY') },
    weitere: ['flaresolverr'],
    filmabendDrosseln: str('FILMABEND_DROSSELN', 'ja') !== 'nein',
  },

  // Windows-PC per Wake-on-LAN: MAC-Adresse der LAN-Karte (nicht WLAN). Online-Status kommt von Tailscale.
  pc: {
    mac: str('PC_MAC', ''),
    name: str('PC_NAME', 'Windows-PC'),
    tailscaleName: str('PC_TAILSCALE_NAME', ''),
    broadcast: str('PC_BROADCAST', '255.255.255.255'),
    // Ausschalten per SSH (OpenSSH-Server unter Windows): Windows-Benutzername, optional feste Adresse
    user: str('PC_USER', ''),
    host: str('PC_HOST', ''),
    sshPort: num('PC_SSH_PORT', 22),
  },

  // Scrutiny (SMART der Platten), läuft im eigenen Container, Port auf dem Pi
  scrutiny: { port: num('SCRUTINY_PORT', 8095), url: str('SCRUTINY_URL', '') },

  // What's Up Docker (Container-Updates). Token nur mit Bereich «Read» (WUD → Profil → Generate Token).
  wud: { port: num('WUD_PORT', 3010), url: str('WUD_URL', ''), token: str('WUD_TOKEN', '') },

  // Garmin (garmin-grafana): InfluxDB nur lesend über 127.0.0.1, Grafana für Details.
  garmin: {
    influxPort: num('GARMIN_INFLUX_PORT', 8086),
    db: str('GARMIN_INFLUX_DB', 'GarminStats'),
    user: str('GARMIN_INFLUX_USER', 'influxdb_user'),
    passwort: str('GARMIN_INFLUX_PASSWORD', ''),
    grafanaPort: num('GARMIN_GRAFANA_PORT', 3020),
    grafanaUrl: str('GARMIN_GRAFANA_URL', ''),
    schritteZiel: num('GARMIN_SCHRITTE_ZIEL', 10000),
  },

  // Philips-Fernseher (JointSpace-API v6). MAC = WLAN-MAC, zum Aufwecken aus dem Standby.
  tv: {
    ip: str('TV_IP', ''),
    mac: str('TV_MAC', ''),
    name: str('TV_NAME', 'Fernseher'),
    broadcast: str('TV_BROADCAST', ''),
  },

  // Leer = keine Lüftersteuerung. "auto" = ersten PWM-Kanal nehmen (nach dtoverlay=pwm).
  luefter: { pwmPfad: str('LUEFTER_PWM', '') },
};

function parseJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { console.warn('[config] Ungültiges JSON, nehme Standard'); return fallback; }
}

export function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}
