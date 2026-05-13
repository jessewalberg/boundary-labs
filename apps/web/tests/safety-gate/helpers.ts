import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";

export function createSafetyGateContext(prefix = "boundary-policy-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    sqlitePath: path.join(root, "boundary.db"),
    migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
    policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
    seedDir: path.resolve(process.cwd(), "../../evals/seeds")
  };
}

export function bootstrappedDb() {
  const context = createSafetyGateContext();
  process.env.SQLITE_PATH = context.sqlitePath;
  runDatabaseBootstrap(context);
  return {
    context,
    db: new Database(context.sqlitePath)
  };
}
