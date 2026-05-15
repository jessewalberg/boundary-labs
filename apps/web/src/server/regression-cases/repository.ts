import { ulid } from "ulid";
import { openDatabase } from "@/server/db/client";
import type { JsonValue, Severity } from "@/server/db/schema";

export type PassSemantics = {
  protectedBehavior: string;
  requiredEvidence: JsonValue[];
  invalidConditions: JsonValue[];
  deterministicChecks: JsonValue[];
  judgeRubric: JsonValue;
};

export type RegressionCaseRecord = {
  id: string;
  findingId: string | null;
  approvalId: string | null;
  sourceSeedId: string | null;
  sourceCaseId: string | null;
  category: string;
  severity: Severity;
  title: string;
  status: "active" | "retired";
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    version: number;
    targetVersionId: string;
    protectedBehavior: string;
    requiredEvidence: JsonValue[];
    invalidConditions: JsonValue[];
    deterministicChecks: JsonValue[];
    judgeRubric: JsonValue;
    createdAt: string;
  };
};

export function createRegressionCase(input: {
  findingId?: string | null;
  approvalId?: string | null;
  sourceSeedId?: string | null;
  sourceCaseId?: string | null;
  category: string;
  severity: Severity;
  title: string;
  targetVersionId: string;
  passSemantics: PassSemantics;
}): RegressionCaseRecord {
  const db = openDatabase();
  try {
    const now = new Date().toISOString();
    const caseId = ulid();
    const versionId = ulid();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO regression_cases (
          id, finding_id, approval_id, source_seed_id, source_case_id, category,
          severity, title, status, created_at, updated_at
        ) VALUES (
          @id, @finding_id, @approval_id, @source_seed_id, @source_case_id, @category,
          @severity, @title, 'active', @created_at, @updated_at
        )
      `).run({
        id: caseId,
        finding_id: input.findingId ?? null,
        approval_id: input.approvalId ?? null,
        source_seed_id: input.sourceSeedId ?? null,
        source_case_id: input.sourceCaseId ?? null,
        category: input.category,
        severity: input.severity,
        title: input.title,
        created_at: now,
        updated_at: now
      });

      db.prepare(`
        INSERT INTO regression_case_versions (
          id, regression_case_id, version, target_version_id, protected_behavior,
          required_evidence_json, invalid_conditions_json, deterministic_checks_json,
          judge_rubric_json, created_at
        ) VALUES (
          @id, @regression_case_id, 1, @target_version_id, @protected_behavior,
          @required_evidence_json, @invalid_conditions_json, @deterministic_checks_json,
          @judge_rubric_json, @created_at
        )
      `).run({
        id: versionId,
        regression_case_id: caseId,
        target_version_id: input.targetVersionId,
        protected_behavior: input.passSemantics.protectedBehavior,
        required_evidence_json: JSON.stringify(input.passSemantics.requiredEvidence),
        invalid_conditions_json: JSON.stringify(input.passSemantics.invalidConditions),
        deterministic_checks_json: JSON.stringify(input.passSemantics.deterministicChecks),
        judge_rubric_json: JSON.stringify(input.passSemantics.judgeRubric),
        created_at: now
      });
    });
    tx();
    const created = getRegressionCase(caseId);
    if (!created) throw new Error("Regression case was not created.");
    return created;
  } finally {
    db.close();
  }
}

export function getRegressionCase(id: string): RegressionCaseRecord | null {
  const db = openDatabase();
  try {
    const row = db.prepare(`
      SELECT
        regression_cases.id,
        regression_cases.finding_id AS findingId,
        regression_cases.approval_id AS approvalId,
        regression_cases.source_seed_id AS sourceSeedId,
        regression_cases.source_case_id AS sourceCaseId,
        regression_cases.category,
        regression_cases.severity,
        regression_cases.title,
        regression_cases.status,
        regression_cases.created_at AS createdAt,
        regression_cases.updated_at AS updatedAt,
        regression_case_versions.id AS versionId,
        regression_case_versions.version,
        regression_case_versions.target_version_id AS targetVersionId,
        regression_case_versions.protected_behavior AS protectedBehavior,
        regression_case_versions.required_evidence_json AS requiredEvidenceJson,
        regression_case_versions.invalid_conditions_json AS invalidConditionsJson,
        regression_case_versions.deterministic_checks_json AS deterministicChecksJson,
        regression_case_versions.judge_rubric_json AS judgeRubricJson,
        regression_case_versions.created_at AS versionCreatedAt
      FROM regression_cases
      JOIN regression_case_versions ON regression_case_versions.regression_case_id = regression_cases.id
      WHERE regression_cases.id = ?
      ORDER BY regression_case_versions.version DESC
      LIMIT 1
    `).get(id) as
      | {
          id: string;
          findingId: string | null;
          approvalId: string | null;
          sourceSeedId: string | null;
          sourceCaseId: string | null;
          category: string;
          severity: Severity;
          title: string;
          status: "active" | "retired";
          createdAt: string;
          updatedAt: string;
          versionId: string;
          version: number;
          targetVersionId: string;
          protectedBehavior: string;
          requiredEvidenceJson: string;
          invalidConditionsJson: string;
          deterministicChecksJson: string;
          judgeRubricJson: string;
          versionCreatedAt: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      findingId: row.findingId,
      approvalId: row.approvalId,
      sourceSeedId: row.sourceSeedId,
      sourceCaseId: row.sourceCaseId,
      category: row.category,
      severity: row.severity,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: {
        id: row.versionId,
        version: row.version,
        targetVersionId: row.targetVersionId,
        protectedBehavior: row.protectedBehavior,
        requiredEvidence: JSON.parse(row.requiredEvidenceJson) as JsonValue[],
        invalidConditions: JSON.parse(row.invalidConditionsJson) as JsonValue[],
        deterministicChecks: JSON.parse(row.deterministicChecksJson) as JsonValue[],
        judgeRubric: JSON.parse(row.judgeRubricJson) as JsonValue,
        createdAt: row.versionCreatedAt
      }
    };
  } finally {
    db.close();
  }
}

export function listActiveRegressionCases(): RegressionCaseRecord[] {
  const db = openDatabase();
  try {
    const rows = db.prepare("SELECT id FROM regression_cases WHERE status = 'active' ORDER BY category ASC, created_at ASC")
      .all() as Array<{ id: string }>;
    return rows.map((row) => getRegressionCase(row.id)).filter((row): row is RegressionCaseRecord => Boolean(row));
  } finally {
    db.close();
  }
}

export function listRegressionCaseInventory() {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        regression_cases.id,
        regression_cases.finding_id AS findingId,
        regression_cases.category,
        regression_cases.severity,
        regression_cases.title,
        regression_cases.status,
        regression_cases.created_at AS createdAt,
        latest.status AS latestStatus,
        latest.run_id AS latestRunId,
        latest.is_reappearance AS isReappearance,
        latest.is_cross_category_regression AS isCrossCategoryRegression
      FROM regression_cases
      LEFT JOIN regression_suite_results latest
        ON latest.id = (
          SELECT id
          FROM regression_suite_results
          WHERE regression_suite_results.regression_case_id = regression_cases.id
          ORDER BY created_at DESC
          LIMIT 1
        )
      ORDER BY regression_cases.category ASC, regression_cases.created_at DESC
    `).all() as Array<{
      id: string;
      findingId: string | null;
      category: string;
      severity: Severity;
      title: string;
      status: "active" | "retired";
      createdAt: string;
      latestStatus: "pass" | "fail" | "partial" | "invalid" | null;
      latestRunId: string | null;
      isReappearance: 0 | 1 | null;
      isCrossCategoryRegression: 0 | 1 | null;
    }>;
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}
