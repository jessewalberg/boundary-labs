import { listSeedAttemptRecords } from "@/server/attempts/repository";
import { openDatabase } from "@/server/db/client";
import type { SeedRow } from "@/server/db/schema";

export function listSeeds(): SeedRow[] {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        category,
        category_slug,
        title,
        severity,
        prompt_template,
        version,
        content_hash,
        source_file,
        created_at,
        updated_at
      FROM seeds
      ORDER BY category ASC, id ASC
    `).all() as SeedRow[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}

export function listSeedUsageRecords() {
  return listSeedAttemptRecords();
}
