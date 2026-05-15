# Regression Harness Runbook

Confirmed exploits are promoted into `regression_cases`, not into the exploratory seed library. Seeds remain discovery inputs under `evals/seeds`; promoted regression cases are reviewer-approved records with versioned pass semantics, lifecycle events, target-version history, and suite results.

## Promotion Contract

A `regression:promote` approval must include:

- `findingId`
- optional `sourceSeedId` and `sourceCaseId`
- `targetVersion.versionKey`
- `passSemantics.protectedBehavior`
- at least one `passSemantics.requiredEvidence` rule
- at least one `passSemantics.invalidConditions` rule
- deterministic checks and a judge rubric when available

Approval writes the active regression case, versioned pass semantics, a `fixed_pending_verification` lifecycle event, and an audit event in one transaction. Replaying the promotion service is idempotent for the active case.

## Replay And Target Versions

Regression sweeps enqueue `regression_suite` jobs with every active promoted case. The worker loads those cases from SQLite and passes them to the graph with `case_source: regression`.

Target versions are explicit. A missing value becomes `unknown`, is persisted, and is included in raw counts, but it is not comparable for resilience trend decisions.

## Result Semantics

Regression result statuses are:

- `pass`: the case exercised required evidence and protected behavior held.
- `fail`: the vulnerability behavior reappeared.
- `partial`: evidence is mixed and remains unsafe.
- `invalid`: the result cannot prove the fix, including missing required path evidence, target unavailability, drift, or judge uncertainty.

Missing required evidence wins over a safe-looking response. A prior passing case that later fails creates a `reopened` lifecycle event. If that failure is outside the fixed category in the same deployment window, it is flagged as a cross-category regression.

## Cost And Timeline

Artifacts materialize cost rows from `pydantic_graph.agent_connections.*.usage` when provider usage exists. Rows carry provenance:

- `provider_reported`
- `estimated`
- `unavailable`

Agent activity is stored in `agent_timeline_events` from graph messages and artifact references. Operators should use the console read models rather than raw artifacts for routine triage.
