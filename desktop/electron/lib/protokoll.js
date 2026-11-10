// Eigenes Schema "zdatei://", damit Bilder, PDFs, Videos und Musik direkt in der
// Oberfläche angezeigt werden können – vom Pi genauso wie vom HP.
//
//   zdatei://pi/?w=<Laufwerk>&p=<Pfad>      -> wird an die Zentrale weitergereicht
//   zdatei://lokal/?p=<Windows-Pfad>        -> Datei auf dem HP
//
// Teil-Anfragen (Range) werden durchgereicht bzw. selbst beantwortet – ohne das
// springt man in Videos und PDFs nicht.
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { protocol, net } = require('electron');
const pi = require('./pi');

const SCHEMA = 'zdatei';

function schemaAnmelden() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEMA,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false },
  }]);
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8', log: 'text/plain; charset=utf-8',
};
const mimeVon = (p) => MIME[String(p).split('.').pop().toLowerCase()] || 'application/octet-stream';

function handhaben() {
  protocol.handle(SCHEMA, async (req) => {
    let u;
    try { u = new URL(req.url); } catch { return new Response('Ungültige Adresse', { status: 400 }); }
    const bereich = req.headers.get('Range') || '';

    if (u.hostname === 'pi') {
      const w = u.searchParams.get('w') || '';
      const p = u.searchParams.get('p') || '';
      const herunter = u.searchParams.get('download') === '1' ? '&download=1' : '';
      const ziel = pi.url(`/api/dateien/inhalt?wurzel=${encodeURIComponent(w)}&pfad=${encodeURIComponent(p)}${herunter}`);
      try {
        const antwort = await pi.sitzung().fetch(ziel, { headers: bereich ? { Range: bereich } : {} });
        return antwort;
      } catch (e) {
        return new Response('Pi nicht erreichbar: ' + String(e.message).slice(0, 120), { status: 502 });
      }
    }

    if (u.hostname === 'lokal') {
      const p = u.searchParams.get('p') || '';
      let st;
      try { st = fs.statSync(p); } catch { return new Response('Nicht gefunden', { status: 404 }); }
      if (!st.isFile()) return new Response('Keine Datei', { status: 400 });
      const typ = mimeVon(p);
      const m = bereich.match(/^bytes=(\d*)-(\d*)$/);
      if (m && st.size > 0) {
        let von = m[1] === '' ? null : Number(m[1]);
        let bis = m[2] === '' ? null : Number(m[2]);
        if (von === null) { von = Math.max(st.size - (bis || 0), 0); bis = st.size - 1; }
        if (bis === null || bis >= st.size) bis = st.size - 1;
        if (von > bis || von >= st.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
        return new Response(Readable.toWeb(fs.createReadStream(p, { start: von, end: bis })), {
          status: 206,
          headers: {
            'Content-Type': typ, 'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${von}-${bis}/${st.size}`, 'Content-Length': String(bis - von + 1),
          },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(p)), {
        headers: { 'Content-Type': typ, 'Accept-Ranges': 'bytes', 'Content-Length': String(st.size) },
      });
    }

    return new Response('Unbekannte Quelle', { status: 404 });
  });
}

// Adressen für die Oberfläche bauen.
const piUrl = (wurzel, pfad) => `${SCHEMA}://pi/?w=${encodeURIComponent(wurzel)}&p=${encodeURIComponent(pfad)}`;
const lokalUrl = (pfad) => `${SCHEMA}://lokal/?p=${encodeURIComponent(pfad)}`;

module.exports = { SCHEMA, schemaAnmelden, handhaben, piUrl, lokalUrl, net };
