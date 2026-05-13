import { notFound } from "next/navigation";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel } from "@/components/boundary/related-panel";
import { listThreatCoverage } from "@/server/coverage/query";
import { listSeedUsageRecords } from "@/server/seeds/repository";

export default async function ThreatModelCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const coverage = listThreatCoverage().find((item) => slugify(item.title) === slug);
  if (!coverage) notFound();
  const seeds = listSeedUsageRecords().filter((seed) => slugify(seed.category) === slug).slice(0, 12);

  return (
    <div className="pb-8">
      <div className="mb-3"><BreadcrumbBack href="/threat-model" label="Threat Model" /></div>
      <section className="mb-5">
        <div className="bl-eyebrow">// threat category</div>
        <h1 className="bl-h1 mt-2 uppercase">{coverage.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone={coverage.status === "covered" ? "signal" : coverage.status === "deferred" ? "muted" : "amber"}>{coverage.status}</Chip>
          <Chip>{coverage.seedCount} seeds</Chip>
          <Chip>{coverage.passRate == null ? "no pass rate" : `${Math.round(coverage.passRate * 100)}% pass`}</Chip>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel watermark="// coverage">
          <p className="m-0 text-sm leading-6 text-bl-bone-2">
            This category is tracked by the seed corpus and run verdicts. Related runs and seeds
            stay visible even when no current findings are open.
          </p>
        </Panel>
        <RelatedPanel
          links={seeds.map((seed) => ({
            label: `seed/${seed.id}`,
            href: `/seeds/${seed.id}`,
            meta: `${seed.verdict} · ${seed.runId}`
          }))}
        />
      </section>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
