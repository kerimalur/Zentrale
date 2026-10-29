// PDF-Auswertungen fürs Labor (pdfkit, läuft auf dem Pi ohne Browser):
//   - ein Lauf: Kopf mit Urteil, Fazit, Einstellungen (alle Parameter), Kennzahlen, R-Kurve, Robustheit, Trichter,
//     pro Jahr / pro Paar, Trade-Liste
//   - ein Vergleich (2–4 Läufe): Urteile, Unterschiede der Einstellungen, Kennzahlen, Kurven übereinander, Trichter, Robustheit
// Standard-Schrift Helvetica (WinAnsi): Zeichen ausserhalb (−, →, ↔, ≈, ✓ …) werden ersetzt.
import PDFDocument from 'pdfkit';
import { laborErgebnis, laborVergleich, spezifikation } from './labor.mjs';

const FARBEN = ['#2563eb', '#d97706', '#7c3aed', '#059669'];
const URTEIL_FARBE = { 'Bestätigt': '#15803d', Hinweis: '#b45309', 'Nicht bestätigt': '#b91c1c', 'Zu wenig Daten': '#6b7280' };
const TRICHTER_TEXT = {
  linien: 'GVA-Treffer', keinHoch: 'kein letztes Hoch', keinBos: 'kein BOS', bosNurUnterOpen: 'BOS nur unter Daily Open', bos: 'mit BOS', ungueltig: 'ungültig (weggelaufen)',
  gebrochen: 'Low gebrochen', verfallen: 'verfallen', zuWenigConf: 'zu wenig Confluences', gegenBos: 'Gegen-BOS-Regel', einstieg: 'Einstieg erreicht',
};
const GRUND = { tp: 'TP', sl: 'SL', be: 'Break-Even', zeit: 'Zeit', offen: 'offen' };

// Text auf WinAnsi bringen
const t = (x) => String(x ?? '—')
  .replace(/−/g, '-').replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->').replace(/≈/g, '~').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/✓/g, 'ja').replace(/✗/g, 'nein')
  .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/…/g, '...').replace(/[^\x00-\xff€–—•·×]/g, '?');
const rt = (x, st = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(st).replace('.', ',')} R`);
const pz = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);
const zahl = (x, st = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(st).replace('.', ','));
const datum = (s) => new Date(s * 1000).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const iso = (s) => (s ? new Date(s).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const KZ = [
  ['Trades', (e) => e.kennzahlen?.n ?? e.n, (x) => (x ?? '—')],
  ['Unabhängige Fälle', (e) => e.nUnabhaengig, (x) => (x ?? '—')],
  ['Ø R pro Trade', (e) => e.kennzahlen?.avgR, rt],
  ['Trefferquote', (e) => e.kennzahlen?.quote, pz],
  ['Summe R', (e) => e.kennzahlen?.summeR, (x) => rt(x, 1)],
  ['Profit-Faktor', (e) => e.kennzahlen?.pf, (x) => zahl(x)],
  ['Max. Drawdown', (e) => e.kennzahlen?.maxDD, (x) => (x === null || x === undefined ? '—' : `${zahl(x, 1)} R`)],
  ['Längste Verlustserie', (e) => e.kennzahlen?.verlustSerie, (x) => (x ?? '—')],
  ['SQN', (e) => e.kennzahlen?.sqn, (x) => zahl(x)],
  ['Median R', (e) => e.kennzahlen?.median, rt],
  ['Ø Gewinner', (e) => e.kennzahlen?.avgGewinn, rt],
  ['Ø Verlierer', (e) => e.kennzahlen?.avgVerlust, rt],
  ['Zufall Ø R', (e) => e.zufall?.mittel, rt],
  ['p-Wert', (e) => e.zufall?.p, (x) => zahl(x, 3)],
  ['Drawdown 95 % (Monte Carlo)', (e) => e.monteCarlo?.dd95, (x) => (x === null || x === undefined ? '—' : `${zahl(x, 1)} R`)],
  ['Forward Ø R', (e) => e.forward?.kennzahlen?.avgR, rt],
  ['Forward Trades', (e) => e.forward?.kennzahlen?.n, (x) => (x ?? '—')],
];

function neuesDokument(titel) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 42, right: 42 }, info: { Title: t(titel), Author: 'Zentrale · Trading-Labor' }, bufferPages: true });
  const teile = [];
  doc.on('data', (c) => teile.push(c));
  const fertig = new Promise((ok) => doc.on('end', () => ok(Buffer.concat(teile))));
  return { doc, fertig };
}
const breite = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const unten = (doc) => doc.page.height - doc.page.margins.bottom;
function platz(doc, h) { if (doc.y + h > unten(doc)) doc.addPage(); }
function ueberschrift(doc, text) {
  platz(doc, 80); // Überschrift nie allein unten auf der Seite
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12.5).fillColor('#111').text(t(text), doc.page.margins.left, doc.y);
  doc.moveDown(0.25);
}
// Tabelle mit festen Spaltenbreiten (Anteile), Kopfzeile wird nach Seitenumbruch wiederholt
function tabelle(doc, kopf, zeilen, anteile, { markiere = () => null, fett = () => false, schrift = 8.5 } = {}) {
  const b = breite(doc), x0 = doc.page.margins.left;
  const w = anteile.map((a) => (a / anteile.reduce((s, y) => s + y, 0)) * b);
  const zeile = (werte, istKopf, i) => {
    doc.font(istKopf ? 'Helvetica-Bold' : 'Helvetica').fontSize(schrift);
    const h = Math.max(...werte.map((v, j) => doc.heightOfString(t(v), { width: w[j] - 6 }))) + 5;
    if (doc.y + h > unten(doc)) { doc.addPage(); if (!istKopf && kopf) zeile(kopf, true, -1); }
    const y = doc.y;
    const hinter = istKopf ? '#e5e7eb' : markiere(i);
    if (hinter) doc.save().rect(x0, y, b, h).fill(hinter).restore();
    let x = x0;
    werte.forEach((v, j) => {
      doc.font(istKopf || fett(i, j) ? 'Helvetica-Bold' : 'Helvetica').fontSize(schrift).fillColor('#111').text(t(v), x + 3, y + 2.5, { width: w[j] - 6 });
      x += w[j];
    });
    doc.save().moveTo(x0, y + h).lineTo(x0 + b, y + h).lineWidth(0.3).strokeColor('#d1d5db').stroke().restore();
    doc.x = x0; doc.y = y + h;
  };
  if (kopf) zeile(kopf, true, -1);
  zeilen.forEach((z, i) => zeile(z, false, i));
  doc.moveDown(0.3);
}
// Kurven (kumulierte R) – eine oder mehrere, Forward gestrichelt
function kurven(doc, reihen) {
  const alle = reihen.flatMap((r) => [...(r.kurve || []), ...(r.forward || [])]);
  if (!alle.length) return;
  const H = 170;
  platz(doc, H + 20);
  const x0 = doc.page.margins.left + 34, b = breite(doc) - 40, y0 = doc.y + 6;
  const versatz = (r) => (r.kurve?.length ? r.kurve[r.kurve.length - 1][1] : 0);
  const werte = reihen.flatMap((r) => [...(r.kurve || []).map((p) => p[1]), ...(r.forward || []).map((p) => p[1] + versatz(r))]);
  const t0 = Math.min(...alle.map((p) => p[0])), t1 = Math.max(...alle.map((p) => p[0]));
  let lo = Math.min(0, ...werte), hi = Math.max(0, ...werte);
  if (hi === lo) hi = lo + 1;
  const x = (s) => x0 + ((s - t0) / Math.max(1, t1 - t0)) * b;
  const y = (v) => y0 + (1 - (v - lo) / (hi - lo)) * H;
  doc.save().lineWidth(0.3).strokeColor('#e5e7eb');
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; doc.moveTo(x0, y(v)).lineTo(x0 + b, y(v)).stroke(); doc.fillColor('#6b7280').fontSize(7).text(`${zahl(v, 0)} R`, x0 - 34, y(v) - 3, { width: 30, align: 'right' }); }
  doc.lineWidth(0.6).strokeColor('#6b7280').moveTo(x0, y(0)).lineTo(x0 + b, y(0)).stroke();
  reihen.forEach((r, i) => {
    const zeichne = (pkt, plus, strich) => {
      if (!pkt?.length) return;
      doc.lineWidth(1.2).strokeColor(r.farbe || FARBEN[i]);
      if (strich) doc.dash(4, { space: 3 }); else doc.undash();
      pkt.forEach((p, j) => (j ? doc.lineTo(x(p[0]), y(p[1] + plus)) : doc.moveTo(x(p[0]), y(p[1] + plus))));
      doc.stroke();
    };
    zeichne(r.kurve, 0, false);
    zeichne(r.forward, versatz(r), true);
  });
  doc.undash().restore();
  doc.fillColor('#6b7280').fontSize(7).text(String(new Date(t0 * 1000).getUTCFullYear()), x0, y0 + H + 3).text(String(new Date(t1 * 1000).getUTCFullYear()), x0 + b - 30, y0 + H + 3, { width: 30, align: 'right' });
  doc.x = doc.page.margins.left; doc.y = y0 + H + 16;
}
function fusszeilen(doc) {
  const r = doc.bufferedPageRange();
  for (let i = r.start; i < r.start + r.count; i++) {
    doc.switchToPage(i);
    // unterer Rand kurz aufheben, sonst legt pdfkit für die Fusszeile eine neue Seite an
    const rand = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
      .text(t(`Zentrale · Trading-Labor · erstellt ${iso(Date.now())} · Seite ${i + 1} von ${r.count}`), doc.page.margins.left, doc.page.height - 32, { width: breite(doc), align: 'center', lineBreak: false });
    doc.page.margins.bottom = rand;
  }
}
const dateiName = (s) => s.toLowerCase().replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'labor';

// ---------- Ein Lauf ----------
export async function laborPdfLauf(laufId) {
  const e = laborErgebnis(String(laufId || '').replace(/[^0-9a-f-]/g, ''));
  if (!e) return { fehler: 'Ergebnis nicht gefunden' };
  const k = e.karte || {};
  const titel = `${k.name || 'Lauf'} · Version ${e.lauf?.v ?? '?'}${e.lauf?.art === 'forward' ? ' · mit Forward' : ''}`;
  const { doc, fertig } = neuesDokument(titel);
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111').text(t(titel));
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(t(`Lauf vom ${iso(e.lauf?.ende)} · Rechenzeit ${e.dauerSek ?? '—'} s · ${e.varianten ?? 1} getestete Variante(n)`));
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(URTEIL_FARBE[e.urteil] || '#111').text(t(`Urteil: ${e.urteil}`), { continued: true }).font('Helvetica').fontSize(10).fillColor('#374151').text(t(`  –  ${e.warum || ''}`));
  if (e.fazit?.satz) doc.moveDown(0.2).fontSize(10).fillColor('#111').text(t(e.fazit.satz));
  if (e.fazit?.regel) doc.fontSize(9.5).fillColor('#374151').text(t(`Handelsregel: ${e.fazit.regel}`));
  else if (e.fazit?.regelHinweis) doc.fontSize(9.5).fillColor('#374151').text(t(e.fazit.regelHinweis));
  if (e.fazit?.achten?.length) { doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9.5).fillColor('#111').text('Worauf achten'); doc.font('Helvetica').fontSize(9).fillColor('#374151'); for (const a of e.fazit.achten) doc.text(t(`• ${a}`)); }
  if (k.mechanismus || k.erwartung || k.erfolgskriterium) {
    ueberschrift(doc, 'Vorab-Karte');
    tabelle(doc, null, [['Mechanismus', k.mechanismus || '—'], ['Erwartung', k.erwartung || '—'], ['Erfolgskriterium', k.erfolgskriterium || '—']], [1, 4]);
  }
  ueberschrift(doc, 'Einstellungen');
  tabelle(doc, ['Einstellung', 'Wert'], spezifikation(k, e.parameter).map((z) => [z.name, z.wert]), [2, 3]);

  if (e.typ === 'strategie') {
    ueberschrift(doc, 'Kennzahlen');
    tabelle(doc, ['Kennzahl', 'Wert'], KZ.map(([n, f, txt]) => [n, txt(f(e))]).filter((z) => z[1] !== '—'), [2, 3]);
    ueberschrift(doc, 'Kumulierte R (Backtest, Forward gestrichelt)');
    kurven(doc, [{ kurve: e.kurve, forward: e.forward?.kurve, farbe: FARBEN[0] }]);
    if (e.raster?.length) { ueberschrift(doc, 'Robustheit'); tabelle(doc, ['Prüfung', 'Status', 'Details'], e.raster.map((z) => [z.name, z.status, z.text]), [2, 0.8, 5], { markiere: (i) => (e.raster[i].status === 'ja' ? '#ecfdf5' : e.raster[i].status === 'nein' ? '#fef2f2' : null) }); }
    if (e.trichter && Object.keys(e.trichter).length) { ueberschrift(doc, 'Trichter (wo Setups ausscheiden)'); tabelle(doc, ['Stufe', 'Anzahl'], Object.entries(e.trichter).map(([a, w]) => [TRICHTER_TEXT[a] || a, w]), [3, 1]); }
    if (e.grundAusstieg?.length) { ueberschrift(doc, 'Ausstiege'); tabelle(doc, ['Grund', 'Trades', 'Ø R'], e.grundAusstieg.map((g) => [GRUND[g.schluessel] || g.schluessel, g.n, rt(g.avg)]), [2, 1, 1]); }
    if (e.proJahr?.length) { ueberschrift(doc, 'Pro Jahr'); tabelle(doc, ['Jahr', 'Trades', 'Ø R', 'Treffer'], e.proJahr.map((g) => [g.schluessel, g.n, rt(g.avg), pz(g.quote)]), [1, 1, 1, 1]); }
    if (e.proPaar?.length) { ueberschrift(doc, 'Pro Paar'); tabelle(doc, ['Paar', 'Trades', 'Ø R', 'Treffer'], e.proPaar.map((g) => [g.schluessel, g.n, rt(g.avg), pz(g.quote)]), [1, 1, 1, 1]); }
    const trades = [...(e.trades || []), ...(e.forwardTrades || []).map((x) => ({ ...x, fw: true }))].sort((a, b) => a.tEin - b.tEin);
    if (trades.length) {
      ueberschrift(doc, `Trades (${trades.length}${trades.length > 500 ? ', die letzten 500' : ''})`);
      tabelle(doc, ['Einstieg', 'Paar', 'Seite', 'Einstieg/SL', 'Risiko', 'Ausstieg', 'R'], trades.slice(-500).map((x) => [
        `${datum(x.tEin)}${x.fw ? ' F' : ''}`, x.pair, x.seite > 0 ? 'Long' : 'Short', `${Number(x.ein).toFixed(x.pair.endsWith('JPY') ? 3 : 5)} / ${Number(x.sl).toFixed(x.pair.endsWith('JPY') ? 3 : 5)}`, `${x.risikoPips} Pips`, `${GRUND[x.grund] || x.grund}${x.teil ? ' + Teil' : ''}`, rt(x.r),
      ]), [1.6, 1, 0.8, 2, 1, 1.3, 0.9], { schrift: 7.5 });
    }
  } else if (e.fazit?.zahlen?.length) {
    ueberschrift(doc, 'Kernzahlen');
    tabelle(doc, ['Kennzahl', 'Wert', 'Details'], e.fazit.zahlen.map((z) => [z.titel, z.wert, z.unter]), [2, 1, 3]);
    if (e.raster?.length) { ueberschrift(doc, 'Prüfungen'); tabelle(doc, ['Prüfung', 'Status', 'Details'], e.raster.map((z) => [z.name, z.status, z.text]), [2, 0.8, 5]); }
  }
  fusszeilen(doc);
  doc.end();
  return { datei: `${new Date().toISOString().slice(0, 10)}-${dateiName(k.name || 'lauf')}-v${e.lauf?.v ?? ''}.pdf`, pdf: await fertig };
}

// ---------- Vergleich ----------
export async function laborPdfVergleich(ids) {
  const v = laborVergleich(ids);
  if (v.fehler) return v;
  const S = v.spalten;
  const name = (s) => `${s.name} · v${s.v}${s.art === 'forward' ? ' · Forward' : ''}`;
  const titel = `Vergleich: ${[...new Set(S.map((s) => s.name))].join(' / ')}`;
  const { doc, fertig } = neuesDokument(titel);
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111').text(t(titel));
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(t(`${S.length} Läufe · erstellt ${iso(Date.now())}`));
  doc.moveDown(0.4);
  S.forEach((s, i) => {
    platz(doc, 30);
    const y = doc.y;
    doc.save().rect(doc.page.margins.left, y + 2, 8, 8).fill(FARBEN[i]).restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(t(name(s)), doc.page.margins.left + 14, y, { continued: true })
      .font('Helvetica').fillColor(URTEIL_FARBE[s.urteil] || '#111').text(t(`  ${s.urteil}`), { continued: true }).fillColor('#6b7280').text(t(` – ${s.warum || ''}`));
    if (s.fazit?.satz) doc.fontSize(9).fillColor('#374151').text(t(s.fazit.satz), doc.page.margins.left + 14);
    doc.x = doc.page.margins.left; doc.moveDown(0.2);
  });
  const kopf = ['', ...S.map((s, i) => `${i + 1}: ${name(s)}`)];
  const anteile = [2, ...S.map(() => 2)];
  const diff = v.spezifikation.filter((z) => z.verschieden);
  ueberschrift(doc, `Was ist anders eingestellt? (${diff.length} Unterschiede)`);
  if (diff.length) tabelle(doc, kopf, diff.map((z) => [z.name, ...z.werte]), anteile);
  else doc.font('Helvetica').fontSize(9).fillColor('#374151').text('Keine Unterschiede in der Einstellung.');
  ueberschrift(doc, 'Kennzahlen');
  const KZV = [
    ['Trades', (s) => s.kennzahlen?.n ?? s.n, (x) => (x ?? '—')], ['Unabhängige Fälle', (s) => s.nUnabhaengig, (x) => (x ?? '—')],
    ['Ø R pro Trade', (s) => s.kennzahlen?.avgR, rt, 'hoch'], ['Trefferquote', (s) => s.kennzahlen?.quote, pz, 'hoch'], ['Summe R', (s) => s.kennzahlen?.summeR, (x) => rt(x, 1), 'hoch'],
    ['Profit-Faktor', (s) => s.kennzahlen?.pf, (x) => zahl(x), 'hoch'], ['Max. Drawdown', (s) => s.kennzahlen?.maxDD, (x) => (x === null || x === undefined ? '—' : `${zahl(x, 1)} R`), 'tief'],
    ['Längste Verlustserie', (s) => s.kennzahlen?.verlustSerie, (x) => (x ?? '—'), 'tief'], ['SQN', (s) => s.kennzahlen?.sqn, (x) => zahl(x), 'hoch'],
    ['Median R', (s) => s.kennzahlen?.median, rt, 'hoch'], ['Drawdown 95 % (MC)', (s) => s.monteCarlo?.dd95, (x) => (x === null || x === undefined ? '—' : `${zahl(x, 1)} R`), 'tief'],
    ['Forward Ø R', (s) => s.forward?.kennzahlen?.avgR, rt, 'hoch'], ['Forward Trades', (s) => s.forward?.kennzahlen?.n, (x) => (x ?? '—')],
  ];
  const kzZeilen = [], kzBest = [];
  for (const [n, f, txt, besser] of KZV) {
    const w = S.map(f);
    if (w.every((x) => x === null || x === undefined)) continue;
    const z = w.filter((x) => typeof x === 'number' && Number.isFinite(x));
    kzBest.push(besser && z.length > 1 ? (besser === 'hoch' ? Math.max(...z) : Math.min(...z)) : null);
    kzZeilen.push({ werte: [n, ...w.map((x) => txt(x))], roh: w });
  }
  kzZeilen.push({ werte: ['Trades nur in diesem Lauf', ...v.trades.map((x) => `${x.nurHier} von ${x.gesamt}`)], roh: [] }); kzBest.push(null);
  tabelle(doc, kopf, kzZeilen.map((z) => z.werte), anteile, { fett: (i, j) => j > 0 && kzBest[i] !== null && kzZeilen[i].roh[j - 1] === kzBest[i] });
  ueberschrift(doc, 'Kumulierte R (Forward gestrichelt)');
  kurven(doc, S.map((s, i) => ({ kurve: s.kurve, forward: s.forwardKurve, farbe: FARBEN[i] })));
  const tk = [...new Set(S.flatMap((s) => Object.keys(s.trichter || {})))];
  if (tk.length) { ueberschrift(doc, 'Trichter'); tabelle(doc, kopf, tk.map((k) => [TRICHTER_TEXT[k] || k, ...S.map((s) => s.trichter?.[k] ?? '—')]), anteile); }
  const rid = [...new Map(S.flatMap((s) => s.raster.map((r) => [r.id, r.name]))).entries()];
  if (rid.length) { ueberschrift(doc, 'Robustheit'); tabelle(doc, kopf, rid.map(([id, n]) => [n, ...S.map((s) => s.raster.find((r) => r.id === id)?.status ?? '—')]), anteile); }
  ueberschrift(doc, 'Alle Einstellungen');
  tabelle(doc, kopf, v.spezifikation.map((z) => [z.name, ...z.werte]), anteile, { markiere: (i) => (v.spezifikation[i].verschieden ? '#fef3c7' : null), schrift: 7.5 });
  fusszeilen(doc);
  doc.end();
  return { datei: `${new Date().toISOString().slice(0, 10)}-vergleich-${dateiName(S[0].name)}.pdf`, pdf: await fertig };
}
