// Volumenprofil für die Confluence «POC / Value Area» (Kerims Regel):
//   Long : Profil vom GVA-Hit bis zum Hoch (= Fib 0 %). POC oder Value Area LOW in der Fib-Box zählt als Confluence.
//   Short: Profil vom GVA-Hit bis zum Tief. POC oder Value Area HIGH in der Fib-Box zählt als Confluence.
//
// WICHTIG – Datenlage: Die gespeicherten Kursdaten (HistData/Dukascopy) enthalten kein Volumen. HistData liefert bei Forex in der
// Volumen-Spalte immer 0, und die Dukascopy-Dateien werden beim Speichern auf Open/High/Low/Close gekürzt. Darum wird hier – wie bei
// einem Market-Profile (TPO) – «Zeit auf Preis» benutzt: jede Basis-Kerze (5 Min, sonst 1 Std) zählt gleich viel und verteilt ihr
// Gewicht gleichmässig über ihre Spanne Low–High. Das ist ein Ersatz, kein echtes Tick-Volumen; POC und Value Area können deshalb
// leicht von TradingView abweichen (dort rechnet der Broker-Feed mit Tick-Volumen). Wird später echtes Volumen gespeichert, muss nur
// das Gewicht `gew` unten ersetzt werden (z. B. durch das Volumen der Kerze).
//
// Berechnung (wie TradingView «Volume Profile»): feste Zahl Zeilen über die Spanne, Value Area = Anteil des Gesamtgewichts um den POC,
// erweitert um jeweils das stärkere der nächsten zwei Zeilen oben oder unten.

// basis: Basis-Kerzen (Typed Arrays h, l); iVon/iBis: Basis-Indizes, beide eingeschlossen.
export function profil(basis, iVon, iBis, zeilen = 24, vaProzent = 70) {
  if (!(iBis >= iVon) || iVon < 0 || iBis >= basis.n) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = iVon; i <= iBis; i++) { if (basis.l[i] < lo) lo = basis.l[i]; if (basis.h[i] > hi) hi = basis.h[i]; }
  if (!(hi > lo)) return null;
  const n = Math.max(4, Math.min(200, Math.round(zeilen)));
  const hoehe = (hi - lo) / n;
  const v = new Float64Array(n);
  for (let i = iVon; i <= iBis; i++) {
    const l = basis.l[i], h = basis.h[i];
    const z0 = Math.min(n - 1, Math.floor((l - lo) / hoehe)), z1 = Math.min(n - 1, Math.floor((h - lo) / hoehe));
    if (!(h > l)) { v[z0] += 1; continue; } // Kerze ohne Spanne: ihr ganzes Gewicht liegt in einer Zeile
    const gew = 1 / (h - l); // Gewicht pro Preiseinheit (jede Kerze zählt 1)
    for (let z = z0; z <= z1; z++) {
      const a = Math.max(l, lo + z * hoehe), b = Math.min(h, lo + (z + 1) * hoehe);
      if (b > a) v[z] += (b - a) * gew;
    }
  }
  let gesamt = 0, poc = 0;
  for (let z = 0; z < n; z++) { gesamt += v[z]; if (v[z] > v[poc]) poc = z; }
  if (!(gesamt > 0)) return null;
  // Value Area um den POC
  const ziel = (gesamt * Math.min(99, Math.max(10, vaProzent))) / 100;
  let a = poc, b = poc, summe = v[poc];
  while (summe < ziel && (a > 0 || b < n - 1)) {
    const oben = b < n - 1 ? v[b + 1] + (b + 2 < n ? v[b + 2] : 0) : -1;
    const unten = a > 0 ? v[a - 1] + (a - 2 >= 0 ? v[a - 2] : 0) : -1;
    if (oben >= unten) { summe += oben; b = Math.min(n - 1, b + 2); }
    else { summe += unten; a = Math.max(0, a - 2); }
  }
  const max = v[poc];
  return {
    art: 'zeit', iVon, iBis, tVon: basis.t[iVon], tBis: basis.t[iBis], lo, hi, hoehe,
    // normiert auf den POC (1 = längster Balken), 3 Stellen – genug für die Anzeige und klein im Ergebnis
    v: Array.from(v, (x) => Number((x / max).toFixed(3))),
    poc: lo + (poc + 0.5) * hoehe, vah: lo + (b + 1) * hoehe, val: lo + a * hoehe,
    zeilePoc: poc, zeileVa: [a, b],
  };
}

// Für info im Trade: kompakt (Preise auf 5 Stellen)
export function profilKurz(p) {
  if (!p) return null;
  const r = (x) => Number(x.toFixed(5));
  return { art: p.art, tVon: p.tVon, tBis: p.tBis, lo: r(p.lo), hoehe: Number(p.hoehe.toPrecision(6)), v: p.v, poc: r(p.poc), vah: r(p.vah), val: r(p.val), zeilePoc: p.zeilePoc, zeileVa: p.zeileVa };
}
