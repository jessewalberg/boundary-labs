import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { listAuditEvents } from "@/server/audit/repository";

export default function AuditPage() {
  const events = listAuditEvents(100);
  const actions = Array.from(new Set(events.map((event) => event.action))).slice(0, 8);

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// trust · immutable ledger</div>
          <h1 className="bl-h1 mt-2 uppercase">Audit</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Append-only system events from auth, policy, ingest, campaign launch, worker recovery,
            and operator actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{events.length} events</Chip>
          {actions.map((action) => <Chip key={action}>{action}</Chip>)}
        </div>
      </section>

      <Panel watermark="// audit_events · latest 100" padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse font-mono text-[11px]">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[190px]" />
            <col className="w-[120px]" />
            <col className="w-[160px]" />
            <col />
            <col className="w-[110px]" />
          </colgroup>
          <thead className="bg-bl-trough text-left uppercase tracking-[0.16em] text-bl-bone-4">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Rule / hash</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-bl-line text-bl-bone-2">
                <td className="px-3 py-2">{event.occurred_at}</td>
                <td className="truncate px-3 py-2 text-bl-bone">{event.action}</td>
                <td className="truncate px-3 py-2">{event.actor_id ?? event.actor_type}</td>
                <td className="truncate px-3 py-2">{event.target_type}/{event.target_id ?? "-"}</td>
                <td className="truncate px-3 py-2">{event.rule_ref ?? "-"} · {event.policy_snapshot_hash?.slice(0, 12) ?? "no-snapshot"}</td>
                <td className="px-3 py-2"><Chip tone={event.outcome === "ok" ? "signal" : event.outcome === "denied" ? "alarm" : "amber"}>{event.outcome}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 ? (
          <div className="px-4 py-8 text-sm text-bl-bone-3">No audit events have been written yet.</div>
        ) : null}
      </Panel>
    </div>
  );
}
