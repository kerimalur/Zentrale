# Morgenbericht – ZentraleOS 0.1 (12. November 2026)

**Vorweg, weil es das Wichtigste ist:** Die Nacht ist nicht so gelaufen wie bestellt. Ich habe von 23:47 bis
etwa 01:10 gearbeitet, dann stand die Sitzung bis 08:01 still, bis du «Weiter» geschrieben hast. Fertig wurde
es zwischen 08:00 und 09:15. Der Umfang ist entsprechend klein: ein System, das bootet und dessen Kern
getestet ist – nicht das ganze Pflichtenheft.

## Was funktioniert (belegt)

GitHub-Actions-Lauf 43176991319 auf `os-nacht` (Commit `1a357de`): ISO gebaut, in QEMU **mit KVM** über UEFI
gestartet, **51 von 51 Prüfungen bestanden**. Bilder und Protokoll im Artefakt `vm-test`, ISO im Artefakt
`zentraleos-iso` (1,2 GB, SHA-256 `551da733…72094fe`).

- Start über Bootmenü bis zum Anmeldebildschirm, Anmeldung per PIN über die Tastatur, Schreibtisch.
- Zentrale-Apps als echte Fenster (iframe, nackt), mehrere gleichzeitig – im Demo-Modus.
- Terminal mit echter Shell; `sudo` nur mit Passwort. Kein Root ohne Administrator-Passwort.
- Firewall wirkt von aussen; Regel setzen, **Rücknahme nach 60 s ohne Bestätigung**, Bestätigen, Entfernen.
- Einstellungen (21 Bereiche), Zeitzone ändern wirkt im System, Erscheinungsbild live.
- Finder mit «Pi» (Demo) und Kopieren in beide Richtungen, Aktivitätsanzeige, Launchpad, Spotlight,
  Kontrollzentrum, Flathub-Suche, fremdes Programm als eigenes Fenster mit Dock-Eintrag.
- Sperren; gesperrt geht keine Root-Aktion, kein Terminal, kein Programmstart.

## Was nicht funktioniert oder fehlt

- **Auf echter Hardware wurde nichts getestet.** WLAN, Bluetooth, Helligkeit, Akku, Touchpad, Iris-Xe-Grafik:
  alles offen. In der VM stürzte der Compositor mit Software-OpenGL ab; dort rechnet er jetzt ohne OpenGL.
  Auf dem HP läuft er mit OpenGL – genau der Weg, den ich nicht prüfen konnte. Fällt er aus, startet er
  einmal ohne OpenGL neu; sonst hilft der Bootmenü-Eintrag «sicherer Grafikmodus».
- **Installation auf die SSD: ungetestet.** Calamares liegt nur bei.
- **MetaTrader 5: ungetestet.** Nur der Assistent ist geschrieben (MT5-BERICHT.md).
- **Gegen den echten Pi: ungetestet** (kein Passwort, kein 2FA). Alles zur Zentrale lief gegen den Demo-Server.
- Nicht gebaut: Erststart-Assistent, Mission Control, Spaces, Hot Corners, Rollback, Gesperrter Modus, eigene
  Programme für Notizen/Rechner/Uhr/Wetter/Kalender/Laufwerke, Klänge und mehr (Liste in LIESMICH.md).
- Die Phase-0-Messreihe (drei Oberflächen-Prototypen) habe ich nicht gemacht (ENTSCHEIDUNGEN 2).
- Gebaut wurde nicht auf dem HP, sondern in der Cloud-Arbeitsumgebung (ENTSCHEIDUNGEN 1). Am HP ist nichts verändert.

## Startzeit

9,6 s (Kernel 3,4 s + System 6,1 s) – **in der KVM-VM auf GitHub, vom ISO**. Das ist kein Wert für den HP und
enthält weder Firmware noch Bootmenü (5 s Wartezeit). Das Ziel «unter 25 s auf der SSD» ist damit nicht belegt.

## Bekannte Fehler und Schwächen

1. Die Sperre ist app-seitig, keine echte Sitzungssperre. Wer `Strg+Alt+F2` drückt, braucht zwar das
   Passwort, aber ein Programm, das sich nach dem Sperren öffnet, läge über dem Sperrbildschirm.
2. Demo-Modus ist Standard und setzt PIN 1234. Vor ernsthaftem Gebrauch ausschalten und PIN neu setzen.
3. Live-System: Passwort `zentrale` ist öffentlich bekannt. SSH ist aus.
4. Im ISO steckt ein Testmodus (DevTools-Zugang), aktiv nur in einer VM mit Kernel-Parameter `zos.test`.
5. Fenster der Shell und fremde Fenster sind zwei Welten: `Alt+Tab` wechselt nur fremde, Shell-Fenster liegen
   immer darunter. Menüleiste zeigt für fremde Programme keine Menüs.
6. Bootmenü und Startanimation habe ich in der Endfassung nicht angesehen; möglich, dass dort noch Debian steht.
7. Anzeige-Einstellungen gelten nur bis zum Abmelden. Tastaturlayout-Wechsel erst nach Neustart.

## Was du zuerst prüfen sollst

1. ISO aus dem Actions-Artefakt laden, Prüfsumme vergleichen, Stick schreiben (LIESMICH.md).
2. **HP vom Stick starten, nichts installieren.** Kommt der Anmeldebildschirm? PIN 1234.
3. Einstellungen → WLAN: Netze sichtbar, Verbinden klappt? Das ist die grösste offene Frage (der HP hat nur WLAN).
4. Ton, Helligkeitstasten, Touchpad, `Super + Leertaste`, `Super + L`.
5. Terminal: `sudo -n true` muss scheitern, `sudo true` nach dem Passwort fragen.
6. Erst danach: Tailscale anmelden, Demo-Modus aus, mit Zentrale-Passwort + 2FA anmelden.

## Taugt es als Alltagssystem?

**Nein, noch nicht.** Es ist ein bootender, getesteter Kern mit eigenem Gesicht – eine gute Grundlage, kein
fertiges Betriebssystem. Ohne Hardware-Test, ohne geprüfte Installation und ohne echte Sitzungssperre würde
ich es nicht als einziges System auf einen Rechner setzen.

**MetaTrader 5:** nicht belegt, in keiner Richtung. Der HP soll Windows behalten, solange dein Bot dort Geld
bewegt. ZentraleOS vom Stick auszuprobieren kostet nichts und ändert an der SSD nichts.

## Nächster Schritt

Hardware-Probe am HP (Punkte 2–5), dann in dieser Reihenfolge: echte Sitzungssperre, Installation in der VM
testen (Calamares, LUKS), MT5-Assistent in einer KVM-VM durchlaufen lassen, Erststart-Assistent.
