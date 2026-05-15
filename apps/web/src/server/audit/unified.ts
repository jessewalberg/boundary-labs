import fs from "node:fs";
import { openDatabase } from "@/server/db/client";

export type AuditTimelineSource = "system" | "agent" | "tool";

export type AuditTimelineRow = {
  id: string;
  occurredAt: string;
  source: AuditTimelineSource;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  detail: string;
  href: string | null;
};

type Options = {
  limit?: number;
  sources?: AuditTimelineSource[];
  toolArtifactLimit?: number;
};

const DEFAULT_LIMIT = 200;
const DEFAULT_TOOL_ARTIFACT_LIMIT = 12;

export function listUnifiedAuditTimeline(options: Options = {}): AuditTimelineRow[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const sources = options.sources ?? ["system", "agent", "tool"];
  const wantSystem = sources.includes("system");
  const wantAgent = sources.includes("agent");
  const wantTool = sources.includes("tool");
  const rows: AuditTimelineRow[] = [];

  if (wantSystem) rows.push(...readSystemAuditRows(limit));
  if (wantAgent) rows.push(...readAgentTimelineRows(limit));
  if (wantTool) rows.push(...readToolInvocationRows(options.toolArtifactLimit ?? DEFAULT_TOOL_ARTIFACT_LIMIT));

  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return rows.slice(0, limit);
}

function readSystemAuditRows(limit: number): AuditTimelineRow[] {
  const db = openDatabase();
  try {
    const records = db.prepare(`
      SELECT
        id,
        occurred_at AS occurredAt,
        actor_type AS actorType,
        actor_id AS actorId,
        action,
        target_type AS targetType,
        target_id AS targetId,
        outcome,
        rule_ref AS ruleRef,
        policy_snapshot_hash AS policySnapshotHash
      FROM audit_events
      ORDER BY occurred_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      occurredAt: string;
      actorType: string;
      actorId: string | null;
      action: string;
      targetType: string;
      targetId: string | null;
      outcome: string;
      ruleRef: string | null;
      policySnapshotHash: string | null;
    }>;
    return records.map((row) => ({
      id: `sys:${row.id}`,
      occurredAt: row.occurredAt,
      source: "system" as const,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      outcome: row.outcome,
      detail: detailForSystem(row.ruleRef, row.policySnapshotHash),
      href: hrefForTarget(row.targetType, row.targetId)
    }));
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}

function readAgentTimelineRows(limit: number): AuditTimelineRow[] {
  const db = openDatabase();
  try {
    const records = db.prepare(`
      SELECT
        id,
        run_id AS runId,
        suite_id AS suiteId,
        regression_case_id AS regressionCaseId,
        sequence,
        agent_role AS agentRole,
        action,
        input_ref AS inputRef,
        output_ref AS outputRef,
        status,
        cost_micros AS costMicros,
        started_at AS startedAt,
        completed_at AS completedAt,
        created_at AS createdAt
      FROM agent_timeline_events
      ORDER BY COALESCE(started_at, created_at) DESC, sequence DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      runId: string | null;
      suiteId: string | null;
      regressionCaseId: string | null;
      sequence: number;
      agentRole: string;
      action: string;
      inputRef: string | null;
      outputRef: string | null;
      status: string;
      costMicros: number | null;
      startedAt: string | null;
      completedAt: string | null;
      createdAt: string;
    }>;
    return records.map((row) => {
      const targetType = row.runId ? "run" : row.suiteId ? "regression_suite" : row.regressionCaseId ? "regression_case" : "agent";
      const targetId = row.runId ?? row.suiteId ?? row.regressionCaseId;
      return {
        id: `agent:${row.id}`,
        occurredAt: row.startedAt ?? row.createdAt,
        source: "agent" as const,
        actorType: row.agentRole,
        actorId: null,
        action: row.action,
        targetType,
        targetId,
        outcome: row.status,
        detail: detailForAgent(row.inputRef, row.outputRef, row.costMicros, row.sequence),
        href: hrefForTarget(targetType, targetId)
      };
    });
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}

function readToolInvocationRows(artifactLimit: number): AuditTimelineRow[] {
  const db = openDatabase();
  let artifactsForAttempts: Array<{ runId: string; caseId: string; observedAt: string; artifactPath: string | null }>;
  try {
    artifactsForAttempts = db.prepare(`
      SELECT
        attempts.run_id AS runId,
        attempts.case_id AS caseId,
        attempts.created_at AS observedAt,
        attempts.request_artifact_path AS artifactPath
      FROM attempts
      WHERE attempts.request_artifact_path IS NOT NULL
      ORDER BY attempts.created_at DESC
      LIMIT ?
    `).all(artifactLimit) as typeof artifactsForAttempts;
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }

  const rows: AuditTimelineRow[] = [];
  for (const attempt of artifactsForAttempts) {
    if (!attempt.artifactPath || !fs.existsSync(attempt.artifactPath)) continue;
    let parsed: ArtifactWithTurns;
    try {
      parsed = JSON.parse(fs.readFileSync(attempt.artifactPath, "utf8")) as ArtifactWithTurns;
    } catch {
      continue;
    }
    const result = parsed.results?.find(
      (item) => item.run_id === attempt.runId && item.case_id === attempt.caseId
    );
    const turns = result?.attempt?.turns ?? [];
    for (const turn of turns) {
      const events = turn.events ?? [];
      for (let idx = 0; idx < events.length; idx += 1) {
        const event = events[idx];
        const eventName = typeof event.event === "string" ? event.event : "";
        if (eventName !== "tool_started" && eventName !== "tool_completed") continue;
        const data = (event.data ?? {}) as Record<string, unknown>;
        const name = typeof data.name === "string" ? data.name : "tool";
        const status = typeof data.status === "string" ? data.status : "ok";
        const errorCode = typeof data.error_code === "string" ? data.error_code : null;
        const summary = typeof data.args_summary === "string" ? data.args_summary : null;
        rows.push({
          id: `tool:${attempt.runId}:${attempt.caseId}:${turn.turn ?? 0}:${idx}`,
          occurredAt: attempt.observedAt,
          source: "tool",
          actorType: "target",
          actorId: name,
          action: `${eventName}:${name}`,
          targetType: "run",
          targetId: attempt.runId,
          outcome: eventName === "tool_started" ? "started" : status,
          detail: detailForTool(eventName, summary, errorCode),
          href: hrefForTarget("run", attempt.runId)
        });
      }
    }
  }
  return rows;
}

type ArtifactWithTurns = {
  results?: Array<{
    run_id?: unknown;
    case_id?: unknown;
    attempt?: {
      turns?: Array<{
        turn?: number;
        events?: Array<{ event?: string; data?: unknown }>;
      }>;
    };
  }>;
};

function detailForSystem(ruleRef: string | null, snapshotHash: string | null): string {
  const parts: string[] = [];
  if (ruleRef) parts.push(`rule:${ruleRef}`);
  if (snapshotHash) parts.push(`snapshot:${snapshotHash.slice(0, 12)}`);
  return parts.join(" · ") || "system-of-record entry";
}

function detailForAgent(
  inputRef: string | null,
  outputRef: string | null,
  costMicros: number | null,
  sequence: number
): string {
  const parts: string[] = [`seq:${sequence}`];
  if (inputRef) parts.push(`in:${inputRef}`);
  if (outputRef) parts.push(`out:${outputRef}`);
  if (costMicros && costMicros > 0) parts.push(`$${(costMicros / 1_000_000).toFixed(4)}`);
  return parts.join(" · ");
}

function detailForTool(eventName: string, summary: string | null, errorCode: string | null): string {
  const parts: string[] = [];
  if (summary) parts.push(summary);
  if (errorCode) parts.push(`error:${errorCode}`);
  if (parts.length === 0) parts.push(eventName === "tool_started" ? "invoked" : "completed");
  return parts.join(" · ");
}

function hrefForTarget(targetType: string, targetId: string | null): string | null {
  if (!targetId) {
    if (targetType === "system" || targetType === "policy" || targetType === "policy_value") return "/audit";
    return null;
  }
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case "campaign":
    case "campaign_job":
    case "run":
      return `/campaigns/${id}`;
    case "finding":
      return `/findings/${id}`;
    case "seed":
    case "seed_version":
      return `/seeds/${id}`;
    case "report":
      return `/reports/${id}`;
    case "regression_case":
    case "regression_suite":
    case "regression_suite_result":
      return `/regressions/${id}`;
    case "approval":
      return `/approvals/${id}`;
    case "target":
    case "target_version":
      return "/targets";
    case "policy_value":
    case "policy":
      return "/settings/policy";
    default:
      return null;
  }
}
