// Ereignisse & Fehler + Telegram-Benachrichtigung.
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

export function telegramBereit() {
  return !!(config.telegram.token && config.telegram.chatId);
}

export async function melden(text, schluessel, art = 'warnung') {
  if (!telegramBereit() || !db().einstellungen.telegram) return false;
  const jetzt = Date.now();
  if (schluessel && jetzt - (zuletztGemeldet.get(schluessel) || 0) < 30 * 60_000) return false;
  if (schluessel) zuletztGemeldet.set(schluessel, jetzt);
  const symbol = { fehler: '🔴', warnung: '🟠', ok: '🟢', info: 'ℹ️', gast: '👤', nacht: '🌙', film: '🎬' }[art] || '•';
  try {
    const { res } = await holen(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
      method: 'POST',
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegram.chatId, text: `${symbol} Zentrale · ${text}`, disable_web_page_preview: true }),
    });
    return res.ok;
  } catch (e) {
    console.error('[telegram]', e.message);
    return false;
  }
}
