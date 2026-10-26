// Form der Daten von /api/state (siehe server/monitor.mjs → snapshot()).

export type DienstStatus = 'online' | 'pausiert' | 'gestoert' | 'offline' | 'unbekannt';

export interface Dienst {
  id: 'nextcloud' | 'jellyfin' | 'vaultwarden' | 'pihole' | 'syncthing' | 'kuma';
  name: string;
  status: DienstStatus;
  ausGrund: string | null;
  ms: number | null;
  verlauf: number[];
  kennzahl: string;
  label: string;
  url: string;
}

export interface Ereignis {
  t: number;
  art: 'ok' | 'info' | 'warnung' | 'fehler' | 'film' | 'gast' | 'nacht';
  text: string;
}

export interface Laufwerk {
  name: string;
  modell: string;
  mount: string;
  typ: 'sd' | 'ssd' | 'hdd';
  gross: number;
  benutzt: number;
  frei: number;
  port: string;
  schlaeft: boolean | null;
  gesundheit: { stufe: 'ok' | 'warnung' | 'fehler'; text: string; temp: number | null; stunden: number | null; zeit: string | null } | null;
}

export interface Geraet {
  name: string;
  typ: 'pc' | 'handy' | 'laptop' | 'geraet';
  os: string;
  ip: string;
  online: boolean;
  zuletzt: string | null;
  download: number;
  upload: number;
  dns: number | null;
  gast: boolean;
}

export interface SyncZeile {
  titel: string;
  unter: string;
  t: string | null;
  art: 'ok' | 'warnung' | 'fehler' | 'aus' | 'info';
  wann?: string;
}

export interface Gast {
  id: string;
  name: string;
  email: string;
  jellyfin: boolean;
  jfName: string | null;
  jfPasswort: string | null;
  erstellt: number;
  bis: number | null;
  status: 'eingeladen' | 'aktiv';
  geraete: number;
  inviteUrl: string | null;
}

export interface Einstellungen {
  nachtAuto: boolean;
  nachtVon: string;
  nachtBis: string;
  telegram: boolean;
  checkAn: boolean;
  checkZeiten: string[];
  favoriten: string[];
  hddSchlaf: boolean;
  luefterAusUnter: number;
  backupAuto: boolean;
  moebelWarnAb: number;
  luefterModus: 'auto' | 'an' | 'aus';
  luefterAnAb: number;
}

export interface Torrent {
  hash: string;
  name: string;
  fortschritt: number;
  down: number;
  up: number;
  eta: number | null;
  zustand: string;
  groesse: number;
  kategorie: string;
  hinzugefuegt: number;
}

export interface MedienApp {
  id: string;
  name: string;
  url: string | null;
  zustand: 'online' | 'gestoert' | 'pausiert' | 'offline';
  laufzeit: string;
  version: string | null;
  warnungen: { typ: string; text: string }[];
  warteschlange: number | null;
  anzahl: number | null;
  anzahlLabel: string;
  vorhanden: number | null;
  gesamt: number | null;
  detail: string;
  fehlt: string[];
  fehler: string | null;
  ausgeschaltet: boolean;
}

export interface Medien {
  vpn: {
    ok: boolean | null;
    geschuetzt: boolean | null;
    ip?: string;
    land?: string;
    stadt?: string;
    anbieter?: string;
    pi?: string | null;
    fehler?: string;
    zeit?: number;
    gluetun: string | null;
    health: string | null;
    ausgeschaltet: boolean;
  };
  downloads: {
    down: number;
    up: number;
    verbindung: string;
    gedrosselt: boolean;
    anzahl: { laden: number; pausiert: number; fehler: number; fertig: number };
    torrents: Torrent[];
  } | null;
  downloadsGrund: string | null;
  arrGrund: string[];
  apps: MedienApp[];
  demnaechst: { titel: string; wann: string; art: 'serie' | 'film' | 'musik'; hatDatei: boolean }[];
  neu: { id: string; titel: string; wann: string; art: 'serie' | 'film' }[];
  seerr: { offen: number; inArbeit: number; verfuegbar: number; gesamt: number } | null;
  filmabendDrosseln: boolean;
}

export type UpdateArt = 'major' | 'minor' | 'patch' | 'prerelease' | 'image' | 'unbekannt';

export interface ContainerUpdate {
  name: string;
  image: string;
  tag: string;
  art: UpdateArt | null;
  von: string | null;
  nach: string | null;
  link: string | null;
  ordner: string | null;
  dienst: string | null;
}

export interface ContainerUpdates {
  bereit: boolean;
  grund: string | null;
  url: string;
  liste: ContainerUpdate[];
  gesamt: number;
  zeit: number | null;
  fehler: { name: string; text: string }[];
}

export interface Zustand {
  zeit: number;
  uhrzeit: string;
  szene: { id: string; name: string; seit: number; auto: boolean };
  szenen: { id: string; name: string; wirkung: string[] }[];
  energie: { watt: number | null; quelle: 'shelly' | 'schaetzung'; chfMonat: number | null; verlauf: (number | null)[] };
  dienste: Dienst[];
  verfuegbarkeit30: number | null;
  pi: {
    cpu: number | null;
    ramBenutzt: number;
    ramTotal: number;
    temp: number | null;
    mhz: number | null;
    maxMhz: number | null;
    governor: string | null;
    unterspannung: boolean | null;
    uptimeS: number;
    last: number[];
    modell: string;
    os: string;
    kernel: string;
    hostname: string;
    kerne: number;
    updates: number | null;
    container: { laufen: number; gesamt: number };
  } | null;
  luefter: { vorhanden: boolean; prozent: number | null };
  moebel: {
    vorhanden: boolean; temp: number | null; zeit: number | null; min24: number | null; max24: number | null; verlauf: (number | null)[]; warnAb: number;
    luefter: { vorhanden: boolean; an: boolean | null; modus: 'auto' | 'an' | 'aus'; grund: string; seit: number | null; anAb: number; fehler: string | null };
  };
  cloud: Cloud;
  anschluesse: { port: string; geraet: string; info: string; ok: boolean | null }[];
  laufwerke: Laufwerk[];
  scrutinyUrl: string;
  containerUpdates: ContainerUpdates;
  speicher: { kategorien: { name: string; bytes: number }[]; zeit: number };
  netz: {
    geraete: Geraet[];
    verkehr: { down: number; up: number }[];
    heute: { down: number; up: number };
    lan: { name: string; mbit: number; verbunden: boolean } | null;
    ping: number | null;
    tailscale: { aktiv: boolean; ip: string; dns: string };
    pihole: { anfragen: number | null; geblockt: number | null; prozent: number | null } | null;
  };
  sync: SyncZeile[];
  backup: { eingerichtet: boolean; laeuft: boolean; auto: boolean; zeit: string; letzte: { zeit: number; ok: boolean; bytes: number; dauerS: number; fehler: string | null } | null };
  ereignisse: Ereignis[];
  gaeste: { bereit: boolean; grund: string | null; aclVorschlag: string; jellyfinUrl: string; jellyfinBereit: boolean; liste: Gast[] };
  einstellungen: Einstellungen;
  faehigkeiten: { telegram: boolean; hddSchlaf: boolean; luefter: boolean; moebel: boolean; sshNurSchluessel: boolean | null; backup: boolean; shelly: boolean };
  medien: Medien | null;
  steuerung: Steuerung;
  pc: PcStatus;
  tv: TvStatus;
  hostName: string;
  hinweise: string[];
}

export interface CloudDatei { nutzer: string; name: string; ordner: string; bytes: number; zeit: number }
export interface Cloud {
  bereit: boolean;
  grund: string | null;
  zeit?: number;
  nutzer?: { name: string; belegt: number }[];
  haupt?: string | null;
  platz?: { gross: number; frei: number } | null;
  ordner?: { name: string; bytes: number; ordner: boolean }[];
  neu?: CloudDatei[];
  zehnMin?: { anzahl: number; bytes: number };
  stunde?: { anzahl: number; bytes: number };
  heute?: { anzahl: number; bytes: number };
  letzter?: number | null;
  aktiv?: boolean;
  ziele?: { nutzer: string; ordner: string; anzahl: number; bytes: number; zuletzt: number }[];
  laufend?: { nutzer: string; bytes: number; seit: number; zuletzt: number }[];
  haengend?: number;
  fehler?: { zeit: number; app: string; text: string; anzahl: number; stufe: 'fehler' | 'schwer' }[];
}

export interface PcStatus {
  eingerichtet: boolean;
  name: string;
  online: boolean | null;
  geraet: string | null;
  zuletzt: string | null;
  gewecktUm: number | null;
  ausBereit: boolean;
  ausUm: number | null;
}

export interface TvStatus {
  eingerichtet: boolean;
  name: string;
  an: boolean | null;
  lautstaerke: number | null;
  stumm: boolean | null;
  schaltetEin: boolean;
  kannWecken: boolean;
}

export interface Steuerung {
  notbetrieb: { an: boolean; seit: number | null };
  dienste: { container: string; name: string; gruppe: string; zustand: 'an' | 'aus' | 'pausiert'; durch: 'notbetrieb' | 'du' | null; seit: number | null }[];
  geschuetzt: { name: string; grund: string; zustand: 'an' | 'aus' | 'pausiert' }[];
}

export interface ExplorerEintrag {
  name: string;
  typ: 'ordner' | 'datei' | 'link' | 'anders';
  groesse: number | null;
  geaendert: number;
  anderes?: string;
  anderesMount?: string | null;
}
export interface ExplorerOrdner {
  wurzel: string;
  pfad: string;
  eintraege: ExplorerEintrag[];
  anzahl: number;
  gekuerzt: boolean;
}

// ---------- Garmin (Tab «Gesundheit», /api/garmin) ----------
export interface GarminPunkt { t: number; v: number }
export interface GarminNacht {
  tag: string; ende: number; start: number; dauerS: number; tiefS: number; leichtS: number; remS: number; wachS: number;
  score: number | null; hrv: number | null; ruhepuls: number | null; bbPlus: number | null; aufgewacht: number | null; atmung?: number | null; spo2?: number | null;
}
export interface GarminTag {
  tag: string; schritte: number | null; kcalAktiv: number | null; distanzM: number | null; ruhepuls: number | null; intensitaet: number;
  stockwerke: number | null; bbGeladen: number | null; bbVerbraucht: number | null; bbMax: number | null; bbMin: number | null; stressProzent: number | null;
}
export interface GarminAktivitaet {
  zeit: number; name: string; typ: string; dauerS: number | null; distanzM: number | null; pulsSchnitt: number | null; pulsMax?: number | null;
  kcal: number | null; effekt: number | null; last: number | null;
}
export type Garmin =
  | { bereit: false; grund: string }
  | {
      bereit: true;
      zeit: number;
      geraet: string | null;
      letzterSync: number | null;
      grafanaUrl: string;
      bodyBattery: { jetzt: number | null; zeit: number | null; verlauf: GarminPunkt[]; geladen: number | null; verbraucht: number | null };
      puls: { verlauf: GarminPunkt[]; ruhe: number | null; ruhe30: number | null };
      stress: { verlauf: GarminPunkt[]; schnitt: number | null };
      hrv: { letzte: number | null; schnitt7: number | null; stufe: 'tief' | 'normal' | 'hoch' | 'unbekannt'; text: string };
      letzteNacht: GarminNacht | null;
      heute: (GarminTag & { schritteZiel: number }) | null;
      wocheIntensitaet: number;
      vergleich30: Record<'schlaf' | 'schlafScore' | 'hrv' | 'ruhepuls' | 'schritte' | 'stress', { jetzt: number | null; vorher: number | null }>;
      schlaf: GarminNacht[];
      tage: GarminTag[];
      aktivitaeten: GarminAktivitaet[];
      vo2max: number | null;
      fitnessAlter: number | null;
      alter: number | null;
    };

export interface GarminHistTag extends GarminTag { bbWach: number | null; stress: number | null }
export type GarminHistorie =
  | { bereit: false; grund: string }
  | {
      bereit: true;
      zeit: number;
      naechte: GarminNacht[];
      tage: GarminHistTag[];
      aktivitaeten: GarminAktivitaet[];
      vo2: { tag: string; v: number }[];
    };
