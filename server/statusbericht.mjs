// Statusbericht als Markdown in den Obsidian-Vault (Ordner «Homelab»), den Syncthing auf PC und Handy bringt.
// Nur lesend, enthält keine Passwörter, Schlüssel oder Gast-Zugänge. Claude kann ihn über den PC lesen.
import fs from 'node:fs';
import path from 'node:path';
import { config, hostPath } from './config.mjs';

const DATEINAME = 'Zentrale-Status.md';
let ziel = null; // Host-Pfad des Ordners «Homelab» im Vault
let gesucht = 0;

// Sucht unter dem Syncthing-Ordner (max. 3 Ebenen) nach «Homelab/Meine Specs.md» – dort liegt deine Homelab-Notiz.
function zielFinden() {
  if (process.env.STATUS_ORDNER) return process.env.STATUS_ORDNER;
  const basis = config.statusBasis;
  const suche = (rel, tiefe) => {
    let eintraege = [];
    try { eintraege = fs.readdirSync(hostPath(path.join(basis, rel)), { withFileTypes: true }); } catch { return null; }
    if (eintraege.some((e) => e.isDirectory() && e.name === 'Homelab') && fs.existsSync(hostPath(path.join(basis, rel, 'Homelab', 'Meine Specs.md')))) return path.join(basis, rel, 'Homelab');
    if (tiefe <= 0) return null;
    for (const e of eintraege) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = suche(path.join(rel, e.name), tiefe - 1);
      if (r) return r;
    }
    return null;
  };
  return suche('', 3);
}

const z1 = (x) => (x === null || x === undefined ? '—' : String(x).replace('.', ','));
const gb = (b) => (b === null || b === undefined ? '—' : b >= 1e12 ? `${z1((b / 1e12).toFixed(2))} TB` : b >= 1e9 ? `${z1((b / 1e9).toFixed(1))} GB` : `${Math.round(b / 1e6)} MB`);
const zeit = (t) => (t ? new Date(t).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const zelle = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

export function berichtText(s) {
  const z = [];
  const stoerung = s.dienste.filter((d) => d.status === 'gestoert' || d.status === 'offline');
  const ampel = stoerung.length ? '🔴' : s.hinweise.length ? '🟠' : '🟢';
  z.push('---', `aktualisiert: ${new Date(s.zeit).toISOString()}`, 'tags: [homelab, status]', '---', '');
  z.push('# Zentrale – Status', '');
  z.push(`> ${ampel} Stand **${zeit(s.zeit)}** · automatisch alle 15 Min von der Zentrale geschrieben. Nicht von Hand bearbeiten, wird überschrieben.`, '');

  z.push('## Kurz', '');
  z.push(`- **Szene:** ${s.szene.name}${s.steuerung.notbetrieb.an ? ' · **Notbetrieb aktiv**' : ''}`);
  z.push(`- **Dienste:** ${s.dienste.filter((d) => d.status === 'online').length}/${s.dienste.length} online${stoerung.length ? ` · gestört: ${stoerung.map((d) => d.name).join(', ')}` : ''}`);
  if (s.pi) z.push(`- **Pi:** CPU ${z1(s.pi.cpu)} % · RAM ${gb(s.pi.ramBenutzt)} / ${gb(s.pi.ramTotal)} · ${z1(s.pi.temp?.toFixed?.(0))} °C · Unterspannung: ${s.pi.unterspannung ? 'JA' : 'nein'} · Container ${s.pi.container.laufen}/${s.pi.container.gesamt}`);
  if (s.pi) z.push(`- **Updates:** ${s.pi.updates === null ? 'wird geprüft' : s.pi.updates === 0 ? 'alles aktuell' : `${s.pi.updates} verfügbar (sudo apt update && sudo apt full-upgrade)`}`);
  const cu = s.containerUpdates;
  if (cu) z.push(`- **Container-Updates:** ${!cu.bereit ? cu.grund : cu.liste.length === 0 ? 'alles aktuell' : `${cu.liste.length} verfügbar (${cu.liste.map((c) => c.name).join(', ')})`}`);
  const m = s.moebel;
  if (m.vorhanden) z.push(`- **Möbel:** ${m.temp === null ? 'kein Wert' : `${z1(m.temp)} °C`} (24 Std ${z1(m.min24)}–${z1(m.max24)} °C) · Lüfter ${m.luefter.an === null ? '?' : m.luefter.an ? 'an' : 'aus'} (${m.luefter.modus}) – ${m.luefter.grund}`);
  const b = s.backup;
  z.push(`- **Backup:** ${!b.eingerichtet ? 'nicht eingerichtet' : b.laeuft ? 'läuft gerade' : b.letzte ? `${zeit(b.letzte.zeit)} · ${b.letzte.ok ? 'ok' : 'FEHLER: ' + b.letzte.fehler}` : 'noch nie'} · automatisch: ${b.auto ? 'an' : 'aus'}`);
  if (s.medien?.vpn) z.push(`- **VPN:** ${s.medien.vpn.ausgeschaltet ? 'aus' : s.medien.vpn.ok ? `verbunden (${s.medien.vpn.land || '?'})` : 'nicht verbunden'}`);
  if (s.netz.pihole) z.push(`- **Pi-hole:** ${s.netz.pihole.anfragen ?? '—'} Anfragen, ${s.netz.pihole.geblockt ?? '—'} geblockt (${z1(s.netz.pihole.prozent?.toFixed?.(1))} %)`);
  z.push('');

  z.push('## Dienste', '', '| Dienst | Status | Antwort | Kennzahl |', '|---|---|---|---|');
  for (const d of s.dienste) z.push(`| ${d.name} | ${d.status}${d.ausGrund ? ` (${d.ausGrund})` : ''} | ${d.ms === null ? '—' : d.ms + ' ms'} | ${zelle(d.kennzahl)} ${zelle(d.label)} |`);
  z.push('');

  z.push('## Laufwerke', '', '| Laufwerk | Mount | belegt | frei | Gesundheit |', '|---|---|---|---|---|');
  for (const l of s.laufwerke) z.push(`| ${zelle(l.name)} | ${l.mount} | ${gb(l.benutzt)} / ${gb(l.gross)} | ${gb(l.frei)}${l.schlaeft ? ' (schläft)' : ''} | ${l.gesundheit ? `${l.gesundheit.text}${l.gesundheit.temp !== null ? `, ${l.gesundheit.temp} °C` : ''}` : '—'} |`);
  z.push('');

  if (cu?.bereit && cu.liste.length) {
    z.push('## Container-Updates', '', '| Container | Art | Version | Befehl |', '|---|---|---|---|');
    for (const c of cu.liste) {
      const ver = c.art === 'image' ? 'neues Image (gleicher Tag)' : `${c.von || '?'} → ${c.nach || '?'}`;
      const cmd = c.ordner && c.dienst ? `\`cd ${c.ordner} && docker compose pull ${c.dienst} && docker compose up -d ${c.dienst}\`` : '—';
      z.push(`| ${zelle(c.name)} | ${c.art} | ${zelle(ver)} | ${cmd} |`);
    }
    z.push('');
  }

  const c = s.cloud;
  z.push('## Nextcloud', '');
  if (!c.bereit) z.push(`- nicht verfügbar: ${c.grund}`);
  else {
    z.push(`- **Upload:** ${c.aktiv ? 'läuft' : 'ruhig'} · 10 Min: ${c.zehnMin?.anzahl} Dateien (${gb(c.zehnMin?.bytes)}) · 1 Std: ${c.stunde?.anzahl} · heute: ${c.heute?.anzahl} (${gb(c.heute?.bytes)}) · letzter: ${zeit(c.letzter)}`);
    z.push(`- **Platz:** ${gb((c.nutzer || []).reduce((a, n) => a + n.belegt, 0))} belegt · ${gb(c.platz?.frei)} frei`);
    for (const g of (c.ziele || []).slice(0, 5)) z.push(`- Ziel: \`${g.ordner}\` – ${g.anzahl} Dateien, ${gb(g.bytes)}, zuletzt ${zeit(g.zuletzt)}`);
    if ((c.fehler || []).length) for (const f of c.fehler.slice(0, 5)) z.push(`- ⚠️ ${zeit(f.zeit)} ${f.app}: ${zelle(f.text)}${f.anzahl > 1 ? ` (${f.anzahl}×)` : ''}`);
    else z.push('- Keine Nextcloud-Fehler in 24 Std');
  }
  z.push('');

  z.push('## Hinweise & Fehler der Zentrale', '');
  if (!s.hinweise.length) z.push('- keine');
  for (const h of s.hinweise) z.push(`- ${zelle(h)}`);
  z.push('');

  z.push('## Ereignisse (24 Std)', '');
  const grenze = s.zeit - 24 * 3600_000;
  const ev = s.ereignisse.filter((e) => e.t >= grenze);
  if (!ev.length) z.push('- keine');
  for (const e of ev.slice(0, 30)) z.push(`- ${zeit(e.t)} · ${e.art} · ${zelle(e.text)}`);
  z.push('');
  return z.join('\n');
}

export async function statusBerichtSchreiben(snap) {
  if (process.env.STATUS_BERICHT === 'aus') return { ok: false, grund: 'ausgeschaltet' };
  if (!ziel && Date.now() - gesucht > 30 * 60_000) { gesucht = Date.now(); ziel = zielFinden(); }
  if (!ziel) return { ok: false, grund: 'Ordner «Homelab» im Vault nicht gefunden' };
  const ordner = hostPath(ziel);
  const datei = path.join(ordner, DATEINAME);
  const tmp = path.join(ordner, '.syncthing.' + DATEINAME + '.tmp'); // Syncthing ignoriert .syncthing.*-Dateien
  fs.writeFileSync(tmp, berichtText(snap));
  // Gleicher Besitzer wie der Ordner, damit Syncthing die Datei ersetzen darf.
  try { const st = fs.statSync(ordner); fs.chownSync(tmp, st.uid, st.gid); } catch {}
  fs.renameSync(tmp, datei);
  return { ok: true, pfad: path.join(ziel, DATEINAME) };
}
