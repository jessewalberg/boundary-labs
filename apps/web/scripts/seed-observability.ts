import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getBoundaryConfig } from "../src/server/config";

/**
 * Derive per-agent run_costs + agent_timeline_events rows from an existing run artifact.
 *
 * Inputs: the artifact JSON (defaults to evals/results/latest.json).
 * Output: rows in run_costs and agent_timeline_events keyed to the artifact's run_id.
 *
 * Cost values are estimated using the public OpenRouter price for google/gemini-2.5-flash
 * ($0.075/1M input, $0.30/1M output) calibrated against the per-agent token model in
 * AI_COST_ANALYSIS.md. Provenance is recorded as "estimated".
 *
 * Idempotent: re-running deletes existing rows for the run_id before inserting.
 */

type ArtifactResult = {
  case_id: string;
  category: string;
  attempt: {
    attempt_id: string;
    observed_at: string;
    turns: Array<{ http?: { elapsed_ms?: number } }>;
  };
  judge_agent: { verdict_id: string };
};

type Artifact = {
  run_id: string;
  started_at: string;
  completed_at: string;
  results: ArtifactResult[];
};

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_ARTIFACT = path.join(REPO_ROOT, "evals/results/latest.json");

const AGENT_COST_MODEL = [
  { role: "orchestrator", inputTokens: 500, outputTokens: 100, action: "schedule_next_category" },
  { role: "red_team", inputTokens: 1500, outputTokens: 500, action: "generate_attack_plan" },
  { role: "target", inputTokens: 0, outputTokens: 0, action: "http_call" },
  { role: "judge", inputTokens: 2500, outputTokens: 300, action: "evaluate_verdict" },
  { role: "documentation", inputTokens: 2000, outputTokens: 200, action: "draft_report_note" }
] as const;

const INPUT_PRICE_PER_TOKEN = 0.075 / 1_000_000;
const OUTPUT_PRICE_PER_TOKEN = 0.30 / 1_000_000;

function ulidLike(prefix: string, seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24).toUpperCase();
  return `${prefix}_${hash}`;
}

function costMicros(input: number, output: number): number {
  return Math.round((input * INPUT_PRICE_PER_TOKEN + output * OUTPUT_PRICE_PER_TOKEN) * 1_000_000);
}

async function main() {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT;
  if (!fs.existsSync(artifactPath)) throw new Error(`Artifact not found: ${artifactPath}`);

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Artifact;
  const runId = artifact.run_id;

  const config = getBoundaryConfig();
  const db = new Database(config.sqlitePath);
  db.pragma("foreign_keys = ON");

  // Idempotent: clear prior seeded rows for this run_id
  db.prepare("DELETE FROM run_costs WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM agent_timeline_events WHERE run_id = ?").run(runId);

  const now = new Date().toISOString();
  const insertCost = db.prepare(`
    INSERT INTO run_costs (
      id, run_id, agent_role, provider, model, category,
      input_tokens, output_tokens, request_count, cost_micros, currency, provenance, created_at
    ) VALUES (?, ?, ?, 'openrouter', 'google/gemini-2.5-flash', ?, ?, ?, ?, ?, 'USD', 'estimated', ?)
  `);
  const insertTimeline = db.prepare(`
    INSERT INTO agent_timeline_events (
      id, run_id, sequence, agent_role, action, input_ref, output_ref, status,
      cost_micros, trace_ref, artifact_ref, started_at, completed_at, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'executed', ?, ?, ?, ?, ?, '{}', ?)
  `);

  let sequence = 0;
  let totalCost = 0;
  let totalEvents = 0;
  let totalCostRows = 0;

  // For each case, emit one cost row per agent (except target) and one timeline event per agent (incl. target)
  for (const result of artifact.results) {
    for (const agent of AGENT_COST_MODEL) {
      sequence += 1;
      const isLLM = agent.role !== "target";
      const cost = isLLM ? costMicros(agent.inputTokens, agent.outputTokens) : 0;

      if (isLLM) {
        const costId = ulidLike("cost", `${runId}_${result.case_id}_${agent.role}`);
        insertCost.run(
          costId,
          runId,
          agent.role,
          result.category,
          agent.inputTokens,
          agent.outputTokens,
          1,
          cost,
          now
        );
        totalCost += cost;
        totalCostRows += 1;
      }

      const eventId = ulidLike("evt", `${runId}_${result.case_id}_${agent.role}_${sequence}`);
      const turnMs = result.attempt.turns[0]?.http?.elapsed_ms ?? 5000;
      insertTimeline.run(
        eventId,
        runId,
        sequence,
        agent.role,
        agent.action,
        agent.role === "red_team" ? result.case_id : agent.role === "judge" ? result.attempt.attempt_id : null,
        agent.role === "red_team" ? result.attempt.attempt_id : agent.role === "judge" ? result.judge_agent.verdict_id : null,
        cost,
        null,
        artifactPath.replace(REPO_ROOT + "/", ""),
        result.attempt.observed_at,
        result.attempt.observed_at,
        now
      );
      totalEvents += 1;
    }
  }

  db.close();

  // eslint-disable-next-line no-console
  console.log(`Seeded ${totalCostRows} run_costs rows and ${totalEvents} agent_timeline_events for run ${runId}`);
  // eslint-disable-next-line no-console
  console.log(`Total estimated cost: $${(totalCost / 1_000_000).toFixed(4)}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
