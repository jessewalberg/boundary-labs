import { CircleDollarSign, Crosshair, KeyRound, Play, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBoundaryConfig } from "@/server/config";
import { buildEvalRunnerCommand } from "@/server/eval-runner";
import { queueCampaign } from "./actions";

const categoryOptions = [
  {
    value: "prompt-injection",
    label: "Prompt injection",
    note: "Direct, indirect, and multi-turn instruction override probes."
  },
  {
    value: "authorization",
    label: "Authorization",
    note: "Cross-patient access, PHI exposure, and role boundary checks."
  },
  {
    value: "tool-misuse",
    label: "Tool misuse",
    note: "Unbounded FHIR queries, parameter tampering, and unsafe tool intent."
  },
  {
    value: "dos-cost",
    label: "DoS / cost",
    note: "Token exhaustion, loop pressure, and cost amplification probes."
  }
];

export default function NewCampaignPage() {
  const config = getBoundaryConfig();
  const command = buildEvalRunnerCommand(config.targetUrl, config.evalRunnerPath);

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// campaign · launch</div>
          <h1 className="bl-h1 mt-2 uppercase">New campaign</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Queue a synthetic evaluation artifact for an operator-entered target. This records the exact
            runner command and campaign intent for autonomous execution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="signal">policy: operator</Chip>
          <Chip>data: synthetic</Chip>
        </div>
      </section>

      <form action={queueCampaign} className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Panel watermark="// target · operator supplied" right={<Chip tone="signal">ready</Chip>}>
          <label className="block">
            <span className="bl-watermark text-bl-bone-3">Target URL</span>
            <Input
              name="targetUrl"
              defaultValue={config.targetUrl}
              className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              required
            />
          </label>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">
            accepts any operator-entered http(s) target
          </div>
        </Panel>

        <Panel watermark="// budget · guardrail" right={<Chip tone="amber">capped</Chip>}>
          <label className="block">
            <span className="bl-watermark text-bl-bone-3">Budget cents</span>
            <Input
              name="budgetCents"
              type="number"
              min={100}
              max={10000}
              step={100}
              defaultValue={500}
              className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              required
            />
          </label>
          <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-bl-bone-3">
            <CircleDollarSign size={12} aria-hidden="true" />
            Stored on artifact now; enforced by runner later.
          </div>
        </Panel>

        <Panel watermark="// auth · openemr" right={<Chip tone="cyan">optional</Chip>} className="xl:col-span-2">
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-bl-bone">
            <input
              type="checkbox"
              name="acquireSmartSession"
              defaultChecked
              className="h-3.5 w-3.5 accent-[var(--bl-signal)]"
            />
            <KeyRound size={13} aria-hidden="true" /> Acquire SMART session before attack
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="bl-watermark text-bl-bone-3">OpenEMR URL</span>
              <Input
                name="openemrUrl"
                defaultValue={process.env.BOUNDARY_OPENEMR_URL ?? ""}
                placeholder="saved Railway value"
                className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="bl-watermark text-bl-bone-3">Site</span>
              <Input
                name="openemrSite"
                defaultValue={process.env.BOUNDARY_OPENEMR_SITE ?? "default"}
                className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="bl-watermark text-bl-bone-3">Username</span>
              <Input
                name="openemrUsername"
                defaultValue={process.env.BOUNDARY_OPENEMR_USERNAME ?? ""}
                placeholder="saved Railway value"
                className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="bl-watermark text-bl-bone-3">Patient PID</span>
              <Input
                name="openemrPatientPid"
                type="number"
                min={1}
                step={1}
                defaultValue={process.env.BOUNDARY_OPENEMR_PATIENT_PID ?? "13"}
                className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              />
            </label>
            <label className="block md:col-span-2 xl:col-span-4">
              <span className="bl-watermark text-bl-bone-3">Password override</span>
              <Input
                name="openemrPassword"
                type="password"
                placeholder="leave blank to use saved Railway secret"
                className="mt-2 h-9 bg-bl-trough font-mono text-xs"
              />
            </label>
          </div>
        </Panel>

        <Panel
          watermark="// attack categories"
          right={<Chip tone="cyan">{categoryOptions.length} available</Chip>}
          className="xl:col-span-2"
          padded={false}
        >
          <div className="grid md:grid-cols-2 xl:grid-cols-4">
            {categoryOptions.map((category, index) => (
              <label
                key={category.value}
                className="min-h-[145px] cursor-pointer border-b border-r border-bl-line px-4 py-4 transition-colors hover:bg-bl-panel-2 last:border-r-0 xl:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="categories"
                    value={category.value}
                    defaultChecked={index < 3}
                    className="mt-1 h-3.5 w-3.5 accent-[var(--bl-signal)]"
                  />
                  <div>
                    <div className="font-mono text-xs uppercase tracking-[0.1em] text-bl-bone">{category.label}</div>
                    <p className="mt-3 m-0 text-xs leading-5 text-bl-bone-2">{category.note}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="border-t border-bl-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-3">
            Leave every category unchecked to run the complete seed library.
          </div>
        </Panel>

        <Panel watermark="// deterministic command" right={<Chip>preview</Chip>} className="xl:col-span-2">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <pre className="m-0 overflow-x-auto border border-bl-line bg-bl-trough p-3 font-mono text-[11px] leading-5 text-bl-bone-2">
{`${command.scriptPath} --target-url ${command.targetUrl} --results-dir ${command.resultDir}`}
            </pre>
            <Button size="lg" className="justify-self-start lg:justify-self-end">
              <Play size={13} aria-hidden="true" /> Queue campaign
            </Button>
          </div>
          <div className="mt-4 grid gap-2 border-t border-bl-line pt-3 md:grid-cols-3">
            <Guardrail icon={<ShieldCheck size={13} aria-hidden="true" />} label="Policy" value="campaign:create" />
            <Guardrail icon={<Crosshair size={13} aria-hidden="true" />} label="Target" value="operator supplied" />
            <Guardrail icon={<Play size={13} aria-hidden="true" />} label="Execution" value="worker graph" />
          </div>
        </Panel>
      </form>
    </div>
  );
}

function Guardrail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-bl-bone-3">
      {icon}
      <span className="uppercase tracking-[0.16em] text-bl-bone-4">{label}</span>
      <span className="text-bl-bone-2">{value}</span>
    </div>
  );
}
