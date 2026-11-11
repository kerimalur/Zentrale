// Systemfunktionen von ZentraleOS. Die Shell erfindet nichts neu: sie ruft die
// bewährten Werkzeuge auf (nmcli, wpctl, nft, flatpak, timedatectl …) und zeigt das
// Ergebnis in eigenen Oberflächen. Alles mit Root-Rechten läuft über den festen
// Helfer /usr/libexec/zentraleos/helfer und verlangt das Administrator-Passwort.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const HELFER = '/usr/libexec/zentraleos/helfer';
const NFT_DATEI = '/etc/nftables.conf';

function lauf(befehl, args = [], { eingabe = null, timeout = 15000, env = null } = {}) {
  return new Promise((ok) => {
    const k = execFile(befehl, args, { timeout, maxBuffer: 8 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env }, (e, aus, err) => {
      if (e && e.code === 'ENOENT') return ok({ ok: false, fehlt: true, aus: '', fehler: `«${befehl}» ist nicht installiert` });
      ok({ ok: !e, aus: String(aus || ''), fehler: e ? String(err || e.message).trim().slice(0, 400) : '', code: e ? e.code : 0 });
    });
    if (eingabe !== null) { try { k.stdin.end(eingabe); } catch {} }
  });
}

// ---------- Root nur mit Administrator-Passwort ----------
let rootPw = null; let rootPwBis = 0;
function rootVergessen() { rootPw = null; rootPwBis = 0; }
async function alsRoot(aktion, args = [], { passwort = null, eingabe = '', timeout = 120000 } = {}) {
  const pw = passwort || (Date.now() < rootPwBis ? rootPw : null);
  if (!pw) return { ok: false, passwortNoetig: true, fehler: 'Administrator-Passwort nötig' };
  // -k: nie eine alte sudo-Freigabe wiederverwenden; -S: Passwort über die Standardeingabe.
  const r = await lauf('sudo', ['-k', '-S', '-p', '', HELFER, aktion, ...args.map(String)], { eingabe: pw + '\n' + eingabe, timeout });
  if (!r.ok && /incorrect password|Sorry, try again|falsches Passwort|no password was provided|a password is required/i.test(r.fehler)) {
    rootVergessen();
    return { ok: false, passwortNoetig: true, falsch: !!passwort, fehler: 'Falsches Administrator-Passwort' };
  }
  if (r.ok) { rootPw = pw; rootPwBis = Date.now() + 5 * 60_000; }
  return r;
}

// ---------- Über / Aktivität ----------
const lies = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
let cpuVorher = null;
function cpuProzent() {
  const z = lies('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const leer = z[3] + (z[4] || 0); const summe = z.reduce((a, b) => a + b, 0);
  const v = cpuVorher; cpuVorher = { leer, summe };
  return v && summe > v.summe ? Math.round((1 - (leer - v.leer) / (summe - v.summe)) * 100) : 0;
}
let netzVorher = null;
function netzRate() {
  let rx = 0; let tx = 0;
  for (const z of lies('/proc/net/dev').split('\n').slice(2)) { const t = z.trim().split(/[:\s]+/); if (t[0] && t[0] !== 'lo') { rx += Number(t[1]) || 0; tx += Number(t[9]) || 0; } }
  const jetzt = Date.now(); const v = netzVorher; netzVorher = { rx, tx, jetzt };
  if (!v) return { down: 0, up: 0 };
  const s = Math.max(0.2, (jetzt - v.jetzt) / 1000);
  return { down: Math.max(0, (rx - v.rx) / s), up: Math.max(0, (tx - v.tx) / s) };
}
async function info() {
  const rel = Object.fromEntries(lies('/etc/os-release').split('\n').filter((z) => z.includes('=')).map((z) => { const i = z.indexOf('='); return [z.slice(0, i), z.slice(i + 1).replace(/^"|"$/g, '')]; }));
  const df = await lauf('df', ['-B1', '--output=source,fstype,size,used,avail,target', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'squashfs', '-x', 'overlay', '-x', 'efivarfs']);
  const platz = df.aus.split('\n').slice(1).filter(Boolean).map((z) => { const t = z.trim().split(/\s+/); return { geraet: t[0], typ: t[1], gross: +t[2], benutzt: +t[3], frei: +t[4], ort: t.slice(5).join(' ') }; });
  const wurzel = await lauf('df', ['-B1', '--output=size,used,avail', '/']);
  const w = (wurzel.aus.split('\n')[1] || '').trim().split(/\s+/).map(Number);
  return { ok: true, name: rel.PRETTY_NAME || 'ZentraleOS', version: rel.VERSION || '', kernel: os.release(), rechner: os.hostname(), cpu: os.cpus()[0]?.model || '', kerne: os.cpus().length,
    ram: os.totalmem(), ramFrei: os.freemem(), laufzeitS: os.uptime(), benutzer: os.userInfo().username, platz, wurzel: { gross: w[0] || 0, benutzt: w[1] || 0, frei: w[2] || 0 },
    live: /boot=live/.test(lies('/proc/cmdline')), sitzung: process.env.XDG_SESSION_TYPE || '' };
}
async function prozesse() {
  const r = await lauf('ps', ['-eo', 'pid,user:16,pcpu,pmem,rss,comm', '--sort=-pcpu', '--no-headers']);
  const liste = r.aus.split('\n').filter(Boolean).slice(0, 120).map((z) => { const t = z.trim().split(/\s+/); return { pid: +t[0], benutzer: t[1], cpu: +t[2], ram: +t[3], rss: +t[4] * 1024, name: t.slice(5).join(' ') }; });
  return { ok: true, liste, cpu: cpuProzent(), ram: os.totalmem(), ramFrei: os.freemem(), last: os.loadavg(), netz: netzRate(), kerne: os.cpus().length };
}
function beenden(pid, hart) {
  try { process.kill(Number(pid), hart ? 'SIGKILL' : 'SIGTERM'); return { ok: true }; }
  catch (e) { return { ok: false, fehler: e.code === 'EPERM' ? 'Dieser Prozess gehört nicht dir (Systemprozess).' : 'Prozess nicht gefunden.' }; }
}

// ---------- Netzwerk ----------
const nmTeile = (z) => z.split(/(?<!\\):/).map((t) => t.replace(/\\:/g, ':'));
async function wlan() {
  const funk = await lauf('nmcli', ['-t', '-f', 'WIFI', 'radio']);
  if (funk.fehlt) return { ok: false, fehler: funk.fehler };
  const ger = await lauf('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
  const geraete = ger.aus.split('\n').filter(Boolean).map((z) => { const t = nmTeile(z); return { name: t[0], typ: t[1], zustand: t[2], verbindung: t[3] }; }).filter((g) => g.typ !== 'loopback');
  const hat = geraete.some((g) => g.typ === 'wifi');
  let netze = [];
  if (hat) {
    const l = await lauf('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list'], { timeout: 20000 });
    const gesehen = new Set();
    netze = l.aus.split('\n').filter(Boolean).map((z) => { const t = nmTeile(z); return { aktiv: t[0] === '*', ssid: t[1], signal: +t[2] || 0, sicher: !!t[3] && t[3] !== '--' }; })
      .filter((n) => n.ssid && !gesehen.has(n.ssid) && gesehen.add(n.ssid)).sort((a, b) => b.aktiv - a.aktiv || b.signal - a.signal);
  }
  const ip = await lauf('nmcli', ['-t', '-f', 'IP4.ADDRESS,IP4.GATEWAY,IP4.DNS', 'device', 'show']);
  return { ok: true, an: funk.aus.trim() === 'enabled', wlanGeraet: hat, geraete, netze, adressen: ip.aus.split('\n').filter(Boolean).map((z) => z.split(':').slice(1).join(':')) };
}
const wlanSchalten = (an) => lauf('nmcli', ['radio', 'wifi', an ? 'on' : 'off']);
const wlanVerbinden = (ssid, passwort) => lauf('nmcli', ['device', 'wifi', 'connect', String(ssid), ...(passwort ? ['password', String(passwort)] : [])], { timeout: 45000 });
const wlanTrennen = (geraet) => lauf('nmcli', ['device', 'disconnect', String(geraet)]);

async function bluetooth() {
  const s = await lauf('bluetoothctl', ['show'], { timeout: 6000 });
  if (s.fehlt) return { ok: false, fehler: s.fehler };
  if (!s.ok || /No default controller/i.test(s.aus + s.fehler)) return { ok: true, vorhanden: false, an: false, geraete: [] };
  const d = await lauf('bluetoothctl', ['devices'], { timeout: 6000 });
  return { ok: true, vorhanden: true, an: /Powered: yes/.test(s.aus), geraete: d.aus.split('\n').filter((z) => z.startsWith('Device')).map((z) => { const t = z.split(' '); return { adresse: t[1], name: t.slice(2).join(' ') }; }) };
}
const bluetoothSchalten = (an) => lauf('bluetoothctl', ['power', an ? 'on' : 'off'], { timeout: 8000 });

async function tailscale() {
  const r = await lauf('tailscale', ['status', '--json'], { timeout: 8000 });
  if (r.fehlt) return { ok: false, fehler: r.fehler };
  try {
    const j = JSON.parse(r.aus);
    const peers = Object.values(j.Peer || {}).map((p) => ({ name: p.HostName, ip: (p.TailscaleIPs || [])[0], online: !!p.Online, exitMoeglich: !!p.ExitNodeOption, exitAktiv: !!p.ExitNode, os: p.OS }));
    return { ok: true, zustand: j.BackendState, angemeldet: j.BackendState === 'Running', selbst: j.Self ? { name: j.Self.HostName, ip: (j.Self.TailscaleIPs || [])[0] } : null, geraete: peers, anmeldeUrl: j.AuthURL || '' };
  } catch { return { ok: true, zustand: 'Gestoppt', angemeldet: false, geraete: [], fehler: r.fehler }; }
}
const tailscaleExit = (ip) => lauf('tailscale', ['set', '--exit-node=' + (ip || '')], { timeout: 15000 });

// ---------- Ton, Helligkeit, Anzeige, Energie ----------
async function ton() {
  const r = await lauf('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'], { timeout: 5000 });
  if (r.fehlt) return { ok: false, fehler: r.fehler };
  const m = r.aus.match(/Volume:\s*([\d.]+)/);
  const st = await lauf('wpctl', ['status'], { timeout: 5000 });
  const senken = []; let in_ = false;
  for (const z of st.aus.split('\n')) {
    if (/Sinks:/.test(z)) { in_ = true; continue; }
    if (in_ && /Sources:|Filters:|Streams:/.test(z)) break;
    const t = in_ && z.match(/(\*)?\s*(\d+)\.\s+(.+?)\s*(\[vol:.*)?$/);
    if (t) senken.push({ id: +t[2], name: t[3].trim(), aktiv: !!t[1] });
  }
  return { ok: true, vorhanden: !!m, lautstaerke: m ? Math.round(parseFloat(m[1]) * 100) : 0, stumm: /MUTED/.test(r.aus), ausgaben: senken };
}
const tonSetzen = (prozent) => lauf('wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', Math.max(0, Math.min(100, Number(prozent) || 0)) + '%']);
const tonStumm = (an) => lauf('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', an ? '1' : '0']);
const tonAusgabe = (id) => lauf('wpctl', ['set-default', String(Number(id))]);

async function helligkeit() {
  const r = await lauf('brightnessctl', ['-m'], { timeout: 4000 });
  const t = r.aus.trim().split(',');
  return r.ok && t[3] ? { ok: true, vorhanden: true, prozent: parseInt(t[3], 10) } : { ok: true, vorhanden: false, prozent: 100 };
}
const helligkeitSetzen = (p) => lauf('brightnessctl', ['set', Math.max(3, Math.min(100, Number(p) || 50)) + '%']);

async function anzeige() {
  const r = await lauf('wlr-randr', ['--json'], { timeout: 5000 });
  if (!r.ok) return { ok: false, fehler: r.fehler || 'Anzeige nicht lesbar' };
  try {
    return { ok: true, bildschirme: JSON.parse(r.aus).map((b) => ({ name: b.name, beschreibung: b.description || b.make || '', an: b.enabled, skalierung: b.scale, x: b.position?.x, y: b.position?.y,
      modi: (b.modes || []).map((m) => ({ breite: m.width, hoehe: m.height, hz: Math.round(m.refresh), aktiv: !!m.current })) })) };
  } catch (e) { return { ok: false, fehler: 'Antwort von wlr-randr nicht lesbar' }; }
}
const anzeigeSetzen = (name, { skalierung, modus } = {}) => lauf('wlr-randr', ['--output', String(name), ...(skalierung ? ['--scale', String(Number(skalierung))] : []), ...(modus ? ['--mode', String(modus).replace(/[^0-9x@.Hz]/g, '')] : [])]);
const bildschirmStrom = (an) => lauf('sh', ['-c', `wlopm ${an ? '--on' : '--off'} '*' 2>/dev/null || for o in $(wlr-randr --json | python3 -c "import json,sys;[print(o['name']) for o in json.load(sys.stdin)]"); do wlr-randr --output "$o" ${an ? '--on' : '--off'}; done`], { timeout: 8000 });

async function energie() {
  const p = await lauf('powerprofilesctl', ['get'], { timeout: 4000 });
  const l = await lauf('powerprofilesctl', ['list'], { timeout: 4000 });
  const akkuPfad = fs.existsSync('/sys/class/power_supply') ? fs.readdirSync('/sys/class/power_supply').find((n) => n.startsWith('BAT')) : null;
  const akku = akkuPfad ? { prozent: parseInt(lies(`/sys/class/power_supply/${akkuPfad}/capacity`), 10), zustand: lies(`/sys/class/power_supply/${akkuPfad}/status`).trim() } : null;
  return { ok: true, profil: p.ok ? p.aus.trim() : null, profile: [...l.aus.matchAll(/^\*?\s*([a-z-]+):$/gm)].map((m) => m[1]), akku };
}
const energieSetzen = (profil) => lauf('powerprofilesctl', ['set', String(profil).replace(/[^a-z-]/g, '')]);

// ---------- Datum, Tastatur ----------
async function zeit() {
  const r = await lauf('timedatectl', ['show']);
  const d = Object.fromEntries(r.aus.split('\n').filter(Boolean).map((z) => z.split('=')));
  return { ok: true, zeitzone: d.Timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, ntp: d.NTP === 'yes', synchron: d.NTPSynchronized === 'yes' };
}
const zeitzonen = async () => ({ ok: true, liste: (await lauf('timedatectl', ['list-timezones'])).aus.split('\n').filter(Boolean) });
const tastatur = () => ({ ok: true, layout: (lies('/etc/default/keyboard').match(/XKBLAYOUT="?([a-z]+)/) || [])[1] || 'ch', aktiv: process.env.XKB_DEFAULT_LAYOUT || '' });

// ---------- Firewall (nftables) ----------
const PROFILE = { zuhause: 'Zuhause', oeffentlich: 'Öffentlich', strikt: 'Strikt' };
function firewallLesen() {
  const text = lies(NFT_DATEI);
  const m = text.match(/^# ZOS-KONFIG (.+)$/m);
  let k = { an: true, profil: 'zuhause', regeln: [] };
  if (m) { try { k = { ...k, ...JSON.parse(m[1]) }; } catch {} }
  return { ok: true, ...k, profile: PROFILE, ausstehend: fs.existsSync(NFT_DATEI + '.vorher') };
}
function firewallText(k) {
  const sauber = { an: !!k.an, profil: PROFILE[k.profil] ? k.profil : 'zuhause', regeln: (k.regeln || []).map((r) => ({
    port: String(r.port || '').replace(/[^0-9-]/g, '').slice(0, 11), protokoll: r.protokoll === 'udp' ? 'udp' : 'tcp',
    quelle: /^[0-9a-fA-F:.\/]{0,43}$/.test(String(r.quelle || '')) ? String(r.quelle || '') : '', aktion: r.aktion === 'verwerfen' ? 'verwerfen' : 'erlauben', name: String(r.name || '').replace(/[^\w äöüÄÖÜ.-]/g, '').slice(0, 40) })).filter((r) => r.port) };
  const z = ['#!/usr/sbin/nft -f', '# Von ZentraleOS erzeugt. Änderungen über Einstellungen → Firewall.', '# ZOS-KONFIG ' + JSON.stringify(sauber), 'flush ruleset'];
  if (!sauber.an) return { text: z.join('\n') + '\n', sauber };
  const regel = (r) => `    ${r.quelle ? (r.quelle.includes(':') ? 'ip6' : 'ip') + ' saddr ' + r.quelle + ' ' : ''}${r.protokoll} dport ${r.port} ${r.aktion === 'erlauben' ? 'accept' : 'drop'}`;
  z.push('table inet zentraleos {', '  chain eingang {', '    type filter hook input priority 0; policy drop;', '    iif lo accept', '    ct state established,related accept', '    ct state invalid drop');
  z.push(...sauber.regeln.filter((r) => r.aktion === 'verwerfen').map(regel));
  if (sauber.profil !== 'strikt') z.push('    iifname "tailscale0" accept', '    udp dport 41641 accept');
  z.push('    meta l4proto { icmp, ipv6-icmp } ' + (sauber.profil === 'zuhause' ? 'accept' : 'limit rate 2/second accept'), '    udp dport { 68, 546 } accept');
  if (sauber.profil === 'zuhause') z.push('    udp dport 5353 accept');
  z.push(...sauber.regeln.filter((r) => r.aktion === 'erlauben').map(regel));
  z.push('    limit rate 10/second log prefix "ZOS-VERWORFEN " level info', '  }', '  chain weiter { type filter hook forward priority 0; policy drop; }', '  chain ausgang { type filter hook output priority 0; policy accept; }', '}');
  return { text: z.join('\n') + '\n', sauber };
}
const firewallSetzen = (k, opt) => alsRoot('firewall-anwenden', ['60'], { ...opt, eingabe: firewallText(k).text });

// ---------- Programme ----------
const APP_ORTE = () => ['/usr/share/applications', '/usr/local/share/applications', '/var/lib/flatpak/exports/share/applications', path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'), path.join(os.homedir(), '.local/share/applications')];
const SYMBOL_ORTE = () => ['/usr/share/icons/hicolor', path.join(os.homedir(), '.local/share/flatpak/exports/share/icons/hicolor'), '/var/lib/flatpak/exports/share/icons/hicolor', path.join(os.homedir(), '.local/share/icons/hicolor')];
function symbolPfad(name) {
  if (!name) return null;
  if (name.startsWith('/')) return fs.existsSync(name) ? name : null;
  for (const o of SYMBOL_ORTE()) for (const g of ['scalable', '256x256', '128x128', '96x96', '64x64', '48x48']) for (const e of ['svg', 'png']) {
    const p = path.join(o, g, 'apps', `${name}.${e}`); if (fs.existsSync(p)) return p;
  }
  for (const e of ['svg', 'png', 'xpm']) { const p = `/usr/share/pixmaps/${name}.${e}`; if (fs.existsSync(p) && e !== 'xpm') return p; }
  return null;
}
function programme() {
  const liste = new Map();
  for (const ort of APP_ORTE()) {
    let dateien = []; try { dateien = fs.readdirSync(ort).filter((n) => n.endsWith('.desktop')); } catch { continue; }
    for (const d of dateien) {
      const text = lies(path.join(ort, d)); const teil = (text.split(/^\[Desktop Entry\]$/m)[1] || '').split(/^\[/m)[0];
      const w = (k) => (teil.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1];
      if (w('Type') !== 'Application' || w('NoDisplay') === 'true' || w('Hidden') === 'true' || !w('Exec')) continue;
      const id = d.replace(/\.desktop$/, '');
      liste.set(id, { id, name: w('Name\\[de\\]') || w('Name') || id, beschreibung: w('Comment\\[de\\]') || w('Comment') || '', exec: w('Exec').replace(/%[a-zA-Z]/g, '').trim(), terminal: w('Terminal') === 'true',
        symbol: symbolPfad(w('Icon')), kategorien: (w('Categories') || '').split(';').filter(Boolean), flatpak: ort.includes('flatpak'), eigen: ort.includes('.local/share/applications'), wmKlasse: w('StartupWMClass') || '' });
    }
  }
  return { ok: true, liste: [...liste.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}
function programmStarten(id) {
  const p = programme().liste.find((x) => x.id === id);
  if (!p) return { ok: false, fehler: 'Programm nicht gefunden' };
  const k = spawn('sh', ['-c', p.terminal ? `foot -e ${p.exec}` : p.exec], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  k.on('error', () => {}); k.unref();
  return { ok: true };
}
function befehlStarten(zeile) {
  const k = spawn('sh', ['-c', String(zeile)], { detached: true, stdio: 'ignore', cwd: os.homedir() });
  k.on('error', () => {}); k.unref();
  return { ok: true };
}
// Eigene Web-App als Programm ablegen (eigenes Chromium-Fenster ohne Adressleiste).
function webAppAnlegen({ name, adresse }) {
  const sauber = String(name || '').replace(/[^\w äöüÄÖÜ.-]/g, '').trim().slice(0, 40);
  if (!sauber || !/^https?:\/\/[^\s"'`$\\]+$/i.test(String(adresse))) return { ok: false, fehler: 'Name und eine gültige Adresse (http/https) angeben.' };
  const ordner = path.join(os.homedir(), '.local/share/applications'); fs.mkdirSync(ordner, { recursive: true });
  const id = 'zos-webapp-' + sauber.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  fs.writeFileSync(path.join(ordner, id + '.desktop'), `[Desktop Entry]\nType=Application\nName=${sauber}\nExec=chromium --app=${adresse} --class=${id}\nIcon=chromium\nCategories=Network;ZentraleOS;\nStartupWMClass=${id}\n`);
  return { ok: true, id };
}
function eigenesProgrammEntfernen(id) {
  if (!/^zos-[a-z0-9-]+$/.test(String(id))) return { ok: false, fehler: 'Nur eigene Einträge können hier entfernt werden.' };
  try { fs.unlinkSync(path.join(os.homedir(), '.local/share/applications', id + '.desktop')); return { ok: true }; } catch { return { ok: false, fehler: 'Nicht gefunden' }; }
}

// Fenster fremder Programme (Terminal, Browser, Flatpak, Wine) – über den Compositor.
async function fremdeFenster() {
  const r = await lauf('wlrctl', ['toplevel', 'list'], { timeout: 4000 });
  if (!r.ok) return { ok: true, liste: [], verfuegbar: false };
  const liste = r.aus.split('\n').filter(Boolean).map((z) => { const i = z.indexOf(': '); return { app: z.slice(0, i), titel: z.slice(i + 2) }; }).filter((f) => !/zentraleos-shell|^electron$/i.test(f.app) && f.titel !== 'ZentraleOS');
  return { ok: true, liste, verfuegbar: true };
}
const fensterFokus = (app, titel) => lauf('wlrctl', ['toplevel', 'focus', `app_id:${app}`, ...(titel ? [`title:${titel}`] : [])], { timeout: 4000 });
const fensterZu = (app) => lauf('wlrctl', ['toplevel', 'close', `app_id:${app}`], { timeout: 4000 });
const alleMinimieren = () => lauf('sh', ['-c', 'wlrctl toplevel list | cut -d: -f1 | sort -u | grep -v zentraleos-shell | while read a; do wlrctl toplevel minimize "app_id:$a"; done'], { timeout: 6000 });

// ---------- Software (Flatpak) ----------
const FLATHUB = 'https://dl.flathub.org/repo/flathub.flatpakrepo';
const flatpakBereit = () => lauf('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', FLATHUB], { timeout: 60000 });
async function flatpakSuche(text) {
  const b = await flatpakBereit(); if (!b.ok) return { ok: false, fehler: b.fehler };
  const r = await lauf('flatpak', ['search', '--columns=name,description,application,version', String(text)], { timeout: 90000 });
  if (!r.ok) return { ok: false, fehler: r.fehler };
  return { ok: true, liste: r.aus.split('\n').filter((z) => z.includes('\t')).map((z) => { const t = z.split('\t'); return { name: t[0], beschreibung: t[1], id: t[2], version: t[3] }; }).slice(0, 60) };
}
async function flatpakListe() {
  const r = await lauf('flatpak', ['list', '--app', '--columns=name,application,version,installation'], { timeout: 20000 });
  if (r.fehlt) return { ok: false, fehler: r.fehler };
  return { ok: true, liste: r.aus.split('\n').filter((z) => z.includes('\t')).map((z) => { const t = z.split('\t'); return { name: t[0], id: t[1], version: t[2], ort: t[3] }; }) };
}
const flatpakId = (id) => (/^[A-Za-z0-9_.-]+$/.test(String(id)) ? String(id) : null);
async function flatpakInstallieren(id) {
  if (!flatpakId(id)) return { ok: false, fehler: 'Ungültige Kennung' };
  const b = await flatpakBereit(); if (!b.ok) return { ok: false, fehler: b.fehler };
  return lauf('flatpak', ['install', '--user', '-y', '--noninteractive', 'flathub', id], { timeout: 30 * 60_000 });
}
const flatpakEntfernen = (id) => (flatpakId(id) ? lauf('flatpak', ['uninstall', '--user', '-y', '--noninteractive', id], { timeout: 10 * 60_000 }) : { ok: false, fehler: 'Ungültige Kennung' });
const flatpakAktualisieren = () => lauf('flatpak', ['update', '--user', '-y', '--noninteractive'], { timeout: 30 * 60_000 });

// ---------- Terminal (echtes PTY über ein kleines Python-Hilfsprogramm) ----------
const terminals = new Map();
function terminalStarten(id, senden, { shell = null, befehl = null } = {}) {
  terminalBeenden(id);
  const sh = shell || process.env.SHELL || '/bin/bash';
  const args = [path.join(__dirname, 'zos_pty.py'), ...(befehl ? [sh, '-c', befehl] : [sh, '-l'])];
  const k = spawn('python3', args, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'], cwd: os.homedir(), env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
  terminals.set(id, k);
  k.stdout.on('data', (d) => senden({ id, daten: d.toString('utf8') }));
  k.stderr.on('data', (d) => senden({ id, daten: d.toString('utf8') }));
  k.on('error', (e) => senden({ id, ende: true, fehler: e.code === 'ENOENT' ? 'python3 fehlt' : e.message }));
  k.on('exit', (code) => { if (terminals.get(id) === k) terminals.delete(id); senden({ id, ende: true, code }); });
  return { ok: true };
}
function terminalEingabe(id, text) { const k = terminals.get(id); if (k) { try { k.stdin.write(text); } catch {} } return { ok: !!k }; }
function terminalGroesse(id, spalten, zeilen) { const k = terminals.get(id); if (k) { try { k.stdio[3].write(`${Math.max(2, spalten | 0)} ${Math.max(2, zeilen | 0)}\n`); } catch {} } return { ok: !!k }; }
function terminalBeenden(id) { const k = terminals.get(id); if (k) { terminals.delete(id); try { k.kill('SIGHUP'); } catch {} } return { ok: true }; }
const alleTerminalsBeenden = () => { for (const id of [...terminals.keys()]) terminalBeenden(id); };

// ---------- Bildschirmfoto ----------
async function bildschirmfoto(bereich) {
  const ordner = path.join(os.homedir(), 'Bilder'); fs.mkdirSync(ordner, { recursive: true });
  const d = new Date(); const z = (n) => String(n).padStart(2, '0');
  const ziel = path.join(ordner, `Bildschirmfoto ${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}.png`);
  const r = bereich ? await lauf('sh', ['-c', 'grim -g "$(slurp)" "$0"', ziel], { timeout: 60000 }) : await lauf('grim', [ziel], { timeout: 10000 });
  return r.ok ? { ok: true, pfad: ziel } : { ok: false, fehler: r.fehler || 'Bildschirmfoto fehlgeschlagen' };
}

module.exports = {
  lauf, alsRoot, rootVergessen, info, prozesse, beenden,
  wlan, wlanSchalten, wlanVerbinden, wlanTrennen, bluetooth, bluetoothSchalten, tailscale, tailscaleExit,
  ton, tonSetzen, tonStumm, tonAusgabe, helligkeit, helligkeitSetzen, anzeige, anzeigeSetzen, bildschirmStrom, energie, energieSetzen,
  zeit, zeitzonen, tastatur, firewallLesen, firewallSetzen, firewallText,
  programme, programmStarten, befehlStarten, webAppAnlegen, eigenesProgrammEntfernen, fremdeFenster, fensterFokus, fensterZu, alleMinimieren,
  flatpakSuche, flatpakListe, flatpakInstallieren, flatpakEntfernen, flatpakAktualisieren,
  terminalStarten, terminalEingabe, terminalGroesse, terminalBeenden, alleTerminalsBeenden, bildschirmfoto,
};
