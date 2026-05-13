import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { bootstrapPolicyValues, runDatabaseBootstrap } from "../../src/server/db/migrate";
import { createSafetyGateContext } from "./helpers";

describe("Safety Gate policy bootstrap audit", () => {
  it("writes a policy_loaded audit with a snapshot hash", () => {
    const context = createSafetyGateContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);

    const db = new Database(context.sqlitePath);
    const event = db.prepare(`
      SELECT policy_snapshot_hash, metadata_json
      FROM audit_events
      WHERE action = 'policy_loaded'
      ORDER BY occurred_at DESC
      LIMIT 1
    `).get() as { policy_snapshot_hash: string; metadata_json: string };
    const metadata = JSON.parse(event.metadata_json) as { rows: number; insertedKeys: string[] };

    expect(event.policy_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.rows).toBeGreaterThan(20);
    expect(metadata.insertedKeys).toContain("policy:write");
    db.close();
  });

  it("re-seeds a missing system-reserved row on bootstrap", () => {
    const context = createSafetyGateContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);

    const db = new Database(context.sqlitePath);
    db.prepare("DELETE FROM policy_values WHERE key = 'policy:write'").run();
    bootstrapPolicyValues(db, context.policySeedPath);

    expect(db.prepare("SELECT system_reserved FROM policy_values WHERE key = 'policy:write'").get()).toMatchObject({
      system_reserved: 1
    });
    db.close();
  });
});
