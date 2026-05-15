import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { RelatedPanel, type RelatedLink } from "@/components/boundary/related-panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { Button } from "@/components/ui/button";
import { getReport } from "@/server/reports/repository";
import { listLifecycleEvents } from "@/server/vulnerability-lifecycle/repository";

export default async function ReportDetailPage({
  params
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = getReport(reportId);
  if (!report) notFound();

  const lifecycle = report.findingId ? listLifecycleEvents(report.findingId) : [];
  const relatedRaw: Array<RelatedLink | null> = [
    report.findingId
      ? { label: `finding/${report.findingId}`, href: `/findings/${report.findingId}`, meta: "finding" }
      : null,
    report.runId
      ? { label: `run/${report.runId}`, href: `/campaigns/${report.runId}`, meta: "run" }
      : null,
    report.regressionCaseId
      ? {
          label: `regression/${report.regressionCaseId}`,
          href: `/regressions/${report.regressionCaseId}`,
          meta: "regression case"
        }
      : null,
    report.attackCategory
      ? {
          label: report.attackCategory,
          href: `/threat-model/${slugify(report.attackCategory)}`,
          meta: "category"
        }
      : null
  ];
  const related: RelatedLink[] = relatedRaw.filter((link): link is RelatedLink => link !== null);

  return (
    <div className="pb-8">
      <div className="mb-3">
        <BreadcrumbBack href="/reports" label="Reports" />
      </div>

      <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="bl-eyebrow">// vulnerability report</div>
          <h1 className="mt-2 max-w-[860px] text-2xl font-semibold text-bl-bone">
            {report.vulnId ?? report.id}: {report.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
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
            {report.affectedTargetVersion ? (
              <Chip tone="muted">target {report.affectedTargetVersion}</Chip>
            ) : null}
            {report.reportVersion > 1 ? <Chip tone="muted">v{report.reportVersion}</Chip> : null}
          </div>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/reports/${report.id}/download`}>
            <Download size={11} aria-hidden="true" />
            Download .md
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Panel watermark="// report · summary">
            <p className="m-0 max-w-[760px] text-sm leading-6 text-bl-bone-2">
              {report.summaryMd ?? "Summary not yet documented."}
            </p>
            {report.clinicalImpact ? (
              <div className="mt-4 rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-3 py-3">
                <div className="bl-watermark">// clinical impact</div>
                <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
                  {report.clinicalImpact}
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel watermark="// report · reproduction">
            {report.reproSequenceMd ? (
              <EvidencePane label="minimal repro" value={report.reproSequenceMd} />
            ) : (
              <p className="m-0 text-sm text-bl-bone-3">No reproduction steps captured.</p>
            )}
          </Panel>

          <Panel watermark="// report · behavior delta" padded={false}>
            <div className="grid gap-px md:grid-cols-2">
              <div className="border-b border-r border-bl-line bg-bl-panel px-4 py-3 md:border-b-0">
                <div className="bl-watermark">// expected</div>
                <p className="mt-2 max-w-[460px] text-sm leading-6 text-bl-bone-2">
                  {report.expectedBehaviorMd ?? "Not documented."}
                </p>
              </div>
              <div className="bg-bl-panel px-4 py-3">
                <div className="bl-watermark">// observed</div>
                <p className="mt-2 max-w-[460px] text-sm leading-6 text-bl-bone-2">
                  {report.observedBehaviorMd ?? "Not documented."}
                </p>
              </div>
            </div>
          </Panel>

          <Panel watermark="// report · evidence" padded={false}>
            {report.evidence.length > 0 ? (
              <ul className="m-0 list-none">
                {report.evidence.map((item, idx) => (
                  <li
                    key={`${item.type}-${idx}`}
                    className="border-b border-bl-line px-4 py-3 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="cyan">{item.type}</Chip>
                      {item.ref ? (
                        <span className="font-mono text-[11px] text-bl-bone">{item.ref}</span>
                      ) : null}
                    </div>
                    {item.detail ? (
                      <p className="mt-2 text-xs leading-5 text-bl-bone-2">{item.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-5 text-sm text-bl-bone-3">No evidence references attached.</div>
            )}
          </Panel>

          <Panel watermark="// report · remediation">
            <div className="grid gap-3 text-sm leading-6 text-bl-bone-2">
              <section>
                <div className="bl-watermark">// exploitability</div>
                <p className="mt-2 max-w-[760px]">
                  {report.exploitabilityMd ?? "Not documented."}
                </p>
              </section>
              <section>
                <div className="bl-watermark">// recommended remediation</div>
                <p className="mt-2 max-w-[760px]">
                  {report.remediationMd ?? "Not documented."}
                </p>
              </section>
            </div>
          </Panel>

          <Panel
            watermark="// report · fix validation history"
            right={<Chip tone="muted">{lifecycle.length} events</Chip>}
            padded={false}
          >
            {lifecycle.length > 0 ? (
              <ol className="m-0 list-none">
                {lifecycle.map((event) => (
                  <li
                    key={event.id}
                    className="grid gap-2 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[160px_1fr]"
                  >
                    <div className="font-mono text-[10px] text-bl-bone-4">
                      {event.createdAt.slice(0, 16).replace("T", " ")}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          tone={
                            event.status === "resolved" || event.status === "fixed_pending_verification"
                              ? "signal"
                              : event.status === "reopened"
                                ? "alarm"
                                : "muted"
                          }
                        >
                          {event.status}
                        </Chip>
                        {event.evidenceRunId ? (
                          <Link
                            href={`/campaigns/${event.evidenceRunId}`}
                            className="font-mono text-[11px] text-bl-cyan hover:text-bl-signal"
                          >
                            run/{event.evidenceRunId}
                          </Link>
                        ) : null}
                      </div>
                      {event.note ? (
                        <p className="mt-2 text-xs leading-5 text-bl-bone-2">{event.note}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="px-4 py-5 text-sm text-bl-bone-3">
                No fix validation events recorded. Lifecycle history accrues as regression suites
                re-run this finding against new target versions.
              </div>
            )}
          </Panel>

          {report.approvalNotesMd ? (
            <Panel watermark="// report · approval and disclosure notes">
              <p className="m-0 max-w-[760px] text-sm leading-6 text-bl-bone-2">
                {report.approvalNotesMd}
              </p>
            </Panel>
          ) : null}
        </div>

        <div className="grid gap-4">
          <Panel watermark="// report · metadata">
            <dl className="m-0 grid gap-3 font-mono text-[11px] text-bl-bone-2">
              <MetaRow label="vuln id" value={report.vulnId ?? "(not assigned)"} />
              <MetaRow label="report id" value={report.id} />
              <MetaRow label="version" value={`v${report.reportVersion}`} />
              <MetaRow label="created" value={report.createdAt.slice(0, 16).replace("T", " ")} />
              <MetaRow label="updated" value={report.updatedAt.slice(0, 16).replace("T", " ")} />
              <MetaRow label="created by" value={report.createdBy} />
              {report.affectedTargetVersion ? (
                <MetaRow label="target version" value={report.affectedTargetVersion} />
              ) : null}
            </dl>
          </Panel>
          <RelatedPanel links={related} />
        </div>
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-bl-bone-4">{label}</dt>
      <dd className="truncate text-bl-bone">{value}</dd>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
