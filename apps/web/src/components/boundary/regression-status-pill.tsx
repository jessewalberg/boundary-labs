import { Chip } from "@/components/boundary/chip";
import type { RegressionResultStatus } from "@/server/db/schema";

export function RegressionStatusPill({ status }: { status: RegressionResultStatus | "reopened" | "active" | "retired" | "unknown" }) {
  const tone =
    status === "pass" || status === "active"
      ? "signal"
      : status === "fail" || status === "reopened"
        ? "alarm"
        : status === "partial"
          ? "amber"
          : "muted";
  return <Chip tone={tone}>{status}</Chip>;
}
