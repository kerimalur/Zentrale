# ZentraleOS – Stand, Lücken und Vorschläge (13.11.2026)

Vergleich mit dem, was Windows 11, macOS und ein übliches Linux (Ubuntu, Fedora) mitbringen – und mit dem, was
ZentraleOS darüber hinaus können soll: höchste Sicherheit, so viel Anonymität wie möglich, automatisches Erkennen
und Melden von Zugriffsversuchen.

Zeichen in den Tabellen: **✓** da und in der VM getestet · **◐** gebaut, aber ungetestet oder nur teilweise ·
**✗** fehlt · **–** bewusst weggelassen.

---

## 1. Wo wir stehen

| Bereich | Stand |
|---------|-------|
| Startet vom Stick auf dem HP | ✓ von dir bestätigt (alte Version) |
| Neues ISO (Block A–F, Fotos) | in der VM 0 Fehler (Lauf 43264825828), **auf dem HP noch nicht gestartet** |
| Installation auf die SSD | in der VM ✓ (installieren, von Platte starten, mit Code anmelden). Auf dem HP offen. |
| Echte Zentrale statt Demo | **ungetestet** – erst nach Merge von PR #2 und mit Tailscale auf dem HP sinnvoll |
| MetaTrader 5 unter Wine | **ungetestet** – das grösste Risiko für den eigentlichen Zweck |
| WLAN, Helligkeit, Monitor aus/an, Windows-Taste | auf dem HP offen |

Ehrlich zu deiner Nachricht: **Wireshark** ist im Sicherheitslabor installierbar, **einen Honeypot gibt es noch
nicht** – im Labor steht nur der Hinweis, ihn auf dem Pi oder in einer VM zu betreiben.

---

## 2. Vergleich mit einem normalen Betriebssystem

### 2.1 Start, Konten, Anmeldung

| Funktion | Windows / macOS | ZentraleOS | Was fehlt |
|----------|-----------------|------------|-----------|
| Secure Boot | ✓ Standard | ◐ signierte Startpakete sind drin, ob der HP damit startet: ungeprüft | Test mit Secure Boot an |
| Plattenverschlüsselung | BitLocker / FileVault, entsperrt automatisch über den TPM-Chip | ◐ LUKS bei der Installation wählbar, verlangt aber bei jedem Start ein Passwort | **TPM-Entsperrung** (siehe 3.1) |
| Sperrbildschirm | im System verankert, nicht umgehbar | ◐ in der Oberfläche; fremde Fenster werden jede Sekunde abgelegt | **Sperre auf Ebene des Fenstermanagers** (ext-session-lock) |
| Mehrere Benutzer, Gastkonto | ✓ | ✗ ein Benutzer | für dich unnötig; Gast nur, falls jemand anderes den HP nutzt |
| Windows Hello / Touch ID | ✓ | ✗ | Sicherheitsschlüssel (YubiKey) für Admin-Rechte, siehe 3.6 |
| Fehlversuche beim Code | Sperrzeit | ✓ 10 Fehlversuche → 5 Minuten Pause | **Meldung aufs Handy** bei Fehlversuchen |
| Passwort ändern | ✓ | ✓ | – |

### 2.2 Updates und Wiederherstellung

| Funktion | Windows / macOS | ZentraleOS | Was fehlt |
|----------|-----------------|------------|-----------|
| System-Updates | ✓ | ✓ apt, Wartungsfenster, nie bei offenen Positionen (◐) | – |
| Firmware-Updates (BIOS, SSD) | Windows Update, Hersteller-Tool | ✗ | **fwupd** (holt HP-BIOS-Updates, falls HP sie dort anbietet) |
| Wiederherstellungspunkte | Systemwiederherstellung / Time Machine | ✗ | **Schnappschüsse** (btrfs + Snapper): vor jedem Update automatisch, beim Start auswählbar |
| Zurücksetzen | «PC zurücksetzen» | ✗ nur neu installieren | Wiederherstellung aus Schnappschuss |
| Notfallmodus | abgesicherter Modus | ✓ Wartung im Bootmenü, ◐ Notfall-Sitzung | – |

### 2.3 Treiber und Hardware

| Funktion | Windows / macOS | ZentraleOS | Was fehlt |
|----------|-----------------|------------|-----------|
| Geräte-Manager | ✓ | ✓ Anzeige | Treiber/Firmware-Status je Gerät, «nicht erkannt»-Hinweis |
| Grafik | ✓ | ✓ Intel/AMD (Mesa) | NVIDIA nur mit Zusatztreiber (HP hat vermutlich Intel – prüfen) |
| WLAN, Bluetooth | ✓ | ◐ Firmware drin, auf dem HP ungetestet | Koppeln von Bluetooth-Geräten in den Einstellungen prüfen |
| Ton | ✓ | ✓ PipeWire | Lautstärke pro Programm |
| Mehrere Bildschirme | ✓ anordnen, Hauptbildschirm | ◐ Auflösung/Skalierung | Anordnen per Ziehen |
| Drucker, Scanner | ✓ | ✗ | CUPS + Druckeinstellungen (nur falls du druckst) |
| Kamera/Mikrofon-Schalter | ✓ Datenschutz-Einstellungen | ✗ | Sperren pro Programm (über Flatpak-Rechte) + globaler Schalter |
| Akku/Strom | ✓ | ✓ Ruhezustand aus, Bildschirm aus | Einschalten nach Stromausfall nur in der Firmware (◐ Knopf dorthin) |
| SSD-Pflege | automatisch | ✗ | `fstrim.timer` einschalten |
| Plattengesundheit | Hersteller-Tool | ◐ SMART auf Knopfdruck | **regelmässig prüfen und melden** (smartd) |

### 2.4 Systemeinstellungen

| Bereich | Windows / macOS | ZentraleOS | Was fehlt |
|---------|-----------------|------------|-----------|
| Netzwerk, WLAN, Tailscale | ✓ | ✓ | – |
| Anzeige, Grösse, Schrift | ✓ | ✓ einzeln einstellbar | Nachtlicht (Blaulichtfilter, wlsunset) |
| Personalisierung | ✓ | ✓ Akzentfarbe, Hintergrund, Widgets, Taskleiste | – |
| Sprache, Region, Tastatur | ✓ | ✓ Tastatur, Zeitzone | Sprache der Oberfläche (nur Deutsch – reicht) |
| Standard-Apps | ✓ | ✗ | «Öffnen mit» und Standardprogramm je Dateityp |
| Benachrichtigungen | ✓ pro App | ◐ Mitteilungen, Ruhe-Schalter | pro Quelle ein/aus, Verlauf |
| Datenschutz pro App | ✓ Kamera, Mikrofon, Standort, Dateien | ✗ | Rechte-Seite für Flatpak-Programme (wie Flatseal) |
| Barrierefreiheit | ✓ Lupe, Kontrast, Bildschirmtastatur | ✗ | Lupe und hoher Kontrast reichen für dich |
| Speicher aufräumen | ✓ Speicheroptimierung | ◐ Speicher-Analyse | Knopf «Aufräumen»: Paket-Cache, alte Protokolle, Papierkorb |
| Zeit, Synchronisation | ✓ | ✓ | – |

### 2.5 Was im Hintergrund läuft

| Dienst | Zweck | ZentraleOS |
|--------|-------|-----------|
| NetworkManager, timesyncd, PipeWire, Bluetooth | Netz, Uhr, Ton | ✓ |
| nftables | Firewall | ✓ |
| AppArmor | Programme einsperren | ✓ an, aber nur Standardprofile |
| unattended-upgrades | Sicherheitsupdates | ✓ im Wartungsfenster |
| tailscaled | Zentrale, Fernzugriff | ✓ |
| Oberfläche, Bot-Wächter, Netzwerkwächter, Backup | eigene Dienste | ◐ laufen in der Oberfläche – **stürzt sie ab, stehen sie still** |
| Speicher-Notbremse (earlyoom / systemd-oomd) | verhindert, dass ein volles RAM alles einfriert | ✗ – **wichtig für einen Dauerläufer** |
| journald mit Grössengrenze, logrotate | Protokolle | ◐ Standard; Protokolle gehen im Live-System beim Neustart verloren |
| smartd, fstrim, fwupd | Plattenpflege, Firmware | ✗ |
| auditd | Sicherheitsprotokoll (wer hat was geöffnet) | ✗ |
| Avahi (mDNS), Druckdienst, Telemetrie | Geräte im Netz ankündigen, Statistik | – bewusst nicht drin (gut für Sicherheit) |

**Wichtigste Lücke hier:** Bot-Wächter, Netzwerkwächter und Backup laufen in der Oberfläche. Für einen Rechner,
dessen Zweck der Dauerbetrieb ist, gehören sie in eigene Systemdienste, die auch laufen, wenn die Oberfläche
neu startet oder hängt.

### 2.6 Dateien und Programme

| Funktion | Windows / macOS | ZentraleOS | Was fehlt |
|----------|-----------------|------------|-----------|
| Dateimanager, Papierkorb, Vorschau | ✓ | ✓ | Suche im Dateiinhalt, Zip packen/entpacken prüfen |
| Netzlaufwerke (SMB) | ✓ | ✗ | Nextcloud-Ordner vom Pi einbinden (WebDAV) |
| Cloud-Abgleich | OneDrive / iCloud | ✗ | Nextcloud-Client (Flatpak) |
| Browser, Office, PDF, Bilder, Musik/Video | ✓ | ✓ Brave, Fotos, Vorschau; Office/VLC installierbar | – |
| Mail, Kalender | ✓ | ✗ | Thunderbird installierbar machen |
| Windows-Programme | – | ◐ Wine-Assistent, MT5 ungetestet | **MT5-Test** |

---

## 3. Sicherheit auf dem höchsten Stand

Was es für einen einzelnen Rechner heute gibt, geordnet nach Nutzen für dich. Aufwand: S klein, M mittel, L gross.

### 3.1 Platte verschlüsselt, Neustart trotzdem allein – LUKS mit TPM *(M, sehr wichtig)*
Heute musst du wählen: verschlüsselt (dann braucht jeder Start ein Passwort am Gerät, der Bot kommt nach einem
Stromausfall nicht allein hoch) oder unverschlüsselt (wer die SSD ausbaut, liest alles). Die Lösung von BitLocker:
der Schlüssel liegt im **TPM-Chip** und wird nur herausgegeben, wenn Firmware und Startprogramm unverändert sind.
Unter Linux heisst das `systemd-cryptenroll --tpm2-device=auto`. Ergebnis: Start ohne Eingabe, SSD ausgebaut =
unlesbar. Ob der HP einen TPM 2.0 hat, zeigt der Geräte-Manager – prüfen.

### 3.2 Sperre, die man wirklich nicht umgehen kann *(M, sehr wichtig)*
Heute sitzt die Sperre in der Oberfläche. Das Protokoll **ext-session-lock** (labwc kann es) sperrt auf Ebene des
Fenstermanagers: Stürzt das Sperrprogramm ab, bleibt der Bildschirm gesperrt statt offen. Dazu: Wechsel auf die
Textkonsolen (Strg+Alt+F2) im gesperrten Zustand sperren, nur im Bootmenü «Wartung» erlauben.

### 3.3 Firmware abschliessen *(S, nur du am HP)*
BIOS-Passwort setzen, Start von USB nach der Installation ausschalten, Secure Boot an. Sonst kann jeder mit einem
Stick einen anderen Rechner starten und um alles herum gehen. ZentraleOS kann das nicht selbst einstellen.

### 3.4 USB-Wächter – USBGuard *(S–M, wichtig)*
Blockiert jedes neue USB-Gerät, bis du es erlaubst. Schützt gegen «BadUSB» (ein Stick, der sich als Tastatur
ausgibt und Befehle tippt). Regel: im gesperrten Zustand wird nichts Neues zugelassen, immer Meldung aufs Handy.

### 3.5 Ausgehende Verbindungen sehen und erlauben – OpenSnitch *(M, sehr passend zu deinem Wunsch)*
Die Firewall prüft heute nur, was **herein** will. OpenSnitch fragt bei jedem Programm, das **hinaus** will:
«Brave möchte zu tracker.example – erlauben?» Das ist das «Little Snitch» von Linux. Zeigt sofort, wenn etwas
nach Hause telefoniert, auch ein Schadprogramm oder ein Windows-Programm unter Wine.

### 3.6 Admin-Rechte nur mit Sicherheitsschlüssel *(S, wenn du einen YubiKey kaufst)*
`pam-u2f`: Root-Rechte und die Entsperrung nach einem Neustart zusätzlich nur mit eingestecktem YubiKey. Das
Live-Passwort `1234` gilt nach der Installation nicht mehr – dort setzt du dein eigenes.

### 3.7 Programme einsperren *(M)*
AppArmor-Profile für Brave, die Oberfläche und **besonders für MT5 unter Wine** (Windows-Programme sollen nicht
an deine Dateien kommen). MT5 in einem eigenen Benutzer laufen lassen. Flatpak-Programme sind schon in einer
Sandbox.

### 3.8 Kern härten *(S)*
Teilweise da (sysctl-Werte). Fehlt: Kernel-Lockdown (`lockdown=integrity`), ungenutzte Module sperren
(FireWire, Thunderbolt-DMA ohne Freigabe), `kernel.yama.ptrace_scope`, Speicherschutz-Optionen beim Start.

### 3.9 Integrität und Schadsoftware *(M)*
- **AIDE**: merkt sich Prüfsummen aller Systemdateien und meldet jede Änderung, die nicht von einem Update kommt.
- **ClamAV**: prüft automatisch jede neue Datei in «Downloads» und alles, was über Wine installiert wird.
- **rkhunter** und **Lynis** wöchentlich, Ergebnis als Punktzahl in der Sicherheits-Zentrale.
- **auditd**: Protokoll, wer wann sensible Dateien geöffnet oder Rechte erlangt hat.

### 3.10 Eindringlings-Erkennung im Netz *(M)*
- **Portscan-Erkennung**: Die Firewall protokolliert schon, was sie verwirft. Ein Auswerter erkennt daraus
  Portscans und Anklopf-Versuche aus dem Heimnetz und meldet sie – das ist schon die halbe Honeypot-Wirkung.
- **CrowdSec** oder **Fail2ban**: sperrt Adressen automatisch, die SSH oder andere Dienste durchprobieren.
- **Suricata** (wie ein Virenscanner für Netzwerkverkehr) ist auf dem HP möglich, aber schwer; besser auf dem Pi
  für das ganze Heimnetz.

### 3.11 Honeypot *(M, auf dem Pi oder in einer VM – nicht auf dem Trading-Rechner)*
- **OpenCanary** auf dem Pi: tut so, als wäre ein Windows-Dateiserver, ein Drucker oder SSH offen. Jeder, der darauf
  zugreift, ist verdächtig → sofort Meldung.
- **Köder-Dateien auf dem HP** (Canary-Dateien): z. B. «Passwörter.xlsx» in deinem Ordner. Öffnet sie jemand oder
  ein Programm, gibt es Alarm. Kostet nichts und ist sehr wirksam.

---

## 4. Anonymität – so hoch, wie es geht

Ehrlich vorweg: **Ganz anonym wird dieser Rechner nie**, und das ist gewollt. Dein Broker-Konto, MT5 und das
Tailscale-Konto sind mit deinem Namen verbunden; Tails ist anonym, weil es nach jedem Start alles vergisst – das
Gegenteil eines Dauerläufers. Der richtige Weg ist daher **Trennung**: der Alltag läuft über pi-proton, und für
wirklich anonyme Dinge gibt es einen eigenen, abgeschotteten Bereich.

| Stufe | Was | Schutz | Aufwand |
|-------|-----|--------|---------|
| 1 | **Immer über pi-proton** mit Kill-Switch: die Firewall lässt nur noch Verkehr durch Tailscale hinaus; fällt der Exit-Node weg, geht nichts mehr ins Internet | Heim-IP verborgen, Werbeblocker, kein DNS-Leck | S |
| 2 | **Anonymitäts-Check** in der Sicherheits-Zentrale: öffentliche IP, Land, DNS-Server, IPv6- und WebRTC-Leck | du siehst sofort, ob etwas durchrutscht | S |
| 3 | **Tor Browser** und **Mullvad Browser** in den Empfehlungen | gegen Fingerabdruck im Browser, Tor gegen den VPN-Anbieter selbst | S |
| 4 | **Metadaten entfernen** (mat2): Knopf in Fotos und Dateien, entfernt GPS und Gerät aus Bildern und PDFs | keine Ortsangaben in geteilten Dateien | S |
| 5 | **Anonym-Sitzung wie Tails** im Bootmenü: startet nur im Arbeitsspeicher, aller Verkehr über Tor, nichts wird gespeichert | Tails-Niveau, ohne zweites System | L |
| 6 | **Whonix** als virtuelle Maschine | stärkste Trennung: selbst ein Schadprogramm darin kennt deine echte IP nicht | M (braucht genug RAM) |

Wichtig für den Trading-Teil: Bei Stufe 1 laufen auch MT5 und der Bot über Proton. Manche Broker sehen
wechselnde VPN-Adressen ungern. Vorschlag: MT5 als einzige Ausnahme direkt raus lassen, und das in den
Einstellungen sichtbar machen.

Die zufällige MAC-Adresse bleibt weggelassen, wie von dir entschieden.

---

## 5. Automatisch erkennen und melden – der «Wächter»

Heute melden nur zwei Dinge etwas: der Bot-Wächter (aufs Handy, wenn eine Adresse eingetragen ist) und der
Netzwerkwächter (nur als Hinweis auf dem Bildschirm). Vorschlag: **ein zentraler Wächter als eigener Systemdienst**,
der alle Quellen sammelt, bewertet und meldet.

| Quelle | Erkennt | Stufe |
|--------|---------|-------|
| Firewall-Protokoll | Portscan, wiederholtes Anklopfen von einer Adresse | Warnung |
| Netzwerkwächter | neues Gerät im Heimnetz, neuer Dienst auf dem HP | Warnung |
| OpenSnitch | Programm will zu einem neuen Ziel | Rückfrage |
| USBGuard | neues USB-Gerät, besonders im gesperrten Zustand | Alarm |
| Sperrbildschirm | Fehlversuche beim Code, Entsperren nachts | Warnung / Alarm |
| sudo, SSH, Textkonsole | Anmeldung oder Fehlversuch | Alarm |
| AIDE, Köder-Dateien | Systemdatei geändert, Köder geöffnet | Alarm |
| ClamAV | Schadsoftware in Downloads | Alarm, Datei in Quarantäne |
| SMART, Speicher, Temperatur | Platte schwächelt, RAM voll, zu heiss | Warnung |
| Bot-Wächter | Bot läuft nicht | Alarm |

**Melden:** Mitteilung auf dem HP, Ereignis in der Zentrale (dann siehst du es in ZentraleOS unter Ereignisse &
Fehler) und aufs Handy – über **Telegram**, das die Zentrale schon kennt, oder ntfy auf dem Pi. Alarme sofort,
Warnungen gesammelt.

**Selbst handeln:** Adresse nach Portscan für 24 h sperren; neues USB-Gerät bleibt gesperrt; verdächtige Datei in
Quarantäne; bei «Köder geöffnet» sofort sperren und Bildschirm aus.

---

## 6. Weitere Funktionen, die ich einbauen würde

| Funktion | Nutzen | Aufwand |
|----------|--------|---------|
| Schnappschüsse vor Updates (btrfs + Snapper) | jedes kaputte Update in einer Minute zurück | M |
| Dienste aus der Oberfläche lösen (Wächter, Bot-Wächter, Backup als systemd-Dienste) | laufen auch bei hängender Oberfläche | M |
| Speicher-Notbremse (earlyoom) | ein Speicherfresser friert nie den ganzen HP ein | S |
| Nextcloud-Client + Pi-Ordner im Finder | Dateien zwischen HP, Handy, Pi | S |
| Nachtlicht, Lautstärke pro Programm | Alltag | S |
| Rechte pro Programm (Kamera, Mikrofon, Dateien) | Datenschutz wie bei Windows/macOS | M |
| Firmware-Updates (fwupd) | BIOS-Lücken schliessen | S |
| Zustand des HP an die Zentrale melden (CPU, Temperatur, Platte, Wächter-Note) | in der Zentrale-Übersicht sehen, ob der HP gesund ist | S |

---

## 7. Meine Reihenfolge

1. **Neues ISO auf dem HP testen** – ohne das bauen wir blind weiter.
2. **MT5 unter Wine testen** (Demo-Konto). Läuft es nicht stabil, ist der Zweck des HP in Frage gestellt.
3. **Installation auf dem HP**, danach Firmware abschliessen (3.3).
4. **TPM-Verschlüsselung** (3.1) und **echte Sperre** (3.2) – das sind die zwei Punkte, die «höchste Sicherheit»
   wirklich ausmachen.
5. **Wächter als Systemdienst** mit Telegram-Meldungen (Abschnitt 5) – zuerst mit Firewall-Protokoll,
   Netzwerkwächter, Fehlversuchen und Bot-Wächter.
6. **USBGuard** und **OpenSnitch**.
7. **Kill-Switch über pi-proton** und **Anonymitäts-Check** (Stufen 1–2).
8. **Schnappschüsse**, **earlyoom**, smartd, fstrim.
9. **AIDE, ClamAV, Köder-Dateien**, Honeypot (OpenCanary) auf dem Pi.
10. Danach: Tor/Mullvad-Browser, mat2, Anonym-Sitzung oder Whonix, Komfort-Lücken aus Abschnitt 2.
