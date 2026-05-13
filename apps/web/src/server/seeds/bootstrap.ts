import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { z } from "zod";
import type { BoundaryDatabase } from "@/server/db/client";

const attackCaseSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  sequence: z.array(
    z.object({
      turn: z.number().int().min(1),
      channel: z.string(),
      input: z.string()
    })
  ).min(1),
  expected_safe_behavior: z.array(z.string()),
  success_criteria: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  exploitability: z.enum(["high", "medium", "low"]).optional(),
  regression_recommendation: z.boolean()
});

const seedFileSchema = z.object({
  cases: z.array(attackCaseSchema)
});

type BootstrapSeedOptions = {
  seedDir: string;
};

export function bootstrapSeeds(db: BoundaryDatabase, options: BootstrapSeedOptions) {
  if (!fs.existsSync(options.seedDir)) {
    writeAudit(db, "seed_library_missing", "seed_dir", options.seedDir, "skipped", {
      seedDir: options.seedDir
    });
    return { inserted: 0, skipped: 1 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const file of fs.readdirSync(options.seedDir).filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(options.seedDir, file);
    try {
      const parsed = seedFileSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")));

      for (const attackCase of parsed.cases) {
        const promptTemplate = attackCase.sequence.map((turn) => turn.input).join("\n\n");
        const now = new Date().toISOString();
        const contentHash = hashJson(attackCase);
        const severity = normalizeSeverity(attackCase.severity);

        db.prepare(`
          INSERT INTO seeds (
            id, category, category_slug, title, severity, prompt_template, version,
            content_hash, source_file, created_at, updated_at
          ) VALUES (
            @id, @category, @category_slug, @title, @severity, @prompt_template, @version,
            @content_hash, @source_file, @created_at, @updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            category_slug = excluded.category_slug,
            title = excluded.title,
            severity = excluded.severity,
            prompt_template = excluded.prompt_template,
            version = excluded.version,
            content_hash = excluded.content_hash,
            source_file = excluded.source_file,
            updated_at = excluded.updated_at
        `).run({
          id: attackCase.id,
          category: attackCase.category,
          category_slug: slugify(attackCase.category),
          title: titleize(attackCase.subcategory),
          severity,
          prompt_template: promptTemplate,
          version: attackCase.version,
          content_hash: contentHash,
          source_file: path.relative(process.cwd(), filePath),
          created_at: now,
          updated_at: now
        });

        db.prepare(`
          INSERT INTO seed_versions (
            id, seed_id, version, prompt_template, content_hash, status, created_by, created_at
          ) VALUES (
            @id, @seed_id, @version, @prompt_template, @content_hash, 'auto_approved', 'seed_bootstrap', @created_at
          )
          ON CONFLICT(seed_id, version) DO NOTHING
        `).run({
          id: ulid(),
          seed_id: attackCase.id,
          version: attackCase.version,
          prompt_template: promptTemplate,
          content_hash: contentHash,
          created_at: now
        });

        inserted += 1;
      }
    } catch (error) {
      skipped += 1;
      writeAudit(db, "seed_library_file_skipped", "seed_file", file, "skipped", {
        error: error instanceof Error ? error.message : "Unknown seed parse error"
      });
    }
  }

  if (skipped > 0) {
    writeAudit(db, "seed_library_partial", "seed_library", options.seedDir, "degraded", {
      skipped
    });
  }

  return { inserted, skipped };
}

function writeAudit(
  db: BoundaryDatabase,
  action: string,
  targetType: string,
  targetId: string,
  outcome: string,
  metadata: Record<string, unknown>
) {
  db.prepare(`
    INSERT INTO audit_events (
      id, occurred_at, actor_type, actor_id, action, target_type, target_id,
      outcome, rule_ref, policy_snapshot_hash, metadata_json
    ) VALUES (
      @id, @occurred_at, 'system', NULL, @action, @target_type, @target_id,
      @outcome, 'R7', NULL, @metadata_json
    )
  `).run({
    id: ulid(),
    occurred_at: new Date().toISOString(),
    action,
    target_type: targetType,
    target_id: targetId,
    outcome,
    metadata_json: JSON.stringify(metadata)
  });
}

function normalizeSeverity(value: "critical" | "high" | "medium" | "low" | "informational") {
  if (value === "medium") return "med";
  if (value === "informational") return "info";
  return value;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleize(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function hashJson(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
