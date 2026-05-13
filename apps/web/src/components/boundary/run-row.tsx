import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/components/boundary/verdict-pill";

type RunRowProps = {
  verdict: Verdict;
  title: ReactNode;
  meta: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function RunRow({ verdict, title, meta, right, className }: RunRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3px_1fr_auto] items-center gap-4 border-b border-bl-line bg-transparent px-3.5 py-3 text-left transition-colors hover:bg-bl-panel-2",
        className
      )}
    >
      <span className={cn("h-6 w-[3px]", railColor(verdict))} />
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-bl-bone">{title}</div>
        <div className="mt-1 truncate font-mono text-[11px] tracking-normal text-bl-bone-3">{meta}</div>
      </div>
      {right}
    </div>
  );
}

function railColor(verdict: Verdict) {
  switch (verdict) {
    case "pass":
      return "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";
    case "fail":
      return "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]";
    case "partial":
      return "bg-bl-amber";
    default:
      return "bg-bl-line-2";
  }
}
