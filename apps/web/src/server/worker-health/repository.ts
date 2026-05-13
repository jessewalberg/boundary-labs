import fs from "node:fs";
import { getBoundaryConfig, type BoundaryConfig } from "@/server/config";
import { openDatabase } from "@/server/db/client";

export type WorkerHealthStatus = "ok" | "stale" | "offline";

export type WorkerHealthSnapshot = {
  status: WorkerHealthStatus;
  heartbeatPath: string;
  workerId: string | null;
  lastSeenAt: string | null;
  ageSeconds: number | null;
  stalenessSeconds: number;
  queuedJobs: number;
  claimedJobs: number;
  staleClaimedJobs: number;
  recentBackpressureEvents: Array<{
    action: string;
    occurredAt: string;
    targetId: string | null;
  }>;
  detail: string;
};

type WorkerHealthOptions = {
  config?: BoundaryConfig;
  now?: Date;
};

export function getWorkerHealthSnapshot(options: WorkerHealthOptions = {}): WorkerHealthSnapshot {
  const config = options.config ?? getBoundaryConfig();
  const now = options.now ?? new Date();
  const queueState = readQueueState(config, now);
  const heartbeat = readHeartbeat(config.workerHeartbeatPath, now, queueState.stalenessSeconds);

  return {
    ...heartbeat,
    ...queueState
  };
}

function readHeartbeat(
  heartbeatPath: string,
  now: Date,
  stalenessSeconds: number
): Pick<
  WorkerHealthSnapshot,
  "status" | "heartbeatPath" | "workerId" | "lastSeenAt" | "ageSeconds" | "detail"
> {
  try {
    const stat = fs.statSync(heartbeatPath);
    const ageSeconds = Math.max(0, Math.round((now.getTime() - stat.mtimeMs) / 1000));
    const workerId = parseWorkerId(fs.readFileSync(heartbeatPath, "utf8"));

    if (ageSeconds > stalenessSeconds) {
      return {
        status: "stale",
        heartbeatPath,
        workerId,
        lastSeenAt: stat.mtime.toISOString(),
        ageSeconds,
        detail: `worker heartbeat is stale (${ageSeconds}s old)`
      };
    }

    return {
      status: "ok",
      heartbeatPath,
      workerId,
      lastSeenAt: stat.mtime.toISOString(),
      ageSeconds,
      detail: "worker heartbeat is fresh"
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        status: "offline",
        heartbeatPath,
        workerId: null,
        lastSeenAt: null,
        ageSeconds: null,
        detail: "worker heartbeat has not been written yet"
      };
    }

    return {
      status: "offline",
      heartbeatPath,
      workerId: null,
      lastSeenAt: null,
      ageSeconds: null,
      detail: error instanceof Error ? error.message : "could not read worker heartbeat"
    };
  }
}

function readQueueState(config: BoundaryConfig, now: Date) {
  const fallback = {
    stalenessSeconds: 300,
    queuedJobs: 0,
    claimedJobs: 0,
    staleClaimedJobs: 0,
    recentBackpressureEvents: []
  };
  const db = openDatabase(config.sqlitePath);

  try {
    const stalenessSeconds = readHeartbeatStalenessSeconds(db) ?? fallback.stalenessSeconds;
    const staleCutoff = new Date(now.getTime() - stalenessSeconds * 1000).toISOString();
    const queuedJobs = count(db, "SELECT COUNT(*) AS count FROM campaign_jobs WHERE status = 'queued'");
    const claimedJobs = count(db, "SELECT COUNT(*) AS count FROM campaign_jobs WHERE status = 'claimed'");
    const staleClaimedJobs = count(
      db,
      "SELECT COUNT(*) AS count FROM campaign_jobs WHERE status = 'claimed' AND claimed_at < ?",
      staleCutoff
    );
    const recentBackpressureEvents = db.prepare(`
      SELECT action, occurred_at AS occurredAt, target_id AS targetId
      FROM audit_events
      WHERE action IN (
        'red_team_cap_exceeded',
        'claim_refused_operator_revoked',
        'worker_backpressure',
        'worker_claim_timeout'
      )
      ORDER BY occurred_at DESC
      LIMIT 3
    `).all() as WorkerHealthSnapshot["recentBackpressureEvents"];

    return {
      stalenessSeconds,
      queuedJobs,
      claimedJobs,
      staleClaimedJobs,
      recentBackpressureEvents
    };
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return fallback;
  } finally {
    db.close();
  }
}

function readHeartbeatStalenessSeconds(db: ReturnType<typeof openDatabase>) {
  const row = db.prepare(`
    SELECT value_json
    FROM policy_values
    WHERE key = 'heartbeat_staleness_seconds'
  `).get() as { value_json: string } | undefined;
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.value_json);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function count(db: ReturnType<typeof openDatabase>, sql: string, ...params: unknown[]) {
  const row = db.prepare(sql).get(...params) as { count: number };
  return row.count;
}

function parseWorkerId(contents: string) {
  return contents.trim().split(/\s+/)[0] || null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
