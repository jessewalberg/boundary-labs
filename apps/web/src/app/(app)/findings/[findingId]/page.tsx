import { notFound } from "next/navigation";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel } from "@/components/boundary/related-panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { listSeedAttemptRecords } from "@/server/attempts/repository";
import { listFindings } from "@/server/findings/repository";

export default async function FindingDetailPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const finding = listFindings().find((item) => item.id === findingId);
  if (!finding) notFound();

  const seed = listSeedAttemptRecords().find((item) => item.id === finding.seed);
  const related = [
    seed ? { label: `seed/${seed.id}`, href: `/seeds/${seed.id}`, meta: seed.category } : null,
    seed ? { label: `run/${seed.runId}`, href: `/campaigns/${seed.runId}`, meta: seed.verdict } : null,
    { label: seed?.category ?? finding.seed, href: `/threat-model/${slugify(seed?.category ?? finding.seed)}`, meta: "category" }
  ].filter(Boolean) as Array<{ label: string; href: string; meta?: string }>;

  return (
    <div className="pb-8">
      <div className="mb-3"><BreadcrumbBack href="/findings" label="Findings" /></div>
      <section className="mb-5">
        <div className="bl-eyebrow">// finding</div>
        <h1 className="mt-2 max-w-[860px] text-2xl font-semibold text-bl-bone">{finding.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip>{finding.id}</Chip>
          <SeverityBadge severity={finding.severity} />
          <Chip tone={finding.status === "open" ? "alarm" : finding.status === "fixed" ? "signal" : "muted"}>{finding.status}</Chip>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel watermark="// triage note">
          <p className="m-0 text-sm leading-6 text-bl-bone-2">{finding.note}</p>
          <div className="mt-4 font-mono text-[11px] text-bl-bone-4">last_fail · {finding.lastFail}</div>
        </Panel>
        <RelatedPanel links={related} />
      </section>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
