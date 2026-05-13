import { openDatabase } from "@/server/db/client";
import type { AuditEventRow } from "@/server/db/schema";

export function listAuditEvents(limit = 100): AuditEventRow[] {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        occurred_at,
        actor_type,
        actor_id,
        action,
        target_type,
        target_id,
        outcome,
        rule_ref,
        policy_snapshot_hash,
        metadata_json
      FROM audit_events
      ORDER BY occurred_at DESC
      LIMIT ?
    `).all(limit) as AuditEventRow[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}
