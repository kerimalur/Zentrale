#!/bin/bash
# VM-Test: startet das ISO in QEMU (UEFI), meldet sich per PIN an, öffnet Programme,
# führt einen Terminal-Befehl aus, prüft Firewall und Rechte, sperrt wieder.
# Ergebnis: os/ausgabe/test/ (Bildschirmfotos, serielles Protokoll, ergebnis.txt).  Ein Befehl:  os/testen.sh
# Mit KVM dauert das ca. 3 Minuten, ohne (reine Emulation) 15–25 Minuten.
set -uo pipefail
cd "$(dirname "$0")"
ISO="${1:-ausgabe/zentraleos.iso}"; AUS="$PWD/ausgabe/test"; VM="${ZOS_VM_ORT:-/tmp/zos-vm}"
[ -f "$ISO" ] || { echo "ISO fehlt: $ISO (zuerst os/bauen.sh)"; exit 2; }
rm -rf "$AUS" "$VM"; mkdir -p "$AUS" "$VM"
LANGSAM=6; [ -w /dev/kvm ] && LANGSAM=1
Q() { timeout 90 python3 tests/qmp.py "$VM/qmp.sock" "$@" >/dev/null; }
warte() { sleep $(( $1 * LANGSAM )); }
foto() { Q foto "$AUS/$1.png"; }
ERG="$AUS/ergebnis.txt"; : > "$ERG"; FEHLER=0
pruefe() { if eval "$2"; then echo "OK      $1" | tee -a "$ERG"; else echo "FEHLER  $1" | tee -a "$ERG"; FEHLER=$((FEHLER+1)); fi; }
diag() { tr -d "\r" < "$VM/seriell.log" | grep -a "$1" | tail -1; }
aufDiagnose() { local n; n=$(grep -ac "ZOS-DIAGNOSE" "$VM/seriell.log"); for _ in $(seq 1 $(( 16 * LANGSAM ))); do sleep 5; [ "$(grep -ac "=== ENDE" "$VM/seriell.log")" -gt "$n" ] && return 0; done; return 1; }

echo "== VM starten ($([ $LANGSAM = 1 ] && echo KVM || echo 'ohne KVM – langsam')) =="
START=$(date +%s)
tests/vm.sh "$ISO" "$VM" || exit 3
trap 'cp "$VM/seriell.log" "$AUS/seriell.log" 2>/dev/null; kill $(cat "$VM/qemu.pid" 2>/dev/null) 2>/dev/null' EXIT
sleep $(( 4 * LANGSAM )); foto 00-bootmenue
# Bootmenü läuft nach 5 s von selbst weiter. Warten, bis die Diagnose auf der seriellen Schnittstelle erscheint.
for _ in $(seq 1 $(( 40 * LANGSAM ))); do sleep 5; diag "prozesse:" | grep -q electron && break; done; warte 4
echo "Diagnose nach $(( $(date +%s) - START )) s (Wanduhr der VM-Umgebung)" | tee -a "$ERG"
grep -a "start:" "$VM/seriell.log" | tail -1 | tee -a "$ERG"
foto 01-sperrbildschirm
pruefe "System startet bis zur Diagnose"            'grep -aq "=== ENDE" "$VM/seriell.log"'
pruefe "Compositor (labwc) läuft"                   'diag "prozesse:" | grep -q labwc'
pruefe "Shell (Electron) läuft"                     'diag "prozesse:" | grep -q electron'
pruefe "Kein Dienst fehlgeschlagen"                 '[ -z "$(diag "fehlgeschlagen:" | sed "s/.*fehlgeschlagen: *//")" ]'
pruefe "Firewall-Regeln geladen"                    '[ "$(diag "nft:" | sed "s/.*nft: \([0-9]*\).*/\1/")" -gt 5 ]'
pruefe "sudo ohne Passwort wird abgelehnt"          'diag "sudo-ohne-passwort" | grep -qi "password\|passwort"'

echo "== Anmelden per PIN =="
Q taste spc; warte 2; Q tippe 1234; warte 6; foto 02-schreibtisch
echo "== Terminal: Befehl ausführen =="
Q taste ctrl-alt-t; warte 5
Q tippe "echo terminal-geht > /tmp/zos-terminal; python3 -m http.server 8099 >/dev/null 2>&1 &
"; warte 3; foto 03-terminal
echo "== Spotlight -> Einstellungen =="
Q taste meta_l-spc; warte 3; Q tippe "einstellungen"; warte 2; foto 04-spotlight; Q taste ret; warte 5; foto 05-einstellungen
echo "== Firewall von aussen: Port 8099 muss verworfen werden =="
pruefe "Port 8099 von aussen nicht erreichbar"      '! curl -s -m 6 -o /dev/null http://127.0.0.1:${ZOS_VM_PORT:-8099}/'
echo "== Sperren (Super+L) =="
Q taste meta_l-l; warte 4; foto 06-gesperrt
aufDiagnose
pruefe "Terminal-Befehl wurde ausgeführt"           'diag "terminaltest:" | grep -q terminal-geht'
pruefe "Bildschirmfotos nicht leer"                 '[ $(stat -c %s "$AUS/02-schreibtisch.png") -gt 20000 ]'

echo "== Teil 2: Systemtests im laufenden System (Testmodus, Kernel direkt gestartet) =="
kill "$(cat "$VM/qemu.pid")" 2>/dev/null; sleep 3; cp "$VM/seriell.log" "$AUS/seriell-teil1.log"; rm -f "$VM/platte.qcow2"
ZOS_VM_DIREKT=1 tests/vm.sh "$ISO" "$VM" || exit 3
for _ in $(seq 1 $(( 40 * LANGSAM ))); do sleep 5; diag "prozesse:" | grep -q electron && break; done; warte 3
LANGSAM=$([ $LANGSAM = 1 ] && echo 1 || echo 3) node tests/systemtest.cjs "$AUS" 2>&1 | tee "$AUS/systemtest-ausgabe.txt"
ST=${PIPESTATUS[0]}; [ "$ST" = 0 ] || FEHLER=$((FEHLER+1))
echo "Systemtests: $([ "$ST" = 0 ] && echo alle bestanden || echo "nicht alle bestanden (siehe systemtest.txt)")" | tee -a "$ERG"
echo; echo "Fehler: $FEHLER" | tee -a "$ERG"
exit $(( FEHLER > 0 ))
