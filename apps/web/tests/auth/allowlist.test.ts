import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import {
  assertEmailCanAuthenticate,
  ensureOperatorForAccount,
  revokeOperator
} from "../../src/server/operators/repository";

describe("operator allowlist", () => {
  beforeEach(() => {
    delete process.env.BOUNDARY_OPERATOR_EMAIL_ALLOWLIST;
    delete process.env.BOUNDARY_OWNER_EMAIL;
  });

  it("allows only configured emails and grants first owner admin", () => {
    const context = createBootstrapContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_OWNER_EMAIL = "owner@example.com";
    process.env.BOUNDARY_OPERATOR_EMAIL_ALLOWLIST = "operator@example.com";
    runDatabaseBootstrap(context);

    expect(() => assertEmailCanAuthenticate("operator@example.com")).not.toThrow();
    expect(() => assertEmailCanAuthenticate("outsider@example.com")).toThrow(/allowlisted/);

    const owner = ensureOperatorForAccount(
      { id: "auth-owner", email: "OWNER@example.com", name: "Owner" },
      { userId: "auth-owner", providerId: "github", accountId: "owner-sub" }
    );

    expect(owner).toMatchObject({ email: "owner@example.com", role: "admin", status: "active" });
  });

  it("keeps revoked provider identities tombstoned", () => {
    const context = createBootstrapContext();
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_OPERATOR_EMAIL_ALLOWLIST = "operator@example.com";
    runDatabaseBootstrap(context);

    ensureOperatorForAccount(
      { id: "auth-operator", email: "operator@example.com", name: "Operator" },
      { userId: "auth-operator", providerId: "github", accountId: "operator-sub" }
    );
    revokeOperator("github", "operator-sub");

    expect(() =>
      ensureOperatorForAccount(
        { id: "auth-operator-2", email: "operator@example.com", name: "Operator" },
        { userId: "auth-operator-2", providerId: "github", accountId: "operator-sub" }
      )
    ).toThrow(/revoked/);

    const db = new Database(context.sqlitePath);
    expect(db.prepare("SELECT status FROM operators WHERE provider_sub = 'operator-sub'").get()).toMatchObject({
      status: "revoked"
    });
    db.close();
  });
});

function createBootstrapContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-auth-"));
  return {
    sqlitePath: path.join(root, "boundary.db"),
    migrationsDir: path.resolve(process.cwd(), "src/server/db/migrations"),
    policySeedPath: path.resolve(process.cwd(), "../../policy_seed.json"),
    seedDir: path.resolve(process.cwd(), "../../evals/seeds")
  };
}
