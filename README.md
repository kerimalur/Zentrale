# Kerims Zentrale

Dashboard für den Raspberry Pi **homelabkerim**: Status der 6 Dienste, Pi-Werte, Netz, Speicher & Backup, Gäste, SSH-Konsole und Szenen.
Erreichbar von all deinen Geräten über Tailscale: **https://homelabkerim.taila4b96b.ts.net:8443**

---

## Einrichten (ca. 20 Minuten)

### 1. Ordner vom PC auf den Pi kopieren
In **PowerShell auf dem Windows-PC**:
```powershell
scp -r "$env:USERPROFILE\Documents\Organisation\Homelab\zentrale" kerim@homelabkerim:~/
```

### 2. Auf dem Pi an den richtigen Ort verschieben
```bash
ssh kerim@homelabkerim
sudo mv ~/zentrale /mnt/daten/zentrale
sudo chown -R kerim:kerim /mnt/daten/zentrale
cd /mnt/daten/zentrale
```

### 3. Schlüssel für die SSH-Konsole erstellen
Das Dashboard meldet sich mit einem eigenen Schlüssel bei dir an (kein Passwort gespeichert):
```bash
mkdir -p data/ssh
ssh-keygen -t ed25519 -N "" -C zentrale -f data/ssh/id_ed25519
cat data/ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

### 4. Einstellungen
```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 18      # Vorschlag für ein Passwort
nano .env                    # ZENTRALE_PASSWORT eintragen, speichern: Ctrl+O, Enter, Ctrl+X
```
Für den Start reicht `ZENTRALE_PASSWORT`. Die anderen Schlüssel kannst du später nachtragen (siehe unten).

### 5. Bauen und starten
```bash
docker compose up -d --build     # beim ersten Mal 5–10 Minuten
docker logs -f zentrale          # sollte "[zentrale] läuft auf http://127.0.0.1:3030" zeigen, beenden mit Ctrl+C
```

### 6. Von überall erreichbar machen (nur für deine Tailscale-Geräte)
```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3030
sudo tailscale serve status
```
Vaultwarden bleibt auf `https://homelabkerim.taila4b96b.ts.net` (Port 443) unverändert.
Jetzt auf PC oder Handy öffnen: **https://homelabkerim.taila4b96b.ts.net:8443**
Tipp Pixel: in Chrome ⋮ → „Zum Startbildschirm hinzufügen" → wie eine App.

### 7. Homepage entfernen (wird durch die Zentrale ersetzt)
```bash
cd /mnt/daten/homepage && docker compose down
```

---

## Schlüssel nachtragen (für mehr Daten)

Nach jeder Änderung an `.env`:
```bash
cd /mnt/daten/zentrale && docker compose up -d --force-recreate
```

| Was | Wo holen | In `.env` |
|---|---|---|
| Pi-hole-Zahlen | Pi-hole-Weboberfläche → Settings → Web interface / API → oben rechts „Expert" → **Configure app password** | `PIHOLE_PASSWORT` |
| Syncthing | Syncthing-Oberfläche → Aktionen → Einstellungen → Allgemein → **API-Schlüssel** | `SYNCTHING_API_KEY` |
| Jellyfin (Filme, Streams, Gäste-Konten) | Jellyfin → Dashboard → **API-Schlüssel** → + | `JELLYFIN_API_KEY` |
| Uptime Kuma | Kuma → Einstellungen → **API-Schlüssel** → Hinzufügen | `KUMA_API_KEY` |
| ntfy-Alarme | ntfy-Container auf dem Pi (`/mnt/daten/ntfy`), Benutzer `zentrale` mit nur Schreibrecht auf das Topic, `ntfy token add zentrale` | `NTFY_URL=http://127.0.0.1:2586`, `NTFY_TOKEN`, `NTFY_TOPIC` |
| Telegram-Alarme | Telegram: **@BotFather** → `/newbot` → Token. Dem neuen Bot „hallo" schreiben, dann `https://api.telegram.org/bot<TOKEN>/getUpdates` öffnen → `"chat":{"id":…}` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Gäste | login.tailscale.com → Settings → Keys → **Generate access token** (läuft nach höchstens 90 Tagen ab, dann neu erstellen) | `TS_API_KEY` |

**Medien (Arr-Stack + Proton VPN):**

| Was | Wo holen | In `.env` |
|---|---|---|
| qBittorrent | dein Login der qBittorrent-Weboberfläche (`http://homelabkerim.taila4b96b.ts.net:8085`) | `QBIT_USER`, `QBIT_PASSWORT` |
| Sonarr / Radarr / Lidarr / Prowlarr | jeweilige App → **Settings → General → API Key** | `SONARR_API_KEY`, `RADARR_API_KEY`, `LIDARR_API_KEY`, `PROWLARR_API_KEY` |
| Seerr | Seerr → **Settings → General → API Key** | `SEERR_API_KEY` |
| Bazarr | Bazarr → **Settings → General → Security → API Key** | `BAZARR_API_KEY` |

Für die Drosselung beim Filmabend in qBittorrent unter **Optionen → Geschwindigkeit → Alternative Geschwindigkeitsbegrenzungen** z. B. 2 MiB/s Download eintragen. Die Zentrale schaltet beim Filmabend darauf um und danach wieder zurück.

**Nextcloud-Token** (optional, für Anzahl Dateien und aktive Nutzer):
```bash
TOKEN=$(openssl rand -hex 24)
docker exec -u www-data nextcloud php occ config:app:set serverinfo token --value "$TOKEN"
echo "NEXTCLOUD_TOKEN=$TOKEN" >> /mnt/daten/zentrale/.env
```
Falls die Kachel danach „Nextcloud 400" meldet: `homelabkerim.taila4b96b.ts.net` muss in Nextclouds `trusted_domains` stehen.

---

## Gäste (Jellyfin + Pi-hole)

1. `TS_API_KEY` und `JELLYFIN_API_KEY` eintragen.
2. Im Dashboard → **Gäste**. Beim ersten Mal erscheint „Einmalig: Zugriffsregeln einrichten" mit fertigen Regeln (die IP deines Pi ist schon drin).
3. Auf **login.tailscale.com → Access controls** den Block `hosts` ergänzen und den bisherigen `acls`- oder `grants`-Block durch den angezeigten `grants`-Block ersetzen. Andere Blöcke (z. B. `ssh`, `tagOwners`) stehen lassen. Speichern.
4. Im Dashboard **Nochmal prüfen**. Danach kannst du Gäste einladen.

Was die Regeln bewirken: Du (Besitzer/Admin) darfst alles. Alle anderen Mitglieder deines Tailscale-Netzes, also die Gäste, erreichen **nur** Jellyfin (Port 8096) und Pi-hole (DNS, Port 53) auf dem Pi. Nextcloud, Vaultwarden, SSH, das Dashboard und deine anderen Geräte bleiben für sie gesperrt.

Läuft ein Gast ab oder entfernst du ihn, löscht das Dashboard seine Geräte aus Tailscale (Zugang sofort weg) und sein Jellyfin-Konto. Falls Tailscale das Löschen des Nutzers selbst nicht erlaubt, siehst du einen Hinweis. Dann den Nutzer unter login.tailscale.com → Users von Hand entfernen.

---

## Wenn die Bestellung da ist

### Samsung 860 EVO (Nextcloud-Daten)
1. Ins Ugreen-2,5"-Gehäuse, am **blauen** USB-3.0-Port anschliessen.
2. `lsblk` → Gerät finden (z. B. `sdb`). **Achtung, löscht alles auf der EVO:** `sudo mkfs.ext4 -L evo /dev/sdb1` (vorher mit `sudo fdisk /dev/sdb` eine Partition anlegen, falls keine da ist).
3. `sudo mkdir -p /mnt/evo` · `sudo blkid /dev/sdb1` → UUID kopieren
4. In `/etc/fstab` eintragen: `UUID=<uuid>  /mnt/evo  ext4  defaults,noatime,nofail  0  2` → `sudo mount -a`
5. Nextcloud-Daten umziehen machen wir zusammen (Container stoppen, kopieren, Pfad in der Nextcloud-`compose.yml` ändern).

### Backup-HDD (alte Samsung 1 TB)
1. Ins Ugreen-3,5"-Gehäuse **mit Netzteil**, an einen freien USB-Port.
2. Zustand prüfen: `sudo apt install smartmontools` → `sudo smartctl -a /dev/sdX` (bei vielen „Reallocated Sectors" lieber eine neue Platte nehmen).
3. Formatieren und einhängen wie oben, aber nach `/mnt/backup` mit Label `backup`.
4. In `.env`:
   ```
   BACKUP_ZIEL=/mnt/backup
   BACKUP_DISK=/dev/disk/by-id/usb-…     # ls -l /dev/disk/by-id/ | grep usb
   ```
5. `docker compose up -d --force-recreate` → im Dashboard unter **Speicher** → „Backup jetzt starten".

Das Backup sichert jede Nacht um 03:00 Uhr `/mnt/daten` (mit sauberen Kopien der Nextcloud-Datenbank und des Vaultwarden-Tresors) nach `/mnt/backup/zentrale-backup/aktuell`. Geänderte oder gelöschte Dateien bleiben 30 Tage lang unter `…/aeltere/<Datum>`. Wenn die HDD nicht eingehängt ist, bricht das Backup ab, statt die SSD vollzuschreiben.

### Lüfter (2× Coolink 5 V PWM)
Für **stufenlose** Regelung braucht es den Hardware-PWM-Pin **GPIO 18 (Pin 12)**, nicht GPIO 14.
1. Verkabeln mit Dupont-Jumperkabeln (Buchse–Buchse):
   - Rot → **5 V (Pin 4)**
   - Schwarz → **GND (Pin 6)**
   - Blau (PWM) → **GPIO 18 (Pin 12)**
   - Gelb (Tacho) → frei lassen
   Beide Lüfter dürfen sich die Pins teilen. Datenblatt kurz prüfen, ob der PWM-Eingang 3,3-V-Signale verträgt (bei Noctua/Coolink normalerweise ja).
2. `sudo nano /boot/firmware/config.txt` → ganz unten ergänzen: `dtoverlay=pwm,pin=18,func=2` → `sudo reboot`
3. In `.env`: `LUEFTER_PWM=auto` → `docker compose up -d --force-recreate`

Regelung: unter 50 °C aus, dann 30 % bis 100 % bei 70 °C. In der Nacht-Szene höchstens 40 % (ausser es wird über 65 °C warm).

### Energie
Ein Shelly-Messstecker (z. B. Shelly Plug S Gen3) zwischen Steckdose und Mehrfachstecker (Pi + HDD). In `.env`: `SHELLY_URL=http://<IP des Shelly>`. Ohne Shelly zeigt das Dashboard eine Schätzung (mit * markiert).

---

## Aktualisieren
Der Code liegt im privaten GitHub-Repo `kerimalur/Zentrale`. Auf dem Pi (Einstellungen in `.env` und `data/` bleiben erhalten):
```bash
cd /mnt/daten/zentrale && git pull && docker compose up -d --build
```

---

## Einstellungen (Tab „Einstellungen")
Alles, was man schalten kann, an einem Ort: Szenen, Backup (automatisch ein/aus + „jetzt starten"), allgemeine Einstellungen (Nacht-Szene, Telegram, Lüfter, HDD-Schlaf, SSH) und die Steuerung unten.

### Steuerung

- **Notbetrieb**: stoppt Gluetun, qBittorrent, Sonarr/Radarr/Lidarr/Prowlarr, Seerr, FlareSolverr, Jellyfin und Uptime Kuma. „Alles wieder starten" startet nur, was der Notbetrieb gestoppt hat.
- **Ein/Aus pro Dienst**: qBittorrent startet das VPN automatisch mit; VPN aus schaltet qBittorrent mit aus.
- **Geschützt** (nicht abschaltbar): Tailscale, Zentrale, Nextcloud + Datenbank, Vaultwarden, Pi-hole, Syncthing. Weitere abschaltbare Container: `ABSCHALTBAR=name1,name2` in `.env`.
- **Pi neu starten**: kommt nach ca. 2 Min von selbst wieder.
- **Pi ausschalten**: nur für Notfälle – einschalten geht danach nur zu Hause (Netzteil aus- und einstecken).

## Speicher-Explorer
Im Tab **Speicher** auf ein Laufwerk tippen → Fenster mit Ordnern, Dateien und Grössen (nur anschauen, nichts wird verändert). Ordnergrössen rechnet der Pi im Hintergrund aus (`du -x`, 10 Min zwischengespeichert). Ordner, die auf einem anderen Laufwerk liegen (z. B. `medien` → EVO), sind markiert; ein Tipp wechselt dorthin.

## Automatisches Backup
Standard **aus**. Ein-/ausschalten unter **Einstellungen → Backup**. „Backup jetzt starten" geht immer.

## Was wo passiert

| Seite | Inhalt | Quelle |
|---|---|---|
| Übersicht | 6 Dienste mit Status, Antwortzeit, Kennzahl, Verlauf; Szenen; Ereignisse & Fehler | Docker, HTTP-Checks, APIs |
| System | CPU, RAM, Temperatur, Lüfter, Energie + 24-Std-Verlauf, Anschlüsse (USB 2/3, UASP, LAN, Netzteil), Updates | /proc, /sys, Docker, apt |
| Fokus | Zeit pro App, Programm und Webseite auf allen gekoppelten Geräten (Windows-Agent, Browser-Erweiterung; Linux und Android folgen), Kategorien, Sperren (Webseiten per Pi-hole, Apps, Bereiche) | Geräte-Berichte, Pi-hole-API |
| Trading | GVA-Linien (Regeln aus dem Pine-Script «GVA Linien — Pur v1.1») für alle 28 Major-Paare auf 3D, Woche und Monat: Heatmap mit Abstand zur nächsten Long-/Short-Linie, Chart pro Paar, ntfy-Meldung beim ersten Treffer | HistData.com (Minutenkerzen ab 2000–2008 je Paar → Stunden in `data/dukascopy`, 5 Min in `data/dukascopy-m5`, abgeschlossene Monate; Dateizeit = UTC−5, in der EU-Sommerzeit UTC−4), ältere Monate teils von Dukascopy, laufender Monat von Yahoo Finance |
| Trading → Labor | Eigene und fremde Strategien sowie Hypothesen testen: Vorab-Karte (eingefroren beim Start, Versionen, Varianten-Zähler), Bausteine (GVA, BOS 15/30 Min mit Daily Open, Fib-Zone, Ausbruch, RSI, MA, Lücke, Serie, Kalender, Uhrzeit, Filter), Kerims GVA-Strategie nach Regelwerk (`gva-kerim.mjs`: letztes Hoch beim Hit fixiert, BOS per Körper-Schluss über Hoch und Daily Open, Low bis BOS, Hoch nachgezogen, Confluences in der Box, Gegen-BOS, Teilgewinn −62 % und Break-Even −27 %, alles als Parameter), Klassiker zum Vergleich, Bias-Fenster (Monty Stufe 2), Backtest in R mit Spread, Zufalls- und Saison-Vergleich, Robustheits-Raster, Urteil mit Fazit-Karte (Ampel, Kernzahlen, Warnungen, Handelsregel), gesperrter Forward-Zeitraum, Monte Carlo; Fib-Zone mit Verfall (Standard −40 %); Eingabe in «Einfach» und «Erweitert»; rechnet in einem eigenen Thread (`server/labor/`); Trade-Chart mit GVA-Hit, letztem Hoch, BOS, Daily/Weekly/Monthly Opens, Box und Confluences; Confluence je Trade (GVA, D/W/M-Open, Volumen-POC, Value Area Low/High – Volumenprofil vom GVA-Hit bis Hoch/Tief als «Zeit auf Preis», da HistData kein Volumen liefert; `volumen.mjs`), Confluence-Auswertung (einzeln, Anzahl, Kombination; Vorlage «Confluence-Auswertung» mit Mindestanzahl 0), Tabelle «Aussortierte Setups» mit Gründen, Umschalter Trade/3D-Muster (12 Kerzen, Linie vom Open von Kerze B; auch im GVA-Prüfer); Bibliothek: jeder Eintrag hat einen einmaligen Namen, genau einen Backtest und höchstens einen Forward (danach gesperrt); Änderungen nur über «Neue Variante …» (eigener Eintrag «Name V2», Änderungen zur Basis automatisch in den Notizen); Parameter «Welches Hoch zählt» (vor oder nach dem GVA-Hit); Reiter «Vergleich» (2–4 Läufe: Unterschiede der Einstellung, Kennzahlen, Kurven, Trichter, Robustheit); PDF-Auswertung pro Lauf und pro Vergleich (`server/labor/pdf.mjs`, pdfkit) | HistData/Dukascopy 5 Min (sonst 1 Std) |
| Trading → GVA-Prüfer | Paar, 3D/W/M, Zeitraum → Kerzen mit Musterprüfung gegen die Vorkerze (Linie oder Grund, warum nicht), Linien mit Kerze A/B, Status und Treffer, Abgleich mit einem TradingView-Wert | wie Trading |
| Trading → Live → GVA-Kalender | Monate Jan–Dez eines Jahres mit Anzahl; ein Monat listet alle GVAs, die in diesem Monat **zum ersten Mal getroffen** wurden (Zürcher Zeit, nach Zeit sortiert), Filter 3D/W/M; Antippen zeigt Preis, Entstehungsdatum, die 12 Kerzen des Musters und die Stundenkerzen um den Treffer; «Als Markdown kopieren» für Obsidian | wie Trading |
| Trading → Journal | Trades von Hand erfassen (live/Backtest, Konto in EUR), alles in R: Erwartungswert mit 95-%-Bereich, Trefferquote (Wilson), Profit-Faktor, Drawdown, Serien, SQN, Kalender, Aufschlüsselung, R-Verteilung, Live gegen Backtest, Monte Carlo | eigene Eingaben |
| Heute | ungelesene Mails ohne Werbung, Termine der nächsten 7 Tage, Google Tasks, Mail aufräumen nach Absender (archivieren, löschen, abmelden, Regel) und Werbefilter als echter Gmail-Filter mit Ausnahmen | Google OAuth (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, Weiterleitung `https://<HOST_NAME>:8443/api/google/zurueck`) |
| Netz | Geräte mit Download/Upload heute + DNS-Anfragen, Datenverkehr 24 Std, Ping | Tailscale, Pi-hole |
| Netz → Heimnetz | Alle Geräte im Haus (ARP, mDNS, SSDP, Hersteller), Zuordnung (Meins/Familie/Gast), «Ports prüfen» pro Gerät, wer beim Pi anklopft (Scan-Erkennung), Tailnet-Geräte | /proc/net/arp, Multicast, nf_conntrack, Tailscale |
| Netz → Ports & Zugriff | Alle lauschenden Ports mit Container/Prozess, wer durchkommt (Heimnetz/Tailnet), Firewall- und Tailscale-Regeln, «Weg einer Anfrage» | /proc/net, ufw, iptables, Tailscale-ACL (mit `TS_API_KEY` live) |
| Netz → Lernen | Lektionen, Glossar mit Pop-ups, Geschichten aus dem Homelab, Selbsttest, Anleitung «Dienst freigeben» | fest eingebaut |
| Medien | VPN-Schutz, Downloads, Arr-Stack, Demnächst, Neu, Seerr | qBittorrent, Docker exec, *arr-APIs, Seerr |
| Speicher | Laufwerke, Speicher pro Bereich, Syncthing-Status pro Gerät, Backup | statfs, du, Syncthing, rsync |
| Gäste | Einladen, Ablauf, Entfernen, Zugriffsregeln | Tailscale-API, Jellyfin-API |
| Konsole | Echtes SSH-Terminal + Schnellbefehle; Einstellungen (Nacht-Szene, Telegram, Lüfter, HDD-Schlaf, SSH nur mit Schlüssel) | ssh2, nsenter |

**Szenen**
- **Normal**: alles läuft.
- **Filmabend**: Nextcloud (+ Datenbank) und Syncthing pausiert, CPU auf Höchstleistung.
- **Nacht**: Nextcloud (+ Datenbank) und Jellyfin pausiert, Stromsparmodus, Lüfter gedrosselt, Backup-HDD schläft. Automatisch von 23:00 bis 07:00 (einstellbar).

Hinweis: Uptime Kuma merkt nicht, dass Dienste absichtlich pausiert sind. Die Zentrale selbst schickt dafür keine Fehler-Alarme. Wenn du in Kuma Alarme aktivierst, kommen sie aber trotzdem.

**Zwei Stufen aufs Handy (ntfy):**
- **Sofort:** alles Wichtige – Ausfälle, Fehler, Warnungen (VPN, Temperatur, Backup, Laufwerke …), Updates der Kernsysteme (Nextcloud, Vaultwarden, Tailscale, Pi-hole, Gluetun), neue Folgen/Filme deiner Lieblinge (Einstellungen → Allgemein → «Lieblingsserien und -filme»), später Trading. Neue Module melden mit `sofortMelden()` aus `server/tagescheck.mjs`.
- **Zwischenbericht** (8, 13, 19 Uhr, änderbar, «Jetzt senden» zum Testen): «✅ Alles okay» (oder «Noch offen (schon gemeldet)») plus Nebensächliches: neue Filme/Folgen, Garmin (Schlaf, Schritte, Body Battery), offene Updates. Temperaturen stehen nicht drin: sind sie zu hoch, kommt eine Sofort-Meldung. Neue Zeilen hängen sich mit `registrierePruefung()` ein.

**Alarme (ntfy, optional Telegram)**: Dienst nicht erreichbar / wieder da, Container hat sich selbst neu gestartet, Pi über 75 °C, Unterspannung, Laufwerk über 90 % voll, Syncthing-Fehler, Backup fehlgeschlagen, Probleme beim Entfernen von Gästen. Gleiche Meldungen höchstens alle 30 Minuten.

**Medien-Seite**
- **VPN-Prüfung (alle 3 Min):** Die Zentrale fragt *aus dem qBittorrent-Container heraus* nach der öffentlichen IP und vergleicht sie mit der IP des Pi. Gleich = Leck → alle Downloads werden sofort gestoppt + Telegram-Alarm. Keine Internetverbindung im Container = VPN getrennt (Gluetun blockiert dann alles, Downloads stehen still) → Alarm.
- **Downloads:** Geschwindigkeit, Warteschlange mit Fortschritt und Restzeit; Alarm, wenn ein Download 6 Std ohne Quellen hängt.
- **Arr-Stack:** Status, Anzahl, Warteschlange und Warnungen von Sonarr, Radarr, Lidarr, Prowlarr; Fehler kommen per Telegram.
- **Demnächst** (14 Tage) und **Neu hinzugefügt** (erscheint auch unter Ereignisse).
- **Seerr:** offene, laufende und erfüllte Anfragen.

## Sicherheit
- Der Container hat volle Rechte auf dem Pi (Docker, Befehle als root). Das ist nötig für Szenen, Lüfter, SSH-Einstellung und Backup.
- Er hört nur auf `127.0.0.1` und ist nur über Tailscale + Passwort erreichbar. Nicht mit `tailscale funnel` öffentlich machen.
- Login: 30 Tage gültig, höchstens 5 Versuche pro Minute.

## Fehlersuche
```bash
docker logs --tail 100 zentrale            # Fehlermeldungen
docker compose up -d --force-recreate      # nach .env-Änderungen
sudo tailscale serve status                # ist :8443 eingetragen?
curl -s http://127.0.0.1:3030/api/me       # antwortet der Server?
```
Probleme mit Schlüsseln oder Diensten stehen auch im Dashboard unter **Konsole → Hinweise**.

## Möbel-Temperatur (DS18B20)

- Sensor an GPIO 4 / Pin 7 (Daten), Pin 1 (3,3 V), Pin 14 (GND), mit `dtoverlay=w1-gpio` in `/boot/firmware/config.txt`.
- Die Zentrale liest `/sys/bus/w1/devices/28-*/temperature` alle 15 s. Den Startwert 85 °C ignoriert sie.
- Anzeige: Tab **System** (Karte «Möbel» mit 24-Std-Verlauf), **Übersicht** (°C Möbel), **Anschlüsse**.
- Warnung (Ereignis + Telegram), wenn die Grenze erreicht ist (Einstellungen → Allgemein → «Möbel-Warnung», Standard 40 °C), und wenn der Sensor 1 Minute lang keine Werte liefert.

## Möbel-Lüfter (Relais)

- 1-Kanal-Relais (Jumper auf H): DC+ → Pin 4 (5 V), DC− → Pin 9 (GND), IN → Pin 16 (GPIO 23).
- 12-V-Plus der Lüfter läuft über **COM → NC**. Relais aus = Lüfter an. Stürzt der Pi ab oder startet neu, laufen die Lüfter.
- Die Zentrale schaltet mit `pinctrl set 23 op dh` (Lüfter aus) bzw. `dl` (Lüfter an) auf dem Pi.
- Modi im System-Tab (Karte «Möbel»): **Auto** (an ab «Möbel-Lüfter an ab», Standard 30 °C, nachts 5 °C später, oder wenn der Pi ≥ 65 °C hat), **An**, **Aus**.
- Schutz: Ab der Möbel-Warngrenze oder bei 70 °C am Pi laufen die Lüfter immer, auch auf «Aus». Ohne Temperaturwert laufen sie im Auto-Modus.
- `.env`: `RELAIS_GPIO=23` (oder `aus`), `RELAIS_NC=ja`.

## Cloud (Nextcloud-Übersicht)

- Liest die Nextcloud-Datenbank (nur lesen, über `docker exec` in `nextcloud-db`) und den Datenordner.
- Zeigt Uploads (10 Min, 1 Std, heute, Tempo), laufende grosse Uploads, Zielordner, letzte Dateien, Fehler aus `nextcloud.log` (24 Std), Platz und Ordner.
- Die Warteschlange am Handy kann der Pi nicht sehen.
- Nacht-Szene pausiert Nextcloud nicht mehr (Handy-Uploads in der Nacht).

## Statusbericht für Obsidian

- Alle 15 Min schreibt die Zentrale `Zentrale-Status.md` in den Ordner «Homelab» des Obsidian-Vaults (gesucht unter `STATUS_BASIS`, Standard `/mnt/daten/syncthing`, dort, wo `Homelab/Meine Specs.md` liegt). Syncthing bringt ihn auf PC und Handy.
- Inhalt: Dienste, Updates, Pi-Werte, Möbel/Lüfter, Backup, VPN, Pi-hole, Laufwerke, Nextcloud-Uploads und -Fehler, Hinweise, Ereignisse 24 Std. Keine Passwörter, Schlüssel oder Gast-Zugänge.
- `.env`: `STATUS_ORDNER=/pfad/zum/Homelab` (fester Ordner) oder `STATUS_BERICHT=aus`.

## Windows-PC einschalten (Wake-on-LAN)

Übersicht → Karte **Windows-PC** → **Einschalten**. Die Zentrale schickt ein «Magic Packet» ins Heimnetz. Ob der PC läuft, sieht sie an Tailscale: Sobald Windows gestartet ist, steht dort «läuft» und unter Ereignisse «Windows-PC ist eingeschaltet».

Voraussetzungen (einmalig):
- PC per **LAN-Kabel** im Heimnetz (über WLAN klappt Wake-on-LAN fast nie)
- Windows: Geräte-Manager → LAN-Karte → Energieverwaltung «Gerät kann den Computer aktivieren» + «Nur Magic Packet», Erweitert «Wake on Magic Packet» an; Schnellstart aus
- BIOS (MSI): Erweitert → Energieverwaltung → ErP Ready **aus**; Erweitert → Einrichtung der Reaktivierungsereignisse → **Fortsetzung durch PCIe-Geräte an**
- `.env`: `PC_MAC=` MAC der LAN-Karte (PowerShell `Get-NetAdapter`). Optional `PC_NAME`, `PC_TAILSCALE_NAME` (sonst das einzige eigene Windows-Gerät in Tailscale), `PC_BROADCAST`

**Ausschalten** (Knopf erscheint, wenn eingerichtet): Die Zentrale verbindet sich per SSH mit dem PC und führt `shutdown /s /t 30` aus.
1. Windows: OpenSSH-Server installieren und starten (PowerShell als Administrator):
   `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` · `Start-Service sshd` · `Set-Service sshd -StartupType Automatic`
2. Übersicht → Windows-PC → «Ausschalten einrichten»: die angezeigte Zeile in `C:\ProgramData\ssh\administrators_authorized_keys` einfügen. Sie erlaubt **nur** `shutdown` und nur Verbindungen aus dem Tailscale-Netz (100.64.0.0/10).
3. `.env`: `PC_USER=` Windows-Benutzername, dann neu starten.
Den Host-Schlüssel des PCs merkt sich die Zentrale beim ersten Ausschalten (`data/pc/hostkey.sha256`); ändert er sich, verweigert sie die Verbindung.

## Fernseher (Philips, JointSpace-API)

Übersicht → Karte **Fernseher**: Ein/Aus, Lautstärke, Fernbedienung (Pfeiltasten, OK, Zurück, Home, Quelle, Programme, Play/Pause). Die Zentrale spricht direkt mit der API des Fernsehers (Port 1925, ohne Kopplung).

- `.env`: `TV_IP=` (TV: Einstellungen → Netzwerk) und `TV_MAC=` (WLAN-MAC, auf dem Pi: `ip neigh show <TV_IP>`)
- TV: **Einstellungen → Netzwerk → «Mit Wi-Fi (WoWLAN) einschalten»** an
- Einschalten klappt nur aus dem normalen Standby. Nach längerer Zeit fällt der Fernseher in einen tiefen Standby, dann meldet die Karte das – Fernbedienung nehmen (oder später eine IR-LED am Pi)
- Die API hat keine Anmeldung: Jedes Gerät im WLAN kann den Fernseher so steuern. Die Zentrale selbst ist nur mit Login erreichbar.

## Plattengesundheit (Scrutiny)

Scrutiny läuft als eigener Container (`/mnt/daten/scrutiny`, Port 8095) und liest die SMART-Werte aller Platten (Messung täglich 02:55). Die Zentrale zeigt unter **Speicher** pro Platte «gesund» / «auffällige Werte» / «SMART meldet einen Fehler», Temperatur und Betriebstage, und meldet, wenn eine Platte schlechter wird. Zuordnung über die WWN (`/dev/disk/by-id/wwn-…`). Optional `.env`: `SCRUTINY_PORT`, `SCRUTINY_URL`.

## Container-Updates (What's Up Docker)

What's Up Docker läuft als eigener Container (`/mnt/daten/wud`, Port 3010, mit Anmeldung) und prüft jeden Morgen um 6 Uhr, ob es für die Container neuere Images gibt. Docker sieht WUD nur über einen Socket-Proxy, der nur lesen darf.

Die Zentrale zeigt unter **System → Container-Updates**, was es gibt (Major/Minor/Patch oder «neues Image» bei gleichem Tag), mit Link zu den Änderungen und einem Knopf, der den passenden Befehl kopiert:

```bash
cd <Compose-Ordner> && docker compose pull <dienst> && docker compose up -d <dienst>
```

Aktualisiert wird **nie automatisch** – du entscheidest. Neue Updates erscheinen einmal unter Ereignisse und im Statusbericht.

Einrichten: In WUD oben rechts **Profil → Generate Token**, nur **Read** ankreuzen, Ablauf «Never». Den Token (`wud_…`) in die `.env` der Zentrale als `WUD_TOKEN=` eintragen, nicht in den Chat. Optional: `WUD_PORT` (3010), `WUD_URL`.

## Gesundheit (Garmin)

Tab **Gesundheit** zeigt die Daten deiner Garmin-Uhr aus garmin-grafana (`/mnt/daten/garmin-grafana`): Body Battery mit 24-Std-Verlauf, letzte Nacht (Score, Dauer, Phasen), HRV mit 7-Nächte-Vergleich, Ruhepuls mit 30-Tage-Vergleich, Schritte, Intensitätsminuten der Woche, Kalorien, Stockwerke, Puls und Stress der letzten 24 Std, Schlaf und Schritte der letzten 30 Tage, die letzten Aktivitäten, VO₂max und Fitnessalter. Jede Kachel lässt sich antippen und öffnet eine **Detailansicht** mit der ganzen Historie (30 Tage / 90 Tage / 1 Jahr / alles): Verlauf mit gleitendem Schnitt (antippen zeigt den Tag), Bester/Schlechtester Wert, Trend pro Monat, Monat gegen Vormonat und gegen Vorjahr, Muster nach Wochentag und «Was hängt damit zusammen?» (z. B. Schlaf-Score nach Tagen mit viel Stress oder Training). Schlaf zusätzlich mit Phasen, Schlafrhythmus und Schlafschuld, Schritte mit Intensitätsminuten pro Woche, Aktivitäten mit Sportarten, Rekorden und Liste. Die Historie lädt erst beim ersten Öffnen (`/api/garmin/historie`, Zwischenspeicher 15 Min). Grafana bleibt für Detailanalysen.

Die Zentrale liest nur, und nur solange der Tab offen ist (jede Minute, Zwischenspeicher 60 s). Dafür muss die InfluxDB von garmin-grafana **nur lokal** erreichbar sein, in deren `compose.yml` beim Dienst `influxdb`:

```yaml
    ports:
      - "127.0.0.1:8086:8086"
```

`.env` der Zentrale: `GARMIN_INFLUX_PASSWORD=` (gleicher Wert wie `INFLUXDB_PASSWORD` in garmin-grafana). Optional: `GARMIN_INFLUX_PORT` (8086), `GARMIN_GRAFANA_PORT` (3020), `GARMIN_GRAFANA_URL`, `GARMIN_SCHRITTE_ZIEL` (10000).

## Desktop-App für den HP (`desktop/`)

Der HP, auf dem der Trading-Bot läuft, bekommt eine eigene Oberfläche: Anmeldebildschirm wie bei Windows, macOS-artiger Schreibtisch mit Dock, ein Finder für die Dateien auf dem Pi **und** auf dem HP, eine Steuerung für PC/Fernseher/Szenen – und die Zentrale selbst als Fenster mittendrin. «Ausschalten» schaltet nur den Monitor ab, der HP läuft weiter.

Bauen (auf Windows, braucht Node.js 20+):

```powershell
cd desktop
npm install
npm run dist
```

Alles Weitere steht in [`desktop/README.md`](desktop/README.md).

## Datei-API (für den Finder der Desktop-App)

Der bisherige Explorer (`/api/explorer`) kann nur lesen. Für den Finder gibt es `server/dateien.mjs` mit Schreibzugriff – nur für angemeldete Sitzungen, und mit denselben Schutzregeln wie der Explorer: nur echte Laufwerks-Einhängepunkte als Wurzel, kein `..`, keine Symlinks im Pfad, nichts ausserhalb des Laufwerks.

| Route | Was |
|---|---|
| `GET /api/dateien/laufwerke` | Laufwerke mit Namen und freiem Platz |
| `GET /api/dateien?wurzel=&pfad=` | Ordner auflisten (`versteckte=1` für Punktdateien) |
| `GET /api/dateien/inhalt?wurzel=&pfad=` | Datei ausliefern, mit Range (Video, PDF) |
| `GET /api/dateien/text` · `POST /api/dateien/text` | Textdatei lesen / schreiben (max. 4 MB) |
| `POST /api/dateien/neu` | Datei oder Ordner anlegen |
| `POST /api/dateien/umbenennen` | umbenennen |
| `POST /api/dateien/verschieben` | verschieben oder kopieren (auch über Laufwerke) |
| `POST /api/dateien/loeschen` | in den Papierkorb des Laufwerks (`endgueltig: true` löscht wirklich) |
| `POST /api/dateien/papierkorb` | Papierkorb eines Laufwerks leeren |
| `POST /api/dateien/upload?wurzel=&pfad=&name=` | Datei hochladen (bis 4 GB, gestreamt) |
| `POST /api/dateien/teilen` | Link mit Ablaufdatum erzeugen |
| `GET /api/dateien/teilen` · `POST /api/dateien/teilen/weg` | Links auflisten / löschen |
| `GET /teilen/<token>` | **öffentlich**, ohne Anmeldung – gibt genau diese eine Datei heraus |

Gelöschtes landet unter `<Laufwerk>/.Papierkorb/<Zeitstempel>__<Name>` und bleibt dort, bis du den Papierkorb leerst. Geteilte Links stehen in `data/zentrale.json` und laufen nach 1–90 Tagen ab (Standard 7). Erreichbar sind sie trotzdem nur über Tailscale – `tailscale serve` lässt niemanden sonst an Port 8443.

Nach dem Einspielen auf dem Pi:

```bash
cd /mnt/daten/zentrale && docker compose up -d --build
```

## HP fernsteuern und Geräte koppeln

Die Desktop-App auf dem HP meldet sich einmal mit Passwort und 2FA an und bekommt
dann ein **Geräte-Token** (`server/geraete.mjs`). Damit holt sie sich jederzeit eine
frische Sitzung, ohne dass Passwort oder 2FA-Geheimnis auf dem HP liegen. Das Token
steht nur gehasht in `data/zentrale.json` und läuft nach einem Jahr ab.

| Route | Was |
|---|---|
| `POST /api/geraet/token` | neues Token ausstellen (nur aus angemeldeter Sitzung) |
| `POST /api/geraet/sitzung` | **ohne Anmeldung** – Token gegen eine frische Sitzung tauschen |
| `GET /api/geraete` · `POST /api/geraete/weg` | gekoppelte Geräte anzeigen und entkoppeln |

Darauf setzt die Fernsteuerung des HP auf (`server/hp.mjs`). Der HP ist von aussen
nicht erreichbar, darum holt die App die Befehle selbst ab:

| Route | Was |
|---|---|
| `POST /api/hp/abholen` | **Geräte-Token im Kopf `X-Geraet-Token`** – Zustand melden, offene Befehle holen |
| `GET /api/hp` | Zustand für die Oberfläche |
| `POST /api/hp/befehl` | `sperren`, `bildschirmAus` oder `bildschirmAn` |

Die HP-Karte steht im Tab **Übersicht**. Entsperren aus der Ferne gibt es bewusst
nicht – wer Zugriff auf die Zentrale hat, soll damit nicht am PIN vorbeikommen.

## Nackter Modus (`?nackt=1`)

Mit `?nackt=1` lässt die Zentrale ihre eigene Kopfzeile und Tab-Leiste weg und zeigt
nur den Inhalt des Tabs aus dem Hash (`…/?nackt=1#Trading`). Die Desktop-App auf dem
HP nutzt das, um jeden Tab in einem eigenen Fenster wie eine native App zu zeigen.
Im Browser und auf dem Handy ändert sich nichts.
