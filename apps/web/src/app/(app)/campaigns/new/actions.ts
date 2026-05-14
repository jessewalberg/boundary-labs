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
  const openemrPatientPid = Number(formData.get("openemrPatientPid") ?? 0);

  const campaign = await createQueuedCampaign({
    targetUrl,
    categories,
    budgetCents,
    requestedBy: currentOperator.id,
    acquireSmartSession: formData.get("acquireSmartSession") === "on",
    openemrUrl: String(formData.get("openemrUrl") ?? ""),
    openemrUsername: String(formData.get("openemrUsername") ?? ""),
    openemrPassword: String(formData.get("openemrPassword") ?? ""),
    openemrPatientPid: Number.isFinite(openemrPatientPid) && openemrPatientPid > 0 ? openemrPatientPid : undefined
  });

  redirect(`/campaigns/${campaign.id}`);
}
