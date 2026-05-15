import type { RegressionResultStatus } from "@/server/db/schema";
import type { RunArtifactResult } from "@/server/ingest/types";

export type RegressionClassification = {
  status: RegressionResultStatus;
  invalidReason: string | null;
};

export function classifyRegressionResult(
  result: RunArtifactResult,
  requiredEvidence: Array<Record<string, unknown>>
): RegressionClassification {
  const unavailable = result.attempt.turns.find((turn) => {
    const http = turn.http as { status?: number; error?: string | null };
    return Boolean(http.error) || (typeof http.status === "number" && http.status >= 500);
  });
  if (unavailable) return { status: "invalid", invalidReason: "target_unavailable" };

  for (const evidence of requiredEvidence) {
    if (evidence.type === "path") {
      const expectedPath = String(evidence.value ?? "");
      const exercised = result.attempt.turns.some((turn) => turn.endpoint === expectedPath);
      if (!exercised) {
        return {
          status: "invalid",
          invalidReason: `missing_required_evidence:path:${expectedPath}`
        };
      }
    }
  }

  return { status: result.judge_agent.status, invalidReason: result.judge_agent.status === "invalid" ? "judge_invalid" : null };
}
