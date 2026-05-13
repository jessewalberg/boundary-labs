import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { approveApproval, rejectApproval } from "../../src/server/approvals/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { canonicalHash } from "../../src/server/safety-gate/canonical-hash";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("approval decisions", () => {
  it("approves when canonical hash still matches", () => {
    const context = createSafetyGateContext("boundary-approval-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    insertApproval(context.sqlitePath, "approval-1", { seedId: "seed-1" });

    approveApproval("approval-1", "reviewer-1");

    const db = new Database(context.sqlitePath);
    expect(db.prepare("SELECT status FROM approvals WHERE id = 'approval-1'").get()).toMatchObject({
      status: "approved"
    });
    db.close();
  });

  it("rejects without comments and overlong comments", () => {
    const context = createSafetyGateContext("boundary-approval-reject-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    insertApproval(context.sqlitePath, "approval-1", { seedId: "seed-1" });

    expect(() => rejectApproval("approval-1", "reviewer-1", "")).toThrow(/requires a comment/);
    expect(() => rejectApproval("approval-1", "reviewer-1", "x".repeat(1001))).toThrow(/1000/);
  });

  it("blocks approval payload substitution", () => {
    const context = createSafetyGateContext("boundary-approval-mismatch-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    insertApproval(context.sqlitePath, "approval-1", { seedId: "seed-1" });
    const db = new Database(context.sqlitePath);
    db.prepare("UPDATE approvals SET payload_json = ? WHERE id = 'approval-1'").run(JSON.stringify({ seedId: "seed-2" }));
    db.close();

    expect(() => approveApproval("approval-1", "reviewer-1")).toThrow(/mismatch/);
  });
});

function insertApproval(sqlitePath: string, id: string, payload: unknown) {
  const db = new Database(sqlitePath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO approvals (
      id, action, status, requested_by, target_type, target_id, canonical_hash,
      payload_json, created_at
    ) VALUES (
      ?, 'seed:promote', 'pending', 'operator-1', 'seed', 'seed-1', ?, ?, ?
    )
  `).run(id, canonicalHash(payload), JSON.stringify(payload), now);
  db.close();
}
