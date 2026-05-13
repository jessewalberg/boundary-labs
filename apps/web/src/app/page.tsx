import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Braces,
  Gauge,
  Network,
  ShieldCheck,
} from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { boundaryRuns, getSeedsForRun, threatCoverage } from "@/server/campaigns/fixtures";

const threats = [
  {
    index: "01",
    severity: "critical" as const,
    title: "Prompt injection that survives normal QA",
    body: "Direct, indirect, and multi-turn attacks become reproducible seeds instead of one-off screenshots.",
    example: "hidden html comment -> semantic judge -> regression candidate"
  },
  {
    index: "02",
    severity: "high" as const,
    title: "Cross-patient drift and PHI exposure",
    body: "Every run records target, patient scope, expected refusal, observed behavior, and exploitability.",
    example: "patient/9999 -> bound context refusal -> artifact"
  },
  {
    index: "03",
    severity: "med" as const,
    title: "Tool misuse before it reaches operators",
    body: "The harness turns unsafe tool calls, over-broad queries, and recursive behavior into repeatable checks.",
    example: "Observation search -> scope cap -> pass/fail verdict"
  }
];

const stages = [
  { label: "Red Team", icon: Bot, tone: "alarm" as const, text: "Generate and mutate adversarial seeds from the threat model." },
  { label: "Target Adapter", icon: Network, tone: "cyan" as const, text: "Exercise only approved target URLs and preserve run evidence." },
  { label: "Judge", icon: ShieldCheck, tone: "signal" as const, text: "Score target behavior against explicit safe-response criteria." },
  { label: "Regression", icon: Braces, tone: "default" as const, text: "Promote high-signal cases into deterministic repeat runs." }
];

export default function HomePage() {
  const latestRun = boundaryRuns[0];
  const seeds = getSeedsForRun(latestRun.id);

  return (
    <main className="min-h-screen bg-bl-void text-bl-bone">
      <header className="sticky top-0 z-30 border-b border-bl-line bg-[rgba(6,7,10,0.82)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/brand/logo-mark.svg" alt="" className="h-6 w-6" />
            <span className="font-mono text-[13px] font-semibold tracking-[-0.01em]">
              BOUNDARY <span className="font-normal text-bl-bone-3">LABS</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bl-bone-2 md:flex">
            <a href="#threats" className="hover:text-bl-bone">Threats</a>
            <a href="#architecture" className="hover:text-bl-bone">Architecture</a>
            <a href="#coverage" className="hover:text-bl-bone">Coverage</a>
          </nav>
          <div className="flex items-center gap-2">
            <Chip tone="signal" className="hidden sm:inline-flex">deployed</Chip>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Open console</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-bl-line bg-[url('/brand/grid-dark.svg')] bg-[length:32px_32px]">
        <div className="pointer-events-none absolute right-[-140px] top-12 h-[540px] w-[540px] bg-[url('/brand/target-reticle.svg')] bg-contain bg-center bg-no-repeat opacity-[0.08]" />
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:py-24">
          <div className="relative">
            <div className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bl-bone-3">
              <span className="h-px w-7 bg-bl-alarm" />
              Agentic AI needs adversarial evidence
            </div>
            <h1 className="font-mono text-[48px] font-medium uppercase leading-[0.98] tracking-[-0.035em] text-bl-bone sm:text-[72px] xl:text-[88px]">
              Falsify
              <br />
              <span className="text-bl-alarm">before</span>
              <span className="text-bl-bone-4"> / </span>
              <span className="text-bl-signal">live</span>
            </h1>
            <p className="mt-8 max-w-[600px] text-[16px] leading-7 text-bl-bone-2 sm:text-[17px]">
              Boundary Labs runs repeatable adversarial evaluations against live AI systems, turning red-team probes
              into evidence, verdicts, and regression coverage.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="signal" className="text-black">
                <Link href="/dashboard">
                  <Gauge size={13} aria-hidden="true" /> Open dashboard
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/campaigns">
                  View runs <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-12 grid max-w-[680px] grid-cols-2 gap-5 border-t border-bl-line pt-5 sm:grid-cols-4">
              <HeroFact label="Target" value="clinical-copilot" />
              <HeroFact label="Mode" value="authorized live" tone="signal" />
              <HeroFact label="Seeds" value="42 probed" />
              <HeroFact label="Output" value="regression JSON" />
            </div>
          </div>

          <LiveRunCard runId={latestRun.id} seeds={seeds.slice(0, 4)} />
        </div>
      </section>

      <section className="border-b border-bl-line bg-bl-graphite">
        <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-7 sm:px-8 lg:grid-cols-[220px_1fr] lg:items-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-bl-bone-3">Built for evidence</div>
          <div className="grid gap-px border-l border-bl-line md:grid-cols-5">
            {["live targets", "seed artifacts", "judge verdicts", "approval gates", "cost controls"].map((item) => (
              <div key={item} className="border-r border-bl-line px-4 py-1 font-mono text-xs text-bl-bone-2">
                <span className="mr-2 border border-bl-line-2 px-1 py-px text-[9px] uppercase tracking-[0.18em] text-bl-bone-4">
                  ok
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="threats" className="border-b border-bl-line">
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8">
          <SectionHead
            label="attack surface"
            title="Find the failure modes your normal tests miss."
            text="The MVP focuses on prompt injection, authorization exposure, and tool misuse because those categories carry the highest risk for the Clinical Co-Pilot target."
          />
          <div className="grid border border-bl-line bg-bl-panel lg:grid-cols-3">
            {threats.map((threat) => (
              <article key={threat.index} className="border-b border-bl-line p-7 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <div className="mb-5 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-bl-bone-3">
                  <span>{threat.index}</span>
                  <SeverityBadge severity={threat.severity} />
                </div>
                <h3 className="font-mono text-[22px] font-medium leading-tight tracking-[-0.015em]">{threat.title}</h3>
                <p className="mt-4 text-[13.5px] leading-6 text-bl-bone-2">{threat.body}</p>
                <div className="mt-6 border border-bl-line bg-bl-trough px-3 py-2 font-mono text-[11px] text-bl-bone-2">
                  <span className="text-bl-alarm">probe</span> -&gt; {threat.example}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="architecture" className="border-b border-bl-line">
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8">
          <SectionHead
            label="evaluation loop"
            title="Agents operate inside a controlled harness, not around it."
            text="Generation, execution, judging, and regression promotion are separated so autonomous behavior has clear inputs, outputs, logs, and approval gates."
          />
          <div className="grid gap-4 border border-bl-line bg-bl-panel bg-[url('/brand/grid-dark.svg')] bg-[length:32px_32px] p-5 lg:grid-cols-4">
            {stages.map((stage) => {
              const Icon = stage.icon;
              return (
                <Panel key={stage.label} className="bg-bl-graphite" watermark={`// ${stage.label.toLowerCase()}`} right={<Chip tone={stage.tone}>{stage.label}</Chip>}>
                  <Icon size={22} className="mb-5 text-bl-bone-3" aria-hidden="true" />
                  <p className="m-0 text-sm leading-6 text-bl-bone-2">{stage.text}</p>
                </Panel>
              );
            })}
          </div>
        </div>
      </section>

      <section id="coverage" className="border-b border-bl-line">
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-8">
          <SectionHead
            label="coverage"
            title="Threat model sections become measurable run coverage."
            text="Coverage stays visible so the team can tell which risks are tested, which are semantic-only, and which are deferred until target adapters expose the right evidence."
          />
          <div className="grid border border-bl-line bg-bl-panel md:grid-cols-5">
            {threatCoverage.map((coverage) => {
              const pct = coverage.passRate == null ? 0 : Math.round(coverage.passRate * 100);
              return (
                <div key={coverage.section} className="border-b border-bl-line px-4 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bl-bone-3">{coverage.section}</span>
                    <Chip tone={coverage.status === "covered" ? "signal" : coverage.status === "deferred" ? "muted" : "amber"}>
                      {coverage.status}
                    </Chip>
                  </div>
                  <div className="min-h-10 font-mono text-xs text-bl-bone">{coverage.title}</div>
                  <div className="mt-4 h-1.5 bg-bl-trough">
                    <div className="h-full bg-bl-signal shadow-[0_0_8px_var(--bl-signal)]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 font-mono text-[10px] text-bl-bone-3">
                    <span className="text-bl-bone">{coverage.passRate == null ? "--" : `${pct}%`}</span> · {coverage.seedCount} seeds
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-10 font-mono text-[10px] uppercase tracking-[0.18em] text-bl-bone-4 sm:px-8 md:flex-row md:items-center md:justify-between">
        <span>Boundary Labs // adversarial evaluation console</span>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-bl-bone-2 hover:text-bl-bone">
          Enter console <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}

function HeroFact({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-4">{label}</div>
      <div className={`mt-1 font-mono text-xs ${tone === "signal" ? "text-bl-signal" : "text-bl-bone"}`}>{value}</div>
    </div>
  );
}

function LiveRunCard({
  runId,
  seeds
}: {
  runId: string;
  seeds: ReturnType<typeof getSeedsForRun>;
}) {
  return (
    <Panel
      className="relative border-bl-line-2 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
      padded={false}
      watermark="// live run"
      right={<Chip tone="signal">sealed</Chip>}
    >
      <div className="px-[18px] py-4">
        <div className="font-mono text-base tracking-[-0.01em] text-bl-bone">{runId}</div>
        <div className="mt-1 font-mono text-[11px] text-bl-bone-3">clinical-copilot.up.railway.app</div>
        <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-[var(--radius-bl)] border border-bl-line">
          <RunMetric label="Pass" value="4" tone="signal" />
          <RunMetric label="Fail" value="0" />
          <RunMetric label="Part" value="0" />
          <RunMetric label="Wall" value="11.4s" />
        </div>
        <div className="mt-4 border border-bl-line bg-bl-graphite">
          {seeds.map((seed) => (
            <div key={seed.id} className="grid grid-cols-[3px_1fr_auto_auto] items-center gap-3 border-b border-bl-line px-3 py-2 last:border-b-0">
              <span className="h-5 w-[3px] bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]" />
              <div>
                <div className="font-mono text-[11px] text-bl-bone">seed/{seed.id}</div>
                <div className="font-mono text-[10px] text-bl-bone-3">{seed.category}</div>
              </div>
              <span className="font-mono text-[10px] text-bl-bone-2">{(seed.durationMs / 1000).toFixed(2)}s</span>
              <VerdictPill verdict={seed.verdict} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-bl-line bg-bl-trough px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-3">
        <span>artifact ready</span>
        <Link href={`/campaigns/${runId}`} className="inline-flex items-center gap-1 text-bl-bone-2 hover:text-bl-bone">
          inspect <ArrowRight size={11} aria-hidden="true" />
        </Link>
      </div>
    </Panel>
  );
}

function RunMetric({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div className="border-r border-bl-line bg-bl-graphite px-3 py-2 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-3">{label}</div>
      <div className={`mt-1 font-mono text-[22px] leading-none ${tone === "signal" ? "text-bl-signal drop-shadow-[0_0_10px_currentColor]" : "text-bl-bone"}`}>
        {value}
      </div>
    </div>
  );
}

function SectionHead({ label, title, text }: { label: string; title: string; text: string }) {
  return (
    <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bl-bone-3">
          <span className="h-px w-6 bg-bl-alarm" />
          {label}
        </div>
        <h2 className="mt-3 max-w-[760px] font-mono text-[34px] font-medium leading-tight tracking-[-0.025em] sm:text-[44px]">
          {title}
        </h2>
      </div>
      <p className="m-0 max-w-[470px] text-sm leading-6 text-bl-bone-2">{text}</p>
    </div>
  );
}
