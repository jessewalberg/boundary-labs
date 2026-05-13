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
        "schema_migrations"
      ])
    );
    expect(tableNames).toEqual(expect.arrayContaining(["user", "session", "account", "verification"]));
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 3 });
    expect(db.prepare("SELECT value_json FROM policy_values WHERE key = 'schema_ready'").get()).toMatchObject({
      value_json: "true"
    });
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
