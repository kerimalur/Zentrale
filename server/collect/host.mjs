// Werte direkt vom Raspberry Pi: CPU, RAM, Temperatur, Takt, Spannung, Netz, Laufwerke, USB.
import fs from 'node:fs';
import path from 'node:path';
import { hostPath, config } from '../config.mjs';
import { lesen, existiert, ausfuehren } from '../util.mjs';

let letzteCpu = null;

function cpuProzent() {
  const zeile = lesen('/proc/stat', '').split('\n')[0] || '';
  const w = zeile.trim().split(/\s+/).slice(1).map(Number);
  if (w.length < 4) return null;
  const idle = w[3] + (w[4] || 0);
  const gesamt = w.reduce((a, b) => a + b, 0);
  let prozent = null;
  if (letzteCpu) {
    const dG = gesamt - letzteCpu.gesamt;
    const dI = idle - letzteCpu.idle;
    if (dG > 0) prozent = Math.max(0, Math.min(100, Math.round((1 - dI / dG) * 100)));
  }
  letzteCpu = { gesamt, idle };
  return prozent;
}

function speicher() {
  const m = {};
  for (const z of lesen('/proc/meminfo', '').split('\n')) {
    const [k, v] = z.split(':');
    if (v) m[k.trim()] = Number(v.trim().split(' ')[0]) * 1024;
  }
  const total = m.MemTotal || 0;
  const frei = m.MemAvailable ?? m.MemFree ?? 0;
  return { total, benutzt: Math.max(0, total - frei) };
}

function temperatur() {
  const v = Number(lesen('/sys/class/thermal/thermal_zone0/temp'));
  return Number.isFinite(v) ? Math.round(v / 100) / 10 : null;
}

export function governorPfad() {
  for (const p of ['/sys/devices/system/cpu/cpufreq/policy0/scaling_governor', '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor']) {
    if (existiert(p)) return p;
  }
  return null;
}

function takt() {
  const khz = Number(lesen('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq'));
  const max = Number(lesen('/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq'));
  const gp = governorPfad();
  return {
    mhz: Number.isFinite(khz) ? Math.round(khz / 1000) : null,
    maxMhz: Number.isFinite(max) ? Math.round(max / 1000) : null,
    governor: gp ? lesen(gp) : null,
  };
}

function unterspannung() {
  // rpi_volt meldet 1, wenn die Spannung zu tief ist (schwaches Netzteil/Kabel).
  try {
    for (const h of fs.readdirSync('/sys/class/hwmon')) {
      const basis = path.join('/sys/class/hwmon', h);
      if (lesen(path.join(basis, 'name')) === 'rpi_volt') {
        const v = lesen(path.join(basis, 'in0_lcrit_alarm'));
        return v === null ? null : v === '1';
      }
    }
  } catch {}
  return null;
}

function netzZaehler() {
  let rx = 0, tx = 0;
  for (const z of lesen('/proc/net/dev', '').split('\n').slice(2)) {
    const [name, rest] = z.split(':');
    if (!rest) continue;
    const n = name.trim();
    if (!/^(eth|en|wl)/.test(n)) continue;
    const w = rest.trim().split(/\s+/).map(Number);
    rx += w[0] || 0;
    tx += w[8] || 0;
  }
  return { rx, tx };
}

function lanSpeed() {
  for (const n of ['eth0', 'end0']) {
    const s = Number(lesen(`/sys/class/net/${n}/speed`));
    if (Number.isFinite(s) && s > 0) return { name: n, mbit: s, verbunden: lesen(`/sys/class/net/${n}/operstate`) === 'up' };
  }
  return null;
}

function usbInfoFuer(sysPfad) {
  // Läuft vom Block-Gerät nach oben, bis ein USB-Gerät mit "speed" kommt; merkt sich den Treiber (uas = UASP).
  let p;
  try { p = fs.realpathSync(sysPfad); } catch { return null; }
  let treiber = null;
  while (p && p !== '/' && p !== '/sys') {
    const drv = path.join(p, 'driver');
    if (!treiber && existiert(drv)) {
      try {
        const n = path.basename(fs.readlinkSync(drv));
        if (n === 'uas' || n === 'usb-storage') treiber = n;
      } catch {}
    }
    const speed = lesen(path.join(p, 'speed'));
    if (speed && existiert(path.join(p, 'idProduct'))) {
      return { speed: Number(speed), produkt: lesen(path.join(p, 'product')) || lesen(path.join(p, 'manufacturer')) || 'USB-Gerät', uasp: treiber === 'uas', usbName: path.basename(p) };
    }
    p = path.dirname(p);
  }
  return null;
}

async function laufwerke() {
  const mounts = lesen('/proc/1/mounts', '') || lesen('/proc/mounts', '');
  // Pro Partition ein Eintrag (eine SSD kann System und Daten enthalten). Bind-Mounts derselben Partition
  // (z. B. EVO-Ordner unter /mnt/daten) zählen nicht extra: es gilt der kürzeste Einhängepunkt.
  const proPartition = new Map();
  for (const z of mounts.split('\n')) {
    const [dev, mp, typ] = z.split(' ');
    if (!dev || !/^\/dev\/(sd[a-z]+\d*|mmcblk\d+p\d+|nvme\d+n\d+p\d+)$/.test(dev)) continue;
    if (mp.startsWith('/boot')) continue;
    const name = dev.replace('/dev/', '');
    if (!proPartition.has(name)) proPartition.set(name, []);
    proPartition.get(name).push({ partition: name, mount: mp.replace(/\\040/g, ' '), typ });
  }
  const out = [];
  for (const [partition, parts] of proPartition) {
    const disk = partition.startsWith('mmcblk') || partition.startsWith('nvme') ? partition.replace(/p\d+$/, '') : partition.replace(/\d+$/, '');
    const haupt = parts.sort((a, b) => a.mount.length - b.mount.length)[0];
    let gross = 0, frei = 0;
    try {
      const s = await fs.promises.statfs(hostPath(haupt.mount));
      gross = s.blocks * s.bsize;
      frei = s.bavail * s.bsize;
    } catch {}
    const sys = `/sys/block/${disk}`;
    const istSd = disk.startsWith('mmcblk');
    const modell = istSd ? 'SD-Karte' : [lesen(`${sys}/device/vendor`), lesen(`${sys}/device/model`)].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const usb = istSd ? null : usbInfoFuer(sys);
    const hdd = lesen(`${sys}/queue/rotational`) === '1';
    // Name: aus LAUFWERK_NAMEN, sonst Modell. Für «/» nie «SD-Karte», wenn das System inzwischen auf einer SSD liegt.
    let name = config.laufwerkNamen[haupt.mount] || null;
    if (haupt.mount === '/' && name && /sd-karte/i.test(name) && !istSd) name = null;
    if (!name && haupt.mount === '/') name = istSd ? 'SD-Karte (System)' : `${modell || 'SSD'} · System`;
    out.push({
      geraet: disk,
      partition,
      mount: haupt.mount,
      name: name || modell || haupt.mount,
      modell,
      typ: istSd ? 'sd' : hdd ? 'hdd' : 'ssd',
      gross,
      benutzt: Math.max(0, gross - frei),
      frei,
      usb: usb ? { port: usb.speed >= 5000 ? 'USB 3.0' : usb.speed >= 480 ? 'USB 2.0' : 'USB 1.1', uasp: usb.uasp, produkt: usb.produkt } : null,
      schlaeft: null,
    });
  }
  // Schlafzustand nur für Festplatten abfragen (weckt sie nicht auf).
  for (const l of out.filter((l) => l.typ === 'hdd')) {
    const r = await ausfuehren('hdparm', ['-C', `/dev/${l.geraet}`], { timeout: 5000 });
    if (r.ok) l.schlaeft = /standby|sleeping/.test(r.stdout);
  }
  return out.sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));
}

function usbGeraete() {
  const basis = '/sys/bus/usb/devices';
  const liste = [];
  let eintraege = [];
  try { eintraege = fs.readdirSync(basis); } catch { return { geraete: [], belegt: 0 }; }
  for (const n of eintraege) {
    if (!/^\d+-[\d.]+$/.test(n)) continue;
    const p = path.join(basis, n);
    if (lesen(path.join(p, 'bDeviceClass')) === '09') continue; // Hubs auslassen
    liste.push({
      name: n,
      produkt: lesen(path.join(p, 'product')) || lesen(path.join(p, 'manufacturer')) || 'USB-Gerät',
      speed: Number(lesen(path.join(p, 'speed')) || 0),
      position: n.startsWith('1-1.') ? n.split('.').slice(0, 2).join('.') : n.split('.')[0],
    });
  }
  const belegt = new Set(liste.map((g) => g.position)).size;
  return { geraete: liste, belegt };
}

function info() {
  const os = (lesen(hostPath('/etc/os-release'), '') || '').match(/PRETTY_NAME="?([^"\n]+)"?/);
  return {
    modell: (lesen('/proc/device-tree/model', '') || '').replace(/\0/g, '') || 'Raspberry Pi',
    os: os ? os[1] : 'Linux',
    kernel: lesen('/proc/sys/kernel/osrelease', ''),
    hostname: lesen(hostPath('/etc/hostname'), 'homelabkerim'),
    uptimeS: Math.round(Number((lesen('/proc/uptime', '0') || '0').split(' ')[0])),
    last: (lesen('/proc/loadavg', '') || '').split(' ').slice(0, 3).map(Number),
    kerne: Math.max(1, (lesen('/proc/cpuinfo', '') || '').split('\n').filter((z) => z.startsWith('processor')).length),
  };
}

export async function sammleHost() {
  const [lw] = await Promise.all([laufwerke()]);
  return {
    cpu: cpuProzent(),
    ram: speicher(),
    temp: temperatur(),
    takt: takt(),
    unterspannung: unterspannung(),
    netz: netzZaehler(),
    lan: lanSpeed(),
    laufwerke: lw,
    usb: usbGeraete(),
    info: info(),
  };
}

// Erste CPU-Messung als Basis.
cpuProzent();
