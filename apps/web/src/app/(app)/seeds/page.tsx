import Link from "next/link";
import { ArrowRight, Crosshair } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { seedAttempts } from "@/server/campaigns/fixtures";
import type { Verdict } from "@/components/boundary/verdict-pill";

type SeedRecord = {
  runId: string;
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "med" | "low" | "info";
  verdict: Verdict;
  judge: string;
  durationMs: number;
};

export default function SeedsPage() {
  const seeds = Object.entries(seedAttempts).flatMap(([runId, attempts]) =>
    attempts.map((attempt) => ({ runId, ...attempt }))
  ) satisfies SeedRecord[];
  const categories = Array.from(new Set(seeds.map((seed) => seed.category)));

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// workspace · seed corpus</div>
          <h1 className="bl-h1 mt-2 uppercase">Seeds</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Seed corpus view for prompts that red-team agents mutate and judges score. Current
            data comes from run fixtures; the future API should expose versioned seed records,
            parentage, and regression eligibility.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{seeds.filter((seed) => seed.verdict === "pass").length} pass</Chip>
          <Chip tone="alarm">{seeds.filter((seed) => seed.verdict === "fail").length} fail</Chip>
          <Chip>{categories.length} categories</Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Panel watermark="// corpus · grouped by category" padded={false}>
          {categories.map((category) => (
            <div key={category} className="border-b border-bl-line last:border-b-0">
              <div className="flex items-center justify-between border-b border-bl-line bg-bl-trough px-3 py-2">
                <span className="bl-watermark">{category}</span>
                <Chip>{seeds.filter((seed) => seed.category === category).length} seeds</Chip>
              </div>
              {seeds.filter((seed) => seed.category === category).map((seed) => (
                <Link
                  key={`${seed.runId}-${seed.id}`}
                  href={`/campaigns/${seed.runId}/seeds/${seed.id}`}
                  className="grid gap-3 border-b border-bl-line px-4 py-3 transition-colors hover:bg-bl-panel-2 last:border-b-0 md:grid-cols-[1fr_120px_90px_80px_14px] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-bl-bone">seed/{seed.id}</span>
                      <span className="truncate text-sm text-bl-bone-2">{seed.title}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-bl-bone-4">{seed.runId} · judge {seed.judge}</div>
                  </div>
                  <SeverityBadge severity={seed.severity} />
                  <VerdictPill verdict={seed.verdict} />
                  <span className="font-mono text-[11px] text-bl-bone-3">{(seed.durationMs / 1000).toFixed(2)}s</span>
                  <ArrowRight size={12} className="hidden text-bl-bone-3 md:block" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ))}
        </Panel>

        <Panel watermark="// lifecycle" right={<Chip tone="cyan">API seam</Chip>}>
          <Crosshair size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="space-y-3 text-sm leading-6 text-bl-bone-2">
            <p className="m-0">Seeds originate from threat model coverage, failed findings, and red-team mutations.</p>
            <p className="m-0">The next data API should track seed generation, run usage, verdict history, and regression promotion.</p>
          </div>
          <div className="mt-5 grid gap-2 font-mono text-[11px] text-bl-bone-3">
            <div>read model · seed corpus</div>
            <div>write model · human-approved promotion</div>
            <div>runner input · category + payload sequence</div>
          </div>
          <Button asChild variant="secondary" size="sm" className="mt-5">
            <Link href="/coverage">Open coverage</Link>
          </Button>
        </Panel>
      </section>
    </div>
  );
}
