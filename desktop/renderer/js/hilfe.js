// Kleine Helfer für die ganze Oberfläche.
const Z = window.zentrale;

function el(was, eigen, ...kinder) {
  const e = document.createElement(was);
  for (const [k, v] of Object.entries(eigen || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'klasse') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'stil') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'daten') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat(3)) {
    if (kind === null || kind === undefined || kind === false) continue;
    e.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return e;
}

const $ = (w, wo = document) => wo.querySelector(w);
const $$ = (w, wo = document) => [...wo.querySelectorAll(w)];
const leeren = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };

// ---------- Formatierung ----------
function groesse(b) {
  if (b === null || b === undefined) return '–';
  if (b < 1024) return b + ' B';
  const e = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let i = -1, z = b;
  do { z /= 1024; i++; } while (z >= 1024 && i < e.length - 1);
  return z.toFixed(z < 10 && i > 0 ? 1 : 0).replace('.', ',') + ' ' + e[i];
}

const zweiStellig = (n) => String(n).padStart(2, '0');

function datumZeit(ms) {
  if (!ms) return '–';
  const d = new Date(ms);
  const heute = new Date();
  const gleich = d.toDateString() === heute.toDateString();
  const zeit = `${zweiStellig(d.getHours())}:${zweiStellig(d.getMinutes())}`;
  if (gleich) return 'Heute ' + zeit;
  return `${zweiStellig(d.getDate())}.${zweiStellig(d.getMonth() + 1)}.${d.getFullYear()} ${zeit}`;
}

const WOCHE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const langesDatum = (d = new Date()) => `${WOCHE[d.getDay()]}, ${d.getDate()}. ${MONAT[d.getMonth()]}`;
const kurzesDatum = (d = new Date()) => `${WOCHE[d.getDay()].slice(0, 2)} ${zweiStellig(d.getDate())}. ${MONAT[d.getMonth()].slice(0, 3)}`;
const uhr = (d = new Date()) => `${zweiStellig(d.getHours())}:${zweiStellig(d.getMinutes())}`;

// ---------- Pfade ----------
const piVerbinden = (...teile) => ('/' + teile.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
const piEltern = (p) => { const t = String(p).split('/').filter(Boolean); t.pop(); return '/' + t.join('/'); };
const piName = (p) => String(p).split('/').filter(Boolean).pop() || '/';
const lokalTrenner = () => (navigator.userAgent.includes('Windows') ? '\\' : '/');
const lokalVerbinden = (ordner, name) => String(ordner).replace(/[\\/]+$/, '') + lokalTrenner() + name;
const lokalName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

// ---------- Hinweise ----------
function hinweis(text, art = 'info', titel = null) {
  const behaelter = $('#hinweise');
  const k = el('div', { klasse: 'hinweis ' + art },
    el('div', { klasse: 'kopf' }, el('span', { klasse: 'punkt' }), titel || { fehler: 'Fehler', warnung: 'Achtung', ok: 'Erledigt' }[art] || 'Zentrale'),
    el('div', { text: String(text) }),
  );
  behaelter.append(k);
  const weg = () => { k.classList.add('weg'); setTimeout(() => k.remove(), 220); };
  k.addEventListener('click', weg);
  setTimeout(weg, art === 'fehler' ? 9000 : 4800);
  return k;
}

// ---------- Dialoge ----------
function dialog({ titel, text, felder = [], okText = 'OK', abbrechenText = 'Abbrechen', gefahr = false, nurOk = false }) {
  return new Promise((fertig) => {
    const eingaben = felder.map((f) => el('input', {
      klasse: 'feld', type: f.type || 'text', value: f.wert || '', placeholder: f.platzhalter || '',
      stil: { marginBottom: '8px' },
    }));
    const schliessen = (wert) => { hinter.remove(); document.removeEventListener('keydown', taste, true); fertig(wert); };
    const ok = () => schliessen(felder.length ? eingaben.map((i) => i.value) : true);
    const taste = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); schliessen(null); }
      if (e.key === 'Enter' && (felder.length || nurOk)) { e.stopPropagation(); ok(); }
    };
    const kasten = el('div', { klasse: 'dialog' },
      el('h3', { text: titel }),
      text ? el('p', { text }) : null,
      eingaben,
      el('div', { klasse: 'knoepfe' },
        nurOk ? null : el('button', { klasse: 'knopf', onclick: () => schliessen(null) }, abbrechenText),
        el('button', { klasse: 'knopf ' + (gefahr ? 'gefahr' : 'haupt'), onclick: ok }, okText),
      ),
    );
    const hinter = el('div', { klasse: 'dialog-hinter', onmousedown: (e) => { if (e.target === hinter) schliessen(null); } }, kasten);
    $('#ebenen').append(hinter);
    document.addEventListener('keydown', taste, true);
    setTimeout(() => (eingaben[0] || kasten.querySelector('.haupt')).focus(), 30);
    if (eingaben[0]) setTimeout(() => eingaben[0].select(), 40);
  });
}

const fragen = (titel, text, okText = 'OK', gefahr = false) => dialog({ titel, text, okText, gefahr });
const melden = (titel, text) => dialog({ titel, text, okText: 'OK', nurOk: true });
const abfragen = (titel, text, wert = '', okText = 'OK') =>
  dialog({ titel, text, felder: [{ wert }], okText }).then((r) => (r ? r[0] : null));

// ---------- Kontextmenü ----------
function kontextmenue(x, y, eintraege) {
  schliesseMenues();
  const m = el('div', { klasse: 'menue' });
  for (const e of eintraege) {
    if (e === '-') { m.append(el('div', { klasse: 'menue-trenner' })); continue; }
    if (e.titel) { m.append(el('div', { klasse: 'menue-titel', text: e.titel })); continue; }
    m.append(el('button', {
      klasse: 'menue-eintrag', disabled: !!e.aus,
      onclick: () => { schliesseMenues(); e.tun && e.tun(); },
    }, el('span', { text: e.text }), e.kuerzel ? el('span', { klasse: 'kuerzel', text: e.kuerzel }) : null));
  }
  $('#ebenen').append(m);
  const b = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - b.width - 8) + 'px';
  m.style.top = Math.min(y, window.innerHeight - b.height - 8) + 'px';
  setTimeout(() => {
    const zu = (ev) => { if (!m.contains(ev.target)) { schliesseMenues(); document.removeEventListener('mousedown', zu, true); } };
    document.addEventListener('mousedown', zu, true);
  }, 0);
  return m;
}
function schliesseMenues() {
  $$('#ebenen .menue').forEach((m) => m.remove());
  $$('.mb-knopf.offen').forEach((k) => k.classList.remove('offen'));
}

// ---------- Sonstiges ----------
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
function entprellen(fn, ms = 250) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
// Antwort prüfen: zeigt Fehler als Hinweis und gibt null zurück.
function pruefen(r, was = 'Das hat nicht geklappt') {
  if (r && r.ok) return r;
  hinweis((r && r.fehler) || was, 'fehler');
  return null;
}
