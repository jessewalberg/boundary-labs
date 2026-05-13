import { openDatabase } from "@/server/db/client";

export type ReportRecord = {
  id: string;
  findingId: string | null;
  status: string;
  title: string;
  artifactPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function listReports(): ReportRecord[] {
  const db = openDatabase();
  try {
    return db.prepare(`
      SELECT
        id,
        finding_id AS findingId,
        status,
        title,
        artifact_path AS artifactPath,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM reports
      ORDER BY updated_at DESC
    `).all() as ReportRecord[];
  } catch (error) {
    if (!(error instanceof Error) || !/no such table/.test(error.message)) throw error;
    return [];
  } finally {
    db.close();
  }
}
