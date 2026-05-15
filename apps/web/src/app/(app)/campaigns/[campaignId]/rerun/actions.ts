"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { relaunchCampaign } from "@/server/campaigns/repository";
import { can } from "@/server/policies";

export async function rerunCampaignAction(campaignId: string) {
  const currentOperator = await getCurrentOperator();
  if (!can(currentOperator.role, "campaign:create")) {
    throw new Error("Current operator is not allowed to create campaigns.");
  }

  const campaign = await relaunchCampaign(campaignId, currentOperator.id);
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaign.id}`);
}
