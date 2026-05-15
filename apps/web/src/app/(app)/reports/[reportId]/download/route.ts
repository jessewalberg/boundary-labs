import { NextResponse } from "next/server";
import { getReport, renderReportMarkdown, type LifecycleEvent } from "@/server/reports/repository";
import { listLifecycleEvents } from "@/server/vulnerability-lifecycle/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  const report = getReport(reportId);
  if (!report) {
    return new NextResponse("Report not found", { status: 404 });
  }

  const events: LifecycleEvent[] = report.findingId
    ? listLifecycleEvents(report.findingId).map((event) => ({
        status: event.status,
        createdAt: event.createdAt,
        note: event.note,
        evidenceRunId: event.evidenceRunId
      }))
    : [];

  const markdown = renderReportMarkdown(report, events);
  const filename = `${report.vulnId ?? report.id}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
