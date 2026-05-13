import { notFound } from "next/navigation";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { EmptyStateRail } from "@/components/boundary/empty-state-rail";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel } from "@/components/boundary/related-panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { listSeedUsageRecords } from "@/server/seeds/repository";
import { listSeedVersions } from "@/server/seed_versions/repository";

export default async function SeedDetailPage({ params }: { params: Promise<{ seedId: string }> }) {
  const { seedId } = await params;
  const usages = listSeedUsageRecords().filter((item) => item.id === seedId);
  const seed = usages[0];
  if (!seed) notFound();
  const versions = listSeedVersions(seedId);

  return (
    <div className="pb-8">
      <div className="mb-3"><BreadcrumbBack href="/seeds" label="Seeds" /></div>
      <section className="mb-5">
        <div className="bl-eyebrow">// seed · {seed.category}</div>
        <h1 className="mt-2 max-w-[860px] text-2xl font-semibold text-bl-bone">{seed.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip>seed/{seed.id}</Chip>
          <SeverityBadge severity={seed.severity} />
          <VerdictPill verdict={seed.verdict} />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <EvidencePane label="// prompt" value={seed.prompt} />
          <Panel watermark="// version history" padded={false}>
            {versions.length > 0 ? versions.map((version) => (
              <div key={version.id} className="flex items-center justify-between border-b border-bl-line px-4 py-3 last:border-b-0">
                <span className="font-mono text-xs text-bl-bone">v{version.version}</span>
                <Chip tone={version.status === "auto_approved" ? "signal" : "amber"}>{version.status}</Chip>
              </div>
            )) : <EmptyStateRail>No version records beyond the current read model.</EmptyStateRail>}
          </Panel>
        </div>
        <RelatedPanel
          links={[
            ...usages.slice(0, 6).map((usage) => ({ label: `run/${usage.runId}`, href: `/campaigns/${usage.runId}`, meta: usage.verdict })),
            { label: seed.category, href: `/threat-model/${slugify(seed.category)}`, meta: "category" }
          ]}
        />
      </section>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
