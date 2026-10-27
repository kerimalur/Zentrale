// Kleiner LZMA-Entpacker («LZMA alone»-Format, wie es Dukascopy für .bi5-Dateien benutzt).
// Nach der Referenz-Beschreibung LzmaSpec von Igor Pavlov; ohne Abhängigkeiten.
const PROB_INIT = 1024;
const TOP = 1 << 24;

export function lzmaEntpacken(buf) {
  if (buf.length < 13) throw new Error('LZMA: Datei zu kurz');
  let d = buf[0];
  if (d >= 9 * 5 * 5) throw new Error('LZMA: falsche Eigenschaften');
  const lc = d % 9; d = Math.floor(d / 9);
  const lp = d % 5; const pb = Math.floor(d / 5);
  let dictSize = buf.readUInt32LE(1);
  if (dictSize < 4096) dictSize = 4096;
  const lo = buf.readUInt32LE(5), hi = buf.readUInt32LE(9);
  const groesseBekannt = !(lo === 0xffffffff && hi === 0xffffffff);
  let rest = groesseBekannt ? hi * 2 ** 32 + lo : Infinity;

  // ---- Bereichs-Decoder ----
  let pos = 13;
  const byte = () => (pos < buf.length ? buf[pos++] : 0);
  if (byte() !== 0) throw new Error('LZMA: kaputter Datenstrom');
  let range = 0xffffffff;
  let code = 0;
  for (let i = 0; i < 4; i++) code = code * 256 + byte();
  if (code === range) throw new Error('LZMA: kaputter Datenstrom');
  const norm = () => { if (range < TOP) { range = range * 256; code = code * 256 + byte(); } };
  const bit = (p, i) => {
    const v = p[i];
    const bound = (range >>> 11) * v;
    if (code < bound) { p[i] = v + ((2048 - v) >>> 5); range = bound; norm(); return 0; }
    p[i] = v - (v >>> 5); code -= bound; range -= bound; norm(); return 1;
  };
  const direkt = (n) => {
    let r = 0;
    for (let i = 0; i < n; i++) {
      range = range >>> 1;
      let b = 0;
      if (code >= range) { code -= range; b = 1; }
      r = r * 2 + b;
      norm();
    }
    return r;
  };
  const baum = (p, off, n) => { let m = 1; for (let i = 0; i < n; i++) m = (m << 1) + bit(p, off + m); return m - (1 << n); };
  const baumRueck = (p, off, n) => { let m = 1, s = 0; for (let i = 0; i < n; i++) { const b = bit(p, off + m); m = (m << 1) + b; s |= b << i; } return s; };
  const neu = (n) => new Uint16Array(n).fill(PROB_INIT);

  // ---- Wahrscheinlichkeiten ----
  const literal = neu(0x300 << (lc + lp));
  const isMatch = neu(12 << 4), isRep = neu(12), isRepG0 = neu(12), isRepG1 = neu(12), isRepG2 = neu(12), isRep0Long = neu(12 << 4);
  const posSlot = neu(4 << 6), posDec = neu(115), align = neu(16);
  const laenge = () => ({ c: neu(2), low: neu(16 << 3), mid: neu(16 << 3), high: neu(256) });
  const lenDec = laenge(), repLenDec = laenge();
  const lenLesen = (L, ps) => {
    if (bit(L.c, 0) === 0) return baum(L.low, ps << 3, 3);
    if (bit(L.c, 1) === 0) return 8 + baum(L.mid, ps << 3, 3);
    return 16 + baum(L.high, 0, 8);
  };
  const distanz = (len) => {
    const ls = len > 3 ? 3 : len;
    const slot = baum(posSlot, ls << 6, 6);
    if (slot < 4) return slot;
    const nBits = (slot >>> 1) - 1;
    let dist = (2 | (slot & 1)) * 2 ** nBits;
    if (slot < 14) dist += baumRueck(posDec, dist - slot, nBits);
    else dist += direkt(nBits - 4) * 16 + baumRueck(align, 0, 4);
    return dist;
  };

  // ---- Ausgabe (wächst bei Bedarf) ----
  let out = Buffer.allocUnsafe(groesseBekannt ? Math.max(1, rest) : Math.max(65536, buf.length * 8));
  let n = 0;
  const schreiben = (b) => {
    if (n >= out.length) { const g = Buffer.allocUnsafe(out.length * 2); out.copy(g, 0, 0, n); out = g; }
    out[n++] = b;
  };

  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  for (;;) {
    if (groesseBekannt && rest === 0 && code === 0) break; // fertig ohne Endmarke
    const ps = n & ((1 << pb) - 1);
    if (bit(isMatch, (state << 4) + ps) === 0) {
      if (rest === 0) throw new Error('LZMA: zu viele Daten');
      const prev = n > 0 ? out[n - 1] : 0;
      const ls = ((n & ((1 << lp) - 1)) << lc) + (prev >>> (8 - lc));
      const off = 0x300 * ls;
      let s = 1;
      if (state >= 7) {
        let mb = out[n - rep0 - 1];
        do {
          const m = (mb >>> 7) & 1;
          mb <<= 1;
          const b = bit(literal, off + ((1 + m) << 8) + s);
          s = (s << 1) | b;
          if (m !== b) break;
        } while (s < 0x100);
      }
      while (s < 0x100) s = (s << 1) | bit(literal, off + s);
      schreiben(s - 0x100);
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      rest--;
      continue;
    }
    let len;
    if (bit(isRep, state) !== 0) {
      if (rest === 0 || n === 0) throw new Error('LZMA: kaputter Datenstrom');
      if (bit(isRepG0, state) === 0) {
        if (bit(isRep0Long, (state << 4) + ps) === 0) {
          state = state < 7 ? 9 : 11;
          schreiben(out[n - rep0 - 1]);
          rest--;
          continue;
        }
      } else {
        let dist;
        if (bit(isRepG1, state) === 0) dist = rep1;
        else {
          if (bit(isRepG2, state) === 0) dist = rep2;
          else { dist = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0; rep0 = dist;
      }
      len = lenLesen(repLenDec, ps);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = lenLesen(lenDec, ps);
      state = state < 7 ? 7 : 10;
      rep0 = distanz(len);
      if (rep0 === 0xffffffff) break; // Endmarke
      if (rest === 0 || rep0 >= n) throw new Error('LZMA: kaputter Datenstrom');
    }
    len += 2;
    for (let i = 0; i < len; i++) {
      if (rest === 0) { if (groesseBekannt) break; }
      schreiben(out[n - rep0 - 1]);
      rest--;
    }
  }
  return out.subarray(0, n);
}
