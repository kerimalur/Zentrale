#!/bin/bash
# Assistent «MetaTrader 5 installieren» für ZentraleOS.
# - lädt den OFFIZIELLEN Installer von MetaQuotes zur Laufzeit (nichts ist mitgeliefert)
# - legt ein eigenes Wine-Präfix an (~/.local/share/zentraleos/wine/mt5)
# - legt einen Programmeintrag an (Launchpad, Spotlight, Dock)
# Entfernen:  mt5-installieren.sh --entfernen
set -u
PRAEFIX="$HOME/.local/share/zentraleos/wine/mt5"
EINTRAG="$HOME/.local/share/applications/zos-mt5.desktop"
URL="https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
fett() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ende() { printf '\n%s\n' "$*"; read -r -p "Enter schliesst dieses Fenster. " _; exit "${2:-0}"; }

if [ "${1:-}" = "--entfernen" ]; then
  fett "MetaTrader 5 entfernen"
  read -r -p "Wirklich das ganze Präfix löschen (inkl. Konten-Einstellungen und Experten)? [j/N] " a
  [ "$a" = j ] || ende "Abgebrochen."
  WINEPREFIX="$PRAEFIX" wineserver -k 2>/dev/null
  rm -rf "$PRAEFIX" "$EINTRAG"
  ende "MetaTrader 5 wurde entfernt."
fi

fett "MetaTrader 5 installieren"
echo "MetaTrader 5 ist ein Windows-Programm und läuft hier über Wine."
echo "Der Installer kommt direkt von MetaQuotes: $URL"

if ! command -v wine >/dev/null 2>&1; then
  fett "Schritt 1/4: Wine installieren (Administrator-Passwort nötig, ca. 600 MB)"
  sudo dpkg --add-architecture i386 && sudo apt-get update \
    && sudo apt-get install -y wine wine64 wine32:i386 winbind cabextract fonts-liberation fonts-wine \
    || ende "Wine konnte nicht installiert werden. Besteht eine Internetverbindung?" 1
else
  fett "Schritt 1/4: Wine ist vorhanden ($(wine --version 2>/dev/null))"
fi

fett "Schritt 2/4: Eigenes Präfix anlegen"
mkdir -p "$PRAEFIX"
export WINEPREFIX="$PRAEFIX" WINEARCH=win64 WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml="
wineboot -u || ende "Das Wine-Präfix konnte nicht angelegt werden." 1
wine reg add 'HKCU\Software\Wine' /v Version /t REG_SZ /d win10 /f >/dev/null 2>&1

fett "Schritt 3/4: Offiziellen Installer laden"
curl -fL --progress-bar -o "$PRAEFIX/mt5setup.exe" "$URL" || ende "Download fehlgeschlagen." 1

fett "Schritt 4/4: Installer ausführen (ein Fenster öffnet sich – dort «Weiter» klicken)"
unset WINEDLLOVERRIDES
wine "$PRAEFIX/mt5setup.exe"
EXE="$PRAEFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe"
[ -f "$EXE" ] || ende "terminal64.exe wurde nicht gefunden – die Installation ist nicht fertig geworden." 1

mkdir -p "$(dirname "$EINTRAG")"
cat > "$EINTRAG" <<EOT
[Desktop Entry]
Type=Application
Name=MetaTrader 5
Comment=Trading-Plattform (Windows-Programm über Wine)
Exec=env WINEPREFIX="$PRAEFIX" WINEDEBUG=-all wine "$EXE"
Icon=wine
Categories=Office;Finance;ZentraleOS;
StartupWMClass=terminal64.exe
EOT
ende "Fertig. MetaTrader 5 steht jetzt im Launchpad und in Spotlight."
