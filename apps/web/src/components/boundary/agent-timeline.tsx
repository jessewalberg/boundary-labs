import { Panel } from "@/components/boundary/panel";
import type { AgentTimelineRecord } from "@/server/agent-timeline/repository";

export function AgentTimeline({ events }: { events: AgentTimelineRecord[] }) {
  return (
    <Panel watermark="// agents · ordered activity" padded={false}>
      {events.length > 0 ? events.map((event) => (
        <div key={event.id} className="grid grid-cols-[44px_1fr] gap-3 border-b border-bl-line px-4 py-3 last:border-b-0">
          <div className="font-mono text-[10px] text-bl-bone-4">#{event.sequence}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-bl-bone">{event.agentRole}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">{event.status}</span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-bl-bone-3">{event.action}</div>
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-bl-bone-4">
              {event.inputRef ? <span>in/{event.inputRef}</span> : null}
              {event.outputRef ? <span>out/{event.outputRef}</span> : null}
              {event.traceRef ? <span>trace linked</span> : null}
            </div>
          </div>
        </div>
      )) : (
        <div className="px-4 py-5 text-sm text-bl-bone-3">No timeline rows recorded.</div>
      )}
    </Panel>
  );
}
