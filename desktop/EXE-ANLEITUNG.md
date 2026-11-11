# Zentrale Desktop – die Exe, exakt erklärt

Stand: Version 1.0.0 · Branch `desktop-hp`

Diese Anleitung beschreibt, was die Exe auf dem HP genau tut, wie du sie bedienst,
wo sie ihre Daten ablegt, was sie ins Netz schickt und wie du jede Funktion prüfst.

---

## 1. Was die Exe ist

Eine Electron-App (Windows), die auf dem HP als kleine Betriebssystem-Oberfläche läuft:

- **Anmeldebildschirm** wie bei Windows (PIN, Rückfall Zentrale-Passwort + 2FA)
- **Schreibtisch** im macOS-Stil mit Dock, Menüleiste, Symbolen und Widgets
- **Finder** für Dateien auf dem **Pi** und auf dem **HP**
- **Steuerung** für PC, Fernseher, Möbel-Temperatur, Lüfter, Szenen, Medien, Backup
- **Alle Zentrale-Tabs** als eigene Fenster (die echte Seite vom Pi, ohne Kopfzeile)
- **Fernsteuerung** vom Handy oder der Zentrale aus (sperren, Bildschirm aus/an)
- optional **harter Kiosk**: die App ersetzt den Windows-Explorer

Die Web-App **Zentrale** auf dem Pi bleibt unverändert. Die Exe ist nur ein zweiter Zugang,
dazu kommt auf dem Pi eine kleine Schnittstelle für Dateien, Geräte-Kopplung und HP-Befehle.

**Grundregel:** Der HP geht nie wirklich aus. «Ausschalten» heisst: Monitor aus und
Anmeldebildschirm. Windows, MetaTrader 5 und der Trading-Bot laufen weiter. Zusätzlich hält
die App Windows mit einem Power-Save-Blocker (`prevent-app-suspension`) vom Energiesparmodus ab.
Der Bildschirm darf trotzdem ausgehen.

---

## 2. Installation auf dem HP

Dateien in `desktop\dist` (gebaut auf dem Windows-PC mit `npm run dist`):

| Datei | Zweck |
|---|---|
| `Zentrale-Setup-1.0.0.exe` | Installer. **Diese nehmen.** Nur damit funktioniert «Mit Windows starten» sauber |
| `Zentrale-portable-1.0.0.exe` | läuft ohne Installation, kein verlässlicher Autostart |

Auf den HP bringen, zum Beispiel mit Tailscale-Dateiübertragung:

```powershell
# am Windows-PC
tailscale file cp "C:\Users\Kerim\Documents\Zentrale\desktop\dist\Zentrale-Setup-1.0.0.exe" hp-server:

# am HP, im Zielordner
tailscale file get .
```

Dann `Zentrale-Setup-1.0.0.exe` auf dem HP doppelklicken. Der Installer legt Startmenü- und
Desktop-Verknüpfung an. Windows kann «Unbekannter Herausgeber» melden, weil die Exe nicht
signiert ist: **Weitere Informationen → Trotzdem ausführen**.

**Voraussetzungen auf dem HP**

- Tailscale läuft und der HP ist im selben Tailnet wie der Pi.
- **Kein Proton-VPN-Client** auf dem HP. Er sperrt den Tailscale-Bereich `100.x` und der Pi ist weg.
  Anonymität kommt über den Exit-Node `pi-proton`, nicht über einen Client auf dem Rechner.
- Auf dem Pi läuft die Zentrale in der Version mit den neuen Schnittstellen
  (`git pull` und `docker compose up -d --build` im Zentrale-Ordner).

---

## 3. Erster Start

1. Der Anmeldebildschirm erscheint. Irgendeine Taste drücken.
2. **Zentrale-Passwort** eingeben (das aus `ZENTRALE_PASSWORT` in der `.env` auf dem Pi) und,
   falls 2FA an ist, den 6-stelligen Code aus der Authenticator-App. Es gibt keinen Benutzernamen.
3. Die App verlangt einen **PIN** (4 bis 12 Zeichen). Ab dann genügt der PIN.
4. Bei der ersten Passwort-Anmeldung **koppelt** sich die App beim Pi und bekommt ein
   Geräte-Token (1 Jahr gültig, auf dem Pi nur als Hash gespeichert).

Die Standardadresse des Pi ist `https://homelabkerim.taila4b96b.ts.net:8443`. Sie lässt sich unter
**Einstellungen → Verbindung** ändern. Der Knopf **Speichern & prüfen** sagt dir, ob der Pi
erreichbar und die App angemeldet ist.

### Wie die Anmeldung funktioniert

| Weg | Was passiert |
|---|---|
| **PIN** | wird nur lokal geprüft (scrypt-Hash), entsperrt den Bildschirm, danach wird die Sitzung zum Pi per Token aufgefrischt |
| **Passwort + 2FA** | läuft über den Pi. Das Passwort wird zusätzlich als scrypt-Hash lokal gemerkt |
| **Pi nicht erreichbar** | nur Passwort, wenn «Anmeldung ohne Pi» erlaubt ist (kein 2FA möglich) |

Fehlversuche: Nach **10 falschen Eingaben in 5 Minuten** sperrt die App die Anmeldung für 5 Minuten.

Auf dem HP liegt weder dein Passwort noch das 2FA-Geheimnis im Klartext.

---

## 4. Die Oberfläche

**Menüleiste** oben: App-Name, Uhr, Pi-Zustand (erreichbar oder nicht), Sperren.

**Dock** unten, Standard: Übersicht, Finder, Steuerung, Trading, System, Medien, Einstellungen.
Anpassbar unter **Einstellungen → Dock**. Kennungen sind `finder`, `steuerung`, `einstellungen`
und `zentrale:<Tab>`.

**Schreibtisch.** Symbole und Widgets liegen auf einem Raster (110 px) und rasten ein.
- Rechtsklick auf den Schreibtisch: Widget hinzufügen, App ablegen.
- Rechtsklick auf ein Widget: Grösse ändern oder entfernen.
- Standardmässig: Symbole Finder, Übersicht, Steuerung; Widgets **Pi-Zustand** und **Haus & Steuerung**.
- Verfügbare Widgets: Pi-Zustand, Haus & Steuerung, Dienste-Ampel, Strom, Speicherplatz,
  Netz, Downloads, Backup, Szene, Trading, Heute, Gesundheit, Uhr, Notizzettel.

**Zentrale-Tabs als Apps.** 13 Tabs (Übersicht, Heute, Gesundheit, Fokus, Trading, System,
Netz, Speicher, Cloud, Medien, Gäste, Konsole, Zentrale-Einstellungen). Jeder ist ein
Fenster mit der echten Seite vom Pi im «nackten» Modus (`?nackt=1`). Die Ansicht ist eine
eingebettete Web-Ansicht über dem Fenster. Darum ist nur die vorderste Ansicht wirklich
sichtbar, die anderen zeigen einen Schnappschuss.

**Finder.**
- Quellen: Favoriten/HP (Ordner und Laufwerke) und Pi · Zentrale (Laufwerke des Pi).
- Öffnen, Vorschau (Bilder, PDF, Video, Musik), Textdateien bearbeiten und speichern,
  umbenennen (`F2`), neuer Ordner, neue Textdatei, löschen (Papierkorb), Liste/Symbole,
  filtern, sortieren.
- **Kopieren zwischen Pi und HP:** Datei wählen, `Strg+C` (oder `Strg+X`), im Zielordner
  `Strg+V`. Geht in beide Richtungen.
- **Teilen:** Rechtsklick auf eine Pi-Datei → *Link teilen*. Link mit Ablaufdatum, ohne
  Anmeldung, aber nur im Tailscale-Netz erreichbar. Verwalten unter
  *Einstellungen → Geteilte Links*.
- Löschen auf dem Pi verschiebt in den Ordner `.Papierkorb`.
- Ganze Ordnerbäume vom HP auf den Pi gehen nicht in einem Schritt. Dateiweise oder
  besser über Syncthing/Nextcloud.

**Steuerung.** Trading-PC ein/aus, Fernseher (Lautstärke, Fernbedienung), Möbel-Temperatur
mit Verlauf, Möbel-Lüfter (Auto/An/Aus), Szenen, Dienste neu starten, Medien und Downloads
(VPN, qBittorrent, Sonarr/Radarr), Backup von Hand anstossen, Notbetrieb, Pi-Werte,
Stromverbrauch, Laufwerke.

---

## 5. Sperren und Bildschirm aus

| Auslöser | Wirkung |
|---|---|
| `Strg + L`, «Ausschalten», Sperren in der Menüleiste | sperrt und schaltet den Monitor aus (wenn «Ausschalten» den Monitor abschaltet) |
| Automatisch | nach X Minuten ohne Eingabe (**Einstellungen → Anmeldung**, 0 = aus). Prüfung alle 15 Sekunden |
| Nach dem Hochfahren | Anmeldebildschirm, wenn «Nach dem Hochfahren sperren» an ist |

Der Monitor wird mit einem kleinen PowerShell-Aufruf abgeschaltet (`SC_MONITORPOWER`).
Aufwecken: Maus bewegen oder Taste. Die App löst dabei zusätzlich eine winzige Mausbewegung aus.
Windows ignoriert das Abschalten, solange es Eingaben sieht. Darum wartet die App vorher kurz (0,9 s).

---

## 6. Fernsteuerung von der Zentrale

Der HP ist von aussen nicht erreichbar. Deshalb **fragt die App alle 5 Sekunden selbst beim Pi nach**,
meldet dabei ihren Zustand (gesperrt, Bildschirm aus, Version, Rechnername, Benutzer) und
führt offene Befehle aus.

| Befehl in der Zentrale | Wirkung auf dem HP |
|---|---|
| Sperren | Anmeldebildschirm, Monitor bleibt an |
| Bildschirm aus | Anmeldebildschirm und Monitor aus |
| Bildschirm an | Monitor an |
| Zustand sehen | zeigt, ob der HP sich gemeldet hat (erreichbar, wenn die letzte Meldung unter 2 Minuten alt ist) |

Entsperren aus der Ferne gibt es bewusst nicht. Der PIN wird immer am Gerät eingegeben.
Wird das Gerät in der Zentrale entkoppelt, meldet die App «Fernsteuerung ist aus».

**Gekoppelte Geräte** siehst und entfernst du unter **Einstellungen → Anmeldung → Gekoppelte Geräte**.
Nach dem Entkoppeln kommt der HP nur noch mit Passwort (und 2FA) wieder rein.

---

## 7. Einstellungen im Überblick

| Seite | Inhalt |
|---|---|
| Anmeldung | Hintergrund (Bild/Farbe/Verlauf), Weichzeichnen, Uhr, Datum, Name, Untertitel, Profilbild, PIN, automatisches Sperren, Anmeldung ohne Pi, gekoppelte Geräte |
| Aussehen | Desktop-Hintergrund, helles Thema, Akzentfarbe, Dock-Grösse, Dock-Vergrösserung, Menüleiste |
| Dock / Schreibtisch | Reihenfolge der Apps, Widgets, Raster |
| Verhalten | Mit Windows starten, nach Hochfahren sperren, Zentrale gleich öffnen, Vollbild, Windows-Oberfläche, Programme beim Start, Strom |
| Verbindung | Adresse des Pi, Speichern & prüfen, im Browser öffnen |
| Finder | Ansicht, Sortierung, versteckte Dateien, eigene Ordner |
| Geteilte Links | alle Links ansehen und löschen |
| Über | Version, Tastenkürzel |

**Werkseinstellungen** der wichtigsten Schalter:
Vollbild an · Autostart an · nach dem Hochfahren sperren an · Zentrale gleich öffnen an ·
Monitor aus bei Sperre an · nie schlafen an · Windows-Oberfläche **aus**.

---

## 8. Tastenkürzel

| Taste | Wirkung |
|---|---|
| `Strg + L` | Sperren |
| `Strg + E` | Finder |
| `Strg + ,` | Einstellungen |
| `Strg + W` / `Strg + M` | Fenster schliessen / minimieren |
| `Strg + S` | im Editor speichern |
| `Strg + C / X / V` | im Finder kopieren / ausschneiden / einfügen |
| `F2` | umbenennen |
| `Entf` | in den Papierkorb |
| `Strg + Alt + Shift + K` | Vollbild/Kiosk an oder aus (Notausstieg) |
| `Strg + Alt + Shift + Q` | App sofort beenden |

Die beiden letzten funktionieren immer, auch wenn die Oberfläche klemmt.

---

## 9. Harter Kiosk: die App als Windows-Oberfläche

Die App trägt sich in der Registry als Windows-Shell ein
(`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`, Wert `Shell`). Danach gibt es für
dein Windows-Konto keinen Explorer, keine Taskleiste, kein Startmenü. Der Eintrag gilt nur für
**diesen einen Benutzer**.

**Risiko:** Startet die App nicht, siehst du einen leeren Bildschirm. Darum lässt die App den
Schalter erst zu, wenn es ein **zweites aktives Administrator-Konto** gibt.

### Vorbereitung: Rettungskonto anlegen

PowerShell **als Administrator** auf dem HP:

```powershell
$pw = Read-Host "Passwort fuer das Rettungskonto" -AsSecureString
New-LocalUser -Name "rettung" -Password $pw -PasswordNeverExpires
Add-LocalGroupMember -SID S-1-5-32-544 -Member "rettung"
```

Einmal als `rettung` anmelden und wieder abmelden, damit das Konto fertig eingerichtet ist.
Das Passwort an einem sicheren Ort aufschreiben.

### Einschalten

1. **Programme beim Start** eintragen (MT5 und alles andere), weil ohne Explorer niemand
   die üblichen Autostart-Programme startet. Die App startet sie 4 Sekunden nach dem Start.
2. **Einstellungen → Verhalten → Als Windows-Oberfläche** einschalten. Die App prüft das Rettungskonto.
3. Abmelden und neu anmelden. Jetzt startet nur noch die Zentrale.

### Zurück zum normalen Windows

- In der App: derselbe Schalter aus. **Explorer jetzt starten** holt die Taskleiste sofort zurück.
- Wenn die App nicht erreichbar ist: `Strg + Alt + Entf` → Task-Manager → **Neuen Task ausführen** → `explorer.exe`.
- Notfall über das Rettungskonto (als `rettung` angemeldet, PowerShell als Administrator):

```powershell
reg load HKU\kiosk C:\Users\<Benutzername>\NTUSER.DAT
reg delete "HKU\kiosk\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f
reg unload HKU\kiosk
```

`<Benutzername>` ist das Windows-Konto, in dem der Kiosk eingerichtet wurde.

---

## 10. Wo die Exe was ablegt

| Was | Wo |
|---|---|
| Einstellungen | `C:\Users\<du>\AppData\Roaming\Zentrale\einstellungen.json` |
| PIN-Hash, Passwort-Hash, Geräte-Token | `C:\Users\<du>\AppData\Roaming\Zentrale\anmeldung.json` (Token per Windows-DPAPI verschlüsselt, an dein Windows-Konto gebunden) |
| Sitzung zum Pi | Partition `persist:zentrale` (gemeinsam mit dem eingebetteten Zentrale-Fenster) |
| Hilfsskript Monitor | `%TEMP%\zentrale-strom.ps1` |

Alles zurücksetzen: App beenden, den Ordner `Zentrale` unter `AppData\Roaming` löschen. Danach
beginnt alles wieder beim ersten Start.

---

## 11. Was die Exe ins Netz schickt

| Wann | Wohin | Was |
|---|---|---|
| beim Anmelden | Pi (`:8443`) | Passwort und 2FA-Code, Token-Anforderung |
| alle 5 Sekunden | Pi | Zustandsmeldung und Befehlsabfrage (mit Geräte-Token im Header) |
| alle 30 Minuten | Pi | Sitzung auffrischen |
| beim Arbeiten | Pi | Dateien, Steuerung, Zentrale-Seiten |

Zum Pi geht ausschliesslich verschlüsselter Verkehr über Tailscale. Fremde Zertifikate werden
abgelehnt. Es werden keine Daten an Dritte gesendet.

Sicherheit der App: `contextIsolation` an, `nodeIntegration` aus, die Oberfläche erreicht nur
Funktionen aus `preload.js`.

---

## 12. Wenn etwas nicht geht

| Problem | Ursache und Abhilfe |
|---|---|
| «Pi nicht erreichbar» | Läuft Tailscale auf dem HP? Läuft der Pi? Adresse prüfen. Auf dem HP darf kein Proton-Client laufen. Test: `Test-NetConnection 100.73.91.110 -Port 8443` |
| «Falsches Passwort», obwohl es stimmt | Tippfehler auf dem Sperrbildschirm, oder der Pi lief nicht und die App hat nur den lokalen Hash geprüft. Pi-Verbindung prüfen |
| Monitor geht nicht aus | Maus und Tastatur kurz liegen lassen. Test unter *Verhalten → Monitor sofort ausschalten*. Notfalls «Ausschalten schaltet den Monitor ab» ausschalten, dann wird nur gesperrt |
| Startet nicht mit Windows | *Mit Windows starten* aus- und wieder einschalten. Nur mit dem Installer, nicht mit der portablen Exe |
| Zweite App startet nicht | Es läuft nur eine Instanz. Ein zweiter Start holt das Fenster in den Vordergrund. Hängt sie: `Stop-Process -Name Zentrale -Force` |
| Dialoge oder Menüs verschwinden | Die eingebettete Zentrale-Ansicht liegt darüber. Die App versteckt sie während Menüs; bleibt es dabei, das Fenster schliessen und neu öffnen |
| Kein Entkommen aus dem Vollbild | `Strg + Alt + Shift + K`, beenden mit `Strg + Alt + Shift + Q` |
| Kiosk lässt sich nicht einschalten | Es fehlt ein zweites aktives Administrator-Konto (siehe Abschnitt 9) |

---

## 13. Prüfliste für den HP

Der Reihe nach abhaken. Die Punkte 5 bis 9 sind auf echter Hardware noch nicht getestet.

1. **Installation:** Installer läuft, App startet, Anmeldebildschirm erscheint.
2. **Verbindung:** Einstellungen → Verbindung → Speichern & prüfen zeigt «verbunden». (Falls
   noch nicht angemeldet: «erreichbar, aber nicht angemeldet» ist vor dem ersten Login normal.)
3. **Erste Anmeldung:** Passwort + 2FA, PIN setzen, Gerät erscheint unter *Gekoppelte Geräte*.
4. **Sperren und PIN:** `Strg + L`, mit PIN entsperren. 3-mal falschen PIN eingeben, es kommt «PIN stimmt nicht».
5. **Monitor aus/an:** Sperren, der Monitor geht aus. Maus bewegen, er geht an.
6. **Fernsteuerung:** In der Zentrale auf dem Handy: «Sperren», «Bildschirm aus», «Bildschirm an».
   Reaktion innerhalb weniger Sekunden. Entsperren geht nur am HP.
7. **Autostart:** HP neu starten. Die App startet von selbst und zeigt den Anmeldebildschirm.
8. **MT5 und Bot:** MT5 unter *Programme beim Start* eintragen, neu starten, MT5 läuft mit
   und der Bot handelt weiter. Nach «Ausschalten» läuft er weiter (Windows schläft nicht).
9. **Kiosk (zuletzt):** Rettungskonto anlegen, dann *Als Windows-Oberfläche* einschalten, neu
   anmelden, prüfen. Notausstieg vorher kennen (Abschnitt 9).
10. **Finder:** Datei vom Pi auf den HP kopieren und zurück. Textdatei auf dem Pi bearbeiten und speichern.
11. **Zentrale-Tabs:** Trading, System und Medien öffnen. Seite lädt ohne Kopfzeile und ohne Anmeldedialog.
12. **Netzwerk:** `tailscale ping homelabkerim` zeigt eine direkte Verbindung (`via 192.168.…`), nicht `DERP`.

---

## 14. Eine neue Version bauen und verteilen

Auf dem Windows-PC (PowerShell als Administrator, wegen der Symlinks von electron-builder):

```powershell
cd C:\Users\Kerim\Documents\Zentrale
git pull
cd desktop
npm install
npm run dist
```

Den neuen Installer auf den HP bringen und über die alte Installation drüberinstallieren.
Einstellungen und Kopplung bleiben erhalten (sie liegen in `AppData\Roaming\Zentrale`).
