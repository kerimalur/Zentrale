# Fokus-Agent für Windows: meldet, welches Programm gerade vorne ist, an die Zentrale.
# Installation (einmal, normale PowerShell, nicht als Administrator):
#   & ([scriptblock]::Create((irm https://DEINE-ZENTRALE/agent/windows.ps1))) -Adresse https://DEINE-ZENTRALE -Koppeln 123456
param(
  [string]$Koppeln,
  [string]$Adresse,
  [string]$Name = $env:COMPUTERNAME,
  [switch]$Lauf,
  [switch]$Entfernen,
  [switch]$BrowserZaehlen
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Version = '1.0'
$Ordner = Join-Path $env:APPDATA 'FokusAgent'
$ConfigDatei = Join-Path $Ordner 'config.json'
$Skript = Join-Path $Ordner 'fokus-agent.ps1'
$TaskName = 'FokusAgent'
$Browser = @('chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'chromium')

function Config-Lesen { if (Test-Path $ConfigDatei) { Get-Content $ConfigDatei -Raw | ConvertFrom-Json } else { $null } }

function Task-Entfernen {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
}

# ---------- Entfernen ----------
if ($Entfernen) {
  Task-Entfernen
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*fokus-agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (Test-Path $Ordner) { Remove-Item $Ordner -Recurse -Force }
  Write-Host 'Fokus-Agent entfernt. (Das Gerät in der Zentrale kannst du unter Fokus > Geräte entfernen.)'
  return
}

# ---------- Koppeln und installieren ----------
if ($Koppeln) {
  if (-not $Adresse) { throw 'Bitte -Adresse angeben, z. B. https://homelabkerim.taila4b96b.ts.net:8443' }
  $Adresse = $Adresse.TrimEnd('/')
  $antwort = Invoke-RestMethod -Method Post -Uri "$Adresse/api/fokus/agent/koppeln" -ContentType 'application/json' -Body (@{ code = $Koppeln; name = $Name; art = 'windows' } | ConvertTo-Json)
  New-Item -ItemType Directory -Force -Path $Ordner | Out-Null
  @{ adresse = $Adresse; token = $antwort.token; id = $antwort.id; name = $Name; browserZaehlen = [bool]$BrowserZaehlen } | ConvertTo-Json | Set-Content $ConfigDatei -Encoding UTF8

  # Programm und Browser-Erweiterung von der Zentrale holen
  $inhalt = Invoke-RestMethod -Uri "$Adresse/agent/windows.ps1"
  [IO.File]::WriteAllText($Skript, $inhalt, (New-Object System.Text.UTF8Encoding $true))
  $ext = Join-Path $Ordner 'erweiterung'
  New-Item -ItemType Directory -Force -Path $ext | Out-Null
  foreach ($f in 'manifest.json', 'background.js') { Invoke-WebRequest -Uri "$Adresse/agent/browser/$f" -OutFile (Join-Path $ext $f) -UseBasicParsing }
  (Get-Content (Join-Path $ext 'manifest.json') -Raw).Replace('__ADRESSE__', $Adresse) | Set-Content (Join-Path $ext 'manifest.json') -Encoding UTF8
  "const CONFIG = { adresse: '$Adresse', token: '$($antwort.token)' };" | Set-Content (Join-Path $ext 'config.js') -Encoding UTF8

  # Autostart beim Anmelden, unsichtbar (Aufgabenplanung, sonst Autostart-Ordner)
  Task-Entfernen
  $start = Join-Path ([Environment]::GetFolderPath('Startup')) 'FokusAgent.vbs'
  if (Test-Path $start) { Remove-Item $start -Force }
  try {
    $aktion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Skript`" -Lauf"
    $ausloeser = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $einst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $TaskName -Action $aktion -Trigger $ausloeser -Settings $einst -Description 'Fokus-Agent der Zentrale' | Out-Null
    Start-ScheduledTask -TaskName $TaskName
  } catch {
    "CreateObject(`"WScript.Shell`").Run `"powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"`"$Skript`"`" -Lauf`", 0, False" | Set-Content $start -Encoding ASCII
    Start-Process 'wscript.exe' -ArgumentList "`"$start`""
  }
  Write-Host ''
  Write-Host "Gekoppelt als «$Name». Der Agent läuft und startet bei jeder Anmeldung."
  Write-Host "Ordner der Browser-Erweiterung: $ext"
  return
}

# ---------- Dauerbetrieb ----------
if (-not $Lauf) { Write-Host 'Nichts zu tun. Mit -Koppeln installieren oder -Entfernen deinstallieren.'; return }

$cfg = Config-Lesen
if (-not $cfg) { throw 'Nicht gekoppelt.' }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FokusWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  public static uint LeerlaufMs() { LASTINPUTINFO l = new LASTINPUTINFO(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return unchecked((uint)Environment.TickCount - l.dwTime); }
  public static uint VordergrundPid() { uint pid; IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return 0; GetWindowThreadProcessId(h, out pid); return pid; }
}
"@

$namenCache = @{}
function Anzeigename($p) {
  if ($namenCache.ContainsKey($p.ProcessName)) { return $namenCache[$p.ProcessName] }
  $n = $p.ProcessName
  try { $d = $p.MainModule.FileVersionInfo.FileDescription; if ($d -and $d.Trim().Length -gt 1) { $n = $d.Trim() } } catch {}
  $namenCache[$p.ProcessName] = $n
  return $n
}

$puffer = @{}
$jetzt = $null
$tick = 5
$senden = 30
$seit = 0
$kopf = @{ Authorization = "Bearer $($cfg.token)" }

while ($true) {
  Start-Sleep -Seconds $tick
  $seit += $tick
  try {
    $jetzt = $null
    if ([FokusWin]::LeerlaufMs() -lt 120000) {
      $pidV = [FokusWin]::VordergrundPid()
      if ($pidV -gt 0) {
        $p = Get-Process -Id $pidV -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -notin @('LockApp', 'LogonUI', 'idle')) {
          $istBrowser = $Browser -contains $p.ProcessName.ToLower()
          if (-not ($istBrowser -and -not $cfg.browserZaehlen)) {
            $n = Anzeigename $p
            $jetzt = $n
            if ($puffer.ContainsKey($n)) { $puffer[$n] += $tick } else { $puffer[$n] = $tick }
          }
        }
      }
    }
  } catch {}

  if ($seit -ge $senden) {
    $seit = 0
    try {
      $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.' } | ForEach-Object { $_.IPAddress })
      $eintraege = @($puffer.GetEnumerator() | ForEach-Object { @{ art = 'prog'; name = $_.Key; sek = $_.Value } })
      $koerper = @{ version = $Version; eintraege = $eintraege; ips = $ips }
      if ($jetzt) { $koerper.jetzt = @{ art = 'prog'; name = $jetzt } }
      $json = $koerper | ConvertTo-Json -Depth 5
      $null = Invoke-RestMethod -Method Post -Uri "$($cfg.adresse)/api/fokus/agent/bericht" -Headers $kopf -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 10
      $puffer = @{}
    } catch {
      if ($puffer.Count -gt 500) { $puffer = @{} }
    }
  }
}
