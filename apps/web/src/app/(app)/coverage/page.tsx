import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import { listThreatCoverage } from "@/server/coverage/query";
import { listFindings } from "@/server/findings/repository";

export default function CoveragePage() {
  const threatCoverage = listThreatCoverage();
  const findings = listFindings();
  const covered = threatCoverage.filter((item) => item.status === "covered").length;
  const gaps = threatCoverage.length - covered;

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// review · threat coverage</div>
          <h1 className="bl-h1 mt-2 uppercase">Coverage</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Coverage maps the MVP threat model to executable seeds, semantic-only checks, and
            deferred adapter gaps. This is the bridge between assignment threat modeling and the
            regression harness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{covered} covered</Chip>
          <Chip tone={gaps ? "amber" : "signal"}>{gaps} gaps</Chip>
        </div>
      </section>

      <Panel watermark="// matrix · threat_model.md" padded={false} className="mb-4">
        <div className="grid md:grid-cols-5">
          {threatCoverage.map((coverage) => {
            const pct = coverage.passRate == null ? 0 : Math.round(coverage.passRate * 100);
            return (
              <article key={coverage.section} className="border-b border-r border-bl-line p-4 last:border-r-0 md:border-b-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bl-bone-3">{coverage.section}</span>
                  <Chip tone={coverage.status === "covered" ? "signal" : coverage.status === "deferred" ? "muted" : "amber"}>
                    {coverage.status}
                  </Chip>
                </div>
                <h2 className="min-h-10 font-mono text-xs text-bl-bone">{coverage.title}</h2>
                <div className="mt-4 h-1.5 bg-bl-trough">
                  <div
                    className={`h-full ${
                      coverage.status === "covered"
                        ? "bg-bl-signal shadow-[0_0_8px_var(--bl-signal)]"
                        : coverage.status === "deferred"
                          ? "bg-bl-bone-4"
                          : "bg-bl-amber"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-3 font-mono text-[10px] text-bl-bone-3">
                  <span className="text-bl-bone">{coverage.passRate == null ? "--" : `${pct}%`}</span> · {coverage.seedCount} seeds
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel watermark="// gaps · next adapters" right={<Chip tone="amber">prioritized</Chip>}>
          <div className="grid gap-3">
            {threatCoverage.filter((item) => item.status !== "covered").map((item) => (
              <div key={item.section} className="grid gap-2 border border-bl-line bg-bl-trough p-3 md:grid-cols-[110px_1fr_auto] md:items-center">
                <span className="font-mono text-xs text-bl-bone">{item.section}</span>
                <span className="text-sm text-bl-bone-2">{item.title}</span>
                <Chip tone={item.status === "deferred" ? "muted" : "amber"}>{item.status}</Chip>
              </div>
            ))}
          </div>
        </Panel>

        <Panel watermark="// evidence links">
          <Radar size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="space-y-3 text-sm leading-6 text-bl-bone-2">
            <p className="m-0">Open findings are the quickest signal that coverage exists but defenses remain weak.</p>
            <p className="m-0">Deferred categories should not disappear; they stay visible until target adapters expose reliable evidence.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/findings">Findings <ArrowRight size={11} aria-hidden="true" /></Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/seeds">Seeds <ArrowRight size={11} aria-hidden="true" /></Link>
            </Button>
          </div>
          <div className="mt-5 font-mono text-[10px] text-bl-bone-4">
            open findings · {findings.filter((finding) => finding.status === "open").length}
          </div>
        </Panel>
      </section>
    </div>
  );
}
