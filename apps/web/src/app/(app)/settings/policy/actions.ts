"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createApproval } from "@/server/approvals/repository";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { openDatabase } from "@/server/db/client";
import { evaluatePolicyAction } from "@/server/policies";

export async function requestPolicyEditAction(policyKey: string, formData: FormData) {
  const operator = await getCurrentOperator();
  if (operator.role !== "admin") throw new Error("Only admins can request policy edits.");

  const approvalPath = String(formData.get("approvalPath") ?? "");
  const valueJson = String(formData.get("valueJson") ?? "");
  const payload = {
    changes: [{
      operation: "upsert",
      key: policyKey,
      approvalPath,
      value: JSON.parse(valueJson)
    }]
  };

  const db = openDatabase();
  try {
    const decision = evaluatePolicyAction({
      db,
      action: "policy:write",
      actorRole: operator.role,
      actorId: operator.id,
      payload,
      policyWriteProposals: [{ operation: "upsert", key: policyKey, approvalPath }]
    });
    if (decision.outcome === "deny") throw new Error(decision.reason);
  } finally {
    db.close();
  }

  createApproval({
    action: "policy:write",
    requestedBy: operator.id,
    targetType: "policy_values",
    targetId: policyKey,
    payload
  });
  revalidatePath("/settings/policy");
  redirect("/settings/policy");
}
