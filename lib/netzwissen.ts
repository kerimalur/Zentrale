// Lerninhalte für die Netz-Seite: Glossar (Pop-ups), Lektionen, Geschichten aus deinem Homelab, Selbsttest.

export interface Begriff {
  titel: string;
  kurz: string;
  text: string[];
  beiDir?: string;
  merke?: string;
  siehe?: string[];
}

export const GLOSSAR: Record<string, Begriff> = {
  ip: {
    titel: 'IP-Adresse',
    kurz: 'Die Hausnummer eines Geräts im Netz.',
    text: [
      'Jedes Gerät braucht eine Adresse, damit andere es finden. Im Heimnetz sieht sie so aus: 192.168.0.25 – vier Zahlen von 0 bis 255.',
      'Adressen, die mit 192.168, 10. oder 172.16 bis 172.31 beginnen, sind «privat»: Sie gelten nur hinter deinem Router und werden im Internet nie weitergeleitet. Dein Router hat zusätzlich eine öffentliche Adresse – die sieht die Welt.',
      'Tailscale vergibt eigene Adressen im Bereich 100.64.0.0 bis 100.127.255.255.',
    ],
    beiDir: 'Dein Pi hat mehrere Adressen gleichzeitig: eine im Heimnetz, eine im Tailnet (100.73.91.110) und je eine für jedes Docker-Netz.',
    merke: 'Private Adressen sind von aussen nicht erreichbar – das ist schon der erste Schutz.',
    siehe: ['subnetz', 'router', 'tailscale'],
  },
  subnetz: {
    titel: 'Subnetz (z. B. 192.168.0.0/24)',
    kurz: 'Der Strassenabschnitt, in dem alle Geräte direkt miteinander reden.',
    text: [
      'Die Angabe «/24» heisst: Die ersten 24 von 32 Bit der Adresse sind das Netz, der Rest nummeriert die Geräte. Bei /24 bleiben 254 Adressen (…0.1 bis …0.254).',
      'Geräte im gleichen Subnetz finden sich direkt (per ARP). Alles andere schickt ein Gerät an den Router, der den Weg weiss.',
    ],
    merke: '/24 = 254 mögliche Geräte. Darum kann dein Pi das ganze Heimnetz in wenigen Sekunden «durchzählen».',
    siehe: ['ip', 'arp', 'router'],
  },
  router: {
    titel: 'Router & NAT',
    kurz: 'Die Tür zwischen deinem Haus und dem Internet.',
    text: [
      'Der Router verbindet dein Heimnetz mit dem Internet. Er hat nach aussen eine öffentliche Adresse und verteilt innen private Adressen (DHCP).',
      'NAT («Network Address Translation») ist sein wichtigster Trick: Alle Geräte teilen sich die eine öffentliche Adresse. Der Router merkt sich, welches Gerät welche Anfrage gestellt hat, und leitet die Antwort zurück.',
      'Darum kann niemand von aussen einfach auf dein Handy oder den Pi zugreifen: Der Router weiss nicht, wohin er unverlangte Pakete schicken soll – ausser du richtest eine Portweiterleitung ein. Hast du nicht.',
    ],
    merke: 'Ohne Portweiterleitung ist dein Heimnetz von aussen unsichtbar. Tailscale baut deshalb einen eigenen Tunnel von innen nach aussen.',
    siehe: ['ip', 'dhcp', 'tailscale'],
  },
  dhcp: {
    titel: 'DHCP',
    kurz: 'Der Dienst, der neuen Geräten eine Adresse leiht.',
    text: [
      'Schliesst du ein Gerät ans WLAN an, fragt es «Wer gibt mir eine Adresse?». Der Router (DHCP-Server) leiht ihm eine für einige Stunden oder Tage.',
      'Darum ändern sich Adressen manchmal. Wer eine feste Adresse braucht (z. B. der Pi), bekommt im Router eine «Reservierung».',
    ],
    siehe: ['ip', 'router', 'mac'],
  },
  mac: {
    titel: 'MAC-Adresse',
    kurz: 'Die Seriennummer der Netzwerkkarte.',
    text: [
      'Jede Netzwerkkarte hat eine MAC-Adresse wie 34:f1:50:33:e2:26. Die ersten drei Paare verraten den Hersteller (z. B. Raspberry Pi, Synology, Sonos).',
      'Handys, Tablets und neuere Notebooks erzeugen heute eine zufällige MAC pro WLAN («private Adresse»), damit man sie nicht über Netze hinweg verfolgen kann. Erkennbar daran, dass das zweite Hex-Zeichen 2, 6, A oder E ist. Diese Geräte zeigen dann keinen Hersteller.',
    ],
    beiDir: 'Darum steht bei manchen Geräten «zufällige MAC (vermutlich Handy)»: Das ist kein Fehler, sondern Datenschutz.',
    merke: 'Die MAC gilt nur im eigenen Netz. Sie verlässt den Router nie.',
    siehe: ['arp', 'ip'],
  },
  arp: {
    titel: 'ARP',
    kurz: 'Das Rufen «Wer hat die Adresse 192.168.0.25?» im Netz.',
    text: [
      'Ein Gerät, das 192.168.0.25 erreichen will, schreit ins Netz: «Wer ist 192.168.0.25? Bitte deine MAC!» Das Gerät antwortet. Das Ergebnis merkt sich der Pi in seiner ARP-Tabelle (/proc/net/arp).',
      'Diese Tabelle nutzt deine Seite: Sie stupst jede Adresse im Netz kurz an. Wer existiert, antwortet auf die ARP-Frage und steht danach in der Tabelle – ganz ohne Ports zu prüfen.',
    ],
    merke: 'ARP funktioniert nur im selben Subnetz. Darum findest du so alle Geräte im Haus, aber keine im Internet.',
    siehe: ['subnetz', 'mac'],
  },
  port: {
    titel: 'Port',
    kurz: 'Die Tür-Nummer an einer Adresse.',
    text: [
      'Eine IP-Adresse findet das Gerät, der Port findet das Programm darauf. Man kann es sich wie ein Haus mit 65 535 nummerierten Türen vorstellen. Hinter jeder Tür wartet höchstens ein Programm.',
      'Bekannte Nummern: 22 = SSH, 53 = DNS, 80 = Web (ohne Schloss), 443 = Web (mit Schloss/HTTPS). Eigene Dienste nutzen oft Nummern wie 8096 (Jellyfin) oder 8989 (Sonarr).',
      'Eine Adresse plus Port ergibt das Ziel: 100.73.91.110:443 heisst «der Pi, Tür 443».',
    ],
    beiDir: 'Auf deinem Pi lauschen aktuell mehrere Dutzend Ports. Die Tabelle im Reiter «Ports & Zugriff» zeigt, welche das sind.',
    merke: 'Ein offener Port ist nicht gefährlich an sich. Gefährlich ist ein Port, hinter dem ein schlecht geschützter Dienst für Unbefugte erreichbar ist.',
    siehe: ['tcp_udp', 'dienst', 'bind'],
  },
  tcp_udp: {
    titel: 'TCP und UDP',
    kurz: 'Zwei Arten, Daten zu schicken.',
    text: [
      'TCP baut zuerst eine Verbindung auf («Hallo? – Hallo! – Los») und stellt sicher, dass alles ankommt. Webseiten, SSH und Downloads nutzen TCP.',
      'UDP schickt einfach los, ohne Rückfrage. Das ist schneller und passt für Namensabfragen (DNS), Videoanrufe oder Geräte-Suche (mDNS, SSDP).',
      'Port 53/tcp und 53/udp sind zwei verschiedene Türen – deshalb steht in den Listen immer dabei, welches Protokoll gemeint ist.',
    ],
    siehe: ['port'],
  },
  dienst: {
    titel: 'Dienst',
    kurz: 'Ein Programm, das auf einem Port auf Anfragen wartet.',
    text: [
      'Ein Dienst ist ein Programm im Hintergrund, das auf Anfragen wartet: Jellyfin liefert Filme, Nextcloud Dateien, Pi-hole beantwortet DNS-Fragen.',
      'Man sagt: Der Dienst «lauscht» auf einem Port. Wer diesen Port erreicht, kann mit dem Dienst reden – und muss sich dann meist noch anmelden.',
    ],
    siehe: ['port', 'bind', 'docker'],
  },
  bind: {
    titel: 'Lauschen: lokal oder für alle?',
    kurz: 'Ein Dienst entscheidet selbst, von wo er Anfragen annimmt.',
    text: [
      'Beim Start sagt jeder Dienst, auf welcher Adresse er lauscht:',
      '• 127.0.0.1 («localhost»): Nur Programme auf dem Pi selbst kommen ran. Von aussen ist der Dienst unsichtbar – selbst wenn die Firewall offen wäre.',
      '• 0.0.0.0 oder :: («alle»): Der Dienst nimmt Anfragen auf jeder Netzwerkkarte an – Heimnetz, Tailscale, Docker. Dann entscheiden Firewall und Tailscale-Regeln, wer wirklich durchkommt.',
      '• Eine bestimmte Adresse (z. B. nur die Tailscale-Adresse): Nur dort.',
    ],
    beiDir: 'Zentrale, InfluxDB und die Caddy-Verwaltung lauschen nur lokal. Die meisten Docker-Dienste lauschen auf «alle» – deine Firewall und die Tailscale-Regel halten sie trotzdem zu.',
    merke: 'Lokal gebunden ist die stärkste Sperre: Was nicht lauscht, kann nicht angegriffen werden.',
    siehe: ['firewall', 'docker', 'proxy'],
  },
  docker: {
    titel: 'Docker und veröffentlichte Ports',
    kurz: 'Container sind kleine abgeschottete Programmpakete mit eigenem Netz.',
    text: [
      'Jeder Container lebt in einem eigenen kleinen Netz (z. B. 172.23.0.0/16). Damit du ihn erreichst, «veröffentlicht» Docker einen Port des Containers auf dem Pi, zum Beispiel 8989 → 8989.',
      'Standardmässig veröffentlicht Docker auf 0.0.0.0, also für alle. Man kann es auf 127.0.0.1 einschränken («127.0.0.1:8989:8989»), dann ist der Port nur lokal sichtbar – genau das, was Caddy braucht.',
      'Hinter einem veröffentlichten Port steht ein kleines Programm namens docker-proxy, das die Verbindung in den Container weiterreicht.',
    ],
    beiDir: 'Dein Pi hat mehr als ein Dutzend Docker-Ports auf «alle». Dass sie trotzdem niemand von aussen erreicht, liegt an der Firewall, der Docker-Sperre fürs Heimnetz und den Tailscale-Regeln.',
    siehe: ['bind', 'proxy'],
  },
  proxy: {
    titel: 'Reverse Proxy (Caddy)',
    kurz: 'Ein Empfang, der Besucher an die richtige Abteilung weiterleitet.',
    text: [
      'Ein Reverse Proxy steht vor deinen Diensten. Er nimmt die Anfrage an, schaut, wohin sie soll, und leitet sie an den passenden Dienst weiter – der Dienst selbst muss nirgends mehr öffentlich lauschen.',
      'Caddy macht bei dir zwei Dinge: Er sorgt für HTTPS (Zertifikat, Schloss im Browser) und gibt jedem Dienst einen Eingang. Die Eingänge heissen «Port + 10000»: Sonarr (8989) erreichst du über Port 18989.',
      'Dahinter spricht Caddy ohne Umweg mit dem Dienst, über 127.0.0.1:8989. Dort kommt sonst niemand hin.',
    ],
    beiDir: 'Caddy lauscht auf 443, 8443 und allen Ports 1xxxx. Auf diesen Ports erlaubt deine Tailscale-Regel den Zugriff – alles andere ist zu.',
    merke: 'Vorteil: Ein Eingang, ein Zertifikat, eine Stelle für Regeln. Nachteil: Fällt Caddy aus, sind alle Weboberflächen weg.',
    siehe: ['https', 'bind', 'cookie'],
  },
  https: {
    titel: 'HTTPS und Zertifikate',
    kurz: 'Das Schloss im Browser: verschlüsselt und beweist, wer du bist.',
    text: [
      'HTTPS verschlüsselt die Verbindung zwischen Browser und Server. Niemand dazwischen kann mitlesen oder verändern.',
      'Das Zertifikat ist ein Ausweis: Es beweist, dass dein Pi wirklich «homelabkerim.taila4b96b.ts.net» ist. Tailscale stellt es kostenlos aus, Caddy holt es automatisch und erneuert es selbst.',
      'Ohne HTTPS warnt Chrome «Nicht sicher», und manche Funktionen (Passkeys, Kamera, Zwischenablage) funktionieren gar nicht.',
    ],
    beiDir: 'Auch ohne HTTPS wäre der Verkehr über Tailscale schon verschlüsselt. Das Schloss ist für Browser und Apps – es ist die zweite Schicht.',
    siehe: ['proxy', 'tailscale'],
  },
  tailscale: {
    titel: 'Tailscale und das Tailnet',
    kurz: 'Ein privates Netz nur für deine Geräte – über das Internet, aber unsichtbar.',
    text: [
      'Tailscale baut zwischen deinen Geräten verschlüsselte Tunnel (mit WireGuard). Jedes Gerät bekommt eine Adresse 100.x.y.z. Zusammen bilden sie dein «Tailnet».',
      'Der Trick: Die Geräte rufen von innen nach aussen bei Tailscale an. Der Router muss darum nichts freigeben. Wer nicht im Tailnet angemeldet ist (Google-Login + 2FA), sieht den Pi gar nicht.',
      'Dein Handy kommt so auch aus dem Mobilfunknetz an den Pi, als wäre es zu Hause.',
    ],
    beiDir: 'Im Tailnet sind nur deine vier Geräte (PC, Laptop, Pixel, Pi). Darum können «nur du» die Dienste sehen: Fremde brauchen erst einen Platz im Tailnet.',
    merke: 'Schicht 1 ist die Anmeldung beim Tailnet. Wer sie nicht hat, kommt nicht einmal bis zur Firewall.',
    siehe: ['acl', 'exitnode', 'firewall'],
  },
  acl: {
    titel: 'Tailscale-Zugriffsregeln (ACL)',
    kurz: 'Die Gästeliste: Welches Gerät darf auf welchen Port.',
    text: [
      'Standardmässig dürfen im Tailnet alle Geräte alles. Mit Zugriffsregeln («Grants») legst du fest, wer wohin darf – bei dir: deine Geräte untereinander, aber nur auf bestimmten Ports.',
      'Die Regel stammt aus dem Tailscale-Adminbereich und wird von Tailscale selbst auf jedem Gerät durchgesetzt. Ein verbotener Port antwortet nicht einmal.',
      'Deine Regel erlaubt: 22 (SSH), 443 und 8443 (Caddy), 10000–19999 (Caddy-Eingänge der Dienste), 53 (DNS), 22000 und 21027 (Syncthing), 21118 (RustDesk) – sonst nichts.',
    ],
    beiDir: 'Seit der Regel laden die alten Ports wie 7878 oder 8989 nicht mehr über Tailscale – nur noch die HTTPS-Eingänge 17878 und 18989.',
    merke: 'Die ACL ist die zweite Tür. Ohne sie wäre jeder offene Port im Tailnet für alle deine Geräte erreichbar.',
    siehe: ['tailscale', 'firewall', 'proxy'],
  },
  firewall: {
    titel: 'Firewall (ufw)',
    kurz: 'Der Türsteher mit einer Liste, wer rein darf.',
    text: [
      'Eine Firewall entscheidet bei jedem neuen Paket: durchlassen oder verwerfen. ufw (Uncomplicated Firewall) steuert auf dem Pi die Regeln im Kernel.',
      'Der Standard bei dir ist «deny incoming»: Alles, was neu hereinkommt, wird verworfen – ausser es steht ausdrücklich auf der Liste (z. B. Syncthing, SSH aus dem Heimnetz, der Fernseher für Jellyfin).',
      'Wichtig zu wissen: Docker trägt seine eigenen Regeln vorbei an ufw ein, und Tailscale winkt Verkehr aus dem Tunnel vor ufw durch. Darum brauchst du auch die Tailscale-Regel und die Docker-Sperre.',
    ],
    beiDir: 'Fürs Heimnetz (WLAN/LAN) ist der Pi fast komplett zu. Nur ausgewählte Ports sind offen – siehe Tabelle.',
    merke: 'Mehrere Schichten sind besser als eine: Wenn eine Regel mal ein Loch hat, hält die nächste.',
    siehe: ['acl', 'docker', 'portscan'],
  },
  dns: {
    titel: 'DNS und Pi-hole',
    kurz: 'Das Telefonbuch des Internets.',
    text: [
      'Computer brauchen Adressen, Menschen Namen. DNS übersetzt «jellyfin.org» in eine IP-Adresse. Jede Webseite beginnt mit einer DNS-Frage.',
      'Pi-hole beantwortet diese Fragen für dein Netz und lügt bei Werbe- und Tracker-Servern absichtlich: Es antwortet «gibt es nicht». So laden Werbung und Tracker gar nicht erst.',
    ],
    beiDir: 'Darum steht Port 53 auf deiner Liste, und darum merkt man, wenn der Pi aus ist: Ohne DNS lädt nichts mehr.',
    siehe: ['port', 'tailscale'],
  },
  mdns: {
    titel: 'mDNS (Bonjour/Avahi)',
    kurz: 'Geräte rufen im Netz «Ich bin der Drucker, ich kann drucken!».',
    text: [
      'Mit mDNS stellen sich Geräte im Heimnetz selbst vor, ohne zentralen Server: «Ich heisse nas.local und biete Dateifreigaben an.» Jeder im Netz kann fragen und bekommt Antworten.',
      'So finden Handy und Fernseher Sonos-Boxen, Drucker oder Chromecasts. Deine Seite fragt dasselbe: «Wer bietet SMB, Drucken, Chromecast … an?» und baut daraus die Gerätekarten.',
    ],
    merke: 'mDNS bleibt im Subnetz. Ein Gerät im Gästenetz oder im Internet hört das nie.',
    siehe: ['ssdp', 'arp'],
  },
  ssdp: {
    titel: 'SSDP und UPnP',
    kurz: 'Noch eine Art, sich im Netz vorzustellen – gern von Fernsehern und Medienservern.',
    text: [
      'SSDP ist der «Ruf»: Ein Gerät fragt per Multicast «Wer ist hier ein Medienserver?» und die Geräte antworten mit einer Adresse. Danach holt man dort eine kleine Beschreibung (XML) mit Name, Hersteller und Modell – das ist UPnP.',
      'So findet dein Fernseher den Jellyfin-Server (DLNA). Deine Seite macht dasselbe und liest so Namen wie «Philips 43PUS6704» oder «Sonos Play:1» aus.',
    ],
    beiDir: 'Darum erlaubt die Firewall dem Fernseher Port 1900/udp und 8096.',
    siehe: ['mdns'],
  },
  portscan: {
    titel: 'Port-Scan',
    kurz: 'Jemand klopft systematisch an alle Türen.',
    text: [
      'Ein Port-Scan probiert viele Ports durch und schaut, wo jemand antwortet. Angreifer nutzen das, um offene Dienste zu finden. Netzwerk-Admins nutzen es, um ihr eigenes Netz zu prüfen.',
      'Der Pi erkennt Scans so: Ein Absender versucht in kurzer Zeit viele verschiedene Ports, und fast alle bleiben unbeantwortet (weil die Firewall sie verwirft). Das sieht der Kernel in der Verbindungsverfolgung.',
      'Die Wache der Zentrale meldet es, wenn ein Absender mindestens 12 verschiedene Ports abklopft und mindestens 8 davon unbeantwortet bleiben.',
    ],
    merke: 'Geräte, die von selbst «scannen» (Fernseher, Sonos), klopfen an wenigen Ports. Ein echter Scan klopft an Dutzenden.',
    siehe: ['conntrack', 'firewall'],
  },
  conntrack: {
    titel: 'Verbindungsverfolgung',
    kurz: 'Das Notizbuch des Kernels über alle laufenden Verbindungen.',
    text: [
      'Der Linux-Kernel merkt sich jede Verbindung (wer mit wem, auf welchem Port, in welchem Zustand). Das braucht die Firewall, um Antworten zu erlauben.',
      '«Unbeantwortet» heisst: Jemand hat ein Paket geschickt, aber es gab keine Antwort – zum Beispiel weil die Firewall es verwirft oder der Port nichts macht. Viele unbeantwortete Versuche an verschiedene Ports von einem Absender sind das typische Muster eines Scans.',
      'Deine Seite liest dieses Notizbuch (/proc/net/nf_conntrack) und gruppiert es nach Absender.',
    ],
    siehe: ['portscan', 'firewall'],
  },
  exitnode: {
    titel: 'Exit-Node',
    kurz: 'Dein Pi als Ausgang ins Internet, wenn du unterwegs bist.',
    text: [
      'Normalerweise geht dein Handy unterwegs direkt ins Internet. Mit dem Exit-Node leitest du den gesamten Verkehr durch den Tunnel zum Pi, und von dort ins Internet. Webseiten sehen dann die Adresse deines Heimanschlusses.',
      'Nützlich in fremden WLANs: Der Betreiber sieht nur einen verschlüsselten Tunnel. Dafür geht alles über deine Upload-Geschwindigkeit zu Hause.',
    ],
    siehe: ['tailscale'],
  },
  cookie: {
    titel: 'Cookies und Ports',
    kurz: 'Browser merken sich Cookies pro Hostname – nicht pro Port.',
    text: [
      'Ein Cookie ist ein kleiner Zettel, den eine Webseite im Browser ablegt (Anmeldung, Einstellungen). Der Browser schickt ihn bei jeder Anfrage an dieselbe Adresse zurück.',
      'Wichtig: Cookies unterscheiden Hostnamen, aber nicht Ports. Alle deine Dienste liegen unter demselben Namen (homelabkerim.taila4b96b.ts.net) nur auf verschiedenen Ports – also teilen sie sich einen Cookie-Topf.',
      'Wird der Topf zu voll, lehnt ein Dienst die Anfrage ab (HTTP-Fehler 400, «Header zu gross»). Genau das ist dir bei Sonarr passiert.',
    ],
    merke: 'Mit eigenen Namen pro Dienst (Subdomains) würde das nicht passieren – der Preis dafür ist eine eigene Domain.',
    siehe: ['proxy'],
  },
  nas: {
    titel: 'NAS',
    kurz: 'Ein kleiner Server nur für Dateien.',
    text: [
      'NAS heisst «Network Attached Storage»: ein Gerät mit Festplatten, das Dateien im Netz freigibt – meist per SMB (Windows), NFS (Linux) oder AFP (Apple), dazu eine Weboberfläche.',
      'Typische Hinweise im Netz: Ports 445, 5000/5001 (Synology), 2049, Hersteller Synology oder QNAP und die mDNS-Dienste smb oder afpovertcp.',
    ],
    beiDir: 'Die Seite erkennt NAS-Geräte an Name, Hersteller, mDNS-Diensten und – nach Klick auf «Ports prüfen» – an den offenen Ports.',
    siehe: ['mdns', 'port'],
  },
};

// ---------- Lektionen ----------
export interface Lektion {
  id: string;
  nr: number;
  titel: string;
  frage: string;
  intro: string;
  begriffe: string[];
  probier: string;
  ziel?: 'heim' | 'ports' | 'lernen';
}

export const LEKTIONEN: Lektion[] = [
  {
    id: 'adressen',
    nr: 1,
    titel: 'Wie findet ein Paket sein Ziel?',
    frage: 'Wer bin ich im Netz und woher weiss der Router, wohin?',
    intro: 'Jedes Gerät hat eine Adresse (IP) und eine Seriennummer (MAC). Der Router verbindet dein Haus mit dem Internet, und DHCP verteilt die Adressen. Hier lernst du, wie Geräte sich im Haus finden.',
    begriffe: ['ip', 'subnetz', 'router', 'dhcp', 'mac', 'arp'],
    probier: 'Öffne den Reiter «Heimnetz» und tippe auf «Jetzt suchen». Jede Karte zeigt IP und MAC. Wähle ein Gerät und lies, woran die Seite es erkannt hat.',
    ziel: 'heim',
  },
  {
    id: 'ports',
    nr: 2,
    titel: 'Ports: die Türen am Gerät',
    frage: 'Warum hat ein Pi hunderte Türen, und wer klopft wo an?',
    intro: 'Ein Gerät hat 65 535 Ports. Dienste lauschen auf einem davon und entscheiden, wer überhaupt klopfen darf (lokal oder für alle). Docker veröffentlicht Ports und kann sie öffnen, ohne dass du es merkst.',
    begriffe: ['port', 'tcp_udp', 'dienst', 'bind', 'docker'],
    probier: 'Im Reiter «Ports & Zugriff»: Finde Port 8989 (Sonarr) und Port 18989. Welcher ist nur lokal, und welcher ist der Eingang? Warum zwei?',
    ziel: 'ports',
  },
  {
    id: 'schichten',
    nr: 3,
    titel: 'Wer darf rein? Mehrere Schichten',
    frage: 'Warum sehen nur meine Geräte meine Dienste?',
    intro: 'Dein Schutz besteht aus Schichten: Tailscale-Anmeldung, Zugriffsregel (ACL), Firewall, Caddy mit HTTPS, Login des Dienstes. Fällt eine, halten die anderen.',
    begriffe: ['tailscale', 'acl', 'firewall', 'proxy', 'https'],
    probier: 'Im Reiter «Ports & Zugriff» steht oben der «Weg einer Anfrage». Schalte von «Tailscale» auf «Heimnetz» und schau, an welcher Stelle die Anfrage stoppt.',
    ziel: 'ports',
  },
  {
    id: 'erkennen',
    nr: 4,
    titel: 'Wer ist da? Wer klopft an?',
    frage: 'Wie finden Geräte sich, und wie merke ich einen Scan?',
    intro: 'Geräte stellen sich selbst vor (mDNS, UPnP). Der Kernel notiert jede Verbindung. Aus beidem kannst du erkennen, was im Netz lebt und ob jemand systematisch an Türen rüttelt.',
    begriffe: ['mdns', 'ssdp', 'conntrack', 'portscan', 'nas'],
    probier: 'Im Reiter «Heimnetz», Abschnitt «Wer klopft beim Pi an?»: Welche Absender siehst du? Welche haben unbeantwortete Verbindungen?',
    ziel: 'heim',
  },
  {
    id: 'alltag',
    nr: 5,
    titel: 'Alltag und Stolpersteine',
    frage: 'Warum geht manchmal nichts, obwohl alles richtig aussieht?',
    intro: 'DNS entscheidet, ob Webseiten laden. Cookies teilen sich Ports. Ein Exit-Node leitet alles um. Das sind die Dinge, über die man im Homelab am häufigsten stolpert.',
    begriffe: ['dns', 'cookie', 'exitnode'],
    probier: 'Lies unten die vier Geschichten «Aus deinem Homelab». Jede ist heute wirklich passiert.',
    ziel: 'lernen',
  },
];

// ---------- Geschichten aus deinem Homelab ----------
export interface Geschichte {
  id: string;
  titel: string;
  problem: string;
  ursache: string;
  loesung: string;
  lehre: string;
  begriffe: string[];
}

export const GESCHICHTEN: Geschichte[] = [
  {
    id: 'tuersteher',
    titel: 'Der Türsteher, der alle durchwinkt',
    problem: 'Die alten Ports (z. B. 7878) luden über Tailscale weiter, obwohl ufw sie nicht erlaubte.',
    ursache: 'Tailscale legt vor die ufw-Regeln eine eigene Firewall-Kette («ts-input») mit der Regel «alles, was aus dem Tunnel kommt, annehmen». ufw sieht diese Pakete nie. Auch Docker trägt Regeln an ufw vorbei ein.',
    loesung: 'Statt ufw haben wir die Tailscale-Zugriffsregel (ACL) im Adminbereich gesetzt: Deine Geräte dürfen den Pi nur noch auf bestimmten Ports erreichen.',
    lehre: 'Prüfe immer, welche Schicht wirklich entscheidet. Mehr Regeln sind nutzlos, wenn sie an der falschen Stelle stehen. Teste von einem anderen Gerät aus.',
    begriffe: ['firewall', 'acl', 'tailscale'],
  },
  {
    id: 'kekse',
    titel: 'Zu viele Kekse',
    problem: 'Sonarr zeigte «HTTP ERROR 400». Im Inkognito-Fenster ging alles.',
    ursache: 'Alle Dienste liegen unter demselben Namen und teilen sich die Cookies des Browsers (nur 192 Cookies, zusammen 851 KB). Sonarr lehnt zu grosse Anfragen ab.',
    loesung: 'Cookies für taila4b96b.ts.net gelöscht. Danach lief alles.',
    lehre: 'Cookies kennen keine Ports. Mit einer eigenen Domain und einem Namen pro Dienst gäbe es das Problem nicht.',
    begriffe: ['cookie', 'proxy'],
  },
  {
    id: 'weiterleitung',
    titel: 'Eine Weiterleitung mit falschem Schloss',
    problem: '«Client sent an HTTP request to an HTTPS server» – nach dem Login von Sonarr, Radarr und Prowlarr.',
    ursache: 'Die Apps wissen nicht, dass vor ihnen HTTPS steht. Sie leiteten auf eine http://-Adresse weiter, und der Browser sprach dann unverschlüsselt mit Caddy.',
    loesung: 'Caddy schreibt die Weiterleitungs-Adresse um («header_down Location ^http:// https://»).',
    lehre: 'Hinter einem Reverse Proxy muss man manchmal dem Dienst oder dem Proxy sagen, welches Schloss draussen wirklich vorhängt.',
    begriffe: ['proxy', 'https'],
  },
  {
    id: 'bindmount',
    titel: 'Die Datei, die der Container nicht sah',
    problem: 'Caddy zeigte nach einer Änderung im Caddyfile weiter das Alte, obwohl die Datei auf dem Pi stimmte und der Reload «Valid» meldete.',
    ursache: 'Mit «sed -i» wird eine Datei durch eine neue ersetzt (neue Inode). Der Container hält aber die alte Datei im Bind-Mount fest und liest weiter den Stand von vorher.',
    loesung: 'Container neu starten («docker compose restart caddy»), dann sieht er die neue Datei.',
    lehre: 'Nach Änderungen an einzeln eingehängten Dateien den Container neu starten, nicht nur neu laden.',
    begriffe: ['docker', 'proxy'],
  },
];

// ---------- Selbsttest ----------
export interface Frage {
  frage: string;
  antworten: string[];
  richtig: number;
  erklaerung: string;
}

export const FRAGEN: Frage[] = [
  {
    frage: 'Ein Dienst lauscht auf 127.0.0.1:8989. Wer erreicht ihn?',
    antworten: ['Alle Geräte im Heimnetz', 'Alle Geräte im Tailnet', 'Nur Programme auf dem Pi selbst', 'Jeder im Internet'],
    richtig: 2,
    erklaerung: '127.0.0.1 bedeutet «dieser Rechner selbst». Darum kann Caddy ihn erreichen – von sonst niemandem.',
  },
  {
    frage: 'Wozu dient bei dir Caddy auf Port 18989?',
    antworten: ['Er ist das Passwort für Sonarr', 'Er ist der HTTPS-Eingang und leitet intern an Sonarr (8989) weiter', 'Er blockiert Werbung', 'Er speichert Sonarrs Daten'],
    richtig: 1,
    erklaerung: 'Caddy ist der Reverse Proxy: Er hält das Zertifikat und reicht die Anfrage an 127.0.0.1:8989 weiter.',
  },
  {
    frage: 'Was erkennst du an «zufällige MAC»?',
    antworten: ['Das Gerät ist gehackt', 'Typisch für Handys, die ihre Adresse aus Datenschutzgründen ändern', 'Es ist ein Router', 'Es ist ein NAS'],
    richtig: 1,
    erklaerung: 'Handys und neuere Notebooks nutzen eine private MAC pro WLAN, damit man sie nicht verfolgen kann.',
  },
  {
    frage: 'Warum nützt es nichts, in ufw eine Regel für tailscale0 zu setzen?',
    antworten: ['ufw funktioniert nicht auf dem Pi', 'Tailscale winkt Verkehr aus dem Tunnel vor ufw durch', 'tailscale0 ist ein Docker-Netz', 'Die Regel muss grossgeschrieben werden'],
    richtig: 1,
    erklaerung: 'In der Kette «ts-input» steht «alles von tailscale0 annehmen». Die Zugriffsregel (ACL) im Tailscale-Adminbereich ist die richtige Stelle.',
  },
  {
    frage: 'Ein Absender klopft in 10 Sekunden an 40 verschiedene Ports, fast alle unbeantwortet. Was ist das wahrscheinlich?',
    antworten: ['Ein Backup', 'Ein Port-Scan', 'Ein Film-Stream', 'Eine Software-Aktualisierung'],
    richtig: 1,
    erklaerung: 'Viele verschiedene Ziele, kaum Antworten: das typische Muster eines Scans.',
  },
  {
    frage: 'Wer sieht den Pi aus dem Internet, wenn du nichts weitergeleitet hast und Tailscale nicht nutzt?',
    antworten: ['Jeder, der seine Adresse kennt', 'Niemand: Der Router (NAT) leitet unverlangte Pakete nirgends hin', 'Nur Google', 'Nur dein Provider'],
    richtig: 1,
    erklaerung: 'NAT ordnet Antworten zu bestehenden Verbindungen zu. Ohne Portweiterleitung weiss der Router nicht, wohin unverlangte Pakete sollen.',
  },
];

// ---------- Anleitung: neuen Dienst freigeben ----------
export const NEUER_DIENST = [
  { titel: 'Dienst nur lokal starten', text: 'Im compose.yml des Dienstes den Port an 127.0.0.1 binden, z. B. "127.0.0.1:9000:9000". So lauscht er nur lokal, und von aussen ist er unsichtbar.' },
  { titel: 'Eingang in Caddy anlegen', text: 'Den Eingang auf «Port + 10000» legen. Er liegt dann im erlaubten Tailscale-Bereich 10000–19999.', befehl: "printf '\\nhomelabkerim.taila4b96b.ts.net:19000 {\\n\\treverse_proxy 127.0.0.1:9000\\n}\\n' >> /mnt/daten/caddy/Caddyfile" },
  { titel: 'Caddy neu starten', text: 'Nicht nur neu laden, sonst sieht der Container die geänderte Datei nicht.', befehl: 'cd /mnt/daten/caddy && docker compose restart caddy' },
  { titel: 'Zugriff prüfen', text: 'Am Handy mit Tailscale die Adresse https://homelabkerim.taila4b96b.ts.net:19000 öffnen. Der alte Port (9000) darf nicht laden. Hier im Reiter «Ports & Zugriff» sollten beide Ports erscheinen.' },
  { titel: 'Anmeldung im Dienst setzen', text: 'Jeder Dienst sollte ein eigenes Passwort verlangen (und wenn möglich 2FA). Das ist die letzte Schicht.' },
];
