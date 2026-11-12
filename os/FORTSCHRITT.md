# Fortschritt (os-nacht)

Zeiten in MEZ, Nacht vom 11. auf den 12. November 2026.

| Zeit | Getan | Hindernis / Abkürzung |
|---|---|---|
| 23:47 | Auftrag gelesen, Umgebung geprüft | Linux-Umgebung auf dem HP noch am Herunterladen, kein Zugriff auf Docker in WSL → Bau in der Cloud-Arbeitsumgebung (ENTSCHEIDUNGEN 1) |
| 23:50 | Repo geklont, Branch `os-nacht` von `desktop-hp`, Version 1 gelesen | – |
| 23:53 | ISO-Bau mit live-build in Docker, erster Bau gestartet | Docker Hub 429 → Basis-Image über mirror.gcr.io |
| 00:05 | **ISO 1 gebaut** (1,24 GB, 12 Min.) | – |
| 00:07 | Shell portiert: iframe statt WebContentsView, Demo-Server, Systemmodul, Terminal, Einstellungen | contextBridge kann kein Proxy-Objekt weitergeben; `pty.py` überdeckte das Python-Modul `pty` → umbenannt |
| 00:10 | ISO 1 in QEMU (UEFI) gestartet: Bootmenü → Kernel → greetd | Sitzung starb: live-config meldete einen nicht vorhandenen Benutzer an; `agreety` nicht im Pfad |
| 00:12 | Oberflächentests unter Xvfb (DevTools): Anmeldung, 13 Apps, Finder Pi↔Rechner, Steuerung, Terminal, Fernsperre, Fehlversuch-Bremse | – |
| 00:25 | **ISO 2**: bootet bis in die Sitzung, labwc + Shell laufen | **labwc stürzt in der VM mit Software-OpenGL ab** (Segfault, sobald die Shell ihr Fenster öffnet) |
| 00:35 | Gleiche Sitzung im Debian-13-Container nachgestellt (labwc ohne Bildschirm, pixman): läuft, fremdes Fenster (foot) über der Shell, Dock zeigt es | → in VMs und im «sicheren Grafikmodus» rechnet labwc jetzt ohne OpenGL; Neustart ohne OpenGL nach Absturz |
| 00:47 | Testmodus (DevTools nur in VM + Kernel-Parameter), Systemtest-Skript, eigenes Bootmenü, **ISO 4** gestartet | ISO 3 abgebrochen (wäre ohne Testmodus gewesen) |
| 01:00 | **ISO 4** gebaut; Teil 1 von `testen.sh` (UEFI-Start): Sperrbildschirm erscheint | Test tippte ein Leerzeichen in den PIN; iso9660 lässt sich in der Bauumgebung nicht einhängen → Teil 2 brach ab |
| ca. 01:10 – 08:01 | **Stillstand.** Die Sitzung lief nicht weiter, bis «Weiter» kam | Sieben Stunden verloren |
| 08:05 | Kernel per xorriso aus dem ISO geholt; Systemtests im gebooteten System (lokal, ohne KVM) | sudo-Fehlermeldung war deutsch → «falsches Passwort» nicht erkannt; Tailscale fehlte im lokalen Abbild (Paketquelle von dort nicht erreichbar) |
| 08:25 | GitHub Actions mit KVM: 48 von 51 | **Firewall-Rücknahme kam zu spät** (systemd-Timer mit 1 Minute Toleranz) – lokal nur durch Glück bestanden; Bluetooth-Seite blieb ohne Gerät leer |
| 08:50 | Beides behoben; Lauf 43176991319: **51 von 51**, ISO als Artefakt | – |
| 09:10 | LIESMICH, MORGENBERICHT, MT5-BERICHT | – |
