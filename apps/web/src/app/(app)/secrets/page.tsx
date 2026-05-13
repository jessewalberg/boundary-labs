import { KeyRound } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";

const secrets = [
  { name: "RAILWAY_TOKEN", scope: "deploy", state: "configured", unlocks: "GitLab main deploy to Railway" },
  { name: "RAILWAY_PROJECT_ID", scope: "deploy", state: "configured", unlocks: "Project targeting" },
  { name: "RAILWAY_SERVICE_ID", scope: "deploy", state: "configured", unlocks: "boundary-web service deploy" },
  { name: "SQLITE_PATH", scope: "runtime", state: "configured", unlocks: "persistent local database path" },
  { name: "BOUNDARY_ARTIFACT_DIR", scope: "runtime", state: "configured", unlocks: "campaign artifacts and eval output" },
  { name: "BOUNDARY_TARGET_URL", scope: "runtime", state: "configured", unlocks: "default target adapter URL" },
  { name: "BETTER_AUTH_SECRET", scope: "auth", state: "planned", unlocks: "future Better Auth session signing" }
];

export default function SecretsPage() {
  return (
    <div className="pb-8">
      <section className="mb-5">
        <div className="bl-eyebrow">// system · secrets</div>
        <h1 className="bl-h1 mt-2 uppercase">Secrets</h1>
        <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
          Masked configuration inventory. This page names required environment seams and what they
          unlock, without reading or exposing secret values.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Panel watermark="// environment · masked" padded={false}>
          {secrets.map((secret) => (
            <div key={secret.name} className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[220px_110px_110px_1fr] md:items-center">
              <span className="font-mono text-xs text-bl-bone">{secret.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bl-bone-4">{secret.scope}</span>
              <Chip tone={secret.state === "configured" ? "signal" : "muted"}>{secret.state}</Chip>
              <span className="text-xs text-bl-bone-2">{secret.unlocks}</span>
            </div>
          ))}
        </Panel>

        <Panel watermark="// access model" right={<Chip tone="amber">future auth</Chip>}>
          <KeyRound size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <p className="m-0 text-sm leading-6 text-bl-bone-2">
            Runtime secrets should stay in Railway/GitLab. The application API should expose only
            derived readiness state, masked names, and policy outcomes to operators.
          </p>
          <div className="mt-5 grid gap-2 font-mono text-[11px] text-bl-bone-3">
            <div>viewer · names only</div>
            <div>operator · readiness state</div>
            <div>admin · rotate out-of-band</div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
