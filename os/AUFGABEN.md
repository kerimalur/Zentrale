# ZentraleOS – Aufgabenliste (Stand 13.11.2026)

Von Kerim am 12.11. bestellt. Alles aus den Blöcken A bis F ist gebaut. Was davon geprüft ist, steht pro Zeile.

- **getestet (VM)** = im gebauten ISO in einer virtuellen Maschine automatisch geprüft (GitHub-Lauf 43260276861, 0 Fehler).
- **gebaut** = Code ist drin, aber nicht geprüft. Kann Fehler haben.
- **HP offen** = braucht echte Hardware; das kann nur Kerim bestätigen.

Auf dem HP ist von dieser Liste noch **nichts** bestätigt.

## A. Hauptfunktion und Grundlagen

| Nr | Aufgabe | Stand |
|----|---------|-------|
| A1 | Installation auf die SSD ohne Stick (Einstellungen → Installation; eigenes Installationsprogramm statt Calamares) | **getestet (VM)**: installiert, startet ohne ISO von der Platte, Anmeldung mit dem gewählten Code, Terminal läuft als neuer Benutzer. HP offen. |
| A2 | Admin-Passwort `zentrale` wurde abgelehnt | Nicht nachstellbar: in der VM gilt `zentrale`. Wahrscheinliche Ursache: der Stick war gezogen, das System konnte `sudo` nicht mehr laden. Neustart und Ausschalten gehen neu **ohne Passwort** (gebaut, nicht getestet – es würde die Test-VM beenden). |
| A3 | Sperre nicht umgehbar | **getestet (VM)**: gesperrt gibt es keine Root-Aktion, kein Terminal, keinen Programmstart. Gebaut: fremde Fenster werden jede Sekunde abgelegt, keine Standardkürzel des Fenstermanagers mehr, nach Absturz oder Neustart der Oberfläche immer gesperrt. **Grenze:** Die Sperre sitzt in der Oberfläche, nicht im Fenstermanager; ein fremdes Fenster kann bis zu einer Sekunde aufblitzen. Strg+Alt+F2 führt zur Text-Anmeldung, die das Passwort verlangt. |
| A4 | Dauerläufer: Bildschirm aus wie ausgeschaltet, Wecken verlangt den Code | **getestet (VM)**: Wecken entsperrt nicht. Gebaut: Bildschirm aus nach 10 Minuten ohne Eingabe (einstellbar), Maus/Taste/Zentrale-Befehl schaltet ihn ein. Ob der Monitor wirklich abschaltet und wieder aufwacht: HP offen. |
| A5 | «Schlafen gehen»: alles beenden ausser dem Bot | **getestet (VM)**: schliesst Programme, sperrt. Ausnahmeliste in Einstellungen → Ruhe & Schlafen (Standard: terminal64, metatrader, wineserver, bot). Mit einem echten Bot ungetestet. |
| A6 | Keyring-Fenster weg | **getestet (VM)**: der Schlüsselbund-Dienst ist nicht mehr im System, Browser speichern im eigenen Profil. HP offen. |

## B. Aussehen und Bedienung

| Nr | Aufgabe | Stand |
|----|---------|-------|
| B1 | Grössen einzeln und scharf (Einstellungen → Grösse & Schrift): ganze Oberfläche 100–200 %, Symbole, Widget-Inhalt, Taskleiste, Schrift. Standard 125 % | **getestet (VM)** |
| B2 | Widgets bearbeitbar | Bestand schon (Form, Stil, Grösse, Bild, frei platzieren); neu: Inhaltsgrösse, nichts rutscht mehr aus dem Bild. Neue Widget-Arten habe ich nicht gebaut. |
| B3 | Alt+Tab (auch Umschalt+Alt+Tab), Super+Tab = Übersicht | **getestet (VM)**: Wechsel-Logik. Die Taste selbst läuft über denselben Weg wie Strg+Alt+T (getestet). Mit fremden Programmen: HP offen. |
| B4 | Vier Schreibtische (Strg+Super+Pfeil, Anzeige in der Taskleiste) | **getestet (VM)** für Fenster der Oberfläche. Zusammenspiel mit fremden Programmen: gebaut. |
| B5 | Papierkorb (Programm und Symbol auf dem Schreibtisch) | **getestet (VM)** |
| B6 | Bildschirmfoto (Druck, Umschalt+Druck für Bereich, Programm mit Verzögerung; kopiert in die Zwischenablage) | gebaut; das ganze Bild bestand schon, Bereichswahl ungetestet |
| B7 | Zwischenablage-Verlauf (Super+V, nur Text) | gebaut |
| B8 | Fokusmodus: sperrt Seiten für alle Browser, schliesst Programme, Restzeit in der Taskleiste, «streng» nicht abbrechbar | **getestet (VM)**: Seiten-Sperre und Ende. Programme schliessen: gebaut. |
| – | Fotos (Raster nach Monat, Vollbild, Diashow, als Hintergrund, löschen) | öffnet (**getestet**), mit echten Bildern nur lokal kurz geprüft |

## C. Programme

| Nr | Aufgabe | Stand |
|----|---------|-------|
| C1 | Brave vorinstalliert und Standard für «Web» | **getestet (VM)**: ist im Abbild. Start auf dem HP offen. |
| C2–C4 | Anki, Bitwarden, Obsidian (dazu RustDesk, Wireshark, KeePassXC) in Software → Empfohlen | gebaut; Installieren aus Flathub ungetestet |

## D. Sicherheit und Werkzeuge

| Nr | Aufgabe | Stand |
|----|---------|-------|
| D1 | Sicherheits-Zentrale (11 Prüfpunkte mit Ampel) | **getestet (VM)** |
| D2 | Netzwerkwächter (Verbindungen je Programm, lauschende Dienste, Geräte im Netz) | Daten **getestet (VM)**; Meldung bei neuem Gerät/Dienst: gebaut |
| D3 | Sicherheitslabor (nmap vorinstalliert, Schnellprüfungen, weitere Werkzeuge installierbar) | gebaut |
| D4 | Fernzugriff: SSH nur über Tailscale, RustDesk installierbar | gebaut; braucht Tailscale. RustDesk unter Wayland ist fraglich. |
| D5 | Datenträger: Platten, Partitionen, Belegung, Ein-/Aushängen, SMART, Speicher-Analyse | **getestet (VM)**: Platten und Analyse. SMART und Einhängen: gebaut. |

## E. Ergänzungen des Prüfers

| Nr | Aufgabe | Stand |
|----|---------|-------|
| E1 | Bot-Wächter: prüft alle 30 s, startet neu, meldet | **getestet (VM)**: erkennt fehlenden Bot und startet ihn. Meldung aufs Handy (ntfy-Adresse): gebaut. Startskript für MT5: `erweiterungen/mt5-starten.sh` (MT5 selbst weiterhin ungetestet). |
| E2 | Backup auf den Pi (rsync über SSH, täglich) | gebaut, gegen den Pi ungetestet |
| E3 | Plattenverschlüsselung (Option bei der Installation) | gebaut, **ungetestet** |
| E4 | Updates nur im Wartungsfenster (Standard Samstag 10 Uhr), nie bei offenen Positionen (Markierungsdatei) | Fenster setzen **getestet (VM)**; dass Updates dann wirklich aussetzen: gebaut |
| E5 | Nach Stromausfall einschalten | Das ist eine Firmware-Einstellung des HP. Anleitung und Knopf «In die Firmware starten» unter Ruhe & Schlafen. **Kerim muss es dort einstellen.** |
| E6 | Notfall-Sitzung nach sechs Abstürzen der Oberfläche (Passwort, dann Menü) | gebaut, ungetestet |

## F. Selbst bearbeiten

| Nr | Aufgabe | Stand |
|----|---------|-------|
| F1 | Oberfläche unter Windows starten (`os/shell/vorschau.bat`) | gebaut, unter Windows **ungetestet** |
| F2 | Anleitung VM und Dateiübersicht (`os/SELBST-BEARBEITEN.md`) | geschrieben |

## Bekannte Lücken

- Installiert startet das System im Demo-Modus (Testdaten). Ausschalten: Einstellungen → Zentrale. Gegen den echten Pi ist weiterhin nichts getestet.
- Nur UEFI, keine Installation neben Windows (die Platte wird ganz gelöscht).
- Fremde Programme (Brave, Obsidian) folgen nicht der Grösse der Oberfläche, sondern der Bildschirm-Skalierung unter Anzeige.
- Vom HP-Test noch offen: WLAN, Helligkeit, Windows-Taste, Einrasten, Klick auf Widgets.

## Zurückgestellt oder gestrichen

Im Moment nicht: Trading-Cockpit, Wirtschaftskalender, Journal, Modi. Gestrichen: Design-Pakete.


## Runde 13.11. (aus dem HP-Test und ANALYSE.md)

| Aufgabe | Stand |
|---------|-------|
| Bilder, Fotos, Bildschirmfotos schwarz | behoben (Ursache: Datei-Schema galt nur in der falschen Sitzung) – VM-Test prüft es |
| Fenster mit Zentrale-Seite ruckelt beim Ziehen | behoben (Seite bekommt beim Ziehen keine Maus, Glas pausiert) – lokal geprüft, auf dem HP offen |
| Startmenü erscheint hinter Brave | behoben: eigene Ebene über allen Programmen für Startmenü, Suche, Alt+Tab, Übersicht, Zwischenablage, Kontrollzentrum, Mitteilungen. Öffnest du ein Programm der Oberfläche, gehen fremde Fenster in die Taskleiste. Mit labwc lokal geprüft, VM-Test prüft die Logik |
| Doppelte Einträge (Brave/Chromium/Web, Fokus, Trading) | behoben: «Brave» statt Web, Chromium versteckt, «Fokuszeit» für den PC-Fokus, Zentrale-Seiten nicht mehr unter «Alle Programme» |
| Einstellungen durchsuchen | gebaut (Suchfeld oben, mit Stichwörtern) |
| Ohne Akku | Energie zeigt «Netzbetrieb», Akku-Symbol verschwindet |
| Schnappschüsse | Btrfs + Timeshift: täglich, wöchentlich, vor jedem Update; zurücksetzen in den Einstellungen. Nur im installierten System |
| Verschlüsselung | LUKS2; mit TPM-Chip entsperrt die Platte nach dem ersten Start automatisch (auch nach Stromausfall) |
| Echte Sperre | Notfall-Sperre (swaylock, ext-session-lock) springt ein, wenn die Oberfläche abstürzt; Code der Oberfläche oder Passwort. Ungetestet |
| Wächter als Systemdienst | Bot, Netz, Portscans (Sperre 24 h), Anmeldungen, USB, Köder-Datei, Viren in Downloads (wenn ClamAV installiert), SMART, Speicher, Hitze. Meldungen über die Zentrale (Telegram/ntfy) |
| Speicher-Notbremse | earlyoom: zuerst Browser, nie Bot oder Oberfläche |
| USB-Schutz | USBGuard: angeschlossene Geräte beim ersten Start erlaubt, reine Speichersticks immer, alles andere gesperrt bis erlaubt |
| Kern-Härtung | Lockdown, Speicherschutz-Optionen, abgeschaltete Alt-Treiber, strengere sysctl-Werte |
| Anonymität | Prüfung (IP, Exit-Node, IPv6, DNS), Kill-Switch, Tor/Mullvad Browser, Metadaten entfernen |
| Kleine Lücken | Nachtlicht, Lautstärke pro Programm, Standardprogramme, Rechte der Programme, Aufräumen, Firmware-Updates, Wochenprüfung (Lynis, rkhunter, AIDE) |
| Zentrale (Pi) | Endpunkt für Meldungen des HP in PR #2 |

Was der VM-Test davon wirklich prüft, steht im Ergebnis des GitHub-Laufs (vm-test → ergebnis.txt und systemtest.txt).

## Runde 14.11. (Live-Test vom Stick)

| # | Wunsch / Fehler | Stand |
|---|---|---|
| 1 | Symbole und Widgets auf dem Schreibtisch reagieren nicht auf die Maus | Ursache: die Fensterfläche lag unsichtbar darüber. Behoben; der Test prüft jetzt mit echter Treffererkennung (nicht mehr mit einem künstlichen Klick aufs Element). |
| 2 | Updates ohne neuen Stick | «Nach Updates suchen» und «Updates einspielen» holen jetzt auch ZentraleOS selbst aus GitHub (Oberfläche, Wächter, Helfer, eigene Dienste, Fensterregeln). Vor dem Einspielen: Syntaxprüfung aller Dateien, Sicherung des alten Stands; danach startet nur die Oberfläche neu. Dazu «Neu laden» und «Zurück zur vorherigen Version». Braucht eine neue Version andere Bausteine (z. B. Electron), sagt das Update das und ändert nichts. Live vom Stick gilt ein Update nur bis zum Ausschalten. |
| 3 | Administrator-Passwort im Live-System unbekannt | Live-System: jetzt **1234** (wie der Demo-Code), der Passwort-Dialog sagt es im Live-System dazu. Nach der Installation gilt das Passwort, das du bei der Installation festlegst. |
