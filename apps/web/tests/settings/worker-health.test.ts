import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getBoundaryConfig } from "../../src/server/config";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { getWorkerHealthSnapshot } from "../../src/server/worker-health/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

const originalSqlitePath = process.env.SQLITE_PATH;

afterEach(() => {
  if (originalSqlitePath == null) {
    delete process.env.SQLITE_PATH;
  } else {
    process.env.SQLITE_PATH = originalSqlitePath;
  }
});

describe("worker health snapshot", () => {
  it("reports offline when no worker heartbeat has been written", () => {
    const context = createSafetyGateContext("boundary-worker-offline-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const config = {
      ...getBoundaryConfig(),
      sqlitePath: context.sqlitePath,
      workerHeartbeatPath: path.join(context.root, "missing.heartbeat")
    };

    expect(getWorkerHealthSnapshot({ config })).toMatchObject({
      status: "offline",
      queuedJobs: 0,
      claimedJobs: 0
    });
  });

  it("reads fresh heartbeat, queue state, and recent backpressure events", () => {
    const context = createSafetyGateContext("boundary-worker-health-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    fs.writeFileSync(heartbeatPath, "worker-test 1.0\n", "utf8");
    const now = new Date("2026-05-13T12:00:00.000Z");
    fs.utimesSync(heartbeatPath, now, now);

    const db = new Database(context.sqlitePath);
    const staleClaimedAt = new Date(now.getTime() - 601_000).toISOString();
    db.prepare(`
      INSERT INTO campaigns (
        id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
        artifact_path, created_at, updated_at
      ) VALUES
        ('campaign-queued', 'https://clinical-copilot.up.railway.app', '[]', 'queued', 'synthetic', 500, 'operator-1', '/tmp/queued.json', ?, ?),
        ('campaign-claimed', 'https://clinical-copilot.up.railway.app', '[]', 'running', 'synthetic', 500, 'operator-1', '/tmp/claimed.json', ?, ?)
    `).run(now.toISOString(), now.toISOString(), staleClaimedAt, staleClaimedAt);
    db.prepare(`
      INSERT INTO campaign_jobs (
        id, campaign_id, status, claim_token, claimed_at, submitted_by, payload_json,
        created_at, updated_at
      ) VALUES
        ('job-queued', 'campaign-queued', 'queued', NULL, NULL, 'operator-1', '{}', ?, ?),
        ('job-claimed', 'campaign-claimed', 'claimed', 'worker-test:token', ?, 'operator-1', '{}', ?, ?)
    `).run(now.toISOString(), now.toISOString(), staleClaimedAt, staleClaimedAt, staleClaimedAt);
    db.prepare(`
      INSERT INTO audit_events (
        id, occurred_at, actor_type, actor_id, action, target_type, target_id,
        outcome, rule_ref, policy_snapshot_hash, metadata_json
      ) VALUES (
        'audit-backpressure', ?, 'system', NULL, 'worker_backpressure', 'campaign_job',
        'job-claimed', 'ok', 'R23', NULL, '{}'
      )
    `).run(now.toISOString());
    db.close();

    const config = {
      ...getBoundaryConfig(),
      sqlitePath: context.sqlitePath,
      workerHeartbeatPath: heartbeatPath
    };

    expect(getWorkerHealthSnapshot({ config, now })).toMatchObject({
      status: "ok",
      workerId: "worker-test",
      queuedJobs: 1,
      claimedJobs: 1,
      staleClaimedJobs: 1,
      recentBackpressureEvents: [
        {
          action: "worker_backpressure",
          targetId: "job-claimed"
        }
      ]
    });
  });

  it("marks old heartbeats as stale", () => {
    const context = createSafetyGateContext("boundary-worker-stale-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    fs.writeFileSync(heartbeatPath, "worker-test 1.0\n", "utf8");
    const now = new Date("2026-05-13T12:00:00.000Z");
    const old = new Date(now.getTime() - 301_000);
    fs.utimesSync(heartbeatPath, old, old);
    const config = {
      ...getBoundaryConfig(),
      sqlitePath: context.sqlitePath,
      workerHeartbeatPath: heartbeatPath
    };

    expect(getWorkerHealthSnapshot({ config, now })).toMatchObject({
      status: "stale",
      ageSeconds: 301
    });
  });
});
