#!/bin/bash
# Startet labwc (ohne Bildschirm) + Shell in einem Debian-13-Container – dieselbe Sitzung wie im ISO,
# aber in Sekunden statt Minuten. Für Fehlersuche an Compositor-Regeln und Oberflächentests.
# Aufruf im Container als Benutzer zentrale:  sitzung-im-container.sh [Sekunden]
export XDG_RUNTIME_DIR=/tmp/rt; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
export WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 XKB_DEFAULT_LAYOUT=ch
mkdir -p ~/.config/labwc; cp /quelle/iso/includes.chroot/etc/xdg/labwc/rc.xml ~/.config/labwc/rc.xml
mkdir -p ~/.local/share/themes; cp -r /quelle/iso/includes.chroot/usr/share/themes/ZentraleOS ~/.local/share/themes/
cat > ~/.config/labwc/autostart <<EOT
wlr-randr --output HEADLESS-1 --custom-mode 1440x900 2>/dev/null
/quelle/shell/node_modules/electron/dist/electron /quelle/shell --no-sandbox --ozone-platform=wayland --class=zentraleos-shell --demo --remote-debugging-port=9444 --remote-debugging-address=0.0.0.0 > /tmp/shell.log 2>&1 &
EOT
labwc > /tmp/labwc.log 2>&1 &
sleep "${1:-12}"
export WAYLAND_DISPLAY=wayland-0
echo "labwc läuft: $(pgrep -c labwc)  electron: $(pgrep -c electron)"; tail -5 /tmp/labwc.log; wlrctl toplevel list; grim /tmp/aus/sitzung.png 2>&1 | tail -1
