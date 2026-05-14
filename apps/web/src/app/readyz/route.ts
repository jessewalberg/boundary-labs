import { ensureLocalStatePaths } from "@/server/storage/paths";
import { getBoundaryConfig } from "@/server/config";
import { policySchema } from "@/server/safety-gate/schema";
import { getWorkerHealthSnapshot } from "@/server/worker-health/repository";
import Database from "better-sqlite3";
import fs from "node:fs";

type ReadinessCheck = {
  status: "ok" | "skipped" | "degraded";
  detail?: string;
  [key: string]: unknown;
};

export async function GET() {
  const config = getBoundaryConfig();
  const paths = ensureLocalStatePaths();
  const workerHealth = checkWorkerHealth();
  const authConfiguration = checkAuthConfiguration(config);
  const sqlite = await checkSqliteIntegrity(config.sqlitePath);
  const policyBootstrap = await checkPolicyBootstrap(config.sqlitePath);
  const agentProviders = await checkAgentProviders(config);
  const status = [workerHealth, authConfiguration, sqlite, policyBootstrap, agentProviders].some((check) => check.status === "degraded")
    ? "degraded"
    : "ok";

  return Response.json({
    status,
    service: "boundary-web",
    checks: {
      app: "ok",
      sqliteDirectory: paths.sqliteDir,
      artifactDirectory: paths.artifactDir,
      workerHealth,
      authConfiguration,
      sqlite,
      policyBootstrap,
      agentProviders,
      targetUrl: config.targetUrl,
      evalRunnerPath: config.evalRunnerPath,
      dataMode: config.dataMode
    }
  });
}

function checkWorkerHealth(): ReadinessCheck {
  const snapshot = getWorkerHealthSnapshot();
  return {
    status: snapshot.status === "ok" ? "ok" : "degraded",
    detail: snapshot.detail,
    workerId: snapshot.workerId,
    lastSeenAt: snapshot.lastSeenAt,
    ageSeconds: snapshot.ageSeconds,
    queuedJobs: snapshot.queuedJobs,
    claimedJobs: snapshot.claimedJobs,
    staleClaimedJobs: snapshot.staleClaimedJobs,
    recentBackpressureEvents: snapshot.recentBackpressureEvents
  };
}

function checkAuthConfiguration(config: ReturnType<typeof getBoundaryConfig>): ReadinessCheck {
  const usingDefaultSecret = config.betterAuthSecret === "boundary-labs-local-development-secret-change-before-production";
  const missingBaseUrl = !config.betterAuthUrl;

  if (process.env.NODE_ENV === "production" && (missingBaseUrl || usingDefaultSecret)) {
    return {
      status: "degraded",
      detail: "production auth configuration is incomplete",
      betterAuthUrlConfigured: !missingBaseUrl,
      betterAuthSecretConfigured: !usingDefaultSecret
    };
  }

  return {
    status: "ok",
    detail: "auth configuration is present for this environment",
    betterAuthUrlConfigured: !missingBaseUrl,
    betterAuthSecretConfigured: !usingDefaultSecret
  };
}

async function checkAgentProviders(config: ReturnType<typeof getBoundaryConfig>): Promise<ReadinessCheck> {
  if (!fs.existsSync(config.sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  let agentPolicy: AgentProviderPolicy;
  try {
    const db = new Database(config.sqlitePath, { readonly: true, fileMustExist: true });
    agentPolicy = readAgentProviderPolicy(db);
    db.close();
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not inspect agent provider policy"
    };
  }

  const policyProviders = agentPolicy.providers;
  const providerValues = Object.values(policyProviders);
  const missingPolicyKeys = ["orchestrator", "red_team", "judge", "documentation"].filter(
    (role) => !policyProviders[role]
  );
  const requiredProviders = [...new Set(providerValues)].sort();
  const missingSecrets = requiredProviders.filter((provider) => {
    if (provider === "openrouter") return !config.workerSecrets.openrouterApiKeyConfigured;
    return true;
  });

  if (!config.llmAgentsEnabled) {
    if (agentPolicy.redTeamMode === "llm") {
      return {
        status: "degraded",
        detail: "red_team_mode policy requires LLM agents but BOUNDARY_ENABLE_LLM_AGENTS is disabled",
        enabled: false,
        redTeamMode: agentPolicy.redTeamMode,
        policyProviders,
        requiredProviders,
        missingSecrets
      };
    }

    return {
      status: "skipped",
      detail: "LLM agents are disabled; deterministic fallback is active",
      enabled: false,
      redTeamMode: agentPolicy.redTeamMode,
      policyProviders,
      requiredProviders,
      missingSecrets
    };
  }

  if (missingPolicyKeys.length > 0 || missingSecrets.length > 0) {
    return {
      status: "degraded",
      detail: "LLM agents are enabled but provider policy or worker secrets are incomplete",
      enabled: true,
      redTeamMode: agentPolicy.redTeamMode,
      policyProviders,
      missingPolicyKeys,
      requiredProviders,
      missingSecrets
    };
  }

  return {
    status: "ok",
    detail: "LLM agents are enabled and required provider secrets are configured",
    enabled: true,
    redTeamMode: agentPolicy.redTeamMode,
    policyProviders,
    requiredProviders,
    missingSecrets: []
  };
}

type AgentProviderPolicy = {
  providers: Record<string, string>;
  redTeamMode?: string;
};

function readAgentProviderPolicy(db: Database.Database): AgentProviderPolicy {
  const rows = db.prepare(`
    SELECT key, value_json
    FROM policy_values
    WHERE key IN (
      'agent_provider_orchestrator',
      'agent_provider_red_team',
      'agent_provider_judge',
      'agent_provider_documentation',
      'red_team_mode'
    )
  `).all() as Array<{ key: string; value_json: string }>;

  const providers: Record<string, string> = {};
  let redTeamMode: string | undefined;
  for (const row of rows) {
    try {
      const value = JSON.parse(row.value_json);
      if (row.key === "red_team_mode") {
        if (typeof value === "string") redTeamMode = value;
        continue;
      }

      const role = row.key.replace("agent_provider_", "");
      providers[role] = "openrouter";
    } catch {
      continue;
    }
  }
  return { providers, redTeamMode };
}

async function checkSqliteIntegrity(sqlitePath: string): Promise<ReadinessCheck> {
  if (!fs.existsSync(sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    const result = db.prepare("PRAGMA integrity_check").pluck().get();
    db.close();

    if (result === "ok") {
      return {
        status: "ok",
        detail: sqlitePath
      };
    }

    return {
      status: "degraded",
      detail: `integrity_check returned ${String(result)}`
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not run sqlite integrity_check"
    };
  }
}

async function checkPolicyBootstrap(sqlitePath: string): Promise<ReadinessCheck> {
  if (!fs.existsSync(sqlitePath)) {
    return {
      status: "skipped",
      detail: "database has not been initialized yet"
    };
  }

  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    const schemaReady = db.prepare(`
      SELECT value_json
      FROM policy_values
      WHERE key = 'schema_ready'
    `).pluck().get();
    const requiredKeys = Object.keys(policySchema.systemReservedRows);
    const presentRows = db.prepare(`
        SELECT key
        FROM policy_values
        WHERE key IN (${requiredKeys.map(() => "?").join(",")})
      `).all(...requiredKeys) as Array<{ key: string }>;
    const presentKeys = new Set(presentRows.map((row) => row.key));
    db.close();

    const missingKeys = requiredKeys.filter((key) => !presentKeys.has(key));
    if (schemaReady !== "true" || missingKeys.length > 0) {
      return {
        status: "degraded",
        detail: "policy_values bootstrap is incomplete",
        schemaReady: schemaReady === "true",
        missingKeys
      };
    }

    return {
      status: "ok",
      detail: "policy_values bootstrap is ready",
      schemaReady: true,
      systemReservedRows: requiredKeys.length
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : "could not inspect policy_values bootstrap"
    };
  }
}
