// Typen für die Seite «Netz → Heimnetz / Ports & Zugriff».

export type Erreichbar = { status: 'ja' | 'teil' | 'nein' | 'unbekannt'; text: string };

export interface NetzPort {
  id: string;
  proto: 'tcp' | 'udp';
  port: number;
  bind: 'alle' | 'lokal' | 'einzeln';
  ips: string[];
  prozess: string | null;
  container: string | null;
  name: string;
  zweck: string;
  rolle: 'dienst' | 'tor' | 'intern';
  ziel: number | null;
  heimnetz: Erreichbar;
  tailnet: Erreichbar;
}

export type GeraetArt = 'router' | 'fernseher' | 'lautsprecher' | 'nas' | 'drucker' | 'pc' | 'handy' | 'pi' | 'streaming' | 'iot' | 'unbekannt';
export type Besitzer = 'meins' | 'familie' | 'gast' | 'unbekannt';

export interface HausGeraet {
  ip: string;
  mac: string | null;
  herstellerMac: string | null;
  zufaelligeMac: boolean;
  hostname: string | null;
  name: string | null;
  modell: string | null;
  hersteller: string | null;
  upnpServer: string | null;
  dienste: string[];
  upnpTypen: string[];
  dns: string | null;
  istRouter: boolean;
  istPi: boolean;
  istTv: boolean;
  istPc: boolean;
  art: GeraetArt;
  artText: string;
  hinweise: string[];
  eigenerName: string | null;
  besitzer: Besitzer;
  erstmals: number | null;
  neu: boolean;
  anzeigeName: string | null;
}

export interface TailnetPeer {
  name: string;
  ip: string;
  online: boolean;
  os: string;
  besitzer: string;
  istGast: boolean;
  selbst?: boolean;
  zuletzt?: string | null;
  aktiv?: boolean;
}

export interface Quelle {
  ip: string;
  name: string | null;
  bereich: 'heimnetz' | 'tailnet' | 'internet' | 'docker';
  verbindungen: number;
  aktiv: number;
  unbeantwortet: number;
  verschiedenePorts: number;
  ports: { port: number; proto: string; n: number; unbeantwortet: number }[];
  protos: string[];
  verdacht: boolean;
}

export interface FirewallRegel {
  aktion: string;
  ports: string;
  proto: string | null;
  iface: string | null;
  von: string;
  kommentar: string;
}

export interface NetzwerkZustand {
  zeit: number;
  schnittstellen: { name: string; ip: string; praefix: number; art: string }[];
  heimnetz: { name: string; ip: string; cidr: string; gateway: string | null } | null;
  suche: { zeit: number; aktiv: boolean; angestupst: number };
  geraete: HausGeraet[];
  tailnet: { peers: TailnetPeer[]; verfuegbar: boolean; name: string | null };
  liste: NetzPort[];
  firewall: { verfuegbar: boolean; standardEingang: string | null; aktiv: boolean; dockerSperre: boolean | null; regeln: FirewallRegel[] };
  tailnetRegeln: { quelle: 'live' | 'annahme'; quelleText: string; alle: boolean; regeln: string[] };
  verbindungen: { verfuegbar: boolean; quellen: Quelle[]; tailscaleIp?: string | null };
  wache: boolean;
}

export interface PortPruefung {
  ip: string;
  offen: { port: number; name: string; zweck: string }[];
  geprueft: number;
  vermutung: string | null;
  warnungen: string[];
  zeit: number;
}
