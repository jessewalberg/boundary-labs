---
date: 2026-05-15
topic: regression-harness-observability-assessment
---

# Regression Harness and Observability Assessment Requirements

## Summary

Current implementation does not yet meet the requested regression harness and observability requirements thoroughly. The repo has a useful campaign execution, artifact ingest, seed corpus, and dashboard foundation, but confirmed exploits are not promoted into a distinct deterministic regression suite, Orchestrator-triggered sweeps are not implemented, regression reappearance is not detected as a first-class event, and cost/resilience observability remains incomplete.

---

## Problem Frame

The platform is meant to continuously discover, confirm, replay, and monitor vulnerabilities in a target AI system. That only works if confirmed exploits become durable test cases with stable pass semantics, run automatically against new target versions, and produce enough state for the Orchestrator and operators to make decisions without reading raw artifacts.

The current codebase has working pieces of that loop. Seed cases live under `evals/seeds/`; campaign runs produce artifacts; ingest materializes `runs`, `attempts`, `verdicts`, and `findings`; the dashboard can show basic pass rate, open findings, coverage, event feed, and agent connection state. Those pieces are not the same as a regression harness for confirmed exploits. They are closer to a seed-based campaign harness plus operational read models.

The highest-risk gap is pass semantics. A regression test that passes because the target, model, judge, prompt, or evidence interpretation drifted is not trustworthy. Current verdicts can be deterministic for simple prohibited-pattern checks, but the platform does not store enough regression-specific expected evidence, target version context, fix history, or reappearance semantics to prove that a vulnerability stayed fixed for the right reason.

---

## Actors

- A1. Orchestrator Agent: Triggers sweeps, reads coverage and vulnerability state, and decides what to test next.
- A2. Red Team Agent: Generates or mutates attacks that may become confirmed exploits.
- A3. Judge Agent: Evaluates attempts and produces pass, fail, partial, or invalid verdicts.
- A4. Documentation Agent: Drafts reports and regression candidates from confirmed findings.
- A5. Human Operator / Reviewer: Triage, approve promotion, and understand system state.
- A6. Target System: The versioned AI system under test.

---

## Current Implementation Assessment

| Requirement area | Current status | Evidence |
| --- | --- | --- |
| Store confirmed exploits in a versioned, queryable format | **Partial** | `seeds` and `seed_versions` exist in `apps/web/src/server/db/migrations/0001_init.sql`, and seed corpus validation exists in `scripts/check_pydantic_evals.py`. There is no distinct confirmed-exploit or regression-case table, no `evals/cases/regression/` directory, and no promotion flow that writes permanent regression cases. |
| Run the full regression suite automatically when triggered by Orchestrator | **Not met** | `worker/cron.py` returns `False` for `should_run_sweep`. Safety Gate policy names `orchestrator:regression_sweep` in `apps/web/src/server/safety-gate/schema.ts`, but no implemented Orchestrator sweep creates and executes a regression suite job. |
| Detect when a previously-fixed vulnerability has reappeared | **Not met** | `findings` rows support basic status and latest run tracking, but there is no fixed/resolved lifecycle enforcement, no target-version-indexed regression history, and no reappearance event model in `apps/web/src/server/ingest/from-artifact.ts`. |
| Flag when fixing one attack introduces a regression in another category | **Not met** | Coverage and pass rates can be aggregated by seed/category in `apps/web/src/server/coverage/query.ts`, but there is no cross-category regression comparison against a previous fixed baseline. |
| Define trustworthy regression pass semantics | **Partial / insufficient** | `scripts/run_mvp_evals.py` has deterministic checks for prohibited patterns and safe indicators, but regression-specific expected evidence, model/judge drift controls, target version comparisons, and invalid-pass detection are not represented as first-class data. |
| Which attack categories have been tested and how many cases exist | **Partial** | `listThreatCoverage()` derives category seed counts and pass rates from `seeds`, `attempts`, and `verdicts`, but it does not distinguish exploratory seeds from confirmed regression cases. |
| Current pass/fail rate across categories and system versions | **Partial** | Dashboard aggregates pass/fail across runs via `apps/web/src/server/metrics/repository.ts` and `apps/web/src/server/runs/repository.ts`, but system/target version is not modeled in the DB or read models. |
| Resilience trend over time | **Partial / weak** | Spark buckets show recent pass rate, but there is no target-version-aware trend, no vulnerability closure/reopen trend, and no category regression baseline. |
| Vulnerabilities open, in progress, or resolved | **Partial** | `findings.status` exists and the findings page lists open/fixed/deferred display states, but current ingest only creates or updates open findings; in-progress/resolved lifecycle behavior is not implemented. |
| Test run cost and cost scaling | **Not met** | Budget fields exist on campaigns, and architecture docs mention costs, but current DB schema and read models do not record token usage, model cost, per-run cost, or rate of cost scaling. |
| What each agent is doing and in what order it happened | **Partial** | Artifacts can include `pydantic_graph.nodes` and `agent_connections`, and audit events feed the dashboard. This gives latest status and some ordering, but not a complete agent action timeline with per-action inputs, outputs, costs, and trace correlation. |

---

## Requirements To Close The Gaps

**Regression harness**
- R1. Confirmed exploits must be promoted into a dedicated regression case record that is separate from exploratory seed cases, versioned, queryable, and linked to the originating finding, exploit evidence, category, severity, target version, and approval event.
- R2. Regression cases must carry explicit pass semantics: the protected behavior, the evidence required to prove the vulnerability remains fixed, invalid-result conditions, and any deterministic checks or judge rubric used to evaluate the replay.
- R3. The harness must distinguish a true pass from an invalid pass caused by model drift, missing evidence, target unavailability, prompt rewrite, judge uncertainty, or changed target behavior that bypasses the original vulnerability path without proving the fix.
- R4. The Orchestrator must be able to trigger a full regression suite run that includes every active promoted regression case, not only the exploratory seed corpus.
- R5. Regression suite results must be stored per target system version so operators can compare vulnerability resilience across versions and deployment events.
- R6. When a regression case that previously passed after fix verification fails again, the platform must create or reopen a vulnerability state and flag it as a reappeared vulnerability.
- R7. When a new fix causes another category's previously passing regression case to fail, the platform must flag the failure as a cross-category regression instead of treating it as an isolated new finding.

**Observability**
- R8. The platform must expose tested attack categories with separate counts for exploratory seeds, confirmed regression cases, attempted cases, passing cases, failing cases, partial cases, and invalid cases.
- R9. The platform must expose pass/fail/partial/invalid rates by category, run, regression suite, and target system version.
- R10. The platform must expose resilience trends over time using fixed baselines, reopened vulnerabilities, new failures, and category-level regression movement.
- R11. Vulnerability lifecycle state must distinguish at least open, in progress, fixed pending verification, resolved, reopened, and deferred, with timestamps and run evidence for each transition.
- R12. Each test run must record cost data sufficient to answer total run cost, cost by agent/model/category, token usage where available, and cost scaling over time.
- R13. Agent activity must be observable as an ordered timeline showing agent role, action, input reference, output reference, status, cost when available, and trace or artifact correlation.
- R14. The Orchestrator-facing read model must provide enough structured state to decide whether to run regressions, explore coverage gaps, stop due to low signal, or escalate to a human.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a reviewer approves a confirmed exploit for promotion, when promotion completes, then the regression suite contains a versioned case linked to the finding, original evidence, approval, category, and pass semantics.
- AE2. **Covers R3.** Given a replay does not exercise the original vulnerable path or lacks required evidence, when the target response appears superficially safe, then the regression result is `invalid` rather than `pass`.
- AE3. **Covers R4, R5.** Given the Orchestrator triggers a regression sweep for a new target version, when the sweep runs, then every active promoted regression case is executed and results are stored against that target version.
- AE4. **Covers R6.** Given a promoted regression passed on the last fixed version, when it fails on a later version, then the platform marks the vulnerability as reopened and surfaces it to the operator and Orchestrator.
- AE5. **Covers R7.** Given category A was fixed and category B previously passed, when a new target version fixes A but causes B to fail, then the platform flags B as a cross-category regression.
- AE6. **Covers R8, R9, R10.** Given several runs across multiple target versions, when an operator opens observability, then they can see category counts, pass/fail rates by version, and whether resilience improved or declined.
- AE7. **Covers R12.** Given a campaign uses multiple agents and models, when the run completes, then the platform shows total cost plus cost broken down by agent/model/category.
- AE8. **Covers R13.** Given a multi-agent campaign completes, when an operator opens the run timeline, then they can see the ordered sequence of Orchestrator, Red Team, Target Execution, Judge, Documentation, and Promotion actions with artifact references.

---

## Success Criteria

- A reviewer can promote a confirmed exploit and later prove, from queryable state, whether that exploit remained fixed across target versions.
- The Orchestrator can trigger a full regression sweep without relying on raw artifact inspection or manual campaign selection.
- A reopened vulnerability and a cross-category regression are visibly different states, not just generic failed verdicts.
- Operators can answer the required observability questions from the console/read models: category coverage, pass/fail rates, resilience trend, vulnerability lifecycle, run cost, cost scaling, and ordered agent activity.
- A downstream planning agent can turn this assessment into implementation work without inventing pass semantics, lifecycle states, or the distinction between exploratory seeds and confirmed regressions.

---

## Scope Boundaries

- This assessment is based on current implementation only. Existing architecture and plan documents are not counted as satisfying a requirement unless code, schema, tests, or read models implement the behavior.
- This document does not prescribe exact schema names, UI layout, or implementation modules. Those belong in implementation planning.
- Exploratory seed execution is not treated as equivalent to confirmed-exploit regression testing.
- Basic dashboard pass-rate display is not treated as target-version resilience analysis.
- Budget caps are not treated as cost observability unless actual per-run and per-agent costs are recorded.

---

## Key Decisions

- Current implementation is assessed as **not thoroughly meeting** the regression harness requirement because confirmed exploits do not have a dedicated promotion and replay lifecycle.
- Pass semantics are treated as a first-class requirement, not an implementation detail, because weak pass semantics can make the harness actively misleading.
- Observability must be queryable and structured enough for both Orchestrator decisions and human operator understanding; artifact-only evidence is insufficient for the minimum questions in the prompt.

---

## Dependencies / Assumptions

- Target system versions or deployment identifiers must be available to the security platform before resilience trends and reappearance detection can be trusted.
- Model provider usage data must be captured or estimated consistently before cost scaling can be reported honestly.
- Judge verdicts may remain part of the evaluation path, but deterministic evidence and invalid-result handling are required for promoted regression cases.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1-R7][Technical] What is the cleanest storage boundary for promoted regression cases versus exploratory seeds?
- [Affects R3][Technical] Which vulnerability categories can use deterministic checks immediately, and which need judge-assisted semantics plus invalid-result guards?
- [Affects R5, R10][Technical] What target version identifier should be treated as authoritative for deployed Clinical Co-Pilot runs?
- [Affects R12][Technical] Which provider usage fields are available reliably enough to support cost breakdown and scaling reports?
