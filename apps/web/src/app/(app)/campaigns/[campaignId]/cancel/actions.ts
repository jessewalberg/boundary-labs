"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { cancelCampaign } from "@/server/campaigns/repository";
import { can } from "@/server/policies";

export async function cancelCampaignAction(campaignId: string, formData: FormData) {
  const currentOperator = await getCurrentOperator();
  if (!can(currentOperator.role, "campaign:cancel")) {
    throw new Error("Current operator is not allowed to cancel campaigns.");
  }

  const reason = String(formData.get("reason") ?? "");
  cancelCampaign(campaignId, currentOperator.id, reason);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}
