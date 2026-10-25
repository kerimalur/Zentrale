// Scrutiny (SMART-Überwachung der Platten): Gesundheit, Temperatur, Betriebsstunden.
// Zuordnung zu den Laufwerken der Zentrale über die WWN (/dev/disk/by-id/wwn-… → sdX auf dem Pi).
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from '../config.mjs';
import { holenJson } from '../util.mjs';

// device_status von Scrutiny: 0 = ok, Bit 1 = SMART meldet Fehler, Bit 2 = Scrutiny-Grenzwerte (Backblaze-Statistik) überschritten
function bewerten(status) {
  if (!status) return { stufe: 'ok', text: 'gesund' };
  if (status & 1) return { stufe: 'fehler', text: 'SMART meldet einen Fehler' };
  return { stufe: 'warnung', text: 'auffällige Werte (Scrutiny)' };
}

function wwnZuGeraet() {
  const ordner = hostPath('/dev/disk/by-id');
  const map = {};
  let namen = [];
  try { namen = fs.readdirSync(ordner); } catch { return map; }
  for (const n of namen) {
    if (!n.startsWith('wwn-') || n.includes('-part')) continue;
    try { map[n.slice(4).toLowerCase()] = path.basename(fs.readlinkSync(path.join(ordner, n))); } catch {}
  }
  return map;
}

export async function scrutinyDaten() {
  const j = await holenJson(`http://127.0.0.1:${config.scrutiny.port}/api/summary`, { timeout: 8000 });
  const summary = j?.data?.summary || {};
  const geraete = wwnZuGeraet();
  return Object.entries(summary).map(([wwn, e]) => {
    const status = Number(e?.device?.device_status) || 0;
    return {
      wwn,
      geraet: geraete[String(wwn).toLowerCase()] || null,
      modell: e?.device?.model_name || '',
      status,
      ...bewerten(status),
      temp: e?.smart?.temp ?? null,
      stunden: e?.smart?.power_on_hours ?? null,
      zeit: e?.smart?.collector_date || null,
    };
  });
}
