# ZentraleOS selbst bearbeiten und testen

Du musst nicht für jede Änderung den Stick neu beschreiben. Drei Wege, vom schnellsten zum gründlichsten.

## 1. Oberfläche direkt unter Windows starten (Sekunden)

**Stand: gebaut, unter Windows nicht getestet.**

Die Oberfläche ist eine Electron-App aus HTML, CSS und JavaScript im Ordner `os/shell`.

1. Node.js installieren (nodejs.org, LTS).
2. Repo holen: `git clone https://github.com/kerimalur/zentrale` und `git checkout os-nacht`.
3. `os\shell\vorschau.bat` doppelklicken. Beim ersten Mal lädt es Electron.
4. Code am Sperrbildschirm: `1234` (Demo-Modus).

Nach einer Änderung an einer Datei: in der Vorschau `Strg + R` drücken, bei Änderungen unter `electron\` das Fenster
schliessen und neu starten. Beenden: `Strg + Alt + Umschalt + Q`.

Was hier geht: Aussehen, Schrift, Symbole, Fenster, Taskleiste, Widgets, Alt+Tab (im Fenster), Einstellungen.
Was hier nicht geht: alles, was Linux braucht (Firewall, WLAN, Geräte, Datenträger, Installation, fremde Programme).

Wo was liegt:

| Was | Datei |
|-----|-------|
| Farben, Glas, Taskleiste, Startmenü | `renderer/css/moos.css` |
| Grundschrift, Knöpfe, Felder | `renderer/css/basis.css` |
| Taskleiste, Startmenü, Widgets, Einrasten | `renderer/js/app-moos.js` |
| Alt+Tab, Schreibtische, Fotos, Papierkorb, Sicherheit, Fokus, Installation | `renderer/js/app-mehr.js` |
| Terminal, Software, Einstellungen (System) | `renderer/js/app-system.js` |
| Standardwerte aller Einstellungen | `electron/lib/einstellungen.js` |
| Tastenkürzel des Systems | `os/iso/includes.chroot/etc/xdg/labwc/rc.xml` |

## 2. Ganzes System in einer virtuellen Maschine (Minuten)

**Stand: der automatische Test läuft genau so (QEMU); VirtualBox selbst habe ich nicht ausprobiert.**

1. Änderung auf den Branch `os-nacht` pushen. GitHub baut das ISO (ca. 20 bis 40 Minuten) und testet es.
2. Unter Actions den Lauf öffnen, Artefakt `zentraleos-iso` herunterladen.
3. VirtualBox: neue Maschine, Typ Linux / Debian 64-bit, 4 GB RAM, 2 Prozessoren, **EFI einschalten**,
   Platte 25 GB, das ISO als optisches Laufwerk einlegen.
4. Starten. Die Installation (Einstellungen → Installation) kannst du dort gefahrlos ausprobieren.

## 3. Stick und HP (für echte Hardware)

Nur noch für das, was eine VM nicht zeigt: WLAN, Bluetooth, Helligkeit, Geschwindigkeit, Bildschirm aus.

## Am einfachsten mit Claude Code

Repo in VS Code öffnen, Claude Code im Ordner `os/` starten und die Änderung beschreiben. `os/AUFGABEN.md` ist die
Liste, `os/FUNKTIONEN.md` beschreibt, was es gibt.
