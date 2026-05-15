import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { enqueueRegressionSuite } from "../../src/server/regression-suites/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("regression suite enqueue", () => {
  it("queues one regression_suite job with every active promoted case for a target version", () => {
    const context = createSafetyGateContext("boundary-regression-suite-enqueue-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = `${context.root}/artifacts`;
    runDatabaseBootstrap(context);
    insertActiveCase(context.sqlitePath, "case-a", "prompt-injection");
    insertActiveCase(context.sqlitePath, "case-b", "tool-misuse");

    const suite = enqueueRegressionSuite({
      targetUrl: "https://clinical-copilot.up.railway.app",
      targetVersionKey: "clinical-copilot@2026.05.15",
      requestedBy: "orchestrator",
      triggeredBy: "orchestrator"
    });

    const db = new Database(context.sqlitePath);
    const job = db.prepare("SELECT job_type, payload_json FROM campaign_jobs WHERE campaign_id = ?").get(suite.runId) as {
      job_type: string;
      payload_json: string;
    };
    expect(job.job_type).toBe("regression_suite");
    expect(JSON.parse(job.payload_json)).toMatchObject({
      regressionSuiteId: suite.id,
      targetVersionKey: "clinical-copilot@2026.05.15",
      caseIds: ["case-a", "case-b"],
      categories: ["prompt-injection", "tool-misuse"]
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM regression_suite_cases WHERE suite_id = ?").get(suite.id))
      .toMatchObject({ count: 2 });
    db.close();
  });
});

function insertActiveCase(sqlitePath: string, id: string, category: string) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  const targetVersion = db.prepare("SELECT id FROM target_versions WHERE version_key = 'baseline'").get() as
    | { id: string }
    | undefined;
  const targetVersionId = targetVersion?.id ?? "target-baseline";
  db.prepare(`
    INSERT INTO target_versions (id, version_key, source, comparable, created_at)
    VALUES (?, 'baseline', 'test', 1, ?)
    ON CONFLICT(version_key) DO NOTHING
  `).run(targetVersionId, now);
  db.prepare(`
    INSERT INTO regression_cases (
      id, category, severity, title, status, created_at, updated_at
    ) VALUES (?, ?, 'high', ?, 'active', ?, ?)
  `).run(id, category, id, now, now);
  db.prepare(`
    INSERT INTO regression_case_versions (
      id, regression_case_id, version, target_version_id, protected_behavior,
      required_evidence_json, invalid_conditions_json, deterministic_checks_json,
      judge_rubric_json, created_at
    ) VALUES (?, ?, 1, ?, 'refuse', '[{"type":"path","value":"/chat"}]',
      '[{"type":"missing_required_evidence"}]', '[]', '{}', ?)
  `).run(`${id}-v1`, id, targetVersionId, now);
  db.close();
}
