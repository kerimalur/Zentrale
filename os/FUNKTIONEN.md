# ZentraleOS – was es ist und was es kann

Stand: 12. November 2026, Branch `os-nacht`. Diese Datei beschreibt den gebauten Stand, nicht die Wünsche.
Was davon wie getestet ist, steht in `LIESMICH.md`.

## Was es ist

Ein eigenes Betriebssystem für den PC (64 Bit, UEFI). Es startet vom USB-Stick, ohne die Festplatte
anzufassen. Unter der Haube Linux (Debian 13), darüber eine eigene Oberfläche. Die Zentrale vom Pi ist
vorinstalliert: jeder Tab ist ein eigenes Programm.

Auf dem HP vom Stick gestartet: Anmeldebildschirm, Schreibtisch, Programme und Kabelnetz funktionieren
(Rückmeldung vom 12.11.2026).

## Start und Anmeldung

- Bootmenü mit drei Einträgen: normal, sicherer Grafikmodus, Wartungskonsole.
- Anmeldebildschirm mit Uhr; Anmeldung per PIN, Rückfall Zentrale-Passwort mit 2FA.
- 10 Fehlversuche in 5 Minuten sperren die Anmeldung für 5 Minuten.
- Sperren per Windows-Taste + L, über das Startmenü, automatisch nach Zeit oder aus der Ferne vom Pi.
- Demo-Modus mit Testdaten (PIN 1234), damit alles ohne Pi vorführbar ist. Abschaltbar.

## Oberfläche

- **Taskleiste:** Start-Knopf, Suchfeld, angeheftete Programme, laufende Programme, Infobereich (Netz, Ton,
  Akku, Mitteilungen, Uhr, Pi-Zustand). Einstellbar: oben/unten, Mitte/links, schwebend oder volle Breite,
  Höhe, Suchfeld, Reihenfolge.
- **Startmenü:** Suche über Programme und Einstellungen, angeheftete Programme, Zentrale-Apps als Gruppe,
  alle Programme. Rechtsklick: an Taskleiste anheften, auf den Schreibtisch legen.
- **Suche (Spotlight):** Programme, Rechner, Einheiten, Systembefehle.
- **Kontrollzentrum:** Netzwerk, Bluetooth, Tailscale, Dunkelmodus, Nicht stören, Sperren, Ton, Helligkeit,
  Exit-Node.
- **Mitteilungen:** Verlauf aller Hinweise.
- **Fenster:** verschieben, Grösse ändern, minimieren, maximieren. Aus dem Vollbild herausziehen. Einrasten
  an Rändern und Ecken (Hälften, Viertel), Auswahl am Maximieren-Knopf (Hälften, Drittel, zwei Drittel,
  Viertel). Knöpfe rechts oder links.
- **Schreibtisch:** Symbole und Widgets frei platzierbar, ein Klick öffnet.
- **Widgets:** Pi-Zustand, Haus & Steuerung, Dienste, Strom, Speicher, Netz, Downloads, Backup, Szene,
  Trading, Heute, Gesundheit, Uhr, Notizzettel, Bild. Pro Widget: Grösse stufenlos, Form (abgerundet, eckig,
  stark gerundet, Kreis), Stil (Glas, deckend, Akzentfarbe, ohne Hintergrund).
- **Fremde Programme** (Browser, Terminal-Fenster, installierte Programme) laufen als eigene Fenster und
  erscheinen in der Taskleiste.

## Personalisierung

- Akzentfarbe (9 Farben oder eigene): färbt Glas, Hintergrund, Markierungen, Schalter.
- Hell oder dunkel, Hintergrund aus der Akzentfarbe, fester Verlauf oder eigenes Bild.
- Glas-Effekt, Eckenradius, Schriftgrösse, Animationstempo (auch aus).
- Alles wirkt sofort und wird gespeichert. Profil als Datei exportieren und importieren.

## Mitgelieferte Programme

| Programm | Kann |
|---|---|
| **Einstellungen** | 22 Bereiche, siehe unten |
| **Dateien (Finder)** | Ordner auf dem Rechner und auf dem Pi, Liste/Symbole, Vorschau (Bild, PDF, Video, Musik), Text bearbeiten, umbenennen, neu, löschen, kopieren zwischen Rechner und Pi in beide Richtungen, Teilen-Link |
| **Terminal** | echte Kommandozeile, mehrere Fenster, Farbschemata, Schriftgrösse, `sudo` nach Passwort |
| **Web** | Chromium-Browser |
| **Software** | Flathub durchsuchen, installieren, entfernen; Empfehlungen; Web-Apps anlegen; Windows-Programme über Wine; Updates |
| **Task-Manager** | Prozesse mit Beenden, Leistung mit Verlaufskurven, laufende Dienste |
| **Geräte-Manager** | Prozessor, Speicher, Grafik, Netzwerk, Audio, Laufwerke, USB, Eingabe |
| **Netzplan** | Weg ins Internet (Rechner → Router → Exit-Node → Seite), DNS und Werbefilter, Schalter für Exit-Node und DNS, Geräteliste |
| **Steuerung** | Trading-PC ein/aus, Fernseher, Möbel-Temperatur und Lüfter, Szenen, Dienste, Medien und Downloads, Backup, Notbetrieb |
| **13 Zentrale-Apps** | Übersicht, Heute, Gesundheit, Fokus, Trading, System, Netz, Speicher, Cloud, Medien, Gäste, Konsole, Zentrale-Einstellungen – jede als eigenes Fenster direkt vom Pi |

## Einstellungen

WLAN & Kabel · Bluetooth · Netzwerk (Rechnername) · Tailscale (Anmelden, Exit-Node, Geräte) · Anzeige
(Auflösung, Skalierung, Helligkeit) · Ton · Energie (Profile, Akku, Neustart, Ausschalten) · Tastatur (Layout,
Kürzel) · Datum & Uhrzeit · Benutzer & Passwort · Firewall & Sicherheit · Software-Updates · Speicher ·
Personalisierung · Taskleiste & Start · Schreibtisch & Widgets · Anmeldung & Sperre · Zentrale (Demo-Modus,
Adresse) · Finder · Geteilte Links · Verhalten (Profil sichern) · Über (Systemprotokoll).

## Sicherheit

- Normales Rechtemodell: kein Administrator-Zugriff ohne Passwort, weder in der Oberfläche noch im Terminal.
- **Firewall:** eingehend verwerfen, ausgehend erlauben, Tailscale offen. Profile Zuhause/Öffentlich/Strikt,
  eigene Regeln, Protokoll verworfener Verbindungen, offene Ports. Jede Änderung wird nach 60 Sekunden
  zurückgenommen, wenn sie nicht bestätigt wird (Schutz vor Aussperren).
- SSH standardmässig aus. Automatische Sicherheitsupdates an.
- Fernsteuerung vom Pi: sperren und Bildschirm aus. Entsperren aus der Ferne gibt es nicht.
- Geht von sich aus nie in den Ruhezustand (Dauerläufer); der Bildschirm darf ausgehen.

## Was noch fehlt oder ungetestet ist

Installation auf die Festplatte · MetaTrader 5 · Betrieb mit dem echten Pi · WLAN, Bluetooth, Helligkeit auf
dem HP · echte Sitzungssperre · Erststart-Assistent · Papierkorb auf dem Schreibtisch · Bildschirmfoto-Werkzeug
· Zwischenablage-Verlauf · Datenträgerverwaltung · Autostart · Rollback nach Updates.


## Neu am 12.11. abends

Stand und Teststatus jeder Zeile: `AUFGABEN.md`.

- **Installation** auf die Platte (Einstellungen → Installation), wahlweise verschlüsselt.
- **Sperre und Ruhe:** Bildschirm aus nach Leerlauf, Wecken verlangt den Code, «Schlafen gehen» beendet alles ausser den Ausnahmen, nach Neustart der Oberfläche immer gesperrt, Notfall-Sitzung.
- **Grösse & Schrift:** ganze Oberfläche, Symbole, Widget-Inhalt, Taskleiste, Schrift – einzeln.
- **Fenster:** Alt+Tab, Übersicht (Super+Tab), vier Schreibtische (Strg+Super+Pfeil).
- **Neue Programme:** Fotos, Papierkorb, Bildschirmfoto, Datenträger, Sicherheit, Netzwerkwächter, Sicherheitslabor, Fernzugriff, Fokus.
- **Zwischenablage-Verlauf** (Super+V).
- **Einstellungen neu:** Grösse & Schrift, Ruhe & Schlafen, Bot-Wächter, Backup, Installation; Wartungsfenster unter Software-Updates.
- **Vorinstalliert:** Brave (Standard für «Web»), nmap. **Empfohlen:** Anki, Bitwarden, Obsidian, RustDesk, Wireshark, KeePassXC.
- **Kein Schlüsselbund-Fenster** mehr; Neustart und Ausschalten ohne Passwort.

### Tastenkürzel

| Taste | Wirkung |
|-------|---------|
| Super | Startmenü |
| Alt+Tab / Umschalt+Alt+Tab | Fenster wechseln |
| Super+Tab | Übersicht aller Fenster und Schreibtische |
| Strg+Super+Pfeil links/rechts | Schreibtisch wechseln |
| Super+V | Zwischenablage-Verlauf |
| Druck / Umschalt+Druck | Bildschirmfoto ganz / Bereich |
| Super+L | Sperren |
| Super+Leertaste | Suchen |
| Strg+Alt+T oder Super+Eingabe | Terminal |
| Super+Q oder Alt+F4 | Fenster schliessen |
| Super+Pfeile | Fenster links, rechts, maximieren, minimieren |
