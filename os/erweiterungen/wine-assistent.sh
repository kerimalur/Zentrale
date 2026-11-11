#!/bin/bash
# Assistent «Windows-Programm installieren»: führt einen .exe-Installer in einem
# eigenen Wine-Präfix aus (ein Präfix pro Programm).   wine-assistent.sh /pfad/zu/setup.exe
set -u
INSTALLER="${1:-}"
ende() { printf '\n%s\n' "$*"; read -r -p "Enter schliesst dieses Fenster. " _; exit "${2:-0}"; }
[ -f "$INSTALLER" ] || ende "Datei nicht gefunden: $INSTALLER" 1
NAME="$(basename "$INSTALLER" | sed 's/\.[Ee][Xx][Ee]$//; s/[^A-Za-z0-9]\+/-/g' | tr 'A-Z' 'a-z')"
PRAEFIX="$HOME/.local/share/zentraleos/wine/$NAME"
if ! command -v wine >/dev/null 2>&1; then
  echo "Wine wird installiert (Administrator-Passwort nötig) …"
  sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine wine64 wine32:i386 winbind cabextract fonts-liberation fonts-wine || ende "Wine konnte nicht installiert werden." 1
fi
mkdir -p "$PRAEFIX"; export WINEPREFIX="$PRAEFIX" WINEDEBUG=-all
echo "Präfix: $PRAEFIX"
wineboot -u && wine "$INSTALLER"
ende "Installer beendet. Das Programm liegt in: $PRAEFIX/drive_c  – Wine legt Startmenü-Einträge unter ~/.local/share/applications/wine an (erscheinen im Launchpad)."
