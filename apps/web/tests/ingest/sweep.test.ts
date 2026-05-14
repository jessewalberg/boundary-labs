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

  it("skips campaign metadata artifacts", () => {
    const context = createSafetyGateContext("boundary-sweep-campaigns-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    const campaignsDir = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "campaigns");
    fs.mkdirSync(campaignsDir, { recursive: true });
    runDatabaseBootstrap(context);
    fs.writeFileSync(path.join(campaignsDir, "campaign-1.json"), JSON.stringify({
      id: "campaign-1",
      status: "queued"
    }), "utf8");

    expect(sweepArtifactIngest(process.env.BOUNDARY_ARTIFACT_DIR)).toMatchObject({
      scanned: 0,
      ingested: 0,
      failed: 0
    });
  });

  it("skips pydantic graph history artifacts", () => {
    const context = createSafetyGateContext("boundary-sweep-graph-history-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    const runDir = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "runs", "run-graph");
    fs.mkdirSync(runDir, { recursive: true });
    runDatabaseBootstrap(context);
    fs.writeFileSync(path.join(runDir, "run-graph.graph.json"), JSON.stringify([
      { kind: "node", status: "success" }
    ]), "utf8");

    expect(sweepArtifactIngest(process.env.BOUNDARY_ARTIFACT_DIR)).toMatchObject({
      scanned: 0,
      ingested: 0,
      failed: 0
    });
  });
});
