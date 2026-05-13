import { Crosshair } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { WorkerHealthTile } from "@/components/boundary/worker-health-tile";
import { getBoundaryConfig } from "@/server/config";
import { listTargetHealth } from "@/server/targets/repository";
import { getWorkerHealthSnapshot } from "@/server/worker-health/repository";

export default function TargetsPage() {
  const config = getBoundaryConfig();
  const targetHealth = listTargetHealth();
  const workerHealth = getWorkerHealthSnapshot({ config });
  const healthy = targetHealth.filter((check) => check.state === "ok").length;

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// system · target boundary</div>
          <h1 className="bl-h1 mt-2 uppercase">Targets</h1>
          <p className="mt-2 max-w-[780px] text-sm leading-6 text-bl-bone-2">
            Read-only target inventory for the Clinical Co-Pilot and its adapter seams. The API
            should eventually own health polling, allowlist changes, and adapter evidence capture.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="signal">{healthy}/{targetHealth.length} ok</Chip>
          <Chip>{config.dataMode}</Chip>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Panel watermark="// clinical-copilot · health" right={<Chip tone="signal">railway</Chip>} padded={false}>
          {targetHealth.map((check) => (
            <div key={check.name} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[12px_170px_1fr_80px_90px] md:items-center">
              <span className={`h-2 w-2 rounded-full ${check.state === "ok" ? "bg-bl-signal shadow-[0_0_6px_var(--bl-signal)]" : check.state === "warn" ? "bg-bl-amber" : "bg-bl-bone-4"}`} />
              <span className="font-mono text-xs text-bl-bone">{check.name}</span>
              <span className="text-xs text-bl-bone-2">{check.note}</span>
              <span className="font-mono text-[11px] text-bl-bone-3">{check.ms == null ? "--" : `${check.ms}ms`}</span>
              <Chip tone={check.state === "ok" ? "signal" : check.state === "warn" ? "amber" : "muted"}>{check.state}</Chip>
            </div>
          ))}
        </Panel>

        <div className="grid gap-4">
          <WorkerHealthTile snapshot={workerHealth} />

          <Panel watermark="// adapter config" right={<Chip tone="cyan">read-only</Chip>}>
            <Crosshair size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
            <div className="grid gap-3 font-mono text-[11px] text-bl-bone-2">
              <Row label="target_url" value={config.targetUrl} />
              <Row label="allowlist" value={config.targetAllowlist.join(", ")} />
              <Row label="artifact_dir" value={config.artifactDir} />
              <Row label="sqlite_path" value={config.sqlitePath} />
              <Row label="eval_runner" value={config.evalRunnerPath} />
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="text-bl-bone-4">{label}</span>
      <span className="break-all text-bl-bone-2">{value}</span>
    </div>
  );
}
