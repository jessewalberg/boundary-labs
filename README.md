# Boundary Labs

Boundary Labs is the Week 3 adversarial evaluation workspace for the OpenEMR Clinical Co-Pilot. It is a separate security app/harness that targets the Clinical Co-Pilot over authorized HTTP/SSE interfaces instead of importing target code.

## Submission Map

For reviewers — every required deliverable lives at the path listed here.

| Deliverable | Path |
|---|---|
| Threat model | `./THREAT_MODEL.md` |
| Users + workflows + automation justification | `./USERS.md` |
| Multi-agent platform architecture + diagram | `./ARCHITECTURE.md` + `docs/architecture-system-map.svg` |
| AI cost analysis (actuals + projections at 100/1K/10K/100K) | `./AI_COST_ANALYSIS.md` |
| Eval dataset (3+ attack categories, reproducible) | `./evals/` (see `evals/README.md`) + `/evals` route in the deployed console |
| Vulnerability reports (≥ 3 distinct) | `./reports/vulnerabilities/` (committed markdown) + `/reports` route in the deployed console |
| Deployed adversarial platform (Boundary console) | `https://boundary-web-production.up.railway.app` |
| Deployed target (Clinical Co-Pilot) | `https://clinical-copilot.up.railway.app` |
| Provider-proof runbook | `docs/runbooks/provider-proof-campaign.md` |
| Regression harness runbook | `docs/runbooks/regression-harness.md` |

## Why a Separate Repo, Not an OpenEMR Fork

The assignment opening describes the GitHub repository as "Forked from OpenEMR." Boundary is intentionally a **separate repository attacking the OpenEMR-derived target over its authorized HTTP/SSE interfaces**, not a fork that imports target code. This is a deliberate architectural choice, documented in `ARCHITECTURE.md` lines 115 and 233-246:

1. **Trust-boundary separation.** Attack code and target code live in different processes, different repos, and different deployments. The Red Team Agent cannot reach into target internals — every attack must travel through the same authenticated channels a real adversary would use.
2. **Independent observability.** Boundary's artifacts (judge verdicts, regression cases, vulnerability reports, audit log) are owned by the attacker side and remain comparable across target versions, including future targets that are not OpenEMR-derived.
3. **No accidental coupling.** Forking OpenEMR would make it tempting to add hooks "just for testing" — instrumented tool traces, leaked internal state — that compromise the deterministic separation between attacker and target.

The deployed target Clinical Co-Pilot at `https://clinical-copilot.up.railway.app` *is* derived from OpenEMR; its repo and Railway deployment carry the OpenEMR lineage. Boundary's repo (this one) is the adversarial harness that exercises it.

## Current Status

Boundary now has the Pydantic Graph worker, persisted console state, email/password auth, provider preflight checks, strict proof artifact verification, and readiness audit gates in-repo. Final provider-backed demo readiness is intentionally **not** satisfied until live provider secrets are configured and a real proof campaign artifact passes `verify:readiness` and `audit:readiness`.

Implemented gates covered in this repo:

- `THREAT_MODEL.md` maps the Clinical Co-Pilot attack surface and begins with the required executive summary.
- `ARCHITECTURE.md` defines the multi-agent platform architecture and agent responsibilities.
- `evals/` contains structured adversarial seeds across prompt injection, authorization/data exposure, and tool misuse.
- `scripts/check_pydantic_evals.py` bridges the full seed corpus into a Pydantic Evals `Dataset` for CI-friendly corpus validation.
- `worker/graphs/campaign.py` runs campaigns through the complete Pydantic Graph chain: safety gate, coverage scoring, orchestrator, red team, target execution, judge, documentation, and artifact write.
- `worker/llm_provider.py` wires Pydantic AI agents for orchestrator, red team, judge, and documentation when `BOUNDARY_ENABLE_LLM_AGENTS=1` and provider API keys are present.
- `scripts/run_proof_campaign.py` runs the worker path and verifies the generated artifact against the full seed corpus.
- `scripts/verify_system.py --readiness` and `scripts/audit_readiness.py` are the final gates for provider-backed readiness.

Latest deterministic MVP run, kept only as historical evidence:

- Run ID: `mvp-20260512-204402`
- Target exercised: `https://clinical-copilot.up.railway.app`
- Result: 4 total, 4 pass, 0 fail, 0 partial, 0 invalid
- Deployed Co-Pilot URL: `https://clinical-copilot.up.railway.app`
- Deployed Co-Pilot `/healthz`: ok
- Deployed Co-Pilot `/readyz`: ok with FHIR, audit, LLM, and ingest polling checks passing

That MVP artifact is not provider-backed proof for the current graph system.

## Target URLs

Local target stack:

- OpenEMR: `http://localhost:8300`
- Clinical Co-Pilot: `http://localhost:8400`
- Co-Pilot liveness: `http://localhost:8400/healthz`
- Co-Pilot readiness: `http://localhost:8400/readyz`

Deployed target:

- Clinical Co-Pilot: `https://clinical-copilot.up.railway.app`
- OpenEMR service reported by Railway: `https://everybody-loves-healthcare.up.railway.app`

Deployed adversarial platform (Boundary console):

- Boundary console: `https://boundary-web-production.up.railway.app`
- Liveness: `https://boundary-web-production.up.railway.app/healthz`
- Readiness: `https://boundary-web-production.up.railway.app/readyz`

Auth: Better Auth email/password. Operator allowlist is governed by `BOUNDARY_OPERATOR_EMAIL_ALLOWLIST`; the deployed instance uses the seeded operator from `policy_seed.json`. Sign-in screen at `/login`.

## Run The Adversarial Platform Against The Live Target (UI flow)

This is the path a reviewer or new operator should follow to see Boundary attacking the deployed Clinical Co-Pilot end-to-end without touching the CLI.

1. Open `https://boundary-web-production.up.railway.app/login` and sign in.
2. Navigate to **Runs → New** (`/campaigns/new`).
3. Paste the target URL `https://clinical-copilot.up.railway.app`, select attack categories (`prompt-injection`, `authorization`, `tool-misuse` are the seeded ones), and submit. The worker picks up the queued job, acquires a SMART session via OpenEMR (`BOUNDARY_ACQUIRE_SMART_SESSION=1` on the deployed instance), and executes the full Pydantic Graph against the live target.
4. Watch the run on `/campaigns/<id>` — the seed grid streams pass/fail/partial verdicts, the pydantic graph panel shows agent connection state, and the agent timeline panel renders the ordered red-team → target → judge → documentation flow.
5. When the run completes, browse **Findings** (`/findings`) for triage and **Reports** (`/reports`) for the rendered VULN-YYYY-NNN write-ups. Each report supports `Download .md` for sharing the artifact outside the platform.
6. Promote a finding to the regression suite via **Approvals** (`/approvals`). Promoted cases live under **Regressions** (`/regressions`) and replay against future target versions.

The deployed console always points at `https://clinical-copilot.up.railway.app` by default (`BOUNDARY_TARGET_URL`). Operators with the right role can override the target URL per-campaign at launch time.

Deployment changes made to bring the target into a testable MVP state:

- Updated the deployed Clinical Co-Pilot server-to-server OpenEMR URLs to use Railway private networking:
  `http://everybody-loves-healthcare.railway.internal/apis/default`.
- Deployed the Clinical Co-Pilot subdirectory with the readiness timeout fix so `/readyz` uses
  `OPENEMR_FHIR_TIMEOUT_SECONDS` instead of the old hard-coded 1.5 second FHIR metadata timeout.
- Left browser/OAuth-facing URLs public so SMART launch still uses `https://everybody-loves-healthcare.up.railway.app`.

## Run Legacy MVP Evals

The legacy runner is still useful for direct target smoke checks, but it is not the final Boundary readiness path. Preferred authenticated path: launch Clinical Co-Pilot from OpenEMR, copy the `copilot_smart_session` cookie from the browser, then run:

```bash
python3 scripts/run_mvp_evals.py \
  --target-url http://localhost:8400 \
  --smart-session-cookie "$TARGET_SMART_SESSION_COOKIE"
```

Deployed MVP artifact path: `evals/results/mvp-20260512-204402.json`. The deployed run minted a synthetic SMART cookie inside `railway run` using the deployed `SESSION_SECRET`; the secret was not printed or written to the artifact.

Local fallback for development: mint a synthetic SMART cookie using the local dev session secret. This is acceptable only for local synthetic testing because it couples the runner to the target's dev secret and does not provide a real OpenEMR access token.

```bash
BOUNDARY_SMART_SESSION_SECRET="<local-dev-session-secret>" \
  python3 scripts/run_mvp_evals.py \
  --target-url http://localhost:8400 \
  --mint-synthetic-session \
  --timeout-seconds 45
```

The legacy runner writes `evals/results/<run_id>.json` and updates `evals/results/latest.json`. Use `scripts/run_proof_campaign.py` plus `verify:readiness` for current provider-backed proof.

## Run The Boundary Web Console

The web console is a pnpm workspace app under `apps/web`. Node 22 + pnpm are the
supported JavaScript runtime/toolchain.

```bash
pnpm install
pnpm run dev
```

Default local web URL: `http://localhost:3000`.

Useful routes:

- `GET /healthz` returns app liveness.
- `GET /readyz` checks local state paths and console configuration.
- `/dashboard` renders the authenticated persisted console dashboard.
- `/campaigns/new` queues a campaign job for the worker graph.
- `/agents` and `/readyz` expose provider/worker readiness state without printing secrets.
- `/design-system` keeps the U0 visual reference surface available.

Optional local config lives in `apps/web/.env.example`:

```bash
SQLITE_PATH=./var/boundary.db
BOUNDARY_ARTIFACT_DIR=./var/artifacts
BOUNDARY_TARGET_URL=https://clinical-copilot.up.railway.app
BOUNDARY_EVAL_RUNNER=scripts/run_mvp_evals.py
BOUNDARY_OPENEMR_URL=http://localhost:8300
BOUNDARY_OPENEMR_USERNAME=admin
BOUNDARY_OPENEMR_PASSWORD=pass
BOUNDARY_OPENEMR_PATIENT_PID=13
BOUNDARY_ACQUIRE_SMART_SESSION=0
BOUNDARY_MINT_SYNTHETIC_SESSION=0
# BOUNDARY_SMART_SESSION_SECRET=<target SESSION_SECRET for local synthetic SMART testing>
# Must equal 1 for provider-backed proof. Any other value is treated as disabled.
BOUNDARY_ENABLE_LLM_AGENTS=0
# OPENROUTER_API_KEY=<openrouter-provider-key>
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
BOUNDARY_ADAPTIVE_ATTACK_LIMIT=4
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=boundary-labs-local-development-secret-change-before-production
BOUNDARY_OWNER_EMAIL=owner@example.com
BOUNDARY_OPERATOR_EMAIL_ALLOWLIST=owner@example.com
```

The worker runs campaigns through `pydantic_graph`. LLM agent hooks use `pydantic_ai.Agent` only when `BOUNDARY_ENABLE_LLM_AGENTS=1` and `OPENROUTER_API_KEY` is present. All agent traffic is routed through OpenRouter via Pydantic AI's OpenAI-compatible adapter, using `OPENROUTER_BASE_URL` and OpenRouter model IDs. The default model is `google/gemini-2.5-flash`; set `BOUNDARY_RED_TEAM_MODEL`, `BOUNDARY_ORCHESTRATOR_MODEL`, `BOUNDARY_JUDGE_MODEL`, and `BOUNDARY_DOCUMENTATION_MODEL` to explicit OpenRouter model IDs when you want a different production allowlist. Without the enable flag and key, the graph records `deterministic-fallback` in the artifact. Each run artifact also includes `pydantic_graph.agent_connections` so operators can see whether each agent was `disabled`, `missing_secret`, `executed`, or `failed`.

Provider-backed campaigns run an adaptive red-team loop: the first Red Team pass generates executable attacks, the target runs them, target observations are sent back to Red Team, and a second Red Team pass generates follow-up attacks from what it found. `BOUNDARY_ADAPTIVE_ATTACK_LIMIT` caps those feedback-driven follow-ups per campaign. Provider-required proof verification fails if generated attacks are missing, adaptive attacks are missing, or generated prompts are placeholders.

Set `BOUNDARY_ACQUIRE_SMART_SESSION=1` when UI-queued worker campaigns should log into OpenEMR and acquire a real Clinical Co-Pilot SMART session before attacking `/conversation`. The worker uses `BOUNDARY_OPENEMR_URL`, `BOUNDARY_OPENEMR_USERNAME`, `BOUNDARY_OPENEMR_PASSWORD`, and `BOUNDARY_OPENEMR_PATIENT_PID`; the OpenEMR URL may be either the site root or the login page URL. `BOUNDARY_MINT_SYNTHETIC_SESSION=1` remains available for synthetic SMART sessions when the target session secret is shared.

The seed library is also checked through Pydantic Evals:

```bash
pnpm check:pydantic-evals
```

This builds a `pydantic_evals.Dataset` from every case in `evals/seeds`,
checks required fields and duplicate IDs, and evaluates the full corpus.

To prove provider-backed agents are connected, run:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1 \
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter \
OPENROUTER_API_KEY="..." \
pnpm check:llm-agents -- --sqlite-path apps/web/var/boundary.db
```

The command exits non-zero until every configured role returns `executed`.
To preflight local env, GitHub `demo` secrets, and Railway runtime config
without printing secret values, run:

```bash
pnpm check:provider-proof -- --github-env demo
```

The Railway project, service, and environment default from
`RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, and `RAILWAY_ENVIRONMENT`; pass
explicit `--railway-*` flags to override them. Add
`--no-mint-synthetic-session` only for proof runs that will not mint SMART
sessions.

To verify the full system gate, including worker tests, web tests, typecheck,
build, provider runtime env, provider-backed agent connectivity, and a proof
campaign artifact, run:

```bash
pnpm verify:readiness -- \
  --sqlite-path /path/to/proof-boundary.db \
  --artifact-path /path/to/completed-campaign.json \
  --expected-target-origin https://clinical-copilot.up.railway.app
```

The proof artifact must cover the complete seed library and include
`pydantic_graph.agent_connections` with `executed` status for orchestrator,
red team, judge, and documentation roles. Each result must also include
provider-backed red team and judge metadata: `provider_status: executed`,
`execution_mode` beginning with `pydantic-ai:`, non-empty provider output, and
`red_team_agent.provider_decision: applied` plus
`judge_agent.provider_decision: applied` for every case.
The artifact must also include non-empty `agent_notes` for orchestrator,
red team, judge, and documentation.
Use `--skip-llm` or `--skip-artifact` only for local development checks; those
skips do not satisfy the provider-backed demo readiness gate.
`verify:readiness` refuses skip flags, missing provider runtime env, localhost
proof targets, and missing proof DB/artifact/target-origin inputs.
For a machine-readable checklist of the same objective, run:

```bash
pnpm audit:readiness -- \
  --sqlite-path /path/to/proof-boundary.db \
  --artifact-path /path/to/completed-campaign.json \
  --expected-target-origin https://clinical-copilot.up.railway.app
```

The audit includes the same live provider connectivity requirement: every
configured Pydantic AI role must execute, not merely have an API key present.

To generate the proof artifact through the worker path, run a full proof campaign:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1 \
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter \
OPENROUTER_API_KEY="..." \
BOUNDARY_SMART_SESSION_SECRET="<target-session-secret-if-minting>" \
python scripts/run_proof_campaign.py \
  --bootstrap \
  --target-url https://clinical-copilot.up.railway.app \
  --mint-synthetic-session
```

The command prints the artifact path when verification passes.
For local or Railway runtime checks, `SECURITY_SMART_SESSION_SECRET` or
`BOUNDARY_SMART_SESSION_SECRET_FILE` can satisfy the same SMART session secret
requirement. The GitHub proof workflow maps the environment secret into
`BOUNDARY_SMART_SESSION_SECRET`.
Without `--allow-deterministic`, it first runs a provider-backed agent preflight
against the bootstrapped `agent_provider_*` policy rows and exits before touching
the target unless all configured agent roles execute. When `--output-file` is
provided, the JSON includes both `sqlite_path` and `artifact`; pass both to
`pnpm verify:readiness` with the emitted `target_origin` so the final gate checks
the same policy rows and target origin that produced the proof artifact.
`--mock-target` is only accepted with `--allow-deterministic`; provider-backed
proof must exercise a real authorized target origin.

The same provider-backed proof can be run from GitHub Actions with the
`Provider Proof Campaign` workflow. It is `workflow_dispatch` only and requires
`OPENROUTER_API_KEY` and, when synthetic SMART minting is enabled,
`BOUNDARY_SMART_SESSION_SECRET` environment secrets.

For an offline proof-runner smoke test that does not satisfy the LLM readiness
gate, use the built-in mock target:

```bash
python scripts/run_proof_campaign.py \
  --bootstrap \
  --mock-target \
  --allow-deterministic \
  --timeout-seconds 2
```

## Run The Single-Container Stack

The deployable shape is one Docker container supervised by `supervisord`: Next.js web and the Python worker run as sibling child processes. The container expects persistent state under `/data`.

```bash
docker build -t boundary-labs .
docker run --rm -p 3000:3000 \
  -v "$PWD/.local-data:/data" \
  -e BETTER_AUTH_SECRET="local-development-secret" \
  -e BOUNDARY_OWNER_EMAIL="owner@example.com" \
  boundary-labs
```

Verify:

```bash
curl -sS http://localhost:3000/healthz
curl -sS http://localhost:3000/readyz
```

Worker troubleshooting lives in `docs/runbooks/worker-troubleshooting.md`.
Provider-backed proof campaign setup lives in `docs/runbooks/provider-proof-campaign.md`.

## Target Setup

From the OpenEMR fork checkout:

```bash
cd docker/development-easy
docker compose up -d

cd ../..
docker compose -f docker/development-easy/docker-compose.yml \
  -f clinical-copilot/docker-compose.override.yml \
  up --build -d clinical-copilot
```

Verify:

```bash
curl -sS http://localhost:8400/healthz
curl -sS http://localhost:8400/readyz
```

Run a local live proof against local OpenEMR and local Clinical Co-Pilot using
the real login + SMART launch path:

```bash
set -a
source apps/web/.env.local
set +a

python scripts/run_proof_campaign.py \
  --bootstrap \
  --target-url http://localhost:8400 \
  --deployed-url http://localhost:8400 \
  --acquire-smart-session \
  --allow-local-target \
  --openemr-url http://localhost:8300 \
  --openemr-patient-pid 13 \
  --output-file var/local-live-proof-output.json
```

`--acquire-smart-session` logs into OpenEMR with
`BOUNDARY_OPENEMR_USERNAME` / `BOUNDARY_OPENEMR_PASSWORD`, launches the native
Clinical Co-Pilot module, follows the SMART OAuth redirect chain, captures the
`copilot_smart_session` cookie, and passes it to the worker. `--allow-local-target`
only relaxes the localhost artifact check; provider-backed agents are still
required unless `--allow-deterministic` is also set.

Each proof run writes three observability artifacts in the run directory:

- `<run_id>.json` — final campaign artifact and verdicts
- `<run_id>.graph.json` — Pydantic Graph persistence snapshots for resume/debug
- `<run_id>.trace.jsonl` — Boundary flow trace with graph node, agent call,
  target case, deterministic judge, provider judge, and artifact events

The artifact includes `pydantic_graph.trace_path` so the trace can be loaded
from the UI or CLI. Boundary agents also enable Pydantic AI native
instrumentation with prompt/completion content excluded by default. Set
`BOUNDARY_LOGFIRE_TOKEN` to export those spans to a Boundary-owned Logfire
project. Keep `BOUNDARY_TRACE_INCLUDE_CONTENT=0` unless the run is synthetic
and explicitly approved for content-bearing traces.

## MVP Scope Boundaries

- Synthetic data only.
- Authorized local/deployed targets only.
- The security runner does not import target app modules.
- Direct `/conversation` evals are implemented now.
- Uploaded-document indirect injection is seeded in the threat model but deferred until the Target Adapter has a browser upload path or an approved ingest test seam.
- Tool-misuse judging is semantic until the target exposes authorized tool traces across the separation boundary.
