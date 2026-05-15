import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { RegressionStatusPill } from "@/components/boundary/regression-status-pill";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { Button } from "@/components/ui/button";
import { getOrchestratorState } from "@/server/orchestrator-state/repository";
import { listRegressionCaseInventory } from "@/server/regression-cases/repository";
import { getRegressionObservability } from "@/server/regression-observability/repository";

export default function RegressionsPage() {
  const observability = getRegressionObservability();
  const orchestrator = getOrchestratorState();
  const cases = listRegressionCaseInventory();

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// regression harness · confirmed exploits</div>
          <h1 className="bl-h1 mt-2 uppercase">Regressions</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Promoted cases are tracked separately from exploratory seeds, replayed against target versions, and classified with invalid-result semantics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={orchestrator.shouldRunRegressions ? "signal" : "muted"}>active · {orchestrator.activeRegressionCount}</Chip>
          <Chip tone={orchestrator.recentReopenedCount > 0 ? "alarm" : "muted"}>reopened · {orchestrator.recentReopenedCount}</Chip>
          <Chip tone={orchestrator.invalidResultRate > 0.25 ? "amber" : "muted"}>invalid · {Math.round(orchestrator.invalidResultRate * 100)}%</Chip>
        </div>
      </section>

      <section className="mb-4 grid overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel xl:grid-cols-4">
        {observability.categories.map((category) => (
          <div key={category.category} className="border-b border-r border-bl-line px-4 py-3 xl:border-b-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bl-bone-4">{category.category}</div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="font-mono text-2xl text-bl-bone">{category.regressionCaseCount}</div>
              <div className="font-mono text-[10px] text-bl-bone-3">{category.seedCount} seeds</div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1 font-mono text-[10px] text-bl-bone-3">
              <span className="text-bl-signal">{category.pass} pass</span>
              <span className="text-bl-alarm">{category.fail} fail</span>
              <span className="text-bl-amber">{category.partial} part</span>
              <span>{category.invalid} invalid</span>
            </div>
          </div>
        ))}
        {observability.categories.length === 0 ? (
          <div className="px-4 py-6 text-sm text-bl-bone-3">No promoted regression cases yet.</div>
        ) : null}
      </section>

      {observability.targetVersions.length > 0 ? (
        <section className="mb-4">
          <Panel
            watermark="// versions · pass/fail across target versions"
            right={<Chip tone="cyan">{observability.targetVersions.length} versions</Chip>}
            padded={false}
          >
            <div className="grid overflow-hidden md:grid-cols-2 xl:grid-cols-3">
              {observability.targetVersions.map((version) => {
                const total = version.pass + version.fail + version.partial + version.invalid;
                const passRate = total > 0 ? Math.round((version.pass / total) * 100) : 0;
                return (
                  <div key={version.versionKey} className="border-b border-r border-bl-line px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-bl-bone">{version.versionKey}</span>
                      {version.comparable ? (
                        <Chip tone="cyan">comparable</Chip>
                      ) : (
                        <Chip tone="muted">not comparable</Chip>
                      )}
                    </div>
                    <div className="mt-2 font-mono text-2xl text-bl-bone">{passRate}%</div>
                    <div className="font-mono text-[10px] text-bl-bone-3">pass rate · {total} results</div>
                    <div className="mt-3 grid grid-cols-4 gap-1 font-mono text-[10px]">
                      <span className="text-bl-signal">{version.pass} pass</span>
                      <span className="text-bl-alarm">{version.fail} fail</span>
                      <span className="text-bl-amber">{version.partial} part</span>
                      <span className="text-bl-bone-3">{version.invalid} inv</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <Panel watermark="// inventory · active cases" padded={false}>
          {cases.length > 0 ? cases.map((regressionCase) => (
            <article key={regressionCase.id} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-bl-bone">{regressionCase.id}</span>
                  <SeverityBadge severity={regressionCase.severity} />
                  <RegressionStatusPill status={regressionCase.latestStatus ?? regressionCase.status} />
                  {regressionCase.isReappearance ? <Chip tone="alarm">reappeared</Chip> : null}
                  {regressionCase.isCrossCategoryRegression ? <Chip tone="amber">cross-category</Chip> : null}
                </div>
                <h2 className="m-0 truncate text-sm font-medium text-bl-bone">
                  <Link href={`/regressions/${regressionCase.id}`} className="hover:text-bl-signal">
                    {regressionCase.title}
                  </Link>
                </h2>
                <div className="mt-2 font-mono text-[10px] text-bl-bone-4">
                  {regressionCase.category} · finding/{regressionCase.findingId ?? "-"} · run/{regressionCase.latestRunId ?? "-"}
                </div>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/regressions/${regressionCase.id}`}>
                  Open <ArrowRight size={11} aria-hidden="true" />
                </Link>
              </Button>
            </article>
          )) : (
            <div className="px-4 py-5 text-sm text-bl-bone-3">Approved regression promotions will appear here.</div>
          )}
        </Panel>

        <Panel watermark="// orchestrator · decision state" right={<Chip tone="cyan">read model</Chip>}>
          <ShieldAlert size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="grid gap-3 font-mono text-[11px] text-bl-bone-2">
            {orchestrator.decisions.map((decision) => (
              <div key={decision} className="grid grid-cols-[120px_1fr] gap-3">
                <span className="text-bl-bone-4">decision</span>
                <span>{decision}</span>
              </div>
            ))}
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <span className="text-bl-bone-4">cost</span>
              <span>${(observability.cost.totalCostMicros / 1_000_000).toFixed(4)}</span>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
