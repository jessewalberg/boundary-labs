import type { TargetHealth } from "@/server/campaigns/types";
import { getBoundaryConfig } from "@/server/config";

export function listTargetHealth(): TargetHealth[] {
  const config = getBoundaryConfig();
  return [{
    name: config.targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    state: "deferred",
    ms: null,
    note: "not checked yet"
  }];
}
