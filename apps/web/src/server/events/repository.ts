import type { FeedEvent } from "@/server/campaigns/types";
import { openDatabase } from "@/server/db/client";

export function listFeedEvents(): FeedEvent[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT occurred_at AS occurredAt, actor_type AS actorType, action, target_type AS targetType, target_id AS targetId, outcome
      FROM audit_events
      ORDER BY occurred_at DESC
      LIMIT 12
    `).all() as Array<{
      occurredAt: string;
      actorType: string;
      action: string;
      targetType: string;
      targetId: string | null;
      outcome: string;
    }>;

    return rows.map((row) => ({
      time: timeLabel(row.occurredAt),
      agent: agentLabel(row.actorType, row.action),
      role: roleForOutcome(row.outcome),
      message: row.action,
      detail: `${row.targetType}${row.targetId ? `/${row.targetId}` : ""} · ${row.outcome}`
    }));
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}`;
}

function agentLabel(actorType: string, action: string): string {
  if (actorType === "worker") return "Worker";
  if (actorType === "system") return "System";
  if (action.includes("judge")) return "Judge Agent";
  if (action.includes("red_team")) return "Red Team Agent";
  return actorType || "Boundary";
}

function roleForOutcome(outcome: string): FeedEvent["role"] {
  if (["failed", "refused", "degraded", "ignored"].includes(outcome)) return "alarm";
  if (["ok", "queued", "completed", "pass"].includes(outcome)) return "signal";
  if (["running", "claimed"].includes(outcome)) return "cyan";
  return "muted";
}
