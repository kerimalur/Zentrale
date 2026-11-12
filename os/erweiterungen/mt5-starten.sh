#!/bin/bash
# Startet MetaTrader 5 aus dem Präfix, das mt5-installieren.sh angelegt hat.
# Gedacht als Startbefehl für den Bot-Wächter (Einstellungen → Bot-Wächter).
PRAEFIX="$HOME/.local/share/zentraleos/wine/mt5"
EXE="$PRAEFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe"
[ -f "$EXE" ] || { echo "MetaTrader 5 ist nicht installiert (Software → Windows-Programme)." >&2; exit 1; }
export WINEPREFIX="$PRAEFIX" WINEARCH=win64 WINEDEBUG=-all
exec wine "$EXE" "$@"
