import { ulid } from "ulid";
import { z } from "zod";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import type { Severity } from "@/server/db/schema";
import { passSemanticsSchema } from "@/server/regression-cases/pass-semantics";

const severitySchema = z.enum(["critical", "high", "med", "low", "info"]);

const promotionPayloadSchema = z.object({
  findingId: z.string().min(1),
  sourceSeedId: z.string().min(1).nullable().optional(),
  sourceCaseId: z.string().min(1).nullable().optional(),
  targetVersion: z.object({
    versionKey: z.string().trim().min(1),
    label: z.string().trim().min(1).nullable().optional(),
    source: z.string().trim().min(1).optional()
  }),
  passSemantics: passSemanticsSchema
});

type PromotionRecord = {
  id: string;
  action: string;
  status: string;
  target_id: string | null;
  payload_json: string;
};

type FindingRecord = {
  id: string;
  category: string;
  case_id: string;
  title: string;
  severity: Severity;
};

export function promoteApprovedFindingToRegression(
  approvalId: string,
  actorId: string,
  existingDb?: BoundaryDatabase
) {
  const db = existingDb ?? openDatabase();
  try {
    const run = () => promoteWithDatabase(db, approvalId, actorId);
    return existingDb ? run() : db.transaction(run)();
  } finally {
    if (!existingDb) db.close();
  }
}

function promoteWithDatabase(db: BoundaryDatabase, approvalId: string, actorId: string) {
  const approval = db.prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId) as PromotionRecord | undefined;
  if (!approval) throw new Error("Approval not found.");
  if (approval.action !== "regression:promote") return null;
  if (approval.status !== "pending" && approval.status !== "approved") {
    throw new Error("Regression promotion approval must be pending or approved.");
  }

  const payload = promotionPayloadSchema.parse(JSON.parse(approval.payload_json));
  const finding = db.prepare("SELECT id, category, case_id, title, severity FROM findings WHERE id = ?").get(
    payload.findingId
  ) as FindingRecord | undefined;
  if (!finding) throw new Error("Finding not found for regression promotion.");

  const existing = db.prepare(`
    SELECT id FROM regression_cases
    WHERE finding_id = ? AND status = 'active'
  `).get(finding.id) as { id: string } | undefined;
  if (existing) return { regressionCaseId: existing.id, created: false };

  const now = new Date().toISOString();
  const targetVersionId = getOrInsertTargetVersion(db, payload.targetVersion, now);
  const regressionCaseId = ulid();
  const regressionCaseVersionId = ulid();
  const severity = severitySchema.parse(finding.severity);

  db.prepare(`
    INSERT INTO regression_cases (
      id, finding_id, approval_id, source_seed_id, source_case_id, category,
      severity, title, status, created_at, updated_at
    ) VALUES (
      @id, @finding_id, @approval_id, @source_seed_id, @source_case_id, @category,
      @severity, @title, 'active', @created_at, @updated_at
    )
  `).run({
    id: regressionCaseId,
    finding_id: finding.id,
    approval_id: approval.id,
    source_seed_id: payload.sourceSeedId ?? null,
    source_case_id: payload.sourceCaseId ?? finding.case_id,
    category: finding.category,
    severity,
    title: finding.title,
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
    id: regressionCaseVersionId,
    regression_case_id: regressionCaseId,
    target_version_id: targetVersionId,
    protected_behavior: payload.passSemantics.protectedBehavior,
    required_evidence_json: JSON.stringify(payload.passSemantics.requiredEvidence),
    invalid_conditions_json: JSON.stringify(payload.passSemantics.invalidConditions),
    deterministic_checks_json: JSON.stringify(payload.passSemantics.deterministicChecks),
    judge_rubric_json: JSON.stringify(payload.passSemantics.judgeRubric),
    created_at: now
  });

  db.prepare(`
    INSERT INTO vulnerability_lifecycle_events (
      id, finding_id, regression_case_id, status, evidence_run_id,
      regression_suite_result_id, note, created_at
    ) VALUES (
      @id, @finding_id, @regression_case_id, 'fixed_pending_verification', NULL,
      NULL, @note, @created_at
    )
  `).run({
    id: ulid(),
    finding_id: finding.id,
    regression_case_id: regressionCaseId,
    note: "Regression promotion created the verification baseline.",
    created_at: now
  });

  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, 'operator', @actor_id, 'regression:promote',
      'regression_case', @target_id, 'ok', 'R16', NULL, @metadata_json
    )
  `).run({
    id: ulid(),
    occurred_at: now,
    actor_id: actorId,
    target_id: regressionCaseId,
    metadata_json: JSON.stringify({
      findingId: finding.id,
      approvalId: approval.id,
      targetVersionId
    })
  });

  return { regressionCaseId, created: true };
}

function getOrInsertTargetVersion(
  db: BoundaryDatabase,
  input: z.infer<typeof promotionPayloadSchema>["targetVersion"],
  now: string
) {
  db.prepare(`
    INSERT INTO target_versions (id, version_key, label, source, comparable, created_at)
    VALUES (@id, @version_key, @label, @source, 1, @created_at)
    ON CONFLICT(version_key) DO NOTHING
  `).run({
    id: ulid(),
    version_key: input.versionKey,
    label: input.label ?? null,
    source: input.source ?? "approval",
    created_at: now
  });

  const row = db.prepare("SELECT id FROM target_versions WHERE version_key = ?").get(input.versionKey) as
    | { id: string }
    | undefined;
  if (!row) throw new Error("Target version was not created.");
  return row.id;
}
