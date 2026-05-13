import { ShieldCheck } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { Button } from "@/components/ui/button";
import { getBoundaryConfig } from "@/server/config";

export default function DashboardPage() {
  const config = getBoundaryConfig();

  return (
    <div>
      <section className="mb-5 flex items-start justify-between gap-8">
        <div>
          <div className="bl-eyebrow">// u1 · protected shell placeholder</div>
          <h1 className="bl-h1 mt-2">Operator dashboard</h1>
          <p className="mt-2 max-w-[720px] text-sm text-bl-bone-2">
            This route is the console entrypoint that U2 will protect with Better Auth.
            U1 verifies shell layout, local configuration, health endpoints, and server module
            boundaries before auth and campaign execution are wired in.
          </p>
        </div>
        <Chip tone="signal">
          <ShieldCheck size={12} aria-hidden="true" /> skeleton ready
        </Chip>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <Panel watermark="// local state">
          <dl className="grid gap-3 font-mono text-[11px]">
            <div>
              <dt className="text-bl-bone-4">SQLITE_PATH</dt>
              <dd className="mt-1 break-all text-bl-bone">{config.sqlitePath}</dd>
            </div>
            <div>
              <dt className="text-bl-bone-4">BOUNDARY_ARTIFACT_DIR</dt>
              <dd className="mt-1 break-all text-bl-bone">{config.artifactDir}</dd>
            </div>
          </dl>
        </Panel>

        <Panel watermark="// target">
          <dl className="grid gap-3 font-mono text-[11px]">
            <div>
              <dt className="text-bl-bone-4">BOUNDARY_TARGET_URL</dt>
              <dd className="mt-1 break-all text-bl-bone">{config.targetUrl}</dd>
            </div>
            <div>
              <dt className="text-bl-bone-4">DATA_MODE</dt>
              <dd className="mt-1 text-bl-signal">{config.dataMode}</dd>
            </div>
          </dl>
        </Panel>

        <Panel watermark="// next">
          <div className="space-y-3 text-sm text-bl-bone-2">
            <p>U2 adds Better Auth sessions, allowlist checks, and policy-backed roles.</p>
            <Button variant="secondary" disabled>
              Auth pending
            </Button>
          </div>
        </Panel>
      </section>
    </div>
  );
}
