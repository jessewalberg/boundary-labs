import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/readyz/route";
import { runDatabaseBootstrap } from "../src/server/db/migrate";
import { createSafetyGateContext } from "./safety-gate/helpers";

const originalSqlitePath = process.env.SQLITE_PATH;
const originalHeartbeatPath = process.env.BOUNDARY_WORKER_HEARTBEAT_PATH;
const originalLlmAgentsEnabled = process.env.BOUNDARY_ENABLE_LLM_AGENTS;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const originalNodeEnv = process.env.NODE_ENV;
const originalBetterAuthUrl = process.env.BETTER_AUTH_URL;
const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET;

afterEach(() => {
  restoreEnv("SQLITE_PATH", originalSqlitePath);
  restoreEnv("BOUNDARY_WORKER_HEARTBEAT_PATH", originalHeartbeatPath);
  restoreEnv("BOUNDARY_ENABLE_LLM_AGENTS", originalLlmAgentsEnabled);
  restoreEnv("OPENROUTER_API_KEY", originalOpenRouterKey);
  restoreEnv("NODE_ENV", originalNodeEnv);
  restoreEnv("BETTER_AUTH_URL", originalBetterAuthUrl);
  restoreEnv("BETTER_AUTH_SECRET", originalBetterAuthSecret);
});

describe("/readyz", () => {
  it("reports worker, sqlite, and policy bootstrap subchecks", async () => {
    const context = createSafetyGateContext("boundary-readyz-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    process.env.BOUNDARY_ENABLE_LLM_AGENTS = "1";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("ok");
    expect(body.checks.workerHealth).toMatchObject({
      status: "ok",
      workerId: "worker-ci"
    });
    expect(body.checks.sqlite).toMatchObject({
      status: "ok"
    });
    expect(body.checks.policyBootstrap).toMatchObject({
      status: "ok",
      schemaReady: true
    });
    expect(body.checks.authConfiguration).toMatchObject({
      status: "ok"
    });
    expect(body.checks.agentProviders).toMatchObject({
      status: "ok",
      enabled: true
    });
  });

  it("degrades when policy requires LLM agents but the worker env disables them", async () => {
    const context = createSafetyGateContext("boundary-readyz-llm-disabled-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    delete process.env.BOUNDARY_ENABLE_LLM_AGENTS;
    delete process.env.OPENROUTER_API_KEY;
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("degraded");
    expect(body.checks.agentProviders).toMatchObject({
      status: "degraded",
      enabled: false,
      redTeamMode: "llm"
    });
  });

  it("skips agent providers when deterministic mode is explicit and LLM agents are disabled", async () => {
    const context = createSafetyGateContext("boundary-readyz-deterministic-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    delete process.env.BOUNDARY_ENABLE_LLM_AGENTS;
    delete process.env.OPENROUTER_API_KEY;
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    db.prepare("UPDATE policy_values SET value_json = ? WHERE key = 'red_team_mode'").run(JSON.stringify("deterministic"));
    db.close();
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("ok");
    expect(body.checks.agentProviders).toMatchObject({
      status: "skipped",
      enabled: false,
      redTeamMode: "deterministic"
    });
  });

  it("degrades when LLM agents are enabled without required provider keys", async () => {
    const context = createSafetyGateContext("boundary-readyz-llm-missing-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    process.env.BOUNDARY_ENABLE_LLM_AGENTS = "1";
    delete process.env.OPENROUTER_API_KEY;
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("degraded");
    expect(body.checks.agentProviders).toMatchObject({
      status: "degraded",
      enabled: true,
      missingSecrets: ["openrouter"]
    });
  });

  it("reports ok for LLM agents when enabled and required provider keys are present", async () => {
    const context = createSafetyGateContext("boundary-readyz-llm-ok-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    process.env.BOUNDARY_ENABLE_LLM_AGENTS = "1";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("ok");
    expect(body.checks.agentProviders).toMatchObject({
      status: "ok",
      enabled: true,
      requiredProviders: ["openrouter"],
      missingSecrets: []
    });
  });

  it("normalizes unsupported provider policy rows to OpenRouter", async () => {
    const context = createSafetyGateContext("boundary-readyz-unsupported-provider-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    process.env.BOUNDARY_ENABLE_LLM_AGENTS = "1";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    runDatabaseBootstrap(context);
    const db = new Database(context.sqlitePath);
    db.prepare("UPDATE policy_values SET value_json = ? WHERE key = 'agent_provider_judge'").run(JSON.stringify("unsupported-provider"));
    db.close();
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("ok");
    expect(body.checks.agentProviders).toMatchObject({
      status: "ok",
      enabled: true,
      requiredProviders: ["openrouter"],
      missingSecrets: []
    });
  });

  it("degrades in production when auth base URL or non-default secret is missing", async () => {
    const context = createSafetyGateContext("boundary-readyz-auth-prod-");
    const heartbeatPath = path.join(context.root, "worker.heartbeat");
    process.env.SQLITE_PATH = context.sqlitePath;
    process.env.BOUNDARY_WORKER_HEARTBEAT_PATH = heartbeatPath;
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_SECRET;
    runDatabaseBootstrap(context);
    fs.writeFileSync(heartbeatPath, "worker-ci 1.0\n", "utf8");

    const response = await GET();
    const body = await response.json();

    expect(body.status, JSON.stringify(body, null, 2)).toBe("degraded");
    expect(body.checks.authConfiguration).toMatchObject({
      status: "degraded",
      betterAuthUrlConfigured: false,
      betterAuthSecretConfigured: false
    });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
