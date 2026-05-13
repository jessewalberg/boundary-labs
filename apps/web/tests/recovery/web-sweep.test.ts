import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { runWebStartupRecoverySweep } from "../../src/server/recovery/web-startup-sweep";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("web startup recovery sweep", () => {
  it("marks running campaigns without sentinels as orphaned failures", () => {
    const context = createSafetyGateContext("boundary-web-recovery-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_ARTIFACT_DIR = `${context.root}/artifacts`;
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaigns (
        id, target_url, categories_json, status, data_mode, budget_cents, submitted_by,
        artifact_path, created_at, updated_at
      ) VALUES (
        'campaign-orphan', 'https://clinical-copilot.up.railway.app', '[]', 'running',
        'synthetic', 500, 'operator-1', '/tmp/artifact.json', ?, ?
      )
    `).run(now, now);
    db.close();

    expect(runWebStartupRecoverySweep()).toEqual({ orphaned: 1 });

    const verify = new Database(context.sqlitePath);
    expect(verify.prepare("SELECT status FROM campaigns WHERE id = 'campaign-orphan'").get()).toMatchObject({
      status: "failed"
    });
    expect(verify.prepare("SELECT action FROM audit_events WHERE target_id = 'campaign-orphan'").get()).toMatchObject({
      action: "campaign_orphaned"
    });
    verify.close();
  });
});
