import { notFound } from "next/navigation";
import { BreadcrumbBack } from "@/components/boundary/breadcrumb-back";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { RegressionStatusPill } from "@/components/boundary/regression-status-pill";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { getRegressionCase } from "@/server/regression-cases/repository";

export default async function RegressionCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const regressionCase = getRegressionCase(decodeURIComponent(caseId));
  if (!regressionCase) notFound();

  return (
    <div className="pb-8">
      <div className="mb-3"><BreadcrumbBack href="/regressions" label="Regressions" /></div>
      <section className="mb-5">
        <div className="bl-eyebrow">// regression · promoted case</div>
        <h1 className="bl-h1 mt-2 font-mono text-[26px] tracking-normal">{regressionCase.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <RegressionStatusPill status={regressionCase.status} />
          <SeverityBadge severity={regressionCase.severity} />
          <Chip>{regressionCase.category}</Chip>
          <Chip tone="cyan">v{regressionCase.version.version}</Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <EvidencePane
          label="// pass semantics"
          value={JSON.stringify({
            protectedBehavior: regressionCase.version.protectedBehavior,
            requiredEvidence: regressionCase.version.requiredEvidence,
            invalidConditions: regressionCase.version.invalidConditions,
            deterministicChecks: regressionCase.version.deterministicChecks,
            judgeRubric: regressionCase.version.judgeRubric
          }, null, 2)}
        />
        <EvidencePane
          label="// links"
          value={JSON.stringify({
            findingId: regressionCase.findingId,
            approvalId: regressionCase.approvalId,
            sourceSeedId: regressionCase.sourceSeedId,
            sourceCaseId: regressionCase.sourceCaseId,
            targetVersionId: regressionCase.version.targetVersionId
          }, null, 2)}
        />
      </section>
    </div>
  );
}
