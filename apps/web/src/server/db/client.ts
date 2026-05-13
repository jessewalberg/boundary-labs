import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getBoundaryConfig } from "@/server/config";

export type BoundaryDatabase = Database.Database;

export function openDatabase(sqlitePath = getBoundaryConfig().sqlitePath) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  return db;
}
