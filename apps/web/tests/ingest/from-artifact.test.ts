import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { ingestArtifactFile } from "../../src/server/ingest/from-artifact";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("artifact ingest", () => {
  it("materializes run artifacts idempotently", () => {
    const context = createSafetyGateContext("boundary-ingest-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);

    const artifactPath = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "run-1.json");
    fs.writeFileSync(artifactPath, JSON.stringify(buildArtifact()), "utf8");
    const db = new Database(context.sqlitePath);

    const first = ingestArtifactFile(artifactPath, db);
    const second = ingestArtifactFile(artifactPath, db);

    expect(first.inserted).toMatchObject({
      campaigns: 1,
      runs: 1,
      attempts: 2,
      verdicts: 2,
      findings: 1
    });
    expect(second.inserted).toMatchObject({
      campaigns: 0,
      runs: 0,
      attempts: 0,
      verdicts: 0
    });
    expect(db.prepare("SELECT severity FROM verdicts WHERE case_id = 'case-fail'").get()).toMatchObject({
      severity: "med"
    });
    expect(db.prepare("SELECT judge_model AS judgeModel FROM verdicts WHERE case_id = 'case-fail'").get()).toMatchObject({
      judgeModel: "pydantic-ai:openrouter:google/gemini-2.5-flash"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM findings").get()).toMatchObject({ count: 1 });
    db.close();
  });

  it("marks an existing queued campaign completed when its run artifact arrives", () => {
    const context = createSafetyGateContext("boundary-ingest-existing-campaign-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);

    const db = new Database(context.sqlitePath);
    db.prepare(`
      INSERT INTO campaigns (
        id, target_url, categories_json, status, data_mode, budget_cents,
        submitted_by, artifact_path, created_at, updated_at
      ) VALUES (
        'run-1', 'https://old.example.test', '[]', 'queued', 'synthetic', 500,
        'operator-1', 'queued.json', '2026-05-13T11:00:00.000Z', '2026-05-13T11:00:00.000Z'
      )
    `).run();

    const artifact = buildArtifact() as ReturnType<typeof buildArtifact> & {
      results: [{ attempt: { turns: [{ http: { body: unknown } }] } }];
    };
    artifact.results[0].attempt.turns[0].http.body = { detail: "missing_smart_session" };
    const artifactPath = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "run-1.json");
    fs.writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");

    ingestArtifactFile(artifactPath, db);

    expect(db.prepare("SELECT status, target_url AS targetUrl FROM campaigns WHERE id = 'run-1'").get()).toMatchObject({
      status: "completed",
      targetUrl: "https://clinical-copilot.up.railway.app"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM runs WHERE run_id = 'run-1'").get()).toMatchObject({ count: 1 });
    db.close();
  });

  it("rejects artifact paths outside the configured jail and audits the refusal", () => {
    const context = createSafetyGateContext("boundary-ingest-jail-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);

    const escapedPath = path.join(context.root, "outside.json");
    fs.writeFileSync(escapedPath, JSON.stringify(buildArtifact()), "utf8");
    const db = new Database(context.sqlitePath);

    expect(() => ingestArtifactFile(escapedPath, db)).toThrow(/escapes/);
    expect(db.prepare("SELECT action FROM audit_events WHERE action = 'ingest_failed_path_escape'").get()).toMatchObject({
      action: "ingest_failed_path_escape"
    });
    db.close();
  });
});

function buildArtifact() {
  return {
    run_id: "run-1",
    started_at: "2026-05-13T12:00:00.000Z",
    completed_at: "2026-05-13T12:00:02.000Z",
    target_url: "https://clinical-copilot.up.railway.app",
    summary: { total: 2, pass: 1, fail: 1, partial: 0, invalid: 0 },
    results: [
      {
        run_id: "run-1",
        case_id: "case-pass",
        category: "prompt_injection",
        subcategory: "direct",
        attempt: {
          attempt_id: "attempt-pass",
          observed_at: "2026-05-13T12:00:01.000Z",
          turns: [{ turn: 1, input: "safe", http: { status: 200, body: "refused" } }]
        },
        judge_agent: {
          verdict_id: "verdict-pass",
          status: "pass",
          severity: "high",
          rationale: "Refused safely."
        }
      },
      {
        run_id: "run-1",
        case_id: "case-fail",
        category: "authorization_bypass",
        subcategory: "cross_patient",
        attempt: {
          attempt_id: "attempt-fail",
          observed_at: "2026-05-13T12:00:02.000Z",
          turns: [{ turn: 1, input: "unsafe", http: { status: 200, body: "leaked" } }]
        },
        judge_agent: {
          verdict_id: "verdict-fail",
          status: "fail",
          severity: "medium",
          rationale: "Matched prohibited pattern.",
          execution_mode: "pydantic-ai:openrouter:google/gemini-2.5-flash",
          provider_status: "executed",
          provider_decision: "applied",
          provider_review: "{\"verdicts\":[]}"
        }
      }
    ]
  };
}
