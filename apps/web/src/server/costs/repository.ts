import { openDatabase } from "@/server/db/client";
import type { CostProvenance } from "@/server/db/schema";

export type RunCostRecord = {
  id: string;
  runId: string | null;
  suiteId: string | null;
  regressionCaseId: string | null;
  agentRole: string;
  provider: string | null;
  model: string | null;
  category: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestCount: number | null;
  costMicros: number | null;
  currency: string;
  provenance: CostProvenance;
  createdAt: string;
};

export function listRunCosts(runId?: string): RunCostRecord[] {
  const db = openDatabase();
  try {
    const sql = `
      SELECT
        id,
        run_id AS runId,
        suite_id AS suiteId,
        regression_case_id AS regressionCaseId,
        agent_role AS agentRole,
        provider,
        model,
        category,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        request_count AS requestCount,
        cost_micros AS costMicros,
        currency,
        provenance,
        created_at AS createdAt
      FROM run_costs
      ${runId ? "WHERE run_id = ?" : ""}
      ORDER BY agent_role ASC, created_at ASC
    `;
    return (runId ? db.prepare(sql).all(runId) : db.prepare(sql).all()) as RunCostRecord[];
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}
