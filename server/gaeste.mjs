// Gäste: Einladung ins Tailscale-Netz (nur Jellyfin + Pi-hole erlaubt), optional Jellyfin-Konto, Ablaufdatum.
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { tsStatus, einladen, einladungLoeschen, nutzerListe, geraeteListe, geraetLoeschen, nutzerEntfernen, aclPruefen } from './collect/tailscale.mjs';
import { jellyfinNutzerAnlegen, jellyfinNutzerLoeschen } from './collect/services.mjs';
import { ereignis } from './ereignisse.mjs';

let aclCache = { zeit: 0, sicher: false, vorschlag: '', fehler: null };

export async function gaesteStatus(force = false) {
  if (!config.tailscale.apiKey) return { bereit: false, grund: 'TS_API_KEY fehlt in .env', aclSicher: false, aclVorschlag: '' };
  if (force || Date.now() - aclCache.zeit > 10 * 60_000) {
    try {
      const ts = await tsStatus();
      const r = await aclPruefen(ts.selbst.ip, ts.ichLogin);
      aclCache = { zeit: Date.now(), sicher: r.sicher, vorschlag: r.vorschlag, fehler: null };
    } catch (e) {
      aclCache = { ...aclCache, zeit: Date.now(), fehler: e.message };
    }
  }
  if (aclCache.fehler) return { bereit: false, grund: aclCache.fehler, aclSicher: false, aclVorschlag: aclCache.vorschlag };
  return { bereit: aclCache.sicher, grund: aclCache.sicher ? null : 'Zugriffsregeln noch nicht eingerichtet', aclSicher: aclCache.sicher, aclVorschlag: aclCache.vorschlag };
}

const passwort = () => crypto.randomBytes(9).toString('base64url');

export async function gastAnlegen({ name, email, jellyfin, dauerTage }) {
  name = String(name || '').trim().slice(0, 40);
  email = String(email || '').trim().toLowerCase();
  if (!name) throw new Error('Name fehlt');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Ungültige E-Mail');
  const tage = [1, 7, 30].includes(Number(dauerTage)) ? Number(dauerTage) : null;
  if (db().gaeste.some((g) => g.email === email)) throw new Error('Diese E-Mail ist schon eingeladen');

  const st = await gaesteStatus(true);
  if (!st.bereit) throw new Error(st.grund || 'Gäste nicht bereit');

  const inv = await einladen(email);
  let jf = null;
  if (jellyfin) {
    const jfName = name.replace(/[^\p{L}\p{N}_-]+/gu, '') + '-gast';
    const pw = passwort();
    try {
      const id = await jellyfinNutzerAnlegen(jfName, pw);
      jf = { id, name: jfName, passwort: pw };
    } catch (e) {
      if (inv.id) await einladungLoeschen(inv.id).catch(() => {});
      throw new Error('Jellyfin-Konto konnte nicht erstellt werden: ' + e.message);
    }
  }
  const gast = {
    id: crypto.randomBytes(6).toString('hex'),
    name,
    email,
    jellyfin: !!jf,
    jf,
    erstellt: Date.now(),
    bis: tage ? Date.now() + tage * 86400_000 : null,
    inviteId: inv.id,
    inviteUrl: inv.url,
    tsUserId: null,
    status: 'eingeladen',
    geraete: 0,
  };
  db().gaeste.push(gast);
  save();
  ereignis('gast', `Gast „${name}" eingeladen${tage ? ` (${tage} ${tage === 1 ? 'Tag' : 'Tage'})` : ''}`);
  return gast;
}

export async function gastEntfernen(id, grund = 'entfernt') {
  const liste = db().gaeste;
  const g = liste.find((x) => x.id === id);
  if (!g) throw new Error('Gast nicht gefunden');
  const probleme = [];
  if (g.tsUserId) {
    try {
      const geraete = await geraeteListe();
      for (const d of geraete.filter((d) => (d.user || '').toLowerCase() === g.email)) await geraetLoeschen(d.id);
    } catch (e) { probleme.push('Geräte: ' + e.message); }
    const r = await nutzerEntfernen(g.tsUserId);
    if (!r) probleme.push('Nutzer bitte im Tailscale-Admin entfernen (login.tailscale.com/admin/users)');
  } else if (g.inviteId) {
    await einladungLoeschen(g.inviteId).catch((e) => { if (e.status !== 404) probleme.push('Einladung: ' + e.message); });
  }
  if (g.jf?.id) await jellyfinNutzerLoeschen(g.jf.id).catch((e) => probleme.push('Jellyfin: ' + e.message));
  db().gaeste = liste.filter((x) => x.id !== id);
  save();
  ereignis(probleme.length ? 'warnung' : 'gast', `Gast „${g.name}" ${grund}${probleme.length ? ' · ' + probleme.join(' · ') : ''}`, { telegram: probleme.length > 0, schluessel: 'gast-' + id });
  return { ok: probleme.length === 0, probleme };
}

// Alle 5 Min: Einladungen angenommen? Geräte zählen. Abgelaufene entfernen.
export async function gaesteAbgleichen() {
  if (!config.tailscale.apiKey || !db().gaeste.length) return;
  const [nutzer, geraete] = await Promise.all([nutzerListe(), geraeteListe()]);
  for (const g of db().gaeste) {
    const u = nutzer.find((x) => (x.loginName || '').toLowerCase() === g.email);
    if (u) {
      if (g.status === 'eingeladen') ereignis('gast', `Gast „${g.name}" ist beigetreten`);
      g.tsUserId = u.id;
      g.status = 'aktiv';
    }
    g.geraete = geraete.filter((d) => (d.user || '').toLowerCase() === g.email).length;
  }
  save();
  for (const g of [...db().gaeste]) {
    if (g.bis && g.bis < Date.now()) await gastEntfernen(g.id, 'abgelaufen und entfernt').catch((e) => console.error('[gäste]', e.message));
  }
}
