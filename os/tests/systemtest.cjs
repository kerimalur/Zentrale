// Systemtests im laufenden ZentraleOS (VM im Testmodus): bedient die Shell über DevTools
// und prüft von aussen, ob die Wirkung im System wirklich eintritt.
//   node systemtest.cjs <ausgabeordner>      (CDP_PORT, HTTP_PORT, ADMIN_PW, LANGSAM über Umgebungsvariablen)
const http = require('http'); const fs = require('fs'); const path = require('path');
const AUS = process.argv[2] || '.'; const CDP = process.env.CDP_PORT || 9223; const HTTP_PORT = process.env.HTTP_PORT || 8099;
const PW = process.env.ADMIN_PW || 'zentrale'; const LANGSAM = Number(process.env.LANGSAM || 1);
const warte = (ms) => new Promise((r) => setTimeout(r, ms * LANGSAM));
const zeilen = []; let fehler = 0;
function pruefe(name, ok, detail = '') { if (!ok) fehler++; const z = `${ok ? 'OK     ' : 'FEHLER '} ${name}${detail ? '  [' + String(detail).replace(/\s+/g, ' ').slice(0, 160) + ']' : ''}`; zeilen.push(z); console.log(z); }
function hinweis(name, detail) { const z = `INFO    ${name}  [${String(detail).replace(/\s+/g, ' ').slice(0, 200)}]`; zeilen.push(z); console.log(z); }
const hole = (url, ms = 5000) => new Promise((ok) => { const r = http.get(url, { timeout: ms }, (a) => { a.resume(); ok(a.statusCode); }); r.on('timeout', () => { r.destroy(); ok(0); }); r.on('error', () => ok(0)); });
const json = (url) => new Promise((ok, nein) => { http.get(url, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { ok(JSON.parse(t)); } catch (e) { nein(e); } }); }).on('error', nein); });

async function verbinden() {
  for (let n = 0; n < 60; n++) {
    try { const z = (await json(`http://127.0.0.1:${CDP}/json`)).find((x) => x.type === 'page' && x.url.includes('index.html')); if (z) return z; } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('DevTools der Shell nicht erreichbar');
}

(async () => {
  const ziel = await verbinden();
  const ws = new WebSocket(ziel.webSocketDebuggerUrl.replace(/127\.0\.0\.1:\d+|localhost:\d+/, `127.0.0.1:${CDP}`)); let nr = 0; const offen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d.result || d.error); offen.delete(d.id); } };
  await new Promise((r, n) => { ws.onopen = r; ws.onerror = n; });
  const ruf = (method, params = {}) => new Promise((ok) => { const id = ++nr; offen.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (code) => { const a = await ruf('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }); if (a.exceptionDetails) return { ausnahme: a.exceptionDetails.exception?.description || 'Fehler' }; return a.result?.value; };
  const foto = async (name) => { await warte(900); const b = await ruf('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(AUS, name + '.png'), Buffer.from(b.data, 'base64')); };

  // --- Anmeldung ---
  for (let n = 0; n < 40; n++) { const bereit = await js(`return typeof Schreibtisch !== 'undefined' && !!Schreibtisch.zustand.version && !!document.querySelector('#menueleiste').children.length`); if (bereit === true) break; await warte(1500); }
  await warte(1500);
  let r = await js(`return { gesperrt: !document.querySelector('#sperre').hidden, demo: Schreibtisch.zustand.demo }`);
  pruefe('Nach dem Start gesperrt (Anmeldebildschirm)', r.gesperrt === true); await foto('10-sperrbildschirm');
  r = await js(`const a = await Z.anmelden('0000', null, 'pin'); const b = await Z.anmelden('1234', null, 'pin'); await warte(2500); return { falsch: a.ok, richtig: b.ok, gesperrt: !document.querySelector('#sperre').hidden }`);
  pruefe('Falscher PIN wird abgelehnt', r.falsch === false); pruefe('Anmeldung per PIN', r.richtig === true && r.gesperrt === false); await foto('11-schreibtisch');

  // --- Zentrale-App (Demo) im Fenster ---
  r = await js(`FM.schliessenAlle(); for (const t of ['Übersicht', 'Trading']) ZentraleFenster.oeffnen(t); await warte(${4000 * LANGSAM}); return [...ZentraleFenster.offen.entries()].map(([k, e]) => k + ':' + e.rahmen.classList.contains('da'))`);
  pruefe('Zentrale-Apps laden im Fenster (iframe, Demo)', Array.isArray(r) && r.length === 2 && r.every((x) => x.endsWith('true')), JSON.stringify(r)); await foto('12-zentrale-apps');

  // --- System-Infos ---
  r = await js(`const i = await Z.sys.info(); const w = await Z.sys.wlan(); const t = await Z.sys.ton(); const z = await Z.sys.zeit(); const a = await Z.sys.anzeige(); const k = await Z.sys.tastatur(); const p = await Z.sys.programme(); const ts = await Z.sys.tailscale(); const e = await Z.sys.energie(); const b = await Z.sys.bluetooth();
    return { name: i.name, live: i.live, benutzer: i.benutzer, wlanOk: w.ok, geraete: (w.geraete || []).map((g) => g.name + ':' + g.zustand), ton: t, zeitzone: z.zeitzone, anzeige: a.ok ? a.bildschirme.map((b) => b.name + ' ' + (b.modi.find((m) => m.aktiv) || {}).breite) : a.fehler, layout: k, programme: p.liste.map((x) => x.id), tailscale: ts.ok ? ts.zustand : ts.fehler, energie: e, bluetooth: b }`);
  hinweis('Systemdaten', JSON.stringify(r));
  pruefe('System meldet sich als ZentraleOS', /ZentraleOS/.test(r.name || ''), r.name); pruefe('Benutzer ist nicht root', r.benutzer && r.benutzer !== 'root', r.benutzer);
  pruefe('Netzwerk (NetworkManager) antwortet', r.wlanOk === true, JSON.stringify(r.geraete)); pruefe('Zeitzone Europe/Zurich', r.zeitzone === 'Europe/Zurich', r.zeitzone);
  pruefe('Tastaturlayout Schweiz', r.layout && r.layout.layout === 'ch' && r.layout.aktiv === 'ch', JSON.stringify(r.layout)); pruefe('Anzeige lesbar (wlr-randr)', Array.isArray(r.anzeige), JSON.stringify(r.anzeige));
  pruefe('Tailscale installiert', r.tailscale !== undefined && !/nicht installiert/.test(String(r.tailscale)), r.tailscale); pruefe('Programmliste enthält Chromium', (r.programme || []).includes('chromium'), (r.programme || []).join(','));
  hinweis('Ton (PipeWire)', JSON.stringify(r.ton));

  // --- Rechte: kein Root ohne Passwort ---
  r = await js(`const a = await Z.sys.root('pruefen', [], null); const b = await Z.sys.root('pruefen', [], 'ganz-falsch'); const c = await Z.sys.root('pruefen', [], '${PW}'); const d = await Z.sys.root('nicht-erlaubt', [], '${PW}'); await Z.sys.rootVergessen(); const e = await Z.sys.root('pruefen', [], null); return { ohne: a, falsch: b, richtig: c, fremd: d, nachVergessen: e }`);
  pruefe('Root-Aktion ohne Passwort wird abgelehnt', r.ohne.ok === false && r.ohne.passwortNoetig === true); pruefe('Falsches Administrator-Passwort wird abgelehnt', r.falsch.ok === false, r.falsch.fehler);
  pruefe('Mit Administrator-Passwort erlaubt', r.richtig.ok === true, r.richtig.fehler); pruefe('Unbekannte Root-Aktion wird abgelehnt', r.fremd.ok === false); pruefe('Nach «Freigabe vergessen» wieder Passwort nötig', r.nachVergessen.passwortNoetig === true);

  // --- Terminal: echter Befehl, sudo nur mit Passwort ---
  r = await js(`window.__t = ''; Z.auf('terminal:daten', (d) => { if (d.id === 'test') window.__t += d.daten || ''; }); await Z.sys.terminalStarten('test', {}); await warte(${1500 * LANGSAM});
    await Z.sys.terminalEingabe('test', 'echo MARKE-$((6*7)); whoami; sudo -k; sudo -n true 2>&1 | head -1; echo ${PW} | sudo -S -p "" id -u; python3 -m http.server ${HTTP_PORT} >/dev/null 2>&1 &\\n'); await warte(${4000 * LANGSAM}); return window.__t`);
  pruefe('Terminal führt Befehle aus', /MARKE-42/.test(r), ''); pruefe('Terminal: sudo ohne Passwort scheitert', /Passwort ist notwendig|password is required/i.test(r)); pruefe('Terminal: sudo mit Passwort gibt Root (uid 0)', /(^|[\r\n])0[\r\n]/.test(r), r.slice(-200));
  await js(`FM.schliessenAlle(); TerminalApp.oeffnen(); await warte(${1500 * LANGSAM}); await Z.sys.terminalEingabe('terminal-' + TerminalApp.zaehler, 'uname -a; cat /etc/os-release | head -2\\n');`); await foto('13-terminal');

  // --- Firewall: Wirkung von aussen, Rücknahme-Sicherheitsnetz ---
  const aussen = () => hole(`http://127.0.0.1:${HTTP_PORT}/`);
  pruefe('Firewall: Port von aussen verworfen (Standard)', (await aussen()) === 0);
  const regel = `{ an: true, profil: 'zuhause', regeln: [{ port: '${HTTP_PORT}', protokoll: 'tcp', quelle: '', aktion: 'erlauben' }] }`;
  r = await js(`return await Z.sys.firewallSetzen(${regel}, '${PW}')`); pruefe('Firewall: Regel setzen (mit Passwort)', r.ok === true, r.fehler); await warte(2500);
  pruefe('Firewall: Port nach Regel von aussen erreichbar', (await aussen()) === 200);
  r = await js(`return (await Z.sys.firewall())`); pruefe('Firewall: Änderung wartet auf Bestätigung', r.ausstehend === true);
  console.log('        … warte 70 s ohne Bestätigung (Rücknahme) …'); await new Promise((x) => setTimeout(x, 70000 + 4000 * LANGSAM));
  pruefe('Firewall: ohne Bestätigung nach 60 s zurückgenommen (Port wieder zu)', (await aussen()) === 0);
  r = await js(`return (await Z.sys.firewall())`); pruefe('Firewall: Konfiguration wieder im alten Stand', r.regeln.length === 0 && r.ausstehend === false, JSON.stringify(r.regeln));
  r = await js(`const a = await Z.sys.firewallSetzen(${regel}, '${PW}'); const b = await Z.sys.root('firewall-bestaetigen', [], '${PW}'); return { a, b }`); pruefe('Firewall: Regel setzen und bestätigen', r.a.ok && r.b.ok, r.a.fehler || r.b.fehler);
  console.log('        … warte 70 s (bestätigte Regel muss bleiben) …'); await new Promise((x) => setTimeout(x, 70000));
  pruefe('Firewall: bestätigte Regel bleibt nach 60 s', (await aussen()) === 200);
  r = await js(`const a = await Z.sys.root('ports', [], '${PW}'); return a.aus`); pruefe('Firewall: «Offene Ports» zeigt den Testserver', new RegExp(':' + HTTP_PORT).test(r || ''));
  await js(`FM.schliessenAlle(); Apps.einstellungen.oeffnen('firewall'); await warte(${1500 * LANGSAM});`); await foto('14-firewall');
  r = await js(`const a = await Z.sys.firewallSetzen({ an: true, profil: 'zuhause', regeln: [] }, '${PW}'); const b = await Z.sys.root('firewall-bestaetigen', [], '${PW}'); return a.ok && b.ok`); await warte(2000);
  pruefe('Firewall: Regel entfernen schliesst den Port wieder', r === true && (await aussen()) === 0);

  // --- Einstellungen ändern wirkt im System ---
  r = await js(`const a = await Z.sys.root('zeitzone', ['Europe/Berlin'], '${PW}'); const z1 = (await Z.sys.zeit()).zeitzone; const b = await Z.sys.root('zeitzone', ['Europe/Zurich'], '${PW}'); const z2 = (await Z.sys.zeit()).zeitzone; return { a: a.ok, z1, z2 }`);
  pruefe('Einstellung «Zeitzone» ändert das System (und zurück)', r.a && r.z1 === 'Europe/Berlin' && r.z2 === 'Europe/Zurich', JSON.stringify(r));
  r = await js(`await Einst.setzenAsync({ aussehen: { akzent: '#e11d48', radius: 18 } }); Schreibtisch.aussehenAnwenden(); const s = getComputedStyle(document.documentElement); const x = { akzent: s.getPropertyValue('--akzent').trim(), radius: s.getPropertyValue('--radius').trim() }; await Einst.setzenAsync({ aussehen: { akzent: '#2457f5', radius: 12 } }); Schreibtisch.aussehenAnwenden(); return x`);
  pruefe('Erscheinungsbild wirkt live (Akzentfarbe, Eckenradius)', r.akzent === '#e11d48' && r.radius === '18px', JSON.stringify(r));

  // --- Bereiche der Einstellungen zeichnen ohne Fehler ---
  const b_warte = "['bluetooth','tailscale','wlan'].includes(b.id) ? " + 9000 * LANGSAM + " : " + 1200 * LANGSAM; r = await js(`const aus = []; Apps.einstellungen.oeffnen('wlan'); for (const b of EinstellungenApp.BEREICHE) { EinstellungenApp.bereich = b.id; EinstellungenApp.zeichnen(); await warte(${b_warte}); const t = document.querySelector('.ein-haupt').innerText; aus.push(b.id + ':' + t.length + (/\\bnull\\b|undefined/.test(t) ? '!' : '')); } return aus`);
  pruefe('Alle Bereiche der Einstellungen zeichnen Inhalt (mind. 22)', Array.isArray(r) && r.length >= 22 && r.every((x) => Number(x.split(':')[1]) > 40 && !x.endsWith('!')), JSON.stringify(r));
  for (const b of ['wlan', 'anzeige', 'ueber', 'aussehen']) { await js(`EinstellungenApp.bereich = '${b}'; EinstellungenApp.zeichnen(); await warte(${1500 * LANGSAM});`); await foto('15-einstellungen-' + b); }

  // --- Weitere Programme ---
  r = await js(`FM.schliessenAlle(); Aktivitaet.oeffnen(); await warte(${3500 * LANGSAM}); return document.querySelectorAll('.sy-zeile').length`); pruefe('Aktivitätsanzeige listet Prozesse', r > 10, r); await foto('16-aktivitaet');
  r = await js(`FM.schliessenAlle(); Finder.oeffnen(); await warte(${2000 * LANGSAM}); const pi = [...document.querySelectorAll('.f-ort')].find((x) => /Daten/.test(x.textContent)); pi && pi.click(); await warte(${1500 * LANGSAM}); const a = await Z.uebertragen.piZuLokal('/mnt/daten', '/Notizen/Einkauf.txt', Schreibtisch.zustand.heim); const b = await Z.uebertragen.lokalZuPi(a.pfad, '/mnt/daten', '/Dokumente'); return { pi: !!pi, zeilen: document.querySelectorAll('.f-zeile').length, hin: a.ok, zurueck: b.ok }`);
  pruefe('Finder: Quelle «Pi» (Demo) und Kopieren in beide Richtungen', r.pi && r.zeilen > 2 && r.hin && r.zurueck, JSON.stringify(r)); await foto('17-finder');
  r = await js(`FM.schliessenAlle(); await Launchpad.oeffnen(); await warte(${800 * LANGSAM}); return document.querySelectorAll('#startmenue .sm-app, #startmenue .sm-zeile').length`); pruefe('Startmenü zeigt Programme', r > 25, r); await foto('18-startmenue');
  r = await js(`Launchpad.schliessen(); await Spotlight.oeffnen(); const f = document.querySelector('.sp-feld'); f.value = '12*(3+4)'; f.dispatchEvent(new Event('input')); await warte(300); const a = document.querySelector('.sp-name')?.textContent; f.value = 'term'; f.dispatchEvent(new Event('input')); await warte(300); return { a, b: [...document.querySelectorAll('.sp-name')].map((x) => x.textContent) }`);
  pruefe('Spotlight: Rechner und Programmsuche', r.a === '12*(3+4) = 84' && r.b.includes('Terminal'), JSON.stringify(r)); await foto('19-spotlight');
  r = await js(`Spotlight.schliessen(); await Kontrollzentrum.oeffnen(document.querySelector('#dock [data-kz]')); await warte(${2500 * LANGSAM}); return document.querySelector('#kontrollzentrum')?.innerText || ''`); pruefe('Kontrollzentrum öffnet', /WLAN/.test(r) && !/null/.test(r), r); await foto('20-kontrollzentrum');
  await js(`Kontrollzentrum.schliessen(); FM.schliessenAlle(); Software.oeffnen(); await warte(${1500 * LANGSAM});`); await foto('21-software');

  // --- Neuer Look: Taskleiste, Akzentfarbe, Widgets, Geräte- und Task-Manager ---
  r = await js(`FM.schliessenAlle(); const vorher = { ...TL() }; await Einst.setzenAsync({ taskleiste: { ...TL(), position: 'oben', ausrichtung: 'links' } }); Dock.bauen(); await warte(400); const oben = document.body.classList.contains('tl-oben') && document.querySelector('#dock').getBoundingClientRect().top < 40; await Einst.setzenAsync({ taskleiste: vorher }); Dock.bauen(); return { tl: document.querySelector('#dock').classList.contains('tl'), oben, apps: document.querySelectorAll('#dock .dock-eintrag').length }`);
  pruefe('Taskleiste: vorhanden, Position und Ausrichtung umstellbar', r.tl && r.oben && r.apps >= 5, JSON.stringify(r));
  r = await js(`const f = (s) => getComputedStyle(document.querySelector(s)).backgroundColor; const a = f('.tl-start i'); await Einst.setzenAsync({ aussehen: { akzent: '#e5484d' } }); Schreibtisch.aussehenAnwenden(); await warte(300); const b = f('.tl-start i'); const bi = getComputedStyle(document.querySelector('.tl-start i')).backgroundImage; await Einst.setzenAsync({ aussehen: { akzent: '#3fae6b' } }); Schreibtisch.aussehenAnwenden(); return { rot: /229|e5484d|srgb/.test(bi), gewechselt: bi !== '' }`);
  pruefe('Akzentfarbe färbt die Oberfläche um', r.rot === true, JSON.stringify(r));
  r = await js(`const w = Schreibtischflaeche.e.widgets[1]; await Schreibtischflaeche.widgetSetzen(w.id, { stil: 'akzent', form: 'rund', breit: 4 }); Schreibtischflaeche.zeichnen(); await warte(300); const k = document.querySelector('[data-widget="' + w.id + '"]'); const ok = k.classList.contains('stil-akzent') && k.classList.contains('form-rund'); const gespeichert = (await Z.einstellungen.alle()).einstellungen.schreibtisch.widgets.find((x) => x.id === w.id); Schreibtischflaeche.widgetHinzu('bild'); await warte(600); const bild = !!document.querySelector('.fl-widget.typ-bild'); return { ok, gespeichert, bild }`);
  pruefe('Widgets: Form, Stil und Grösse änderbar und gespeichert; Bild-Widget', r.ok && r.gespeichert.stil === 'akzent' && r.gespeichert.breit === 4 && r.bild, JSON.stringify(r)); await foto('23-schreibtisch-neu');
  r = await js(`Geraete.oeffnen(); await warte(${3000 * LANGSAM}); return [...document.querySelectorAll('.gm-kopf span:nth-child(2)')].map((x) => x.textContent)`);
  pruefe('Geräte-Manager listet Gerätegruppen', Array.isArray(r) && r.includes('Prozessor') && r.includes('Laufwerke') && r.length >= 4, JSON.stringify(r)); await foto('24-geraete-manager');
  r = await js(`FM.schliessenAlle(); Aktivitaet.oeffnen(); await warte(${3000 * LANGSAM}); Aktivitaet.reiter = 'dienste'; Aktivitaet.reiterZeichnen(); await Aktivitaet.holen(); await warte(${1500 * LANGSAM}); return document.querySelectorAll('.sy-zeile').length`);
  pruefe('Task-Manager: Reiter «Dienste» listet laufende Dienste', r > 8, r); await foto('25-task-manager');

  r = await js(`FM.schliessenAlle(); const w = Schreibtischflaeche.e.widgets[0]; await Schreibtischflaeche.widgetSetzen(w.id, { x: 3.37, y: 2.21, breit: 2.6, hoch: 1.4 }); Schreibtischflaeche.zeichnen(); const k = document.querySelector('[data-widget="' + w.id + '"]'); const g = (await Z.einstellungen.alle()).einstellungen.schreibtisch.widgets.find((x) => x.id === w.id); return { frei: Schreibtischflaeche.frei(), links: k.style.left, breit: k.style.width, x: g.x, b: g.breit }`);
  pruefe('Widgets frei platzierbar und stufenlos gross (ohne Raster), gespeichert', r.frei === true && r.x === 3.37 && r.b === 2.6 && parseFloat(r.links) % 110 !== 0, JSON.stringify(r));
  r = await js(`Apps.netzplan.oeffnen(); await warte(${4000 * LANGSAM}); const a = document.querySelectorAll('.np-knoten').length; const t = document.querySelector('.np').innerText; return { knoten: a, router: /Router/.test(t), dns: /DNS/.test(t), schalter: document.querySelectorAll('.np .schalter, .np select').length }`);
  pruefe('Netzplan zeigt Weg, DNS und Schalter', r.knoten >= 6 && r.router && r.dns && r.schalter >= 2, JSON.stringify(r)); await foto('26-netzplan');

  // --- Fremdes Programm als echtes Fenster ---
  r = await js(`FM.schliessenAlle(); const s = await Z.sys.programmStarten('foot'); await warte(${5000 * LANGSAM}); const w = await Z.sys.fremdeFenster(); await warte(3000); return { s: s.ok, fenster: w.liste, dock: document.querySelectorAll('#dock .fremd').length }`);
  pruefe('Fremdes Programm (foot) startet als eigenes Fenster und erscheint im Dock', r.s && r.fenster.some((f) => f.app === 'foot') && r.dock >= 1, JSON.stringify(r));

  // --- Flatpak (braucht Internet) ---
  r = await js(`const a = await Z.sys.flatpakSuche('calculator'); return { ok: a.ok, anzahl: (a.liste || []).length, fehler: a.fehler }`);
  if (r.ok && r.anzahl > 0) pruefe('Software: Flathub-Suche liefert Treffer', true, r.anzahl + ' Treffer'); else hinweis('Software: Flathub-Suche NICHT geprüft (kein Internet in der Test-VM?)', JSON.stringify(r));

  // --- Sperren, Fernbefehl ---
  r = await js(`await fetchSperre(); async function fetchSperre() { await Z.sperren({ bildschirmAus: false }); } await warte(1500); return { gesperrt: !document.querySelector('#sperre').hidden, fremdSichtbar: (await Z.sys.fremdeFenster()).liste.length }`);
  pruefe('Sperren zeigt den Anmeldebildschirm', r.gesperrt === true); await foto('22-gesperrt');
  r = await js(`const a = await Z.sys.root('pruefen', [], '${PW}'); const b = await Z.sys.terminalStarten('x', {}); const c = await Z.sys.programmStarten('foot'); return { root: a.ok, terminal: b.ok, programm: c.ok }`);
  pruefe('Gesperrt: keine Root-Aktion, kein Terminal, kein Programmstart', r.root === false && r.terminal === false && r.programm === false, JSON.stringify(r));

  fs.writeFileSync(path.join(AUS, 'systemtest.txt'), zeilen.join('\n') + `\n\nFehler: ${fehler}\n`);
  console.log(`\nFehler: ${fehler}`); ws.close(); process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error('ABBRUCH', e); fs.writeFileSync(path.join(AUS, 'systemtest.txt'), zeilen.join('\n') + '\nABBRUCH: ' + e.message + '\n'); process.exit(2); });
