#!/usr/bin/env sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-boundary-labs-smoke}"
CONTAINER_NAME="${CONTAINER_NAME:-boundary-labs-smoke}"
PORT="${PORT:-3000}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup
docker build -t "$IMAGE_NAME" .
docker run -d --name "$CONTAINER_NAME" -p "$PORT:3000" "$IMAGE_NAME" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null \
    && curl -fsS "http://127.0.0.1:$PORT/readyz" >/dev/null; then
    for _ in $(seq 1 10); do
      status="$(docker exec "$CONTAINER_NAME" supervisorctl -c /etc/supervisor/conf.d/boundary.conf status)"
      echo "$status"
      echo "$status" | grep -q "web .*RUNNING" \
        && echo "$status" | grep -q "worker .*RUNNING" \
        && echo "$status" | grep -q "exit-on-fatal .*RUNNING" \
        && exit 0
      sleep 1
    done
  fi
  sleep 2
done

docker logs "$CONTAINER_NAME"
exit 1
