import type { CampaignRecord } from "@/server/campaigns/types";

export function createDraftCampaign(input: Omit<CampaignRecord, "id" | "status">) {
  return {
    ...input,
    id: `draft-${Date.now()}`,
    status: "draft" as const
  };
}
