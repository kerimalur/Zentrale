// Prüft den gewollten Neustart der Oberfläche (wie nach einem Update): Shell beendet sich mit Code 75,
// das Startskript startet sie sofort neu – ohne Notfall-Sperre –, danach ist sie gesperrt und lässt sich entsperren.
//   node neustarttest.cjs        (CDP_PORT, PIN über Umgebungsvariablen)
const http = require('http');
const CDP = process.env.CDP_PORT || 9223; const PIN = process.env.PIN || '1234';
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
let stufe = 'Start';
setTimeout(() => { console.log(`FEHLER  Neustarttest: Zeitüberschreitung bei «${stufe}»`); process.exit(1); }, 420_000).unref();
const json = (url) => new Promise((ok, nein) => { const q = http.get(url, { timeout: 5000 }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { ok(JSON.parse(t)); } catch (e) { nein(e); } }); }); q.on('timeout', () => { q.destroy(); nein(new Error('keine Antwort')); }); q.on('error', nein); });
const seite = async () => (await json(`http://127.0.0.1:${CDP}/json`)).find((x) => x.type === 'page' && x.url.includes('index.html') && !x.url.includes('ebene=1'));
async function verbinde(ziel) {
  const ws = new WebSocket(ziel.webSocketDebuggerUrl.replace(/127\.0\.0\.1:\d+|localhost:\d+/, `127.0.0.1:${CDP}`)); let nr = 0; const offen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d.result || d.error); offen.delete(d.id); } };
  await new Promise((r, n) => { ws.onopen = r; ws.onerror = n; setTimeout(() => n(new Error('DevTools-Verbindung kommt nicht zustande')), 15_000); });
  const js = (code, warten = true) => new Promise((ok) => { const id = ++nr; const t = setTimeout(() => { offen.delete(id); ok({ zeit: true }); }, 60_000);
    offen.set(id, (a) => { clearTimeout(t); ok(a?.result?.value ?? a); }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `(async () => { ${code} })()`, awaitPromise: warten, returnByValue: true } })); });
  return { ws, js };
}
(async () => {
  stufe = 'alte Oberfläche finden'; const alt = await seite(); if (!alt) { console.log('FEHLER  Neustart: Shell nicht erreichbar'); process.exit(1); }
  const a = await verbinde(alt);
  const vorher = await a.js(`return (await Z.sys.prozesse()).liste?.filter((p) => /electron/.test(p.name || p.befehl || '')).length ?? -1`);
  stufe = 'Neustart auslösen'; a.js('Z.system.neustart(); return 1', false); await schlaf(1500); try { a.ws.close(); } catch {}
  let neu = null; const start = Date.now();
  while (Date.now() - start < 180_000) { await schlaf(2000); try { const s = await seite(); if (s && s.id !== alt.id) { neu = s; break; } } catch {} }
  if (!neu) { console.log('FEHLER  Neustart der Oberfläche: kam nicht zurück'); process.exit(1); }
  stufe = 'mit neuer Oberfläche verbinden'; const b = await verbinde(neu); stufe = 'auf Bereitschaft warten';
  for (let n = 0; n < 60; n++) { if (await b.js(`return typeof Schreibtisch !== 'undefined' && !!Schreibtisch.zustand.version`) === true) break; await schlaf(1500); }
  stufe = 'Sperre und Entsperren prüfen'; const dauer = Math.round((Date.now() - start) / 1000);
  const r = await b.js(`const gesperrt = !document.querySelector('#sperre').hidden; const p = (await Z.sys.prozesse()).liste || []; const notfall = p.some((x) => /swaylock|notfall/.test((x.name || '') + ' ' + (x.befehl || '')));
    const a = await Z.anmelden('${PIN}', null, 'pin'); await warte(2500); return { gesperrt, notfall, entsperrt: a.ok && document.querySelector('#sperre').hidden, symbole: document.querySelectorAll('.fl-symbol').length }`);
  const ok = r && r.gesperrt === true && r.notfall === false && r.entsperrt === true && r.symbole > 0;
  console.log(`${ok ? 'OK     ' : 'FEHLER '} Oberfläche startet nach Update neu (${dauer} s), ohne Notfall-Sperre, gesperrt, Code entsperrt  [${JSON.stringify({ vorher, ...r })}]`);
  try { b.ws.close(); } catch {}
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FEHLER  Neustarttest abgebrochen: ' + e.message); process.exit(1); });
