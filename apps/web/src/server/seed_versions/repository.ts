import { openDatabase } from "@/server/db/client";

export type SeedVersionRecord = {
  id: string;
  seedId: string;
  version: number;
  status: string;
  createdBy: string;
  createdAt: string;
};

export function listSeedVersions(seedId?: string): SeedVersionRecord[] {
  const db = openDatabase();
  try {
    const sql = `
      SELECT
        id,
        seed_id AS seedId,
        version,
        status,
        created_by AS createdBy,
        created_at AS createdAt
      FROM seed_versions
      ${seedId ? "WHERE seed_id = ?" : ""}
      ORDER BY seed_id ASC, version DESC
    `;
    return (seedId ? db.prepare(sql).all(seedId) : db.prepare(sql).all()) as SeedVersionRecord[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}
