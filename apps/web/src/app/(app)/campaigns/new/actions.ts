"use server";

import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { createQueuedCampaign } from "@/server/campaigns/repository";
import { can } from "@/server/policies";

export async function queueCampaign(formData: FormData) {
  const currentOperator = await getCurrentOperator();

  if (!can(currentOperator.role, "campaign:create")) {
    throw new Error("Current operator is not allowed to create campaigns.");
  }

  const targetUrl = String(formData.get("targetUrl") ?? "");
  const categories = formData.getAll("categories").map(String);
  const budgetCents = Number(formData.get("budgetCents") ?? 500);

  const campaign = await createQueuedCampaign({
    targetUrl,
    categories,
    budgetCents,
    requestedBy: currentOperator.id
  });

  redirect(`/campaigns/${campaign.id}`);
}
