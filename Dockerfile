# Kerims Zentrale – wird direkt auf dem Pi gebaut (arm64).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
# hdparm: HDD schlafen · rsync: Backup · sqlite3: Vaultwarden-Sicherung · util-linux: nsenter/ionice
RUN apt-get update \
 && apt-get install -y --no-install-recommends hdparm rsync sqlite3 procps util-linux ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Zurich
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/out ./out
COPY server ./server
COPY package.json ./
CMD ["node", "server/index.mjs"]
