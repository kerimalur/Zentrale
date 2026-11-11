# Zentrale Desktop – die Oberfläche auf dem HP

Macht aus dem HP ein kleines Betriebssystem: Anmeldebildschirm wie bei Windows,
macOS-artiger Schreibtisch mit Dock und Menüleiste, ein Finder für die Dateien
auf dem **Pi** und auf dem **HP**, eine Steuerung für PC/Fernseher/Szenen – und
die **echte Zentrale** vom Pi als Fenster mittendrin.

**Wichtig:** Der HP geht nie wirklich aus. «Ausschalten» heisst hier: Monitor
abschalten und Anmeldebildschirm zeigen. Windows und der Trading-Bot laufen
ganz normal weiter. Dafür hält die App zusätzlich mit einem *Power-Save-Blocker*
den Energiesparmodus von Windows fern.

---

## Die exe bauen (einmalig, auf dem HP oder deinem Windows-PC)

Voraussetzung: **Node.js 20 oder neuer** (https://nodejs.org, LTS nehmen).

```powershell
cd desktop
npm install
npm run dist
```

Danach liegen in `desktop\dist`:

| Datei | Was es ist |
|---|---|
| `Zentrale-Setup-1.0.0.exe` | Installer (Startmenü, Desktop-Verknüpfung, Autostart) |
| `Zentrale-portable-1.0.0.exe` | läuft ohne Installation, eine einzige Datei |

Nimm den **Installer** – nur damit funktioniert «mit Windows starten» zuverlässig.

> Der Build muss unter Windows laufen. Ein Windows-Build unter Linux braucht
> Wine und liefert kein korrektes Icon und keinen sauberen Autostart.

Zum Ausprobieren ohne Build: `npm start`.

---

## Beim ersten Start

1. Anmeldebildschirm: irgendeine Taste drücken, dann **Zentrale-Passwort**
   (das aus `ZENTRALE_PASSWORT` in der `.env` auf dem Pi) und, falls 2FA an ist,
   den 6-stelligen Code aus der Authenticator-App. Einen Benutzernamen gibt es nicht.
2. Danach fragt die App nach einem **PIN** (mindestens 4 Zeichen). Ab dann reicht
   der PIN; das Zentrale-Passwort bleibt als Rückfall über den Link unten am
   Anmeldebildschirm.
3. Beim ersten Anmelden **koppelt** sich die App beim Pi und bekommt ein Geräte-Token.
   Damit hält sie die Anmeldung selbst aufrecht – du siehst nie wieder einen
   2FA-Dialog im Zentrale-Fenster. Das Token liegt verschlüsselt (Windows-DPAPI,
   an dein Windows-Konto gebunden). Weder Passwort noch 2FA-Geheimnis liegen auf dem HP.
   Gekoppelte Geräte siehst du unter **Einstellungen → Anmeldung → Gekoppelte Geräte**
   und kannst sie dort jederzeit entkoppeln – danach kommt der HP ohne Passwort nicht mehr rein.
4. Stimmt die Adresse des Pi nicht, unter **Einstellungen → Verbindung** ändern.
   Standard: `https://homelabkerim.taila4b96b.ts.net:8443`

Der HP muss im Tailscale-Netz sein – sonst ist der Pi nicht erreichbar.
Läuft auf dem Windows-PC ein VPN-Client (Proton & Co.), zieht der den
Tailscale-Bereich `100.x` in seinen Tunnel und der Pi ist weg. Trennen oder
Split-Tunneling einrichten.

---

## Was drin ist

**Anmeldung (Sperrbildschirm)** – Hintergrundbild, Farbe oder Verlauf,
Weichzeichnen, Uhr, Datum, Name, Profilbild, automatisches Sperren nach X Minuten.
Alles unter *Einstellungen → Anmeldung*.

**Die Zentrale-Tabs als eigene Apps** – jeder Tab (Übersicht, Heute, Gesundheit,
Fokus, Trading, System, Netz, Speicher, Cloud, Medien, Gäste, Konsole,
Zentrale-Einstellungen) hat ein eigenes Symbol und ein eigenes Fenster. Der Inhalt
ist die echte Seite vom Pi, aber «nackt»: ohne deren Kopfzeile und Tab-Leiste, weil
der Fensterrahmen das schon mitbringt. Es ist eine echte eingebettete Ansicht, kein
Bild – Konsole, Labor und Journal funktionieren normal.

Technisch liegen diese Ansichten über der Oberfläche. Darum ist immer nur die
vorderste wirklich sichtbar; die anderen Fenster zeigen den letzten Schnappschuss.
Das fällt nur auf, wenn man genau hinschaut.

**Home-Bildschirm** – App-Symbole und Widgets frei anordnen (ziehen, rastet am
Raster ein). Rechtsklick auf den Schreibtisch: Widget hinzufügen, App ablegen.
Rechtsklick auf ein Widget: Grösse ändern oder entfernen. Widgets gibt es für
Pi-Zustand, Haus & Steuerung, Dienste-Ampel, Strom, Speicherplatz, Netz,
Downloads, Backup, Szene, Trading, Heute, Gesundheit, Uhr und Notizzettel.

**Finder** – zwei Quellen in einer Seitenleiste:
* *Favoriten / HP* – Ordner und Laufwerke auf dem HP
* *Pi · Zentrale* – die Laufwerke des Pi

Öffnen, Vorschau (Bilder, PDF, Video, Musik), Textdateien bearbeiten und speichern,
umbenennen (F2), neuer Ordner, neue Textdatei, löschen (in den Papierkorb),
Liste/Symbole, Filtern, Sortieren.

**Zwischen Pi und HP kopieren** – Datei auswählen, `Strg+C` (oder `Strg+X`),
im Zielordner `Strg+V`. Das geht in jede Richtung, auch Pi → HP und HP → Pi.
Innerhalb einer Quelle kannst du auch auf einen Ordner ziehen (mit `Strg` kopieren).

**Teilen** – Rechtsklick auf eine Datei auf dem Pi → *Link teilen*. Erzeugt einen
Link mit Ablaufdatum, der ohne Anmeldung funktioniert – aber nur für Geräte in
deinem Tailscale-Netz. Übersicht und Löschen unter *Einstellungen → Geteilte Links*.

**Steuerung** – Trading-PC ein/aus (Wake-on-LAN bzw. SSH), Fernseher mit
Lautstärke und Fernbedienung, Möbel-Temperatur mit Verlauf, Möbel-Lüfter
(Auto/An/Aus), Szenen, Dienste neu starten, Medien und Downloads (VPN,
qBittorrent, Sonarr/Radarr starten und stoppen), Backup von Hand anstossen,
Notbetrieb, Pi-Werte, Stromverbrauch, Laufwerke.

**Fernsteuerung von der Zentrale** – in der Zentrale (auch vom Handy) gibt es eine
HP-Karte: sperren, Bildschirm aus, Bildschirm an, Zustand sehen. Der HP ist von
aussen nicht erreichbar, darum holt die App die Befehle alle paar Sekunden selbst
ab – es dauert also ein paar Sekunden. Entsperren aus der Ferne gibt es bewusst
nicht; der PIN wird immer am Gerät verlangt.

**Als Windows-Oberfläche (harter Kiosk)** – unter *Einstellungen → Verhalten*
kannst du die Zentrale als Windows-Shell eintragen: kein Explorer, keine
Taskleiste, kein Alt+Tab. Gilt nur für dein Windows-Konto. Die App lässt das erst
zu, wenn es ein zweites aktives Administrator-Konto als Rettungsweg gibt. Weil ohne
Explorer niemand mehr die Autostart-Programme startet, trägst du MT5 und alles
andere unter *Programme beim Start* ein. Zurückstellen geht im selben Schalter,
und «Explorer jetzt starten» holt die Taskleiste für die laufende Sitzung zurück.

**Einstellungen** – Anmeldung, Aussehen (Hintergrund, helles Thema, Akzentfarbe,
Dock-Grösse), Verhalten (Autostart, Kiosk, Energie), Verbindung, Finder,
geteilte Links, Über.

---

## Tastenkürzel

| Taste | Was |
|---|---|
| `Strg + L` | Sperren (Bildschirm aus) |
| `Strg + E` | Finder |
| `Strg + ,` | Einstellungen |
| `Strg + W` | Fenster schliessen |
| `Strg + M` | Fenster minimieren |
| `Strg + S` | im Editor speichern |
| `Strg + C/X/V` | im Finder kopieren / ausschneiden / einfügen |
| `F2` | umbenennen |
| `Entf` | in den Papierkorb |
| `Strg + Alt + Shift + K` | Kiosk-Modus an/aus (Notausstieg) |
| `Strg + Alt + Shift + Q` | Zentrale sofort beenden |

Die beiden letzten gehen immer, auch wenn die Oberfläche klemmt.

---

## Wenn etwas nicht geht

**«Pi nicht erreichbar»** – läuft Tailscale auf dem HP? Ist der Pi an? Adresse
unter *Einstellungen → Verbindung* prüfen; der Knopf *Speichern & prüfen* sagt
dir genau, woran es hängt.

**Monitor geht nicht aus** – Windows ignoriert das Abschalten, solange es
Eingaben sieht. Maus und Tastatur kurz liegen lassen. Testen kannst du es unter
*Einstellungen → Verhalten → Monitor sofort ausschalten*. Bei manchen
Dockingstations und externen Monitoren klappt es nur über die Bildschirm-Einstellungen
von Windows – dann in den Einstellungen *«Ausschalten» schaltet den Monitor ab*
aus machen, dann wird nur gesperrt.

**App startet nicht mit Windows** – *Einstellungen → Verhalten → Mit Windows
starten* aus- und wieder einschalten. Nur mit der installierten Version (nicht
der portablen).

**Ich komme nicht mehr raus (Kiosk)** – `Strg + Alt + Shift + K`.

**Ordner vom HP auf den Pi laden** – geht nur dateiweise. Ganze Ordner-Bäume
legst du besser über Syncthing oder Nextcloud auf den Pi.

---

## Wie es gebaut ist

```
desktop/
  electron/
    main.js              Fenster, Sperre, IPC, eingebettete Zentrale
    preload.js           Brücke zur Oberfläche (nichts sonst ist erlaubt)
    lib/einstellungen.js Einstellungen als JSON im Benutzerordner
    lib/pi.js            alle Anfragen an die Zentrale auf dem Pi
    lib/lokal.js         Dateien auf dem HP
    lib/anmeldung.js     Anmeldung (Pi + lokaler Zwischenspeicher)
    lib/strom.js         Monitor aus/an, Energiesparmodus, Autostart
    lib/protokoll.js     zdatei:// für Bilder, PDF, Video (mit Range)
  renderer/              Oberfläche: Sperrbildschirm, Fenster, Dock, Apps
```

Sicherheit: `contextIsolation` an, `nodeIntegration` aus, die Oberfläche kann nur
die Funktionen aus `preload.js`. Fremde Zertifikate werden abgelehnt. Die Sitzung
zum Pi liegt in der Partition `persist:zentrale` – dieselbe benutzt das
eingebettete Zentrale-Fenster, darum meldest du dich nur einmal an.
