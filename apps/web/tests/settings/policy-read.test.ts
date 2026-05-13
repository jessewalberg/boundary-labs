import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { listPolicyValues } from "../../src/server/policy/repository";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("policy read surface", () => {
  it("can render non-system policy rows while keeping reserved rows hidden", () => {
    const context = createSafetyGateContext("boundary-policy-read-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);

    const rows = listPolicyValues();
    const visible = rows.filter((row) => row.system_reserved === 0);
    const hidden = rows.filter((row) => row.system_reserved === 1).map((row) => row.key);

    expect(visible.length).toBeGreaterThan(0);
    expect(hidden).toContain("policy:write");
    expect(visible.map((row) => row.key)).not.toContain("policy:write");
  });
});
