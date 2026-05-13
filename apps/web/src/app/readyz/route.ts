import { ensureLocalStatePaths } from "@/server/storage/paths";
import { getBoundaryConfig } from "@/server/config";
import fs from "node:fs";

type ReadinessCheck = {
  status: "ok" | "skipped" | "degraded";
  detail?: string;
};

const WORKER_STALENESS_MS = 30_000;

export async function GET() {
  const config = getBoundaryConfig();
  const paths = ensureLocalStatePaths();
  const workerHeartbeat = checkWorkerHeartbeat(config.workerHeartbeatPath);
  const sqlite = await checkSqliteIntegrity(config.sqlitePath);
  const status = workerHeartbeat.status === "degraded" || sqlite.status === "degraded" ? "degraded" : "ok";

  return Response.json({
    status,
    service: "boundary-web",
    checks: {
      app: "ok",
      sqliteDirectory: paths.sqliteDir,
      artifactDirectory: paths.artifactDir,
      workerHeartbeat,
      sqlite,
      targetUrl: config.targetUrl,
      targetAllowlistCount: config.targetAllowlist.length,
      evalRunnerPath: config.evalRunnerPath,
      dataMode: config.dataMode
    }
  });
}

function checkWorkerHeartbeat(heartbeatPath: string): ReadinessCheck {
  try {
    const stat = fs.statSync(heartbeatPath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > WORKER_STALENESS_MS) {
      return {
        status: "degraded",
        detail: `worker heartbeat is stale (${Math.round(ageMs / 1000)}s old)`
      };
    }

    return {
      status: "ok",
      detail: heartbeatPath
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        status: "skipped",
        detail: "worker heartbeat has not been written yet"
      };
    }

    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not read worker heartbeat"
    };
  }
}

async function checkSqliteIntegrity(sqlitePath: string): Promise<ReadinessCheck> {
  if (!fs.existsSync(sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  try {
    const mod = await importOptional("better-sqlite3");
    const Database = mod.default ?? mod;
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
    if (isNodeError(error) && error.code === "ERR_MODULE_NOT_FOUND") {
      return {
        status: "skipped",
        detail: "better-sqlite3 is not installed until the persistence unit lands"
      };
    }

    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not run sqlite integrity_check"
    };
  }
}

function importOptional(specifier: string): Promise<any> {
  return new Function("specifier", "return import(specifier)")(specifier);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
