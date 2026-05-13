import { findings as fixtureFindings, type Finding } from "@/server/campaigns/fixtures";
import { openDatabase } from "@/server/db/client";

export function listFindings(): Finding[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        id,
        case_id AS seed,
        title,
        severity,
        status,
        COALESCE(updated_at, created_at) AS lastFail,
        latest_run_id AS latestRunId
      FROM findings
      ORDER BY updated_at DESC
    `).all() as Array<Omit<Finding, "note"> & { latestRunId: string | null }>;

    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        seed: row.seed,
        title: row.title,
        severity: row.severity,
        status: row.status,
        lastFail: row.lastFail,
        note: row.latestRunId ? `Latest failing run ${row.latestRunId}` : "Materialized from ingested artifact."
      }));
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
  } finally {
    db.close();
  }

  return fixtureFindings;
}

export function countOpenFindings() {
  return listFindings().filter((finding) => finding.status === "open").length;
}
