# ZentraleOS – Ideensammlung

Stand: 12. November 2026. 41 Ideen, kurz gehalten; Details kommen später. Jede Idee wurde von einem zweiten
Agenten gegengeprüft (Spalten «Urteil» und «Begründung»). Die Urteile sind seine Einschätzung, keine Entscheidung –
die triffst du. Wo er sich auf ungeprüftes Wissen stützt, steht es dabei.

Urteile: **passt** = jetzt sinnvoll · **später** = gute Idee, falscher Zeitpunkt oder besser fertig installieren · **eher nicht** = Spielerei, Risiko oder doppelt.

| Nr. | Idee | Kurz | Urteil | Begründung des Prüfers |
|---|---|---|---|---|
| 1 | **Fotos** | Zeigt Bilder vom Rechner und vom Pi als Raster, Klick öffnet gross. | später | Nextcloud zeigt Fotos schon im Browser; lokal reicht ein fertiger Bildbetrachter. |
| 2 | **Papierkorb & Bildschirmfoto-Werkzeug** | Papierkorb auf dem Schreibtisch; Bereich aufziehen, speichern oder kopieren. | passt | Grundfunktion, wenig Aufwand; die Journal-Schnellnotiz braucht es. |
| 3 | **Zwischenablage-Verlauf** | Die letzten kopierten Texte und Bilder zum Wiedereinfügen. | passt | Hoher Alltagsnutzen beim Programmieren; die Technik gibt es fertig. |
| 4 | **Honeypot** | Lockvogel-Dienst, der Zugriffsversuche protokolliert und meldet. | eher nicht | Ein absichtlich offener Dienst gehört nicht auf den Rechner mit Live-Konto; wenn, dann getrennt auf dem Pi. |
| 5 | **Sicherheits-Zentrale** | Eine Seite: Firewall, Updates, offene Ports, Anmeldeversuche, Ampel. | passt | Zieht Vorhandenes zusammen, nur Anzeige, wenig Risiko. |
| 6 | **Netzwerk-Wächter** | Scannt das Heimnetz, zeigt alle Geräte, meldet neue. | später | Gehört auf den Pi, der immer läuft und schon einen Netz-Tab hat. |
| 7 | **Sicherheits-Labor** | Kali-Werkzeuge in einer abgetrennten Umgebung, per Klick startbar. | später | Schnell eingerichtet, aber Angriffswerkzeuge nicht früh auf den Trading-Rechner. |
| 8 | **Fernzugriff (RustDesk)** | Diesen Rechner aus der Ferne bedienen und von hier andere. | passt | Für einen Dauerläufer Pflicht, nur über Tailscale. Ob RustDesk mit dieser Oberfläche sauber läuft, ist ungeprüft; Alternative testen. |
| 9 | **Lern-App Berufsmatura** | Karteikarten mit Wiederholung, Lernplan, Prüfungs-Timer. | eher nicht | Anki gibt es fertig und ist besser als ein Eigenbau; Bedarf erst ab Sommer 2027. Vorschlag: Anki vorinstallieren. |
| 10 | **Buchhaltung** | Einnahmen und Ausgaben, Trading-Ergebnisse, Export für die Steuern. | eher nicht | Rechenfehler im Eigenbau werden zu Steuerfehlern; fertiges Programm nehmen, höchstens den Trade-Export selbst bauen. |
| 11 | **Trading-Cockpit** | Widgets: Handelszeiten-Uhr, offene Positionen, Tagesergebnis. | passt | Kernnutzen; die Uhr ist einfach, Positionen hängen an der ungetesteten MT5-Anbindung. |
| 12 | **Wirtschaftskalender-Widget** | Anstehende Wirtschaftsdaten mit Wichtigkeit. | passt | Direkt handelsrelevant; braucht eine verlässliche Datenquelle. |
| 13 | **Journal-Schnellnotiz** | Tastenkürzel: Bildschirmfoto plus Notiz landet im Trade-Journal. | passt | Kleiner Aufwand, spart bei jedem Trade Zeit. |
| 14 | **Lokale KI** | Assistent in der Suche; gerechnet wird auf dem Haupt-PC. | später | Wenig Aufwand, geht aber nur, wenn der Haupt-PC läuft; kein Grundbedarf. |
| 15 | **ML-Werkbank** | Jupyter als Programm für Daten- und Modellversuche. | eher nicht | Ein Installationsbefehl; gerechnet wird besser auf dem Haupt-PC mit Grafikkarte. |
| 16 | **Quanten-Spielwiese** | Simulator zum Ausprobieren von Quantenschaltungen. | eher nicht | Spielerei ohne Bezug zu Trading, Schule oder Sicherheit. |
| 17 | **Notizen (Obsidian)** | Obsidian vorinstalliert mit dem synchronisierten Vault. | passt | Reine Installation; auf Sync-Konflikte achten. |
| 18 | **Medien-Player** | Jellyfin-Programm für Filme und Musik vom Pi, Mini-Player-Widget. | später | Das Programm installieren genügt; das Widget ist Spielerei. |
| 19 | **Fokus-Modus** | Systemweit Ablenkungen blocken für eine Lern- oder Handelssitzung. | später | Überschneidet sich mit dem Fokus-Tab und deinem Fokus-Projekt; erst dort bündeln, hier nur ein Schalter. |
| 20 | **Pi-Mitteilungen** | Meldungen vom Pi (Dienst gestört, Backup fertig) in der Taskleiste. | passt | Wenig Aufwand, hoher Nutzen beim Dauerläufer. |
| 21 | **Zeitmaschine** | Schnappschüsse des Systems vor Updates, mit Zurückrollen. | passt | Bei einem selbst gebauten System unverzichtbar. Muss VOR der Installation auf die Platte entschieden werden. |
| 22 | **Profil-Sync** | Einstellungen und Layout automatisch auf dem Pi sichern. | später | Der Export existiert; ein Zeitplan, der die Datei kopiert, reicht. |
| 23 | **Modi** | Umschaltbare Layouts (Trading, Lernen, Kino). | später | Erst sinnvoll, wenn alles auf echter Hardware stabil läuft. |
| 24 | **Windows-Programme** | Assistent für Wine. | passt | Eng fassen: nur MetaTrader 5 robust machen. Grösstes offenes Geldrisiko des Projekts. |
| 25 | **Android-Apps** | Android-Apps als Fenster. | eher nicht | Pflegeintensiv, kein konkreter Anwendungsfall. |
| 26 | **Virtuelle Maschinen** | Andere Systeme (Windows, Kali) als VM starten. | später | Fertiges Programm installieren; 14 GB RAM sind knapp. Eine Windows-VM ist der Notausgang, falls MT5 unter Wine nicht stabil läuft. |
| 27 | **Container-Manager** | Übersicht über Container, starten, stoppen, Protokolle. | eher nicht | Die Container laufen auf dem Pi, nicht hier. |
| 28 | **Passwörter** | Bitwarden-Programm an Vaultwarden angebunden. | passt | Reine Installation, täglicher Nutzen; fürs automatische Ausfüllen braucht es die Browser-Erweiterung. |
| 29 | **Datenträgerverwaltung** | Laufwerke einhängen, formatieren, Belegung. | passt | Nötig, aber ein fertiges Programm installieren; selbst gebautes Formatieren riskiert Datenverlust. |
| 30 | **Autostart & Standardprogramme** | Was startet mit, was öffnet welche Datei. | passt | Pflicht: MT5 und Bot müssen nach einem Neustart von selbst laufen. |
| 31 | **Fenster-Übersicht** | Alle offenen Fenster auf einen Blick. | später | Ein Fensterwechsler ist da; eine echte Übersicht mit Vorschauen ist aufwendig. |
| 32 | **Lebendiger Hintergrund** | Tag/Nacht-Wechsel, Diashow, Video. | eher nicht | Video kostet auf dem Dauerläufer dauernd Leistung; höchstens Tag/Nacht. |
| 33 | **Design-Pakete** | Komplette Looks speichern, wechseln, teilen. | eher nicht | Bei einem Benutzer decken Akzentfarbe und Profil-Export das ab. |
| 34 | **Diktat** | Sprache zu Text, lokal. | später | Auf dem HP ohne Grafikkarte langsam; besser auf dem Haupt-PC rechnen. |
| 35 | **Körper-Widgets** | Garmin-Werte, Makros und Kalorien des Tages. | später | Die Daten liegen im Gesundheits-Tab; nur einbetten. |
| 36 | **Handy-Verbindung** | Benachrichtigungen, Dateien, Zwischenablage mit dem Pixel. | später | Läuft, braucht aber eigene Einbindung; über Tailscale vermutlich hakelig (ungeprüft). |
| 37 | **Gäste-Modus** | Eingeschränkte Sitzung für Besuch. | eher nicht | An einen Rechner mit Live-Handelskonto gehört kein Besuch. |
| 38 | **Morgen-Briefing** | Beim Anmelden: Termine, Märkte, Pi-Zustand, Aufgaben. | später | Doppelt sich mit dem Heute-Tab; höchstens den Tab beim Anmelden zeigen. |
| 39 | **Erststart-Assistent** | Sprache, WLAN, Tailscale, Zentrale-Anmeldung, PIN, Design. | eher nicht | Ein Benutzer, ein Rechner: feste Werte reichen. |
| 40 | **Automationen** | Wenn-Dann-Regeln (22 Uhr → Szene Nacht; VPN weg → warnen). | später | Ein Regel-Editor ist viel Aufwand; die Warnungen gehören in Sicherheits-Zentrale und Mitteilungen. |
| 41 | **Status-Bildschirmschoner** | Bei Untätigkeit: grosse Uhr, Pi-Ampel, offene Positionen. | später | Hübsch, aber offene Positionen auf dem gesperrten Bildschirm sieht jeder im Raum. |

Zählung: 14 passt · 16 später · 11 eher nicht.

## Was dem Prüfer in der Liste fehlte

| Nr. | Idee | Kurz |
|---|---|---|
| 42 | **Bot-Wächter** | Überwacht MT5 und Bot (Prozess, Verbindung, Lebenszeichen), startet neu, alarmiert aufs Handy, mit Not-Aus. |
| 43 | **Daten-Backup** | Persönliche Daten, MT5-Profile und Bot-Konfiguration verschlüsselt auf den Pi sichern, mit Wiederherstellungstest. |
| 44 | **Plattenverschlüsselung** | Verschlüsselte Platte plus automatische Sperre, weil Broker-Zugänge darauf liegen; Entsperren nach Neustart muss vor der Installation gelöst sein. |
| 45 | **Update-Steuerung** | Sicherheitsupdates automatisch, aber nie Neustart bei offenen Positionen oder während der Handelszeiten. |
| 46 | **Dauerläufer-Betrieb** | Automatisch einschalten nach Stromausfall, Temperatur überwachen, aus der Ferne wecken. |
| 47 | **Notfall-Sitzung** | Stürzt die Oberfläche ab, startet eine nackte Sitzung mit Terminal, damit du dich nicht aussperrst. |

## Reihenfolge, die der Prüfer vorschlägt

1. **Windows-Programme, nur MT5** (24) – alles andere ist wertlos, wenn MT5 nicht stabil läuft.
2. **Zeitmaschine** (21) – die Entscheidung muss vor der Installation fallen.
3. **Autostart** (30) – MT5 und Bot laufen nach einem Neustart von selbst.
4. **Fernzugriff** (8) – der Dauerläufer ist ohne Bildschirm bedienbar.
5. **Pi-Mitteilungen** (20) – der Kanal wird auch für Bot- und VPN-Warnungen gebraucht.
6. **Sicherheits-Zentrale** (5) – zeigt, ob der Rechner mit dem Live-Konto sauber ist.
7. **Passwörter** (28) – reine Installation, sofort Nutzen.
8. **Trading-Cockpit** (11) – baut auf 1 und 5 auf.

## Wo ich dem Prüfer widerspreche

- **Honeypot (4):** Als Lern-Projekt für dein Sicherheitsinteresse ist er gut – aber auf dem Pi oder in einer VM, nicht auf dem Trading-Rechner. Die Idee bleibt, der Ort ändert sich.
- **Fotos (1):** Ein fertiger Bildbetrachter löst es für lokale Bilder sofort; eine eigene App lohnt erst, wenn sie Pi-Fotos besser zeigt als Nextcloud.
- **Lern-App (9):** Einverstanden mit «nicht selbst bauen». Anki vorinstallieren kostet nichts und ist bis 2027 bereit.
