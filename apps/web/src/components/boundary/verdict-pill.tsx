import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const verdictVariants = cva(
  "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-bl)] border px-2 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.18em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:shadow-[0_0_6px_currentColor]",
  {
    variants: {
      verdict: {
        pass: "border-current bg-[var(--bl-signal-wash)] text-bl-signal",
        fail: "border-current bg-[var(--bl-alarm-wash)] text-bl-alarm",
        partial: "border-current bg-[var(--bl-amber-wash)] text-bl-amber",
        invalid: "border-current bg-bl-panel text-bl-bone-3",
        info: "border-current bg-[var(--bl-cyan-wash)] text-bl-cyan"
      }
    },
    defaultVariants: {
      verdict: "info"
    }
  }
);

export type Verdict = NonNullable<VariantProps<typeof verdictVariants>["verdict"]>;

export function VerdictPill({
  verdict,
  className
}: VariantProps<typeof verdictVariants> & { className?: string }) {
  return <span className={cn(verdictVariants({ verdict, className }))}>{verdict}</span>;
}
