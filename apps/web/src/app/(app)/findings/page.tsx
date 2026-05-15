import Link from "next/link";
import { ArrowRight, FileWarning } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { Button } from "@/components/ui/button";
import { campaignCaseHref, caseDisplay } from "@/lib/case-route";
import { listSeedAttemptRecords } from "@/server/attempts/repository";
import { listFindings } from "@/server/findings/repository";

const statusOrder = ["open", "fixed", "deferred"] as const;

export default function FindingsPage() {
  const findings = listFindings();
  const seedAttempts = listSeedAttemptRecords();
  const counts = statusOrder.map((status) => ({
    status,
    count: findings.filter((finding) => finding.status === status).length
  }));

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// review · findings</div>
          <h1 className="bl-h1 mt-2 uppercase">Findings</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Read-only triage queue for adversarial failures and deferred coverage gaps. Findings are
            materialized from judge verdicts after campaigns produce artifacts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map((item) => (
            <Chip key={item.status} tone={item.status === "open" ? "alarm" : item.status === "fixed" ? "signal" : "muted"}>
              {item.status} · {item.count}
            </Chip>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Panel watermark="// queue · grouped" padded={false}>
          {statusOrder.map((status) => (
            <div key={status} className="border-b border-bl-line last:border-b-0">
              <div className="border-b border-bl-line bg-bl-trough px-3 py-2">
                <span className="bl-watermark">{status}</span>
              </div>
              {findings.filter((finding) => finding.status === status).length > 0 ? findings.filter((finding) => finding.status === status).map((finding) => {
                const reference = findSeedReference(seedAttempts, finding.seed);
                const display = caseDisplay(finding.seed);
                return (
                  <article key={finding.id} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-bl-bone">{finding.id}</span>
                        <SeverityBadge severity={finding.severity} />
                        <Chip tone={finding.status === "open" ? "alarm" : finding.status === "fixed" ? "signal" : "muted"}>
                          {finding.status}
                        </Chip>
                      </div>
                      <h2 className="m-0 text-sm font-medium text-bl-bone">
                        <Link href={`/findings/${finding.id}`} className="hover:text-bl-signal">
                          {finding.title}
                        </Link>
                      </h2>
                      <p className="mt-2 max-w-[760px] text-xs leading-5 text-bl-bone-2">{finding.note}</p>
                      <div className="mt-2 font-mono text-[10px] text-bl-bone-4">
                        {display.prefix}/{display.primary} · last fail {new Date(finding.lastFail).toISOString().slice(0, 16)}Z
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {reference ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href={campaignCaseHref(reference.runId, reference.seedId)}>
                            Evidence <ArrowRight size={11} aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : (
                        <Chip tone="muted">adapter gap</Chip>
                      )}
                    </div>
                  </article>
                );
              }) : (
                <div className="px-4 py-5 text-sm text-bl-bone-3">No {status} findings.</div>
              )}
            </div>
          ))}
        </Panel>

        <Panel watermark="// handoff · regression" right={<Chip tone="cyan">read-only</Chip>}>
          <FileWarning size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="grid gap-3 font-mono text-[11px] text-bl-bone-2">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">source</span>
              <span>Judge verdicts + run artifacts</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">write API</span>
              <span>future findings repository</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">promotion</span>
              <span>human-approved regression suite</span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-bl-bone-2">
            Open findings should become either a patched target behavior, a deterministic regression,
            or an explicitly deferred adapter gap.
          </p>
        </Panel>
      </section>
    </div>
  );
}

function findSeedReference(seedAttempts: ReturnType<typeof listSeedAttemptRecords>, seedId: string) {
  const seed = seedAttempts.find((attempt) => attempt.id === seedId);
  return seed ? { runId: seed.runId, seedId: seed.id } : null;
}
