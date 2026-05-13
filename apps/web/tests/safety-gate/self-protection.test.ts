import { describe, expect, it } from "vitest";
import { evaluatePolicyAction } from "../../src/server/safety-gate/evaluate";
import { bootstrappedDb } from "./helpers";

describe("Safety Gate policy:write self-protection", () => {
  it("denies deleting policy:write", () => {
    const { db } = bootstrappedDb();

    const decision = evaluatePolicyAction({
      db,
      action: "policy:write",
      actorRole: "admin",
      actorId: "admin-1",
      policyWriteProposals: [{ operation: "delete", key: "policy:write" }],
      payload: {
        changes: [{ operation: "delete", key: "policy:write" }]
      }
    });

    expect(decision).toMatchObject({
      outcome: "deny",
      reason: "System-reserved policy rows cannot be deleted."
    });
    expect(db.prepare("SELECT action, target_id FROM audit_events WHERE action = ?").get(
      "policy_write_self_protect_denied"
    )).toMatchObject({
      action: "policy_write_self_protect_denied",
      target_id: "policy:write"
    });
    db.close();
  });

  it("denies approval-path downgrades below a reserved row floor", () => {
    const { db } = bootstrappedDb();

    const decision = evaluatePolicyAction({
      db,
      action: "policy:write",
      actorRole: "admin",
      policyWriteProposals: [{ operation: "upsert", key: "baa_acknowledged", approvalPath: "auto" }],
      payload: {
        changes: [{ operation: "upsert", key: "baa_acknowledged", approvalPath: "auto" }]
      }
    });

    expect(decision).toMatchObject({
      outcome: "deny",
      ruleRef: "R16"
    });
    expect(db.prepare("SELECT target_id FROM audit_events WHERE action = ?").get(
      "policy_write_self_protect_denied"
    )).toMatchObject({
      target_id: "baa_acknowledged"
    });
    db.close();
  });
});
