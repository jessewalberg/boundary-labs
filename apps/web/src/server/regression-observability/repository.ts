import { openDatabase } from "@/server/db/client";

export type RegressionObservability = {
  categories: Array<{
    category: string;
    seedCount: number;
    regressionCaseCount: number;
    attempted: number;
    pass: number;
    fail: number;
    partial: number;
    invalid: number;
    reopened: number;
  }>;
  targetVersions: Array<{
    versionKey: string;
    comparable: boolean;
    attempted: number;
    pass: number;
    fail: number;
    partial: number;
    invalid: number;
  }>;
  cost: {
    totalCostMicros: number;
  };
};

export function getRegressionObservability(): RegressionObservability {
  const db = openDatabase();
  try {
    const categories = db.prepare(`
      WITH result_counts AS (
        SELECT
          category,
          COUNT(*) AS attempted,
          SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) AS pass,
          SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS fail,
          SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial,
          SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) AS invalid
        FROM regression_suite_results
        GROUP BY category
      ),
      reopened_counts AS (
        SELECT regression_cases.category, COUNT(*) AS reopened
        FROM vulnerability_lifecycle_events
        JOIN regression_cases ON regression_cases.id = vulnerability_lifecycle_events.regression_case_id
        WHERE vulnerability_lifecycle_events.status = 'reopened'
        GROUP BY regression_cases.category
      )
      SELECT
        regression_cases.category,
        COUNT(DISTINCT seeds.id) AS seedCount,
        COUNT(DISTINCT regression_cases.id) AS regressionCaseCount,
        COALESCE(result_counts.attempted, 0) AS attempted,
        COALESCE(result_counts.pass, 0) AS pass,
        COALESCE(result_counts.fail, 0) AS fail,
        COALESCE(result_counts.partial, 0) AS partial,
        COALESCE(result_counts.invalid, 0) AS invalid,
        COALESCE(reopened_counts.reopened, 0) AS reopened
      FROM regression_cases
      LEFT JOIN seeds ON seeds.category_slug = regression_cases.category
        OR replace(seeds.category, '_', '-') = regression_cases.category
      LEFT JOIN result_counts ON result_counts.category = regression_cases.category
      LEFT JOIN reopened_counts ON reopened_counts.category = regression_cases.category
      GROUP BY regression_cases.category
      ORDER BY regression_cases.category ASC
    `).all() as RegressionObservability["categories"];

    const targetVersions = db.prepare(`
      SELECT
        target_versions.version_key AS versionKey,
        target_versions.comparable AS comparable,
        COUNT(regression_suite_results.id) AS attempted,
        SUM(CASE WHEN regression_suite_results.status = 'pass' THEN 1 ELSE 0 END) AS pass,
        SUM(CASE WHEN regression_suite_results.status = 'fail' THEN 1 ELSE 0 END) AS fail,
        SUM(CASE WHEN regression_suite_results.status = 'partial' THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN regression_suite_results.status = 'invalid' THEN 1 ELSE 0 END) AS invalid
      FROM target_versions
      LEFT JOIN regression_suite_results ON regression_suite_results.target_version_id = target_versions.id
      GROUP BY target_versions.id
      HAVING attempted > 0
      ORDER BY target_versions.comparable ASC, target_versions.version_key ASC
    `).all().map((row) => {
      const record = row as Omit<RegressionObservability["targetVersions"][number], "comparable"> & { comparable: 0 | 1 };
      return { ...record, comparable: record.comparable === 1 };
    });

    const cost = db.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS totalCostMicros FROM run_costs").get() as {
      totalCostMicros: number;
    };

    return { categories, targetVersions, cost };
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) {
      return { categories: [], targetVersions: [], cost: { totalCostMicros: 0 } };
    }
    throw error;
  } finally {
    db.close();
  }
}
