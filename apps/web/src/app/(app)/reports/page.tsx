import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { Button } from "@/components/ui/button";
import { listReports, type ReportRecord } from "@/server/reports/repository";

const statusOrder = ["draft", "published", "superseded"] as const;
type ReportStatusLabel = (typeof statusOrder)[number];

export default function ReportsPage() {
  const reports = listReports();
  const grouped = groupByStatus(reports);
  const counts = statusOrder.map((status) => ({ status, count: grouped.get(status)?.length ?? 0 }));

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// review · vulnerability reports</div>
          <h1 className="bl-h1 mt-2 uppercase">Reports</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Structured VULN-YYYY-NNN write-ups produced by the Documentation Agent. Each report is
            traceable to a finding, the run that surfaced it, and the regression case (if promoted).
            Reports are exportable as markdown for triage handoff outside the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map((item) => (
            <Chip
              key={item.status}
              tone={item.status === "published" ? "signal" : item.status === "draft" ? "amber" : "muted"}
            >
              {item.status} · {item.count}
            </Chip>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Panel watermark="// reports · grouped by status" padded={false}>
          {statusOrder.map((status) => {
            const rows = grouped.get(status) ?? [];
            return (
              <div key={status} className="border-b border-bl-line last:border-b-0">
                <div className="border-b border-bl-line bg-bl-trough px-3 py-2">
                  <span className="bl-watermark">{status}</span>
                </div>
                {rows.length > 0 ? (
                  rows.map((report) => (
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
                          {report.attackCategory ? (
                            <Chip tone="cyan">{report.attackCategory}</Chip>
                          ) : null}
                          {report.reportVersion > 1 ? (
                            <Chip tone="muted">v{report.reportVersion}</Chip>
                          ) : null}
                        </div>
                        <h2 className="m-0 truncate text-sm font-medium text-bl-bone">
                          <Link href={`/reports/${report.id}`} className="hover:text-bl-signal">
                            {report.title}
                          </Link>
                        </h2>
                        {report.clinicalImpact ? (
                          <p className="mt-2 max-w-[760px] text-xs leading-5 text-bl-bone-2">
                            {report.clinicalImpact}
                          </p>
                        ) : null}
                        <div className="mt-2 font-mono text-[10px] text-bl-bone-4">
                          {report.findingId ? `finding/${report.findingId}` : "finding/-"} ·{" "}
                          {report.runId ? `run/${report.runId}` : "run/-"} · updated{" "}
                          {report.updatedAt.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/reports/${report.id}`}>
                            Open <ArrowRight size={11} aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="px-4 py-5 text-sm text-bl-bone-3">No {status} reports.</div>
                )}
              </div>
            );
          })}
        </Panel>

        <Panel watermark="// handoff · documentation agent" right={<Chip tone="cyan">read-only</Chip>}>
          <FileText size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="grid gap-3 font-mono text-[11px] text-bl-bone-2">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">source</span>
              <span>Documentation Agent from judge-confirmed cases</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">template</span>
              <span>VULN-YYYY-NNN · ARCHITECTURE.md spec</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">export</span>
              <span>Per-report markdown download for repo / disclosure</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">trust</span>
              <span>Drafts autonomous; publication gated by approval</span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-bl-bone-2">
            Drafts capture clinical impact, repro evidence, and recommended remediation. Publication
            requires reviewer approval per the safety gate policy. Each report links back to the
            originating finding and the run that produced its evidence.
          </p>
        </Panel>
      </section>
    </div>
  );
}

function groupByStatus(reports: ReportRecord[]): Map<ReportStatusLabel, ReportRecord[]> {
  const grouped = new Map<ReportStatusLabel, ReportRecord[]>();
  for (const status of statusOrder) grouped.set(status, []);
  for (const report of reports) {
    const key = (statusOrder as readonly string[]).includes(report.status)
      ? (report.status as ReportStatusLabel)
      : ("draft" as ReportStatusLabel);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(report);
  }
  return grouped;
}
