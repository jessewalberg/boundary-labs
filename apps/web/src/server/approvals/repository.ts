import { openDatabase } from "@/server/db/client";

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
