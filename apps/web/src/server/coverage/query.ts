import type { ThreatCoverage } from "@/server/campaigns/types";
import { openDatabase } from "@/server/db/client";

export function listThreatCoverage(): ThreatCoverage[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        seeds.category AS title,
        COUNT(DISTINCT seeds.id) AS seedCount,
        AVG(CASE WHEN verdicts.status = 'pass' THEN 1.0 WHEN verdicts.status IS NULL THEN NULL ELSE 0.0 END) AS passRate
      FROM seeds
      LEFT JOIN attempts ON attempts.seed_id = seeds.id
      LEFT JOIN verdicts ON verdicts.run_id = attempts.run_id AND verdicts.case_id = attempts.case_id
      GROUP BY seeds.category
      ORDER BY seeds.category ASC
    `).all() as Array<{
      title: string;
      seedCount: number;
      passRate: number | null;
    }>;

    if (rows.length > 0) {
      return rows.map((row, index) => ({
        section: `§${index + 1}`,
        title: row.title,
        seedCount: row.seedCount,
        passRate: row.passRate,
        status: row.seedCount > 0 ? "covered" : "deferred"
      }));
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
  } finally {
    db.close();
  }

  return [];
}
