import { describe, expect, it } from "vitest";
import { can, evaluatePolicyAction } from "../../src/server/safety-gate/evaluate";
import { policySchema } from "../../src/server/safety-gate/schema";
import { bootstrappedDb } from "./helpers";

describe("Safety Gate policy evaluation", () => {
  it("keeps role checks centralized", () => {
    expect(can("operator", "campaign:create")).toBe(true);
    expect(can("operator", "target:manage")).toBe(false);
    expect(can("reviewer", "approval:review")).toBe(true);
  });

  it("evaluates tiered R16 policy rows from SQLite", () => {
    const { db } = bootstrappedDb();

    expect(evaluatePolicyAction({
      db,
      action: "red_team:mutate_seed",
      payload: { seedId: "seed-1", severity: "med", pendingApprovalCount: 0 }
    })).toMatchObject({
      outcome: "allow",
      approvalPath: "auto"
    });

    expect(evaluatePolicyAction({
      db,
      action: "red_team:mutate_seed",
      payload: { seedId: "seed-1", severity: "critical", pendingApprovalCount: 0 }
    })).toMatchObject({
      outcome: "approval_required",
      approvalPath: "reviewer"
    });

    expect(evaluatePolicyAction({
      db,
      action: "judge:verdict",
      payload: { attemptId: "attempt-1", calibrationAccuracy: 0.72 }
    })).toMatchObject({
      outcome: "approval_required",
      approvalPath: "reviewer"
    });

    db.close();
  });

  it("denies real-PHI mode until BAA is acknowledged", () => {
    const { db } = bootstrappedDb();

    const decision = evaluatePolicyAction({
      db,
      action: "data_mode:flip_real_phi",
      actorRole: "admin",
      payload: { from: "synthetic", to: "real_phi" }
    });

    expect(decision).toMatchObject({
      outcome: "deny",
      ruleRef: "R16"
    });
    db.close();
  });

  it("has parity coverage for every declared action", () => {
    expect(Object.keys(policySchema.actions).sort()).toEqual([
      "approval:review",
      "budget:raise",
      "campaign:cancel",
      "campaign:create",
      "campaign:run",
      "data_mode:flip_real_phi",
      "documentation:draft",
      "finding:triage",
      "judge:verdict",
      "low_signal:stop_rule",
      "orchestrator:new_category",
      "orchestrator:regression_sweep",
      "policy:write",
      "red_team:mutate_seed",
      "red_team:new_category",
      "regression:promote",
      "report:publish",
      "schedule:manage",
      "secret:manage",
      "seed:promote",
      "target:allowlist_add",
      "target:manage"
    ]);
  });
});
