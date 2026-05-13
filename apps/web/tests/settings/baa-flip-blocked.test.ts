import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmBaaAcknowledgement,
  getBaaAcknowledgementState
} from "../../src/server/baa/repository";
import { runDatabaseBootstrap } from "../../src/server/db/migrate";
import { evaluatePolicyAction } from "../../src/server/policies";
import { createSafetyGateContext } from "../safety-gate/helpers";

const originalBaaHash = process.env.BAA_DOCUMENT_HASH;
const originalSqlitePath = process.env.SQLITE_PATH;

afterEach(() => {
  if (originalBaaHash == null) {
    delete process.env.BAA_DOCUMENT_HASH;
  } else {
    process.env.BAA_DOCUMENT_HASH = originalBaaHash;
  }
  if (originalSqlitePath == null) {
    delete process.env.SQLITE_PATH;
  } else {
    process.env.SQLITE_PATH = originalSqlitePath;
  }
});

describe("BAA acknowledgement gate", () => {
  it("blocks real-PHI mode until the configured BAA hash is acknowledged", () => {
    const context = createSafetyGateContext("boundary-baa-confirm-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BAA_DOCUMENT_HASH = "sha256:test-baa";
    runDatabaseBootstrap(context);

    const denied = new Database(context.sqlitePath);
    expect(evaluatePolicyAction({
      db: denied,
      action: "data_mode:flip_real_phi",
      actorRole: "admin",
      actorId: "admin-1",
      payload: { from: "synthetic", to: "real_phi" }
    })).toMatchObject({
      outcome: "deny",
      ruleRef: "R16"
    });
    denied.close();

    confirmBaaAcknowledgement({
      typedHash: "sha256:test-baa",
      actorId: "admin-1"
    });

    const verify = new Database(context.sqlitePath);
    expect(verify.prepare("SELECT value_json, updated_by FROM policy_values WHERE key = 'baa_acknowledged'").get()).toMatchObject({
      value_json: "true",
      updated_by: "admin-1"
    });
    const audit = verify.prepare("SELECT metadata_json FROM audit_events WHERE action = 'baa_acknowledged'").get() as
      | { metadata_json: string }
      | undefined;
    expect(JSON.parse(audit?.metadata_json ?? "{}")).toMatchObject({
      baaDocumentHash: "sha256:test-baa",
      acknowledged: true
    });
    expect(evaluatePolicyAction({
      db: verify,
      action: "data_mode:flip_real_phi",
      actorRole: "admin",
      actorId: "admin-1",
      payload: { from: "synthetic", to: "real_phi" }
    })).toMatchObject({
      outcome: "approval_required",
      approvalPath: "admin"
    });
    verify.close();
  });

  it("refuses a wrong typed hash without writing an acknowledgement audit", () => {
    const context = createSafetyGateContext("boundary-baa-wrong-");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BAA_DOCUMENT_HASH = "sha256:expected";
    runDatabaseBootstrap(context);

    expect(() => confirmBaaAcknowledgement({
      typedHash: "sha256:wrong",
      actorId: "admin-1"
    })).toThrow(/does not match/);

    const verify = new Database(context.sqlitePath);
    expect(verify.prepare("SELECT value_json FROM policy_values WHERE key = 'baa_acknowledged'").get()).toMatchObject({
      value_json: "false"
    });
    expect(verify.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'baa_acknowledged'").get()).toMatchObject({
      count: 0
    });
    verify.close();
  });

  it("reports no confirm affordance when the env hash is unset", () => {
    const context = createSafetyGateContext("boundary-baa-unset-");
    process.env.SQLITE_PATH = context.sqlitePath;
    delete process.env.BAA_DOCUMENT_HASH;
    runDatabaseBootstrap(context);

    expect(getBaaAcknowledgementState()).toMatchObject({
      hashConfigured: false,
      acknowledged: false
    });
  });
});
