import { ensureLocalStatePaths } from "@/server/storage/paths";
import { getBoundaryConfig } from "@/server/config";
import { policySchema } from "@/server/safety-gate/schema";
import { getWorkerHealthSnapshot } from "@/server/worker-health/repository";
import Database from "better-sqlite3";
import fs from "node:fs";

type ReadinessCheck = {
  status: "ok" | "skipped" | "degraded";
  detail?: string;
  [key: string]: unknown;
};

export async function GET() {
  const config = getBoundaryConfig();
  const paths = ensureLocalStatePaths();
  const workerHealth = checkWorkerHealth();
  const sqlite = await checkSqliteIntegrity(config.sqlitePath);
  const policyBootstrap = await checkPolicyBootstrap(config.sqlitePath);
  const status = [workerHealth, sqlite, policyBootstrap].some((check) => check.status === "degraded")
    ? "degraded"
    : "ok";

  return Response.json({
    status,
    service: "boundary-web",
    checks: {
      app: "ok",
      sqliteDirectory: paths.sqliteDir,
      artifactDirectory: paths.artifactDir,
      workerHealth,
      sqlite,
      policyBootstrap,
      targetUrl: config.targetUrl,
      targetAllowlistCount: config.targetAllowlist.length,
      evalRunnerPath: config.evalRunnerPath,
      dataMode: config.dataMode
    }
  });
}

function checkWorkerHealth(): ReadinessCheck {
  const snapshot = getWorkerHealthSnapshot();
  return {
    status: snapshot.status === "ok" ? "ok" : "degraded",
    detail: snapshot.detail,
    workerId: snapshot.workerId,
    lastSeenAt: snapshot.lastSeenAt,
    ageSeconds: snapshot.ageSeconds,
    queuedJobs: snapshot.queuedJobs,
    claimedJobs: snapshot.claimedJobs,
    staleClaimedJobs: snapshot.staleClaimedJobs,
    recentBackpressureEvents: snapshot.recentBackpressureEvents
  };
}

async function checkSqliteIntegrity(sqlitePath: string): Promise<ReadinessCheck> {
  if (!fs.existsSync(sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    const result = db.prepare("PRAGMA integrity_check").pluck().get();
    db.close();

    if (result === "ok") {
      return {
        status: "ok",
        detail: sqlitePath
      };
    }

    return {
      status: "degraded",
      detail: `integrity_check returned ${String(result)}`
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not run sqlite integrity_check"
    };
  }
}

async function checkPolicyBootstrap(sqlitePath: string): Promise<ReadinessCheck> {
  if (!fs.existsSync(sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    const schemaReady = db.prepare(`
      SELECT value_json
      FROM policy_values
      WHERE key = 'schema_ready'
    `).pluck().get();
    const requiredKeys = Object.keys(policySchema.systemReservedRows);
    const presentRows = db.prepare(`
        SELECT key
        FROM policy_values
        WHERE key IN (${requiredKeys.map(() => "?").join(",")})
      `).all(...requiredKeys) as Array<{ key: string }>;
    const presentKeys = new Set(presentRows.map((row) => row.key));
    db.close();

    const missingKeys = requiredKeys.filter((key) => !presentKeys.has(key));
    if (schemaReady !== "true" || missingKeys.length > 0) {
      return {
        status: "degraded",
        detail: "policy_values bootstrap is incomplete",
        schemaReady: schemaReady === "true",
        missingKeys
      };
    }

    return {
      status: "ok",
      detail: "policy_values bootstrap is ready",
      schemaReady: true,
      systemReservedRows: requiredKeys.length
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not inspect policy_values bootstrap"
    };
  }
}
