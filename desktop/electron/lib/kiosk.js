// Harter Kiosk: die App als Windows-Oberfläche statt des Explorers.
//
// Windows startet nach der Anmeldung das Programm, das in der Registry unter
// HKCU\...\Winlogon\Shell steht – normalerweise explorer.exe. Tragen wir dort
// die Zentrale ein, gibt es keine Taskleiste, kein Startmenü und kein Alt+Tab
// auf einen Desktop dahinter. Der Eintrag gilt nur für DIESEN Benutzer.
//
// Gefahr: Startet die App nicht, siehst du einen leeren Bildschirm. Darum prüfen
// wir vorher, ob es ein zweites Administrator-Konto als Rettungsweg gibt, und
// bieten jederzeit das Zurückstellen an.
const { execFile } = require('node:child_process');
const { app } = require('electron');

const SCHLUESSEL = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
const WERT = 'Shell';

function lauf(befehl, args, { timeout = 15000 } = {}) {
  return new Promise((ok) => {
    execFile(befehl, args, { timeout, windowsHide: true }, (e, out, err) =>
      ok({ ok: !e, text: String(out || ''), fehler: String(err || e?.message || '') }));
  });
}

const nurWindows = () => process.platform === 'win32';

// ---------- Registry ----------

async function shellLesen() {
  if (!nurWindows()) return { ok: false, fehler: 'Nur unter Windows' };
  const r = await lauf('reg.exe', ['query', SCHLUESSEL, '/v', WERT]);
  if (!r.ok) return { ok: true, gesetzt: false, wert: null };   // Wert fehlt = Standard (explorer.exe)
  const m = r.text.match(/Shell\s+REG_SZ\s+(.+)/i);
  const wert = m ? m[1].trim() : null;
  return { ok: true, gesetzt: !!wert, wert };
}

async function shellSetzen(an) {
  if (!nurWindows()) return { ok: false, fehler: 'Nur unter Windows' };
  if (an) {
    const ziel = `"${process.execPath}"`;
    const r = await lauf('reg.exe', ['add', SCHLUESSEL, '/v', WERT, '/t', 'REG_SZ', '/d', ziel, '/f']);
    return r.ok ? { ok: true, wert: ziel } : { ok: false, fehler: r.fehler.slice(0, 200) };
  }
  const r = await lauf('reg.exe', ['delete', SCHLUESSEL, '/v', WERT, '/f']);
  // Fehlt der Wert schon, ist das kein Fehler.
  if (!r.ok && !/nicht gefunden|unable to find|not found/i.test(r.fehler)) return { ok: false, fehler: r.fehler.slice(0, 200) };
  return { ok: true, wert: null };
}

// Ist die eingetragene Shell diese App?
async function kioskAktiv() {
  const s = await shellLesen();
  if (!s.ok || !s.wert) return false;
  return s.wert.replace(/"/g, '').toLowerCase().includes(process.execPath.toLowerCase());
}

// ---------- Rettungsweg prüfen ----------
// Gibt es ausser dem aktuellen Benutzer noch ein aktives Administrator-Konto?
// Die SID S-1-5-32-544 ist die Gruppe «Administratoren», unabhängig von der Sprache.
async function rettungskonten() {
  if (!nurWindows()) return { ok: false, konten: [], fehler: 'Nur unter Windows' };
  const skript = `
$ErrorActionPreference='SilentlyContinue'
$ich = $env:USERNAME
$g = Get-LocalGroup -SID 'S-1-5-32-544'
Get-LocalGroupMember -Group $g | ForEach-Object {
  $n = ($_.Name -split '\\\\')[-1]
  if ($_.ObjectClass -eq 'User' -and $n -ne $ich) {
    $u = Get-LocalUser -Name $n
    if ($u -and $u.Enabled) { Write-Output $n }
  }
}`;
  const r = await lauf('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', skript], { timeout: 25000 });
  const konten = r.text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return { ok: true, konten };
}

// ---------- Programme beim Start (MT5 & Co.) ----------
// Ohne Explorer startet Windows die üblichen Autostart-Programme nicht mehr.
function programmStarten(pfad, argumente = []) {
  return new Promise((ok) => {
    try {
      const { spawn } = require('node:child_process');
      const kind = spawn(pfad, argumente, { detached: true, stdio: 'ignore', windowsHide: false });
      kind.on('error', (e) => ok({ ok: false, fehler: e.message }));
      kind.unref();
      setTimeout(() => ok({ ok: true, pid: kind.pid || null }), 400);
    } catch (e) {
      ok({ ok: false, fehler: e.message });
    }
  });
}

async function programmeStarten(liste) {
  const ergebnis = [];
  for (const p of liste || []) {
    if (!p || !p.pfad) continue;
    const r = await programmStarten(p.pfad, Array.isArray(p.argumente) ? p.argumente : []);
    ergebnis.push({ name: p.name || p.pfad, ...r });
  }
  return ergebnis;
}

// Explorer von Hand nachstarten – als Notnagel aus der App heraus.
async function explorerStarten() {
  if (!nurWindows()) return { ok: false, fehler: 'Nur unter Windows' };
  return programmStarten('explorer.exe', []);
}

module.exports = {
  shellLesen, shellSetzen, kioskAktiv, rettungskonten,
  programmStarten, programmeStarten, explorerStarten,
  version: () => app.getVersion(),
};
