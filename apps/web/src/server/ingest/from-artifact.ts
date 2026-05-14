import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import { runArtifactSchema, type RunArtifact, type RunArtifactResult } from "@/server/ingest/types";

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
    }

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
    seed_id: null,
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

  if (result.judge_agent.status === "fail" || result.judge_agent.status === "partial") {
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
