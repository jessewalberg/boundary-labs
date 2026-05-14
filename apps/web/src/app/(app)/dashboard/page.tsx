import Link from "next/link";
import { ArrowRight, Download, Filter, Play, ShieldCheck } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { RunRow } from "@/components/boundary/run-row";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import type { BoundaryRun, FeedEvent, SparkBucket } from "@/server/campaigns/types";
import { listAgentStatuses } from "@/server/agents/repository";
import { listThreatCoverage } from "@/server/coverage/query";
import { getBoundaryConfig } from "@/server/config";
import { listFeedEvents } from "@/server/events/repository";
import { listFindings } from "@/server/findings/repository";
import { listSparkBuckets } from "@/server/metrics/repository";
import { listRuns } from "@/server/runs/repository";
import { listTargetHealth } from "@/server/targets/repository";

const startedFormatter = new Intl.DateTimeFormat("en", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

export default async function DashboardPage() {
  const config = getBoundaryConfig();
  const boundaryRuns = await listRuns();
  const agents = listAgentStatuses();
  const feedEvents = listFeedEvents();
  const findings = listFindings();
  const sparkBuckets = listSparkBuckets();
  const targetHealth = listTargetHealth();
  const threatCoverage = listThreatCoverage();
  const latestRuns = boundaryRuns.slice(0, 6);
  const totalSeeds = boundaryRuns.reduce((sum, run) => sum + run.seedCount, 0);
  const passed = boundaryRuns.reduce((sum, run) => sum + run.summary.pass, 0);
  const failed = boundaryRuns.reduce((sum, run) => sum + run.summary.fail, 0);
  const partial = boundaryRuns.reduce((sum, run) => sum + run.summary.partial, 0);
  const passRate = Math.round((passed / Math.max(totalSeeds, 1)) * 100);
  const openFindings = findings.filter((finding) => finding.status === "open").length;
  const liveAgents = agents.filter((agent) => agent.status === "live").length;

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end xl:gap-8">
        <div>
          <div className="bl-eyebrow">// workspace · operator dashboard</div>
          <h1 className="bl-h1 mt-2 text-[32px] uppercase">Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-bl-bone-2">
            <span className="bl-watermark">Operator</span>
            <code>boundary.ops</code>
            <span className="text-bl-bone-4">·</span>
            <span className="bl-watermark">Window</span>
            <code>last 24h</code>
            <span className="text-bl-bone-4">·</span>
            <span className="bl-watermark">Scheduler</span>
            <Chip tone="signal">on · every 3h</Chip>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Download size={12} aria-hidden="true" /> Export 24h
          </Button>
          <Button variant="secondary">
            <Filter size={12} aria-hidden="true" /> Filter
          </Button>
          <Button>
            <Play size={12} aria-hidden="true" /> Run now
          </Button>
        </div>
      </section>

      <section className="mb-4 grid overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel xl:grid-cols-[repeat(5,1fr)_1.6fr]">
        <KpiCell label="Runs · 24h" value={boundaryRuns.length} sub="/ 0 sched" foot="queue a campaign to start" />
        <KpiCell label="Seeds probed" value={totalSeeds} sub="across 24h" foot={`${boundaryRuns.length} runs · 7d`} />
        <KpiCell label="Pass rate" value={`${passRate}%`} tone="signal" glow foot={`${passed} pass · ${failed} fail · ${partial} part`} />
        <KpiCell label="Open findings" value={openFindings} tone={openFindings > 0 ? "alarm" : "signal"} glow foot="from judge verdicts" />
        <KpiCell label="Agents live" value={`${liveAgents}/${agents.length}`} tone="signal" foot="red · judge · ops" />
        <div className="min-h-24 px-[18px] py-4">
          <div className="mb-2 flex justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-bl-bone-3">
              Pass rate · 24h
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-bl-bone-4">
              00 {"->"} 24 UTC
            </span>
          </div>
          <Sparkline buckets={sparkBuckets} />
        </div>
      </section>

      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        <Panel
          watermark="// live · harness telemetry"
          right={<Chip tone="signal">streaming</Chip>}
          padded={false}
          className="overflow-x-auto"
        >
          {feedEvents.length > 0 ? (
            feedEvents.map((event) => (
              <TelemetryRow key={`${event.time}-${event.agent}-${event.message}`} event={event} />
            ))
          ) : (
            <EmptyPanelMessage message="No telemetry yet. Launch a campaign to populate the event stream." />
          )}
        </Panel>

        <Panel watermark="// agents · active" right={<Chip tone="signal">{liveAgents} live</Chip>} padded={false} className="overflow-x-auto">
          {agents.length > 0 ? (
            agents.map((agent) => (
              <div
                key={agent.name}
                className="flex min-w-[520px] items-center gap-3 border-b border-bl-line px-3.5 py-3 last:border-b-0"
              >
                <span className={`h-10 w-[3px] ${agentTone(agent.tone, agent.status === "live")}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-bl-bone">{agent.name}</span>
                    <span className="border border-bl-line-2 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-bl-bone-4">
                      {agent.role}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10.5px] text-bl-bone-3">{agent.task}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-bl-bone-4">Seeds</div>
                    <div className="text-sm text-bl-bone">{agent.seeds ?? "—"}</div>
                  </div>
                  <Chip tone={agent.status === "live" ? "signal" : "muted"}>{agent.status}</Chip>
                </div>
              </div>
            ))
          ) : (
            <EmptyPanelMessage message="No worker agents have reported status yet." />
          )}
        </Panel>
      </section>

      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        <Panel
          watermark="// recent runs · 7d"
          right={
            <Button asChild variant="secondary">
              <Link href="/campaigns">
                Open runs <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </Button>
          }
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse font-mono text-[11px]">
              <thead className="bg-bl-trough text-left uppercase tracking-[0.16em] text-bl-bone-4">
                <tr>
                  <th className="w-1" />
                  <th className="px-3 py-2">P/F/Pa</th>
                  <th className="px-3 py-2">Run_id</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Started</th>
                  <th className="px-3 py-2 text-right">Wall</th>
                </tr>
              </thead>
              <tbody>
                {latestRuns.length > 0 ? (
                  latestRuns.map((run) => <RecentRunRow key={run.id} run={run} />)
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-bl-bone-3">
                      No runs have completed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel watermark="// findings · open" right={<Chip tone={openFindings > 0 ? "alarm" : "muted"}>{openFindings} open</Chip>} padded={false}>
          {findings.length > 0 ? (
            findings.map((finding) => (
              <div key={finding.id} className="border-b border-bl-line px-4 py-3 last:border-b-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-bl-bone">{finding.id}</span>
                  <SeverityBadge severity={finding.severity} />
                  <Chip tone={finding.status === "open" ? "alarm" : finding.status === "fixed" ? "signal" : "muted"} className="ml-auto">
                    {finding.status}
                  </Chip>
                </div>
                <div className="text-sm text-bl-bone">{finding.title}</div>
                <div className="mt-1 font-mono text-[10px] text-bl-bone-3">seed/{finding.seed}</div>
                <p className="mt-2 text-xs text-bl-bone-2">{finding.note}</p>
              </div>
            ))
          ) : (
            <EmptyPanelMessage message="No findings yet. Failed or partial judge verdicts will appear here." />
          )}
        </Panel>
      </section>

      <Panel
        watermark="// threat-model coverage · THREAT_MODEL.md"
        right={<span className="bl-watermark text-bl-bone-4">{threatCoverage.length} sections</span>}
        padded={false}
        className="mb-4"
      >
        <div className="grid md:grid-cols-5">
          {threatCoverage.length > 0 ? threatCoverage.map((coverage) => {
            const pct = coverage.passRate == null ? 0 : Math.round(coverage.passRate * 100);
            const color =
              coverage.status === "deferred"
                ? "bg-bl-bone-4"
                : pct === 100
                  ? "bg-bl-signal shadow-[0_0_8px_var(--bl-signal)]"
                  : pct >= 75
                    ? "bg-bl-amber"
                    : "bg-bl-alarm shadow-[0_0_8px_var(--bl-alarm)]";
            return (
              <div key={coverage.section} className="border-r border-bl-line px-4 py-3 last:border-r-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bl-bone-3">
                    {coverage.section}
                  </span>
                  <Chip tone={coverage.status === "covered" ? "signal" : coverage.status === "deferred" ? "muted" : "amber"}>
                    {coverage.status}
                  </Chip>
                </div>
                <div className="min-h-8 font-mono text-xs text-bl-bone">{coverage.title}</div>
                <div className="mt-3 h-1.5 bg-bl-trough">
                  <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex gap-1.5 font-mono text-[10px] text-bl-bone-3">
                  <span className="text-bl-bone">{coverage.passRate == null ? "—" : `${pct}%`}</span>
                  <span>·</span>
                  <span>{coverage.seedCount} seeds</span>
                </div>
              </div>
            );
          }) : (
            <div className="px-4 py-8 text-center text-sm text-bl-bone-3 md:col-span-5">
              No coverage has been measured yet.
            </div>
          )}
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        <Panel watermark="// target · clinical-copilot · health" right={<Chip tone="signal">readyz ok</Chip>} padded={false} className="overflow-x-auto">
          {targetHealth.map((check) => (
            <div key={check.name} className="grid min-w-[620px] grid-cols-[10px_180px_1fr_70px_90px] items-center gap-3 border-b border-bl-line px-3.5 py-2.5 last:border-b-0">
              <span className={`h-2 w-2 rounded-full ${healthTone(check.state)}`} />
              <span className="font-mono text-[11.5px] text-bl-bone">{check.name}</span>
              <span className="truncate font-mono text-[10.5px] text-bl-bone-3">{check.note}</span>
              <span className="text-right font-mono text-[11px] text-bl-bone-2">{check.ms == null ? "—" : `${check.ms}ms`}</span>
              <Chip tone={check.state === "ok" ? "signal" : check.state === "warn" ? "amber" : "muted"}>
                {check.state}
              </Chip>
            </div>
          ))}
        </Panel>

        <Panel watermark="// perimeter · attack surface" right={<Chip>3 vectors live</Chip>} padded={false}>
          <div className="grid min-h-[250px] place-items-center bg-bl-trough bg-[url('/brand/grid-dark.svg')] bg-[length:32px_32px] p-4">
            <img src="/brand/perimeter.svg" alt="" className="h-auto w-full max-w-[420px] opacity-90" />
          </div>
          <div className="flex justify-between border-t border-bl-line bg-bl-trough px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-3">
            <span>// authorized only</span>
            <span>{config.targetUrl.replace(/^https?:\/\//, "")}</span>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  foot,
  tone = "bone",
  glow = false
}: {
  label: string;
  value: string | number;
  sub?: string;
  foot?: string;
  tone?: "bone" | "signal" | "alarm" | "amber";
  glow?: boolean;
}) {
  const color =
    tone === "signal" ? "text-bl-signal" : tone === "alarm" ? "text-bl-alarm" : tone === "amber" ? "text-bl-amber" : "text-bl-bone";

  return (
    <div className="flex min-h-24 flex-col gap-1.5 border-r border-bl-line px-[18px] py-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-bl-bone-3">{label}</div>
      <div className={`flex items-baseline gap-2 font-mono text-3xl leading-none tracking-[-0.02em] ${color} ${glow ? "drop-shadow-[0_0_10px_currentColor]" : ""}`}>
        {value}
        {sub ? <span className="text-xs tracking-normal text-bl-bone-3">{sub}</span> : null}
      </div>
      {foot ? <div className="mt-auto font-mono text-[9px] tracking-normal text-bl-bone-4">{foot}</div> : null}
    </div>
  );
}

function Sparkline({ buckets }: { buckets: SparkBucket[] }) {
  const height = 78;
  const width = 480;
  const barWidth = width / buckets.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
      <line x1="0" y1={height - 8} x2={width} y2={height - 8} stroke="var(--bl-line)" strokeWidth="0.5" />
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--bl-line)" strokeDasharray="2 3" strokeWidth="0.5" />
      {buckets.map((bucket, index) => {
        const x = index * barWidth + 2;
        const pass = bucket.pass ?? 0;
        const barHeight = bucket.runs === 0 ? 2 : Math.max(3, pass * (height - 18));
        const color = pass === 1 ? "var(--bl-signal)" : pass >= 0.75 ? "var(--bl-amber)" : "var(--bl-alarm)";
        return (
          <g key={bucket.hour}>
            <rect x={x} y={height - 10 - barHeight} width={barWidth - 4} height={barHeight} fill={bucket.runs === 0 ? "var(--bl-line)" : color} />
            <text x={x + barWidth / 2 - 2} y={height - 1} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--bl-bone-4)">
              {bucket.hour}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TelemetryRow({ event }: { event: FeedEvent }) {
  return (
    <RunRow
      verdict={event.role === "alarm" ? "fail" : event.role === "signal" ? "pass" : "info"}
      title={
        <span className="grid grid-cols-[70px_200px_150px] gap-3">
          <span className="text-bl-bone-4">{event.time}</span>
          <span className={event.role === "alarm" ? "text-bl-alarm" : event.role === "signal" ? "text-bl-signal" : event.role === "cyan" ? "text-bl-cyan" : "text-bl-bone-2"}>
            {event.agent}
          </span>
          <span>{event.message}</span>
        </span>
      }
      meta={event.detail}
      right={<VerdictPill verdict={event.role === "alarm" ? "fail" : event.role === "signal" ? "pass" : "info"} />}
    />
  );
}

function EmptyPanelMessage({ message }: { message: string }) {
  return <div className="px-4 py-8 text-center text-sm text-bl-bone-3">{message}</div>;
}

function RecentRunRow({ run }: { run: BoundaryRun }) {
  const tone = run.summary.invalid > 0 ? "invalid" : run.summary.fail > 0 ? "fail" : run.summary.partial > 0 ? "partial" : "pass";
  const bar =
    tone === "fail"
      ? "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]"
      : tone === "partial"
        ? "bg-bl-amber"
        : tone === "invalid"
          ? "bg-bl-bone-3"
          : "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";

  return (
    <tr className="border-t border-bl-line text-bl-bone-2 transition-colors hover:bg-bl-panel-2">
      <td className="p-0">
        <div className={`h-7 w-[3px] ${bar}`} />
      </td>
      <td className="px-3 py-2 tabular-nums">
        <span className="text-bl-signal">{run.summary.pass}</span>
        <span className="text-bl-bone-4">/</span>
        <span className={run.summary.fail ? "text-bl-alarm" : "text-bl-bone-4"}>{run.summary.fail}</span>
        <span className="text-bl-bone-4">/</span>
        <span className={run.summary.partial ? "text-bl-amber" : "text-bl-bone-4"}>{run.summary.partial}</span>
      </td>
      <td className="truncate px-3 py-2 text-bl-bone">
        <Link href={`/campaigns/${run.id}`} className="hover:text-bl-signal">
          {run.id}
        </Link>
      </td>
      <td className="truncate px-3 py-2">{run.branch}</td>
      <td className="px-3 py-2 text-right text-bl-bone-3">{startedFormatter.format(new Date(run.startedAt))}</td>
      <td className="px-3 py-2 text-right">{run.duration}</td>
    </tr>
  );
}

function agentTone(tone: "alarm" | "cyan" | "signal", live: boolean) {
  const opacity = live ? "" : " opacity-45";
  if (tone === "alarm") return `bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]${opacity}`;
  if (tone === "cyan") return `bg-bl-cyan shadow-[0_0_6px_var(--bl-cyan)]${opacity}`;
  return `bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]${opacity}`;
}

function healthTone(state: "ok" | "warn" | "deferred") {
  if (state === "ok") return "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";
  if (state === "warn") return "bg-bl-amber";
  return "bg-bl-bone-4";
}
