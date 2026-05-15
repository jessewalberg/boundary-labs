import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { ingestArtifactFile } from "../../src/server/ingest/from-artifact";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("regression artifact ingest", () => {
  it("persists missing-evidence regression passes as invalid results", () => {
    const context = createSafetyGateContext("boundary-regression-ingest-invalid-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);
    seedRegressionCase(context.sqlitePath, "case-a", "finding-a", "prompt-injection");
    seedSuite(context.sqlitePath, "suite-a", "case-a", "target-v2");
    const artifactPath = writeArtifact(context.root, {
      caseId: "case-a",
      suiteId: "suite-a",
      targetVersionId: "target-v2",
      status: "pass",
      category: "prompt_injection",
      turns: [{ turn: 1, input: "probe", endpoint: "/wrong", http: { status: 200, body: "refused" } }]
    });

    const db = new Database(context.sqlitePath);
    ingestArtifactFile(artifactPath, db);

    expect(db.prepare("SELECT status, invalid_reason FROM regression_suite_results WHERE regression_case_id = 'case-a'").get())
      .toMatchObject({ status: "invalid", invalid_reason: "missing_required_evidence:path:/chat" });
    db.close();
  });

  it("flags reappeared and cross-category regressions from previously passing cases", () => {
    const context = createSafetyGateContext("boundary-regression-ingest-reopen-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);
    seedRegressionCase(context.sqlitePath, "case-b", "finding-b", "tool-misuse");
    seedSuite(context.sqlitePath, "suite-b", "case-b", "target-v2");
    seedPriorPassingResult(context.sqlitePath, "case-b", "target-v1");
    const artifactPath = writeArtifact(context.root, {
      caseId: "case-b",
      suiteId: "suite-b",
      targetVersionId: "target-v2",
      targetVersionKey: "clinical-copilot@2026.05.15",
      fixedCategory: "prompt-injection",
      status: "fail",
      category: "tool_misuse",
      turns: [{ turn: 1, input: "probe", endpoint: "/chat", http: { status: 200, body: "leaked" } }]
    });

    const db = new Database(context.sqlitePath);
    ingestArtifactFile(artifactPath, db);
    ingestArtifactFile(artifactPath, db);

    expect(db.prepare(`
      SELECT status, is_reappearance, is_cross_category_regression
      FROM regression_suite_results
      WHERE suite_id = 'suite-b' AND regression_case_id = 'case-b'
    `).get()).toMatchObject({
      status: "fail",
      is_reappearance: 1,
      is_cross_category_regression: 1
    });
    expect(db.prepare("SELECT status FROM vulnerability_lifecycle_events WHERE finding_id = 'finding-b' ORDER BY created_at DESC LIMIT 1").get())
      .toMatchObject({ status: "reopened" });
    expect(db.prepare("SELECT status FROM findings WHERE id = 'finding-b'").get()).toMatchObject({ status: "reopened" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM findings WHERE category = 'tool-misuse' AND case_id = 'case-b'").get())
      .toMatchObject({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM vulnerability_lifecycle_events WHERE finding_id = 'finding-b' AND status = 'reopened'").get())
      .toMatchObject({ count: 1 });
    db.close();
  });
});

function seedRegressionCase(sqlitePath: string, caseId: string, findingId: string, category: string) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO findings (
      id, category, case_id, title, severity, status, first_seen_run_id,
      latest_run_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'high', 'resolved', 'run-0', 'run-0', ?, ?)
  `).run(findingId, category, caseId, caseId, now, now);
  db.prepare(`
    INSERT INTO target_versions (id, version_key, source, comparable, created_at)
    VALUES ('target-v1', 'v1', 'test', 1, ?), ('target-v2', 'v2', 'test', 1, ?)
    ON CONFLICT(version_key) DO NOTHING
  `).run(now, now);
  db.prepare(`
    INSERT INTO regression_cases (
      id, finding_id, category, severity, title, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'high', ?, 'active', ?, ?)
  `).run(caseId, findingId, category, caseId, now, now);
  db.prepare(`
    INSERT INTO regression_case_versions (
      id, regression_case_id, version, target_version_id, protected_behavior,
      required_evidence_json, invalid_conditions_json, deterministic_checks_json,
      judge_rubric_json, created_at
    ) VALUES (?, ?, 1, 'target-v1', 'Target refuses disclosure.',
      '[{"type":"path","value":"/chat"}]', '[{"type":"missing_required_evidence"}]',
      '[]', '{"pass":"refusal"}', ?)
  `).run(`${caseId}-v1`, caseId, now);
  db.close();
}

function seedSuite(sqlitePath: string, suiteId: string, caseId: string, targetVersionId: string) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at) VALUES (?, ?, 'running', 'test', ?)")
    .run(suiteId, targetVersionId, now);
  db.prepare("INSERT INTO regression_suite_cases (suite_id, regression_case_id, created_at) VALUES (?, ?, ?)")
    .run(suiteId, caseId, now);
  db.close();
}

function seedPriorPassingResult(sqlitePath: string, caseId: string, targetVersionId: string) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at) VALUES ('suite-prior', ?, 'completed', 'test', ?)")
    .run(targetVersionId, now);
  db.prepare("INSERT INTO regression_suite_cases (suite_id, regression_case_id, created_at) VALUES ('suite-prior', ?, ?)")
    .run(caseId, now);
  db.prepare(`
    INSERT INTO regression_suite_results (
      id, suite_id, regression_case_id, target_version_id, run_id, status,
      category, evidence_json, created_at
    ) VALUES ('result-prior', 'suite-prior', ?, ?, 'run-prior', 'pass', 'tool-misuse', '{}', ?)
  `).run(caseId, targetVersionId, now);
  db.close();
}

function writeArtifact(root: string, input: {
  caseId: string;
  suiteId: string;
  targetVersionId: string;
  targetVersionKey?: string;
  fixedCategory?: string;
  status: "pass" | "fail" | "partial" | "invalid";
  category: string;
  turns: unknown[];
}) {
  const artifactPath = path.join(root, "artifacts", `${input.caseId}.json`);
  const now = new Date().toISOString();
  fs.writeFileSync(artifactPath, JSON.stringify({
    run_id: `run-${input.caseId}`,
    case_source: "regression",
    regression_suite: {
      suite_id: input.suiteId,
      target_version_id: input.targetVersionId,
      target_version_key: input.targetVersionKey ?? "v2",
      fixed_category: input.fixedCategory
    },
    started_at: now,
    completed_at: now,
    target_url: "https://clinical-copilot.up.railway.app",
    summary: { total: 1, pass: input.status === "pass" ? 1 : 0, fail: input.status === "fail" ? 1 : 0, partial: 0, invalid: 0 },
    results: [{
      run_id: `run-${input.caseId}`,
      case_id: input.caseId,
      category: input.category,
      attempt: { attempt_id: `attempt-${input.caseId}`, observed_at: now, turns: input.turns },
      judge_agent: {
        verdict_id: `verdict-${input.caseId}`,
        status: input.status,
        severity: "high",
        rationale: "Regression result"
      }
    }]
  }), "utf8");
  return artifactPath;
}
