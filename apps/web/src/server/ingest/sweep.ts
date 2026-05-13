import fs from "node:fs";
import path from "node:path";
import { getBoundaryConfig } from "@/server/config";
import { openDatabase } from "@/server/db/client";
import { ingestArtifactFile } from "@/server/ingest/from-artifact";

export type IngestSweepResult = {
  scanned: number;
  ingested: number;
  failed: number;
};

export function sweepArtifactIngest(artifactDir = getBoundaryConfig().artifactDir): IngestSweepResult {
  const db = openDatabase();
  const result: IngestSweepResult = {
    scanned: 0,
    ingested: 0,
    failed: 0
  };

  try {
    for (const filePath of jsonFiles(artifactDir)) {
      result.scanned += 1;
      try {
        ingestArtifactFile(filePath, db);
        result.ingested += 1;
      } catch {
        result.failed += 1;
      }
    }
  } finally {
    db.close();
  }

  return result;
}

function jsonFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    if (entry.isFile() && entry.name.endsWith(".json")) return [entryPath];
    return [];
  });
}
