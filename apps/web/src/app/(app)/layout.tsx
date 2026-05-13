import type { ReactNode } from "react";
import { AppShell } from "@/components/boundary/app-shell";
import { getCurrentOperator } from "@/server/auth/current-operator";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  await getCurrentOperator();
  return <AppShell>{children}</AppShell>;
}
