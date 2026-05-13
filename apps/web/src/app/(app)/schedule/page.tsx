import { History } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";

const windows = [
  { time: "00:00 UTC", mode: "scheduler", status: "enabled", scope: "MVP regression seeds" },
  { time: "03:00 UTC", mode: "scheduler", status: "enabled", scope: "Prompt injection + authz" },
  { time: "06:00 UTC", mode: "scheduler", status: "enabled", scope: "Tool misuse semantic checks" },
  { time: "manual", mode: "operator", status: "gated", scope: "New campaign form" }
];

export default function SchedulePage() {
  return (
    <div className="pb-8">
      <section className="mb-5">
        <div className="bl-eyebrow">// system · scheduler</div>
        <h1 className="bl-h1 mt-2 uppercase">Schedule</h1>
        <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
          Read-only scheduling plan for recurring adversarial evaluation. The runner API will own
          job locks, timeout enforcement, and campaign status transitions.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Panel watermark="// windows · next 24h" padded={false}>
          {windows.map((window) => (
            <div key={`${window.time}-${window.mode}`} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[120px_120px_100px_1fr] md:items-center">
              <span className="font-mono text-xs text-bl-bone">{window.time}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">{window.mode}</span>
              <Chip tone={window.status === "enabled" ? "signal" : "amber"}>{window.status}</Chip>
              <span className="text-xs text-bl-bone-2">{window.scope}</span>
            </div>
          ))}
        </Panel>

        <Panel watermark="// execution gates" right={<Chip tone="cyan">planned</Chip>}>
          <History size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <div className="space-y-3 text-sm leading-6 text-bl-bone-2">
            <p className="m-0">One live campaign should run at a time until queue isolation exists.</p>
            <p className="m-0">Human approval gates sit before new target URLs, regression promotion, and destructive tool adapters.</p>
            <p className="m-0">Cost and timeout limits should be deterministic runner controls, not model instructions.</p>
          </div>
        </Panel>
      </section>
    </div>
  );
}
