import Link from "next/link";
import { ArrowRight, FileWarning } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";

const categories = [
  {
    title: "Prompt injection",
    sub: "direct · indirect · multi-turn",
    impact: "Unsafe clinical summaries, instruction override, hidden document compliance.",
    difficulty: "low",
    defenses: "partially covered",
    priority: "P0"
  },
  {
    title: "Data exfiltration",
    sub: "PHI leakage · cross-patient exposure",
    impact: "Unauthorized patient data disclosure and authorization bypass.",
    difficulty: "medium",
    defenses: "covered for bound-patient refusal",
    priority: "P0"
  },
  {
    title: "State corruption",
    sub: "conversation history · context poisoning",
    impact: "Persistent unsafe assumptions across turns and run artifacts.",
    difficulty: "medium",
    defenses: "needs multi-turn harness",
    priority: "P1"
  },
  {
    title: "Tool misuse",
    sub: "parameter tampering · recursive calls",
    impact: "Over-broad FHIR queries, unsafe writeback intent, uncontrolled tool scope.",
    difficulty: "medium",
    defenses: "semantic-only until tool traces land",
    priority: "P0"
  },
  {
    title: "Denial of service",
    sub: "token exhaustion · cost amplification",
    impact: "Runaway spend, latency spikes, and scheduler starvation.",
    difficulty: "low",
    defenses: "planned budget gates",
    priority: "P1"
  },
  {
    title: "Identity exploitation",
    sub: "persona hijack · privilege escalation",
    impact: "Operator trust boundary collapse and false authority claims.",
    difficulty: "medium",
    defenses: "policy seam defined",
    priority: "P1"
  }
];

export default function ThreatModelPage() {
  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// review · threat model</div>
          <h1 className="bl-h1 mt-2 uppercase">Threat Model</h1>
          <p className="mt-2 max-w-[820px] text-sm leading-6 text-bl-bone-2">
            Structured read model for the MVP assignment threat categories. The platform should use
            this as the prioritization source for red-team generation, coverage scoring, findings,
            and regression promotion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="alarm">3 P0</Chip>
          <Chip tone="amber">3 P1</Chip>
          <Chip>living document</Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
        <Panel watermark="// categories · attack surface" padded={false}>
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <article key={category.title} className="min-h-[260px] border-b border-r border-bl-line p-4 last:border-r-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Chip tone={category.priority === "P0" ? "alarm" : "amber"}>{category.priority}</Chip>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">{category.difficulty}</span>
                </div>
                <h2 className="font-mono text-sm uppercase tracking-[0.08em] text-bl-bone">{category.title}</h2>
                <div className="mt-1 font-mono text-[10px] text-bl-bone-4">{category.sub}</div>
                <p className="mt-4 text-xs leading-5 text-bl-bone-2">{category.impact}</p>
                <div className="mt-4 border border-bl-line bg-bl-trough p-2 font-mono text-[10px] text-bl-bone-3">
                  defenses · {category.defenses}
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel watermark="// architecture handoff" right={<Chip tone="cyan">MVP</Chip>}>
          <FileWarning size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="space-y-3 text-sm leading-6 text-bl-bone-2">
            <p className="m-0">Red Team consumes categories and gaps to choose the next attack surface.</p>
            <p className="m-0">Judge consumes expected safe behavior and evidence requirements.</p>
            <p className="m-0">Regression consumes promoted seeds after human approval gates.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/coverage">Coverage <ArrowRight size={11} aria-hidden="true" /></Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/agents">Agents <ArrowRight size={11} aria-hidden="true" /></Link>
            </Button>
          </div>
        </Panel>
      </section>
    </div>
  );
}
