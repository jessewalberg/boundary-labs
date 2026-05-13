import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, Plus } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import type { BoundaryRun } from "@/server/campaigns/fixtures";
import { listRuns } from "@/server/runs/repository";

type CampaignsPageProps = {
  searchParams?: Promise<{ filter?: string }>;
};

const startedFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const params = await searchParams;
  const runs = await listRuns();
  const filter = params?.filter ?? "all";
  const visibleRuns = runs.filter((run) => {
    if (filter === "main") return run.branch === "main";
    if (filter === "fail") return run.summary.fail > 0 || run.summary.partial > 0 || run.summary.invalid > 0;
    if (filter === "pass") return run.summary.fail === 0 && run.summary.partial === 0 && run.summary.invalid === 0;
    return true;
  });

  const completedRuns = runs.filter((run) => !run.status || run.status === "completed");
  const allPass = completedRuns.filter((run) => run.summary.fail === 0 && run.summary.partial === 0 && run.summary.invalid === 0).length;
  const failing = completedRuns.filter((run) => run.summary.fail > 0).length;
  const partial = completedRuns.filter((run) => run.summary.fail === 0 && run.summary.partial > 0).length;
  const invalid = completedRuns.filter((run) => run.summary.invalid > 0).length;
  const latest = runs[0];

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row xl:gap-8">
        <div>
          <div className="bl-eyebrow">// workspace · adversarial evaluation</div>
          <h1 className="bl-h1 mt-2 uppercase">Runs</h1>
          <p className="mt-2 max-w-[720px] text-sm text-bl-bone-2">
            Reproducible probes of the Clinical Co-Pilot over its authorized HTTP and SSE
            surface. Each row represents a sealed artifact under <code>evals/results/</code>.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 xl:items-end">
          <MetaLine label="Latest">
            <Chip tone="signal">{latest.id.replace(/^mvp-/, "mvp-...")}</Chip>
          </MetaLine>
          <MetaLine label="Target">
            <Chip>{latest.target.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Chip>
          </MetaLine>
          <MetaLine label="Health">
            <Chip tone="signal">healthz · readyz ok</Chip>
          </MetaLine>
          <Button asChild variant="secondary" className="mt-1">
            <Link href="/campaigns/new">
              <Plus size={12} aria-hidden="true" /> New campaign
            </Link>
          </Button>
        </div>
      </section>

      <section className="mb-4 grid overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel md:grid-cols-4">
        <Metric label="Total runs · 7d" value={runs.length} />
        <Metric label="All pass" value={allPass} tone="signal" glow />
        <Metric label="Fail / partial" value={`${failing}/${partial}`} tone={failing > 0 ? "alarm" : "amber"} glow={failing > 0} />
        <Metric label="Invalid · deferred" value={invalid} tone="muted" />
      </section>

      <div className="mb-2 flex items-center gap-2">
        <span className="bl-watermark text-bl-bone-3">// filter</span>
        {[
          ["all", "All"],
          ["pass", "Pass"],
          ["fail", "Failures"],
          ["main", "Main"]
        ].map(([key, label]) => (
          <Button key={key} asChild variant={filter === key ? "secondary" : "ghost"} size="sm">
            <Link href={key === "all" ? "/campaigns" : `/campaigns?filter=${key}`}>{label}</Link>
          </Button>
        ))}
        <div className="flex-1" />
        <span className="bl-watermark text-bl-bone-4">
          {visibleRuns.length} / {runs.length} runs · 7d
        </span>
      </div>

      <Panel padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[1060px] table-fixed border-collapse font-mono text-[11px]">
          <colgroup>
            <col className="w-1" />
            <col className="w-[82px]" />
            <col />
            <col className="w-[198px]" />
            <col className="w-[178px]" />
            <col className="w-[190px]" />
            <col className="w-[82px]" />
            <col className="w-[132px]" />
            <col className="w-[72px]" />
          </colgroup>
          <thead className="bg-bl-trough text-left uppercase tracking-[0.16em] text-bl-bone-4">
            <tr>
              <th />
              <th className="px-3 py-2">P/F/Pa</th>
              <th className="px-3 py-2">Run_id</th>
              <th className="px-3 py-2">Coverage</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2 text-right">Started</th>
              <th className="px-3 py-2 text-right">Wall</th>
            </tr>
          </thead>
          <tbody>
            {visibleRuns.map((run) => (
              <RunsTableRow key={run.id} run={run} />
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function MetaLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="bl-watermark text-bl-bone-4">{label}</span>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "bone",
  glow = false
}: {
  label: string;
  value: string | number;
  tone?: "bone" | "signal" | "alarm" | "amber" | "muted";
  glow?: boolean;
}) {
  const color =
    tone === "signal"
      ? "text-bl-signal"
      : tone === "alarm"
        ? "text-bl-alarm"
        : tone === "amber"
          ? "text-bl-amber"
          : tone === "muted"
            ? "text-bl-bone-3"
            : "text-bl-bone";

  return (
    <div className="border-r border-bl-line px-[18px] py-3.5 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-3">{label}</div>
      <div className={`mt-1 font-mono text-3xl leading-none tracking-[-0.02em] ${color} ${glow ? "drop-shadow-[0_0_10px_currentColor]" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function RunsTableRow({ run }: { run: BoundaryRun }) {
  const pending = run.status === "queued" || run.status === "running" || run.status === "draft";
  const tone = pending ? "pending" : run.summary.invalid > 0 ? "invalid" : run.summary.fail > 0 ? "fail" : run.summary.partial > 0 ? "partial" : "pass";
  const bar =
    tone === "fail"
      ? "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]"
      : tone === "partial"
        ? "bg-bl-amber"
        : tone === "pending"
          ? "bg-bl-cyan shadow-[0_0_6px_var(--bl-cyan)]"
        : tone === "invalid"
          ? "bg-bl-bone-3"
          : "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";

  return (
    <tr className="border-t border-bl-line text-bl-bone-2 transition-colors hover:bg-bl-panel-2">
      <td className="p-0">
        <div className={`h-8 w-[3px] ${bar}`} />
      </td>
      <td className="px-3 py-2 tabular-nums">
        {pending ? (
          <span className="text-bl-cyan">{run.status}</span>
        ) : (
          <>
            <span className="text-bl-signal">{run.summary.pass}</span>
            <span className="text-bl-bone-4">/</span>
            <span className={run.summary.fail ? "text-bl-alarm" : "text-bl-bone-4"}>{run.summary.fail}</span>
            <span className="text-bl-bone-4">/</span>
            <span className={run.summary.partial ? "text-bl-amber" : "text-bl-bone-4"}>{run.summary.partial}</span>
          </>
        )}
      </td>
      <td className="truncate px-3 py-2 text-bl-bone">
        <Link href={`/campaigns/${run.id}`} className="hover:text-bl-signal">
          {run.id}
        </Link>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {run.coverage.map((coverage) => (
            <span key={coverage} className="border border-bl-line bg-bl-trough px-1.5 py-px text-[10px] text-bl-bone-2">
              {coverage}
            </span>
          ))}
        </div>
      </td>
      <td className="truncate px-3 py-2">{run.target.replace(/^https?:\/\//, "")}</td>
      <td className="truncate px-3 py-2">
        {run.branch}
        <span className="px-1.5 text-bl-bone-4">·</span>
        <span className="text-bl-bone-3">{run.commit}</span>
      </td>
      <td className="px-3 py-2">
        <span className={`border border-bl-line-2 px-1.5 py-px uppercase tracking-[0.14em] ${run.trigger === "scheduler" ? "text-bl-signal" : pending ? "text-bl-cyan" : "text-bl-bone-3"}`}>
          {pending ? run.status : run.trigger}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-bl-bone-3">{startedFormatter.format(new Date(run.startedAt))}</td>
      <td className="px-3 py-2 text-right text-bl-bone-2">
        <span className="inline-flex items-center gap-1">
          <Activity size={10} aria-hidden="true" /> {run.duration}
        </span>
      </td>
    </tr>
  );
}
