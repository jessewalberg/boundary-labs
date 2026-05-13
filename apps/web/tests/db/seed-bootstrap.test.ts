import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";

describe("seed bootstrap", () => {
  it("loads valid seeds, normalizes severity, and audits malformed files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-seeds-"));
    const seedDir = path.join(root, "seeds");
    fs.mkdirSync(seedDir);
    fs.copyFileSync(path.resolve(process.cwd(), "../../evals/seeds/p0_mvp_cases.json"), path.join(seedDir, "valid.json"));
    fs.writeFileSync(path.join(seedDir, "broken.json"), "{\"cases\":[{\"id\":false}]}", "utf8");

    runDatabaseBootstrap({
      sqlitePath: path.join(root, "boundary.db"),
      migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
      policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
      seedDir
    });

    const db = new Database(path.join(root, "boundary.db"));
    expect(db.prepare("SELECT COUNT(*) AS count FROM seeds").get()).toMatchObject({ count: 4 });
    expect(db.prepare("SELECT severity FROM seeds WHERE id = 'seed_authz_cross_patient_chat_001'").get()).toMatchObject({
      severity: "critical"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM seed_versions").get()).toMatchObject({ count: 4 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'seed_library_file_skipped'").get()).toMatchObject({
      count: 1
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'seed_library_partial'").get()).toMatchObject({
      count: 1
    });
    db.close();
  });
});
