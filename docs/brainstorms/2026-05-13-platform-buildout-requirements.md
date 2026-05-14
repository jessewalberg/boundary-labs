---
date: 2026-05-13
topic: platform-buildout
---

# Boundary Labs Platform Buildout — Five-Pillar Requirements

## Summary

Pillars 1–5 turn the existing Boundary Labs console from a fixture-backed shell into a live multi-agent adversarial platform: authenticated operators launch real eval runs against the deployed Clinical Co-Pilot through a Python worker that runs in the same Railway container as the Next.js console (single deploy unit, single volume), with all agent code hosted via `pydantic_graph.Graph`. Queryable state (campaigns, runs, attempts, verdicts, findings, seed_versions, audit, approvals, campaign_jobs, policy_values) persists in SQLite as the system of record while artifacts stay on disk as evidence references; drilldowns connect findings ↔ seeds ↔ runs ↔ threat-model categories with a uniform right-rail navigation model; and a tiered Safety Gate with hybrid policy storage (action schema in repo-checked-in code, action values in SQLite with a console UI and `policy:write` itself approval-gated with self-protection guards) lets Red Team and Orchestrator agents act autonomously within a bounded attack surface while routing every scope-expanding action through audited human approval.

The CISO-readable trust surface is R16 (the policy table, viewable + auditable in-console) plus R17 (the audit ledger, with DB-layer append-only enforcement) plus `/approvals` (the human-in-the-loop queue). Worker mechanics, sentinel protocol, ULID ids, and canonical-hash re-validation are infrastructure that makes those surfaces trustworthy — not the surfaces themselves.

---

## Problem Frame

The Boundary Labs console today is a UI shell. The existing pages (dashboard, campaigns, findings, coverage, secrets, schedule, targets) render from in-repo fixture data; `/campaigns/new` writes a queued JSON record but nothing executes; the python eval runner runs out-of-band and its results land in `evals/results/` with no path into the UI. There is no authentication, no operator identity, no audit ledger, and no persisted state across runs. `ARCHITECTURE.md` describes a multi-agent platform with Pydantic Graph orchestration, a Safety Gate, Coverage Scoring, Regression Promotion, and Documentation flow; none of those interactions exist as runtime code today.

The pain is that every defense of this work — "platform running live tests against the deployed target," "continuously identify, evaluate, and defend against new attack techniques," "an autonomous multi-agent red team" — is currently a static screenshot. A reviewer cannot click into a finding and trace it back to the seed that generated it, the run that produced it, and the threat-model category it covers. An operator cannot launch a campaign and see the platform act. The Red Team and Orchestrator agents described in `ARCHITECTURE.md` have no substrate to query.

Two adjacent costs compound the pain. Without persisted state across runs, historical analytics and self-improvement are impossible — there is no row to read, no trend to plot, no partial-success to mutate from. Without a Safety Gate enforcing the trust boundary, the platform cannot defend its own decisions: every approval is implicit or absent, every audit event is missing, and the CISO question "where does this system stop and ask a human?" has no answer.

---

## Actors

- A1. **Admin** — provisioning + operational identity. Sole role permitted to flip data-mode (synthetic → real_phi, gated by `baa_acknowledged`), seed first operator on deploy, manage target allowlist, manage operator roles, raise per-campaign and per-day budget caps, and edit the policy values table (each edit approval-gated by `policy:write`).
- A2. **Operator** — primary console user. Launches campaigns, triages findings, requests approvals, cancels in-flight runs.
- A3. **Reviewer** — approval identity. Approves regression promotion, vulnerability report publishing, high-severity / new-category attack expansion, and seed_version mutations routed for approval.
- A4. **Red Team Agent** — autonomous attacker hosted inside the Python worker process. Generates new attacks and mutates partial-success attempts within Safety Gate policy bounds.
- A5. **Orchestrator Agent** — autonomous scheduler hosted inside the Python worker process. Reads coverage, findings, regressions, and budgets; picks next category or proposes new-category exploration.
- A6. **Judge Agent** — autonomous evaluator inside the Python worker process. Issues verdicts on attempts independently of Red Team; quarantined to `pending_approval` routing when calibration accuracy drops below threshold (default 0.80); audited via calibration sets on cadence.
- A7. **Documentation Agent** — autonomous drafter inside the Python worker process. Converts confirmed findings into vulnerability report drafts pending reviewer approval before publish.
- A8. **Safety Gate Service** — deterministic enforcer. Lives as a shared library imported by both Next.js (TypeScript build) and the Python worker (Python build); both implementations read the same `policy_values` rows from the same SQLite file. Consults the policy schema (repo-checked-in, language-paired definitions) plus policy values (SQLite) for every action with a trust dimension; allows, denies, or routes to approval; writes audit. Re-validates approved actions at execution time against a canonical-hash of the request to prevent substitution; re-validates every claimed `campaign_jobs` row at worker claim time against the full policy table (not only the approval canonical-hash) to prevent direct-DB-insert bypass.

(Pillar 1 ships with three enforced roles. `viewer` and the separate `owner` tier are deferred to a later milestone when a stakeholder signal arrives.)

---

## Key Flows

- F1. **Operator launches a campaign**
  - **Trigger:** Operator submits the `/campaigns/new` form with a target URL, attack categories, and a budget cap.
  - **Actors:** A2 (Operator), A8 (Safety Gate)
  - **Steps:** Safety Gate (web-side) verifies target is on allowlist (normalized URL.origin comparison only — never prefix/substring), data-mode is synthetic (or admin has acknowledged BAA and approved real_phi), budget within operator cap, and operator has `campaign:create`. In one SQLite transaction: campaign row inserts with status `queued` and a server-generated ULID id, `campaign_jobs` row enqueues for the worker, and a `campaign.queued` audit event writes. The web request returns immediately; the operator lands on `/campaigns/{id}`. The Python worker (running as a child process in the same container, supervised by the process supervisor) claims the job (`claim_token` set with `claimed_at`), Safety Gate re-validates the full policy table against the claimed row (defensive — closes the direct-DB-insert vector), emits a `campaign.runner_started` audit event, and runs the campaign through Pydantic Graph nodes including Judge.
  - **Outcome:** A running campaign exists in the same Railway container as the web service; the worker writes heartbeat + artifact files; audit captures the launch and the worker claim. Container restart kills in-flight runs (F5 + relaunch is the recovery contract).
  - **Covered by:** R3, R6, R9, R10, R15, R17

- F2. **Run completes and ingest materializes the evidence**
  - **Trigger:** Worker finishes a campaign run and writes the artifact + `.complete` sentinel at the expected paths.
  - **Actors:** A6 (Judge embedded in worker), web-side ingest pass
  - **Steps:** First read of `/campaigns/{id}` after the artifact appears (or a periodic web-side sweep) triggers idempotent ingest: parse artifact, insert one `runs` row + one `attempts` row per seed-attempt + one `verdicts` row per attempt + one `findings` row per failed verdict not already linked, AND insert a `finding_attempts` join row linking *every* failed attempt to its finding (creating the join row if absent — so the finding↔attempts relationship is genuinely one-to-many on re-ingest). All inserts in one transaction using `INSERT … ON CONFLICT DO NOTHING` against natural keys. Re-running is a no-op.
  - **Outcome:** Campaign status reaches `completed`; findings/coverage/runs pages reflect the run; the original artifact remains untouched as evidence reference.
  - **Covered by:** R6, R7, R8, R11, R12, R13

- F3. **Red Team mutates a partial-success attempt**
  - **Trigger:** Ingest pass marks an attempt with verdict `partial` or `fail` for a covered category at ≤ med severity, enqueuing an `agent_pass` job for Red Team.
  - **Actors:** A4 (Red Team in worker), A8 (Safety Gate)
  - **Steps:** Worker claims the job; Red Team generates variant prompts referencing the original seed. Safety Gate checks each variant against the policy values table; auto-approves within-policy variants up to the per-category pending-approval cap (default 10), routes scope-expanding ones to approval. Auto-approved variants land as new `seed_versions` and queue as fresh `campaign_jobs`. Approval-routed variants land as `pending_approval` and appear in the approvals queue. When the per-category pending cap is hit, Red Team suppresses further generation in that category and writes a `red_team_backpressured` audit event.
  - **Outcome:** New seed variants exist; in-policy ones run; out-of-policy ones wait. Audit events record each variant created, each policy decision, and each backpressure suppression.
  - **Covered by:** R9, R15, R16, R19

- F4. **Reviewer approves a regression promotion**
  - **Trigger:** A finding with verified fix and N consecutive passing re-runs becomes eligible for promotion to the permanent regression suite.
  - **Actors:** A3 (Reviewer), A7 (Documentation), A8 (Safety Gate)
  - **Steps:** Documentation Agent draft converts the finding into a regression candidate. Reviewer sees it in the approvals queue at `/approvals` with finding, reproduction transcript, and draft report. Reviewer approves or rejects inline; rejection requires a comment. On approve, the Safety Gate re-validates the action's parameter hash against the approval record (rejecting on mismatch with an `approval_mismatch` audit), then the seed joins the permanent suite and is included in scheduled sweeps.
  - **Outcome:** Permanent regression test exists; audit records who promoted what and why; rejected items return to findings with reviewer rationale.
  - **Covered by:** R11, R14, R15, R16

- F5. **Container restarts mid-run (recovery)**
  - **Trigger:** Railway container restarts (deploy, crash, OOM) while one or more campaigns are `running` or agent passes are in flight.
  - **Actors:** Process-supervisor restart + web-side recovery pass + worker startup sweep
  - **Steps:** On boot, scan `campaign_jobs` rows in `claimed` state. For each, distinguish three failure modes:
    1. `.complete` sentinel exists → run ingest (idempotent).
    2. `.failed` sentinel exists (written by worker when a Pydantic Graph node throws) → mark campaign `failed (graph_error)` with the captured exception; do not suggest auto-relaunch.
    3. No sentinel and `claimed_at` older than `claim_timeout_seconds` (default 600s) and heartbeat mtime older than `heartbeat_staleness_seconds` (default 300s) → mark campaign `failed (orphaned)`, release the `claim_token`, write `campaign.orphaned` audit.
  - The orphaned campaign's detail page shows a prominent amber "Relaunch this campaign" button at the top; clicking opens `/campaigns/new` pre-filled from the orphan's parameters (target, categories, budget) plus a `relaunched_from: <orphan_id>` field stored on the new row; audit chain emits a `relaunched_from` event. The campaigns list shows orphan and relaunch rows linked visually via a chain icon.
  - **Outcome:** No campaign is left in a permanent zombie state; operator has a clean recovery path with audit lineage between orphan and relaunch; graph-node failures are visible to operators with the captured exception rather than masquerading as orphans.
  - **Covered by:** R7, R10, R11, R17

- F6. **Documentation Agent drafts a vulnerability report**
  - **Trigger:** Ingest pass closes a `finding` row (status transitions to `verified`) after N consecutive passing re-runs (configurable; default N=3).
  - **Actors:** A7 (Documentation), A8 (Safety Gate)
  - **Steps:** Worker enqueues a `documentation_pass` job. Worker claims and runs Pydantic Graph generating the report (markdown + structured fields); draft persists as a `reports` row with status `draft` (auto, per R16). When operator/admin requests publish, the draft routes to `/approvals` as a `report_publish` action; reviewer approves or rejects.
  - **Outcome:** Every verified finding has a draft report; published reports are operator-approved artifacts.
  - **Covered by:** R16, R20

- F7. **Orchestrator schedules the next test**
  - **Trigger:** Worker-side cron (default 4h cadence; configurable) or post-ingest event.
  - **Actors:** A5 (Orchestrator)
  - **Steps:** Worker claims an `orchestrator_pass` job. Orchestrator reads coverage gaps, open findings, recent regressions, and remaining budget; produces either (a) auto-scheduled regression sweep enqueued as a `campaign_jobs` row (within-policy categories only) or (b) a campaign proposal posted to `/approvals` (new-category exploration). Auto-sweep enqueued audits to `orchestrator.regression_sweep`; proposals audit to `orchestrator.proposal`.
  - **Outcome:** Coverage is exercised continuously without human triggering for in-policy work; scope-expanding moves go to reviewer.
  - **Covered by:** R16, R20

---

## Requirements

**Auth + RBAC foundation**
- R1. Console requires authentication via Better Auth on SQLite; all routes except `/healthz`, `/readyz`, and `/login` redirect unauthenticated requests. Post-authentication session cookies are configured with `HttpOnly`, `Secure` (in deployed environments), and `SameSite=Strict`.
- R2. Sign-in is email/password-only for the demo, gated by an email allowlist. Social sign-in is intentionally out of scope for the demo, and `/api/auth/sign-in/social` is not part of the required auth surface.
- R3. Three roles are enforced: `admin`, `operator`, `reviewer`. Every server-side mutation and protected read checks role via a single policy function; scattered conditionals are not permitted. All mutating server actions and route handlers enforce CSRF via Next.js's same-origin Server Action check plus `SameSite=Strict` session cookies plus Origin/Referer match on route-handler mutations.
- R4. Operator records are keyed by provider and account identifier from Better Auth's email/password account records. Status is one of `active` / `disabled` / `revoked`; a revoked record persists as a tombstone preventing reactivation by a new sign-in presenting the same provider/account key. First-deploy admin is seeded from an environment variable on first matching sign-in.

**Persistence and data layer**
- R5. SQLite is the system of record for queryable state. Persisted entities: `operators`, `campaigns`, `runs`, `attempts`, `verdicts`, `findings`, `finding_attempts` (join), `seeds`, `seed_versions`, `approvals`, `audit_events`, `run_heartbeats`, `campaign_jobs` (queue), `reports`, and `policy_values`. Reads happen through repository functions; the UI never reads fixtures or raw artifact files directly for persisted entities. The existing file-backed campaign metadata in `apps/web/src/server/campaigns/repository.ts` is replaced by the SQLite `campaigns` table; pre-SQLite `var/artifacts/campaigns/*.json` files are skipped (marked orphan in the audit log on first boot) rather than migrated — the file format predates ULID ids and the migration is not worth the schema-conflict risk.
- R6. Artifacts (full prompts, target responses, transcripts) remain on disk under the configured artifact directory and are referenced by row pointer plus redaction status. **Both read and write** sites canonicalize the artifact path and assert it begins with `BOUNDARY_ARTIFACT_DIR` before opening or writing; any path that escapes the configured root is rejected with an audit event. Worker startup validates that `BOUNDARY_ARTIFACT_DIR` is an absolute path under an expected mount point. Every surface rendering any field derived from artifact content (titles, previews, reproduction transcripts, response excerpts in lists, seed_version diffs, dashboard widgets) treats the content as untrusted and escapes on render by default; the evidence pane is the only surface permitted to show the full untruncated payload.
- R7. The threat-model seed library is materialized as `seeds` rows at first boot from `evals/seeds/` and `evals/cases/`; columns include `id`, `category`, `title`, `severity`, `prompt_template`, `version`, and a content hash for change detection. `seed_versions` foreign-keys to `seeds.id`. On boot, malformed seed files are skipped-and-flagged (audit event per skipped file + a `seed_library_partial` audit when any are skipped) rather than refusing-to-start; a worker-status row + dashboard tile surfaces "seed library degraded" so an operator can see and fix the broken seed without re-deploying.
- R8. Coverage stays a derived query (threat-model categories × seed library × recent verdicts), not a materialized rollup table. Trend snapshots may be cached if read performance requires.

**Campaign execution (single-container, worker child process)**
- R9. `/campaigns/new` writes the campaign row (with a server-generated ULID id) with status `queued`, enqueues a `campaign_jobs` row, and emits a `campaign.queued` audit event — all in a single SQLite transaction. The server action returns immediately. The Python worker (running in the same Railway container as Next.js, supervised by the process supervisor) drains the queue, claims jobs via `claim_token` (uniqueness enforced by `UPDATE … WHERE claim_token IS NULL AND status='queued' RETURNING id`), re-validates the claimed row against the full policy table at the Safety Gate before any execution (preventing direct-DB-insert bypass), runs each campaign through Pydantic Graph end-to-end, and writes `evals/results/{id}.json` plus heartbeat + `.complete` sentinel (or `.failed` sentinel on graph-node throw with the captured exception) files. The worker refuses to start a job if the target artifact path already exists (writes `runner_refused_overwrite` audit, releases the claim). All subprocess arguments are passed as an array (`shell=False`); the only operator-originated value forwarded into the runner is the campaign ULID, which is looked up server-side after the Safety Gate validates the row.
- R10. Campaign status is derived from row state plus artifact + sentinel + heartbeat presence: `queued` (no `claim_token`), `running` (claim_token present, heartbeat mtime within `heartbeat_staleness_seconds`, default 300s), `completed` (`.complete` sentinel present), `failed (graph_error)` (`.failed` sentinel present with captured exception), `failed (orphaned)` (no sentinel AND heartbeat stale AND `claimed_at` older than `claim_timeout_seconds`, default 600s), `cancelled` (operator-initiated stop). The runner exit code means process success/failure, *not* verdict counts (which are derived from the artifact JSON).
- R11. Ingest is web-side and idempotent: artifact-to-rows materialization on first read after the `.complete` sentinel appears and on web-side startup sweep. Repeated ingest of the same artifact produces no duplicate rows via natural-key collision: `runs` keyed by `run_id`, `attempts` by `(run_id, case_id)`, `verdicts` by `(run_id, case_id)` (verdict rows are insert-only — once written, the status is not updated by subsequent ingests; status changes flow through findings instead), `findings` by `(category, case_id)` deduped to one open finding per case-per-category until closed, `finding_attempts` by `(finding_id, run_id, case_id)`. All ingests use `INSERT … ON CONFLICT DO NOTHING`. The worker is the SQLite writer for queue-and-worker-state tables (`campaign_jobs.claim_token`, `runs`, `attempts`, `verdicts`, `findings`, `seed_versions`, `reports`, plus its own audit events); the web side is the SQLite writer for everything else. WAL mode + 5000ms `busy_timeout` is enabled on first migration.

**Drilldowns and analytics**
- R12. Finding detail pages link backward to every attempt that produced the finding (one-to-many via `finding_attempts`), the seed (and seed_version, if mutated) that drove the attack, the run(s) the attempts came from, and the threat-model category the seed belongs to. Each detail page (finding, seed, run, category) hosts the entity's primary content full-width plus an inline right-rail "Related" panel listing the four other node types as chip-shaped links; clicking a chip navigates full-page (not a drawer); breadcrumbs reflect the navigation path. When a seed has been mutated, the seed chip in a finding's Related panel exposes a "Variants" sub-list showing all `seed_versions` of the seed with each variant's status (`auto_approved`, `pending_approval`, `rejected`). Seed_version history renders as a chronological list with a "diff vs original" expander.
- R13. Coverage category detail pages: regressed seeds appear as a top-of-page amber alert strip when count > 0 (collapses to a thin "no regressions" rail when zero); below, a two-column grid — seeds + per-seed pass-rate sparklines on the left, open findings + Orchestrator-flagged gaps on the right. Gaps visually distinguish from findings via icon + tone (gap = no seed exists; finding = seed exists but failed). Trend surfaces render an explicit "run at least 2 campaigns to see trend" empty state until enough rows exist.
- R14. Dashboard analytics: regressed-seeds count is a KPI-strip cell with alarm tone when non-zero; pass-rate-over-time renders as a sparkline below the KPI strip; coverage-gap leaderboard is a side-panel list under telemetry (renders from threat-model × seed library product on day one even when no runs exist); cost-per-run trend is a small bottom-right tile, hidden until at least 3 runs are recorded; pending-approval depth per category renders as a new dashboard panel directly under the coverage-gap leaderboard, with a per-category bar (amber tone above 50% of the per-category cap). All panels revalidate on each campaign ingest event via `revalidateTag` plus a 3s client poll for in-flight `running` campaigns.

**Trust boundary and Safety Gate (hybrid policy storage)**
- R15. The Safety Gate enforces a tiered policy for every action with a trust dimension. The policy *schema* (action enum, role enum, approval-path types, minimum-required-protection floor per system-reserved row) is repo-checked-in as language-paired definitions: a TypeScript constant for the web side and a Python module mirror generated from the same source-of-truth at build time. The policy *values* (severity thresholds, budget caps, role-approval mappings per action, `baa_acknowledged`, `heartbeat_staleness_seconds`, `claim_timeout_seconds`, per-category pending-approval cap, Judge calibration threshold, Orchestrator sweep cadence) live in SQLite (`policy_values`) and edit through a console page (read-only for `operator`/`reviewer`; edit for `admin`). `policy:write` is itself a row in `policy_values`, approval-gated (admin), AND **self-protected**: the Safety Gate refuses any `policy:write` mutation that would delete a system-reserved row (`policy:write`, `baa_acknowledged`, allowlist guard) or downgrade its `approval_path` below the floor declared in the schema. Bootstrap from a checked-in `policy_seed.json` on first boot if `policy_values` is empty OR if any system-reserved row is missing. On boot, the Safety Gate loads schema + values, computes a combined hash, writes a `policy_loaded` audit event with the file SHA + DB rev + diff summary vs last-loaded state. The repo policy schema file lives under CODEOWNERS so PRs touching it require named-reviewer review. The Safety Gate refuses to start if the schema file is missing/unparseable or if `policy_values` lacks any system-reserved row after seeding. When an approved action executes, the Safety Gate re-validates the action's canonical hash against the approval record AND snapshots the resolved policy values into the audit event so historical decisions stay interpretable even after later policy edits; mismatch writes an `approval_mismatch` audit event and refuses execution.
- R16. The trust policy table covers, at minimum (each row is a `policy_values` entry editable per R15):
  - Red Team mutating a covered seed at ≤ med severity: auto, within budget and per-category pending-approval cap.
  - Red Team mutating a covered seed at high/critical severity, or generating any new-category attack: approval-gated (reviewer).
  - Per-category pending-approval cap exceeded: Red Team suppresses new variant generation in that category and writes `red_team_backpressured` audit; dashboard surfaces pending depth per category per R14.
  - Orchestrator scheduling a regression sweep within existing categories: auto, within budget.
  - Orchestrator scheduling a new-category campaign: approval-gated (reviewer).
  - Judge issuing a verdict: auto, while calibration accuracy ≥ threshold (default 0.80 on a rolling-100-attempt calibration window); below threshold, new verdicts route as `pending_approval` with a `judge_quarantined` audit event until a calibration recovery run restores `auto`.
  - Documentation Agent drafting a report: auto. Publishing a report as an artifact: approval-gated (reviewer).
  - Regression Promotion adding a finding to the permanent suite: approval-gated (reviewer).
  - Adding a target URL to the allowlist: approval-gated (admin).
  - Flipping data-mode synthetic → real_phi: approval-gated (admin) *plus* `baa_acknowledged` boolean (a named system-reserved row in `policy_values`, set only by admin via a dedicated `/settings/baa` action page that displays the BAA document hash and requires the admin to type the document hash to confirm — the data-mode flip server action refuses if `baa_acknowledged` is false even when admin approval is present).
  - Raising per-campaign or per-day budget cap: approval-gated (admin).
  - Per-campaign budget consumed beyond cap: deny + cancel worker job; audited.
  - Per-day rolling spend beyond cap: deny new campaign launches and new agent passes until window resets; audited.
  - Low-signal stop rule triggered (per `ARCHITECTURE.md`): halt remaining seeds in run; mark partial; audited.
  - `policy:write` (editing the policy values table): approval-gated (admin) + self-protected (per R15).
  - Cancelling a running campaign by an operator: auto, audited (kill switch).
- R17. Every state-changing action writes an immutable audit event with timestamp, actor, action, target, outcome, rule reference, and policy-values snapshot hash. A SQLite `BEFORE UPDATE` and `BEFORE DELETE` trigger on `audit_events` raises an error unconditionally — the table is physically append-only regardless of which process holds the connection (web or worker). Audit events cannot be updated or deleted through any public server route, any worker code path, or any direct DB write.

**Self-improvement loop (worker-hosted)**
- R18. Red Team, Orchestrator, Judge, and Documentation agent passes all run inside the Python worker process (a child process of the Railway container, supervised by the process supervisor), invoking Pydantic Graph nodes. Triggers: ingest events enqueue `agent_pass` jobs onto `campaign_jobs`; a periodic worker-side sweep (cron interval = `policy_values.orchestrator_sweep_cadence`, default 4h) covers what events miss. Each pass invokes a Pydantic Graph end-to-end inside the worker and writes its own artifact/audit. Per-pass wall-clock and token-budget caps are enforced deterministically by the Safety Gate. This aligns with `ARCHITECTURE.md`'s Pydantic Graph + Pydantic AI agent design.

  **Pillar 5 fallback:** If the LLM-driven loop slips during implementation, R18-R20 ship with a deterministic mutation library replacing the LLM-driven Red Team variant generation (rule-based prompt mutations from a checked-in pattern library) and a coverage-gap-driven scheduler replacing the LLM-driven Orchestrator (still proposes to `/approvals` for new-category; auto-schedules regression sweeps based on staleness). In this fallback, R19's `seed_versions` rows still populate (deterministic variants instead of LLM variants) and R20's proposals still appear at `/approvals` (deterministic ranking instead of LLM ranking); F3 and F7 retain their shapes. AE6 and AE11 hold under both modes.
- R19. Red Team consumes recent partial/fail attempts plus the seed library and produces variant proposals as `seed_versions` rows with status (`auto_approved`, `pending_approval`, `rejected`). Auto-approved variants enqueue as new `campaign_jobs`. Per-category pending-approval cap (default 10) gates auto-generation per R16.
- R20. Orchestrator consumes coverage state, open findings, recent regressions, and remaining budget, and produces campaign proposals on the dashboard plus auto-scheduled regression sweeps within policy. New-category proposals route through the approvals queue at `/approvals`. When remaining daily budget < cheapest regression sweep cost, Orchestrator selects the highest-priority subset that fits, writes a `sweep_partial_budget` audit event listing the skipped seeds, and surfaces the skipped count on the dashboard. Sweep ordering is by (severity, last-failure-recency).

**Operational controls**
- R21. The schedule page displays configured cron windows read from app configuration; the first cut is read-only. Operators see next firing times, scope, and last result per window. Empty state ("No schedule configured — add an entry to `policy_values.orchestrator_sweep_cadence`") renders when no windows are active; failed last-result renders with an amber chip.
- R22. The secrets page lists configured environment seams by name, scope (deploy / runtime / auth), state (configured / planned / missing), and what each unlocks. The application never reads secret values to render the page — only presence and intended purpose. For `admin` only, each secret row opens a right-rail drawer with rotation guidance + last-rotated date (when known) + rotation runbook reference; the row label is `View · Rotation` for admin and `View` for other roles.
- R23. The targets page surfaces live health derived from polling the deployed and local `/readyz` endpoints on configurable cadence, surfacing the FHIR / audit / LLM / ingest sub-checks already returned by the existing payload. Health results cache so the page is fast to render. The same surface includes a "worker health" tile showing the worker child process status (heartbeat freshness, last graph node executed, queue depth, recent backpressure events).
- R24. The console exposes a kill-switch action on every running campaign: operators can cancel via a confirmation modal with an optional free-text reason field. On submit, the row flips to `cancelling` immediately (optimistic), then `cancelled` once the worker confirms termination; partial-cancelled artifacts render in the campaign detail with a distinct amber chip and `partial-cancelled` label. Cancellation writes an audit event capturing actor + reason (or "cancelled by operator" when blank).

**Approvals queue surface**
- R25. The approvals queue lives at `/approvals` with a sidebar nav entry and a pending-count badge. The badge count is **role-filtered**: operators see operator-actionable items; reviewers see reviewer-actionable items; admins see the full queue. Items group by approval type (seed mutation, new-category campaign, regression promotion, report publish, allowlist change, data-mode flip, budget cap raise, `policy:write`, `judge_quarantined` verdict, BAA acknowledgment). Each queue row shows type label, requester, target object, policy rule cited, and submission time. Clicking a row opens a per-type detail view:
  - **Seed mutation:** original seed + variant + diff + the partial-success attempt that triggered the mutation.
  - **New-category campaign:** proposed target + categories + budget + Orchestrator rationale.
  - **Regression promotion:** finding + reproduction transcript + draft report.
  - **Report publish:** draft report (full) + finding link + reviewer comment field.
  - **Allowlist change:** target URL + requester + Safety Gate normalized origin.
  - **Data-mode flip:** current mode + proposed mode + `baa_acknowledged` state (must be true before this entry exists) + admin who set it.
  - **Budget cap raise:** old cap + new cap + justification.
  - **`policy:write`:** policy_values diff (before/after table) + Safety Gate's self-protection check result.
  - **`judge_quarantined` verdict:** the attempt transcript + the verdict text + calibration accuracy at the time + a single "Approve verdict" button (applies only this verdict; Judge stays in quarantine until a calibration recovery run restores auto).
  - **BAA acknowledgment:** when admin sets `baa_acknowledged`, the action lives at `/settings/baa` (not in the approvals queue) — it's a precondition, not a reviewable approval.

  Approve/reject is inline with an optional comment, required on reject; after action, the row leaves the queue and the actor sees a confirmation chip with audit link.

**Policy console page**
- R26. The policy console lives at `/settings/policy` with admin-edit and read-only-for-others access. Layout: each policy_values row renders as a labeled field card grouped by policy domain (Red Team, Orchestrator, Judge, Documentation, Promotion, Targets, Data Mode, Budget, System); admin sees inline edit affordances per field; submitting an edit routes the changeset through `policy:write` approval (the changeset is shown in the approvals queue as a single diff per R25). Pending edits show an amber "awaiting approval" badge on the affected field until the approval lands; on approve, the value updates atomically and an audit event references the approval record. System-reserved rows (`policy:write`, `baa_acknowledged`) render with a "Protected" badge and refuse direct delete (the Safety Gate would reject anyway, per R15).

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a user who is not signed in, when they request `/dashboard`, then they are redirected to `/login` and no application data is returned.
- AE2. **Covers R3.** Given an `operator` (without `target:manage`), when they attempt to add a target URL to the allowlist, then the action is blocked at the Safety Gate with an audit event citing the policy rule.
- AE3. **Covers R9.** When an operator submits `/campaigns/new` with a valid target and category, then the server action returns within one second and the campaign row exists with status `queued`.
- AE4. **Covers R11.** When the same artifact file is observed twice by the ingest pass, then the second observation produces no new campaign-detail-page rows or `findings` list changes (re-ingest is operator-invisible).
- AE5. **Covers R13.** Given a category whose seed passed in the prior three runs and failed in the most recent run, when the operator opens the category detail page, then the seed appears in the top-of-page regressed-seeds alert strip with timestamps for last pass and first fail.
- AE6. **Covers R16, R17.** When the Red Team Agent attempts to generate a mutation of a critical-severity seed, then the Safety Gate denies auto-execution, the variant lands as `pending_approval` in `/approvals`, and an audit event records the policy decision with rule reference.
- AE7. **Covers R6.** Given a target response artifact containing `<script>alert(1)</script>`, when an operator views the finding evidence pane, then the script tag renders as escaped text and no script executes in the browser.
- AE8. **Covers R6.** When a Red-Team-generated `seeds.title` contains a `<script>` payload, then it renders as escaped text on the findings index list and the approvals queue row (the untrusted-text boundary applies beyond the evidence pane).
- AE9. **Covers R10, R11, F5.** Given a container restart while a campaign's heartbeat is stale beyond threshold and `.complete` sentinel is absent, when the recovery pass runs, then the operator sees the campaign in `failed (orphaned)` state on the campaigns list with a relaunch button on the detail page.
- AE10. **Covers R24.** Given a campaign in `running` state, when an operator clicks cancel, confirms in the modal (with optional reason), then the row transitions optimistically to `cancelling`, then to `cancelled` once worker confirms; any partial artifact is preserved with a `partial-cancelled` marker; the campaigns list reflects the new status.
- AE11. **Covers R20.** Given the coverage gap leaderboard shows tool-misuse as the most under-tested category, when the Orchestrator agent pass runs, then a new-category exploration proposal appears in `/approvals` and no campaign is auto-launched.
- AE12. **Covers R23, F5.** When the worker child process is unresponsive (no heartbeat for > `heartbeat_staleness_seconds`), then the targets page worker-health tile shows "worker offline" with the last-seen timestamp; campaigns submitted during this window remain in `queued` state and the campaign detail page shows "worker offline since HH:MM — campaign will resume when worker recovers" rather than `failed`.
- AE13. **Covers R16, BAA.** Given `baa_acknowledged` is false, when an admin attempts to flip data-mode to `real_phi` (with admin approval present), then the action is denied at the Safety Gate, an audit event is written citing the BAA gate, and the data mode does not change.
- AE14. **Covers R9.** When two operators submit campaigns within the same second, then both campaign rows persist with distinct ULIDs, the worker drains them serially (single-replica, per Scope Boundaries), and the campaigns list shows the second campaign as `queued (1 ahead)` until the first completes.
- AE15. **Covers R15.** When an approved action's parameters are mutated between approval and execution, then the action fails at execution time with an "approval mismatch" notice visible to the actor and an audit entry citing the mismatch.
- AE16. **Covers R16 (Judge row), R25.** Given Judge calibration accuracy below threshold, when a new attempt completes, then its verdict appears in `/approvals` under a `judge_quarantined` group with the attempt transcript, the verdict text, and the calibration accuracy displayed; reviewer can approve the single verdict without restoring Judge to auto.
- AE17. **Covers R7.** Given a malformed seed file in `evals/seeds/` on first boot, when the seed library materializes, then the malformed seed is skipped with a `seed_library_partial` audit event and the dashboard surfaces a "seed library degraded" tile with the skipped seed names; the platform continues to serve campaigns from other seeds.
- AE18. **Covers R15, R26.** When an admin opens `/settings/policy` and attempts to delete the `policy:write` row, then the inline edit affordance shows a "Protected" badge and the delete control is disabled; if the admin bypasses the UI and submits a direct `policy:write` to remove the row, the Safety Gate refuses with a self-protection audit event.

---

## Success Criteria

- An authenticated operator can sign in, launch a real campaign against the deployed Clinical Co-Pilot from `/campaigns/new`, watch status transition without manual page refreshes feeling broken (via 3s client poll + revalidateTag on ingest events), and open the resulting finding detail page where the failed attempt traces back to its seed, run, and threat-model category through the right-rail Related panel.
- A reviewer can find and approve at least one pending action in `/approvals` (mutation, regression promotion, report publish, or judge-quarantined verdict) and see the result reflected in the relevant detail page plus audit ledger.
- A second person opening the console (with the seeded admin email) can navigate dashboard → finding detail → seed → run → category and understand the platform's state without reading the codebase.
- After a forced container restart while a campaign is running, the system reaches a consistent state automatically (the campaign either completes via ingest of its artifact or transitions to `failed (orphaned)` with a visible relaunch path) without operator intervention.
- A planning agent reading this doc can produce an implementation plan without needing to invent product behavior, scope boundaries, or success criteria — every requirement either describes observable behavior or names the structural reason it exists.
- A hospital-CISO-style review can ask "where does this system stop and ask a human?" and the answer is the visible policy table in R16 (with values editable in-console via `/settings/policy` and audit-logged on every change), backed by the append-only audit ledger in R17, plus the live `/approvals` queue.

---

## Scope Boundaries

- Real-PHI data mode is gated by the `baa_acknowledged` boolean + admin approval; no UI path enables it without both.
- Self-service password registration and a user-management UI. Operators are managed via the email allowlist and out-of-band.
- Slack mirror of console approvals. Slack can later link back to the canonical console surface.
- Multi-tenant or multi-organization support.
- Browser upload adapter for indirect-injection testing. Seeded in the threat model; deferred until the target exposes a tested ingest seam.
- External Redis queue, distributed queue infrastructure, or separate Railway worker service. The Python worker runs as a child process inside the same Railway container as the Next.js console (single deploy unit, single volume); the queue lives in SQLite (`campaign_jobs`).
- Worker survival of in-flight runs across container restarts. The combined-container shape means container restart kills both web and worker together; F5 + relaunch is the only recovery contract. Cross-container durability returns when the platform graduates to Postgres + object storage.
- Long-running FastAPI service from `ARCHITECTURE.md`. The worker is a queue-driven Pydantic-Graph child process, not a FastAPI service.
- Second-factor (passkey / TOTP) enforcement for `admin`. Pillar 1 ships single-factor email/password sign-in only; second-factor returns when the platform begins handling real PHI or enterprise SSO is introduced.
- `viewer` role and separate `owner` tier. Pillar 1 enforces three roles (admin / operator / reviewer); finer-grained access returns when a stakeholder signal arrives.
- Postgres migration. SQLite-only for now; graduation criteria from the existing deployment plan doc apply.
- Partial-run resumption inside an attempt sequence. F5 + relaunch (as a new campaign id linked via `relaunched_from`) is the recovery contract.
- Per-finding push notifications, Slack/email alerts, on-call paging.
- Cost forecasting beyond hard caps and the deterministic low-signal stop rule already specified in `ARCHITECTURE.md`.
- Public marketing page inside the console app.
- Node-native runner replacing the Python worker. Pydantic Graph in the Python worker is the runtime.
- Documentation Agent autonomously publishing reports without reviewer approval. Drafting is autonomous (F6); publishing is gated.

---

## Key Decisions

- **Single-container deployment with Python worker as a supervised child process.** Both Next.js and the Python worker run inside one Railway service behind a process supervisor. Rationale: Railway does not support mounting a volume across multiple services, which the prior dual-service redirect assumed. Single-container preserves the worker pattern (Pydantic Graph, queue, agent code in Python) without the volume-sharing impossibility. Trade: container restarts kill in-flight runs (F5 + relaunch is the recovery contract); accepted for current scale.
- **Enqueue-to-worker execution.** `/campaigns/new` enqueues a `campaign_jobs` row; the worker child process drains the queue and runs each campaign through `pydantic_graph.Graph` end-to-end. Rationale: matches `ARCHITECTURE.md`'s Pydantic Graph + Pydantic AI agent design, separates campaign execution from web request lifecycle, and lets the worker host all autonomous agent work (Red Team, Judge, Orchestrator, Documentation).
- **SQLite as system of record; artifacts on disk; append-only audit via DB trigger.** Queryable state lives in rows; raw transcripts live as files referenced by pointer with redaction status. `audit_events` has a SQLite `BEFORE UPDATE/DELETE` trigger that errors unconditionally — the table is physically append-only regardless of which process (web or worker) holds the connection. Rationale: historical analytics and self-improvement require queryable state; raw prompt/response payloads are too prompt-injectable and too large for DB cells; the trigger closes the worker-side direct-write tampering vector R17's route-level wording missed.
- **Tiered Safety Gate, not on-off.** The trust boundary distinguishes within-scope autonomous behavior from scope-expanding actions. Rationale: the assignment grades on this distinction explicitly; "everything is gated" signals lack of confidence; the policy table is the auditable artifact a CISO can read.
- **Hybrid policy storage: schema in repo (TS + Python mirror), values in DB with console UI + self-protection.** Policy schema is repo-checked-in with a Python mirror generated at build so the worker enforces the same rules as the web. Policy values live in `policy_values` and edit through `/settings/policy`. `policy:write` is itself approval-gated AND self-protected (Safety Gate refuses any `policy:write` that would remove a system-reserved row or downgrade its approval path below the schema-declared floor). Bootstrap reconstitutes missing system-reserved rows from `policy_seed.json`. Rationale: the console is the artifact a CISO trusts, so policy + policy-edit-audit live in the same surface; the Python mirror prevents schema drift between processes; self-protection closes the privilege-escalation path of an admin removing the approval gate.
- **Safety Gate runs in both processes; worker re-validates the full policy at claim time.** Web validates at row insert; worker validates again at claim time against the full policy table (not just approval canonical-hash), preventing direct-DB-insert bypass. Rationale: the worker is a separate Python process with its own DB connection; route-layer-only protection in R17/R15 would not have caught a compromised worker inserting `campaign_jobs` rows directly.
- **Coverage is derived, not materialized.** Rationale: coverage shifts every time a seed is added or a run completes; materializing it adds a sync job and a stale-rollup bug class.
- **Pillar 1 is full RBAC + CSRF + cookie hardening, not a login shell.** Three enforced roles (admin / operator / reviewer), policy-function RBAC at every server action, CSRF + strict session cookies, audit on auth events. Second-factor deferred.
- **Server-generated ULID campaign ids + execFile-style argument arrays + path-canonicalize on read AND write.** Closes command-injection, ULID collision, and path-traversal classes simultaneously. The write-side path jail applies to artifact writes, heartbeat writes, and sentinel writes — not only ingest reads.
- **Heartbeat protocol with explicit thresholds and three failure modes.** Python runner writes `{run_id}.heartbeat` per case iteration; on success writes `.complete`; on graph-node throw writes `.failed` with captured exception. F5 distinguishes `failed (graph_error)`, `failed (orphaned)`, and `completed` from each other so operators see the right diagnosis and the right next action.

### Risks

- **Pillar 5 (R18-R20) is the latest, riskiest pillar.** Document review flagged demo-risk if it ships rough. User accepted the trade in brainstorm and confirmed during doc review. R18's "Pillar 5 fallback" paragraph names a row-by-row degradation contract: deterministic mutation library + coverage-gap-driven scheduler replace the LLM-driven Red Team and Orchestrator while R19/R20/F3/F7/AE6/AE11 retain their shapes. Either mode satisfies the requirements.
- **Worker is a single-replica SPOF for all campaign execution and all agent work.** Combined-container shape means a container OOM or crash takes down both the web (briefly, during restart) and the worker (for the duration of the restart loop). Mitigation: operator-visible signal via the `targets`-page worker-health tile (R23) plus `/campaigns/{id}` "worker offline" UX (AE12). Distributed queue + multi-worker is the graduation path when single-replica fails in practice.
- **`policy_values` console page is a new attack surface.** Admin role compromise becomes higher impact: a compromised admin could attempt to weaken policy rows (mitigated by R15 self-protection: system-reserved rows and their approval-path floors cannot be removed or downgraded). The git-only model would have constrained policy changes to a PR with code review; the hybrid model widens the in-app mutation surface in exchange for CISO-readable audit alignment.

---

## Dependencies / Assumptions

- The existing `scripts/run_mvp_evals.py` is rewritten (or evolved) to: accept `--run-id <ulid>` as a required argument; use it verbatim as the artifact basename and as `run_id` everywhere in the artifact body; drop the `latest.json` copy when `--run-id` is supplied; emit `evals/results/{run_id}.heartbeat` (mtime-touched per case iteration) and `evals/results/{run_id}.complete` on success or `evals/results/{run_id}.failed` on Pydantic Graph node throw (with captured exception); refuse to start if `evals/results/{run_id}.json` already exists; exit code = process success/failure (not verdict counts). The worker invokes the runner via this contract.
- The deployed Clinical Co-Pilot at `https://clinical-copilot.up.railway.app` continues to expose `/readyz` with the FHIR / audit / LLM / ingest sub-checks documented in the existing README.
- Better Auth's SQLite adapter and email/password plugin remain compatible with Next 16 / React 19 / pnpm + Node 22. The implementation verifies email/password sign-in and account creation against the allowlist, confirms non-allowlisted emails are rejected before authentication, confirms revoked operator records cannot regain access, and records resolved version pins in repo lockfiles.
- The Railway deployment shape is a single service running both Next.js and the Python worker behind a process supervisor (e.g., `supervisord` in a Dockerfile-built image, or Bun spawning the Python worker child process at boot). A single `/data` volume holds the SQLite file plus artifact directory. `scripts/run_mvp_evals.py` and `evals/seeds/` ship inside the container image. The Python toolchain (Python 3.x + Pydantic Graph + Pydantic AI + the runner's existing deps) installs via a Dockerfile or `.nixpacks.toml`; version pins are recorded in this doc during the same spike as Better Auth.
- The threat-model categories listed in `THREAT_MODEL.md` remain stable enough to use as the coverage axis for pillar 4 drilldowns.
- Cost caps from `ARCHITECTURE.md` (per-campaign budget, per-day spend, low-signal stop rule) are enforced deterministically inside the Safety Gate per R16's explicit policy rows, not by agent reasoning.
- The deployment plan doc at `docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md` is updated in the same PR that implements this requirements doc, to reflect the single-container shape (rather than the dual-service shape briefly considered) and to remove `boundary-worker` from its "Deferred services" list.
- `ARCHITECTURE.md` is updated in the same PR to reflect the worker-as-child-process Pydantic Graph execution (replacing the long-running FastAPI control plane with a queue-driven worker host).

---

## Outstanding Questions

### Resolve Before Planning

(none — round-2 review surfaced a P0 architectural redirect which is now resolved as the single-container shape; everything else is either applied inline or routed to "Deferred to Planning" below)

### Deferred to Planning

- [Resolved][Affects R2][Technical] Social providers are removed for the demo; email/password with allowlisted operators is the implemented auth path.
- [Affects R5, R15][Technical] ORM/query layer choice over SQLite (Drizzle vs better-sqlite3 vs Kysely) for the TypeScript side; the Python side picks `aiosqlite` or `sqlite3` to match.
- [Affects R9][Technical] Process supervisor choice for the combined container (`supervisord`, `s6-overlay`, Bun spawning the Python child directly, or a Dockerfile multi-stage with explicit start-command sequencing).
- [Affects R11][Technical] Periodic ingest-sweep cadence on the web side (default and the policy_values knob).
- [Affects R15][Technical] Build-time mechanism for generating the Python policy-schema mirror from the TypeScript source-of-truth (codegen script, JSON-schema-as-interchange, or hand-maintained twin with a CI check).
- [Affects R23][Technical] `/readyz` polling cadence and whether the cache is in-memory, file-backed, or DB-backed.
- [Affects R6][Technical] Redaction boundary specifics — what gets redacted from artifacts during ingest vs at render time.
- [Affects R16, R19][Technical] Tunable defaults: per-category pending-approval cap (default 10), Judge calibration threshold (default 0.80), Judge calibration window size (default rolling-100 attempts), `heartbeat_staleness_seconds` (default 300s), `claim_timeout_seconds` (default 600s), `orchestrator_sweep_cadence` (default 4h).
- [Affects AE9, AE12, AE14, AE15][Technical] These four AEs reference internal state transitions (claim_token release, audit event names, queue claim semantics, canonical-hash detection) that planning may relocate from acceptance criteria into integration tests. The user-observable behavior remains in this doc; the implementation-mechanism portions migrate.
- [Affects R26][Technical] Inline-edit vs batch-edit model for the policy console — per-row edits each route through `policy:write` approval individually, or whole-table edits submit as one changeset routed as a single `policy:write` approval.
- [Affects R20][Technical] Default Orchestrator sweep cadence and the per-day pass-budget shared between Red Team and Orchestrator.
