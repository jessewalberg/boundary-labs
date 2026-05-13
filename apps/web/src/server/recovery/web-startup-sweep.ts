import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase } from "@/server/db/client";

export type WebRecoveryResult = {
  orphaned: number;
};

export function runWebStartupRecoverySweep(): WebRecoveryResult {
  const config = getBoundaryConfig();
  const db = openDatabase();
  let orphaned = 0;

  try {
    const rows = db.prepare(`
      SELECT id, artifact_path AS artifactPath
      FROM campaigns
      WHERE status = 'running'
    `).all() as Array<{ id: string; artifactPath: string }>;
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      for (const row of rows) {
        const failedSentinel = path.join(config.artifactDir, "runs", row.id, `${row.id}.failed`);
        const completeSentinel = path.join(config.artifactDir, "runs", row.id, `${row.id}.complete`);
        if (fs.existsSync(completeSentinel)) continue;
        if (!fs.existsSync(failedSentinel)) {
          db.prepare("UPDATE campaigns SET status = 'failed', updated_at = ? WHERE id = ?").run(now, row.id);
          db.prepare(`
            INSERT INTO audit_events (
              id, occurred_at, actor_type, actor_id, action, target_type, target_id,
              outcome, rule_ref, policy_snapshot_hash, metadata_json
            ) VALUES (
              @id, @occurred_at, 'system', NULL, 'campaign_orphaned', 'campaign', @target_id,
              'failed', 'F5', NULL, @metadata_json
            )
          `).run({
            id: ulid(),
            occurred_at: now,
            target_id: row.id,
            metadata_json: JSON.stringify({ artifactPath: row.artifactPath })
          });
          orphaned += 1;
        }
      }
    });
    tx();
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
  } finally {
    db.close();
  }

  return { orphaned };
}
