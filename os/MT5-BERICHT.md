# MetaTrader 5 auf ZentraleOS – Bericht

**Kurz: Der Assistent ist geschrieben, aber nicht getestet. Ich habe MetaTrader 5 in dieser Nacht kein
einziges Mal unter ZentraleOS installiert oder gestartet.** Es gibt kein Bildschirmfoto, weil es nichts zu
fotografieren gab. Alles unten ist Bauplan und Erwartung, kein Messergebnis.

## Warum nicht getestet

- Die Test-VM lief ohne KVM (reine Emulation, 2 Kerne). Ein Start bis zum Schreibtisch dauert dort mehrere
  Minuten. Wine plus der MT5-Installer wären darin nicht in vertretbarer Zeit durchgelaufen.
- Die Reihenfolge im Auftrag stellt MT5 ans Ende. Die Zeit ging in «bootet zuverlässig» (ein Absturz des
  Compositors in der VM), Anmeldung, Schreibtisch, Zentrale-Apps, Einstellungen, Terminal und Firewall.

## Was gebaut ist

`os/erweiterungen/mt5-installieren.sh` (im System: `/opt/zentraleos/erweiterungen/`), erreichbar über
**Software → Empfohlen / Windows-Programme → «Assistent starten»** und über Spotlight («MetaTrader 5
installieren»). Der Assistent läuft sichtbar in einem Terminal-Fenster der Shell:

1. Installiert Wine, falls es fehlt: `wine wine64 wine32:i386 winbind cabextract fonts-liberation fonts-wine`
   aus Debian 13 (Wine 10.0). Braucht das Administrator-Passwort und Internet, rund 600 MB.
   Wine ist **nicht** im ISO.
2. Legt ein eigenes Präfix an: `~/.local/share/zentraleos/wine/mt5` (64 Bit, Windows-Version «win10»).
3. Lädt den offiziellen Installer von MetaQuotes zur Laufzeit:
   `https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe`
   (Die Adresse war aus der Bauumgebung erreichbar. Mitgeliefert wird nichts von MetaQuotes.)
4. Führt den Installer aus (dessen Fenster ist ein normales Fenster über dem Schreibtisch).
5. Findet er danach `drive_c/Program Files/MetaTrader 5/terminal64.exe`, legt er den Programmeintrag
   `~/.local/share/applications/zos-mt5.desktop` an → erscheint in Launchpad und Spotlight.
6. Entfernen: `mt5-installieren.sh --entfernen` (löscht Präfix und Eintrag, fragt vorher nach).

Geprüft ist davon nur: das Skript ist syntaktisch gültig (`bash -n`), und die Download-Adresse antwortet.

## Bekannte Lücken und Risiken (ungeprüft, aus Erfahrung mit Wine)

- **Live-System vom USB-Stick:** Wine und MT5 landen im Arbeitsspeicher. Mit wenig RAM reicht der Platz
  nicht. Sinnvoll erst auf einer installierten Platte – und die Installation auf die SSD ist selbst noch
  nicht getestet.
- **Dock:** Im Dock erscheint MT5 erst, wenn es läuft (als fremdes Fenster). Ein fester Dock-Platz für
  fremde Programme ist nur über die Einstellungsdatei möglich (`prog:zos-mt5`).
- **WebView2:** Neuere MT5-Versionen wollen die WebView2-Laufzeit von Microsoft (Marktplatz, Anmeldeseiten).
  Der Assistent installiert sie nicht. Erwartung: Charts und Handel gehen, einzelne eingebettete Seiten nicht.
- **Schriften:** Ohne Microsoft-Kernschriften sehen Dialoge anders aus; `fonts-liberation` ersetzt die meisten.
- **Deinstallation über die Oberfläche:** nur per Skript, nicht per Knopf.
- **Wayland:** Wine 10 aus Debian läuft über XWayland. Das ist im ISO enthalten, aber mit Wine nicht erprobt.

## Was auf echter Hardware zu prüfen ist (in dieser Reihenfolge)

1. Assistent durchlaufen lassen: Wird Wine installiert? Läuft der Installer bis zum Ende?
2. Startet `terminal64.exe`, erscheint das Fenster, bleibt es beim Verschieben und Maximieren heil?
3. Anmeldung an einem **Demo-Konto** (keine echten Zugangsdaten zum Testen).
4. Charts flüssig? CPU-Last im Leerlauf (Aktivitätsanzeige)?
5. Expert Advisor laden, Strategietester starten.
6. Stabilität über 24 Stunden, Verhalten nach Bildschirm-aus und nach Netzunterbruch.

## Ehrliche Einschätzung für deinen Bot

Dein Trading-Bot läuft heute unter Windows direkt neben MT5. Unter Wine ist MT5 selbst meist brauchbar,
aber «meist» reicht nicht für Geld, das über Nacht unbeaufsichtigt handelt. **Solange die sechs Punkte oben
nicht über mehrere Tage sauber durchgelaufen sind, gehört der Bot nicht auf ZentraleOS.** Der HP sollte bis
dahin Windows behalten; ZentraleOS lässt sich vom USB-Stick ausprobieren, ohne die SSD anzufassen.
