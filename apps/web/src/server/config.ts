import path from "node:path";

export type BoundaryConfig = {
  sqlitePath: string;
  artifactDir: string;
  targetUrl: string;
  targetAllowlist: string[];
  evalRunnerPath: string;
  dataMode: "synthetic";
};

export function getBoundaryConfig(): BoundaryConfig {
  return {
    sqlitePath: process.env.SQLITE_PATH ?? path.join(process.cwd(), "var", "boundary.db"),
    artifactDir:
      process.env.BOUNDARY_ARTIFACT_DIR ?? path.join(process.cwd(), "var", "artifacts"),
    targetUrl:
      process.env.BOUNDARY_TARGET_URL ?? "https://clinical-copilot.up.railway.app",
    targetAllowlist: parseList(
      process.env.BOUNDARY_TARGET_ALLOWLIST ?? "https://clinical-copilot.up.railway.app"
    ),
    evalRunnerPath: process.env.BOUNDARY_EVAL_RUNNER ?? path.join("scripts", "run_mvp_evals.py"),
    dataMode: "synthetic"
  };
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
