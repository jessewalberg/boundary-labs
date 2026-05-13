import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { listApprovals } from "@/server/approvals/repository";

export default function ApprovalsPage() {
  const approvals = listApprovals();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const grouped = pending.reduce((groups, approval) => {
    const list = groups.get(approval.action) ?? [];
    list.push(approval);
    groups.set(approval.action, list);
    return groups;
  }, new Map<string, typeof pending>());

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// review · approvals</div>
          <h1 className="bl-h1 mt-2 uppercase">Approvals</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Human-in-the-loop queue for scope expansion, policy edits, report publishing, and
            quarantined judge decisions.
          </p>
        </div>
        <Chip tone={pending.length > 0 ? "amber" : "signal"}>{pending.length} pending</Chip>
      </section>

      <div className="grid gap-4">
        {Array.from(grouped.entries()).map(([action, rows]) => (
          <Panel key={action} watermark={`// ${action}`} right={<Chip>{rows.length} pending</Chip>} padded={false}>
            {rows.map((approval) => (
              <Link
                key={approval.id}
                href={`/approvals/${approval.id}`}
                className="grid gap-3 border-b border-bl-line px-4 py-3 transition-colors hover:bg-bl-panel-2 last:border-b-0 md:grid-cols-[1fr_160px_14px] md:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-bl-bone">{approval.id}</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-bl-bone-4">{approval.targetType}/{approval.targetId ?? "-"}</span>
                </span>
                <Chip tone="amber">{approval.status}</Chip>
                <ArrowRight size={12} className="text-bl-bone-3" aria-hidden="true" />
              </Link>
            ))}
          </Panel>
        ))}
        {pending.length === 0 ? (
          <Panel watermark="// queue">
            <p className="m-0 text-sm text-bl-bone-3">No pending approvals.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
