// Medien: qBittorrent (hinter Gluetun/Proton VPN), VPN-Prüfung, Sonarr/Radarr/Lidarr/Prowlarr, Seerr.
import { config } from '../config.mjs';
import { holen, holenJson } from '../util.mjs';
import { execAusgabe } from './docker.mjs';

const M = () => config.medien;
const basis = (port) => `http://127.0.0.1:${port}`;

// ---------- qBittorrent ----------
let qbCookie = null;
let qbSperreBis = 0; // nach falschem Login 10 Min warten (qBittorrent sperrt sonst die IP)

async function qbLogin() {
  if (Date.now() < qbSperreBis) throw new Error('Login falsch – nächster Versuch in ein paar Minuten');
  const { res } = await holen(basis(M().qbit.port) + '/api/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: M().qbit.user, password: M().qbit.passwort }).toString(),
  });
  const text = (await res.text()).trim();
  // qBittorrent 4/5.0/5.1: "Ok." + Cookie "SID"; ab 5.2: Status 204 ohne Text + Cookie "QBT_SID_<port>".
  const sid = (res.headers.get('set-cookie') || '').match(/((?:QBT_)?SID(?:_\d+)?)=([^;]+)/);
  if (res.status === 403) { qbSperreBis = Date.now() + 10 * 60_000; throw new Error('qBittorrent hat die IP wegen Fehlversuchen gesperrt – qbittorrent-Container neu starten'); }
  const ok = res.ok && (text === 'Ok.' || (text === '' && sid));
  if (!ok) {
    if (text === 'Fails.' || res.status === 401) { qbSperreBis = Date.now() + 10 * 60_000; throw new Error('Benutzer oder Passwort falsch (QBIT_USER/QBIT_PASSWORT)'); }
    throw new Error(`Anmeldung fehlgeschlagen (HTTP ${res.status}${text ? ': ' + text.slice(0, 80) : ''})`);
  }
  qbCookie = sid ? `${sid[1]}=${sid[2]}` : '';
}

async function qbApi(pfad, { method = 'GET', body, alsText = false } = {}, nochmal = true) {
  if (qbCookie === null && M().qbit.passwort) await qbLogin();
  const { res } = await holen(basis(M().qbit.port) + '/api/v2' + pfad, {
    method,
    headers: { ...(qbCookie ? { Cookie: qbCookie } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body,
  });
  if ((res.status === 401 || res.status === 403) && nochmal && M().qbit.passwort) {
    qbCookie = null;
    return qbApi(pfad, { method, body, alsText }, false);
  }
  if (!res.ok) { const e = new Error(`qBittorrent ${res.status}`); e.status = res.status; throw e; }
  const t = await res.text();
  return alsText ? t.trim() : t ? JSON.parse(t) : null;
}

const LADEN = ['downloading', 'stalledDL', 'metaDL', 'forcedDL', 'queuedDL', 'checkingDL', 'allocating', 'forcedMetaDL'];
const PAUSE = ['pausedDL', 'stoppedDL'];
const FEHLER = ['error', 'missingFiles'];

export async function qbDaten() {
  const [info, modus, torrents] = await Promise.all([
    qbApi('/transfer/info'),
    qbApi('/transfer/speedLimitsMode', { alsText: true }),
    qbApi('/torrents/info?sort=added_on&reverse=true'),
  ]);
  const liste = torrents || [];
  const offen = liste.filter((t) => t.progress < 1 || FEHLER.includes(t.state));
  const fertig = liste.filter((t) => t.progress >= 1 && !FEHLER.includes(t.state)).slice(0, 3);
  return {
    down: info.dl_info_speed || 0,
    up: info.up_info_speed || 0,
    verbindung: info.connection_status || 'unknown', // connected | firewalled | disconnected
    gedrosselt: modus === '1',
    anzahl: {
      laden: liste.filter((t) => LADEN.includes(t.state)).length,
      pausiert: liste.filter((t) => PAUSE.includes(t.state)).length,
      fehler: liste.filter((t) => FEHLER.includes(t.state)).length,
      fertig: liste.filter((t) => t.progress >= 1).length,
    },
    torrents: [...offen.slice(0, 12), ...fertig].map((t) => ({
      hash: t.hash,
      name: t.name,
      fortschritt: t.progress,
      down: t.dlspeed,
      up: t.upspeed,
      eta: t.eta >= 8640000 ? null : t.eta,
      zustand: t.state,
      groesse: t.size,
      kategorie: t.category || '',
      hinzugefuegt: t.added_on * 1000,
    })),
  };
}

export async function qbDrosseln(an) {
  if (!M().qbit.passwort) return;
  const modus = await qbApi('/transfer/speedLimitsMode', { alsText: true });
  if ((modus === '1') !== an) await qbApi('/transfer/toggleSpeedLimitsMode', { method: 'POST', body: '' });
}

export async function qbAllesStoppen() {
  try {
    await qbApi('/torrents/stop', { method: 'POST', body: 'hashes=all' }); // qBittorrent 5
  } catch (e) {
    if (e.status !== 404) throw e;
    await qbApi('/torrents/pause', { method: 'POST', body: 'hashes=all' }); // qBittorrent 4
  }
}

// ---------- VPN-Prüfung ----------
let hostIp = { ip: null, zeit: 0 };
const laender = new Intl.DisplayNames(['de-CH'], { type: 'region' });

async function ipVomPi() {
  if (hostIp.ip && Date.now() - hostIp.zeit < 30 * 60_000) return hostIp.ip;
  const j = await holenJson('https://ipinfo.io/json', { timeout: 8000 });
  hostIp = { ip: j.ip, zeit: Date.now() };
  return j.ip;
}

// Fragt aus dem Download-Container heraus nach der öffentlichen IP: genau so sieht das Internet qBittorrent.
export async function vpnPruefen() {
  const r = await execAusgabe(M().downloadContainer, ['sh', '-c', 'curl -fsS -m 8 https://ipinfo.io/json 2>/dev/null || wget -qO- -T 8 https://ipinfo.io/json'], { timeout: 20_000 });
  let vpn = null;
  try { vpn = JSON.parse(r.ausgabe); } catch {}
  let pi = null;
  try { pi = await ipVomPi(); } catch {}
  if (!vpn?.ip) return { ok: false, geschuetzt: null, fehler: 'Download-Container hat keine Internetverbindung (VPN getrennt?)', pi, zeit: Date.now() };
  let land = vpn.country || '';
  try { land = laender.of(vpn.country) || land; } catch {}
  return {
    ok: true,
    geschuetzt: pi ? vpn.ip !== pi : null,
    ip: vpn.ip,
    land,
    stadt: vpn.city || '',
    anbieter: (vpn.org || '').replace(/^AS\d+\s*/, ''),
    pi,
    zeit: Date.now(),
  };
}

// ---------- Arr-Apps ----------
async function arrApi(app, pfad) {
  return holenJson(`${basis(app.port)}/api/${app.api}${pfad}`, { headers: { 'X-Api-Key': app.key }, timeout: 15_000 });
}

const isoTag = (d) => d.toISOString().slice(0, 10);

export async function arrDaten(app) {
  if (!app.key) return null;
  const jetzt = new Date();
  const bis = new Date(Date.now() + 14 * 86400_000);
  const [health, status] = await Promise.all([arrApi(app, '/health'), arrApi(app, '/system/status')]);
  const out = {
    id: app.id,
    version: status.version || '',
    warnungen: (health || []).map((h) => ({ typ: h.type, text: h.message })),
    warteschlange: 0,
    anzahl: null,
    anzahlLabel: '',
    // Vergleich gewünscht ↔ wirklich auf der Platte
    vorhanden: null,
    gesamt: null,
    detail: '',
    fehlt: [],
    demnaechst: [],
    neu: [],
  };

  if (app.id === 'prowlarr') {
    const idx = await arrApi(app, '/indexer');
    out.anzahl = idx.filter((i) => i.enable).length;
    out.anzahlLabel = 'Indexer aktiv';
    return out;
  }

  const q = await arrApi(app, '/queue?page=1&pageSize=1').catch(() => null);
  out.warteschlange = q?.totalRecords ?? 0;

  if (app.id === 'sonarr') {
    const [serien, kal, hist] = await Promise.all([
      arrApi(app, '/series'),
      arrApi(app, `/calendar?start=${isoTag(jetzt)}&end=${isoTag(bis)}&includeSeries=true`),
      arrApi(app, '/history?page=1&pageSize=6&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true').catch(() => null),
    ]);
    out.anzahl = serien.length;
    out.anzahlLabel = 'Serien';
    if (serien.length) {
      // episodeCount = gewünschte (überwachte, erschienene) Folgen, episodeFileCount = vorhandene Dateien
      const st = (s) => s.statistics || {};
      const komplett = serien.filter((s) => (st(s).episodeCount || 0) > 0 && (st(s).episodeFileCount || 0) >= st(s).episodeCount);
      const folgen = serien.reduce((a, s) => a + (st(s).episodeFileCount || 0), 0);
      const gewuenscht = serien.reduce((a, s) => a + (st(s).episodeCount || 0), 0);
      out.vorhanden = komplett.length;
      out.gesamt = serien.length;
      out.anzahlLabel = 'Serien komplett';
      out.detail = `Folgen ${folgen} / ${gewuenscht}`;
      out.fehlt = serien
        .filter((s) => !komplett.includes(s))
        .map((s) => `${s.title} (${st(s).episodeFileCount || 0}/${st(s).episodeCount || 0})`);
    }
    out.demnaechst = kal.slice(0, 8).map((e) => ({ titel: `${e.series?.title || ''} · S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`, wann: e.airDateUtc, art: 'serie', hatDatei: !!e.hasFile }));
    out.neu = (hist?.records || []).map((h) => ({ id: `s${h.id}`, titel: `${h.series?.title || h.sourceTitle} · S${String(h.episode?.seasonNumber ?? 0).padStart(2, '0')}E${String(h.episode?.episodeNumber ?? 0).padStart(2, '0')}`, wann: h.date, art: 'serie' }));
  }
  if (app.id === 'radarr') {
    const [filme, kal, hist] = await Promise.all([
      arrApi(app, '/movie'),
      arrApi(app, `/calendar?start=${isoTag(jetzt)}&end=${isoTag(bis)}`),
      arrApi(app, '/history?page=1&pageSize=6&sortKey=date&sortDirection=descending&eventType=3&includeMovie=true').catch(() => null),
    ]);
    out.anzahl = filme.length;
    out.anzahlLabel = 'Filme';
    if (filme.length) {
      const da = filme.filter((f) => f.hasFile);
      out.vorhanden = da.length;
      out.gesamt = filme.length;
      out.anzahlLabel = 'Filme vorhanden';
      out.fehlt = filme
        .filter((f) => !f.hasFile)
        .map((f) => `${f.title}${f.isAvailable === false ? ' (noch nicht erschienen)' : !f.monitored ? ' (nicht überwacht)' : ''}`);
    }
    out.demnaechst = kal.slice(0, 8).map((f) => {
      const daten = [f.digitalRelease, f.physicalRelease, f.inCinemas].filter(Boolean).map((d) => new Date(d)).filter((d) => d >= jetzt).sort((a, b) => a - b);
      return { titel: f.title, wann: (daten[0] || new Date(f.digitalRelease || f.inCinemas || Date.now())).toISOString(), art: 'film', hatDatei: !!f.hasFile };
    });
    out.neu = (hist?.records || []).map((h) => ({ id: `r${h.id}`, titel: h.movie?.title || h.sourceTitle, wann: h.date, art: 'film' }));
  }
  if (app.id === 'lidarr') {
    const [kuenstler, kal] = await Promise.all([arrApi(app, '/artist'), arrApi(app, `/calendar?start=${isoTag(jetzt)}&end=${isoTag(bis)}&includeArtist=true`)]);
    out.anzahl = kuenstler.length;
    out.anzahlLabel = 'Künstler';
    if (kuenstler.length) {
      // trackCount = gewünschte (überwachte) Tracks, trackFileCount = vorhandene Dateien
      const st = (a) => a.statistics || {};
      const mitMusik = kuenstler.filter((a) => (st(a).trackFileCount || 0) > 0);
      const tracks = kuenstler.reduce((s, a) => s + (st(a).trackFileCount || 0), 0);
      const gewuenscht = kuenstler.reduce((s, a) => s + (st(a).trackCount || 0), 0);
      out.vorhanden = mitMusik.length;
      out.gesamt = kuenstler.length;
      out.anzahlLabel = 'Künstler mit Musik';
      out.detail = `Tracks ${tracks} / ${gewuenscht}`;
      out.fehlt = kuenstler.filter((a) => !mitMusik.includes(a)).map((a) => a.artistName);
    }
    out.demnaechst = kal.slice(0, 6).map((a) => ({ titel: `${a.artist?.artistName || ''} · ${a.title}`, wann: a.releaseDate, art: 'musik', hatDatei: false }));
  }
  return out;
}

// ---------- Seerr ----------
export async function seerrDaten() {
  const s = M().seerr;
  if (!s.key) return null;
  const c = await holenJson(`${basis(s.port)}/api/v1/request/count`, { headers: { 'X-Api-Key': s.key } });
  return { offen: c.pending ?? 0, inArbeit: c.processing ?? 0, verfuegbar: c.available ?? 0, gesamt: c.total ?? 0 };
}
