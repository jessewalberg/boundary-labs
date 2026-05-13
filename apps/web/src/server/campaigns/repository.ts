import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoundaryRun } from "@/server/campaigns/fixtures";
import { getBoundaryConfig } from "@/server/config";
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
  const id = `campaign-${compactTimestamp(now)}-${randomUUID().slice(0, 8)}`;
  const artifactPath = path.join(campaignDirectory(config.artifactDir), `${id}.json`);

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
    runnerCommand: buildEvalRunnerCommand(targetUrl, config.evalRunnerPath)
  };

  await mkdir(campaignDirectory(config.artifactDir), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return record;
}

export async function listStoredCampaigns() {
  const config = getBoundaryConfig();
  const dir = campaignDirectory(config.artifactDir);

  try {
    const files = await readdir(dir);
    const records = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => readStoredCampaign(path.join(dir, file)))
    );

    return records
      .filter((record): record is StoredCampaignRecord => Boolean(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
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

function compactTimestamp(value: string) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}
