// "Wofür der Speicher gebraucht wird": Ordnergrössen (alle 30 Min, schonend).
import { config, hostPath } from '../config.mjs';
import { ausfuehren, existiert } from '../util.mjs';
import { dockerSpeicher } from './docker.mjs';

let cache = { zeit: 0, kategorien: [] };
let laeuft = false;

async function groesse(pfad) {
  const p = hostPath(pfad);
  if (!existiert(p)) return null;
  const r = await ausfuehren('nice', ['-n', '19', 'du', '-sb', p], { timeout: 300_000 });
  if (!r.stdout) return null;
  const n = Number(r.stdout.trim().split(/\s+/)[0]);
  return Number.isFinite(n) ? n : null;
}

export async function speicherAktualisieren() {
  if (laeuft) return;
  laeuft = true;
  try {
    const out = [];
    for (const k of config.speicherKategorien) {
      const b = await groesse(k.pfad);
      if (b !== null) out.push({ name: k.name, pfad: k.pfad, bytes: b });
    }
    try { out.push({ name: 'Docker-Images', pfad: 'docker', bytes: await dockerSpeicher() }); } catch {}
    cache = { zeit: Date.now(), kategorien: out.sort((a, b) => b.bytes - a.bytes) };
  } finally {
    laeuft = false;
  }
}

export const speicherKategorien = () => cache;
