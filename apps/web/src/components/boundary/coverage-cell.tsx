import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cellVariants = cva(
  "grid aspect-square w-full place-items-center border font-mono text-[10px]",
  {
    variants: {
      level: {
        n0: "border-bl-line bg-bl-trough text-bl-bone-4",
        n1: "border-[rgba(200,255,0,0.18)] bg-[rgba(200,255,0,0.06)] text-bl-signal",
        n2: "border-[rgba(200,255,0,0.32)] bg-[rgba(200,255,0,0.16)] text-bl-signal",
        n3: "border-[rgba(200,255,0,0.5)] bg-[rgba(200,255,0,0.32)] text-[#1a1f0a]",
        fail: "border-[rgba(255,45,45,0.5)] bg-[rgba(255,45,45,0.18)] text-[#ffb0ad]",
        def: "border-bl-line bg-[repeating-linear-gradient(135deg,var(--bl-trough),var(--bl-trough)_4px,var(--bl-panel)_4px,var(--bl-panel)_8px)] text-bl-bone-4"
      }
    },
    defaultVariants: {
      level: "n0"
    }
  }
);

export function CoverageCell({
  level,
  children,
  className
}: VariantProps<typeof cellVariants> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return <span className={cn(cellVariants({ level, className }))}>{children}</span>;
}
