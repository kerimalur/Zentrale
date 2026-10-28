// Markdown-Export und -Import fürs Labor: Ideen (Strategien, FX-Hypothesen, Fremddaten-Hypothesen) und Brainstorm-Zettel.
// Das Format ist für Menschen lesbar (Vorab-Karte wie im Skill «hypothese-testen») und enthält unten einen
// maschinenlesbaren Block (```json zentrale), damit der Import verlustfrei ist.
// Der Skill kann Ergebnisse als ```json zentrale-ergebnis``` zurückgeben; ohne Block versucht der Import, Vorab-Karte und Urteil
// aus dem Text zu lesen (Projekt-Doc des Skills oder Zeilen der Obsidian-Tabelle «Hypothesen»).
import { MAERKTE, ORTE, WETTER_GROESSEN, COT_MAERKTE, COT_GROESSEN, WEGE } from './katalog.mjs';
import { reiheName } from './quellen.mjs';

const URTEILE = ['Bestätigt', 'Hinweis', 'Nicht bestätigt', 'Zu wenig Daten'];
const pz = (x, st = 2) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(st)} %`);
const atr = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(3)} ATR`);
const rr = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(2)} R`);
const proz = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);
const heute = () => new Date().toISOString().slice(0, 10);
const zeile = (titel, wert) => (wert === null || wert === undefined || wert === '' ? '' : `- **${titel}:** ${String(wert).replace(/\n+/g, ' ')}\n`);
const ddmm = (s) => (s ? `${s.slice(3, 5)}.${s.slice(0, 2)}.` : '');

const MESS_TEXT = { wert: 'Wert', aenderung: 'Veränderung', aenderungProzent: 'Veränderung in %', anomalie: 'Anomalie (Std.-Abw.) gegen Vorjahre', zscore: 'z-Wert gegen die letzten Perioden', perzentil: 'Perzentil gegen Vorjahre' };
const AGG_TEXT = (a = {}) => (a.art === 'rollend' ? `${a.tage} Tage rollend (${a.fn || 'mittel'})` : a.art === 'woche' ? `pro Woche (${a.fn || 'mittel'})` : a.art === 'monat' ? `pro Monat (${a.fn || 'mittel'})` : 'wie veröffentlicht');

export function bedingungText(b) {
  const m = b.mess || {};
  const mess = m.art === 'anomalie' || m.art === 'perzentil' ? `${MESS_TEXT[m.art]} (${m.vorjahre} Vorjahre, ±${m.fenster} Tage)` : m.art === 'zscore' ? `${MESS_TEXT.zscore} (${m.perioden})` : m.art === 'aenderung' || m.art === 'aenderungProzent' ? `${MESS_TEXT[m.art]} über ${m.perioden} Perioden` : MESS_TEXT.wert;
  return `${reiheName(b.reihe)} [${b.reihe}], ${AGG_TEXT(b.agg)}${b.diff ? `, zuerst Differenz zu ${b.diff} Perioden davor` : ''}, ${mess} ${b.vergleich} ${b.schwelle} · bekannt ${b.verz} Tag${b.verz === 1 ? '' : 'e'} nach Periodenende`;
}

function karteZeilen(k, namen = {}) {
  let s = '';
  s += zeile('Hypothese', k.beschreibung || k.erwartung);
  if (k.typ === 'fremd') {
    s += zeile('Ereignis', k.modus === 'liste' ? `eigene Ereignis-Liste (${(k.liste || []).length} Daten)` : (k.bedingungen || []).map(bedingungText).join(' UND ') + (k.start === 'jede' ? ' · jede neue Periode zählt' : ' · nur der Beginn zählt'));
    s += zeile('Bekannt ab', k.bekanntAb || 'Periodenende + Verzögerung (siehe Ereignis)');
    s += zeile('Saison', k.saison ? `nur Ereignisse vom ${ddmm(k.saison.von)} bis ${ddmm(k.saison.bis)}` : 'ganzes Jahr');
  }
  s += zeile('Mechanismus', k.mechanismus);
  s += zeile('Erwartete Wirkung', k.erwartung);
  if (k.typ === 'fremd') {
    s += zeile('Markt', (k.maerkte || []).map((m) => `${reiheName(m.id)} [${m.id}]${m.handelbar ? '' : ' (nicht handelbar)'}, Kosten ${m.kosten} %`).join(' · '));
    s += zeile('Richtung', k.richtung === 'short' ? 'Short' : 'Long');
    s += zeile('Zeitraum', `Wartezeit ${k.warten} Tage, Horizonte ${(k.horizonte || []).join(', ')} Kalendertage (Haupt ${k.hauptHorizont})`);
    if (k.stufe2) s += zeile('Stufe 2', `Bias-Fenster ${k.hauptHorizont} Tage, Entry-Model ${k.stufe2.modell} (${k.stufe2.n} Tage), halten ${k.stufe2.halten} Tage`);
  } else if (k.typ === 'hypothese') {
    s += zeile('Ereignis', (k.ereignisse || []).map((e) => namen[e.id] || e.id).join(' UND '));
    s += zeile('Markt', k.paare?.length ? k.paare.join(', ') : 'alle 28 Paare');
    s += zeile('Zeitrahmen', `${k.tf}, Richtung ${k.richtung}, Horizonte ${(k.horizonte || []).join(', ')} Handelstage (Haupt ${k.hauptHorizont})`);
  } else {
    s += zeile('Strategie', namen[k.modell] || k.modell);
    s += zeile('Markt', k.paare?.length ? k.paare.join(', ') : 'alle 28 Paare');
    if (k.bias) s += zeile('Bias-Fenster', k.bias.quelle === 'fremd' ? `aus Fremd-Hypothese ${k.bias.idee}, ${k.bias.tage} Tage, ${k.bias.richtung}` : `${(k.bias.ereignisse || []).map((e) => namen[e.id] || e.id).join(' UND ')}, ${k.bias.tage} Handelstage`);
  }
  s += zeile('Erfolgskriterium', k.erfolgskriterium);
  s += zeile('Geplante Varianten', k.geplanteVarianten);
  if (k.wege?.length) s += zeile('Wege zu mehr Fällen', k.wege.map((w) => WEGE.find((x) => x.id === w)?.name || w).join(', '));
  s += zeile('Test-Zeitraum', `Backtest ${k.backtest?.von}–${k.backtest?.bis}, Forward ab ${k.forward?.von} (gesperrt, bis bewusst geöffnet)`);
  return s;
}

function ergebnisMd(e) {
  if (!e) return '';
  let s = `\n## Ergebnis (Zentrale, Version ${e.lauf?.v ?? '?'}, ${e.lauf?.art === 'forward' ? 'Backtest + Forward' : 'nur Backtest'}, ${(e.lauf?.ende || '').slice(0, 10)})\n\n`;
  s += zeile('Urteil', `${e.urteil} – ${e.warum}`);
  if (e.fazit) {
    s += zeile('Fazit', e.fazit.satz);
    if (e.fazit.achten?.length) s += zeile('Darauf achten', e.fazit.achten.join(' · '));
    s += zeile('Handelsregel', e.fazit.regel || e.fazit.regelHinweis || '—');
  }
  s += zeile('Monty-Stufe', e.stufe2 || e.karte?.bias ? '2 (Bias-Fenster + Entry-Model)' : e.lauf?.art === 'forward' ? '3 (Backtest vs. Forward)' : '1 (Grund-Hypothese)');
  s += zeile('Fälle', `N ${e.n} · unabhängig ${e.nUnabhaengig} · getestete Varianten ${e.varianten}`);
  if (e.typ === 'fremd') {
    const h = e.horizonte?.find((x) => x.h === e.haupt);
    if (h) s += zeile(`Kernzahlen (${e.haupt} Tage)`, `Ø ${pz(h.mittel)} · Saison ${pz(h.saison)} · Mehrwert ${pz(h.mehrwert)} · Zufall ${pz(h.zufall)} · p ${h.p ?? '—'} · Treffer ${proz(h.quote)} · gleichzeitig ${pz(h.gleichzeitig)}`);
    if (e.kennzahlen?.n) s += zeile('Als Handelsregel', `Trefferquote ${proz(e.kennzahlen.quote)}, Ø Gewinn ${pz(e.kennzahlen.avgGewinn)}, Ø Verlust ${pz(e.kennzahlen.avgVerlust)}, Profit-Faktor ${e.kennzahlen.pf ?? '—'}, schlechtester ${pz(e.kennzahlen.schlechtester)}`);
    if (e.forward) s += zeile('Forward', `${e.forward.n} Fälle, Ø ${pz(e.forward.mittel)}, Treffer ${proz(e.forward.quote)}`);
    if (e.dosis?.spearman) s += zeile('Dosis-Wirkung', `Rangkorrelation ${e.dosis.spearman.rho} (p ${e.dosis.spearman.p}), Quintile ${e.dosis.quintile.map((q) => pz(q.avg, 1)).join(' / ')}`);
    if (e.stufe2) s += zeile('Stufe 2', `${e.stufe2.modell}: im Fenster ${pz(e.stufe2.innen.avg)} (${e.stufe2.innen.n}), ausserhalb ${pz(e.stufe2.aussen.avg)} (${e.stufe2.aussen.n}), Gegenrichtung ${pz(e.stufe2.gegen.avg)} (${e.stufe2.gegen.n})`);
    s += zeile('Was würde das Urteil ändern', e.aendern);
  } else if (e.typ === 'hypothese') {
    const h = e.horizonte?.find((x) => x.h === e.haupt);
    if (h) s += zeile(`Kernzahlen (${e.haupt} Handelstage)`, `Ø ${atr(h.mittel)} · Saison ${atr(h.saison)} · Mehrwert ${atr(h.mehrwert)} · p ${h.p ?? '—'} · Treffer ${proz(h.quote)}`);
  } else if (e.kennzahlen) {
    s += zeile('Kernzahlen', `Ø ${rr(e.kennzahlen.avgR)} · Trefferquote ${proz(e.kennzahlen.quote)} · Profit-Faktor ${e.kennzahlen.pf ?? '—'} · Max. Drawdown ${e.kennzahlen.maxDD ?? '—'} R · Zufall ${rr(e.zufall?.mittel)} (p ${e.zufall?.p ?? '—'})`);
    if (e.forward) s += zeile('Forward', `${e.forward.kennzahlen.n} Trades, Ø ${rr(e.forward.kennzahlen.avgR)}`);
  }
  if (e.raster?.length) {
    s += '\n### Robustheit\n\n| | Prüfung | Detail |\n|---|---|---|\n';
    for (const z of e.raster) s += `| ${z.status === 'ja' ? '✓' : z.status === 'nein' ? '✗' : '–'} | ${z.name} | ${String(z.text).replace(/\|/g, '/')} |\n`;
  }
  if (e.abdeckung?.length && e.typ === 'fremd') {
    s += '\n### Quellen\n\n' + e.abdeckung.map((a) => `- ${a.name}: ${a.quelle}, ${a.von} bis ${a.bis} (${a.n} Werte)${a.link ? ` – ${a.link}` : ''}${a.veraltet ? ` – ${a.veraltet}` : ''}`).join('\n') + '\n';
  }
  return s;
}

const typText = (k) => (k.typ === 'fremd' ? 'Hypothese (Fremddaten)' : k.typ === 'hypothese' ? 'Hypothese (Kurse)' : 'Strategie');

// Eine Idee als Markdown. ergebnis = letztes Ergebnis (oder null), namen = id → Name der Bausteine
export function ideeMd(idee, ergebnis, namen = {}) {
  const v = idee.versionen[idee.versionen.length - 1];
  const k = v.karte;
  const fm = ['---', 'zentrale: labor', `art: ${k.typ}`, `id: ${idee.id}`, `version: ${v.v}`, `status: ${v.eingefroren ? 'eingefroren' : 'Entwurf'}`, ergebnis ? `urteil: ${ergebnis.urteil}` : null, idee.tags?.length ? `tags: [${idee.tags.join(', ')}]` : null, `exportiert: ${heute()}`, '---'].filter(Boolean).join('\n');
  let s = `${fm}\n\n# ${k.name}\n\n_${typText(k)} · Version ${v.v}${v.eingefroren ? `, eingefroren ${v.eingefroren.slice(0, 10)}` : ' (Entwurf)'}_\n\n`;
  const kt = k.kette || {};
  const kette = [kt.ereignis, kt.mechanismus, kt.wirkung, kt.markt, kt.zeitraum].filter(Boolean);
  if (kette.length) s += `> **Kette:** ${kette.join(' → ')}\n\n`;
  s += `## Vorab-Karte\n\n${karteZeilen(k, namen)}`;
  s += ergebnisMd(ergebnis);
  if (idee.extern?.length) {
    s += '\n## Ergebnisse aus dem Skill\n\n';
    for (const x of idee.extern) s += `- ${x.datum || ''} · **${x.urteil || 'ohne Urteil'}**${x.stufe ? ` · Stufe ${x.stufe}` : ''}${x.kernzahl ? ` · ${x.kernzahl}` : ''}${x.link ? ` · ${x.link}` : ''}${x.text ? `\n  ${x.text.replace(/\n+/g, ' ')}` : ''}\n`;
  }
  if (idee.notizen) s += `\n## Notizen\n\n${idee.notizen}\n`;
  if (k.typ === 'fremd' && k.modus === 'liste' && k.liste?.length) s += `\n## Ereignis-Liste\n\n${k.liste.map((x) => `- ${x.datum}${x.seite ? ` (${x.seite > 0 ? 'long' : 'short'})` : ''}${x.text ? ` – ${x.text}` : ''}`).join('\n')}\n`;
  s += `\n<details><summary>Maschinenlesbar (für den Import in die Zentrale)</summary>\n\n\`\`\`json zentrale\n${JSON.stringify({ art: 'idee', id: idee.id, karte: k, tags: idee.tags || [], notizen: idee.notizen || '' }, null, 1)}\n\`\`\`\n</details>\n`;
  return s;
}

export function zettelMd(z) {
  const kt = z.kette || {};
  let s = `---\nzentrale: labor\nart: zettel\nid: ${z.id}\nstatus: ${z.status}\n${z.tags?.length ? `tags: [${z.tags.join(', ')}]\n` : ''}exportiert: ${heute()}\n---\n\n# ${z.titel}\n\n_Brainstorm-Zettel · ${z.status}_\n\n`;
  if (z.text) s += `${z.text}\n\n`;
  const kette = [['Ereignis', kt.ereignis], ['Mechanismus', kt.mechanismus], ['Wirkung', kt.wirkung], ['Markt', kt.markt], ['Zeitraum', kt.zeitraum]].filter(([, w]) => w);
  if (kette.length) s += `## Kette\n\n${kette.map(([a, w]) => zeile(a, w)).join('')}\n`;
  if (z.spiegel) s += `## Spiegel-Idee\n\n${z.spiegel}\n\n`;
  if (z.fragen) s += `## Offene Fragen und Zweifel\n\n${z.fragen}\n\n`;
  if (z.wege?.length) s += `## Wege zu mehr Fällen\n\n${z.wege.map((w) => `- ${WEGE.find((x) => x.id === w)?.name || w}`).join('\n')}\n\n`;
  if (z.quellen) s += `## Datenquellen-Ideen\n\n${z.quellen}\n\n`;
  s += `<details><summary>Maschinenlesbar (für den Import in die Zentrale)</summary>\n\n\`\`\`json zentrale\n${JSON.stringify({ art: 'zettel', ...z }, null, 1)}\n\`\`\`\n</details>\n`;
  return s;
}

export function sammlungMd(teile, titel = 'Labor-Export') {
  return `# ${titel}\n\n_${teile.length} Einträge · exportiert ${heute()} aus der Zentrale_\n\n${teile.map((t) => t.replace(/^---[\s\S]*?\n---\n/, (fm) => `<!--\n${fm}\n-->\n`)).join('\n\n---\n\n')}`;
}

// ---------- Import ----------
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/m.exec(text);
  if (!m) return {};
  const out = {};
  for (const z of m[1].split('\n')) { const x = /^([a-zA-Z_]+):\s*(.*)$/.exec(z.trim()); if (x) out[x[1]] = x[2].trim(); }
  return out;
}
function feld(text, ...namen) {
  for (const n of namen) {
    const re = new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${n}(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*(.+)$`, 'im');
    const m = re.exec(text);
    if (m) return m[1].replace(/\*\*/g, '').trim();
  }
  return '';
}
const urteilIn = (s) => URTEILE.find((u) => new RegExp(`\\b${u}\\b`, 'i').test(s || '')) || null;

// Zerlegt einen Text in Abschnitte (bei Sammlungen: an "\n---\n" zwischen Einträgen) und liest jeden.
// Ergebnis: { ideen: [{ id?, karte, tags, notizen }], zettel: [z], ergebnisse: [{ id?, name, urteil, stufe, kernzahl, link, text, datum }] }
export function mdLesen(text) {
  const out = { ideen: [], zettel: [], ergebnisse: [], warnungen: [] };
  const roh = String(text || '').replace(/\r\n/g, '\n');
  // 1) Maschinenlesbare Blöcke
  const bloecke = [...roh.matchAll(/```json\s+(zentrale(?:-ergebnis)?)\s*\n([\s\S]*?)\n```/g)];
  for (const [, art, inhalt] of bloecke) {
    try {
      const j = JSON.parse(inhalt);
      const liste = Array.isArray(j) ? j : [j];
      for (const x of liste) {
        if (art === 'zentrale-ergebnis' || x.art === 'ergebnis') out.ergebnisse.push(ergebnisNormal(x));
        else if (x.art === 'zettel') out.zettel.push(x);
        else if (x.karte) out.ideen.push({ id: x.id || null, karte: x.karte, tags: x.tags || [], notizen: x.notizen || '' });
      }
    } catch { out.warnungen.push('Ein maschinenlesbarer Block war kein gültiges JSON und wurde übersprungen.'); }
  }
  if (bloecke.length) return out;
  // 2) Obsidian-Tabelle «Hypothesen»: | Datum | Hypothese | Markt | Fälle | Urteil + Kernzahl | Link |
  const tabelle = roh.split('\n').filter((z) => /^\|/.test(z.trim()) && !/^\|\s*-/.test(z.trim()) && !/^\|\s*Datum\s*\|/i.test(z.trim()));
  if (tabelle.length && /\|\s*Hypothese\s*\|/i.test(roh)) {
    for (const z of tabelle) {
      const f = z.split('|').slice(1, -1).map((s) => s.trim());
      if (f.length < 5 || !f[1]) continue;
      const urteil = urteilIn(f[4]) || (/offen/i.test(f[4]) ? null : null);
      out.zettel.push({ titel: f[1].slice(0, 120), text: `Aus der Obsidian-Tabelle «Hypothesen» (${f[0]}).${f[3] ? ` Fälle: ${f[3]}.` : ''}`, kette: { markt: f[2] || '' }, status: urteil ? 'getestet' : 'roh', tags: [] });
      if (urteil || f[5]) out.ergebnisse.push(ergebnisNormal({ name: f[1], urteil, kernzahl: f[4], link: (f[5] || '').replace(/^\[.*?\]\((.*)\)$/, '$1'), datum: f[0] }));
    }
    return out;
  }
  // 3) Freier Text (Projekt-Doc des Skills, eigene Notiz): je Abschnitt ein Zettel, Urteil als Ergebnis
  const abschnitte = roh.split(/\n-{3,}\n(?=[\s\S]*#)/).map((s) => s.trim()).filter(Boolean);
  for (const a of abschnitte.length ? abschnitte : [roh]) {
    const fm = frontmatter(a);
    const titel = (/^#\s+(.+)$/m.exec(a)?.[1] || feld(a, 'Hypothese') || 'Importierte Idee').replace(/[#*_]/g, '').trim().slice(0, 120);
    const z = {
      titel, text: feld(a, 'Hypothese', 'Idee', 'Frage'),
      kette: { ereignis: feld(a, 'Ereignis', 'Ereignis-Definition'), mechanismus: feld(a, 'Mechanismus'), wirkung: feld(a, 'Erwartete Wirkung', 'Erwartung', 'Wirkung', 'Richtung'), markt: feld(a, 'Markt', 'Märkte', 'Instrument'), zeitraum: feld(a, 'Horizont', 'Zeitraum', 'Haltedauer') },
      fragen: feld(a, 'Offene Fragen', 'Zweifel'), spiegel: feld(a, 'Spiegel', 'Spiegel-Hypothese'), quellen: feld(a, 'Daten', 'Quellen', 'Datenquelle'),
      status: 'roh', tags: fm.tags ? fm.tags.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [],
    };
    const urteil = urteilIn(feld(a, 'Urteil'));
    if (urteil) {
      z.status = 'getestet';
      const link = /(https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]+)/.exec(a)?.[1] || feld(a, 'Link');
      out.ergebnisse.push(ergebnisNormal({ id: fm.id, name: titel, urteil, stufe: feld(a, 'Monty-Stufe', 'Stufe'), kernzahl: feld(a, 'Kernzahlen', 'Kernzahl', 'Fälle'), link, text: feld(a, 'Was würde das Urteil ändern', 'Einordnung', 'Fazit'), datum: fm.exportiert || feld(a, 'Datum', 'getestet') }));
    }
    if (fm.zentrale === 'labor' && fm.id && urteil) continue; // eigenes Export-Dokument mit Ergebnis: nur das Ergebnis zuordnen
    if (Object.values(z.kette).some(Boolean) || z.text || !urteil) out.zettel.push(z);
  }
  return out;
}

function ergebnisNormal(x) {
  const s = (v, max = 400) => String(v ?? '').trim().slice(0, max);
  return { id: x.id ? s(x.id, 40) : null, name: s(x.name, 120), urteil: urteilIn(x.urteil) || null, stufe: s(x.stufe, 60), kernzahl: s(x.kernzahl, 300), link: /^https?:\/\//.test(s(x.link)) ? s(x.link) : '', text: s(x.text, 1500), datum: s(x.datum, 20) || heute(), n: Number.isFinite(Number(x.n)) ? Number(x.n) : null, nUnabhaengig: Number.isFinite(Number(x.nUnabhaengig)) ? Number(x.nUnabhaengig) : null };
}

// Namen aller Bausteine für den Export
export function katalogNamen(bausteine) {
  const n = {};
  for (const x of [...(bausteine.strategien || []), ...(bausteine.ereignisse || []), ...(bausteine.filter || [])]) n[x.id] = x.name;
  for (const m of MAERKTE) n[m.id] = m.name;
  for (const [k, v] of Object.entries(ORTE)) n[`ort:${k}`] = v.name;
  for (const w of WETTER_GROESSEN) n[`wetter:${w.wert}`] = w.text;
  for (const [c, name] of COT_MAERKTE) n[`cot:${c}`] = name;
  for (const g of COT_GROESSEN) n[`cotg:${g.wert}`] = g.text;
  return n;
}
