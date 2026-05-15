import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { EmptyStateRail } from "@/components/boundary/empty-state-rail";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel, type RelatedLink } from "@/components/boundary/related-panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { caseDisplay, campaignCaseHref, decodeCaseRouteParam } from "@/lib/case-route";
import { listSeedUsageRecords } from "@/server/seeds/repository";
import { listSeedVersions } from "@/server/seed_versions/repository";

export default async function SeedDetailPage({ params }: { params: Promise<{ seedId: string }> }) {
  const { seedId } = await params;
  const decodedSeedId = decodeCaseRouteParam(seedId);
  const usages = listSeedUsageRecords().filter((item) => item.id === decodedSeedId);
  const seed = usages[0];
  if (!seed) notFound();
  const versions = listSeedVersions(decodedSeedId);
  const display = caseDisplay(seed.id);

  const otherAttempts = usages.slice(1);
  const related: RelatedLink[] = [
    ...usages.slice(0, 6).map((usage) => ({
      label: `run/${usage.runId}`,
      href: `/campaigns/${usage.runId}`,
      meta: usage.verdict
    })),
    { label: seed.category, href: `/threat-model/${slugify(seed.category)}`, meta: "category" }
  ];

  return (
    <div className="pb-8">
      <div className="mb-3">
        <BreadcrumbBack href="/seeds" label="Seeds" />
      </div>

      <section className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end xl:gap-8">
        <div>
          <div className="bl-eyebrow">// seed · {seed.category}</div>
          <h1 className="mt-2 max-w-[860px] text-2xl font-semibold text-bl-bone">{seed.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip>{display.prefix}/{display.primary}</Chip>
            {display.secondary ? <Chip>{display.secondary}</Chip> : null}
            <SeverityBadge severity={seed.severity} />
            <VerdictPill verdict={seed.verdict} />
            <Chip tone="cyan">judge:{seed.judge}</Chip>
            <Chip>{(seed.durationMs / 1000).toFixed(2)}s</Chip>
            <Chip tone="muted">latest run/{seed.runId}</Chip>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={campaignCaseHref(seed.runId, seed.id)}>
            Open in run context <ArrowRight size={11} aria-hidden="true" />
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Panel
            watermark="// most-recent attempt · chat round-trip"
            right={
              <span className="flex items-center gap-2">
                <VerdictPill verdict={seed.verdict} />
                <span className="font-mono text-[10px] text-bl-bone-3">
                  {(seed.durationMs / 1000).toFixed(2)}s
                </span>
              </span>
            }
            padded={false}
          >
            <div className="grid gap-px md:grid-cols-2">
              <div className="border-b border-r border-bl-line bg-bl-panel md:border-b-0">
                <div className="border-b border-bl-line bg-bl-trough px-3 py-2">
                  <span className="bl-watermark">// red_team · prompt</span>
                </div>
                <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-bl-bone-2">
                  {seed.prompt}
                </pre>
              </div>
              <div className="bg-bl-panel">
                <div className="border-b border-bl-line bg-bl-trough px-3 py-2">
                  <span className="bl-watermark">// target · response</span>
                </div>
                <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-bl-bone-2">
                  {seed.response}
                </pre>
              </div>
            </div>
            <div className="border-t border-bl-line bg-bl-trough px-3 py-2">
              <span className="bl-watermark">// judge · {seed.judge} rationale</span>
            </div>
            <div
              className={`border-l-2 bg-bl-panel px-4 py-3 text-sm leading-6 text-bl-bone ${
                seed.verdict === "fail"
                  ? "border-bl-alarm"
                  : seed.verdict === "partial"
                    ? "border-bl-amber"
                    : seed.verdict === "invalid"
                      ? "border-bl-bone-3"
                      : "border-bl-signal"
              }`}
            >
              {seed.rationale}
            </div>
          </Panel>

          {otherAttempts.length > 0 ? (
            <Panel
              watermark="// attempt history · across runs"
              right={<Chip tone="muted">{otherAttempts.length + 1} total</Chip>}
              padded={false}
            >
              <article className="border-b border-bl-line bg-bl-trough px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="signal">latest</Chip>
                    <span className="font-mono text-xs text-bl-bone">run/{seed.runId}</span>
                    <VerdictPill verdict={seed.verdict} />
                  </div>
                  <Link
                    href={campaignCaseHref(seed.runId, seed.id)}
                    className="font-mono text-[11px] text-bl-cyan hover:text-bl-signal"
                  >
                    open →
                  </Link>
                </div>
              </article>
              {otherAttempts.map((attempt) => (
                <article
                  key={`${attempt.runId}-${attempt.id}`}
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-bl-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-bl-bone">run/{attempt.runId}</span>
                      <VerdictPill verdict={attempt.verdict} />
                      <span className="font-mono text-[10px] text-bl-bone-4">
                        judge:{attempt.judge}
                      </span>
                      <span className="font-mono text-[10px] text-bl-bone-4">
                        {(attempt.durationMs / 1000).toFixed(2)}s
                      </span>
                    </div>
                  </div>
                  <Link
                    href={campaignCaseHref(attempt.runId, attempt.id)}
                    className="self-center font-mono text-[11px] text-bl-cyan hover:text-bl-signal"
                  >
                    open →
                  </Link>
                </article>
              ))}
            </Panel>
          ) : null}

          <EvidencePane label="// raw rationale" value={seed.rationale} />

          <Panel watermark="// seed · version history" padded={false}>
            {versions.length > 0 ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between border-b border-bl-line px-4 py-3 last:border-b-0"
                >
                  <span className="font-mono text-xs text-bl-bone">v{version.version}</span>
                  <Chip tone={version.status === "auto_approved" ? "signal" : "amber"}>
                    {version.status}
                  </Chip>
                </div>
              ))
            ) : (
              <EmptyStateRail>No version records beyond the current read model.</EmptyStateRail>
            )}
          </Panel>
        </div>

        <RelatedPanel links={related} />
      </section>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
