import { ulid } from "ulid";
import { openDatabase } from "@/server/db/client";

export type TargetVersionRecord = {
  id: string;
  versionKey: string;
  label: string | null;
  source: string;
  comparable: boolean;
  createdAt: string;
};

export function getOrCreateTargetVersion(input: {
  versionKey: string;
  label?: string | null;
  source?: string;
  comparable?: boolean;
}): TargetVersionRecord {
  const versionKey = input.versionKey.trim() || "unknown";
  const db = openDatabase();
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO target_versions (id, version_key, label, source, comparable, created_at)
      VALUES (@id, @version_key, @label, @source, @comparable, @created_at)
      ON CONFLICT(version_key) DO NOTHING
    `).run({
      id: ulid(),
      version_key: versionKey,
      label: input.label ?? null,
      source: input.source ?? "unknown",
      comparable: input.comparable === false ? 0 : 1,
      created_at: now
    });

    const row = db.prepare(`
      SELECT
        id,
        version_key AS versionKey,
        label,
        source,
        comparable,
        created_at AS createdAt
      FROM target_versions
      WHERE version_key = ?
    `).get(versionKey) as Omit<TargetVersionRecord, "comparable"> & { comparable: 0 | 1 };

    return { ...row, comparable: row.comparable === 1 };
  } finally {
    db.close();
  }
}
