import { notFound } from "next/navigation";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import { getApproval } from "@/server/approvals/repository";
import { approveApprovalAction, rejectApprovalAction } from "../actions";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const approval = getApproval(approvalId);
  if (!approval) notFound();
  const approve = approveApprovalAction.bind(null, approval.id);
  const reject = rejectApprovalAction.bind(null, approval.id);

  return (
    <div className="pb-8">
      <div className="mb-3"><BreadcrumbBack href="/approvals" label="Approvals" /></div>
      <section className="mb-5">
        <div className="bl-eyebrow">// approval · {approval.action}</div>
        <h1 className="bl-h1 mt-2 font-mono text-[26px] tracking-normal">{approval.id}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone={approval.status === "pending" ? "amber" : approval.status === "approved" ? "signal" : "alarm"}>{approval.status}</Chip>
          <Chip>{approval.targetType}/{approval.targetId ?? "-"}</Chip>
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EvidencePane label="// payload" value={JSON.stringify(JSON.parse(approval.payloadJson), null, 2)} />
        <Panel watermark="// decision">
          <div className="grid gap-3 font-mono text-[11px] text-bl-bone-2">
            <div>canonical_hash · {approval.canonicalHash}</div>
            <div>requested_by · {approval.requestedBy}</div>
            <div>created_at · {approval.createdAt}</div>
          </div>
          {approval.status === "pending" ? (
            <div className="mt-5 grid gap-3">
              <form action={approve}>
                <Button type="submit">Approve</Button>
              </form>
              <form action={reject} className="grid gap-2">
                <textarea
                  name="comment"
                  maxLength={1000}
                  required
                  className="min-h-24 resize-none border border-bl-line bg-bl-trough p-2 text-xs text-bl-bone outline-none"
                />
                <Button type="submit" variant="secondary">Reject</Button>
              </form>
            </div>
          ) : null}
        </Panel>
      </section>
    </div>
  );
}
