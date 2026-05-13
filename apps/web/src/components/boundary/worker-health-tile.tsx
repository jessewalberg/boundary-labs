"use client";

import { useEffect, useState } from "react";
import { Activity, Clock3 } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import type { WorkerHealthSnapshot } from "@/server/worker-health/repository";

type WorkerHealthTileProps = {
  snapshot: WorkerHealthSnapshot;
};

type ReadyzState = {
  status: string;
  detail: string;
};

export function WorkerHealthTile({ snapshot }: WorkerHealthTileProps) {
  const [readyz, setReadyz] = useState<ReadyzState>({
    status: "checking",
    detail: "polling /readyz"
  });

  useEffect(() => {
    let cancelled = false;

    async function pollReadyz() {
      try {
        const response = await fetch("/readyz", { cache: "no-store" });
        const body = await response.json();
        if (!cancelled) {
          setReadyz({
            status: String(body.status ?? "unknown"),
            detail: String(body.checks?.workerHeartbeat?.detail ?? "worker readiness checked")
          });
        }
      } catch (error) {
        if (!cancelled) {
          setReadyz({
            status: "unreachable",
            detail: error instanceof Error ? error.message : "could not poll /readyz"
          });
        }
      }
    }

    pollReadyz();
    const timer = window.setInterval(pollReadyz, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Panel watermark="// worker · queue health" right={<Chip tone={toneFor(snapshot.status)}>{snapshot.status}</Chip>}>
      <Activity size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
      <div className="grid gap-3">
        <div>
          <div className="font-mono text-sm uppercase tracking-[0.12em] text-bl-bone">
            {snapshot.workerId ?? "worker offline"}
          </div>
          <p className="mt-2 text-sm leading-6 text-bl-bone-2">{snapshot.detail}</p>
        </div>
        <div className="grid gap-2 font-mono text-[11px] text-bl-bone-3">
          <Row label="last_seen" value={snapshot.lastSeenAt ?? "--"} />
          <Row label="age" value={snapshot.ageSeconds == null ? "--" : `${snapshot.ageSeconds}s`} />
          <Row label="queued" value={String(snapshot.queuedJobs)} />
          <Row label="claimed" value={`${snapshot.claimedJobs} (${snapshot.staleClaimedJobs} stale)`} />
          <Row label="readyz" value={`${readyz.status} · ${readyz.detail}`} />
        </div>
        {snapshot.recentBackpressureEvents.length > 0 ? (
          <div className="border-t border-bl-line pt-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
              <Clock3 size={12} aria-hidden="true" /> recent pressure
            </div>
            <div className="grid gap-1.5">
              {snapshot.recentBackpressureEvents.map((event) => (
                <div key={`${event.action}-${event.occurredAt}`} className="grid grid-cols-[1fr_auto] gap-3 font-mono text-[10px] text-bl-bone-3">
                  <span className="truncate text-bl-bone-2">{event.action}</span>
                  <span>{event.targetId ?? "--"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3">
      <span className="text-bl-bone-4">{label}</span>
      <span className="break-all text-bl-bone-2">{value}</span>
    </div>
  );
}

function toneFor(status: WorkerHealthSnapshot["status"]) {
  if (status === "ok") return "signal";
  if (status === "stale") return "amber";
  return "muted";
}
