import { describe, expect, it } from "vitest";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { listThreatCoverage } from "../../src/server/coverage/query";
import { createSafetyGateContext } from "../safety-gate/helpers";

describe("derived coverage query", () => {
  it("derives day-one coverage from bootstrapped seeds", () => {
    const context = createSafetyGateContext("boundary-coverage-");
    process.env.SQLITE_PATH = context.sqlitePath;
    runDatabaseBootstrap(context);

    const coverage = listThreatCoverage();

    expect(coverage.length).toBeGreaterThan(0);
    expect(coverage[0]).toMatchObject({
      status: "covered"
    });
  });
});
