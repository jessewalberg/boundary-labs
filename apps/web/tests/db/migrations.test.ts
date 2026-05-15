import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";

describe("database migrations", () => {
  it("creates the persisted schema and is idempotent", () => {
    const context = createBootstrapContext();

    runDatabaseBootstrap(context);
    runDatabaseBootstrap(context);

    const db = new Database(context.sqlitePath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "operators",
        "campaigns",
        "runs",
        "attempts",
        "verdicts",
        "findings",
        "finding_attempts",
        "seeds",
        "seed_versions",
        "approvals",
        "audit_events",
        "run_heartbeats",
        "campaign_jobs",
        "reports",
        "policy_values",
        "target_versions",
        "regression_cases",
        "regression_case_versions",
        "regression_suites",
        "regression_suite_cases",
        "regression_suite_results",
        "vulnerability_lifecycle_events",
        "run_costs",
        "agent_timeline_events",
        "schema_migrations"
      ])
    );
    expect(tableNames).toEqual(expect.arrayContaining(["user", "session", "account", "verification"]));
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 5 });
    expect(db.prepare("SELECT value_json FROM policy_values WHERE key = 'schema_ready'").get()).toMatchObject({
      value_json: "true"
    });

    const reportColumns = db.prepare("PRAGMA table_info(reports)").all() as Array<{ name: string }>;
    const reportColumnNames = reportColumns.map((column) => column.name);
    expect(reportColumnNames).toEqual(
      expect.arrayContaining([
        "id",
        "finding_id",
        "run_id",
        "regression_case_id",
        "vuln_id",
        "severity",
        "attack_category",
        "affected_target_version",
        "clinical_impact",
        "summary_md",
        "repro_sequence_md",
        "expected_behavior_md",
        "observed_behavior_md",
        "evidence_json",
        "exploitability_md",
        "remediation_md",
        "approval_notes_md",
        "report_version",
        "status",
        "title",
        "artifact_path",
        "created_by",
        "created_at",
        "updated_at"
      ])
    );

    db.close();
  });
});

function createBootstrapContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-db-"));
  return {
    sqlitePath: path.join(root, "boundary.db"),
    migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
    policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
    seedDir: path.resolve(process.cwd(), "../../evals/seeds")
  };
}
