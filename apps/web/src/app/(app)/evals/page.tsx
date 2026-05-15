import Link from "next/link";
import { ArrowRight, FileCode, FileText, FlaskConical, GitBranch } from "lucide-react";
import { Chip } from "@/components/boundary/chip";
import { EvidencePane } from "@/components/boundary/evidence-pane";
import { Panel } from "@/components/boundary/panel";
import { SeverityBadge } from "@/components/boundary/severity-badge";
import { VerdictPill } from "@/components/boundary/verdict-pill";
import { Button } from "@/components/ui/button";
import { listSeedAttemptRecords } from "@/server/attempts/repository";
import { listSeeds } from "@/server/seeds/repository";

const CATEGORY_LABEL: Record<string, string> = {
  prompt_injection: "Prompt Injection",
  authorization_bypass: "Authorization Bypass",
  tool_misuse: "Tool Misuse",
  data_exfiltration: "Data Exfiltration",
  availability_abuse: "Availability Abuse",
  state_corruption: "State Corruption",
  identity_role_exploitation: "Identity Role Exploitation"
};

function priorityFor(sourceFile: string): "P0" | "P1" | "P2" {
  if (sourceFile.includes("p0_")) return "P0";
  if (sourceFile.includes("p1_")) return "P1";
  return "P2";
}

export default function EvalsPage() {
  const seeds = listSeeds();
  const attempts = listSeedAttemptRecords();

  const latestVerdictBySeed = new Map<string, { verdict: string; runId: string }>();
  for (const attempt of attempts) {
    if (!latestVerdictBySeed.has(attempt.id)) {
      latestVerdictBySeed.set(attempt.id, { verdict: attempt.verdict, runId: attempt.runId });
    }
  }

  const grouped = new Map<string, typeof seeds>();
  for (const seed of seeds) {
    const bucket = grouped.get(seed.category) ?? [];
    bucket.push(seed);
    grouped.set(seed.category, bucket);
  }
  const categories = Array.from(grouped.keys()).sort();

  const totalSeeds = seeds.length;
  const totalCategories = categories.length;
  const exercised = seeds.filter((seed) => latestVerdictBySeed.has(seed.id)).length;
  const passes = seeds.filter((seed) => latestVerdictBySeed.get(seed.id)?.verdict === "pass").length;
  const fails = seeds.filter((seed) => latestVerdictBySeed.get(seed.id)?.verdict === "fail").length;
  const partials = seeds.filter((seed) => latestVerdictBySeed.get(seed.id)?.verdict === "partial").length;
  const coveragePct = totalSeeds > 0 ? Math.round((exercised / totalSeeds) * 100) : 0;

  return (
    <div className="pb-8">
      <section className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="bl-eyebrow">// workspace · adversarial eval suite</div>
          <h1 className="bl-h1 mt-2 uppercase">Evals</h1>
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-bl-bone-2">
            Reproducible adversarial test corpus. Each case carries category, severity,
            exploitability, expected safe behavior, success criteria, and a regression-promotion
            flag — see <code className="text-bl-bone">evals/schemas/attack_case.schema.json</code>{" "}
            for the contract. Seeds are mutated by the Red Team Agent at runtime; promoted exploits
            move to <Link href="/regressions" className="text-bl-cyan hover:text-bl-signal">Regressions</Link>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="cyan">{totalSeeds} cases</Chip>
          <Chip tone="cyan">{totalCategories} categories</Chip>
          <Chip tone={coveragePct >= 75 ? "signal" : coveragePct >= 25 ? "amber" : "muted"}>
            {coveragePct}% exercised
          </Chip>
        </div>
      </section>

      <section className="mb-4 grid overflow-hidden rounded-[var(--radius-bl-panel)] border border-bl-line bg-bl-panel md:grid-cols-5">
        <Metric label="Total cases" value={totalSeeds} />
        <Metric label="Pass" value={passes} tone="signal" />
        <Metric label="Fail" value={fails} tone={fails > 0 ? "alarm" : "muted"} />
        <Metric label="Partial" value={partials} tone={partials > 0 ? "amber" : "muted"} />
        <Metric label="Not yet run" value={totalSeeds - exercised} tone="muted" />
      </section>

      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.6fr)]">
        <Panel watermark="// eval suite · cases by category" padded={false}>
          {categories.map((category) => {
            const rows = grouped.get(category) ?? [];
            return (
              <div key={category} className="border-b border-bl-line last:border-b-0">
                <div className="flex items-center justify-between border-b border-bl-line bg-bl-trough px-3 py-2">
                  <span className="bl-watermark">{CATEGORY_LABEL[category] ?? category}</span>
                  <span className="font-mono text-[10px] text-bl-bone-4">{rows.length} cases</span>
                </div>
                {rows.map((seed) => {
                  const verdict = latestVerdictBySeed.get(seed.id);
                  const priority = priorityFor(seed.source_file);
                  return (
                    <article
                      key={seed.id}
                      className="grid gap-3 border-b border-bl-line px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-bl-bone">{seed.id}</span>
                          <SeverityBadge severity={seed.severity} />
                          <Chip
                            tone={priority === "P0" ? "alarm" : priority === "P1" ? "amber" : "muted"}
                          >
                            {priority}
                          </Chip>
                          {verdict ? (
                            <VerdictPill verdict={verdict.verdict as never} />
                          ) : (
                            <Chip tone="muted">not yet run</Chip>
                          )}
                        </div>
                        <h3 className="m-0 truncate text-sm font-medium text-bl-bone">
                          {seed.title}
                        </h3>
                        <div className="mt-2 font-mono text-[10px] text-bl-bone-4">
                          src/{seed.source_file.replace(/^\.\.\/\.\.\//, "")} ·{" "}
                          {verdict ? `last run/${verdict.runId}` : "no recorded attempt"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/seeds/${encodeURIComponent(seed.id)}`}>
                            Open <ArrowRight size={11} aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}
        </Panel>

        <div className="grid gap-4">
          <Panel
            watermark="// reproducibility"
            right={<Chip tone="cyan">CLI</Chip>}
          >
            <div className="grid gap-4 text-sm leading-6 text-bl-bone-2">
              <section>
                <div className="bl-watermark">// run the suite locally</div>
                <EvidencePane
                  label="bash"
                  className="mt-2"
                  value={`pnpm check:pydantic-evals\n# loads every case in evals/seeds, validates schema,\n# evaluates the corpus end to end`}
                />
              </section>
              <section>
                <div className="bl-watermark">// run against deployed target</div>
                <EvidencePane
                  label="bash"
                  className="mt-2"
                  value={`python scripts/run_proof_campaign.py \\\n  --bootstrap \\\n  --target-url https://clinical-copilot.up.railway.app \\\n  --mint-synthetic-session`}
                />
              </section>
              <p className="text-xs text-bl-bone-3">
                Results land in <code>evals/results/&lt;run_id&gt;.json</code> with{" "}
                <code>verify:readiness</code> as the final gate. See{" "}
                <code>docs/runbooks/provider-proof-campaign.md</code>.
              </p>
            </div>
          </Panel>

          <Panel watermark="// artifacts">
            <ul className="m-0 grid gap-3 font-mono text-[11px] text-bl-bone-2">
              <li className="flex items-start gap-2">
                <FlaskConical size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/seeds/p0_mvp_cases.json</span>
                  <br />
                  <span className="text-bl-bone-4">P0 corpus — required for the 3-category hard gate</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FlaskConical size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/seeds/p1_live_chat_break_cases.json</span>
                  <br />
                  <span className="text-bl-bone-4">P1 corpus — data exfiltration, availability abuse, advanced injection</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileCode size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/schemas/attack_case.schema.json</span>
                  <br />
                  <span className="text-bl-bone-4">Case contract — every seed validates against this</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileCode size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/schemas/judge_verdict.schema.json</span>
                  <br />
                  <span className="text-bl-bone-4">Judge output contract</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <GitBranch size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/results/latest.json</span>
                  <br />
                  <span className="text-bl-bone-4">Most recent run artifact (run summary, verdicts, evidence)</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileText size={12} className="mt-0.5 text-bl-bone-3" aria-hidden="true" />
                <span>
                  <span className="text-bl-bone">evals/README.md</span>
                  <br />
                  <span className="text-bl-bone-4">Suite overview, schemas, reproduction guide</span>
                </span>
              </li>
            </ul>
          </Panel>

          <Panel watermark="// crosswalks">
            <ul className="m-0 grid gap-3 text-sm leading-6 text-bl-bone-2">
              <li>
                <Link href="/coverage" className="hover:text-bl-signal">
                  Coverage map →
                </Link>{" "}
                <span className="text-bl-bone-4">cases per threat-model category</span>
              </li>
              <li>
                <Link href="/threat-model" className="hover:text-bl-signal">
                  Threat model →
                </Link>{" "}
                <span className="text-bl-bone-4">attack surface + OWASP/ATLAS mapping</span>
              </li>
              <li>
                <Link href="/regressions" className="hover:text-bl-signal">
                  Regressions →
                </Link>{" "}
                <span className="text-bl-bone-4">promoted exploits replayed against new target versions</span>
              </li>
              <li>
                <Link href="/campaigns" className="hover:text-bl-signal">
                  Runs →
                </Link>{" "}
                <span className="text-bl-bone-4">launch a new eval campaign</span>
              </li>
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "bone"
}: {
  label: string;
  value: number;
  tone?: "bone" | "signal" | "alarm" | "amber" | "muted";
}) {
  const color =
    tone === "signal"
      ? "text-bl-signal"
      : tone === "alarm"
        ? "text-bl-alarm"
        : tone === "amber"
          ? "text-bl-amber"
          : tone === "muted"
            ? "text-bl-bone-4"
            : "text-bl-bone";
  return (
    <div className="border-r border-bl-line px-[18px] py-3.5 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-bl-bone-3">{label}</div>
      <div className={`mt-1 font-mono text-3xl leading-none tracking-[-0.02em] ${color}`}>
        {value}
      </div>
    </div>
  );
}
