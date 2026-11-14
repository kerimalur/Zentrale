#!/bin/bash
# Baut das ZentraleOS-ISO. Ein Befehl:  os/bauen.sh
# Braucht nur Docker (privilegierter Container) und Node.js 20+. Ergebnis: os/ausgabe/zentraleos.iso
set -euo pipefail
cd "$(dirname "$0")"
IMAGE="${ZOS_BASIS_IMAGE:-debian:trixie-slim}"
mkdir -p ausgabe
echo "== Shell vorbereiten (npm) =="
( cd shell && npm install --no-audit --no-fund --omit=dev && npm run check )
# Stand für «Nach Updates suchen»: Kennung, Datum und Titel des Commits, aus dem gebaut wird
ZOS_STAND="$(git -C .. log -1 --format='%H%n%cs%n%s' 2>/dev/null || true)"; export ZOS_STAND
echo "== ISO bauen (Docker, $IMAGE) =="
nice -n 10 docker run --rm --privileged --network host \
  --cpus="${ZOS_CPUS:-6}" --memory="${ZOS_RAM:-6g}" \
  -e ZOS_SPIEGEL -e ZOS_STAND -v "$PWD":/quelle:ro -v "$PWD/ausgabe":/ausgabe \
  "$IMAGE" bash /quelle/iso/im-container.sh
echo "Fertig: $PWD/ausgabe/zentraleos.iso"
