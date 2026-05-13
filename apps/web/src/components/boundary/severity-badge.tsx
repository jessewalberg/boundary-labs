import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const severityVariants = cva(
  "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-bl)] border px-2 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.14em] before:h-2 before:w-2 before:bg-current",
  {
    variants: {
      severity: {
        critical: "border-[#4b1818] bg-[var(--bl-alarm-wash)] text-[#ff8480]",
        high: "border-[#3a1414] bg-[rgba(255,45,45,0.08)] text-bl-alarm",
        med: "border-[#3f2b0c] bg-[rgba(255,176,32,0.06)] text-bl-amber",
        low: "border-[#133842] bg-[rgba(34,211,238,0.06)] text-bl-cyan",
        info: "border-bl-line-2 bg-transparent text-bl-bone-3"
      }
    },
    defaultVariants: {
      severity: "info"
    }
  }
);

export function SeverityBadge({
  severity,
  className
}: VariantProps<typeof severityVariants> & { className?: string }) {
  return <span className={cn(severityVariants({ severity, className }))}>{severity}</span>;
}
