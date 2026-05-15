import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Copy, Download, FileText, Play } from "lucide-react";
import { AgentTimeline } from "@/components/boundary/agent-timeline";
import { CampaignStatusPoller } from "@/components/boundary/campaign-status-poller";
import { Chip } from "@/components/boundary/chip";
import { ConfirmModal } from "@/components/boundary/confirm-modal";
import { CostBreakdown } from "@/components/boundary/cost-breakdown";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { campaignCaseHref, caseDisplay } from "@/lib/case-route";
import { listAgentTimeline } from "@/server/agent-timeline/repository";
import { listAttemptsForRun } from "@/server/attempts/repository";
import { getStoredCampaign, storedCampaignToRun } from "@/server/campaigns/repository";
import type { SeedAttempt } from "@/server/campaigns/types";
import { listRunCosts } from "@/server/costs/repository";
import { listReportsByRun } from "@/server/reports/repository";
import { getRun } from "@/server/runs/repository";
import { cancelCampaignAction } from "./cancel/actions";
import { rerunCampaignAction } from "./rerun/actions";

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

export default async function CampaignDetailPage({
  params
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const storedCampaign = await getStoredCampaign(campaignId);
  const run = await getRun(campaignId) ?? (storedCampaign ? storedCampaignToRun(storedCampaign) : undefined);

  if (!run) {
    notFound();
  }

  const seeds = listAttemptsForRun(run.id);
  const reports = listReportsByRun(run.id);
  const costs = listRunCosts(run.id);
  const timeline = listAgentTimeline({ runId: run.id });
  const selectedSeed = seeds[0];
  const activeRun = run.status === "queued" || run.status === "running";
  const cancelAction = cancelCampaignAction.bind(null, run.id);
  const rerunAction = rerunCampaignAction.bind(null, run.id);

  return (
    <div className="pb-8">
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/campaigns">← Runs</Link>
        </Button>
      </div>

      <section className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end xl:gap-8">
        <div>
          <div className="bl-eyebrow">// run_artifact</div>
          <h1 className="bl-h1 mt-2 font-mono text-[26px] tracking-normal">{run.id}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-bl-bone-2">
            <span className="bl-watermark">Target</span>
            <code>{run.target}</code>
            <span className="text-bl-bone-4">·</span>
            <span className="bl-watermark">Started</span>
            <code>{startedFormatter.format(new Date(run.startedAt))} UTC</code>
            <span className="text-bl-bone-4">·</span>
            <span className="bl-watermark">Branch</span>
            <code>
              {run.branch}@{run.commit}
            </code>
            <CampaignStatusPoller active={activeRun} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Copy size={12} aria-hidden="true" /> Copy ID
          </Button>
          <Button variant="secondary">
            <Download size={12} aria-hidden="true" /> Artifact JSON
          </Button>
          <form action={rerunAction}>
            <Button type="submit">
              <Play size={12} aria-hidden="true" /> Re-run
            </Button>
          </form>
          {activeRun ? (
            <ConfirmModal label="Cancel" confirmLabel="Cancel run" action={cancelAction}>
              <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-3">
                Reason
                <textarea
                  name="reason"
                  maxLength={1000}
                  className="min-h-24 resize-none border border-bl-line bg-bl-trough p-2 text-xs normal-case tracking-normal text-bl-bone outline-none"
                />
              </label>
            </ConfirmModal>
          ) : null}
        </div>
      </section>

      <section className="mb-4 grid overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel md:grid-cols-6">
        <Metric label="Total" value={run.seedCount} />
        <Metric label="Pass" value={run.summary.pass} tone="signal" glow />
        <Metric label="Fail" value={run.summary.fail} tone={run.summary.fail ? "alarm" : "muted"} glow={run.summary.fail > 0} />
        <Metric label="Partial" value={run.summary.partial} tone={run.summary.partial ? "amber" : "muted"} />
        <Metric label="Invalid" value={run.summary.invalid} tone="muted" />
        <Metric label="Wall" value={run.duration} tone="bone" />
      </section>

      <div className="mb-2 flex items-center justify-between">
        <span className="bl-watermark">// seeds · {seeds.length}</span>
        <span className="bl-watermark text-bl-bone-4">
          {run.branch === "artifact-ingest" ? "read-only artifact detail" : "read-only run detail"}
        </span>
      </div>

      <Panel padded={false} className="mb-4 overflow-x-auto">
        {seeds.length > 0 ? (
          seeds.map((seed) => <SeedRow key={seed.id} seed={seed} runId={run.id} />)
        ) : (
          <div className="px-4 py-6 text-sm text-bl-bone-3">
            No seed-level artifact has been attached to this campaign yet.
          </div>
        )}
      </Panel>

      {run.pydanticGraph ? (
        <section className="mb-4 grid gap-4 xl:grid-cols-2">
          <Panel
            watermark="// pydantic_graph · nodes"
            right={<Chip tone="cyan">{run.pydanticGraph.nodes.length} nodes</Chip>}
          >
            <div className="flex flex-wrap gap-2">
              {run.pydanticGraph.nodes.map((node) => (
                <code key={node} className="border border-bl-line bg-bl-trough px-2 py-1 font-mono text-[10px] text-bl-bone-2">
                  {node}
                </code>
              ))}
            </div>
          </Panel>
          <Panel
            watermark="// agents · connections"
            right={<Chip tone={run.pydanticGraph.agentConnections.some((agent) => agent.status === "executed") ? "signal" : "cyan"}>{run.pydanticGraph.schemaVersion ?? "graph"}</Chip>}
          >
            <div className="grid gap-2">
              {run.pydanticGraph.agentConnections.map((agent) => (
                <div
                  key={agent.role}
                  className="grid gap-1 border border-bl-line bg-bl-trough px-3 py-2 font-mono text-[11px] text-bl-bone-2 md:grid-cols-[120px_1fr_110px]"
                >
                  <span className="text-bl-bone">{agent.role}</span>
                  <span className="truncate">
                    {agent.provider} · {agent.model}
                  </span>
                  <span className={agent.status === "executed" ? "text-bl-signal" : agent.status === "failed" ? "text-bl-alarm" : "text-bl-amber"}>
                    {agent.status}
                  </span>
                  {agent.detail ? <span className="md:col-span-3 text-bl-bone-3">{agent.detail}</span> : null}
                </div>
              ))}
            </div>
          </Panel>
        </section>
      ) : null}

      <section className="mb-4 grid gap-4 xl:grid-cols-2">
        <CostBreakdown costs={costs} />
        <AgentTimeline events={timeline} />
      </section>

      {reports.length > 0 ? (
        <section className="mb-4">
          <Panel
            watermark="// vulnerability reports · surfaced by this run"
            right={<Chip tone="signal">{reports.length}</Chip>}
            padded={false}
          >
            {reports.map((report) => (
              <article
                key={report.id}
                className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <FileText size={12} className="text-bl-bone-3" aria-hidden="true" />
                    <span className="font-mono text-xs text-bl-bone">
                      {report.vulnId ?? report.id}
                    </span>
                    {report.severity ? <SeverityBadge severity={report.severity} /> : null}
                    <Chip
                      tone={
                        report.status === "published"
                          ? "signal"
                          : report.status === "draft"
                            ? "amber"
                            : "muted"
                      }
                    >
                      {report.status}
                    </Chip>
                    {report.attackCategory ? <Chip tone="cyan">{report.attackCategory}</Chip> : null}
                  </div>
                  <h3 className="m-0 truncate text-sm font-medium text-bl-bone">{report.title}</h3>
                  {report.clinicalImpact ? (
                    <p className="mt-1 max-w-[760px] text-xs leading-5 text-bl-bone-2">
                      {report.clinicalImpact}
                    </p>
                  ) : null}
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/reports/${report.id}`}>
                    Open <ArrowRight size={11} aria-hidden="true" />
                  </Link>
                </Button>
              </article>
            ))}
          </Panel>
        </section>
      ) : null}

      {selectedSeed ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <EvidencePane label="// red_team · prompt" value={selectedSeed.prompt} />
          <Panel
            watermark="// target · response"
            right={<Chip tone="cyan">{run.target.replace(/^https?:\/\//, "")}</Chip>}
          >
            <p className="m-0 text-sm leading-6 text-bl-bone">{selectedSeed.response}</p>
          </Panel>
          <Panel
            watermark={`// judge · ${selectedSeed.judge}`}
            right={<VerdictPill verdict={selectedSeed.verdict} />}
            className="xl:col-span-2"
          >
            <p className="m-0 border-l-2 border-bl-signal pl-3 text-sm leading-6 text-bl-bone">
              {selectedSeed.rationale}
            </p>
          </Panel>
          <EvidencePane
            label={`// artifact · evals/results/${run.id}.json`}
            className="xl:col-span-2"
            value={JSON.stringify(
              {
                run_id: run.id,
                seed_id: selectedSeed.id,
                category: selectedSeed.category,
                severity: selectedSeed.severity,
                verdict: selectedSeed.verdict,
                judge: selectedSeed.judge,
                duration_ms: selectedSeed.durationMs,
                target: run.target,
                branch: run.branch,
                commit: run.commit
              },
              null,
              2
            )}
          />
        </section>
      ) : storedCampaign ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <EvidencePane
            label={`// artifact · ${storedCampaign.artifactPath}`}
            className="xl:col-span-2"
            value={JSON.stringify(storedCampaign, null, 2)}
          />
          <Panel watermark="// runner · pending" right={<Chip tone="cyan">{storedCampaign.status}</Chip>}>
            <pre className="m-0 overflow-x-auto font-mono text-[11px] leading-5 text-bl-bone-2">
{`${storedCampaign.runnerCommand.scriptPath} --target-url ${storedCampaign.runnerCommand.targetUrl} --results-dir ${storedCampaign.runnerCommand.resultDir}`}
            </pre>
          </Panel>
          <Panel watermark="// guardrails" right={<Chip tone="signal">recorded</Chip>}>
            <div className="grid gap-2 font-mono text-[11px] text-bl-bone-2">
              <div>requested_by · {storedCampaign.requestedBy}</div>
              <div>budget_cents · {storedCampaign.budgetCents}</div>
              <div>data_mode · {storedCampaign.dataMode}</div>
            </div>
          </Panel>
        </section>
      ) : null}
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
            ? "text-bl-bone-4"
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

function SeedRow({ seed, runId }: { seed: SeedAttempt; runId: string }) {
  const display = caseDisplay(seed.id);
  const rail =
    seed.verdict === "fail"
      ? "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]"
      : seed.verdict === "partial"
        ? "bg-bl-amber"
        : "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";

  return (
    <Link
      href={campaignCaseHref(runId, seed.id)}
      className="grid min-w-[760px] grid-cols-[3px_1fr_110px_90px_70px_14px] items-center gap-4 border-b border-bl-line px-3.5 py-3 transition-colors hover:bg-bl-panel-2 last:border-b-0"
    >
      <span className={`h-8 w-[3px] ${rail}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-bl-bone">{display.prefix}/{display.primary}</span>
          <span className="text-bl-bone-4">·</span>
          <span className="truncate text-sm text-bl-bone-2">{seed.title}</span>
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-bl-bone-3">
          {display.secondary ? `${display.secondary} · ` : ""}{seed.category} · judge {seed.judge} · {(seed.durationMs / 1000).toFixed(2)}s
        </div>
      </div>
      <SeverityBadge severity={seed.severity} />
      <VerdictPill verdict={seed.verdict} />
      <span className="text-right font-mono text-[11px] text-bl-bone-3">
        {(seed.durationMs / 1000).toFixed(2)}s
      </span>
      <ChevronRight size={12} className="text-bl-bone-3" aria-hidden="true" />
    </Link>
  );
}
