"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { approveApproval, rejectApproval } from "@/server/approvals/repository";
import { can } from "@/server/policies";

export async function approveApprovalAction(approvalId: string) {
  const operator = await getCurrentOperator();
  if (!can(operator.role, "approval:review")) throw new Error("Current operator cannot review approvals.");
  approveApproval(approvalId, operator.id);
  revalidatePath("/approvals");
  redirect(`/approvals/${approvalId}`);
}

export async function rejectApprovalAction(approvalId: string, formData: FormData) {
  const operator = await getCurrentOperator();
  if (!can(operator.role, "approval:review")) throw new Error("Current operator cannot review approvals.");
  rejectApproval(approvalId, operator.id, String(formData.get("comment") ?? ""));
  revalidatePath("/approvals");
  redirect(`/approvals/${approvalId}`);
}
