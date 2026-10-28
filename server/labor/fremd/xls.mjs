// Kleiner Leser für alte Excel-Dateien (.xls, BIFF8 in einem OLE-Container), wie sie EIA und der GPR-Index liefern.
// Liest pro Blatt alle Zellen mit Zahlen und Texten (SST, LABELSST, LABEL, NUMBER, RK, MULRK, FORMULA mit Zahlenergebnis).
// Ohne Fremdbibliothek: die Dateien kommen nur von bekannten Quellen, und jede Länge wird gegen die Puffergrenze geprüft.

const ENDE = 0xfffffffe, FREI = 0xffffffff;

function oleStream(buf, gesucht) {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) throw new Error('XLS: keine Excel-97-Datei');
  const sekGr = 1 << buf.readUInt16LE(0x1e);
  const miniGr = 1 << buf.readUInt16LE(0x20);
  const dirStart = buf.readUInt32LE(0x30);
  const miniCut = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3c);
  let difStart = buf.readUInt32LE(0x44);
  const difAnzahl = buf.readUInt32LE(0x48);
  const sektor = (s) => { const p = 512 + s * sekGr; if (p + sekGr > buf.length + sekGr) throw new Error('XLS: Sektor ausserhalb'); return p; };
  // DIFAT → Liste der FAT-Sektoren
  const fatSek = [];
  for (let i = 0; i < 109; i++) { const s = buf.readUInt32LE(0x4c + i * 4); if (s !== FREI && s !== ENDE) fatSek.push(s); }
  for (let d = 0; d < difAnzahl && difStart !== ENDE && difStart !== FREI; d++) {
    const p = sektor(difStart);
    for (let i = 0; i < sekGr / 4 - 1; i++) { const s = buf.readUInt32LE(p + i * 4); if (s !== FREI && s !== ENDE) fatSek.push(s); }
    difStart = buf.readUInt32LE(p + sekGr - 4);
  }
  const fat = new Uint32Array(fatSek.length * (sekGr / 4));
  fatSek.forEach((s, x) => { const p = sektor(s); for (let i = 0; i < sekGr / 4; i++) fat[x * (sekGr / 4) + i] = p + i * 4 + 4 <= buf.length ? buf.readUInt32LE(p + i * 4) : FREI; });
  const kette = (start, max = 1e7) => {
    const out = [];
    for (let s = start, n = 0; s !== ENDE && s !== FREI && s < fat.length && n < max; s = fat[s], n++) out.push(s);
    return out;
  };
  const lesenKette = (start) => {
    const teile = kette(start).map((s) => { const p = sektor(s); return buf.subarray(p, Math.min(p + sekGr, buf.length)); });
    return Buffer.concat(teile);
  };
  const dir = lesenKette(dirStart);
  const eintraege = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const nl = dir.readUInt16LE(p + 0x40);
    const name = dir.toString('utf16le', p, p + Math.max(0, nl - 2));
    eintraege.push({ name, typ: dir[p + 0x42], start: dir.readUInt32LE(p + 0x74), groesse: dir.readUInt32LE(p + 0x78) });
  }
  const root = eintraege.find((e) => e.typ === 5);
  const e = eintraege.find((x) => x.typ === 2 && gesucht.includes(x.name));
  if (!e) throw new Error('XLS: kein Workbook-Stream');
  if (e.groesse >= miniCut) return lesenKette(e.start).subarray(0, e.groesse);
  // kleiner Stream: aus dem Mini-Stream lesen
  const miniStream = lesenKette(root.start);
  const miniFatBuf = lesenKette(miniFatStart);
  const miniFat = (s) => (s * 4 + 4 <= miniFatBuf.length ? miniFatBuf.readUInt32LE(s * 4) : ENDE);
  const teile = [];
  for (let s = e.start, n = 0; s !== ENDE && s !== FREI && n < 1e6; s = miniFat(s), n++) teile.push(miniStream.subarray(s * miniGr, s * miniGr + miniGr));
  return Buffer.concat(teile).subarray(0, e.groesse);
}

// RK-Zahl (komprimierte Zahl in Excel)
function rk(v) {
  let n;
  if (v & 2) n = v >> 2;
  else { const b = Buffer.alloc(8); b.writeUInt32LE(v & 0xfffffffc, 4); n = b.readDoubleLE(0); }
  return v & 1 ? n / 100 : n;
}

// Liest einen Unicode-String (BIFF8) ab Position p eines «Datenstroms» aus Record-Stücken (für SST mit CONTINUE).
function sstLesen(stuecke) {
  const strings = [];
  let si = 0, p = 0;
  const cur = () => stuecke[si];
  const weiter = () => { si++; p = 0; };
  const u8 = () => { if (p >= cur().length) weiter(); return cur()[p++]; };
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  if (!stuecke.length) return strings;
  u32(); const anzahl = u32();
  for (let i = 0; i < anzahl && si < stuecke.length; i++) {
    const zeichen = u16();
    let flag = u8();
    let rt = 0, ext = 0;
    if (flag & 0x08) rt = u16();
    if (flag & 0x04) ext = u32();
    let s = '';
    let rest = zeichen;
    while (rest > 0) {
      if (p >= cur().length) { weiter(); if (si >= stuecke.length) break; flag = u8(); }
      const breit = flag & 0x01;
      const verfuegbar = Math.floor((cur().length - p) / (breit ? 2 : 1));
      const n = Math.min(rest, verfuegbar);
      s += breit ? cur().toString('utf16le', p, p + n * 2) : cur().toString('latin1', p, p + n);
      p += n * (breit ? 2 : 1);
      rest -= n;
    }
    for (let k = 0; k < rt * 4 + ext; k++) u8();
    strings.push(s);
  }
  return strings;
}

// Gibt { blaetter: [{ name, zeilen: Array<Array<number|string|null>> }] } zurück.
export function xlsLesen(buf) {
  const wb = oleStream(buf, ['Workbook', 'Book']);
  const records = [];
  for (let p = 0; p + 4 <= wb.length;) {
    const typ = wb.readUInt16LE(p), len = wb.readUInt16LE(p + 2);
    records.push({ typ, pos: p, daten: wb.subarray(p + 4, Math.min(p + 4 + len, wb.length)) });
    p += 4 + len;
  }
  // SST (+ CONTINUE) und Blätter
  let sst = [];
  const blaetter = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.typ === 0x00fc) {
      const stuecke = [r.daten];
      for (let j = i + 1; j < records.length && records[j].typ === 0x003c; j++) stuecke.push(records[j].daten);
      try { sst = sstLesen(stuecke); } catch { sst = []; }
    } else if (r.typ === 0x0085 && r.daten.length >= 8) {
      const off = r.daten.readUInt32LE(0), nl = r.daten[6], breit = r.daten[7] & 1;
      const name = breit ? r.daten.toString('utf16le', 8, 8 + nl * 2) : r.daten.toString('latin1', 8, 8 + nl);
      blaetter.push({ name, off });
    }
  }
  const nachPos = new Map(records.map((r, i) => [r.pos, i]));
  return {
    blaetter: blaetter.map((b) => {
      const zeilen = [];
      const setze = (row, col, v) => { (zeilen[row] ||= [])[col] = v; };
      let i = nachPos.get(b.off);
      if (i === undefined) return { name: b.name, zeilen };
      for (i++; i < records.length; i++) {
        const { typ, daten: d } = records[i];
        if (typ === 0x000a) break; // EOF
        if (d.length < 6) continue;
        const row = d.readUInt16LE(0), col = d.readUInt16LE(2);
        if (typ === 0x0203 && d.length >= 14) setze(row, col, d.readDoubleLE(6));
        else if (typ === 0x027e && d.length >= 10) setze(row, col, rk(d.readUInt32LE(6)));
        else if (typ === 0x00fd && d.length >= 10) setze(row, col, sst[d.readUInt32LE(6)] ?? null);
        else if (typ === 0x00bd) { const last = d.readUInt16LE(d.length - 2); for (let c = col, p = 4; c <= last && p + 6 <= d.length - 2; c++, p += 6) setze(row, c, rk(d.readUInt32LE(p + 2))); }
        else if (typ === 0x0006 && d.length >= 14) { if (d.readUInt16LE(12) !== 0xffff) setze(row, col, d.readDoubleLE(6)); }
        else if (typ === 0x0204 && d.length >= 9) { const n = d.readUInt16LE(6), breit = d[8] & 1; setze(row, col, breit ? d.toString('utf16le', 9, 9 + n * 2) : d.toString('latin1', 9, 9 + n)); }
      }
      return { name: b.name, zeilen };
    }),
  };
}

// Excel-Seriennummer → Unix-Sekunden (UTC, Mitternacht)
export const excelDatum = (x) => Math.round(((x < 61 ? x + 1 : x) - 25569) * 86400); // Excel zählt den 29.2.1900 mit
