import type { BoundaryRun } from "@/server/campaigns/types";
import {
  listStoredCampaigns,
  storedCampaignToRun
} from "@/server/campaigns/repository";
import { openDatabase } from "@/server/db/client";
import fs from "node:fs";

export async function listRuns() {
  const persisted = await listPersistedRuns();
  return persisted;
}

export async function getRun(id: string) {
  const persisted = await listPersistedRuns();
  return persisted.find((run) => run.id === id);
}

async function listPersistedRuns(): Promise<BoundaryRun[]> {
  const storedCampaigns = (await listStoredCampaigns()).map(storedCampaignToRun);
  const bundledEvalFilter = process.env.BOUNDARY_INGEST_BUNDLED_EVALS === "1"
    ? ""
    : "WHERE runs.artifact_path NOT LIKE '%/bundled-evals/%'";
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        runs.run_id AS id,
        campaigns.target_url AS target,
        COALESCE(runs.started_at, campaigns.created_at) AS startedAt,
        COALESCE(runs.completed_at, campaigns.updated_at) AS completedAt,
        runs.summary_json AS summaryJson,
        runs.artifact_path AS artifactPath,
        campaigns.categories_json AS categoriesJson,
        campaigns.status AS campaignStatus
      FROM runs
      JOIN campaigns ON campaigns.id = runs.campaign_id
      ${bundledEvalFilter}
      ORDER BY COALESCE(runs.started_at, campaigns.created_at) DESC
    `).all() as Array<{
      id: string;
      target: string;
      startedAt: string;
      completedAt: string | null;
      summaryJson: string;
      artifactPath: string;
      categoriesJson: string;
      campaignStatus: BoundaryRun["status"];
    }>;

    const runRows = rows.map((row) => {
      const summary = JSON.parse(row.summaryJson) as BoundaryRun["summary"] & { total?: number };
      const categories = JSON.parse(row.categoriesJson) as string[];
      return {
        id: row.id,
        target: row.target,
        startedAt: row.startedAt,
        duration: durationLabel(row.startedAt, row.completedAt),
        branch: "artifact-ingest",
        commit: row.id.slice(-8),
        summary: {
          pass: summary.pass ?? 0,
          fail: summary.fail ?? 0,
          partial: summary.partial ?? 0,
          invalid: summary.invalid ?? 0
        },
        seedCount: summary.total ?? categories.length,
        coverage: categories,
        trigger: "scheduler",
        status: row.campaignStatus,
        pydanticGraph: readPydanticGraphSummary(row.artifactPath)
      } satisfies BoundaryRun;
    });

    const ids = new Set(runRows.map((run) => run.id));
    return [...runRows, ...storedCampaigns.filter((run) => !ids.has(run.id))];
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) {
      return storedCampaigns;
    }
    throw error;
  } finally {
    db.close();
  }
}

function readPydanticGraphSummary(artifactPath: string): BoundaryRun["pydanticGraph"] | undefined {
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      pydantic_graph?: {
        schema_version?: string;
        nodes?: unknown;
        agent_connections?: unknown;
      };
    };
    const graph = artifact.pydantic_graph;
    if (!graph) return undefined;
    const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter((node): node is string => typeof node === "string") : [];
    const agentConnections = normalizeAgentConnections(graph.agent_connections);
    return {
      schemaVersion: graph.schema_version,
      nodes,
      agentConnections
    };
  } catch {
    return undefined;
  }
}

function normalizeAgentConnections(value: unknown): NonNullable<BoundaryRun["pydanticGraph"]>["agentConnections"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([role, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    return [{
      role: typeof item.role === "string" ? item.role : role,
      provider: typeof item.provider === "string" ? item.provider : "unknown",
      model: typeof item.model === "string" ? item.model : "unknown",
      status: typeof item.status === "string" ? item.status : "unknown",
      enabled: item.enabled === true,
      apiKeyConfigured: item.api_key_configured === true,
      detail: typeof item.detail === "string" ? item.detail : ""
    }];
  });
}

function durationLabel(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "pending";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}
