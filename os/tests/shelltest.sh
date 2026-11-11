#!/bin/bash
# Startet die Shell im Demo-Modus unter Xvfb (für Oberflächentests ohne VM).
export DISPLAY=:9 XDG_CONFIG_HOME=/tmp/zos-test/config HOME=/tmp/zos-test/home
pkill -f "electron . --no-sandbox" 2>/dev/null; sleep 0.5
[ "$1" = frisch ] && rm -rf /tmp/zos-test; mkdir -p $HOME $XDG_CONFIG_HOME
pgrep Xvfb >/dev/null || (Xvfb :9 -screen 0 1440x900x24 >/dev/null 2>&1 &) ; sleep 1
cd "$(dirname "$0")/../shell" && (./node_modules/electron/dist/electron . --no-sandbox --demo --entwicklung --disable-gpu --remote-debugging-port=9333 > /tmp/shell.log 2>&1 &)
sleep 7
