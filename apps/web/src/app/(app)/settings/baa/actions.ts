"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOperator } from "@/server/auth/current-operator";
import { confirmBaaAcknowledgement } from "@/server/baa/repository";

export async function confirmBaaAction(formData: FormData) {
  const operator = await getCurrentOperator();
  if (operator.role !== "admin") throw new Error("Only admins can confirm the BAA hash.");

  confirmBaaAcknowledgement({
    typedHash: String(formData.get("baaHash") ?? ""),
    actorId: operator.id
  });

  revalidatePath("/settings/baa");
  redirect("/settings/baa");
}
