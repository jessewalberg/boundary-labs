import type { TargetHealth } from "@/server/campaigns/types";
import { getBoundaryConfig } from "@/server/config";

export function listTargetHealth(): TargetHealth[] {
  const config = getBoundaryConfig();
  return config.targetAllowlist.map((target) => ({
    name: target.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    state: "deferred",
    ms: null,
    note: "not checked yet"
  }));
}
