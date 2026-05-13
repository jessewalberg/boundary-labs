import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, ExternalLink, Play } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { getAttemptForRun } from "@/server/attempts/repository";
import { getRun } from "@/server/runs/repository";

export default async function SeedDetailPage({
  params
}: {
  params: Promise<{ campaignId: string; seedId: string }>;
}) {
  const { campaignId, seedId } = await params;
  const run = await getRun(campaignId);
  const seed = getAttemptForRun(campaignId, seedId);

  if (!run || !seed) {
    notFound();
  }

  return (
    <div className="pb-8">
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/campaigns/${run.id}`}>← Run · {run.id}</Link>
        </Button>
      </div>

      <section className="mb-6 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end xl:gap-8">
        <div>
          <div className="bl-eyebrow">// finding · {seed.category}</div>
          <h1 className="mt-2 max-w-[780px] text-2xl font-semibold leading-tight tracking-[-0.005em] text-bl-bone">
            {seed.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip>seed/{seed.id}</Chip>
            <Chip tone="cyan">judge:{seed.judge}</Chip>
            <SeverityBadge severity={seed.severity} />
            <VerdictPill verdict={seed.verdict} />
            <Chip>{(seed.durationMs / 1000).toFixed(2)}s</Chip>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Copy size={12} aria-hidden="true" /> Copy
          </Button>
          <Button variant="secondary">
            <ExternalLink size={12} aria-hidden="true" /> Open in CLI
          </Button>
          <Button>
            <Play size={12} aria-hidden="true" /> Re-run seed
          </Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <EvidencePane label="// red_team · prompt" value={seed.prompt} />

        <Panel
          watermark="// target · response"
          right={<Chip tone="cyan">{run.target.replace(/^https?:\/\//, "")}</Chip>}
        >
          <p className="m-0 text-sm leading-6 text-bl-bone">{seed.response}</p>
        </Panel>

        <Panel
          watermark={`// judge · ${seed.judge}`}
          right={
            <span className="flex items-center gap-2">
              <VerdictPill verdict={seed.verdict} />
              <span className="font-mono text-[10px] text-bl-bone-3">{(seed.durationMs / 1000).toFixed(2)}s</span>
            </span>
          }
          className="xl:col-span-2"
        >
          <p
            className={`m-0 border-l-2 pl-3 text-sm leading-6 text-bl-bone ${
              seed.verdict === "fail"
                ? "border-bl-alarm"
                : seed.verdict === "partial"
                  ? "border-bl-amber"
                  : "border-bl-signal"
            }`}
          >
            {seed.rationale}
          </p>
        </Panel>

        <EvidencePane
          label={`// artifact · evals/results/${run.id}.json`}
          className="xl:col-span-2"
          value={JSON.stringify(
            {
              run_id: run.id,
              seed_id: seed.id,
              category: seed.category,
              severity: seed.severity,
              verdict: seed.verdict,
              judge: seed.judge,
              duration_ms: seed.durationMs,
              target: run.target,
              branch: run.branch,
              commit: run.commit
            },
            null,
            2
          )}
        />
      </section>
    </div>
  );
}
