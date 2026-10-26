// Fokus-Erweiterung: zählt die Zeit pro Webseite (nur im vordersten, aktiven Browserfenster) und meldet sie an die Zentrale.
importScripts('config.js');

const LEERLAUF_SEK = 120;
let aktuell = null; // { domain, seit }

function domainVon(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    let h = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    if (/^[\d.]+$/.test(h) || h === 'localhost') return h;
    const teile = h.split('.');
    if (teile.length <= 2) return h;
    const zwei = ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(teile[teile.length - 2]) && teile[teile.length - 1].length === 2;
    return teile.slice(zwei ? -3 : -2).join('.');
  } catch { return null; }
}

async function puffer() { return (await chrome.storage.local.get('puffer')).puffer || {}; }

async function vorne() {
  try {
    if ((await chrome.idle.queryState(LEERLAUF_SEK)) !== 'active') return null;
    const f = await chrome.windows.getLastFocused();
    if (!f || !f.focused) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: f.id });
    return tab && tab.url ? domainVon(tab.url) : null;
  } catch { return null; }
}

// Zeit seit dem letzten Stand verbuchen, dann neuen Stand ermitteln.
async function abrechnen() {
  const jetzt = Date.now();
  if (aktuell) {
    const sek = Math.round((jetzt - aktuell.seit) / 1000);
    if (sek > 0 && sek < 3600) {
      const p = await puffer();
      p[aktuell.domain] = (p[aktuell.domain] || 0) + sek;
      await chrome.storage.local.set({ puffer: p });
    }
  }
  const d = await vorne();
  aktuell = d ? { domain: d, seit: jetzt } : null;
}

async function senden() {
  await abrechnen();
  const p = await puffer();
  const eintraege = Object.entries(p).map(([name, sek]) => ({ art: 'web', name, sek }));
  if (!eintraege.length) return;
  try {
    const r = await fetch(CONFIG.adresse + '/api/fokus/agent/bericht', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CONFIG.token },
      body: JSON.stringify({ version: 'browser-1.0', eintraege }),
    });
    if (r.ok) await chrome.storage.local.set({ puffer: {} });
  } catch {}
}

chrome.idle.setDetectionInterval(LEERLAUF_SEK);
chrome.tabs.onActivated.addListener(abrechnen);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') abrechnen(); });
chrome.windows.onFocusChanged.addListener(abrechnen);
chrome.idle.onStateChanged.addListener(abrechnen);
chrome.alarms.create('senden', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'senden') senden(); });
chrome.runtime.onStartup.addListener(abrechnen);
chrome.runtime.onInstalled.addListener(abrechnen);
