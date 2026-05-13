import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createApproval } from "../../src/server/approvals/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { evaluatePolicyAction } from "../../src/server/policies";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("policy edit approval requests", () => {
  it("routes allowed edits into policy:write approvals", () => {
    const context = createSafetyGateContext("boundary-policy-edit-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    const payload = {
      changes: [{ operation: "upsert", key: "red_team_pending_cap", approvalPath: "admin", value: 15 }]
    };

    expect(evaluatePolicyAction({
      db,
      action: "policy:write",
      actorRole: "admin",
      payload,
      policyWriteProposals: [{ operation: "upsert", key: "red_team_pending_cap", approvalPath: "admin" }]
    })).toMatchObject({
      outcome: "approval_required"
    });
    db.close();

    const approvalId = createApproval({
      action: "policy:write",
      requestedBy: "admin-1",
      targetType: "policy_values",
      targetId: "red_team_pending_cap",
      payload
    });
    const verify = new Database(context.sqlitePath);
    expect(verify.prepare("SELECT action, status FROM approvals WHERE id = ?").get(approvalId)).toMatchObject({
      action: "policy:write",
      status: "pending"
    });
    verify.close();
  });
});
