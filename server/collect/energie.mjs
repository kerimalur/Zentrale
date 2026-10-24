// Stromverbrauch: echt über einen Shelly-Messstecker, sonst geschätzt.
import { config } from '../config.mjs';
import { holenJson } from '../util.mjs';

export async function energie({ cpu, laufwerke }) {
  const url = config.energie.shellyUrl;
  if (url) {
    // Shelly Gen2/Gen3 (Plus/Plug S Gen3) zuerst, dann Gen1.
    try {
      const j = await holenJson(`${url}/rpc/Switch.GetStatus?id=0`, { timeout: 3000 });
      if (typeof j.apower === 'number') return { watt: j.apower, quelle: 'shelly' };
    } catch {}
    try {
      const j = await holenJson(`${url}/status`, { timeout: 3000 });
      const w = j?.meters?.[0]?.power;
      if (typeof w === 'number') return { watt: w, quelle: 'shelly' };
    } catch {}
  }
  // Schätzung: Pi 4 im Leerlauf ~2,7 W, bei Volllast ~6,4 W; SSD ~0,8 W; HDD extra (eigenes Netzteil) ~4 W wenn wach.
  let w = 2.7 + ((cpu ?? 10) / 100) * 3.7;
  for (const l of laufwerke || []) {
    if (l.typ === 'ssd') w += 0.8;
    if (l.typ === 'hdd') w += l.schlaeft ? 0.7 : 4;
  }
  return { watt: Math.round(w * 10) / 10, quelle: 'schaetzung' };
}
