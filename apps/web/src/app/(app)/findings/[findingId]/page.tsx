import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel } from "@/components/boundary/related-panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { Button } from "@/components/ui/button";
import { caseDisplay } from "@/lib/case-route";
import { listSeedAttemptRecords } from "@/server/attempts/repository";
import { listFindings } from "@/server/findings/repository";
import { listReportsByFinding } from "@/server/reports/repository";

export default async function FindingDetailPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const finding = listFindings().find((item) => item.id === findingId);
  if (!finding) notFound();

  const seed = listSeedAttemptRecords().find((item) => item.id === finding.seed);
  const display = seed ? caseDisplay(seed.id) : null;
  const reports = listReportsByFinding(finding.id);
  const related = [
    seed && display ? { label: `${display.prefix}/${display.primary}`, href: `/seeds/${encodeURIComponent(seed.id)}`, meta: display.secondary ?? seed.category } : null,
    seed ? { label: `run/${seed.runId}`, href: `/campaigns/${seed.runId}`, meta: seed.verdict } : null,
    { label: seed?.category ?? finding.seed, href: `/threat-model/${slugify(seed?.category ?? finding.seed)}`, meta: "category" },
    ...reports.map((report) => ({
      label: report.vulnId ?? report.id,
      href: `/reports/${report.id}`,
      meta: `report · ${report.status}`
    }))
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
        <div className="grid gap-4">
          <Panel watermark="// triage note">
            <p className="m-0 text-sm leading-6 text-bl-bone-2">{finding.note}</p>
            <div className="mt-4 font-mono text-[11px] text-bl-bone-4">last_fail · {finding.lastFail}</div>
          </Panel>
          <Panel
            watermark="// vulnerability reports"
            right={<Chip tone={reports.length > 0 ? "signal" : "muted"}>{reports.length}</Chip>}
            padded={false}
          >
            {reports.length > 0 ? (
              reports.map((report) => (
                <article
                  key={report.id}
                  className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
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
                      {report.reportVersion > 1 ? (
                        <Chip tone="muted">v{report.reportVersion}</Chip>
                      ) : null}
                    </div>
                    <h2 className="m-0 truncate text-sm font-medium text-bl-bone">{report.title}</h2>
                    {report.clinicalImpact ? (
                      <p className="mt-2 max-w-[760px] text-xs leading-5 text-bl-bone-2">
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
              ))
            ) : (
              <div className="flex items-center gap-3 px-4 py-5 text-sm text-bl-bone-3">
                <FileText size={16} className="text-bl-bone-4" aria-hidden="true" />
                <span>
                  No reports yet. The Documentation Agent will produce a VULN-YYYY-NNN draft when
                  the next run surfaces evidence for this finding.
                </span>
              </div>
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
