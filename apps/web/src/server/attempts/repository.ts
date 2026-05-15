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
  const details = attemptDetailsFromArtifact(row.requestArtifactPath, row.runId, row.id);
  return {
    runId: row.runId,
    id: row.id,
    title: row.id.replace(/^seed_/, "").replace(/_/g, " "),
    category: row.category,
    severity: row.severity ?? "info",
    verdict: row.verdict ?? "invalid",
    durationMs: details.durationMs,
    judge: row.judge ?? "deterministic",
    prompt: details.prompt || (row.requestArtifactPath ? `Prompt artifact: ${row.requestArtifactPath}` : "Prompt not yet recorded for this attempt."),
    response: details.response || (row.responseArtifactPath ? `Response artifact: ${row.responseArtifactPath}` : "Response not yet recorded for this attempt."),
    rationale: row.rationale ?? "No rationale recorded."
  };
}

type ArtifactTurn = {
  turn?: number;
  endpoint?: string;
  input?: string;
  http?: { elapsed_ms?: unknown; status?: unknown; body?: unknown };
  events?: Array<{ event?: string; data?: unknown }>;
};

type AttemptDetails = { prompt: string; response: string; durationMs: number };

function attemptDetailsFromArtifact(artifactPath: string | null, runId: string, caseId: string): AttemptDetails {
  const empty: AttemptDetails = { prompt: "", response: "", durationMs: 0 };
  if (!artifactPath) return empty;

  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      results?: Array<{
        run_id?: unknown;
        case_id?: unknown;
        attempt?: { turns?: ArtifactTurn[] };
      }>;
    };
    const result = artifact.results?.find((item) => item.run_id === runId && item.case_id === caseId);
    const turns = result?.attempt?.turns ?? [];
    if (turns.length === 0) return empty;

    const multi = turns.length > 1;

    const prompt = turns
      .map((turn, idx) => {
        const label = multi ? `Turn ${turn.turn ?? idx + 1}` : "";
        const endpoint = turn.endpoint ? ` (${turn.endpoint})` : "";
        const input = typeof turn.input === "string" ? turn.input.trim() : "";
        if (!input) return "";
        return multi ? `${label}${endpoint}:\n${input}` : input;
      })
      .filter((line) => line.length > 0)
      .join("\n\n")
      .trim();

    const response = turns
      .map((turn, idx) => {
        const label = multi ? `Turn ${turn.turn ?? idx + 1}` : "";
        const assembled = assembleResponseFromTurn(turn);
        if (!assembled) return "";
        return multi ? `${label}:\n${assembled}` : assembled;
      })
      .filter((line) => line.length > 0)
      .join("\n\n")
      .trim();

    const durationMs = turns.reduce((sum, turn) => {
      const elapsed = turn.http?.elapsed_ms;
      return typeof elapsed === "number" && Number.isFinite(elapsed) ? sum + elapsed : sum;
    }, 0);

    return { prompt, response, durationMs };
  } catch {
    return empty;
  }
}

function assembleResponseFromTurn(turn: ArtifactTurn): string {
  const events = turn.events ?? [];
  const textParts: string[] = [];
  const toolNotes: string[] = [];

  for (const event of events) {
    const eventName = typeof event.event === "string" ? event.event : "";
    const data = (event.data ?? {}) as Record<string, unknown>;

    if (eventName === "text_delta") {
      const delta = typeof data.delta === "string" ? data.delta : "";
      if (delta) textParts.push(delta);
    } else if (eventName === "tool_started") {
      const name = typeof data.name === "string" ? data.name : "tool";
      const summary = typeof data.args_summary === "string" ? ` (${data.args_summary})` : "";
      toolNotes.push(`tool_started: ${name}${summary}`);
    } else if (eventName === "tool_completed") {
      const name = typeof data.name === "string" ? data.name : "tool";
      const status = typeof data.status === "string" ? data.status : "";
      const errorCode = typeof data.error_code === "string" ? ` · ${data.error_code}` : "";
      toolNotes.push(`tool_completed: ${name}${status ? ` · ${status}` : ""}${errorCode}`);
    }
  }

  const text = textParts.join("").trim();
  const tools = toolNotes.length > 0 ? toolNotes.map((line) => `[${line}]`).join("\n") : "";

  if (text && tools) return `${text}\n\n${tools}`;
  if (text) return text;
  if (tools) return tools;

  // Last resort: a truncated raw body if no structured events were parsed
  const body = typeof turn.http?.body === "string" ? turn.http.body.trim() : "";
  return body ? body.slice(0, 2000) : "";
}
