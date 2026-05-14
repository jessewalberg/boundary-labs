import { Bot, Network, ShieldCheck } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { listAgentStatuses } from "@/server/agents/repository";

const roleCards = [
  { role: "Red Team", icon: Bot, input: "Threat model gaps + seed corpus", output: "Attack candidates and mutated payloads", owner: "attack generation" },
  { role: "Orchestrator", icon: Network, input: "Coverage state + queue policy", output: "Next target decision and run plan", owner: "coordination" },
  { role: "Judge", icon: ShieldCheck, input: "Prompt, response, expected behavior", output: "Verdict, rationale, exploitability", owner: "evaluation" }
];

export default function AgentsPage() {
  const agents = listAgentStatuses();

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// workspace · agents</div>
          <h1 className="bl-h1 mt-2 uppercase">Agents</h1>
          <p className="mt-2 max-w-[820px] text-sm leading-6 text-bl-bone-2">
            Agent role map aligned to the latest ingested graph artifact. Provider, model, and
            execution state are read from worker-reported Pydantic Graph connections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{agents.filter((agent) => agent.status === "live").length} live</Chip>
          <Chip>{agents.length} roles</Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel watermark="// active agents" padded={false}>
          {agents.length > 0 ? (
            agents.map((agent) => (
              <div key={agent.name} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[3px_1fr_90px_90px] md:items-center">
                <span className={`h-10 w-[3px] ${agent.tone === "alarm" ? "bg-bl-alarm shadow-[0_0_6px_var(--bl-alarm)]" : agent.tone === "cyan" ? "bg-bl-cyan shadow-[0_0_6px_var(--bl-cyan)]" : "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]"}`} />
                <div>
                  <div className="font-mono text-xs text-bl-bone">{agent.name}</div>
                  <div className="mt-1 text-xs text-bl-bone-3">{agent.task}</div>
                </div>
                <Chip tone={agent.status === "live" ? "signal" : "muted"}>{agent.status}</Chip>
                <span className="font-mono text-[11px] text-bl-bone-3">seeds {agent.seeds ?? "--"}</span>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-bl-bone-3">
              No active worker agents have reported status yet.
            </div>
          )}
        </Panel>

        <Panel watermark="// architecture roles" padded={false}>
          {roleCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.role} className="border-b border-bl-line px-4 py-4 last:border-b-0">
                <div className="mb-3 flex items-center gap-2">
                  <Icon size={16} className="text-bl-bone-3" aria-hidden="true" />
                  <h2 className="m-0 font-mono text-xs uppercase tracking-[0.12em] text-bl-bone">{card.role}</h2>
                  <Chip className="ml-auto">{card.owner}</Chip>
                </div>
                <div className="grid gap-2 font-mono text-[11px] text-bl-bone-2">
                  <div><span className="text-bl-bone-4">input · </span>{card.input}</div>
                  <div><span className="text-bl-bone-4">output · </span>{card.output}</div>
                </div>
              </article>
            );
          })}
        </Panel>
      </section>
    </div>
  );
}
