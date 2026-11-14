// Programme ohne die offenen Kanäle der Oberfläche starten (siehe /usr/libexec/zentraleos/frei).
// Ausserhalb von ZentraleOS (Vorschau, Demo) fehlt das Skript – dann direkt starten.
const fs = require('fs');
const FREI = '/usr/libexec/zentraleos/frei';
const da = fs.existsSync(FREI);
module.exports = (befehl, args = []) => (da ? [FREI, [befehl, ...args]] : [befehl, args]);
