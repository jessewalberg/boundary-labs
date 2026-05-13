import { cn } from "@/lib/utils";

export function EvidencePane({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough", className)}>
      <div className="border-b border-bl-line px-3 py-2">
        <span className="bl-watermark">{label}</span>
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-bl-bone-2">
        {value}
      </pre>
    </div>
  );
}
