import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createQueuedCampaign } from "../../src/server/campaigns/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";

describe("authenticated campaign launch persistence", () => {
  it("writes campaign, job, and audit rows", async () => {
    const context = createBootstrapContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    process.env.BOUNDARY_TARGET_ALLOWLIST = "https://clinical-copilot.up.railway.app";
    runDatabaseBootstrap(context);

    const campaign = await createQueuedCampaign({
      targetUrl: "https://clinical-copilot.up.railway.app",
      categories: ["authorization", "prompt-injection"],
      budgetCents: 500,
      requestedBy: "operator-1"
    });

    const db = new Database(context.sqlitePath);
    expect(db.prepare("SELECT status, submitted_by FROM campaigns WHERE id = ?").get(campaign.id)).toMatchObject({
      status: "queued",
      submitted_by: "operator-1"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM campaign_jobs WHERE campaign_id = ?").get(campaign.id)).toMatchObject({
      count: 1
    });
    expect(db.prepare("SELECT action FROM audit_events WHERE target_id = ?").get(campaign.id)).toMatchObject({
      action: "campaign:create"
    });
    db.close();
  });

  it("allows an empty category filter to queue the complete seed library", async () => {
    const context = createBootstrapContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = path.join(context.root, "artifacts");
    process.env.BOUNDARY_TARGET_ALLOWLIST = "https://clinical-copilot.up.railway.app";
    runDatabaseBootstrap(context);

    const campaign = await createQueuedCampaign({
      targetUrl: "https://clinical-copilot.up.railway.app",
      categories: [],
      budgetCents: 500,
      requestedBy: "operator-1"
    });

    const db = new Database(context.sqlitePath);
    expect(db.prepare("SELECT categories_json FROM campaigns WHERE id = ?").get(campaign.id)).toMatchObject({
      categories_json: "[]"
    });
    expect(db.prepare("SELECT payload_json FROM campaign_jobs WHERE campaign_id = ?").get(campaign.id)).toMatchObject({
      payload_json: JSON.stringify({
        targetUrl: "https://clinical-copilot.up.railway.app",
        categories: [],
        budgetCents: 500
      })
    });
    db.close();
  });
});

function createBootstrapContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-launch-"));
  return {
    root,
    sqlitePath: path.join(root, "boundary.db"),
    migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
    policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
    seedDir: path.resolve(process.cwd(), "../../evals/seeds")
  };
}
