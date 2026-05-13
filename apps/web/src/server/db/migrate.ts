import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { z } from "zod";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase, type BoundaryDatabase } from "@/server/db/client";
import { bootstrapSeeds } from "@/server/seeds/bootstrap";
import {
  assertSystemReservedRowsPresent,
  loadPolicyValues
} from "@/server/safety-gate/load";
import { snapshotPolicyValues } from "@/server/safety-gate/snapshot";

const policySeedSchema = z.object({
  values: z.array(
    z.object({
      key: z.string(),
      domain: z.string(),
      value: z.unknown(),
      value_type: z.string(),
      approval_path: z.string(),
      system_reserved: z.boolean(),
      description: z.string()
    })
  )
});

type BootstrapOptions = {
  sqlitePath?: string;
  migrationsDir?: string;
  policySeedPath?: string;
  seedDir?: string;
};

export function runDatabaseBootstrap(options: BootstrapOptions = {}) {
  const config = getBoundaryConfig();
  const db = openDatabase(options.sqlitePath ?? config.sqlitePath);

  try {
    runMigrations(db, options.migrationsDir ?? path.join(process.cwd(), "src/server/db/migrations"));
    bootstrapPolicyValues(db, options.policySeedPath ?? path.resolve(process.cwd(), "../../policy_seed.json"));
    const seedResult = bootstrapSeeds(db, {
      seedDir: options.seedDir ?? path.resolve(process.cwd(), "../../evals/seeds")
    });
    markSchemaReady(db);
    return seedResult;
  } finally {
    db.close();
  }
}

export function runMigrations(db: BoundaryDatabase, migrationsDir: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => (row as { version: string }).version)
  );

  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      file,
      new Date().toISOString()
    );
  }
}

export function bootstrapPolicyValues(db: BoundaryDatabase, policySeedPath: string) {
  const parsed = policySeedSchema.parse(JSON.parse(fs.readFileSync(policySeedPath, "utf8")));
  const now = new Date().toISOString();
  const existing = new Set(
    db.prepare("SELECT key FROM policy_values").all().map((row) => (row as { key: string }).key)
  );

  const insert = db.prepare(`
    INSERT INTO policy_values (
      key, domain, value_json, value_type, approval_path, system_reserved,
      description, updated_at, updated_by
    ) VALUES (
      @key, @domain, @value_json, @value_type, @approval_path, @system_reserved,
      @description, @updated_at, 'policy_seed'
    )
    ON CONFLICT(key) DO NOTHING
  `);

  const insertMany = db.transaction(() => {
    for (const value of parsed.values) {
      insert.run({
        ...value,
        value_json: JSON.stringify(value.value),
        system_reserved: value.system_reserved ? 1 : 0,
        updated_at: now
      });
    }
  });

  insertMany();

  const policyRows = loadPolicyValues(db);
  assertSystemReservedRowsPresent(policyRows);
  const snapshot = snapshotPolicyValues(policyRows);
  const insertedKeys = parsed.values.map((value) => value.key).filter((key) => !existing.has(key));

  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (?, ?, 'system', NULL, 'policy_loaded', 'policy_values', 'bootstrap', 'ok', 'R15', ?, ?)
  `).run(
    ulid(),
    now,
    snapshot.hash,
    JSON.stringify({
      policySeedPath,
      rows: policyRows.length,
      insertedKeys,
      schemaVersion: snapshot.schemaVersion
    })
  );
}

function markSchemaReady(db: BoundaryDatabase) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO policy_values (
      key, domain, value_json, value_type, approval_path, system_reserved,
      description, updated_at, updated_by
    ) VALUES (
      'schema_ready', 'System', 'true', 'boolean', 'auto', 1,
      'Set after migrations, policy seed, and seed bootstrap complete.', @updated_at, 'database_bootstrap'
    )
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run({ updated_at: now });
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runDatabaseBootstrap();
}
