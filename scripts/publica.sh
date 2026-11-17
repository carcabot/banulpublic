#!/bin/bash
# Publică serverul web și data/site.db pe un server propriu, reconstruiește imaginea, repornește serviciul și rulează testul de fum.
# Ținta NU este în repo: PUBLICA_HOST (utilizator@gazdă), PUBLICA_PORT (portul SSH) și PUBLICA_URL (adresa publică) se citesc din mediu
# sau din .env, care nu se versionează. Accesul se face cu cheia SSH a celui care rulează scriptul; fără ea scriptul nu poate face nimic.
# Fără --apply doar arată ce ar trimite. Coduri de ieșire: 0 gata, 1 a picat un pas, 2 neconfigurat.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then while IFS='=' read -r k v; do case "$k" in PUBLICA_HOST|PUBLICA_PORT|PUBLICA_URL|PUBLICA_DEST) [ -n "${!k:-}" ] || export "$k=$v" ;; esac; done < .env; fi
HOST="${PUBLICA_HOST:-}"; PORT_SSH="${PUBLICA_PORT:-22}"; DEST="${PUBLICA_DEST:-/opt/integritate}"; URL="${PUBLICA_URL:-}"
[ -n "$HOST" ] && [ -n "$URL" ] || { echo "neconfigurat: pune PUBLICA_HOST și PUBLICA_URL în .env (vezi .env.example și docs/runbook.md)" >&2; exit 2; }
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
[ -f data/site.db ] || { echo "lipsește data/site.db; rulează python3 site/pregateste.py" >&2; exit 2; }
SSH=(ssh -p "$PORT_SSH" -o BatchMode=yes "$HOST")
RS=(rsync -az --delay-updates -e "ssh -p $PORT_SSH -o BatchMode=yes")
[ "$APPLY" = 1 ] || RS+=(--dry-run --itemize-changes)

echo "publicare pe $DEST ($([ "$APPLY" = 1 ] && echo aplic || echo "probă, nimic nu se schimbă")); site.db: $(du -h data/site.db | cut -f1)" >&2
"${RS[@]}" --relative Dockerfile .dockerignore web/server.ts web/mcp.ts web/limita.ts web/smoke.ts "$HOST:$DEST/"
"${RS[@]}" --progress data/site.db "$HOST:$DEST/data/"
[ "$APPLY" = 1 ] || { echo "probă terminată. Rulează cu --apply ca să publici." >&2; exit 0; }

"${SSH[@]}" "set -e; cd $DEST; sudo podman build -q -t integritate:latest . >/dev/null; sudo systemctl restart integritate
for i in \$(seq 1 20); do curl -fsS http://127.0.0.1:3210/healthz 2>/dev/null && break; sleep 1; done; echo
sudo podman exec integritate bun web/smoke.ts http://localhost:3210; sudo podman image prune -f >/dev/null"
# din afară, prin proxy și certificat; se sare cât timp domeniul nu răspunde
if curl -fsS -m 10 "$URL/healthz" >/dev/null 2>&1; then bun web/smoke.ts "$URL"; else echo "sărit: $URL nu răspunde încă din afară" >&2; fi
