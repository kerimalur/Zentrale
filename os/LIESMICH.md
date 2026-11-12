# ZentraleOS 0.1 (os-nacht-1)

Ein bootfähiges Linux-System (x86_64, UEFI) mit eigener Oberfläche und der Zentrale als vorinstallierten
Apps. Basis: Debian 13 «trixie», Compositor labwc, Oberfläche («Shell») in Electron.

**Stand in einem Satz:** Das ISO bootet in einer VM bis zum Anmeldebildschirm, Anmeldung per PIN, Schreibtisch,
Zentrale-Apps (Demo), Einstellungen, Terminal und Firewall sind dort getestet – **auf echter Hardware wurde
nichts getestet**, und Installer, MetaTrader 5 und vieles aus dem Auftrag fehlen oder sind ungetestet.
Die ehrliche Liste steht unten.

## USB-Stick erstellen (Windows)

1. ISO herunterladen: GitHub → Repo `Zentrale` → **Actions** → letzter grüner oder gelber Lauf
   «ZentraleOS bauen und testen» auf `os-nacht` → Artefakt **zentraleos-iso** (ZIP entpacken).
2. Prüfsumme vergleichen (PowerShell): `Get-FileHash zentraleos.iso -Algorithm SHA256` – muss zur Zeile in
   `zentraleos.iso.sha256` passen.
3. **balenaEtcher**: «Flash from file» → `zentraleos.iso` → Stick wählen → «Flash».
   Oder **Rufus**: Stick wählen → ISO wählen → bei der Frage **«Im DD-Abbild-Modus schreiben»** wählen → Start.
   Der Stick wird dabei gelöscht. Mindestens 2 GB.

## Starten

1. Stick einstecken, Rechner einschalten, Bootmenü öffnen (HP: `F9`, sonst oft `F12`/`Esc`), den Stick wählen.
   Secure Boot muss dafür **aus** sein (ungetestet mit Secure Boot).
2. Im Bootmenü startet nach 5 Sekunden «ZentraleOS starten». Bleibt der Bildschirm schwarz: neu starten und
   «sicherer Grafikmodus» wählen.
3. Anmeldebildschirm: Taste drücken, PIN **1234** (Demo-Modus). Passwort-Rückfall im Demo-Modus: `demo`.
4. Systembenutzer im Live-System: `zentrale`, Administrator-Passwort `zentrale`.

Vom Stick gestartet wird die SSD nicht angefasst. Alles, was du änderst, ist nach dem Neustart weg.

## Demo-Modus und echter Pi

Standard ist der Demo-Modus (gelbe Marke «DEMO» in der Menüleiste): ein lokaler Server spielt den Pi mit
Testdaten. Ausschalten: **Einstellungen → Zentrale → Demo-Modus**. Die Oberfläche startet neu; danach am
Sperrbildschirm «Mit Zentrale-Passwort anmelden» (Passwort + 2FA), dann PIN neu setzen. Der Rechner muss dafür
im Tailscale-Netz sein (Einstellungen → Tailscale → «Link erzeugen»). **Gegen den echten Pi nicht getestet.**

## Installieren auf die SSD

**Nicht getestet – auf dem HP nicht ausführen, solange dort Windows mit dem Trading-Bot läuft.**
Das Installationsprogramm (Calamares aus Debian) ist im ISO und über Einstellungen → Über → «Installieren»
erreichbar. Ob eine Installation durchläuft, startet und sich anmelden lässt, habe ich nicht geprüft.
Calamares bietet Laufwerkswahl und LUKS an; beides ungeprüft.

## Wartung und Zurücksetzen

- **Wartung:** Bootmenü → «Wartung – Konsole». Textkonsole, Anmeldung mit Benutzer und Passwort. (Eintrag
  vorhanden, Start dieses Eintrags nicht getestet.)
- **Oberfläche hängt:** `Strg+Alt+F2` → anmelden → `pkill labwc` (die Sitzung startet neu).
- **Oberfläche zurücksetzen:** Einstellungen → Verhalten → «Einstellungen zurücksetzen», oder Ordner
  `~/.config/ZentraleOS` löschen (PIN, Kopplung, Einstellungen weg; beginnt wie beim ersten Start).
- **Firewall zurücksetzen:** `sudo cp /usr/share/doc/nftables/examples/workstation.nft /etc/nftables.conf` oder
  in den Einstellungen Firewall aus/an.
- **System zurücksetzen:** neu installieren. Ein Rollback gibt es nicht.

## Tastenkürzel

| Taste | Wirkung |
|---|---|
| `Super + Leertaste` | Spotlight |
| `Super + L` | Sperren |
| `Super + Enter` | Terminal-Fenster (foot) |
| `Strg + Alt + T` | Terminal der Shell |
| `F4` | Launchpad |
| `Super + Q` | fremdes Fenster schliessen |
| `Super + ← / →` | fremdes Fenster links / rechts einrasten |
| `Super + ↑ / ↓` | maximieren / minimieren |
| `Strg + Super + ← / →` | Arbeitsfläche wechseln (4 Stück, nur für fremde Fenster) |
| `Alt + Tab` | zwischen fremden Fenstern wechseln |
| `Druck` | Bildschirmfoto nach `~/Bilder` |
| `Strg + E` / `Strg + ,` | Finder / Einstellungen |
| `Strg + W` / `Strg + M` | Shell-Fenster schliessen / minimieren |
| Lautstärke- und Helligkeitstasten | Ton / Helligkeit |

`Super` ist die Windows-Taste. Die `Super`-Kürzel und die Sondertasten sind in labwc eingetragen; per Tastatur in
der VM geprüft ist davon nur das Starten bis zum Sperrbildschirm (siehe Tabelle).

## Funktionsliste mit Teststatus

«VM» heisst: im gebooteten ISO in QEMU geprüft (Protokoll `ausgabe/test/systemtest.txt`, Bilder in `bilder/`).
«Shell» heisst: nur die Oberfläche unter Xvfb bzw. im Debian-Container geprüft, nicht im gebooteten System.
**Auf echter Hardware getestet: überall nein.**

| Funktion | Getestet in VM | Bemerkung |
|---|---|---|
| ISO baut mit einem Befehl (`os/bauen.sh`) | ja | lokal und in GitHub Actions |
| UEFI-Start: Bootmenü → Kernel → Sitzung | ja | BIOS-Start ungetestet |
| Startanimation (Plymouth) | **nein** | Thema ist gebaut; ob es erscheint, habe ich nicht gesehen |
| Eigenes Bootmenü (Start, sicherer Grafikmodus, Wartung) | teilweise | Standard-Eintrag ja, die anderen nein |
| Anmeldebildschirm, Anmeldung per PIN, falscher PIN abgelehnt | ja | |
| 10 Fehlversuche → 5 Minuten Sperre | Shell | |
| Passwort-Rückfall, Gerät koppeln, Token | Shell | nur gegen den Demo-Server |
| Schreibtisch, Dock, Menüleiste, Fenster der Shell | ja | |
| Zentrale-Apps als Fenster (iframe, nackt), mehrere gleichzeitig live | ja | nur Demo; echter Pi ungetestet |
| Fehlerseite «Erneut versuchen», wenn der Pi fehlt | **nein** | gebaut, nicht ausgelöst |
| Finder: Rechner + «Pi», kopieren in beide Richtungen, Teilen-Link | ja | nur Demo |
| Steuerung (PC, TV, Szenen, Lüfter …) | Shell | nur Demo |
| Fernsteuerung vom Pi (sperren), kein Entsperren aus der Ferne | Shell | nur Demo |
| Anmeldung und Terminal per echter Tastatureingabe (Schweizer Layout) | ja | Teil 1 von `testen.sh` |
| Terminal (echte Shell, `sudo` nur mit Passwort) | ja | Tabs fehlen, mehrere Fenster stattdessen |
| Aktivitätsanzeige (Prozesse, CPU/RAM/Netz, beenden) | ja (Liste) | «Beenden» nicht ausgelöst |
| Launchpad, Spotlight (Programme, Rechner, Befehle) | ja | Spotlight sucht keine Dateien |
| Kontrollzentrum, Mitteilungen | ja (öffnet) | Regler nur ohne Gerät gesehen |
| Fremde Programme als echte Fenster über der Shell, im Dock sichtbar | ja | mit `foot` |
| Kein Root ohne Passwort (Shell-Helfer und Terminal) | ja | |
| Firewall: Standard «eingehend verwerfen», von aussen geprüft | ja | |
| Firewall: Regel setzen, 60-s-Rücknahme ohne Bestätigung, Bestätigen, Entfernen | ja | |
| Firewall: Profile, Protokoll der verworfenen Verbindungen | **nein** | gebaut |
| Einstellungen: 21 Bereiche zeichnen | ja | |
| Zeitzone ändern wirkt im System | ja | |
| Erscheinungsbild live (Akzent, Radius, Glas, Tempo, Schrift, Verlauf) | ja (Akzent, Radius) | |
| WLAN verbinden, Bluetooth, Helligkeit, Akku, Energieprofile | **nein** | in der VM gibt es die Geräte nicht |
| Ton | teilweise | PipeWire läuft, Lautstärke lesbar; hörbar ungeprüft |
| Anzeige (Auflösung, Skalierung) | teilweise | lesen ja, setzen nein |
| Tastatur Schweiz als Standard | ja | Layoutwechsel nein |
| Benutzerpasswort ändern, Hostname, SSH an/aus, Auto-Updates | **nein** | gebaut |
| Systemupdates (apt) über die Oberfläche | **nein** | gebaut; kein Rollback |
| Software: Flathub-Suche | ja | 44 Treffer im CI-Lauf |
| Software: Installieren / Entfernen (Flatpak) | **nein** | gebaut |
| Web-Apps anlegen | **nein** | gebaut |
| Tailscale installiert, Dienst läuft | ja | Zustand «NeedsLogin» |
| Tailscale anmelden, Exit-Node | **nein** | braucht dein Konto |
| Sperren zeigt Anmeldebildschirm; gesperrt keine Root-Aktion, kein Terminal | ja | Sperre ist app-seitig, siehe ENTSCHEIDUNGEN 6 |
| Bildschirm aus beim Sperren | **nein** | |
| Bildschirmfoto | **nein** | |
| Installation auf Platte, LUKS | **nein** | Calamares nur beigelegt |
| MetaTrader 5 / Wine-Assistent | **nein** | siehe MT5-BERICHT.md |
| Start unter 25 Sekunden | **nicht belegt** | 9,6 s in der KVM-VM, kein Wert für echte Hardware |
| 60 fps der Animationen | **nicht gemessen** | VM ohne Grafikkarte |

## Nicht gebaut (aus dem Auftrag)

Erststart-Assistent · Mission Control · Spaces in der Shell · Hot Corners · Zwischenablage-Verlauf ·
Bildschirmschoner · Drag-and-Drop zwischen Programmen · eigene Programme für Browser (es ist Chromium als
fremdes Fenster), Texteditor und Vorschau (nur die aus Version 1 im Finder), Notizen, Rechner, Uhr, Wetter,
Kalender, Laufwerke · Rollback · Gesperrter Modus · AppArmor-Profil der Shell · Klänge · eigenes Symbolset für
fremde Programme · Profil-Sicherung auf dem Pi (nur Export/Import als Datei) · Widgets über Version 1 hinaus ·
Datenschutz-Bereich · Standardprogramme · Autostart · Bedienungshilfen · Maus/Trackpad · Sprache und Region ·
polkit-Dialog im eigenen Look · echte Sitzungssperre.

## Bauen und testen

```bash
os/bauen.sh     # braucht Docker (privilegiert) und Node 20+ → os/ausgabe/zentraleos.iso
os/testen.sh    # braucht qemu-system-x86, ovmf, xorriso, Node 22 → os/ausgabe/test/
```

`testen.sh` Teil 1 startet das ISO über UEFI und Bootmenü und bedient es per Tastatur. Teil 2 startet denselben
Kernel direkt mit dem Parameter `zos.test`; nur dann und nur in einer VM öffnet das System die
DevTools-Schnittstelle der Shell (Port 9223), über die `tests/systemtest.cjs` die Oberfläche bedient und von
aussen prüft, ob die Wirkung eintritt. **Dieser Testmodus ist im ISO enthalten**, aber ausserhalb einer VM wirkungslos.

## Aufbau

```
os/
  bauen.sh, testen.sh
  iso/            live-build: Paketlisten, Hook, Systemdateien (labwc, greetd, nftables, Plymouth, Helfer)
  shell/          die Oberfläche (Electron): electron/ Hauptprozess, renderer/ Oberfläche
  erweiterungen/  Assistenten (MT5, Wine), landet unter /opt/zentraleos/erweiterungen
  tests/          VM-Start, QMP-Steuerung, Systemtests
  bilder/         Bildschirmfotos
```
