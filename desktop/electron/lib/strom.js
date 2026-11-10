// Strom & Bildschirm.
//
// Wichtig: Der HP darf NIE wirklich ausgehen oder schlafen – darauf läuft der Trading-Bot.
// "Ausschalten" in der Oberfläche heisst darum: Anmeldebildschirm zeigen und den
// Monitor abschalten. Windows selbst läuft ganz normal weiter.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { app, powerSaveBlocker, powerMonitor } = require('electron');

let blockerId = null;
let psDatei = null;

// ---------- Energiesparmodus verhindern ----------
function schlafenVerhindern(an) {
  if (an) {
    // "prevent-app-suspension": Rechner bleibt wach, der Bildschirm darf trotzdem aus.
    if (blockerId === null || !powerSaveBlocker.isStarted(blockerId)) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

// ---------- Monitor an/aus (nur Windows) ----------
// SendMessage(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2 = aus / -1 = an)
const PS_SKRIPT = `
param([int]$Modus)
$sig = @'
[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll")]
public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")]
public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
'@
$t = Add-Type -MemberDefinition $sig -Name 'ZentraleStrom' -Namespace 'Win32' -PassThru
if ($Modus -eq -1) {
  # Aufwecken: eine winzige Mausbewegung reicht, damit Windows den Monitor einschaltet
  $t::mouse_event(0x0001, 1, 0, 0, 0)
  Start-Sleep -Milliseconds 40
  $t::mouse_event(0x0001, [uint32]4294967295, 0, 0, 0)
}
$t::SendMessage([IntPtr]0xFFFF, 0x0112, [IntPtr]0xF170, [IntPtr]$Modus) | Out-Null
`;

function skriptPfad() {
  if (psDatei && fs.existsSync(psDatei)) return psDatei;
  psDatei = path.join(app.getPath('temp'), 'zentrale-strom.ps1');
  fs.writeFileSync(psDatei, PS_SKRIPT, 'utf8');
  return psDatei;
}

function powershell(modus) {
  return new Promise((ok) => {
    if (process.platform !== 'win32') return ok({ ok: false, fehler: 'Nur unter Windows' });
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', skriptPfad(), '-Modus', String(modus)],
      { timeout: 10000, windowsHide: true },
      (e, _out, err) => ok(e ? { ok: false, fehler: String(err || e.message).slice(0, 200) } : { ok: true }),
    );
  });
}

// Monitor aus. Vorher kurz warten, sonst macht Windows ihn sofort wieder an,
// weil der Klick auf den Knopf noch als Eingabe zählt.
async function bildschirmAus({ verzoegerung = 900 } = {}) {
  await new Promise((r) => setTimeout(r, verzoegerung));
  return powershell(2);
}

async function bildschirmAn() {
  return powershell(-1);
}

// ---------- Autostart mit Windows ----------
function autostart(an) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { ok: false, fehler: 'Nicht unterstützt' };
  app.setLoginItemSettings({
    openAtLogin: !!an,
    path: process.execPath,
    args: ['--autostart'],
  });
  return { ok: true, an: !!app.getLoginItemSettings().openAtLogin };
}

const autostartAn = () => {
  try { return !!app.getLoginItemSettings().openAtLogin; } catch { return false; }
};

// ---------- Untätigkeit (für automatisches Sperren) ----------
const untaetigSekunden = () => {
  try { return powerMonitor.getSystemIdleTime(); } catch { return 0; }
};

module.exports = { schlafenVerhindern, bildschirmAus, bildschirmAn, autostart, autostartAn, untaetigSekunden };
