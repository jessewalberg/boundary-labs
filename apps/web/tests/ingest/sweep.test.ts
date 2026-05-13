import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { sweepArtifactIngest } from "../../src/server/ingest/sweep";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("artifact ingest sweep", () => {
  it("scans json artifacts under the configured artifact directory", () => {
    const context = createSafetyGateContext("boundary-sweep-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    const nested = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "runs");
    fs.mkdirSync(nested, { recursive: true });
    runDatabaseBootstrap(context);
    fs.writeFileSync(path.join(nested, "run-2.json"), JSON.stringify({
      run_id: "run-2",
      started_at: "2026-05-13T12:00:00.000Z",
      completed_at: "2026-05-13T12:00:02.000Z",
      target_url: "https://clinical-copilot.up.railway.app",
      summary: { total: 0, pass: 0, fail: 0, partial: 0, invalid: 0 },
      results: []
    }), "utf8");

    expect(sweepArtifactIngest(process.env.BOUNDARY_ARTIFACT_DIR)).toMatchObject({
      scanned: 1,
      ingested: 1,
      failed: 0
    });
  });
});
