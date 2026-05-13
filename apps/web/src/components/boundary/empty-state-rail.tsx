import type { ReactNode } from "react";

export function EmptyStateRail({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-bl-line bg-bl-trough px-4 py-6 text-sm text-bl-bone-3">
      {children}
    </div>
  );
}
