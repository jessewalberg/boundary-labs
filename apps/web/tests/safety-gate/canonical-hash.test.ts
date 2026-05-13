import { describe, expect, it } from "vitest";
import { canonicalHash } from "../../src/server/safety-gate/canonical-hash";
import { evaluatePolicyAction } from "../../src/server/safety-gate/evaluate";
import { bootstrappedDb } from "./helpers";

describe("Safety Gate canonical hash", () => {
  it("is stable across object key order", () => {
    expect(canonicalHash({ b: 2, a: { z: true, c: [3, 2, 1] } })).toBe(
      canonicalHash({ a: { c: [3, 2, 1], z: true }, b: 2 })
    );
  });

  it("refuses approved execution when the payload changes", () => {
    const { db } = bootstrappedDb();
    const approvedHash = canonicalHash({
      seedId: "seed-1",
      severity: "med"
    });

    const decision = evaluatePolicyAction({
      db,
      action: "red_team:mutate_seed",
      approvedCanonicalHash: approvedHash,
      payload: {
        seedId: "seed-1",
        severity: "critical"
      }
    });

    expect(decision).toMatchObject({
      outcome: "deny",
      ruleRef: "R15"
    });
    expect(db.prepare("SELECT action FROM audit_events WHERE action = 'approval_mismatch'").get()).toMatchObject({
      action: "approval_mismatch"
    });
    db.close();
  });
});
