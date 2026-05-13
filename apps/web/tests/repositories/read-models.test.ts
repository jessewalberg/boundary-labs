import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { ingestArtifactFile } from "../../src/server/ingest/from-artifact";
import { listFindings } from "../../src/server/findings/repository";
import { listRuns } from "../../src/server/runs/repository";
import { listAttemptsForRun } from "../../src/server/attempts/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("repository read models", () => {
  it("serve ingested runs, attempts, and findings before fixture fallback", async () => {
    const context = createSafetyGateContext("boundary-repos-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);
    const artifactPath = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "repo-run.json");
    fs.writeFileSync(artifactPath, JSON.stringify({
      run_id: "repo-run",
      started_at: "2026-05-13T12:00:00.000Z",
      completed_at: "2026-05-13T12:00:03.000Z",
      target_url: "https://clinical-copilot.up.railway.app",
      summary: { total: 1, pass: 0, fail: 1, partial: 0, invalid: 0 },
      results: [{
        run_id: "repo-run",
        case_id: "repo-case",
        category: "tool_misuse",
        subcategory: "overbroad_query",
        attempt: {
          attempt_id: "repo-attempt",
          observed_at: "2026-05-13T12:00:01.000Z",
          turns: [{ turn: 1, input: "all observations", http: { status: 200, body: "all data" } }]
        },
        judge_agent: {
          verdict_id: "repo-verdict",
          status: "fail",
          severity: "critical",
          rationale: "Over-broad query was not scoped."
        }
      }]
    }), "utf8");
    const db = new Database(context.sqlitePath);
    ingestArtifactFile(artifactPath, db);
    db.close();

    expect((await listRuns()).find((run) => run.id === "repo-run")).toMatchObject({
      summary: { fail: 1 },
      seedCount: 1
    });
    expect(listAttemptsForRun("repo-run")[0]).toMatchObject({
      id: "repo-case",
      verdict: "fail",
      severity: "critical"
    });
    expect(listFindings()[0]).toMatchObject({
      seed: "repo-case",
      status: "open"
    });
  });
});
