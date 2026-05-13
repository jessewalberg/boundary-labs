import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import type { BoundaryRun } from "@/server/campaigns/fixtures";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase } from "@/server/db/client";
import { buildEvalRunnerCommand } from "@/server/eval-runner";
import type { StoredCampaignRecord } from "./types";

type CreateCampaignInput = {
  targetUrl: string;
  categories: string[];
  budgetCents: number;
  requestedBy: string;
};

export async function createQueuedCampaign(input: CreateCampaignInput) {
  const config = getBoundaryConfig();
  const targetUrl = assertAllowedTarget(input.targetUrl, config.targetAllowlist);
  const categories = normalizeCategories(input.categories);
  const now = new Date().toISOString();
  const id = ulid();
  const artifactPath = path.join(campaignDirectory(config.artifactDir), `${id}.json`);
  const runnerCommand = buildEvalRunnerCommand(targetUrl, config.evalRunnerPath);

  const record: StoredCampaignRecord = {
    id,
    targetUrl,
    categories,
    status: "queued",
    dataMode: config.dataMode,
    budgetCents: clampBudget(input.budgetCents),
    createdAt: now,
    updatedAt: now,
    requestedBy: input.requestedBy,
    artifactPath,
    runnerCommand
  };

  insertQueuedCampaignRecord(record);

  await mkdir(campaignDirectory(config.artifactDir), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return record;
}

export async function listStoredCampaigns() {
  const config = getBoundaryConfig();
  const dir = campaignDirectory(config.artifactDir);
  const persisted = listPersistedCampaigns();

  try {
    const files = await readdir(dir);
    const records = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => readStoredCampaign(path.join(dir, file)))
    );

    const artifacts = records
      .filter((record): record is StoredCampaignRecord => Boolean(record))
      .filter((record) => !persisted.some((campaign) => campaign.id === record.id));

    return [...persisted, ...artifacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return persisted;
    }
    throw error;
  }
}

export async function getStoredCampaign(id: string) {
  const campaigns = await listStoredCampaigns();
  return campaigns.find((campaign) => campaign.id === id);
}

export function storedCampaignToRun(record: StoredCampaignRecord): BoundaryRun {
  return {
    id: record.id,
    target: record.targetUrl,
    startedAt: record.createdAt,
    duration: record.status === "queued" ? "pending" : "0.0s",
    branch: "local-campaign",
    commit: record.id.slice(-8),
    summary: { pass: 0, fail: 0, partial: 0, invalid: 0 },
    seedCount: record.categories.length,
    coverage: record.categories,
    trigger: "manual",
    status: record.status
  };
}

async function readStoredCampaign(filePath: string) {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as StoredCampaignRecord;
}

function campaignDirectory(artifactDir: string) {
  return path.join(artifactDir, "campaigns");
}

function insertQueuedCampaignRecord(record: StoredCampaignRecord) {
  const db = openDatabase();
  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO campaigns (
        id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
        artifact_path, created_at, updated_at
      ) VALUES (
        @id, @target_url, @categories_json, @status, @data_mode, @budget_cents, @submitted_by,
        @artifact_path, @created_at, @updated_at
      )
    `).run({
      id: record.id,
      target_url: record.targetUrl,
      categories_json: JSON.stringify(record.categories),
      status: record.status,
      data_mode: record.dataMode,
      budget_cents: record.budgetCents,
      submitted_by: record.requestedBy,
      artifact_path: record.artifactPath,
      created_at: record.createdAt,
      updated_at: record.updatedAt
    });

    db.prepare(`
      INSERT INTO campaign_jobs (
        id, campaign_id, status, submitted_by, payload_json, created_at, updated_at
      ) VALUES (
        @id, @campaign_id, 'queued', @submitted_by, @payload_json, @created_at, @updated_at
      )
    `).run({
      id: ulid(),
      campaign_id: record.id,
      submitted_by: record.requestedBy,
      payload_json: JSON.stringify({
        targetUrl: record.targetUrl,
        categories: record.categories,
        budgetCents: record.budgetCents
      }),
      created_at: record.createdAt,
      updated_at: record.updatedAt
    });

    db.prepare(`
      INSERT INTO audit_events (
        id, occurred_at, actor_type, actor_id, action, target_type, target_id,
        outcome, rule_ref, policy_snapshot_hash, metadata_json
      ) VALUES (
        @id, @occurred_at, 'operator', @actor_id, 'campaign:create', 'campaign', @target_id,
        'ok', 'R9', NULL, @metadata_json
      )
    `).run({
      id: ulid(),
      occurred_at: record.createdAt,
      actor_id: record.requestedBy,
      target_id: record.id,
      metadata_json: JSON.stringify({
        targetUrl: record.targetUrl,
        categories: record.categories,
        budgetCents: record.budgetCents
      })
    });
  });

  try {
    insert();
  } finally {
    db.close();
  }
}

function listPersistedCampaigns() {
  const config = getBoundaryConfig();
  const db = openDatabase();
  try {
    const rows = db.prepare(`
      SELECT
        id,
        target_url AS targetUrl,
        categories_json AS categoriesJson,
        status,
        data_mode AS dataMode,
        budget_cents AS budgetCents,
        submitted_by AS requestedBy,
        artifact_path AS artifactPath,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM campaigns
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      targetUrl: string;
      categoriesJson: string;
      status: StoredCampaignRecord["status"];
      dataMode: "synthetic";
      budgetCents: number;
      requestedBy: string;
      artifactPath: string;
      createdAt: string;
      updatedAt: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      targetUrl: row.targetUrl,
      categories: JSON.parse(row.categoriesJson) as string[],
      status: row.status,
      dataMode: row.dataMode,
      budgetCents: row.budgetCents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      requestedBy: row.requestedBy,
      artifactPath: row.artifactPath,
      runnerCommand: buildEvalRunnerCommand(row.targetUrl, config.evalRunnerPath)
    }));
  } catch (error) {
    if (error instanceof Error && /no such table: campaigns/.test(error.message)) {
      return [];
    }
    throw error;
  } finally {
    db.close();
  }
}

function assertAllowedTarget(targetUrl: string, allowlist: string[]) {
  const parsedTarget = new URL(targetUrl);
  const allowed = allowlist.some((candidate) => new URL(candidate).origin === parsedTarget.origin);

  if (!allowed) {
    throw new Error("Target URL is not in BOUNDARY_TARGET_ALLOWLIST.");
  }

  return parsedTarget.toString().replace(/\/$/, "");
}

function normalizeCategories(categories: string[]) {
  const unique = Array.from(new Set(categories.map((category) => category.trim()).filter(Boolean)));

  if (unique.length === 0) {
    throw new Error("Select at least one attack category.");
  }

  return unique;
}

function clampBudget(value: number) {
  if (!Number.isFinite(value)) return 500;
  return Math.min(Math.max(Math.round(value), 100), 10000);
}
