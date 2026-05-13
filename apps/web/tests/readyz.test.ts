import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/readyz/route";
import { runDatabaseBootstrap } from "../src/server/db/migrate";
import { createSafetyGateContext } from "./safety-gate/helpers";

const originalSqlitePath = process.env.SQLITE_PATH;
const originalHeartbeatPath = process.env.BOUNDARY_WORKER_HEARTBEAT_PATH;

afterEach(() => {
  restoreEnv("SQLITE_PATH", originalSqlitePath);
  restoreEnv("BOUNDARY_WORKER_HEARTBEAT_PATH", originalHeartbeatPath);
});

describe("/readyz", () => {
  it("reports worker, sqlite, and policy bootstrap subchecks", async () => {
    const context = createSafetyGateContext("boundary-readyz-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("ok");
    expect(body.checks.workerHealth).toMatchObject({
      status: "ok",
      workerId: "worker-ci"
    });
    expect(body.checks.sqlite).toMatchObject({
      status: "ok"
    });
    expect(body.checks.policyBootstrap).toMatchObject({
      status: "ok",
      schemaReady: true
    });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
