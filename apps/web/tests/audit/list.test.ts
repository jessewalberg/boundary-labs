import { describe, expect, it } from "vitest";
import { listAuditEvents } from "../../src/server/audit/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("audit ledger read model", () => {
  it("lists append-only audit events", () => {
    const context = createSafetyGateContext("boundary-audit-list-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);

    expect(listAuditEvents().some((event) => event.action === "policy_loaded")).toBe(true);
  });
});
