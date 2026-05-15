import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import type { RunCostRecord } from "@/server/costs/repository";

export function CostBreakdown({ costs }: { costs: RunCostRecord[] }) {
  const total = costs.reduce((sum, row) => sum + (row.costMicros ?? 0), 0);
  return (
    <Panel watermark="// cost · provenance" right={<Chip tone="cyan">{formatMicros(total)}</Chip>} padded={false}>
      {costs.length > 0 ? costs.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-bl-line px-4 py-3 last:border-b-0">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-bl-bone">{row.agentRole}</div>
            <div className="mt-1 truncate font-mono text-[10px] text-bl-bone-3">
              {row.provider ?? "provider unknown"} · {row.model ?? "model unknown"}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs text-bl-bone">{formatMicros(row.costMicros ?? 0)}</div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-bl-bone-4">{row.provenance}</div>
          </div>
        </div>
      )) : (
        <div className="px-4 py-5 text-sm text-bl-bone-3">No cost rows recorded.</div>
      )}
    </Panel>
  );
}

function formatMicros(value: number) {
  return `$${(value / 1_000_000).toFixed(4)}`;
}
