// Rechnet eine Fremddaten-Hypothese in einem eigenen Thread (die Daten wurden vorher im Haupt-Thread geholt).
import { parentPort, workerData } from 'node:worker_threads';
import { fremdRechnen } from './motor.mjs';

const schritte = ['Ereignisse', 'Horizonte', 'Robustheit', 'Forward', 'Dosis-Wirkung', 'Varianten', 'Stufe 2', 'Grafiken'];
try {
  const erg = fremdRechnen({
    ...workerData,
    melde: (was) => parentPort.postMessage({ typ: 'fortschritt', fertig: Math.max(0, schritte.indexOf(was)), gesamt: schritte.length, paar: was }),
  });
  parentPort.postMessage({ typ: 'fertig', ergebnis: erg });
} catch (err) {
  parentPort.postMessage({ typ: 'fehler', fehler: err.stack || err.message });
}
