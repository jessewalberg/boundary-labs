import { boundaryRuns, getRunById as getFixtureRunById, type BoundaryRun } from "@/server/campaigns/fixtures";
import {
  listStoredCampaigns,
  storedCampaignToRun
} from "@/server/campaigns/repository";
import { openDatabase } from "@/server/db/client";

export async function listRuns() {
  const persisted = await listPersistedRuns();
  const ids = new Set(persisted.map((run) => run.id));
  return [...persisted, ...boundaryRuns.filter((run) => !ids.has(run.id))];
}

export async function getRun(id: string) {
  const persisted = await listPersistedRuns();
  return persisted.find((run) => run.id === id) ?? getFixtureRunById(id);
}

async function listPersistedRuns(): Promise<BoundaryRun[]> {
  const storedCampaigns = (await listStoredCampaigns()).map(storedCampaignToRun);
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        runs.run_id AS id,
        campaigns.target_url AS target,
        COALESCE(runs.started_at, campaigns.created_at) AS startedAt,
        COALESCE(runs.completed_at, campaigns.updated_at) AS completedAt,
        runs.summary_json AS summaryJson,
        campaigns.categories_json AS categoriesJson,
        campaigns.status AS campaignStatus
      FROM runs
      JOIN campaigns ON campaigns.id = runs.campaign_id
      ORDER BY COALESCE(runs.started_at, campaigns.created_at) DESC
    `).all() as Array<{
      id: string;
      target: string;
      startedAt: string;
      completedAt: string | null;
      summaryJson: string;
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
        status: row.campaignStatus
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

function durationLabel(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "pending";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}
