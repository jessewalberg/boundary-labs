"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmModal({
  label,
  confirmLabel,
  children,
  action
}: {
  label: string;
  confirmLabel: string;
  children?: ReactNode;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <span className="relative inline-flex">
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <span className="absolute right-0 top-9 z-20 w-80 border border-bl-line bg-bl-panel p-3 shadow-xl">
          <form
            action={(formData) => {
              startTransition(() => action(formData));
            }}
            className="grid gap-3"
          >
            {children}
            <span className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Cancelling..." : confirmLabel}
              </Button>
            </span>
          </form>
        </span>
      ) : null}
    </span>
  );
}
