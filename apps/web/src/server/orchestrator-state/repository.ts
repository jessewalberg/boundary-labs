import { openDatabase } from "@/server/db/client";

export type OrchestratorState = {
  activeRegressionCount: number;
  shouldRunRegressions: boolean;
  recentReopenedCount: number;
  invalidResultRate: number;
  decisions: string[];
};

export function getOrchestratorState(): OrchestratorState {
  const db = openDatabase();
  try {
    const active = db.prepare("SELECT COUNT(*) AS count FROM regression_cases WHERE status = 'active'").get() as {
      count: number;
    };
    const reopened = db.prepare(`
      SELECT COUNT(*) AS count
      FROM vulnerability_lifecycle_events
      WHERE status = 'reopened'
    `).get() as { count: number };
    const resultCounts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) AS invalid
      FROM regression_suite_results
    `).get() as { total: number; invalid: number | null };

    const invalidResultRate = resultCounts.total > 0 ? (resultCounts.invalid ?? 0) / resultCounts.total : 0;
    const decisions: string[] = [];
    if (active.count > 0) decisions.push("run_regressions");
    if (reopened.count > 0 || invalidResultRate > 0.25) decisions.push("escalate_human");
    if (active.count === 0) decisions.push("explore_coverage_gaps");

    return {
      activeRegressionCount: active.count,
      shouldRunRegressions: active.count > 0,
      recentReopenedCount: reopened.count,
      invalidResultRate,
      decisions
    };
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) {
      return {
        activeRegressionCount: 0,
        shouldRunRegressions: false,
        recentReopenedCount: 0,
        invalidResultRate: 0,
        decisions: ["explore_coverage_gaps"]
      };
    }
    throw error;
  } finally {
    db.close();
  }
}
