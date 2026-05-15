# AI Cost Analysis

**Boundary Labs adversarial evaluation platform — cost analysis as of 2026-05-15.**

This document covers (a) actual dev spend to date, (b) per-run unit economics, (c) projected production cost at 100 / 1K / 10K / 100K runs, and (d) the architectural shifts required at each tier. It is deliberately not `cost-per-token × n`; the operating cost of an adversarial evaluation platform is shaped by retries, judge sampling, deterministic deflection, storage, observability, and human-review labor as much as by raw LLM tokens.

## Methodology

Per-run cost is decomposed using the formula in `ARCHITECTURE.md:824-834`:

```
run_cost = red_team_generation_cost
         + target_inference_cost
         + judge_cost
         + documentation_cost
         + storage_and_observability_cost
         + retry_overhead
```

`target_inference_cost` belongs to the OpenEMR Co-Pilot (the system under test) and is not billed to Boundary in dev — but it is billed at scale because every probe consumes a real LLM call on the target. We carry it as a separate column at each tier.

Boundary captures token + dollar cost through the `run_costs` table (`apps/web/src/server/db/migrations/0004_regression_harness_observability.sql:116-134`) with three provenance classes: `provider_reported`, `estimated`, `unavailable`. As of this writing the dev `run_costs` table is empty — the worker ingest path emits `run_costs` rows only on the in-progress Documentation Agent loop. Until that lands (tracked as a Known Limitation), this analysis uses **estimated** values calibrated against public OpenRouter pricing for the models actually wired in `worker/llm_provider.py` and the agent_connections recorded in `var/provider-proof-output.json`.

### Calibration source

The MVP exercises one model family across all four agents:

| Agent role | Provider | Model | Source |
|---|---|---|---|
| Orchestrator | OpenRouter | `google/gemini-2.5-flash` | provider proof artifact, `agent_connections.orchestrator` |
| Red Team | OpenRouter | `google/gemini-2.5-flash` | same |
| Judge | OpenRouter | `google/gemini-2.5-flash` | same |
| Documentation | OpenRouter | `google/gemini-2.5-flash` | same |

OpenRouter price for `google/gemini-2.5-flash` (Jan 2026 list): **$0.075 / 1M input tokens, $0.30 / 1M output tokens**, no provider markup at this writing. We model 5% retry overhead and a 10% buffer for provider variance.

Per-role provider routing is wired but not differentiated in the MVP: `worker/llm_provider.py:83-84` returns the same default model for every role, and `BOUNDARY_<ROLE>_MODEL` env overrides exist but are unused. Tiering analysis below assumes provider routing is exercised in production.

## Actual dev spend to date

`apps/web/var/boundary.db` records **9 completed runs** across 9 campaigns, of which:

- **3 deterministic-only runs** (wall time < 1 s) ran the Judge and Red Team in their deterministic-fallback paths. These made zero LLM calls. LLM cost: **$0.00**.
- **6 provider-backed runs** (referenced under `var/*-proof-output.json`) executed the full agent graph. Two have wall times ≥ 40 s captured in the DB (`runs.completed_at - runs.started_at`); the remaining four are recorded in `var/` artifacts only.

For provider-backed runs we estimate per-case token use as:

| Agent | Input tokens | Output tokens | Per-case unit cost |
|---|---|---|---|
| Red Team plan | 1,500 | 500 | $0.000263 |
| Judge eval | 2,500 | 300 | $0.000278 |
| Documentation note | 2,000 | 200 | $0.000210 |
| Orchestrator schedule | 500 | 100 | $0.000068 |
| **Per case (4 agents)** | **6,500** | **1,100** | **$0.000818** |

Per provider-backed run = 4 cases × $0.000818 = **$0.0033**.
Across 6 provider-backed runs = **$0.020 total LLM cost**.

This number is small because the MVP was deliberately deterministic-first for cost containment. The instrumentation to report this number from real provider-reported usage exists (`run_costs.provenance = provider_reported`) but is not yet populated by ingest. Producing real provider-reported numbers becomes possible the moment ingest writes to `run_costs`, which is a small change tracked under Known Limitations.

### Other dev costs

- **Compute / hosting:** Railway runs the deployed target Co-Pilot and the operator console. Free-tier credits cover MVP volume.
- **Storage:** SQLite + local artifact directory. < 100 MB.
- **Observability:** Logfire dev tier, no paid traffic yet.
- **Human review labor:** ~6 hours of operator time across 9 runs (≈ 40 min/run), trending down as `/regressions` and `/approvals` get more familiar.

Effective total dev spend on LLM + infra: **under $1**, dominated by Railway free-tier overhead rather than tokens.

## Per-run unit economics (production-shape)

Unit economics shift between *dev* and *production* runs because dev exercises a 4-case seed corpus while production runs target full coverage. We model two unit-of-account profiles:

| Profile | Cases / run | Multi-turn depth | Adaptive variants | Judge calls |
|---|---|---|---|---|
| **MVP run** | 4 | 1 | 0 (no adaptive trigger) | 1 per case |
| **Production run** | 25 | 3 (`worker/graphs/campaign.py:884`) | up to 4 (`BOUNDARY_ADAPTIVE_ATTACK_LIMIT`, `worker/graphs/campaign.py:1000`) | 1 per case + 1 per partial |

Production-run cost on baseline (all flash):

- 25 cases × 4 agents × $0.000818 base = $0.082
- + 20% retry/adaptive overhead (mutation loop generates ~5 extra red-team calls): + $0.016
- + 10% judge re-eval on partials: + $0.008
- = **≈ $0.11 per production run, LLM-only**

This is the unit we project from.

## Projections at scale

The Cost And Scale Strategy in `ARCHITECTURE.md:817-822` is the architectural contract; the table below puts dollars on it.

### 100 runs

| Component | Cost | Notes |
|---|---|---|
| LLM (red team + judge + doc + orchestrator) | $11 | 100 × $0.11 |
| Target inference (Co-Pilot) | $4 | 25 cases × $0.0016 per Co-Pilot turn (its own gemini-flash + retrievals) |
| Storage (SQLite + local artifacts) | $0 | fits on operator laptop |
| Observability (Logfire) | $0 | within free tier |
| Human review | $25 | 2 hrs × $25 internal-cost rate |
| **Total** | **≈ $40** | |

**Architecture:** single SQLite worker, frontier judge allowed for spot-checks, no queue. Matches `ARCHITECTURE.md:819`.

### 1,000 runs

| Component | Cost | Notes |
|---|---|---|
| LLM | $110 | 1,000 × $0.11 |
| Target inference | $40 | scales linearly |
| Storage | $5 | SQLite reaches a few GB; weekly artifact rotation begins |
| Observability | $15 | Logfire paid tier; per-trace egress |
| Frontier judge sampling | $20 | 5% of judge calls escalate to Sonnet 4.6 at ~$3/1M in, ~$15/1M out — calibration data for the deterministic judge |
| Human review | $200 | 8 hrs × $25; reviewers handle promotions + escalations only |
| Per-attempt budget enforcement | (control) | hard cap $0.50/case (`ARCHITECTURE.md:809`); auto-halt on `fail_rate<5% AND uncertain_rate>40% AND cumulative_cost>25%` (`ARCHITECTURE.md:813`) |
| **Total** | **≈ $390** | |

**Architecture shifts:** queue workers + cached judge verdicts (rerun-the-same-prompt avoidance), per-category budget caps, judge sampling for frontier calibration. Matches `ARCHITECTURE.md:820`.

### 10,000 runs

At this scale, naive extrapolation breaks. Three forces compress LLM cost below linear:

1. **Deterministic prefilter** — ~60% of attempts match a deterministic invalid-condition pattern (`apps/web/src/server/regression-suites/classify-result.ts`) and never reach the LLM judge.
2. **Regression replay caching** — promoted cases (`regression_cases`) replay with deterministic verdicts unless target version changes; ~40% of run-volume becomes free.
3. **Judge sampling** — frontier judge runs on 10% of cases for calibration, deterministic for 90%.

| Component | Cost | Notes |
|---|---|---|
| LLM (red team + adaptive) | $700 | 10K × $0.11 × (1 - 0.4 regression cache) ≈ $660 + $40 frontier sample |
| Target inference | $180 | partially absorbed by regression replay (cached verdicts don't re-probe) |
| Storage | $80 | move artifacts to S3-compatible object store; Postgres replaces SQLite |
| Observability | $120 | Logfire scaling + audit log retention |
| Human review | $400 | 16 hrs × $25; reviewers only see promotion candidates and severity ≥ high |
| **Total** | **≈ $1,480** | |

Naive linear from the 1K tier would project $3,900 — the **~62% delta is from deterministic prefilter + regression replay caching**, both of which are architectural decisions, not pricing optimizations.

**Architecture shifts:** horizontal workers (multi-process), Postgres-backed orchestrator state, object-storage artifacts, deterministic prefilter promoted to a Platform Service, regression replay cache. Matches `ARCHITECTURE.md:821`.

### 100,000 runs

At this scale, the cost story is governed by **what the platform stops doing with frontier APIs**, not by how cheap the frontier API gets.

| Component | Cost | Notes |
|---|---|---|
| Local mutation pool (Llama 3.1 8B on rented GPU) | $1,200 | $0.40/hr × 24 hr × 30 days for 4× A10G instances; absorbs ~70% of red-team token volume at near-zero marginal cost per call |
| API LLM (frontier judge sampling + escalation) | $1,800 | 5% frontier sampling on judge; severity ≥ high escalates to Sonnet 4.6 |
| Target inference (Co-Pilot) | $1,400 | 100K × ~$0.014 amortized; regression cache absorbs 50%+ |
| Storage | $400 | Postgres + parquet artifacts in S3 |
| Observability | $600 | OTel collector + Logfire org tier |
| Human review | $2,000 | ~80 hrs; reviewers only see severity ≥ high (≈ 0.4% of runs surface to humans) |
| **Total** | **≈ $7,400** | |

Naive linear would project $39,000 at this tier. The **~81% delta is from substituting open-weight models for the mutation agent, regression cache deflection, and human-review triage**.

**Architecture shifts:** GPU pool for mutation, Postgres-backed coordination, sharded artifact storage, fine-tuned judge with periodic frontier sampling, dedicated eval cluster. Matches `ARCHITECTURE.md:822`.

## Non-token cost components

Three cost lines do not appear in any token meter but dominate the budget at higher tiers:

1. **Storage + audit retention** — the regression harness commits to versioned exploits, lifecycle history, and run artifacts. At 10K+ runs this becomes a Postgres + object-store decision, not a free SQLite file.
2. **Observability + tracing** — every run emits `agent_timeline_events`, `run_costs`, and OpenTelemetry spans. Logfire egress is per-trace; the volume grows linearly with runs.
3. **Human review labor** — the platform autonomously drafts vulnerability reports (`worker/graphs/campaign.py:483-528`), but publication of severity ≥ high reports requires approval (`ARCHITECTURE.md:840-853`). Reviewer time is real cost. We model 2-3 min/finding at $25/hr internal-cost rate.

## Controls validating the projection

Three deterministic controls bound worst-case cost regardless of tier:

| Control | Where | What it caps |
|---|---|---|
| Per-attempt frontier cap | `ARCHITECTURE.md:809` | Single attempt cannot exceed $0.50 in API spend |
| Low-signal stop rule | `ARCHITECTURE.md:813` | Auto-halts campaign when `fail_rate<5% AND uncertain_rate>40% AND cumulative_cost > 25% of budget` over rolling 20 attempts |
| Single budget increase | `ARCHITECTURE.md:800-813` | Budget overrides require operator approval, not autonomous escalation |

The low-signal stop rule is the primary defense against runaway dev cost during mutation loops. It is currently defined in policy but **not enforced at runtime** in `worker/graphs/campaign.py` — this is the second item on the Known Limitations list and the highest-leverage demo win.

## Open risks and calibration triggers

- **Provider price drift** — Gemini 2.5 Flash pricing has been stable in 2026 but a 2-3× increase would shift the per-run number from $0.11 to ~$0.30 and re-shape the 10K and 100K tier math. Tracked in `policy_values` for re-evaluation on every monthly review.
- **OpenRouter markup** — the analysis assumes no provider markup. OpenRouter's actual fee structure is being monitored.
- **Real provider-reported usage** — until `run_costs` is populated end-to-end by ingest, all numbers in this doc are estimates. The instrumentation, schema, and UI (`apps/web/src/server/costs/repository.ts`, `apps/web/src/components/boundary/cost-breakdown.tsx`) are all in place; the missing piece is one `INSERT INTO run_costs` block in `apps/web/src/server/ingest/from-artifact.ts`.

## Known limitations referenced

- `run_costs` table populated end-to-end by ingest pipeline — gap; derivation script `apps/web/scripts/derive-reports.ts` proves the schema works but the live worker → ingest loop is still being wired.
- Low-signal stop rule + budget enforcement runtime check — gap in `worker/graphs/campaign.py`; planned next milestone.
- Per-role provider routing exercised — `worker/llm_provider.py:83-84` returns the same default for every role; the env override path exists but is unused. Production tier projections assume this is enabled.

## Summary

Actual dev spend to date: **under $1**, dominated by free-tier infra rather than LLM tokens. Per production run unit cost: **≈ $0.11 LLM, $0.40 all-in** at the 100-run tier. The architecture is designed to compress LLM-share of cost from ~30% at 100 runs to ~40% at 100K runs *through architectural deflection* (deterministic prefilter, regression replay caching, local mutation pool) rather than relying on provider pricing improvements. The deterministic controls bounding worst-case spend are in policy; promoting them to runtime enforcement is the next concrete cost-engineering deliverable.
