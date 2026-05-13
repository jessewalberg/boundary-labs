import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { getOperatorByAuthUserId } from "@/server/operators/repository";

export async function getCurrentOperator() {
  const session = await requireSession();
  const operator = getOperatorByAuthUserId(session.user.id);

  if (!operator || operator.status !== "active") {
    redirect("/login?error=operator_revoked");
  }

  return operator;
}
