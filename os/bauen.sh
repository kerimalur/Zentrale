#!/bin/bash
# Baut das ZentraleOS-ISO. Ein Befehl:  os/bauen.sh
# Braucht nur Docker (privilegierter Container) und Node.js 20+. Ergebnis: os/ausgabe/zentraleos.iso
set -euo pipefail
cd "$(dirname "$0")"
IMAGE="${ZOS_BASIS_IMAGE:-debian:trixie-slim}"
mkdir -p ausgabe
echo "== Shell vorbereiten (npm) =="
( cd shell && npm install --no-audit --no-fund --omit=dev && npm run check )
echo "== ISO bauen (Docker, $IMAGE) =="
nice -n 10 docker run --rm --privileged --network host \
  --cpus="${ZOS_CPUS:-6}" --memory="${ZOS_RAM:-6g}" \
  -e ZOS_SPIEGEL -v "$PWD":/quelle:ro -v "$PWD/ausgabe":/ausgabe \
  "$IMAGE" bash /quelle/iso/im-container.sh
echo "Fertig: $PWD/ausgabe/zentraleos.iso"
