// Kleines DevTools-Werkzeug für Oberflächentests: node cdp.js '<JS-Ausdruck>' [bild.png]
// Führt den Ausdruck in der Shell aus (await möglich) und speichert optional ein Bildschirmfoto.
const http = require('http'); const fs = require('fs');
const port = process.env.CDP_PORT || 9333;
http.get(`http://127.0.0.1:${port}/json`, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', async () => {
  const ziel = JSON.parse(t).find((x) => x.type === 'page' && x.url.includes('index.html'));
  const ws = new WebSocket(ziel.webSocketDebuggerUrl); let nr = 0; const offen = new Map();
  const ruf = (method, params = {}) => new Promise((ok) => { const id = ++nr; offen.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d.result || d.error); offen.delete(d.id); } };
  ws.onopen = async () => {
    const a = await ruf('Runtime.evaluate', { expression: `(async () => { ${process.argv[2]} })()`, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(a.result?.value ?? a.exceptionDetails?.exception?.description ?? a));
    if (process.argv[3]) { await new Promise((r) => setTimeout(r, Number(process.env.WARTE || 900))); const b = await ruf('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(process.argv[3], Buffer.from(b.data, 'base64')); }
    ws.close();
  };
}); });
