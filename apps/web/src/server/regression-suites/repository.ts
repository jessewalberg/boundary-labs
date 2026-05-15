import { ulid } from "ulid";
import path from "node:path";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase } from "@/server/db/client";
import type { JsonValue, RegressionResultStatus } from "@/server/db/schema";

export type RegressionSuiteRecord = {
  id: string;
  targetVersionId: string;
  status: "queued" | "running" | "completed" | "failed";
  triggeredBy: string;
  createdAt: string;
  completedAt: string | null;
};

export type RegressionSuiteResultRecord = {
  id: string;
  suiteId: string;
  regressionCaseId: string;
  targetVersionId: string;
  runId: string | null;
  status: RegressionResultStatus;
  category: string;
  evidence: JsonValue;
  invalidReason: string | null;
  isReappearance: boolean;
  isCrossCategoryRegression: boolean;
  createdAt: string;
};

export function createRegressionSuite(input: {
  targetVersionId: string;
  triggeredBy: string;
  caseIds: string[];
}): RegressionSuiteRecord {
  const db = openDatabase();
  try {
    const id = ulid();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at)
        VALUES (?, ?, 'queued', ?, ?)
      `).run(id, input.targetVersionId, input.triggeredBy, now);

      const insertCase = db.prepare(`
        INSERT INTO regression_suite_cases (suite_id, regression_case_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const caseId of input.caseIds) {
        insertCase.run(id, caseId, now);
      }
    });
    tx();

    return {
      id,
      targetVersionId: input.targetVersionId,
      status: "queued",
      triggeredBy: input.triggeredBy,
      createdAt: now,
      completedAt: null
    };
  } finally {
    db.close();
  }
}

export function enqueueRegressionSuite(input: {
  targetUrl: string;
  targetVersionKey?: string;
  requestedBy: string;
  triggeredBy: string;
}) {
  const db = openDatabase();
  try {
    const now = new Date().toISOString();
    const runId = ulid();
    const suiteId = ulid();
    const jobId = ulid();
    const targetVersionKey = input.targetVersionKey?.trim() || "unknown";
    const targetVersionId = ulid();
    const artifactPath = path.join(getBoundaryConfig().artifactDir, "campaigns", `${runId}.json`);

    const activeCases = db.prepare(`
      SELECT id, category
      FROM regression_cases
      WHERE status = 'active'
      ORDER BY category ASC, created_at ASC
    `).all() as Array<{ id: string; category: string }>;
    const categories = Array.from(new Set(activeCases.map((row) => row.category)));
    const caseIds = activeCases.map((row) => row.id);

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO target_versions (id, version_key, label, source, comparable, created_at)
        VALUES (@id, @version_key, @label, @source, @comparable, @created_at)
        ON CONFLICT(version_key) DO NOTHING
      `).run({
        id: targetVersionId,
        version_key: targetVersionKey,
        label: targetVersionKey === "unknown" ? "Unknown target version" : targetVersionKey,
        source: input.triggeredBy,
        comparable: targetVersionKey === "unknown" ? 0 : 1,
        created_at: now
      });
      const target = db.prepare("SELECT id FROM target_versions WHERE version_key = ?").get(targetVersionKey) as { id: string };

      db.prepare(`
        INSERT INTO campaigns (
          id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
          artifact_path, created_at, updated_at
        ) VALUES (
          @id, @target_url, @categories_json, 'queued', 'synthetic', 0, @submitted_by,
          @artifact_path, @created_at, @updated_at
        )
      `).run({
        id: runId,
        target_url: normalizeTargetUrl(input.targetUrl),
        categories_json: JSON.stringify(categories),
        submitted_by: input.requestedBy,
        artifact_path: artifactPath,
        created_at: now,
        updated_at: now
      });

      db.prepare(`
        INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at)
        VALUES (?, ?, 'queued', ?, ?)
      `).run(suiteId, target.id, input.triggeredBy, now);

      const insertSuiteCase = db.prepare(`
        INSERT INTO regression_suite_cases (suite_id, regression_case_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const caseId of caseIds) insertSuiteCase.run(suiteId, caseId, now);

      db.prepare(`
        INSERT INTO campaign_jobs (
          id, campaign_id, job_type, status, submitted_by, payload_json, created_at, updated_at
        ) VALUES (
          @id, @campaign_id, 'regression_suite', 'queued', @submitted_by, @payload_json, @created_at, @updated_at
        )
      `).run({
        id: jobId,
        campaign_id: runId,
        submitted_by: input.requestedBy,
        payload_json: JSON.stringify({
          targetUrl: normalizeTargetUrl(input.targetUrl),
          categories,
          regressionSuiteId: suiteId,
          targetVersionId: target.id,
          targetVersionKey,
          caseIds
        }),
        created_at: now,
        updated_at: now
      });
    });
    tx();

    const target = db.prepare("SELECT id FROM target_versions WHERE version_key = ?").get(targetVersionKey) as { id: string };
    return {
      id: suiteId,
      runId,
      jobId,
      targetVersionId: target.id,
      targetVersionKey,
      caseIds,
      categories
    };
  } finally {
    db.close();
  }
}

export function recordRegressionSuiteResult(input: {
  suiteId: string;
  regressionCaseId: string;
  targetVersionId: string;
  runId?: string | null;
  status: RegressionResultStatus;
  category: string;
  evidence?: JsonValue;
  invalidReason?: string | null;
  isReappearance?: boolean;
  isCrossCategoryRegression?: boolean;
}): RegressionSuiteResultRecord {
  const db = openDatabase();
  try {
    const id = ulid();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO regression_suite_results (
        id, suite_id, regression_case_id, target_version_id, run_id, status,
        category, evidence_json, invalid_reason, is_reappearance,
        is_cross_category_regression, created_at
      ) VALUES (
        @id, @suite_id, @regression_case_id, @target_version_id, @run_id, @status,
        @category, @evidence_json, @invalid_reason, @is_reappearance,
        @is_cross_category_regression, @created_at
      )
      ON CONFLICT(suite_id, regression_case_id) DO UPDATE SET
        run_id = excluded.run_id,
        status = excluded.status,
        category = excluded.category,
        evidence_json = excluded.evidence_json,
        invalid_reason = excluded.invalid_reason,
        is_reappearance = excluded.is_reappearance,
        is_cross_category_regression = excluded.is_cross_category_regression
    `).run({
      id,
      suite_id: input.suiteId,
      regression_case_id: input.regressionCaseId,
      target_version_id: input.targetVersionId,
      run_id: input.runId ?? null,
      status: input.status,
      category: input.category,
      evidence_json: JSON.stringify(input.evidence ?? {}),
      invalid_reason: input.invalidReason ?? null,
      is_reappearance: input.isReappearance ? 1 : 0,
      is_cross_category_regression: input.isCrossCategoryRegression ? 1 : 0,
      created_at: now
    });

    return {
      id,
      suiteId: input.suiteId,
      regressionCaseId: input.regressionCaseId,
      targetVersionId: input.targetVersionId,
      runId: input.runId ?? null,
      status: input.status,
      category: input.category,
      evidence: input.evidence ?? {},
      invalidReason: input.invalidReason ?? null,
      isReappearance: Boolean(input.isReappearance),
      isCrossCategoryRegression: Boolean(input.isCrossCategoryRegression),
      createdAt: now
    };
  } finally {
    db.close();
  }
}

function normalizeTargetUrl(targetUrl: string) {
  const parsedTarget = new URL(targetUrl);
  if (!["http:", "https:"].includes(parsedTarget.protocol)) {
    throw new Error("Target URL must use http or https.");
  }

  return parsedTarget.toString().replace(/\/$/, "");
}
