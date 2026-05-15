import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { ingestArtifactFile } from "../../src/server/ingest/from-artifact";
import { listAgentTimeline } from "../../src/server/agent-timeline/repository";
import { listRunCosts } from "../../src/server/costs/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("cost and agent timeline ingest", () => {
  it("materializes usage cost rows and ordered timeline rows from artifact metadata", () => {
    const context = createSafetyGateContext("boundary-cost-timeline-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    fs.mkdirSync(process.env.BOUNDARY_ARTIFACT_DIR, { recursive: true });
    runDatabaseBootstrap(context);
    const artifactPath = path.join(process.env.BOUNDARY_ARTIFACT_DIR, "cost-run.json");
    const now = new Date().toISOString();
    fs.writeFileSync(artifactPath, JSON.stringify({
      run_id: "cost-run",
      started_at: now,
      completed_at: now,
      target_url: "https://clinical-copilot.up.railway.app",
      summary: { total: 0, pass: 0, fail: 0, partial: 0, invalid: 0 },
      pydantic_graph: {
        trace_path: path.join(process.env.BOUNDARY_ARTIFACT_DIR, "cost-run.trace.jsonl"),
        agent_connections: {
          red_team: {
            role: "red_team",
            provider: "openrouter",
            model: "google/gemini-2.5-flash",
            status: "executed",
            usage: { input_tokens: 1000, output_tokens: 200, requests: 1, total_cost_micros: 345 }
          },
          judge: {
            role: "judge",
            provider: "openrouter",
            model: "google/gemini-2.5-flash",
            status: "missing_secret"
          }
        }
      },
      inter_agent_messages: [
        { sender: "orchestrator", recipient: "red_team", message: "plan", metadata: { input_ref: "case-a" } },
        { sender: "red_team", recipient: "judge", message: "judge", metadata: { output_ref: "attempt-a" } }
      ],
      results: []
    }), "utf8");

    const db = new Database(context.sqlitePath);
    ingestArtifactFile(artifactPath, db);
    db.close();

    expect(listRunCosts("cost-run")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "cost-run",
        agentRole: "red_team",
        inputTokens: 1000,
        outputTokens: 200,
        requestCount: 1,
        costMicros: 345,
        provenance: "provider_reported"
      }),
      expect.objectContaining({
        runId: "cost-run",
        agentRole: "judge",
        inputTokens: null,
        costMicros: null,
        provenance: "unavailable"
      })
    ]));
    expect(listAgentTimeline({ runId: "cost-run" })).toEqual([
      expect.objectContaining({ sequence: 1, agentRole: "orchestrator", action: "message:orchestrator->red_team", status: "completed" }),
      expect.objectContaining({ sequence: 2, agentRole: "red_team", action: "message:red_team->judge", status: "completed" })
    ]);
  });
});
