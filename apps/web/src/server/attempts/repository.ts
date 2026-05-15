import type { SeedAttempt } from "@/server/campaigns/types";
import { openDatabase } from "@/server/db/client";
import { decodeCaseRouteParam } from "@/lib/case-route";
import fs from "node:fs";

export type SeedAttemptRecord = SeedAttempt & {
  runId: string;
};

export function listAttemptsForRun(runId: string): SeedAttempt[] {
  return listPersistedAttemptsForRun(runId);
}

export function getAttemptForRun(runId: string, seedId: string) {
  const decodedSeedId = decodeCaseRouteParam(seedId);
  return listAttemptsForRun(runId).find((attempt) => attempt.id === decodedSeedId);
}

export function listSeedAttemptRecords(): SeedAttemptRecord[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        attempts.run_id AS runId,
        attempts.case_id AS id,
        attempts.category AS category,
        verdicts.status AS verdict,
        verdicts.severity AS severity,
        verdicts.rationale AS rationale,
        verdicts.judge_model AS judge,
        attempts.request_artifact_path AS requestArtifactPath,
        attempts.response_artifact_path AS responseArtifactPath
      FROM attempts
      LEFT JOIN verdicts ON verdicts.run_id = attempts.run_id AND verdicts.case_id = attempts.case_id
      ORDER BY attempts.created_at DESC
    `).all() as Array<{
      runId: string;
      id: string;
      category: string;
      verdict: SeedAttempt["verdict"] | null;
      severity: SeedAttempt["severity"] | null;
      rationale: string | null;
      judge: string | null;
      requestArtifactPath: string | null;
      responseArtifactPath: string | null;
    }>;

    if (rows.length > 0) {
      return rows.map(rowToSeedAttemptRecord);
    }
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
  } finally {
    db.close();
  }

  return [];
}

function listPersistedAttemptsForRun(runId: string): SeedAttempt[] {
  const rows = listSeedAttemptRecords().filter((attempt) => attempt.runId === runId);
  return rows.map(({ runId: _runId, ...attempt }) => attempt);
}

function rowToSeedAttemptRecord(row: {
  runId: string;
  id: string;
  category: string;
  verdict: SeedAttempt["verdict"] | null;
  severity: SeedAttempt["severity"] | null;
  rationale: string | null;
  judge: string | null;
  requestArtifactPath: string | null;
  responseArtifactPath: string | null;
}): SeedAttemptRecord {
  return {
    runId: row.runId,
    id: row.id,
    title: row.id.replace(/^seed_/, "").replace(/_/g, " "),
    category: row.category,
    severity: row.severity ?? "info",
    verdict: row.verdict ?? "invalid",
    durationMs: durationMsFromArtifact(row.requestArtifactPath, row.runId, row.id),
    judge: row.judge ?? "deterministic",
    prompt: row.requestArtifactPath ? `See artifact: ${row.requestArtifactPath}` : "Prompt stored in run artifact.",
    response: row.responseArtifactPath ? `See artifact: ${row.responseArtifactPath}` : "Response stored in run artifact.",
    rationale: row.rationale ?? "No rationale recorded."
  };
}

function durationMsFromArtifact(artifactPath: string | null, runId: string, caseId: string) {
  if (!artifactPath) return 0;

  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      results?: Array<{
        run_id?: unknown;
        case_id?: unknown;
        attempt?: {
          turns?: Array<{
            http?: {
              elapsed_ms?: unknown;
            };
          }>;
        };
      }>;
    };
    const result = artifact.results?.find((item) => item.run_id === runId && item.case_id === caseId);
    if (!result?.attempt?.turns) return 0;
    return result.attempt.turns.reduce((sum, turn) => {
      const elapsed = turn.http?.elapsed_ms;
      return typeof elapsed === "number" && Number.isFinite(elapsed) ? sum + elapsed : sum;
    }, 0);
  } catch {
    return 0;
  }
}
