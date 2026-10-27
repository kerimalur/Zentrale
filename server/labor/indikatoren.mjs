// Indikatoren auf Zeitrahmen-Kerzen. Wert an Index k nutzt nur Kerzen bis einschliesslich k (bekannt am Schluss von k).
export function sma(werte, n) {
  const out = new Float64Array(werte.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < werte.length; i++) {
    s += werte[i];
    if (i >= n) s -= werte[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

// ATR wie ta.atr (RMA)
export function atr(z, n = 14) {
  const out = new Float64Array(z.n).fill(NaN);
  let a = NaN, s = 0;
  for (let i = 0; i < z.n; i++) {
    const tr = i === 0 ? z.h[i] - z.l[i] : Math.max(z.h[i] - z.l[i], Math.abs(z.h[i] - z.c[i - 1]), Math.abs(z.l[i] - z.c[i - 1]));
    if (i < n) { s += tr; if (i === n - 1) a = s / n; }
    else a = (a * (n - 1) + tr) / n;
    out[i] = a;
  }
  return out;
}

// RSI (Wilder)
export function rsi(c, n = 14) {
  const out = new Float64Array(c.length).fill(NaN);
  let auf = 0, ab = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const u = d > 0 ? d : 0, v = d < 0 ? -d : 0;
    if (i <= n) { auf += u; ab += v; if (i === n) { auf /= n; ab /= n; out[i] = ab === 0 ? 100 : 100 - 100 / (1 + auf / ab); } }
    else { auf = (auf * (n - 1) + u) / n; ab = (ab * (n - 1) + v) / n; out[i] = ab === 0 ? 100 : 100 - 100 / (1 + auf / ab); }
  }
  return out;
}

// Höchstes Hoch / tiefstes Tief der n Kerzen VOR k (ohne k selbst) – für Ausbrüche
export function hoechstesVorher(h, n) {
  const out = new Float64Array(h.length).fill(NaN);
  const q = []; // Indizes, absteigende Werte
  for (let i = 0; i < h.length; i++) {
    if (i >= n) out[i] = h[q[0]];
    while (q.length && h[q[q.length - 1]] <= h[i]) q.pop();
    q.push(i);
    while (q[0] <= i - n) q.shift();
  }
  return out;
}
export function tiefstesVorher(l, n) {
  const out = new Float64Array(l.length).fill(NaN);
  const q = [];
  for (let i = 0; i < l.length; i++) {
    if (i >= n) out[i] = l[q[0]];
    while (q.length && l[q[q.length - 1]] >= l[i]) q.pop();
    q.push(i);
    while (q[0] <= i - n) q.shift();
  }
  return out;
}

// Swings (Fractal): Hoch an k ist höher als die N Kerzen links und mindestens so hoch wie die N rechts.
// Bekannt erst am Schluss von k + N. Ergebnis: Listen { k (Pivot), bekannt (Index, ab dem er gilt), preis }.
export function swings(z, N = 2) {
  const hoch = [], tief = [];
  for (let k = N; k + N < z.n; k++) {
    let istH = true, istT = true;
    for (let j = 1; j <= N && (istH || istT); j++) {
      if (!(z.h[k] > z.h[k - j]) || !(z.h[k] >= z.h[k + j])) istH = false;
      if (!(z.l[k] < z.l[k - j]) || !(z.l[k] <= z.l[k + j])) istT = false;
    }
    if (istH) hoch.push({ k, bekannt: k + N, preis: z.h[k] });
    if (istT) tief.push({ k, bekannt: k + N, preis: z.l[k] });
  }
  return { hoch, tief };
}
