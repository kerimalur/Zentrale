// What's Up Docker (WUD): welche Container ein neueres Image haben.
// Nur lesen – mit einem API-Token, das in WUD nur den Bereich «Read» hat (Profil → Generate Token).
// Aktualisiert wird nie automatisch: die Zentrale zeigt nur an, was es gibt, und den passenden Befehl.
import { config } from '../config.mjs';
import { holenJson } from '../util.mjs';

const kurz = (d) => (d && /^sha256:/.test(d) ? d.slice(7, 19) : d || '');

// Art des Updates: major/minor/patch aus WUD, sonst «neues Image» (gleicher Tag, z. B. latest).
function art(k) {
  if (k?.kind === 'digest') return 'image';
  const s = k?.semverDiff;
  if (s === 'major' || s === 'minor' || s === 'patch' || s === 'prerelease') return s;
  return 'unbekannt';
}

export async function wudDaten() {
  if (!config.wud.token) return null;
  const liste = await holenJson(`http://127.0.0.1:${config.wud.port}/api/containers`, {
    timeout: 8000,
    headers: { Authorization: `Bearer ${config.wud.token}`, Accept: 'application/json' },
  });
  if (!Array.isArray(liste)) throw new Error('What\'s Up Docker: unerwartete Antwort');
  const alle = liste.map((c) => {
    const k = c.updateKind || {};
    const digest = k.kind === 'digest';
    return {
      name: c.name || c.displayName || '',
      image: c.image?.name || '',
      tag: c.image?.tag?.value || '',
      update: !!c.updateAvailable,
      art: c.updateAvailable ? art(k) : null,
      von: c.updateAvailable ? (digest ? kurz(k.localValue) : k.localValue || c.image?.tag?.value || '') : null,
      nach: c.updateAvailable ? (digest ? kurz(k.remoteValue) : k.remoteValue || c.result?.tag || '') : null,
      link: c.result?.link || c.changelogUrl || c.link || null,
      fehler: c.error?.message || null,
      pausiert: !!c.isSnoozed,
    };
  });
  return {
    zeit: Date.now(),
    gesamt: alle.length,
    updates: alle.filter((c) => c.update).sort((a, b) => rang(a.art) - rang(b.art) || a.name.localeCompare(b.name)),
    fehler: alle.filter((c) => c.fehler).map((c) => ({ name: c.name, text: c.fehler })),
  };
}

const rang = (a) => ['major', 'minor', 'patch', 'prerelease', 'image', 'unbekannt'].indexOf(a);
