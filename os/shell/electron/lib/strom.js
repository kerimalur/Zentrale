// Strom & Bildschirm unter ZentraleOS.
//
// Der Rechner soll als Dauerläufer taugen: Standard ist «nie in den Ruhezustand»
// (systemd-Konfiguration im Image), der Bildschirm darf ausgehen.
const { spawn } = require('node:child_process');
const { powerSaveBlocker, powerMonitor } = require('electron');
const system = require('./system');

let blockerId = null;
let waechter = null;

function schlafenVerhindern(an) {
  if (an) {
    if (blockerId === null || !powerSaveBlocker.isStarted(blockerId)) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

// Bildschirm aus. Kurz warten, damit der Klick auf den Knopf ihn nicht gleich wieder weckt.
async function bildschirmAus({ verzoegerung = 900 } = {}) {
  await new Promise((r) => setTimeout(r, verzoegerung));
  const r = await system.bildschirmStrom(false);
  return r.ok ? { ok: true } : { ok: false, fehler: r.fehler || 'Bildschirm liess sich nicht abschalten' };
}
async function bildschirmAn() {
  const r = await system.bildschirmStrom(true);
  return r.ok ? { ok: true } : { ok: false, fehler: r.fehler };
}

// Autostart gibt es hier nicht als Schalter: die Shell IST die Sitzung.
const autostart = () => ({ ok: true, an: true });
const autostartAn = () => true;

// Untätigkeit: unter Wayland meldet Chromium das nicht verlässlich, darum zusätzlich swayidle.
const untaetigSekunden = () => { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } };
function leerlaufWaechter(minuten) {
  if (waechter) { try { waechter.kill(); } catch {} waechter = null; }
  const min = Number(minuten) || 0;
  if (min <= 0) return;
  waechter = spawn('swayidle', ['-w', 'timeout', String(Math.round(min * 60)), 'zos sperren'], { stdio: 'ignore' });
  waechter.on('error', () => { waechter = null; });
}

module.exports = { schlafenVerhindern, bildschirmAus, bildschirmAn, autostart, autostartAn, untaetigSekunden, leerlaufWaechter };
