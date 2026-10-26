// Ereignisse & Fehler + Push-Benachrichtigung (ntfy und/oder Telegram).
import { config } from './config.mjs';
import { db, save } from './store.mjs';
import { holen } from './util.mjs';

// art: ok | info | warnung | fehler | film | gast | nacht
export function ereignis(art, text, { telegram = false, schluessel = null } = {}) {
  const e = { t: Date.now(), art, text };
  const liste = db().ereignisse;
  liste.unshift(e);
  if (liste.length > 200) liste.length = 200;
  save();
  if (telegram) melden(text, schluessel || text, art);
  return e;
}

const zuletztGemeldet = new Map();

const telegramOk = () => !!(config.telegram.token && config.telegram.chatId);
const ntfyOk = () => !!(config.ntfy.url && config.ntfy.token);

// «Bereit» = mindestens ein Kanal (ntfy oder Telegram) ist eingerichtet.
export function telegramBereit() {
  return telegramOk() || ntfyOk();
}

async function ueberNtfy(text, art, titel = 'Zentrale') {
  const { prio, tags } = {
    fehler: { prio: '4', tags: 'rotating_light' },
    warnung: { prio: '3', tags: 'warning' },
    ok: { prio: '2', tags: 'white_check_mark' },
  }[art] || { prio: '3', tags: 'information_source' };
  const { res } = await holen(`${config.ntfy.url}/${encodeURIComponent(config.ntfy.topic)}`, {
    method: 'POST',
    timeout: 8000,
    headers: { Authorization: `Bearer ${config.ntfy.token}`, Title: titel, Priority: prio, Tags: tags },
    body: text,
  });
  return res.ok;
}

export async function melden(text, schluessel, art = 'warnung') {
  if (!telegramBereit() || !db().einstellungen.telegram) return false;
  const jetzt = Date.now();
  if (schluessel && jetzt - (zuletztGemeldet.get(schluessel) || 0) < 30 * 60_000) return false;
  if (schluessel) zuletztGemeldet.set(schluessel, jetzt);
  return nachrichtSenden(text, art);
}

// Sendet auf allen eingerichteten Kanälen (ohne Wiederholungs-Sperre, ohne Schalter) – für Tages-Check und Tests.
export async function nachrichtSenden(text, art = 'info', titel = 'Zentrale') {
  const symbol = { fehler: '🔴', warnung: '🟠', ok: '🟢', info: 'ℹ️', gast: '👤', nacht: '🌙', film: '🎬' }[art] || '•';
  let gesendet = false;
  if (ntfyOk()) {
    try { gesendet = (await ueberNtfy(text, art, titel)) || gesendet; } catch (e) { console.error('[ntfy]', e.message); }
  }
  if (telegramOk()) {
    try {
      const { res } = await holen(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
        method: 'POST',
        timeout: 8000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: `${symbol} ${titel}\n${text}`, disable_web_page_preview: true }),
      });
      gesendet = res.ok || gesendet;
    } catch (e) {
      console.error('[telegram]', e.message);
    }
  }
  return gesendet;
}
