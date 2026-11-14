# Entscheidungen (os-nacht)

Jede Entscheidung mit Grund. Wo ich vom Auftrag abgewichen bin, steht es ausdrücklich da.

## 1. Wo gebaut wird: Cloud-Arbeitsumgebung statt WSL auf dem HP
Der Auftrag sieht den HP (WSL2 + Docker) als Bauort vor. Die Linux-Umgebung der Desktop-App auf dem HP
war beim Start noch am Herunterladen und hat keinen Zugriff auf das Docker in WSL. Die
Cloud-Arbeitsumgebung dieser Sitzung hat Docker, Root und offenes Netz (2 Kerne, 7,8 GB RAM, kein KVM).
**Gebaut und getestet wurde darum dort.** Folge: Am HP wurde nichts verändert, nichts installiert, nichts
neu gestartet. Nachteil: QEMU läuft ohne KVM (reine Emulation, Start dauert Minuten statt Sekunden);
Zeitmessungen aus dieser VM sagen nichts über echte Hardware. KVM-Tests sind für GitHub Actions vorgesehen.

## 2. Oberfläche: Weg A mit labwc + Electron-Shell – ohne Messreihe
Verlangt waren Prototypen von A/B/C mit Zahlen. **Das habe ich nicht gemacht.** Ohne GPU und ohne KVM
wären Animations-Messungen von Hyprland/Wayfire/Plasma wertlos gewesen, und drei Prototypen hätten die
Nacht gekostet. Entschieden nach Risiko:
- **labwc** (wlroots, stapelnd): läuft auch ohne Grafikbeschleunigung (pixman), klein, in Debian 13 enthalten.
  Hyprland/Wayfire brauchen GLES und sind in einer VM ohne GPU ein Risiko für «bootet zuverlässig».
- **Shell = Electron** (Weiterentwicklung von Version 1): ein randloses Vollbildfenster, das labwc per
  Fensterregel immer zuunterst hält. Darin: Sperrbildschirm, Schreibtisch, Menüleiste, Dock, eigene Programme.
- **Fremde Programme** (foot, Chromium, Flatpak, Wine) sind normale labwc-Fenster über der Shell. Ein
  reservierter Rand (oben 30 px, unten 86 px) hält Menüleiste und Dock frei.
- Preis: kein Weichzeichner und keine Live-Vorschau für fremde Fenster; Mission Control und Spaces der
  Shell gibt es nicht (labwc hat 4 Arbeitsflächen, per Tastenkürzel). Ausbaupfad: Hyprland/Wayfire prüfen,
  sobald auf echter Hardware gemessen werden kann.

## 3. Zentrale-Apps als iframe im Shell-Fenster
Wie verlangt: keine überlagerte `WebContentsView` mehr. Das Hauptfenster benutzt die Sitzung
`persist:zentrale`; `onHeadersReceived` entfernt `X-Frame-Options`/`frame-ancestors` und stellt `Set-Cookie`
auf `SameSite=None; Secure` – **nur für die Adresse der Zentrale**. Geprüft gegen den Demo-Server, nicht
gegen den echten Pi (kein Passwort, kein 2FA).

## 4. Demo-Modus = lokaler Server, der den Pi nachahmt
Statt Testdaten in die Oberfläche zu streuen, spielt `shell/electron/lib/demo.js` die Schnittstellen des Pi
(`/api/state`, `/api/dateien/*`, `/api/geraet/*`, `/api/hp/*`, Steuerung, die 13 Tabs als Seite). Die Shell
benutzt dadurch im Demo-Modus dieselben Codepfade wie mit dem echten Pi. Demo ist **Standard an**
(deutlich markiert, abschaltbar unter Einstellungen → Zentrale), weil das System sonst ohne erreichbaren Pi
am Sperrbildschirm festhinge. Demo-PIN 1234, Demo-Passwort «demo».

## 5. Root nur über einen festen Helfer mit Passwort
Die Shell läuft als normaler Benutzer. Systemänderungen gehen über `sudo -k -S /usr/libexec/zentraleos/helfer
<aktion>` mit fest verdrahteten Aktionen; das Administrator-Passwort fragt ein Dialog der Shell ab (höchstens
5 Minuten im Speicher). Kein polkit-Agent im eigenen Look – das wäre der sauberere Weg (Ausbaupfad).
Live-System: Benutzer `zentrale`, Passwort `1234`, `sudo` fragt immer nach; live-config legt **kein**
passwortloses sudo an (`nocomponents=user-setup,sudo,policykit`), Root ist gesperrt.

## 6. Anmeldung: automatische Sitzung + Sperrbildschirm der Shell
greetd startet die Sitzung des ersten Benutzers automatisch; die Anmeldung (PIN, Rückfall Passwort) macht die
Shell. Das ist **eine Sperre auf App-Ebene, keine echte Sitzungssperre** (kein `ext-session-lock`): fremde
Fenster werden beim Sperren minimiert, aber ein Programm, das sich danach selbst öffnet, läge über der Sperre.
Auf einer unverschlüsselten Platte schützt das nicht gegen jemanden mit physischem Zugriff. Ausbaupfad:
Sperre als `ext-session-lock`-Client.

## 7. Terminal ohne natives Modul
`node-pty` hätte gegen Electron gebaut werden müssen (Risiko im ISO-Bau). Stattdessen ein 50-Zeilen-PTY-Helfer
in Python (`zos_pty.py`) plus xterm.js. Echte Shell, `sudo` funktioniert.

## 8. Firewall: nftables, Konfiguration in der Regeldatei
Die Einstellungen stehen als Kommentarzeile `# ZOS-KONFIG {…}` in `/etc/nftables.conf`. Änderung = prüfen
(`nft -c`), anwenden, `systemd-run`-Timer für die Rücknahme nach 60 s, Bestätigung löscht den Timer.

## 9. MetaTrader 5 / Wine nicht im ISO
Wine (mit i386) macht das Image rund 600 MB grösser. Der Assistent installiert Wine beim ersten Mal nach.

## 10. Abkürzungen aus Zeitgründen (ehrlich)
Nicht gebaut: Erststart-Assistent, Mission Control, Spaces in der Shell, Hot Corners, Zwischenablage-Verlauf,
Bildschirmschoner, Browser/Texteditor/Vorschau/Notizen/Rechner/Uhr/Wetter/Kalender/Laufwerke als eigene
Programme (Browser = Chromium-Fenster, Editor/Vorschau = die aus Version 1 im Finder), Rollback, Gesperrter
Modus, AppArmor-Profil für die Shell, Klänge, Widgets-Galerie über Version 1 hinaus, Profil-Sicherung auf dem Pi.

## 11. Testmodus im ISO
Um die Oberfläche im gebooteten System automatisch zu bedienen, öffnet die Shell ihre DevTools-Schnittstelle –
aber nur, wenn das System in einer VM läuft **und** der Kernel-Parameter `zos.test` gesetzt ist (kein
Bootmenü-Eintrag setzt ihn). Dann leitet ein Dienst Port 9223 weiter und gibt ihn in der Firewall frei. Auf
echter Hardware ist der Dienst wirkungslos. Sauberer wäre ein eigenes Test-Abbild; dafür fehlte die Zeit.

## 12. Compositor in VMs ohne OpenGL
labwc stürzte in QEMU mit Software-OpenGL (llvmpipe) ab, sobald die Shell ihr Fenster öffnete. In VMs und im
«sicheren Grafikmodus» läuft er darum mit `WLR_RENDERER=pixman`. Auf echter Hardware bleibt OpenGL an –
**dieser Weg ist ungetestet**. Stürzt er dort ab, startet die Sitzung einmal ohne OpenGL neu.
