import { ulid } from "ulid";
import { canonicalHash } from "@/server/safety-gate/canonical-hash";
import {
  approvalPathFor,
  assertPolicySchemaLoaded,
  assertSystemReservedRowsPresent,
  loadPolicyValues,
  valueFor,
  type LoadedPolicyValue
} from "@/server/safety-gate/load";
import {
  evaluatePolicyWriteGuard,
  type PolicyWriteProposal
} from "@/server/safety-gate/policy-write-guard";
import {
  policySchema,
  type ApprovalPath,
  type OperatorRole,
  type PolicyAction
} from "@/server/safety-gate/schema";
import { snapshotPolicyValues } from "@/server/safety-gate/snapshot";
import type { BoundaryDatabase } from "@/server/db/client";
import type { JsonValue } from "@/server/db/schema";

export type PolicyDecision =
  | {
      outcome: "allow";
      approvalPath: ApprovalPath;
      ruleRef: string;
      canonicalHash: string;
      policySnapshotHash: string | null;
    }
  | {
      outcome: "approval_required";
      approvalPath: Exclude<ApprovalPath, "auto" | "deny">;
      ruleRef: string;
      canonicalHash: string;
      policySnapshotHash: string | null;
      reason: string;
    }
  | {
      outcome: "deny";
      approvalPath: ApprovalPath;
      ruleRef: string;
      canonicalHash: string;
      policySnapshotHash: string | null;
      reason: string;
    };

export type EvaluatePolicyInput = {
  action: PolicyAction;
  actorRole?: OperatorRole;
  actorId?: string | null;
  payload?: JsonValue | Record<string, unknown>;
  db?: BoundaryDatabase;
  approvedCanonicalHash?: string;
  policyWriteProposals?: PolicyWriteProposal[];
  audit?: boolean;
};

export function can(role: OperatorRole, action: PolicyAction) {
  return (policySchema.roleActions[role] as readonly PolicyAction[]).includes(action);
}

export function evaluatePolicyAction(input: EvaluatePolicyInput): PolicyDecision {
  assertPolicySchemaLoaded();

  const actionSchema = policySchema.actions[input.action];
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const policyRows = input.db ? loadPolicyValues(input.db) : [];
  const policyMap = new Map(policyRows.map((row) => [row.key, row]));
  const snapshot = policyRows.length > 0 ? snapshotPolicyValues(policyRows) : null;
  const requestHash = canonicalHash(payload);

  if (policyRows.length > 0) {
    assertSystemReservedRowsPresent(policyRows);
  }

  if (input.actorRole && !can(input.actorRole, input.action)) {
    return deny(input, {
      approvalPath: actionSchema.defaultApprovalPath,
      ruleRef: actionSchema.ruleRef,
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null,
      reason: `${input.actorRole} is not allowed to perform ${input.action}.`,
      auditAction: input.action
    });
  }

  const missingPolicyKeys = actionSchema.requiredPolicyKeys.filter((key) => !policyMap.has(key));
  if (input.db && missingPolicyKeys.length > 0) {
    return deny(input, {
      approvalPath: actionSchema.defaultApprovalPath,
      ruleRef: actionSchema.ruleRef,
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null,
      reason: `Missing policy_values rows: ${missingPolicyKeys.join(", ")}.`,
      auditAction: input.action
    });
  }

  if (input.approvedCanonicalHash && input.approvedCanonicalHash !== requestHash) {
    return deny(input, {
      approvalPath: actionSchema.defaultApprovalPath,
      ruleRef: "R15",
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null,
      reason: "Approved action canonical hash does not match the execution payload.",
      auditAction: "approval_mismatch"
    });
  }

  if (input.action === "policy:write") {
    const proposals = input.policyWriteProposals ?? proposalsFromPayload(payload);
    const guard = evaluatePolicyWriteGuard(proposals, policyRows);
    if (!guard.ok) {
      return deny(input, {
        approvalPath: "admin",
        ruleRef: guard.ruleRef,
        canonicalHash: requestHash,
        policySnapshotHash: snapshot?.hash ?? null,
        reason: guard.reason,
        auditAction: "policy_write_self_protect_denied",
        targetId: guard.deniedKey
      });
    }
  }

  const approvalPath = resolveApprovalPath(input.action, policyMap, payload);

  if (approvalPath === "deny") {
    return deny(input, {
      approvalPath,
      ruleRef: actionSchema.ruleRef,
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null,
      reason: `${input.action} is denied by policy.`,
      auditAction: input.action
    });
  }

  if (
    input.action === "data_mode:flip_real_phi" &&
    valueFor<boolean>(policyMap, "baa_acknowledged", false) !== true
  ) {
    return deny(input, {
      approvalPath,
      ruleRef: "R16",
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null,
      reason: "Real-PHI mode requires baa_acknowledged=true.",
      auditAction: input.action
    });
  }

  if (input.action === "red_team:mutate_seed") {
    const pendingCount = Number(payload.pendingApprovalCount ?? 0);
    const cap = Number(valueFor(policyMap, "red_team_pending_cap", 10));
    if (pendingCount >= cap) {
      return deny(input, {
        approvalPath,
        ruleRef: "R16",
        canonicalHash: requestHash,
        policySnapshotHash: snapshot?.hash ?? null,
        reason: "Per-category pending approval cap exceeded.",
        auditAction: "red_team_cap_exceeded"
      });
    }
  }

  if (approvalPath === "auto" || input.approvedCanonicalHash) {
    return {
      outcome: "allow",
      approvalPath,
      ruleRef: actionSchema.ruleRef,
      canonicalHash: requestHash,
      policySnapshotHash: snapshot?.hash ?? null
    };
  }

  return {
    outcome: "approval_required",
    approvalPath,
    ruleRef: actionSchema.ruleRef,
    canonicalHash: requestHash,
    policySnapshotHash: snapshot?.hash ?? null,
    reason: `${input.action} requires ${approvalPath} approval.`
  };
}

function resolveApprovalPath(
  action: PolicyAction,
  policyMap: Map<string, LoadedPolicyValue>,
  payload: Record<string, unknown>
): ApprovalPath {
  const actionSchema = policySchema.actions[action];

  if (action === "red_team:mutate_seed") {
    const severity = String(payload.severity ?? "med");
    const policyKey = severity === "critical" || severity === "high"
      ? "red_team_mutate_high_critical"
      : "red_team_mutate_med";
    return approvalPathFor(policyMap, policyKey, actionSchema.defaultApprovalPath);
  }

  if (action === "judge:verdict") {
    const calibrationAccuracy = Number(payload.calibrationAccuracy ?? 1);
    const threshold = Number(valueFor(policyMap, "judge_calibration_threshold", 0.8));
    return calibrationAccuracy < threshold
      ? "reviewer"
      : approvalPathFor(policyMap, "judge_verdict", actionSchema.defaultApprovalPath);
  }

  const primaryPolicyKey = actionSchema.requiredPolicyKeys[0];
  if (primaryPolicyKey) {
    return approvalPathFor(policyMap, primaryPolicyKey, actionSchema.defaultApprovalPath);
  }

  return actionSchema.defaultApprovalPath;
}

function proposalsFromPayload(payload: Record<string, unknown>): PolicyWriteProposal[] {
  const changes = payload.changes;
  if (!Array.isArray(changes)) return [];

  return changes.flatMap((change): PolicyWriteProposal[] => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key : undefined;
    const operation = record.operation === "delete" || record.operation === "upsert" ? record.operation : undefined;
    if (!key || !operation) return [];

    if (operation === "delete") return [{ operation, key }];
    return [{
      operation,
      key,
      approvalPath: typeof record.approvalPath === "string" ? record.approvalPath : undefined,
      systemReserved: typeof record.systemReserved === "boolean" ? record.systemReserved : undefined
    }];
  });
}

function deny(
  input: EvaluatePolicyInput,
  result: Omit<Extract<PolicyDecision, { outcome: "deny" }>, "outcome"> & {
    auditAction: string;
    targetId?: string;
  }
): PolicyDecision {
  if (input.db && input.audit !== false) {
    writeDeniedAudit(input.db, input, result);
  }

  return {
    outcome: "deny",
    approvalPath: result.approvalPath,
    ruleRef: result.ruleRef,
    canonicalHash: result.canonicalHash,
    policySnapshotHash: result.policySnapshotHash,
    reason: result.reason
  };
}

function writeDeniedAudit(
  db: BoundaryDatabase,
  input: EvaluatePolicyInput,
  result: {
    auditAction: string;
    targetId?: string;
    ruleRef: string;
    policySnapshotHash: string | null;
    canonicalHash: string;
    reason: string;
  }
) {
  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, @actor_type, @actor_id, @action, @target_type, @target_id,
      'denied', @rule_ref, @policy_snapshot_hash, @metadata_json
    )
  `).run({
    id: ulid(),
    occurred_at: new Date().toISOString(),
    actor_type: input.actorRole ? "operator" : "system",
    actor_id: input.actorId ?? null,
    action: result.auditAction,
    target_type: input.action === "policy:write" ? "policy_values" : "policy_action",
    target_id: result.targetId ?? input.action,
    rule_ref: result.ruleRef,
    policy_snapshot_hash: result.policySnapshotHash,
    metadata_json: JSON.stringify({
      canonicalHash: result.canonicalHash,
      reason: result.reason
    })
  });
}
