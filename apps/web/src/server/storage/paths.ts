import fs from "node:fs";
import path from "node:path";
import { getBoundaryConfig } from "@/server/config";

export function ensureLocalStatePaths() {
  const config = getBoundaryConfig();
  const sqliteDir = path.dirname(config.sqlitePath);

  fs.mkdirSync(sqliteDir, { recursive: true });
  fs.mkdirSync(config.artifactDir, { recursive: true });

  return {
    sqliteDir,
    artifactDir: config.artifactDir
  };
}
