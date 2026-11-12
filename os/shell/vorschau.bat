@echo off
rem Vorschau der ZentraleOS-Oberflaeche unter Windows (Demo-Modus, Testdaten).
rem Braucht Node.js (https://nodejs.org). Systemfunktionen (Firewall, WLAN, Geraete ...) gehen hier nicht.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Erste Einrichtung: lade Electron ...
  call npm install || goto fehler
)
call npx electron . --demo --entwicklung
goto ende
:fehler
echo Einrichtung fehlgeschlagen. Ist Node.js installiert?
pause
:ende
