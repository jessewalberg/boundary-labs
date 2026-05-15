import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import { runArtifactSchema, type RunArtifact, type RunArtifactResult } from "@/server/ingest/types";
import { classifyRegressionResult } from "@/server/regression-suites/classify-result";

export type IngestArtifactResult = {
  runId: string;
  inserted: {
    campaigns: number;
    runs: number;
    attempts: number;
    verdicts: number;
    findings: number;
  };
};

export function ingestArtifactFile(filePath: string, existingDb?: BoundaryDatabase): IngestArtifactResult {
  const config = getBoundaryConfig();
  const db = existingDb ?? openDatabase();

  try {
    const artifactPath = assertArtifactPathInsideJail(filePath, config.artifactDir);
    const parsed = runArtifactSchema.parse(JSON.parse(fs.readFileSync(artifactPath, "utf8")));
    return ingestArtifact(parsed, artifactPath, db);
  } catch (error) {
    if (existingDb) {
      const escaped = error instanceof Error && /escapes BOUNDARY_ARTIFACT_DIR/.test(error.message);
      writeAudit(db, escaped ? "ingest_failed_path_escape" : "ingest_failed_malformed", "artifact", filePath, "failed", {
        error: error instanceof Error ? error.message : "Unknown ingest error"
      });
    }
    throw error;
  } finally {
    if (!existingDb) db.close();
  }
}

export function ingestArtifact(artifact: RunArtifact, artifactPath: string, db: BoundaryDatabase): IngestArtifactResult {
  const canonicalPath = assertArtifactPathInsideJail(artifactPath, getBoundaryConfig().artifactDir);
  const now = new Date().toISOString();
  const categories = Array.from(new Set(artifact.results.map((result) => normalizeCategory(result.category))));
  const inserted = {
    campaigns: 0,
    runs: 0,
    attempts: 0,
    verdicts: 0,
    findings: 0
  };

  const tx = db.transaction(() => {
    inserted.campaigns += db.prepare(`
      INSERT INTO campaigns (
        id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
        artifact_path, created_at, updated_at
      ) VALUES (
        @id, @target_url, @categories_json, 'completed', 'synthetic', 0, 'artifact_ingest',
        @artifact_path, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        target_url = excluded.target_url,
        categories_json = excluded.categories_json,
        status = 'completed',
        artifact_path = excluded.artifact_path,
        updated_at = excluded.updated_at
      WHERE campaigns.target_url <> excluded.target_url
        OR campaigns.categories_json <> excluded.categories_json
        OR campaigns.status <> 'completed'
        OR campaigns.artifact_path <> excluded.artifact_path
        OR campaigns.updated_at <> excluded.updated_at
    `).run({
      id: artifact.run_id,
      target_url: artifact.target_url,
      categories_json: JSON.stringify(categories),
      artifact_path: canonicalPath,
      created_at: artifact.started_at,
      updated_at: artifact.completed_at ?? now
    }).changes;

    inserted.runs += db.prepare(`
      INSERT INTO runs (
        id, campaign_id, run_id, artifact_path, status, started_at, completed_at,
        summary_json, created_at
      ) VALUES (
        @id, @campaign_id, @run_id, @artifact_path, 'completed', @started_at, @completed_at,
        @summary_json, @created_at
      )
      ON CONFLICT(run_id) DO NOTHING
    `).run({
      id: ulid(),
      campaign_id: artifact.run_id,
      run_id: artifact.run_id,
      artifact_path: canonicalPath,
      started_at: artifact.started_at,
      completed_at: artifact.completed_at ?? null,
      summary_json: JSON.stringify(artifact.summary),
      created_at: now
    }).changes;

    for (const result of artifact.results) {
      ingestResult(db, artifact, result, canonicalPath, now, inserted);
      ingestRegressionResult(db, artifact, result, now);
    }
    materializeCostAndTimeline(db, artifact, canonicalPath, now);

    writeAudit(db, "artifact_ingested", "run", artifact.run_id, "ok", {
      artifactPath: canonicalPath,
      attempts: artifact.results.length
    });
  });

  tx();

  return {
    runId: artifact.run_id,
    inserted
  };
}

function materializeCostAndTimeline(
  db: BoundaryDatabase,
  artifact: RunArtifact,
  artifactPath: string,
  now: string
) {
  const suiteMetadata = (artifact as Record<string, unknown>).regression_suite;
  const suite = suiteMetadata && typeof suiteMetadata === "object" ? suiteMetadata as Record<string, unknown> : {};
  const suiteId = typeof suite.suite_id === "string" ? suite.suite_id : null;
  const tracePath = tracePathFromArtifact(artifact);

  db.prepare("DELETE FROM run_costs WHERE run_id = ?").run(artifact.run_id);
  db.prepare("DELETE FROM agent_timeline_events WHERE run_id = ?").run(artifact.run_id);

  const connections = agentConnectionsFromArtifact(artifact);
  for (const [role, connection] of Object.entries(connections)) {
    const usage = connection.usage && typeof connection.usage === "object"
      ? connection.usage as Record<string, unknown>
      : null;
    db.prepare(`
      INSERT INTO run_costs (
        id, run_id, suite_id, regression_case_id, agent_role, provider, model,
        category, input_tokens, output_tokens, request_count, cost_micros,
        currency, provenance, created_at
      ) VALUES (
        @id, @run_id, @suite_id, NULL, @agent_role, @provider, @model,
        NULL, @input_tokens, @output_tokens, @request_count, @cost_micros,
        'USD', @provenance, @created_at
      )
    `).run({
      id: ulid(),
      run_id: artifact.run_id,
      suite_id: suiteId,
      agent_role: String(connection.role ?? role),
      provider: typeof connection.provider === "string" ? connection.provider : null,
      model: typeof connection.model === "string" ? connection.model : null,
      input_tokens: numberOrNull(usage?.input_tokens),
      output_tokens: numberOrNull(usage?.output_tokens),
      request_count: numberOrNull(usage?.requests ?? usage?.request_count),
      cost_micros: numberOrNull(usage?.total_cost_micros ?? usage?.cost_micros),
      provenance: usage ? "provider_reported" : "unavailable",
      created_at: now
    });
  }

  const messages = Array.isArray((artifact as Record<string, unknown>).inter_agent_messages)
    ? (artifact as Record<string, unknown>).inter_agent_messages as Array<Record<string, unknown>>
    : [];
  messages.forEach((message, index) => {
    const sender = typeof message.sender === "string" ? message.sender : "agent";
    const recipient = typeof message.recipient === "string" ? message.recipient : "agent";
    const metadata = message.metadata && typeof message.metadata === "object"
      ? message.metadata as Record<string, unknown>
      : {};
    db.prepare(`
      INSERT INTO agent_timeline_events (
        id, run_id, suite_id, regression_case_id, sequence, agent_role, action,
        input_ref, output_ref, status, cost_micros, trace_ref, artifact_ref,
        started_at, completed_at, metadata_json, created_at
      ) VALUES (
        @id, @run_id, @suite_id, NULL, @sequence, @agent_role, @action,
        @input_ref, @output_ref, 'completed', NULL, @trace_ref, @artifact_ref,
        NULL, NULL, @metadata_json, @created_at
      )
    `).run({
      id: ulid(),
      run_id: artifact.run_id,
      suite_id: suiteId,
      sequence: index + 1,
      agent_role: sender,
      action: `message:${sender}->${recipient}`,
      input_ref: typeof metadata.input_ref === "string" ? metadata.input_ref : null,
      output_ref: typeof metadata.output_ref === "string" ? metadata.output_ref : null,
      trace_ref: tracePath,
      artifact_ref: artifactPath,
      metadata_json: JSON.stringify(message),
      created_at: now
    });
  });
}

function agentConnectionsFromArtifact(artifact: RunArtifact) {
  const graph = (artifact as Record<string, unknown>).pydantic_graph;
  if (!graph || typeof graph !== "object") return {};
  const connections = (graph as Record<string, unknown>).agent_connections;
  if (!connections || typeof connections !== "object" || Array.isArray(connections)) return {};
  return connections as Record<string, Record<string, unknown>>;
}

function tracePathFromArtifact(artifact: RunArtifact) {
  const graph = (artifact as Record<string, unknown>).pydantic_graph;
  if (!graph || typeof graph !== "object") return null;
  const tracePath = (graph as Record<string, unknown>).trace_path;
  return typeof tracePath === "string" ? tracePath : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ingestRegressionResult(
  db: BoundaryDatabase,
  artifact: RunArtifact,
  result: RunArtifactResult,
  now: string
) {
  if ((artifact as Record<string, unknown>).case_source !== "regression") return;
  const suiteMetadata = (artifact as Record<string, unknown>).regression_suite;
  if (!suiteMetadata || typeof suiteMetadata !== "object") return;
  const suite = suiteMetadata as Record<string, unknown>;
  const suiteId = typeof suite.suite_id === "string" ? suite.suite_id : null;
  const targetVersionId = typeof suite.target_version_id === "string" ? suite.target_version_id : null;
  if (!suiteId || !targetVersionId) return;

  const regressionCase = db.prepare(`
    SELECT
      regression_cases.id,
      regression_cases.finding_id AS findingId,
      regression_cases.category,
      regression_case_versions.required_evidence_json AS requiredEvidenceJson
    FROM regression_cases
    JOIN regression_case_versions ON regression_case_versions.regression_case_id = regression_cases.id
    WHERE regression_cases.id = ?
    ORDER BY regression_case_versions.version DESC
    LIMIT 1
  `).get(result.case_id) as
    | { id: string; findingId: string | null; category: string; requiredEvidenceJson: string }
    | undefined;
  if (!regressionCase) return;

  const requiredEvidence = JSON.parse(regressionCase.requiredEvidenceJson) as Array<Record<string, unknown>>;
  const classification = classifyRegressionResult(result, requiredEvidence);
  const priorPass = db.prepare(`
    SELECT id
    FROM regression_suite_results
    WHERE regression_case_id = ? AND status = 'pass'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(regressionCase.id) as { id: string } | undefined;
  const isFailure = classification.status === "fail" || classification.status === "partial";
  const fixedCategory = typeof suite.fixed_category === "string" ? normalizeCategory(suite.fixed_category) : null;
  const isReappearance = Boolean(priorPass && isFailure);
  const isCrossCategoryRegression = Boolean(isReappearance && fixedCategory && fixedCategory !== normalizeCategory(regressionCase.category));

  const proposedResultId = ulid();
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
    id: proposedResultId,
    suite_id: suiteId,
    regression_case_id: regressionCase.id,
    target_version_id: targetVersionId,
    run_id: artifact.run_id,
    status: classification.status,
    category: normalizeCategory(result.category),
    evidence_json: JSON.stringify({ turns: result.attempt.turns.length }),
    invalid_reason: classification.invalidReason,
    is_reappearance: isReappearance ? 1 : 0,
    is_cross_category_regression: isCrossCategoryRegression ? 1 : 0,
    created_at: now
  });
  const persistedResult = db.prepare(`
    SELECT id
    FROM regression_suite_results
    WHERE suite_id = ? AND regression_case_id = ?
  `).get(suiteId, regressionCase.id) as { id: string } | undefined;
  const resultId = persistedResult?.id ?? proposedResultId;

  if (isReappearance && regressionCase.findingId) {
    const existingLifecycle = db.prepare(`
      SELECT id
      FROM vulnerability_lifecycle_events
      WHERE finding_id = ? AND status = 'reopened' AND regression_suite_result_id = ?
    `).get(regressionCase.findingId, resultId) as { id: string } | undefined;
    if (!existingLifecycle) {
      db.prepare(`
        INSERT INTO vulnerability_lifecycle_events (
          id, finding_id, regression_case_id, status, evidence_run_id,
          regression_suite_result_id, note, created_at
        ) VALUES (
          @id, @finding_id, @regression_case_id, 'reopened', @evidence_run_id,
          @regression_suite_result_id, @note, @created_at
        )
      `).run({
        id: ulid(),
        finding_id: regressionCase.findingId,
        regression_case_id: regressionCase.id,
        evidence_run_id: artifact.run_id,
        regression_suite_result_id: resultId,
        note: isCrossCategoryRegression ? "Cross-category regression detected." : "Regression case failed after a prior pass.",
        created_at: now
      });
    }
    db.prepare("UPDATE findings SET status = 'reopened', latest_run_id = ?, updated_at = ? WHERE id = ?")
      .run(artifact.run_id, now, regressionCase.findingId);
  }
}

export function assertArtifactPathInsideJail(filePath: string, artifactDir = getBoundaryConfig().artifactDir) {
  const root = path.resolve(artifactDir);
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes BOUNDARY_ARTIFACT_DIR: ${filePath}`);
  }
  return resolved;
}

export function normalizeSeverity(value: string) {
  if (value === "medium") return "med";
  if (value === "informational") return "info";
  return value;
}

export function normalizeCategory(value: string) {
  return value.trim().replace(/_/g, "-");
}

function ingestResult(
  db: BoundaryDatabase,
  artifact: RunArtifact,
  result: RunArtifactResult,
  artifactPath: string,
  now: string,
  inserted: IngestArtifactResult["inserted"]
) {
  const category = normalizeCategory(result.category);
  const severity = normalizeSeverity(result.judge_agent.severity);
  const firstTurn = result.attempt.turns[0];
  const promptHash = crypto.createHash("sha256").update(firstTurn?.input ?? result.case_id).digest("hex");

  inserted.attempts += db.prepare(`
    INSERT INTO attempts (
      id, run_id, case_id, seed_id, category, prompt_hash,
      request_artifact_path, response_artifact_path, created_at
    ) VALUES (
      @id, @run_id, @case_id, @seed_id, @category, @prompt_hash,
      @request_artifact_path, @response_artifact_path, @created_at
    )
    ON CONFLICT(run_id, case_id) DO NOTHING
  `).run({
    id: result.attempt.attempt_id,
    run_id: artifact.run_id,
    case_id: result.case_id,
    seed_id: seedIdForCase(db, result.case_id),
    category,
    prompt_hash: promptHash,
    request_artifact_path: artifactPath,
    response_artifact_path: artifactPath,
    created_at: result.attempt.observed_at ?? now
  }).changes;

  inserted.verdicts += db.prepare(`
    INSERT INTO verdicts (
      id, run_id, case_id, status, severity, rationale, judge_model, created_at
    ) VALUES (
      @id, @run_id, @case_id, @status, @severity, @rationale, @judge_model, @created_at
    )
    ON CONFLICT(run_id, case_id) DO NOTHING
  `).run({
    id: result.judge_agent.verdict_id ?? ulid(),
    run_id: artifact.run_id,
    case_id: result.case_id,
    status: result.judge_agent.status,
    severity,
    rationale: result.judge_agent.rationale ?? null,
    judge_model: result.judge_agent.execution_mode ?? "deterministic",
    created_at: now
  }).changes;

  const isRegressionArtifact = (artifact as Record<string, unknown>).case_source === "regression";
  if (!isRegressionArtifact && (result.judge_agent.status === "fail" || result.judge_agent.status === "partial")) {
    const title = titleFromResult(result);
    inserted.findings += db.prepare(`
      INSERT INTO findings (
        id, category, case_id, title, severity, status, first_seen_run_id,
        latest_run_id, created_at, updated_at
      ) VALUES (
        @id, @category, @case_id, @title, @severity, 'open', @run_id,
        @run_id, @created_at, @updated_at
      )
      ON CONFLICT(category, case_id, status) DO UPDATE SET
        latest_run_id = excluded.latest_run_id,
        updated_at = excluded.updated_at
    `).run({
      id: ulid(),
      category,
      case_id: result.case_id,
      title,
      severity,
      run_id: artifact.run_id,
      created_at: now,
      updated_at: now
    }).changes;

    const finding = db.prepare(`
      SELECT id FROM findings WHERE category = ? AND case_id = ? AND status = 'open'
    `).get(category, result.case_id) as { id: string } | undefined;
    if (finding) {
      db.prepare(`
        INSERT INTO finding_attempts (finding_id, attempt_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(finding_id, attempt_id) DO NOTHING
      `).run(finding.id, result.attempt.attempt_id, now);
    }
  }
}

function titleFromResult(result: RunArtifactResult) {
  const subcategory = result.subcategory?.replace(/_/g, " ");
  if (subcategory) return subcategory.slice(0, 1).toUpperCase() + subcategory.slice(1);
  return result.case_id;
}

function seedIdForCase(db: BoundaryDatabase, caseId: string) {
  try {
    const row = db.prepare("SELECT id FROM seeds WHERE id = ?").get(caseId) as { id: string } | undefined;
    return row?.id ?? null;
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return null;
    throw error;
  }
}

function writeAudit(
  db: BoundaryDatabase,
  action: string,
  targetType: string,
  targetId: string,
  outcome: string,
  metadata: Record<string, unknown>
) {
  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, 'system', NULL, @action, @target_type, @target_id,
      @outcome, 'R11', NULL, @metadata_json
    )
  `).run({
    id: ulid(),
    occurred_at: new Date().toISOString(),
    action,
    target_type: targetType,
    target_id: targetId,
    outcome,
    metadata_json: JSON.stringify(metadata)
  });
}
