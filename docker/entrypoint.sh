#!/usr/bin/env sh
set -eu

: "${SQLITE_PATH:=/data/boundary.db}"
: "${BOUNDARY_ARTIFACT_DIR:=/data/artifacts}"
: "${BOUNDARY_WORKER_HEARTBEAT_PATH:=/data/worker.heartbeat}"

export SQLITE_PATH BOUNDARY_ARTIFACT_DIR BOUNDARY_WORKER_HEARTBEAT_PATH

rm -f /tmp/supervisor-fatal
mkdir -p "$(dirname "$SQLITE_PATH")" "$BOUNDARY_ARTIFACT_DIR" "$(dirname "$BOUNDARY_WORKER_HEARTBEAT_PATH")"

if [ -f /app/apps/web/package.json ] && grep -q '"migrate"' /app/apps/web/package.json; then
  pnpm --dir /app/apps/web run migrate
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
