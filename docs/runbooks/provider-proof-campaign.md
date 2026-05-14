# Provider Proof Campaign Runbook

Use this runbook to turn the implemented Boundary worker graph into a verified provider-backed demo. Do not treat deterministic fallback runs as final demo readiness.

## Required Configuration

Set these values in every runtime that should produce provider-backed artifacts:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter
OPENROUTER_API_KEY=<OpenRouter provider key>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
BOUNDARY_SMART_SESSION_SECRET=<Clinical Co-Pilot SESSION_SECRET, only if minting synthetic SMART sessions>
```

Provider selection comes from the `agent_provider_orchestrator`,
`agent_provider_red_team`, `agent_provider_judge`, and
`agent_provider_documentation` policy rows, which default to `openrouter`.
OpenRouter models should use OpenRouter model IDs. The default is
`google/gemini-2.5-flash`; for production proofs, set explicit per-role model
IDs in `BOUNDARY_RED_TEAM_MODEL`, `BOUNDARY_ORCHESTRATOR_MODEL`,
`BOUNDARY_JUDGE_MODEL`, and `BOUNDARY_DOCUMENTATION_MODEL` so the runbook and
artifact show the intended model routing.

`SECURITY_SMART_SESSION_SECRET` or `BOUNDARY_SMART_SESSION_SECRET_FILE` can
satisfy the same SMART session secret requirement in local/Railway runtime
checks. The GitHub proof workflow expects the environment secret named
`BOUNDARY_SMART_SESSION_SECRET` and maps it into the worker environment.

For GitHub Actions, configure them on the `demo` environment as secrets:

```bash
gh secret set OPENROUTER_API_KEY --env demo
gh secret set BOUNDARY_SMART_SESSION_SECRET --env demo
```

For Railway, set them on the Boundary service environment. Verify presence without printing values:

```bash
pnpm check:provider-proof -- --github-env demo
```

The command reports only presence/absence, not secret values. Railway project,
service, and environment default from `RAILWAY_PROJECT_ID`,
`RAILWAY_SERVICE_ID`, and `RAILWAY_ENVIRONMENT`; pass explicit `--railway-*`
flags to override them. The preflight requires the SMART session secret by
default because the workflow defaults to synthetic SMART minting; add
`--no-mint-synthetic-session` only for proof runs that will not mint SMART
sessions. For a local-only check, add `--skip-github --skip-railway`.

You can also inspect Railway directly:

```bash
railway run \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --environment "$RAILWAY_ENVIRONMENT" \
  -- python -c "import os; print({k: bool(os.environ.get(k)) for k in ['BOUNDARY_ENABLE_LLM_AGENTS','OPENROUTER_API_KEY','BOUNDARY_REQUIRED_LLM_PROVIDERS','BOUNDARY_SMART_SESSION_SECRET','SECURITY_SMART_SESSION_SECRET']})"
```

The deployment workflow runs the same check with:

```bash
python scripts/check_runtime_env.py --require-provider-proof --require-smart-secret
```

A deploy that cannot satisfy those values is not provider-proof ready.

## Provider Connectivity Gate

Run this before launching a proof campaign:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1 \
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter \
OPENROUTER_API_KEY="..." \
BOUNDARY_RED_TEAM_MODEL="google/gemini-2.5-flash" \
BOUNDARY_ORCHESTRATOR_MODEL="google/gemini-2.5-flash" \
BOUNDARY_JUDGE_MODEL="google/gemini-2.5-flash" \
BOUNDARY_DOCUMENTATION_MODEL="google/gemini-2.5-flash" \
pnpm check:llm-agents -- --sqlite-path apps/web/var/boundary.db
```

Every role must return `status: executed`:

- `orchestrator`
- `red_team`
- `judge`
- `documentation`

Any `disabled`, `missing_secret`, or `failed` status means the system is not provider-backed yet.

## Generate Proof Artifact

Run the worker path, not a hand-written artifact:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1 \
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter \
OPENROUTER_API_KEY="..." \
BOUNDARY_SMART_SESSION_SECRET="..." \
python scripts/run_proof_campaign.py \
  --bootstrap \
  --target-url https://clinical-copilot.up.railway.app \
  --mint-synthetic-session \
  --output-file proof-output.json
```

The command exits before touching the target if provider-backed preflight fails. On success, it prints the proof result JSON. Use the `sqlite_path` and `artifact` values from `proof-output.json` for the final gate.

## Verify Completion

Run the no-skip gate:

```bash
pnpm verify:readiness -- \
  --sqlite-path /path/to/proof-boundary.db \
  --artifact-path /path/to/generated-artifact.json \
  --expected-target-origin https://clinical-copilot.up.railway.app
```

For the machine-readable objective checklist, run the matching audit against the
same DB, artifact, and target origin:

```bash
pnpm audit:readiness -- \
  --sqlite-path /path/to/proof-boundary.db \
  --artifact-path /path/to/generated-artifact.json \
  --expected-target-origin https://clinical-copilot.up.railway.app
```

The audit performs a live Pydantic AI connectivity check for all configured
roles; env vars alone do not satisfy the agent-connection criterion.

The proof artifact must show:

- `summary.total` equals the full seed library count
- all Pydantic Graph nodes executed
- `pydantic_graph.agent_connections` exists
- all four agent roles have `status: executed`
- every result records provider-backed red-team and judge metadata:
  `provider_status: executed`, `execution_mode` beginning with `pydantic-ai:`,
  non-empty provider output, `red_team_agent.provider_decision: applied`, and
  `judge_agent.provider_decision: applied`
- `agent_notes` contains non-empty provider output for orchestrator, red team,
  judge, and documentation
- `target_url` matches the expected deployed target origin and is not localhost or loopback

The run directory also contains `<run_id>.trace.jsonl`, referenced by
`pydantic_graph.trace_path` in the artifact. Use it to debug slow or ambiguous
runs before reading full target responses. Pydantic AI spans are emitted with
content excluded by default; set `BOUNDARY_LOGFIRE_TOKEN` only for a
Boundary-owned observability project and keep `BOUNDARY_TRACE_INCLUDE_CONTENT=0`
unless the run is synthetic and content-bearing traces are explicitly approved.

`--mock-target` is only valid with `--allow-deterministic`; it cannot satisfy the provider-backed proof gate.
`verify:readiness` refuses skip flags, missing proof inputs, and missing provider
runtime env; use
`verify:system -- --skip-*` only for local development checks.

## GitHub Manual Workflow

After `OPENROUTER_API_KEY` and `BOUNDARY_SMART_SESSION_SECRET` are configured
on the `demo` environment, run the `Provider Proof Campaign` workflow manually.
The workflow validates provider runtime env with `scripts/check_runtime_env.py`,
uploads the proof artifact, and runs `pnpm verify:readiness` plus
`pnpm audit:readiness` against it.

## GitLab Manual Job

If this repository is mirrored to GitLab, configure these protected CI/CD
variables before running `proof:provider`:

```bash
BOUNDARY_ENABLE_LLM_AGENTS=1
BOUNDARY_REQUIRED_LLM_PROVIDERS=openrouter
OPENROUTER_API_KEY=<provider key>
BOUNDARY_SMART_SESSION_SECRET=<Clinical Co-Pilot SESSION_SECRET>
```

The GitLab `proof:provider` job provisions Python inside the Node 22 image,
validates runtime env with `scripts/check_runtime_env.py`, runs
`scripts/run_proof_campaign.py`, then runs `pnpm verify:readiness` and
`pnpm audit:readiness` against the generated artifact. The Railway deploy job
also runs `scripts/check_provider_proof_config.py --skip-github` before deploy
so production runtime env is checked without printing secret values.

## Offline Smoke Only

This checks the proof-runner mechanics, not demo readiness:

```bash
python scripts/run_proof_campaign.py \
  --bootstrap \
  --mock-target \
  --allow-deterministic \
  --timeout-seconds 2
```

Offline smoke artifacts are expected to have agent connections present but `disabled`.
