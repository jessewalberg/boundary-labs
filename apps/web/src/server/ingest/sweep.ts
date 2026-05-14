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
  copyBundledEvalArtifacts(artifactDir);

  const db = openDatabase();
  const result: IngestSweepResult = {
    scanned: 0,
    ingested: 0,
    failed: 0
  };

  try {
    for (const filePath of jsonFiles(artifactDir)) {
      if (isCampaignMetadataArtifact(filePath, artifactDir)) continue;
      if (isGraphHistoryArtifact(filePath)) continue;

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

function isCampaignMetadataArtifact(filePath: string, artifactDir: string) {
  const relative = path.relative(path.resolve(artifactDir), path.resolve(filePath));
  return relative.split(path.sep)[0] === "campaigns";
}

function isGraphHistoryArtifact(filePath: string) {
  return path.basename(filePath).endsWith(".graph.json");
}

function copyBundledEvalArtifacts(artifactDir: string) {
  if (process.env.NODE_ENV === "test" || process.env.BOUNDARY_INGEST_BUNDLED_EVALS !== "1") {
    return;
  }

  const sourceDir = bundledEvalResultsDir();
  if (!sourceDir) return;

  const destinationDir = path.join(artifactDir, "bundled-evals");
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const file of fs.readdirSync(sourceDir).sort()) {
    if (!file.endsWith(".json") || file === "latest.json") continue;

    const sourcePath = path.join(sourceDir, file);
    const destinationPath = path.join(destinationDir, file);
    if (!fs.statSync(sourcePath).isFile() || fs.existsSync(destinationPath)) continue;

    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function bundledEvalResultsDir() {
  const candidates = [
    path.resolve(process.cwd(), "evals/results"),
    path.resolve(process.cwd(), "../../evals/results")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
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
