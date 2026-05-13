"use server";

import { redirect } from "next/navigation";
import { createQueuedCampaign } from "@/server/campaigns/repository";
import { can } from "@/server/policies";

const currentOperator = {
  id: "boundary.ops",
  role: "operator" as const
};

export async function queueCampaign(formData: FormData) {
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
