#!/usr/bin/env sh
set -eu

: "${SQLITE_PATH:=/data/boundary.db}"
: "${BOUNDARY_ARTIFACT_DIR:=/data/artifacts}"
: "${BOUNDARY_WORKER_HEARTBEAT_PATH:=/data/worker.heartbeat}"
: "${BOUNDARY_INGEST_BUNDLED_EVALS:=1}"

export SQLITE_PATH BOUNDARY_ARTIFACT_DIR BOUNDARY_WORKER_HEARTBEAT_PATH BOUNDARY_INGEST_BUNDLED_EVALS

rm -f /tmp/supervisor-fatal
mkdir -p "$(dirname "$SQLITE_PATH")" "$BOUNDARY_ARTIFACT_DIR" "$(dirname "$BOUNDARY_WORKER_HEARTBEAT_PATH")"

if [ -f /app/apps/web/package.json ] && grep -q '"migrate"' /app/apps/web/package.json; then
  pnpm --dir /app/apps/web run migrate
fi

# Idempotent demo-data seeding. Non-fatal — boot continues even if seeds fail
# (for example on a brand-new container with no eval artifact yet).
if [ -f /app/apps/web/scripts/derive-reports.ts ] && [ -f /app/evals/results/latest.json ]; then
  echo "[entrypoint] seeding vulnerability reports..."
  pnpm --dir /app/apps/web run derive:reports || echo "[entrypoint] derive:reports failed (non-fatal)"
fi
if [ -f /app/apps/web/scripts/seed-observability.ts ] && [ -f /app/evals/results/latest.json ]; then
  echo "[entrypoint] seeding observability rows..."
  pnpm --dir /app/apps/web run seed:observability || echo "[entrypoint] seed:observability failed (non-fatal)"
fi

"$@" &
supervisor_pid="$!"

forward_shutdown() {
  kill -TERM "$supervisor_pid" 2>/dev/null || true
  wait "$supervisor_pid" || true
}

trap forward_shutdown INT TERM

set +e
wait "$supervisor_pid"
status="$?"
set -e

if [ -f /tmp/supervisor-fatal ]; then
  exit 1
fi

exit "$status"
