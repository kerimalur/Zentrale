# Erweiterungen

Dieser Ordner landet im System unter `/opt/zentraleos/erweiterungen`.

- `mt5-installieren.sh` – Assistent für MetaTrader 5 (siehe `os/MT5-BERICHT.md`)
- `wine-assistent.sh` – beliebigen Windows-Installer in eigenem Präfix ausführen

**Eigene Erweiterungen ohne Neubau:** Lege Skripte und Programmeinträge in deinem
Benutzerordner ab:

- `~/.local/share/applications/*.desktop` – erscheint sofort in Launchpad und Spotlight
- `~/.config/ZentraleOS/einstellungen.json` – alle Einstellungen der Oberfläche (Profil)
- `~/.local/share/zentraleos/` – Daten der Assistenten (Wine-Präfixe)

Eigene Designs/Widgets als Dateien laden ist noch nicht gebaut (Ausbaupfad).
