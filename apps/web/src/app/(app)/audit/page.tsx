import type { ReactNode } from "react";
import Link from "next/link";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import {
  listUnifiedAuditTimeline,
  type AuditTimelineRow,
  type AuditTimelineSource
} from "@/server/audit/unified";

type AuditPageProps = {
  searchParams?: Promise<{ source?: string }>;
};

const SOURCE_OPTIONS: Array<{ key: "all" | AuditTimelineSource; label: string; description: string }> = [
  { key: "all", label: "All", description: "Every recorded event across system, agent, and tool layers." },
  { key: "system", label: "System", description: "audit_events: operator + policy + ingest decisions" },
  { key: "agent", label: "Agent", description: "agent_timeline_events: orchestrator, red_team, judge, documentation handoffs" },
  { key: "tool", label: "Tool", description: "tool_started + tool_completed events parsed from the target's response" }
];

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const selected = sourceFilter(params?.source);
  const events = listUnifiedAuditTimeline({
    limit: 300,
    sources: selected === "all" ? ["system", "agent", "tool"] : [selected]
  });
  const counts = countBySource(listUnifiedAuditTimeline({ limit: 600 }));

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// trust · immutable ledger</div>
          <h1 className="bl-h1 mt-2 uppercase">Audit</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Unified append-only feed across three sources: <code>audit_events</code> (system
            decisions), <code>agent_timeline_events</code> (per-step agent handoffs), and
            tool-invocation events parsed from recent attempt artifacts. The audit_events table
            is protected server-side by a trigger that rejects updates; agent + tool rows are
            append-only by construction (write-only repositories, no UPDATE paths).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{events.length} shown</Chip>
          <Chip tone="cyan">system · {counts.system}</Chip>
          <Chip tone="signal">agent · {counts.agent}</Chip>
          <Chip tone="amber">tool · {counts.tool}</Chip>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="bl-watermark text-bl-bone-3">// source</span>
        {SOURCE_OPTIONS.map((option) => (
          <Button
            key={option.key}
            asChild
            variant={selected === option.key ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href={option.key === "all" ? "/audit" : `/audit?source=${option.key}`}>{option.label}</Link>
          </Button>
        ))}
        <span className="ml-1 max-w-[480px] truncate text-[10.5px] text-bl-bone-4">
          {SOURCE_OPTIONS.find((option) => option.key === selected)?.description}
        </span>
      </div>

      <Panel watermark="// unified timeline · most recent 300" padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed border-collapse font-mono text-[11px]">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[88px]" />
            <col className="w-[170px]" />
            <col className="w-[230px]" />
            <col className="w-[210px]" />
            <col />
            <col className="w-[110px]" />
          </colgroup>
          <thead className="bg-bl-trough text-left uppercase tracking-[0.16em] text-bl-bone-4">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-bl-bone-3">
                  No events recorded for this filter yet.
                </td>
              </tr>
            ) : (
              events.map((event) => <AuditRow key={event.id} event={event} />)
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function AuditRow({ event }: { event: AuditTimelineRow }) {
  const targetLabel = `${event.targetType}${event.targetId ? `/${event.targetId}` : ""}`;
  const outcomeTone = outcomeChipTone(event.outcome);
  const sourceTone =
    event.source === "system" ? "cyan" : event.source === "agent" ? "signal" : "amber";

  const cellLink = (content: ReactNode, label = `Open ${targetLabel}`) =>
    event.href ? (
      <Link href={event.href} className="block w-full px-3 py-2" aria-label={label}>
        {content}
      </Link>
    ) : (
      <span className="block w-full px-3 py-2">{content}</span>
    );

  return (
    <tr
      className={`border-t border-bl-line text-bl-bone-2 transition-colors hover:bg-bl-panel-2 ${
        event.href ? "cursor-pointer" : ""
      }`}
    >
      <td className="p-0">{cellLink(event.occurredAt)}</td>
      <td className="p-0">{cellLink(<Chip tone={sourceTone}>{event.source}</Chip>)}</td>
      <td className="truncate p-0">
        {cellLink(
          <span className="truncate">
            {event.actorId ? `${event.actorType}/${event.actorId}` : event.actorType}
          </span>
        )}
      </td>
      <td className="truncate p-0 text-bl-bone">
        {cellLink(<span className="truncate">{event.action}</span>)}
      </td>
      <td className="truncate p-0">
        {cellLink(<span className="truncate">{targetLabel}</span>)}
      </td>
      <td className="truncate p-0 text-bl-bone-3">
        {cellLink(<span className="truncate">{event.detail}</span>)}
      </td>
      <td className="p-0">{cellLink(<Chip tone={outcomeTone}>{event.outcome}</Chip>)}</td>
    </tr>
  );
}

function outcomeChipTone(outcome: string): "signal" | "alarm" | "amber" | "muted" {
  if (["ok", "executed", "completed", "started", "approved", "pass"].includes(outcome)) return "signal";
  if (["failed", "error", "denied", "refused", "fail"].includes(outcome)) return "alarm";
  if (["partial", "invalid", "warning", "degraded", "ignored", "missing_secret"].includes(outcome)) return "amber";
  return "muted";
}

function sourceFilter(value: string | undefined): "all" | AuditTimelineSource {
  if (value === "system" || value === "agent" || value === "tool") return value;
  return "all";
}

function countBySource(rows: AuditTimelineRow[]): { system: number; agent: number; tool: number } {
  return rows.reduce(
    (acc, row) => {
      acc[row.source] += 1;
      return acc;
    },
    { system: 0, agent: 0, tool: 0 }
  );
}
