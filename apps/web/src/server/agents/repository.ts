import type { AgentStatus } from "@/server/campaigns/types";
import { openDatabase } from "@/server/db/client";
import fs from "node:fs";

type AgentConnection = {
  role: string;
  provider: string;
  model: string;
  status: string;
  detail: string;
};

export function listAgentStatuses(): AgentStatus[] {
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        runs.artifact_path AS artifactPath,
        runs.summary_json AS summaryJson,
        COALESCE(runs.started_at, campaigns.created_at) AS sortAt
      FROM runs
      JOIN campaigns ON campaigns.id = runs.campaign_id
      ORDER BY COALESCE(runs.started_at, campaigns.created_at) DESC
      LIMIT 12
    `).all() as Array<{ artifactPath: string; summaryJson: string; sortAt: string }>;

    const latestByRole = new Map<string, { connection: AgentConnection; seeds: number | null }>();
    for (const row of rows) {
      const seeds = seedCountFromSummary(row.summaryJson);
      for (const connection of readAgentConnections(row.artifactPath)) {
        if (!latestByRole.has(connection.role)) {
          latestByRole.set(connection.role, { connection, seeds });
        }
      }
    }

    return roleOrder.flatMap((role) => {
      const latest = latestByRole.get(role);
      if (!latest) return [];
      return [toAgentStatus(latest.connection, latest.seeds)];
    });
  } catch (error) {
    if (error instanceof Error && /no such table/.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}

const roleOrder = ["orchestrator", "red_team", "judge", "documentation"];

function readAgentConnections(artifactPath: string): AgentConnection[] {
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      pydantic_graph?: {
        agent_connections?: unknown;
      };
    };
    const connections = artifact.pydantic_graph?.agent_connections;
    if (!connections || typeof connections !== "object" || Array.isArray(connections)) return [];
    return Object.entries(connections as Record<string, unknown>).flatMap(([role, raw]) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const item = raw as Record<string, unknown>;
      return [{
        role: typeof item.role === "string" ? item.role : role,
        provider: typeof item.provider === "string" ? item.provider : "unknown",
        model: typeof item.model === "string" ? item.model : "unknown",
        status: typeof item.status === "string" ? item.status : "unknown",
        detail: typeof item.detail === "string" ? item.detail : ""
      }];
    });
  } catch {
    return [];
  }
}

function seedCountFromSummary(summaryJson: string): number | null {
  try {
    const summary = JSON.parse(summaryJson) as { total?: unknown };
    return typeof summary.total === "number" ? summary.total : null;
  } catch {
    return null;
  }
}

function toAgentStatus(connection: AgentConnection, seeds: number | null): AgentStatus {
  return {
    name: labelForRole(connection.role),
    role: roleGroup(connection.role),
    status: connection.status === "executed" ? "live" : "idle",
    tone: toneForConnection(connection),
    task: `${connection.provider} · ${connection.model} · ${connection.status}${connection.detail ? ` · ${connection.detail}` : ""}`,
    seeds
  };
}

function labelForRole(role: string): string {
  if (role === "red_team") return "Red Team Agent";
  if (role === "judge") return "Judge Agent";
  if (role === "orchestrator") return "Orchestrator";
  if (role === "documentation") return "Documentation Agent";
  return role;
}

function roleGroup(role: string): AgentStatus["role"] {
  if (role === "red_team") return "RED";
  if (role === "judge") return "JUDGE";
  return "OPS";
}

function toneForConnection(connection: AgentConnection): AgentStatus["tone"] {
  if (connection.status === "failed" || connection.status === "missing_secret") return "alarm";
  if (connection.status === "executed") return "signal";
  return "cyan";
}
