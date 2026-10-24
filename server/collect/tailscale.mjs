// Tailscale: lokale Geräte-Liste (über den Socket) und Cloud-API für Gäste.
import { config } from '../config.mjs';
import { socketAnfrage, holen } from '../util.mjs';

export async function tsStatus() {
  const r = await socketAnfrage(config.tailscale.socket, { path: '/localapi/v0/status', headers: { Host: 'local-tailscaled.sock' } });
  if (r.status !== 200 || !r.json) throw new Error(`Tailscale ${r.status}`);
  const s = r.json;
  const nutzer = s.User || {};
  const self = s.Self || {};
  const ich = self.UserID;
  const peers = Object.values(s.Peer || {}).map((p) => ({
    id: p.ID || p.PublicKey,
    name: (p.HostName || p.DNSName || '?').replace(/\.$/, ''),
    dns: (p.DNSName || '').replace(/\.$/, ''),
    os: p.OS || '',
    ip: (p.TailscaleIPs || [])[0] || '',
    online: !!p.Online,
    aktiv: !!p.Active,
    zuletzt: p.LastSeen && !String(p.LastSeen).startsWith('0001') ? p.LastSeen : null,
    rx: p.RxBytes || 0, // vom Gerät empfangen (= Upload des Geräts)
    tx: p.TxBytes || 0, // an das Gerät gesendet (= Download des Geräts)
    besitzer: nutzer[p.UserID]?.LoginName || '',
    istGast: p.UserID !== ich && !p.ShareeNode,
  }));
  return {
    selbst: { name: self.HostName, ip: (self.TailscaleIPs || [])[0] || '', dns: (self.DNSName || '').replace(/\.$/, '') },
    tailnet: s.CurrentTailnet?.Name || '',
    ichLogin: nutzer[ich]?.LoginName || '',
    peers,
  };
}

// ---------- Cloud-API (braucht TS_API_KEY) ----------
const API = 'https://api.tailscale.com/api/v2';

async function tsApi(method, p, body) {
  if (!config.tailscale.apiKey) throw new Error('TS_API_KEY fehlt');
  const { res } = await holen(API + p, {
    method,
    timeout: 10_000,
    headers: { Authorization: `Bearer ${config.tailscale.apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`Tailscale-API ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  return text ? JSON.parse(text) : {};
}

export async function einladen(email) {
  const r = await tsApi('POST', '/tailnet/-/user-invites', [{ role: 'member', email }]);
  const inv = Array.isArray(r) ? r[0] : r.invites?.[0] || r;
  return { id: inv?.id ? String(inv.id) : null, url: inv?.inviteUrl || null };
}

export const einladungLoeschen = (id) => tsApi('DELETE', `/user-invites/${encodeURIComponent(id)}`);
export const nutzerListe = async () => (await tsApi('GET', '/tailnet/-/users')).users || [];
export const geraeteListe = async () => (await tsApi('GET', '/tailnet/-/devices')).devices || [];
export const geraetLoeschen = (id) => tsApi('DELETE', `/device/${encodeURIComponent(id)}`);

export async function nutzerEntfernen(userId) {
  // Zuerst löschen versuchen, sonst sperren. Beides ist je nach Tarif evtl. nicht erlaubt.
  try { await tsApi('POST', `/users/${encodeURIComponent(userId)}/delete`); return 'geloescht'; } catch {}
  try { await tsApi('POST', `/users/${encodeURIComponent(userId)}/suspend`); return 'gesperrt'; } catch {}
  return null;
}

// Prüft, ob die Zugriffsregeln Gäste wirklich einschränken.
export async function aclPruefen(piIp, ichLogin) {
  const acl = await tsApi('GET', '/tailnet/-/acl');
  const offen = (src) => (src || []).some((s) => s === '*' || s === 'autogroup:member');
  const alles = (dst) => (dst || []).some((d) => d === '*' || d.startsWith('*:'));
  const zuOffen = (acl.acls || []).some((r) => offen(r.src) && alles(r.dst)) || (acl.grants || []).some((g) => offen(g.src) && alles(g.dst));
  const hatGastRegel = JSON.stringify(acl).includes('autogroup:member') && JSON.stringify(acl).includes('8096');
  return { sicher: !zuOffen && hatGastRegel, vorschlag: aclVorschlag(piIp, ichLogin) };
}

// Du (Besitzer/Admin) darfst alles, Gäste nur Jellyfin (8096) und DNS (53) auf dem Pi.
export function aclVorschlag(piIp, ichLogin) {
  const du = ['autogroup:owner', 'autogroup:admin', ...(ichLogin ? [ichLogin] : [])];
  return JSON.stringify(
    {
      hosts: { homelab: piIp ? `${piIp}` : '100.x.y.z' },
      grants: [
        { src: du, dst: ['*'], ip: ['*'] },
        { src: ['autogroup:member'], dst: ['homelab'], ip: ['8096', '53'] },
      ],
    },
    null,
    2,
  );
}
