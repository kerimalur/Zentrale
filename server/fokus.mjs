// Fokus: Zeit-Tracking aller Geräte (Handy, PC, Laptop) und Sperren, gesteuert über die Zentrale.
// Geräte melden sich mit einem eigenen Token (Agent). Webseiten-Sperren setzt Pi-hole für alle Geräte um.
import crypto from 'node:crypto';
import { db, save } from './store.mjs';
import { clientIp } from './auth.mjs';
import { tagKey, uhrzeit, minutenJetzt, zuMinuten } from './util.mjs';
import { piholeAnfrage } from './collect/services.mjs';
import { ereignis } from './ereignisse.mjs';

const ARTEN = new Set(['app', 'prog', 'web']);
const GERAETE_ARTEN = new Set(['android', 'windows', 'linux', 'browser']);
const BEREICHE = {
  insta_reels: 'Instagram Reels',
  insta_explore: 'Instagram Explore',
  yt_shorts: 'YouTube Shorts',
  snap_stories: 'Snapchat Stories',
  snap_spotlight: 'Snapchat Spotlight',
};
// Wie die Handy-App einen Bereich erkennt (View-IDs der fremden App). Liegt hier, damit sich IDs ohne neue APK korrigieren lassen.
// selected: Knoten muss als ausgewählt markiert sein. aktion: klick (auf View-ID) oder zurueck.
const BEREICH_REGELN = {
  insta_reels: { paket: 'com.instagram.android', ids: ['clips_tab'], selected: true, aktion: { typ: 'klick', id: 'feed_tab' } },
  insta_explore: { paket: 'com.instagram.android', ids: ['search_tab'], selected: true, aktion: { typ: 'klick', id: 'feed_tab' } },
  yt_shorts: { paket: 'com.google.android.youtube', ids: ['reel_recycler', 'reel_player_page_container'], selected: false, aktion: { typ: 'zurueck' } },
  snap_stories: { paket: 'com.snapchat.android', ids: ['df_large_story'], selected: false, aktion: { typ: 'klick', id: 'ngs_chat_icon_container' } },
  snap_spotlight: { paket: 'com.snapchat.android', ids: ['spotlight_feed', 'ngs_spotlight_icon_container'], selected: false, aktion: { typ: 'klick', id: 'ngs_chat_icon_container' } },
};
const AUFBEWAHRUNG_TAGE = 400;
const ONLINE_MS = 3 * 60_000;

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const jetzt = () => Date.now();

export function fokusDb() {
  const d = db();
  if (!d.fokus) d.fokus = { geraete: {}, tage: {}, stunden: {}, kategorien: {}, sperren: [], code: null, pihole: { gruppe: null, hash: '', zeit: 0, fehler: null } };
  const f = d.fokus;
  f.geraete ||= {}; f.tage ||= {}; f.stunden ||= {}; f.kategorien ||= {}; f.sperren ||= [];
  f.pihole ||= { gruppe: null, hash: '', zeit: 0, fehler: null };
  return f;
}

// ---------- Einordnung ----------
const ABLENKUNG = /instagram|youtube|tiktok|snapchat|reddit|netflix|facebook|twitter|^x$|x\.com|twitch|pinterest|temu|9gag|disney|prime ?video|steam|9anime|bilibili|kick\.com|threads/i;
const PRODUKTIV = /code|cursor|terminal|konsole|powershell|cmd|obsidian|notion|github|gitlab|docs|sheets|tradingview|supabase|vercel|anki|figma|word|excel|powerpoint|intellij|pycharm|android studio|claude|chatgpt|kerimos|zentrale|nextcloud|stackoverflow|localhost|tauri|pine|metatrader|mt5|vantage/i;

export function kategorieVon(key, name) {
  const f = fokusDb();
  if (f.kategorien[key]) return f.kategorien[key];
  const text = `${name} ${key}`;
  if (ABLENKUNG.test(text)) return 'ablenkung';
  if (PRODUKTIV.test(text)) return 'produktiv';
  return 'neutral';
}

// ---------- Geräte koppeln ----------
const fehlversuche = [];

export function koppelcodeErzeugen() {
  const f = fokusDb();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  f.code = { hash: sha(code), bis: jetzt() + 10 * 60_000 };
  save();
  return { code, bis: f.code.bis };
}

export function koppeln({ code, name, art }) {
  const f = fokusDb();
  const nun = jetzt();
  while (fehlversuche.length && fehlversuche[0] < nun - 10 * 60_000) fehlversuche.shift();
  if (fehlversuche.length >= 10) return { fehler: 'Zu viele Versuche. Bitte in 10 Minuten nochmals.', status: 429 };
  if (!f.code || f.code.bis < nun || f.code.hash !== sha(String(code || '').trim())) {
    fehlversuche.push(nun);
    return { fehler: 'Code falsch oder abgelaufen.', status: 403 };
  }
  if (!GERAETE_ARTEN.has(art)) return { fehler: 'Unbekannte Geräteart.', status: 400 };
  f.code = null; // einmalig
  const id = crypto.randomBytes(5).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  f.geraete[id] = { id, name: String(name || art).slice(0, 40), art, tokenHash: sha(token), erstellt: nun, zuletzt: null, ips: [], jetzt: null, websperre: art !== 'browser', version: null };
  save();
  ereignis('info', `Fokus: Gerät «${f.geraete[id].name}» gekoppelt (${art}).`);
  return { id, token };
}

export function geraetVonToken(req) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  const h = sha(m[1]);
  return Object.values(fokusDb().geraete).find((g) => g.tokenHash === h) || null;
}

export function geraetEntfernen(id) {
  const f = fokusDb();
  if (!f.geraete[id]) return false;
  const name = f.geraete[id].name;
  delete f.geraete[id];
  save();
  ereignis('info', `Fokus: Gerät «${name}» entfernt.`);
  return true;
}

export function geraetSetzen(id, { name, websperre }) {
  const g = fokusDb().geraete[id];
  if (!g) return null;
  if (typeof name === 'string' && name.trim()) g.name = name.trim().slice(0, 40);
  if (typeof websperre === 'boolean') g.websperre = websperre;
  save();
  return true;
}

// ---------- Berichte der Geräte ----------
const gueltigeIp = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every((x) => Number(x) <= 255);

export function bericht(g, b, req) {
  const f = fokusDb();
  const tag = tagKey();
  const t = (f.tage[tag] ||= {});
  const dg = (t[g.id] ||= {});
  const st = (f.stunden[tag] ||= {});
  const h = (st[g.id] ||= Array(24).fill(0));
  const stunde = Number(uhrzeit().slice(0, 2)) || 0;
  let summe = 0;
  for (const e of Array.isArray(b?.eintraege) ? b.eintraege.slice(0, 300) : []) {
    const art = ARTEN.has(e?.art) ? e.art : null;
    const name = typeof e?.name === 'string' ? e.name.trim().slice(0, 80) : '';
    const sek = Math.max(0, Math.min(3600, Math.round(Number(e?.sek) || 0)));
    if (!art || !name || !sek) continue;
    const key = `${art}:${name.toLowerCase()}`;
    const alt = dg[key] || { n: name, a: art, s: 0 };
    alt.s += sek;
    dg[key] = alt;
    summe += sek;
  }
  if (summe) h[stunde] += summe;
  g.zuletzt = jetzt();
  g.version = typeof b?.version === 'string' ? b.version.slice(0, 20) : g.version;
  g.jetzt = b?.jetzt && typeof b.jetzt.name === 'string' ? { art: ARTEN.has(b.jetzt.art) ? b.jetzt.art : 'prog', name: b.jetzt.name.slice(0, 80), seit: jetzt() } : null;
  const ips = new Set((g.ips || []).filter(gueltigeIp));
  const ci = clientIp(req);
  if (gueltigeIp(ci)) ips.add(ci);
  for (const ip of Array.isArray(b?.ips) ? b.ips.slice(0, 6) : []) if (gueltigeIp(String(ip))) ips.add(String(ip));
  g.ips = [...ips].slice(-6);
  save();
  return { ok: true, sperren: sperrenFuerGeraet(g), bereiche: BEREICHE, bereichRegeln: BEREICH_REGELN, intervall: 30 };
}

// ---------- Sperren ----------
function imFenster(s, nun = jetzt()) {
  if (s.modus !== 'zeit') return true;
  const von = zuMinuten(s.von || '00:00');
  const bis = zuMinuten(s.bis || '23:59');
  const m = minutenJetzt(nun);
  return von <= bis ? m >= von && m < bis : m >= von || m < bis;
}

function nutzungHeute(wert) {
  const f = fokusDb();
  const w = String(wert).toLowerCase();
  let sek = 0;
  for (const dg of Object.values(f.tage[tagKey()] || {})) for (const e of Object.values(dg)) if (e.n.toLowerCase().includes(w)) sek += e.s;
  return sek;
}

export function sperreAktiv(s, nun = jetzt()) {
  if (!s.an) return false;
  if (s.modus === 'zeit') return imFenster(s, nun);
  if (s.modus === 'limit') return nutzungHeute(s.wert) >= (Number(s.limitMin) || 0) * 60;
  return true;
}

function sperrenFuerGeraet(g) {
  return fokusDb().sperren
    .filter((s) => s.typ !== 'domain' && sperreAktiv(s) && (s.geraete === 'alle' || (Array.isArray(s.geraete) && s.geraete.includes(g.id))))
    .map((s) => ({ id: s.id, typ: s.typ, wert: s.wert }))
    .concat(g.websperre ? fokusDb().sperren.filter((s) => s.typ === 'domain' && sperreAktiv(s)).map((s) => ({ id: s.id, typ: 'domain', wert: s.wert })) : []);
}

const sauber = (w) => String(w || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export function sperreSetzen(b) {
  const f = fokusDb();
  const typ = ['domain', 'app', 'bereich'].includes(b.typ) ? b.typ : null;
  if (!typ) return { fehler: 'Unbekannter Typ.' };
  let wert = String(b.wert || '').trim();
  if (typ === 'domain') {
    wert = sauber(wert);
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(wert)) return { fehler: 'Ungültige Adresse (z. B. reddit.com).' };
  } else if (typ === 'bereich') {
    if (!BEREICHE[wert]) return { fehler: 'Unbekannter Bereich.' };
  } else if (!wert || wert.length > 80) return { fehler: 'Name fehlt.' };
  const modus = ['immer', 'zeit', 'limit'].includes(b.modus) ? b.modus : 'immer';
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const s = {
    id: b.id && f.sperren.find((x) => x.id === b.id) ? b.id : crypto.randomBytes(4).toString('hex'),
    typ, wert, modus,
    von: hhmm.test(b.von) ? b.von : '08:00',
    bis: hhmm.test(b.bis) ? b.bis : '18:00',
    limitMin: Math.max(1, Math.min(1440, Number(b.limitMin) || 30)),
    geraete: b.geraete === 'alle' || !Array.isArray(b.geraete) ? 'alle' : b.geraete.filter((id) => f.geraete[id]),
    an: b.an !== false,
    erstellt: jetzt(),
  };
  const i = f.sperren.findIndex((x) => x.id === s.id);
  if (i >= 0) { s.erstellt = f.sperren[i].erstellt; f.sperren[i] = s; } else f.sperren.push(s);
  save();
  piholeSync().catch(() => {});
  return { ok: true, sperre: s };
}

export function sperreLoeschen(id) {
  const f = fokusDb();
  const n = f.sperren.length;
  f.sperren = f.sperren.filter((s) => s.id !== id);
  save();
  piholeSync().catch(() => {});
  return f.sperren.length < n;
}

export function kategorieSetzen(key, kategorie) {
  const f = fokusDb();
  if (!/^(app|prog|web):/.test(String(key))) return false;
  if (kategorie === 'auto') delete f.kategorien[key];
  else if (['produktiv', 'neutral', 'ablenkung'].includes(kategorie)) f.kategorien[key] = kategorie;
  else return false;
  save();
  return true;
}

// ---------- Pi-hole: Webseiten für alle Geräte sperren ----------
const KOMMENTAR = 'zentrale-fokus';
const GRUPPE = 'Zentrale-Fokus';
const regexVon = (d) => `(\\.|^)${d.replace(/\./g, '\\.')}$`;
let syncLaeuft = false;

export async function piholeSync(erzwingen = false) {
  const f = fokusDb();
  if (syncLaeuft) return;
  syncLaeuft = true;
  try {
    const gewollteDomains = [...new Set(f.sperren.filter((s) => s.typ === 'domain' && sperreAktiv(s)).map((s) => regexVon(s.wert)))].sort();
    const gewollteClients = [...new Set(Object.values(f.geraete).filter((g) => g.websperre).flatMap((g) => g.ips || []))].sort();
    const hash = sha(JSON.stringify([gewollteDomains, gewollteClients]));
    if (!erzwingen && hash === f.pihole.hash && jetzt() - f.pihole.zeit < 10 * 60_000) return;

    // Gruppe sicherstellen
    let gr = await piholeAnfrage('GET', '/groups');
    if (gr.status !== 200) throw new Error(`Pi-hole Gruppen: HTTP ${gr.status}`);
    let gruppe = (gr.json?.groups || []).find((g) => g.name === GRUPPE);
    if (!gruppe) {
      const neu = await piholeAnfrage('POST', '/groups', { name: GRUPPE, comment: KOMMENTAR, enabled: true });
      if (neu.status >= 300) throw new Error(`Pi-hole Gruppe anlegen: HTTP ${neu.status}`);
      gr = await piholeAnfrage('GET', '/groups');
      gruppe = (gr.json?.groups || []).find((g) => g.name === GRUPPE);
    }
    if (!gruppe) throw new Error('Pi-hole-Gruppe nicht gefunden');
    f.pihole.gruppe = gruppe.id;

    // Domains abgleichen (nur eigene, am Kommentar erkennbar)
    const dom = await piholeAnfrage('GET', '/domains');
    const vorhanden = (dom.json?.domains || []).filter((d) => d.type === 'deny' && d.kind === 'regex' && String(d.comment || '').startsWith(KOMMENTAR));
    const vorhandenSet = new Set(vorhanden.map((d) => d.domain));
    for (const d of gewollteDomains) {
      if (!vorhandenSet.has(d)) {
        const r = await piholeAnfrage('POST', '/domains/deny/regex', { domain: d, comment: KOMMENTAR, groups: [gruppe.id], enabled: true });
        if (r.status >= 300 && r.status !== 400) throw new Error(`Pi-hole Domain: HTTP ${r.status}`);
      }
    }
    for (const d of vorhanden) if (!gewollteDomains.includes(d.domain)) await piholeAnfrage('DELETE', `/domains/deny/regex/${encodeURIComponent(d.domain)}`);

    // Clients abgleichen
    const cl = await piholeAnfrage('GET', '/clients');
    const eigene = (cl.json?.clients || []).filter((c) => String(c.comment || '').startsWith(KOMMENTAR));
    const eigeneSet = new Set(eigene.map((c) => c.client));
    for (const ip of gewollteClients) {
      if (!eigeneSet.has(ip)) {
        const r = await piholeAnfrage('POST', '/clients', { client: ip, comment: KOMMENTAR, groups: [0, gruppe.id] });
        if (r.status >= 300 && r.status !== 400) throw new Error(`Pi-hole Client: HTTP ${r.status}`);
      }
    }
    for (const c of eigene) if (!gewollteClients.includes(c.client)) await piholeAnfrage('DELETE', `/clients/${encodeURIComponent(c.client)}`);

    f.pihole.hash = hash;
    f.pihole.zeit = jetzt();
    f.pihole.fehler = null;
    f.pihole.domains = gewollteDomains.length;
    f.pihole.clients = gewollteClients.length;
    save();
  } catch (e) {
    f.pihole.fehler = e.message;
    f.pihole.zeit = jetzt();
    save();
  } finally {
    syncLaeuft = false;
  }
}

// ---------- Auswertung für die Oberfläche ----------
function summen(dg) {
  const r = { produktiv: 0, neutral: 0, ablenkung: 0 };
  for (const [key, e] of Object.entries(dg || {})) r[kategorieVon(key, e.n)] += e.s;
  return r;
}

export function fokusZustand(tagParam) {
  const f = fokusDb();
  const heute = tagKey();
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(tagParam || '') ? tagParam : heute;
  const nun = jetzt();
  const geraete = Object.values(f.geraete).map((g) => ({
    id: g.id, name: g.name, art: g.art, zuletzt: g.zuletzt, online: !!g.zuletzt && nun - g.zuletzt < ONLINE_MS,
    ips: g.ips || [], jetzt: g.jetzt, websperre: g.websperre, version: g.version, erstellt: g.erstellt,
  }));

  const tagDaten = f.tage[tag] || {};
  const proGeraet = {};
  const eintraege = new Map();
  const stunden = Array(24).fill(0);
  for (const g of geraete) {
    const dg = tagDaten[g.id] || {};
    const s = summen(dg);
    proGeraet[g.id] = { ...s, gesamt: s.produktiv + s.neutral + s.ablenkung };
    for (const [key, e] of Object.entries(dg)) {
      const x = eintraege.get(key) || { key, name: e.n, art: e.a, sek: 0, geraete: {}, kategorie: kategorieVon(key, e.n), manuell: !!f.kategorien[key] };
      x.sek += e.s;
      x.geraete[g.id] = (x.geraete[g.id] || 0) + e.s;
      eintraege.set(key, x);
    }
    (f.stunden[tag]?.[g.id] || []).forEach((v, i) => { stunden[i] += v; });
  }
  const liste = [...eintraege.values()].sort((a, b) => b.sek - a.sek).slice(0, 60);
  const gesamt = { produktiv: 0, neutral: 0, ablenkung: 0 };
  for (const v of Object.values(proGeraet)) { gesamt.produktiv += v.produktiv; gesamt.neutral += v.neutral; gesamt.ablenkung += v.ablenkung; }

  const verlauf = [];
  for (let i = 13; i >= 0; i--) {
    const t = tagKey(nun - i * 86_400_000);
    const s = { produktiv: 0, neutral: 0, ablenkung: 0 };
    for (const dg of Object.values(f.tage[t] || {})) { const x = summen(dg); s.produktiv += x.produktiv; s.neutral += x.neutral; s.ablenkung += x.ablenkung; }
    verlauf.push({ tag: t, ...s });
  }

  return {
    zeit: nun, tag, heute,
    geraete, proGeraet, gesamt, eintraege: liste, stunden, verlauf,
    sperren: f.sperren.map((s) => ({ ...s, aktiv: sperreAktiv(s), nutzungMin: s.modus === 'limit' ? Math.round(nutzungHeute(s.wert) / 60) : null })),
    bereiche: BEREICHE,
    pihole: { gruppe: f.pihole.gruppe, fehler: f.pihole.fehler, zeit: f.pihole.zeit, domains: f.pihole.domains || 0, clients: f.pihole.clients || 0 },
    code: f.code && f.code.bis > nun ? { bis: f.code.bis } : null,
  };
}

// Hintergrund: Zeitfenster/Limits ändern sich mit der Uhr, darum regelmässig abgleichen; alte Tage aufräumen.
export async function fokusLauf() {
  const f = fokusDb();
  if (f.sperren.length || f.pihole.hash) await piholeSync();
  const grenze = tagKey(jetzt() - AUFBEWAHRUNG_TAGE * 86_400_000);
  let geaendert = false;
  for (const tag of Object.keys(f.tage)) if (tag < grenze) { delete f.tage[tag]; delete f.stunden[tag]; geaendert = true; }
  if (geaendert) save();
}
