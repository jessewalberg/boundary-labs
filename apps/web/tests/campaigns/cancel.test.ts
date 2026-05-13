import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { cancelCampaign } from "../../src/server/campaigns/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("campaign cancellation", () => {
  it("cancels queued campaigns and writes audit", () => {
    const context = createSafetyGateContext("boundary-cancel-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    insertCampaign(db, "campaign-1", "queued");
    db.close();

    cancelCampaign("campaign-1", "operator-1", "stopping test");

    const verify = new Database(context.sqlitePath);
    expect(verify.prepare("SELECT status FROM campaigns WHERE id = 'campaign-1'").get()).toMatchObject({
      status: "cancelled"
    });
    expect(verify.prepare("SELECT status FROM campaign_jobs WHERE campaign_id = 'campaign-1'").get()).toMatchObject({
      status: "cancelled"
    });
    expect(verify.prepare("SELECT action FROM audit_events WHERE target_id = 'campaign-1'").get()).toMatchObject({
      action: "campaign:cancel"
    });
    verify.close();
  });

  it("caps cancel reasons at 1000 characters", () => {
    const context = createSafetyGateContext("boundary-cancel-cap-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    insertCampaign(db, "campaign-1", "queued");
    db.close();

    expect(() => cancelCampaign("campaign-1", "operator-1", "x".repeat(1001))).toThrow(/1000/);
  });
});

function insertCampaign(db: Database.Database, id: string, status: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO campaigns (
      id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
      artifact_path, created_at, updated_at
    ) VALUES (?, 'https://clinical-copilot.up.railway.app', '[]', ?, 'synthetic', 500, 'operator-1', '/tmp/artifact.json', ?, ?)
  `).run(id, status, now, now);
  db.prepare(`
    INSERT INTO campaign_jobs (
      id, campaign_id, status, submitted_by, payload_json, created_at, updated_at
    ) VALUES (?, ?, 'queued', 'operator-1', '{}', ?, ?)
  `).run(`${id}-job`, id, now, now);
}
