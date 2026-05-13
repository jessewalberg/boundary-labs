import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  watermark?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
};

export function Panel({
  watermark,
  right,
  children,
  className,
  bodyClassName,
  padded = true
}: PanelProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel",
        className
      )}
    >
      {(watermark || right) && (
        <header className="flex items-center justify-between gap-4 border-b border-bl-line bg-bl-trough px-3 py-2">
          {watermark ? <span className="bl-watermark">{watermark}</span> : <span />}
          {right}
        </header>
      )}
      <div className={cn(padded && "px-[18px] py-4", bodyClassName)}>{children}</div>
    </section>
  );
}
