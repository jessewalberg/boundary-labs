import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Copy, Download, Play } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { getRunById, getSeedsForRun, type SeedAttempt } from "@/server/campaigns/fixtures";

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
  const run = getRunById(campaignId);

  if (!run) {
    notFound();
  }

  const seeds = getSeedsForRun(run.id);
  const selectedSeed = seeds[0];

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
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Copy size={12} aria-hidden="true" /> Copy ID
          </Button>
          <Button variant="secondary">
            <Download size={12} aria-hidden="true" /> Artifact JSON
          </Button>
          <Button>
            <Play size={12} aria-hidden="true" /> Re-run
          </Button>
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
        <span className="bl-watermark text-bl-bone-4">read-only fixture-backed detail</span>
      </div>

      <Panel padded={false} className="mb-4 overflow-x-auto">
        {seeds.length > 0 ? (
          seeds.map((seed) => <SeedRow key={seed.id} seed={seed} runId={run.id} />)
        ) : (
            <div className="px-4 py-6 text-sm text-bl-bone-3">
            No seed-level fixture has been attached to this historical run yet.
          </div>
        )}
      </Panel>

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
  const rail =
    seed.verdict === "fail"
      ? "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]"
      : seed.verdict === "partial"
        ? "bg-bl-amber"
        : "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]";

  return (
    <Link
      href={`/campaigns/${runId}/seeds/${seed.id}`}
      className="grid min-w-[760px] grid-cols-[3px_1fr_110px_90px_70px_14px] items-center gap-4 border-b border-bl-line px-3.5 py-3 transition-colors hover:bg-bl-panel-2 last:border-b-0"
    >
      <span className={`h-8 w-[3px] ${rail}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-bl-bone">seed/{seed.id}</span>
          <span className="text-bl-bone-4">·</span>
          <span className="truncate text-sm text-bl-bone-2">{seed.title}</span>
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-bl-bone-3">
          {seed.category} · judge {seed.judge} · {(seed.durationMs / 1000).toFixed(2)}s
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
