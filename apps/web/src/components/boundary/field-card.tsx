import { Chip } from "@/components/boundary/chip";
import { ProtectedBadge } from "@/components/boundary/protected-badge";

export function FieldCard({
  label,
  value,
  description,
  approvalPath,
  protectedRow = false
}: {
  label: string;
  value: string;
  description: string;
  approvalPath: string;
  protectedRow?: boolean;
}) {
  return (
    <article className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-bl-bone">{label}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">{approvalPath}</div>
      </div>
      <div className="min-w-0">
        <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap break-words border border-bl-line bg-bl-trough p-2 font-mono text-[11px] leading-5 text-bl-bone-2">
          {value}
        </pre>
        <p className="mt-2 text-xs leading-5 text-bl-bone-3">{description}</p>
      </div>
      {protectedRow ? <ProtectedBadge /> : <Chip tone="cyan">read-only</Chip>}
    </article>
  );
}
