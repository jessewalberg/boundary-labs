import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";

describe("audit_events append-only trigger", () => {
  it("blocks updates and deletes", () => {
    const context = createBootstrapContext();
    runDatabaseBootstrap(context);

    const db = new Database(context.sqlitePath);
    const event = db.prepare("SELECT id, actor_type FROM audit_events LIMIT 1").get() as {
      id: string;
      actor_type: string;
    };

    expect(() => db.prepare("UPDATE audit_events SET actor_type = 'operator' WHERE id = ?").run(event.id)).toThrow(
      /append-only/
    );
    expect(() => db.prepare("DELETE FROM audit_events WHERE id = ?").run(event.id)).toThrow(/append-only/);
    expect(db.prepare("SELECT actor_type FROM audit_events WHERE id = ?").get(event.id)).toMatchObject({
      actor_type: event.actor_type
    });
    db.close();
  });
});

function createBootstrapContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-audit-"));
  return {
    sqlitePath: path.join(root, "boundary.db"),
    migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
    policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
    seedDir: path.resolve(process.cwd(), "../../evals/seeds")
  };
}
