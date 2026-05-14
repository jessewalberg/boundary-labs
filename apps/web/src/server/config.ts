import fs from "node:fs";
import path from "node:path";

export type BoundaryConfig = {
  sqlitePath: string;
  artifactDir: string;
  workerHeartbeatPath: string;
  targetUrl: string;
  evalRunnerPath: string;
  betterAuthUrl?: string;
  betterAuthSecret: string;
  ownerEmail?: string;
  operatorEmailAllowlist: string[];
  baaDocumentHash?: string;
  llmAgentsEnabled: boolean;
  workerSecrets: {
    openrouterApiKeyConfigured: boolean;
  };
  dataMode: "synthetic";
};

export function getBoundaryConfig(): BoundaryConfig {
  const dataRoot = getDefaultDataRoot();

  return {
    sqlitePath: process.env.SQLITE_PATH ?? path.join(dataRoot, "boundary.db"),
    artifactDir:
      process.env.BOUNDARY_ARTIFACT_DIR ?? path.join(dataRoot, "artifacts"),
    workerHeartbeatPath:
      process.env.BOUNDARY_WORKER_HEARTBEAT_PATH ?? path.join(dataRoot, "worker.heartbeat"),
    targetUrl:
      process.env.BOUNDARY_TARGET_URL ?? "https://clinical-copilot.up.railway.app",
    evalRunnerPath: process.env.BOUNDARY_EVAL_RUNNER ?? path.join("scripts", "run_mvp_evals.py"),
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? getDefaultAuthUrl(),
    betterAuthSecret:
      process.env.BETTER_AUTH_SECRET ??
      "boundary-labs-local-development-secret-change-before-production",
    ownerEmail: process.env.BOUNDARY_OWNER_EMAIL?.toLowerCase(),
    operatorEmailAllowlist: parseList(
      process.env.BOUNDARY_OPERATOR_EMAIL_ALLOWLIST ?? process.env.BOUNDARY_OWNER_EMAIL ?? ""
    ).map((email) => email.toLowerCase()),
    baaDocumentHash: process.env.BAA_DOCUMENT_HASH,
    llmAgentsEnabled: process.env.BOUNDARY_ENABLE_LLM_AGENTS === "1",
    workerSecrets: {
      openrouterApiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY)
    },
    dataMode: "synthetic"
  };
}

function getDefaultDataRoot() {
  return fs.existsSync("/data") ? "/data" : path.join(process.cwd(), "var");
}

function getDefaultAuthUrl() {
  if (process.env.NODE_ENV === "production") return undefined;
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
