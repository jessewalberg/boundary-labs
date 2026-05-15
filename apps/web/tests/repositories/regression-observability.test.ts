import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { getRegressionObservability } from "../../src/server/regression-observability/repository";
import { getOrchestratorState } from "../../src/server/orchestrator-state/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("regression observability read models", () => {
  it("separates seed coverage from confirmed regression cases and exposes rates, lifecycle, cost, and orchestrator state", () => {
    const context = createSafetyGateContext("boundary-regression-observability-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    seedObservabilityRows(context.sqlitePath);

    expect(getRegressionObservability()).toMatchObject({
      categories: [
        {
          category: "prompt-injection",
          seedCount: expect.any(Number),
          regressionCaseCount: 1,
          attempted: 2,
          pass: 1,
          fail: 0,
          partial: 0,
          invalid: 1
        },
        {
          category: "tool-misuse",
          regressionCaseCount: 1,
          attempted: 1,
          pass: 0,
          fail: 1,
          reopened: 1
        }
      ],
      targetVersions: expect.arrayContaining([
        expect.objectContaining({ versionKey: "unknown", comparable: false, attempted: 1 }),
        expect.objectContaining({ versionKey: "v2", comparable: true, fail: 1 })
      ]),
      cost: expect.objectContaining({ totalCostMicros: 1500 })
    });

    expect(getOrchestratorState()).toMatchObject({
      activeRegressionCount: 2,
      shouldRunRegressions: true,
      recentReopenedCount: 1,
      invalidResultRate: 1 / 3,
      decisions: expect.arrayContaining(["run_regressions", "escalate_human"])
    });
  });
});

function seedObservabilityRows(sqlitePath: string) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  db.exec(`
    INSERT INTO target_versions (id, version_key, label, source, comparable, created_at)
    VALUES
      ('target-v1', 'v1', 'v1', 'test', 1, '${now}'),
      ('target-v2', 'v2', 'v2', 'test', 1, '${now}'),
      ('target-unknown', 'unknown', 'Unknown', 'test', 0, '${now}');

    INSERT INTO findings (
      id, category, case_id, title, severity, status, first_seen_run_id,
      latest_run_id, created_at, updated_at
    ) VALUES
      ('finding-a', 'prompt-injection', 'case-a', 'A', 'high', 'resolved', 'run-1', 'run-1', '${now}', '${now}'),
      ('finding-b', 'tool-misuse', 'case-b', 'B', 'high', 'reopened', 'run-1', 'run-2', '${now}', '${now}');

    INSERT INTO regression_cases (
      id, finding_id, category, severity, title, status, created_at, updated_at
    ) VALUES
      ('case-a', 'finding-a', 'prompt-injection', 'high', 'A', 'active', '${now}', '${now}'),
      ('case-b', 'finding-b', 'tool-misuse', 'high', 'B', 'active', '${now}', '${now}');

    INSERT INTO regression_case_versions (
      id, regression_case_id, version, target_version_id, protected_behavior,
      required_evidence_json, invalid_conditions_json, deterministic_checks_json,
      judge_rubric_json, created_at
    ) VALUES
      ('case-a-v1', 'case-a', 1, 'target-v1', 'refuse', '[]', '[]', '[]', '{}', '${now}'),
      ('case-b-v1', 'case-b', 1, 'target-v1', 'refuse', '[]', '[]', '[]', '{}', '${now}');

    INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at)
    VALUES
      ('suite-1', 'target-v1', 'completed', 'test', '${now}'),
      ('suite-2', 'target-v2', 'completed', 'test', '${now}'),
      ('suite-unknown', 'target-unknown', 'completed', 'test', '${now}');

    INSERT INTO regression_suite_results (
      id, suite_id, regression_case_id, target_version_id, run_id, status,
      category, evidence_json, invalid_reason, is_reappearance,
      is_cross_category_regression, created_at
    ) VALUES
      ('result-a-pass', 'suite-1', 'case-a', 'target-v1', 'run-1', 'pass', 'prompt-injection', '{}', NULL, 0, 0, '${now}'),
      ('result-a-invalid', 'suite-unknown', 'case-a', 'target-unknown', 'run-unknown', 'invalid', 'prompt-injection', '{}', 'missing', 0, 0, '${now}'),
      ('result-b-fail', 'suite-2', 'case-b', 'target-v2', 'run-2', 'fail', 'tool-misuse', '{}', NULL, 1, 1, '${now}');

    INSERT INTO vulnerability_lifecycle_events (
      id, finding_id, regression_case_id, status, evidence_run_id,
      regression_suite_result_id, note, created_at
    ) VALUES (
      'life-b', 'finding-b', 'case-b', 'reopened', 'run-2', 'result-b-fail', 'reopened', '${now}'
    );

    INSERT INTO run_costs (
      id, run_id, suite_id, agent_role, cost_micros, currency, provenance, created_at
    ) VALUES
      ('cost-1', 'run-1', 'suite-1', 'red_team', 1000, 'USD', 'provider_reported', '${now}'),
      ('cost-2', 'run-2', 'suite-2', 'judge', 500, 'USD', 'estimated', '${now}');
  `);
  db.close();
}
