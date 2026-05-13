import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-bl)] border px-2 font-mono text-[11px] font-medium leading-none tracking-normal",
  {
    variants: {
      tone: {
        default: "border-bl-line bg-bl-trough text-bl-bone-2",
        signal: "border-[#2f3b14] bg-[var(--bl-signal-wash)] text-[#d8ff6a]",
        alarm: "border-[#4b1818] bg-[var(--bl-alarm-wash)] text-[#ff8480]",
        amber: "border-[#4a360f] bg-[var(--bl-amber-wash)] text-[#ffc55e]",
        cyan: "border-[#143942] bg-[var(--bl-cyan-wash)] text-[#6fe5f3]",
        muted: "border-bl-line-2 bg-transparent text-bl-bone-3"
      }
    },
    defaultVariants: {
      tone: "default"
    }
  }
);

type ChipProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof chipVariants> & {
    dot?: boolean;
  };

export function Chip({ className, tone, dot = true, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone, className }))} {...props}>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotColor(tone))} /> : null}
      {children}
    </span>
  );
}

function dotColor(tone: ChipProps["tone"]) {
  switch (tone) {
    case "signal":
      return "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";
    case "alarm":
      return "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]";
    case "amber":
      return "bg-bl-amber";
    case "cyan":
      return "bg-bl-cyan";
    default:
      return "bg-bl-bone-3";
  }
}
