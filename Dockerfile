# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web-build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

COPY apps/web apps/web
RUN pnpm --dir apps/web build

FROM python:3.12-slim AS worker-deps

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY worker/requirements.txt worker/requirements.txt
RUN pip install --no-cache-dir -r worker/requirements.txt

FROM python:3.12-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl supervisor \
  && rm -rf /var/lib/apt/lists/*

COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build /usr/local/bin/corepack /usr/local/bin/corepack
COPY --from=web-build /usr/local/bin/pnpm /usr/local/bin/pnpm
COPY --from=web-build /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack
COPY --from=worker-deps /opt/venv /opt/venv

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV SQLITE_PATH=/data/boundary.db
ENV BOUNDARY_ARTIFACT_DIR=/data/artifacts
ENV BOUNDARY_WORKER_HEARTBEAT_PATH=/data/worker.heartbeat
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static apps/web/.next/static
COPY --from=web-build /app/apps/web/public apps/web/public
COPY scripts scripts
COPY evals evals
COPY worker worker
COPY docker/entrypoint.sh /usr/local/bin/boundary-entrypoint
COPY docker/exit-on-fatal.py /usr/local/bin/boundary-exit-on-fatal
COPY docker/supervisord.conf /etc/supervisor/conf.d/boundary.conf

RUN chmod +x /usr/local/bin/boundary-entrypoint /usr/local/bin/boundary-exit-on-fatal \
  && mkdir -p /data

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["boundary-entrypoint"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/boundary.conf"]
