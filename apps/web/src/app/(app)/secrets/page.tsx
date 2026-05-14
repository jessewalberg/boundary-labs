import { KeyRound } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { Panel } from "@/components/boundary/panel";
import { getBoundaryConfig } from "@/server/config";

export default function SecretsPage() {
  const config = getBoundaryConfig();
  const secrets = [
    { name: "BETTER_AUTH_SECRET", scope: "auth", configured: config.betterAuthSecret.length > 0, unlocks: "session signing" },
    { name: "BETTER_AUTH_URL", scope: "auth", configured: Boolean(config.betterAuthUrl), unlocks: "canonical auth origin" },
    { name: "BAA_DOCUMENT_HASH", scope: "policy", configured: Boolean(config.baaDocumentHash), unlocks: "BAA acknowledgement gate" },
    { name: "OPENROUTER_API_KEY", scope: "worker", configured: config.workerSecrets.openrouterApiKeyConfigured, unlocks: "OpenRouter agent provider" },
    { name: "SQLITE_PATH", scope: "runtime", configured: Boolean(config.sqlitePath), unlocks: "persistent local database path" },
    { name: "BOUNDARY_ARTIFACT_DIR", scope: "runtime", configured: Boolean(config.artifactDir), unlocks: "campaign artifacts and eval output" },
    { name: "BOUNDARY_TARGET_URL", scope: "runtime", configured: Boolean(config.targetUrl), unlocks: "default target adapter URL" }
  ];

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
              <Chip tone={secret.configured ? "signal" : "amber"}>{secret.configured ? "configured" : "missing"}</Chip>
              <span className="text-xs text-bl-bone-2">{secret.unlocks}</span>
            </div>
          ))}
        </Panel>

        <Panel watermark="// rotation" right={<Chip tone="amber">admin</Chip>}>
          <KeyRound size={22} className="mb-4 text-bl-bone-3" aria-hidden="true" />
          <p className="m-0 text-sm leading-6 text-bl-bone-2">
            Runtime secrets stay in Railway and GitHub. The application API exposes only
            derived readiness state, masked names, and policy outcomes to operators.
          </p>
          <details className="mt-5 border-t border-bl-line pt-4">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-bl-bone">
              Rotation drawer
            </summary>
            <div className="mt-3 grid gap-2 font-mono text-[11px] text-bl-bone-3">
              <div>1. rotate in provider console</div>
              <div>2. update Railway variable</div>
              <div>3. redeploy container</div>
              <div>4. verify /readyz and worker heartbeat</div>
            </div>
          </details>
        </Panel>
      </section>
    </div>
  );
}
