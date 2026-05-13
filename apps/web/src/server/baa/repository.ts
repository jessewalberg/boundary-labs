import { ulid } from "ulid";
import { getBoundaryConfig, type BoundaryConfig } from "@/server/config";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import { loadPolicyValues } from "@/server/safety-gate/load";
import { snapshotPolicyValues } from "@/server/safety-gate/snapshot";

export type BaaAcknowledgementState = {
  hashConfigured: boolean;
  acknowledged: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function getBaaAcknowledgementState(
  config: BoundaryConfig = getBoundaryConfig()
): BaaAcknowledgementState {
  const db = openDatabase(config.sqlitePath);
  try {
    const row = db.prepare(`
      SELECT value_json, updated_at, updated_by
      FROM policy_values
      WHERE key = 'baa_acknowledged'
    `).get() as
      | { value_json: string; updated_at: string; updated_by: string }
      | undefined;

    return {
      hashConfigured: Boolean(config.baaDocumentHash),
      acknowledged: parseBoolean(row?.value_json),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null
    };
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return {
      hashConfigured: Boolean(config.baaDocumentHash),
      acknowledged: false,
      updatedAt: null,
      updatedBy: null
    };
  } finally {
    db.close();
  }
}

export function confirmBaaAcknowledgement(input: {
  typedHash: string;
  actorId: string;
  config?: BoundaryConfig;
}) {
  const config = input.config ?? getBoundaryConfig();
  const expectedHash = config.baaDocumentHash;
  if (!expectedHash) throw new Error("BAA document hash is not configured.");
  if (input.typedHash !== expectedHash) {
    throw new Error("Typed BAA hash does not match the configured document hash.");
  }

  const db = openDatabase(config.sqlitePath);
  try {
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      const previous = db.prepare(`
        SELECT value_json
        FROM policy_values
        WHERE key = 'baa_acknowledged'
      `).get() as { value_json: string } | undefined;
      if (!previous) throw new Error("Missing baa_acknowledged policy row.");

      db.prepare(`
        UPDATE policy_values
        SET value_json = 'true',
            updated_at = @updated_at,
            updated_by = @updated_by
        WHERE key = 'baa_acknowledged'
      `).run({
        updated_at: now,
        updated_by: input.actorId
      });

      writeBaaAudit(db, {
        actorId: input.actorId,
        occurredAt: now,
        baaDocumentHash: expectedHash,
        previousValue: parseBoolean(previous.value_json)
      });
    });
    tx();
  } finally {
    db.close();
  }
}

function writeBaaAudit(
  db: BoundaryDatabase,
  input: {
    actorId: string;
    occurredAt: string;
    baaDocumentHash: string;
    previousValue: boolean;
  }
) {
  const snapshot = snapshotPolicyValues(loadPolicyValues(db));
  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, 'operator', @actor_id, 'baa_acknowledged', 'policy_values',
      'baa_acknowledged', 'ok', 'R16', @policy_snapshot_hash, @metadata_json
    )
  `).run({
    id: ulid(),
    occurred_at: input.occurredAt,
    actor_id: input.actorId,
    policy_snapshot_hash: snapshot.hash,
    metadata_json: JSON.stringify({
      baaDocumentHash: input.baaDocumentHash,
      previousValue: input.previousValue,
      acknowledged: true
    })
  });
}

function parseBoolean(valueJson: string | undefined) {
  if (!valueJson) return false;
  try {
    return JSON.parse(valueJson) === true;
  } catch {
    return false;
  }
}
