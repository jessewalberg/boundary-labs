import { openDatabase } from "@/server/db/client";
import { promoteApprovedFindingToRegression } from "@/server/regression-cases/promotion";
import { canonicalHash } from "@/server/safety-gate/canonical-hash";
import { ulid } from "ulid";

export type ApprovalRecord = {
  id: string;
  action: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  targetType: string;
  targetId: string | null;
  canonicalHash: string;
  payloadJson: string;
  createdAt: string;
};

export function listApprovals(status?: ApprovalRecord["status"]): ApprovalRecord[] {
  const db = openDatabase();
  try {
    const sql = `
      SELECT
        id,
        action,
        status,
        requested_by AS requestedBy,
        target_type AS targetType,
        target_id AS targetId,
        canonical_hash AS canonicalHash,
        payload_json AS payloadJson,
        created_at AS createdAt
      FROM approvals
      ${status ? "WHERE status = ?" : ""}
      ORDER BY created_at DESC
    `;
    return (status ? db.prepare(sql).all(status) : db.prepare(sql).all()) as ApprovalRecord[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}

export function countPendingApprovals() {
  return listApprovals("pending").length;
}

export function createApproval(input: {
  action: string;
  requestedBy: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
}) {
  const db = openDatabase();
  try {
    const id = ulid();
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(input.payload);
    db.prepare(`
      INSERT INTO approvals (
        id, action, status, requested_by, target_type, target_id, canonical_hash,
        payload_json, created_at
      ) VALUES (
        @id, @action, 'pending', @requested_by, @target_type, @target_id, @canonical_hash,
        @payload_json, @created_at
      )
    `).run({
      id,
      action: input.action,
      requested_by: input.requestedBy,
      target_type: input.targetType,
      target_id: input.targetId,
      canonical_hash: canonicalHash(input.payload),
      payload_json: payloadJson,
      created_at: now
    });
    return id;
  } finally {
    db.close();
  }
}

export function getApproval(id: string) {
  return listApprovals().find((approval) => approval.id === id);
}

export function approveApproval(id: string, reviewerId: string) {
  decideApproval(id, reviewerId, "approved", null);
}

export function rejectApproval(id: string, reviewerId: string, comment: string) {
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Rejecting an approval requires a comment.");
  if (trimmed.length > 1000) throw new Error("Reviewer comment must be 1000 characters or fewer.");
  decideApproval(id, reviewerId, "rejected", trimmed);
}

function decideApproval(
  id: string,
  reviewerId: string,
  status: "approved" | "rejected",
  comment: string | null
) {
  const db = openDatabase();
  try {
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      const approval = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
        | {
            id: string;
            action: string;
            status: string;
            canonical_hash: string;
            payload_json: string;
          }
        | undefined;
      if (!approval) throw new Error("Approval not found.");
      if (approval.status !== "pending") throw new Error("Approval has already been decided.");
      if (status === "approved" && canonicalHash(JSON.parse(approval.payload_json)) !== approval.canonical_hash) {
        writeApprovalAudit(db, "approval_mismatch", id, reviewerId, "denied", now);
        throw new Error("Approval payload canonical hash mismatch.");
      }
      if (status === "approved" && approval.action === "regression:promote") {
        promoteApprovedFindingToRegression(id, reviewerId, db);
      }

      db.prepare(`
        UPDATE approvals
        SET status = ?, reviewer_id = ?, reviewer_comment = ?, decided_at = ?
        WHERE id = ?
      `).run(status, reviewerId, comment, now, id);
      writeApprovalAudit(db, `approval:${status}`, id, reviewerId, "ok", now);
    });
    tx();
  } finally {
    db.close();
  }
}

function writeApprovalAudit(
  db: ReturnType<typeof openDatabase>,
  action: string,
  approvalId: string,
  reviewerId: string,
  outcome: string,
  occurredAt: string
) {
  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, 'operator', @actor_id, @action, 'approval', @target_id,
      @outcome, 'R25', NULL, '{}'
    )
  `).run({
    id: ulid(),
    occurred_at: occurredAt,
    actor_id: reviewerId,
    action,
    target_id: approvalId,
    outcome
  });
}
