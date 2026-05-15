import { openDatabase } from "@/server/db/client";

export type AgentTimelineRecord = {
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
  traceRef: string | null;
  artifactRef: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadataJson: string;
  createdAt: string;
};

export function listAgentTimeline(input: { runId?: string; suiteId?: string } = {}): AgentTimelineRecord[] {
  const db = openDatabase();
  try {
    const clauses: string[] = [];
    const params: string[] = [];
    if (input.runId) {
      clauses.push("run_id = ?");
      params.push(input.runId);
    }
    if (input.suiteId) {
      clauses.push("suite_id = ?");
      params.push(input.suiteId);
    }
    const sql = `
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
        trace_ref AS traceRef,
        artifact_ref AS artifactRef,
        started_at AS startedAt,
        completed_at AS completedAt,
        metadata_json AS metadataJson,
        created_at AS createdAt
      FROM agent_timeline_events
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY sequence ASC
    `;
    return db.prepare(sql).all(...params) as AgentTimelineRecord[];
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}
