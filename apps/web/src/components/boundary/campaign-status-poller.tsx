"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CampaignStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lastChecked, setLastChecked] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const checkedAt = new Date();
      setLastChecked(checkedAt);
      startTransition(() => router.refresh());
    }, 3000);
    return () => window.clearInterval(id);
  }, [active, router, startTransition]);

  if (!active) return null;

  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">
      last checked {lastChecked.toLocaleTimeString("en", { hour12: false })}
    </span>
  );
}
