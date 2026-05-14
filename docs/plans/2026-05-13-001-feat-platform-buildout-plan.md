---
title: Boundary Labs Platform Buildout — Five-Pillar Implementation Plan
type: feat
status: completed
date: 2026-05-13
origin: docs/brainstorms/2026-05-13-platform-buildout-requirements.md
---

# Boundary Labs Platform Buildout — Five-Pillar Implementation Plan

## Summary

Implement the five-pillar buildout in 12 atomic-commit-sized units across 4 phases: foundation (Dockerfile + supervisor + pnpm/Node runtime, SQLite schema with append-only audit trigger, Better Auth + RBAC, Safety Gate with hybrid policy storage), execution wiring (entity repositories, Python worker hosting Pydantic Graph, campaign launch flow, minimal CISO-visibility surfaces), operator surfaces (drilldowns, approvals queue, settings pages split by priority), and operational polish (CI, ARCHITECTURE / deployment-plan sync). Single-container deployment with `supervisord` running Next.js + Python worker as supervised children; `better-sqlite3` on the Node side, `aiosqlite` on the Python side, sharing one SQLite file on the `/data` volume with WAL mode and a `BEFORE UPDATE/DELETE` trigger making `audit_events` physically append-only. Package manager is **pnpm**; runtime is **Node 22**; Bun is removed.

The CISO-readable trust surface is R16 (policy table) + R17 (audit ledger) + `/approvals` (HITL queue). Worker mechanics, sentinel protocol, ULID ids, canonical-hash re-validation, and append-only DB enforcement are infrastructure that makes those surfaces trustworthy — not the surfaces themselves. Phase 2 includes minimum read-only CISO-visibility surfaces (`/audit`, `/settings/policy` view-only) so the trust artifact is demonstrable even if Phase 3 slips.

---

## Problem Frame

The console is a fixture-backed shell with no auth, no persistence, no audit, no execution. The origin requirements doc enumerates the full target state across 26 requirements, 7 flows, and 18 acceptance examples. This plan sequences the path from current state to that target without re-litigating product behavior; it commits plan-time technical decisions (driver, supervisor, codegen, runtime/package manager) that the origin deferred to planning, and routes plan-shape sequencing so every unit lands as a reviewable, atomic change. See origin: `docs/brainstorms/2026-05-13-platform-buildout-requirements.md`.

---

## Requirements

All 26 origin requirements are in-scope and traced via R-IDs below. Origin-document IDs are preserved verbatim so cross-references stay valid.

- R1–R4: Auth + RBAC foundation (Better Auth, 3 roles, CSRF, cookie split, operator records)
- R5–R8: Persistence and data layer (SQLite system of record, write+read path-jail, seeds materialization, derived coverage)
- R9–R11: Campaign execution (enqueue-to-worker, status derivation, idempotent ingest with natural keys)
- R12–R14: Drilldowns and analytics (finding↔seed↔run↔category, coverage IA, dashboard layout)
- R15–R17: Trust boundary (hybrid policy, tiered policy table, append-only audit ledger)
- R18–R20: Self-improvement loop (worker-hosted agent passes, seed_versions, Orchestrator scheduling)
- R21–R24: Operational controls (schedule, secrets, targets+worker health, kill-switch)
- R25: Approvals queue surface
- R26: Policy console page

**Origin actors:** A1 (Admin), A2 (Operator), A3 (Reviewer), A4 (Red Team), A5 (Orchestrator), A6 (Judge), A7 (Documentation), A8 (Safety Gate). All carried forward.

**Origin flows:** F1 (launch campaign), F2 (ingest), F3 (Red Team mutation), F4 (reviewer approves regression promotion), F5 (container restart recovery), F6 (Documentation drafts), F7 (Orchestrator schedules).

**Origin acceptance examples:** AE1–AE18 — each is referenced by `Covers AE<n>` in the relevant unit's test scenarios.

---

## Scope Boundaries

All 13 origin Scope Boundaries are inherited verbatim (see origin: `docs/brainstorms/2026-05-13-platform-buildout-requirements.md` → Scope Boundaries).

### Deferred to Follow-Up Work

- Authoring missing seeds for the ~25 threat-model categories listed in `THREAT_MODEL.md` but not yet under `evals/seeds/`. Origin R7's skip-and-audit semantics cover the partial seed library.
- Migration of legacy `var/artifacts/campaigns/*.json` files. R5 specifies skip-and-orphan-audit.
- Retiring `.gitlab-ci.yml` was superseded during provider-proof hardening; GitLab is retained as a mirror path for verification, manual provider-proof campaigns, readiness audit, and Railway runtime-env preflight.
- Finer-grained CI gates (matrix runs, mutation testing, performance regression).
- Backfilling `docs/solutions/` with prior-art learnings. Empty institutional corpus today.
- CODEOWNERS + branch protection setup. Skipped for Pillar 1 (solo-owned project); R15's named-reviewer enforcement is documented as un-enforced in the Risks table until a second contributor lands or branch protection is configured.
- Full deterministic-mutation-library fallback activation (UX, monitoring). The fallback ships full but hidden in U6 per the demo-mode decision; activating it as the default would be a follow-on policy_values edit + UI work.

---

## Context & Research

### Relevant Code and Patterns

- **Server-side domain folder pattern:** `apps/web/src/server/campaigns/{fixtures.ts, repository.ts, types.ts, index.ts}` is the canonical shape every new entity folder mirrors.
- **Server action pattern:** `apps/web/src/app/(app)/campaigns/new/{actions.ts, page.tsx}` — server action lives next to its consuming page. The hardcoded `currentOperator` literal is the auth seam that U3 replaces (no intermediate state; full rewrite to `getCurrentOperator()` + Safety Gate happens in U3 with the full transactional shape, so U7 only adds the kill-switch and status-polling pieces).
- **Policy check pattern:** `apps/web/src/server/policies/index.ts` — current `can(role, action)` shape. U3 collapses 5 roles to 3 inline; U4 then refactors the file to delegate `can()` to `safety-gate/evaluate.ts` once that exists.
- **Fixture coupling:** every authenticated page imports from `@/server/campaigns/fixtures`. U5 migrates page-by-page; old fixture exports retire only after each page's repository swap lands. U5 is internally multi-commit (one commit per page swap) — explicitly acknowledged below.
- **Component primitives that exist:** `Button`, `Input`, `Panel`, `Chip`, `VerdictPill`, `SeverityBadge`, `RunRow`, `CoverageCell`, `EvidencePane` (already `<pre>`-escapes per R6), `AppShell`. These cover the bulk of visual vocabulary.
- **Eval runner shape today:** `scripts/run_mvp_evals.py` is dependency-free (stdlib only), mints `mvp-YYYYMMDD-HHmmss` ids, writes both `{id}.json` and `latest.json`, exit code is verdict-driven. U6 modifies it per the origin contract.
- **Existing `/healthz` + `/readyz`:** `apps/web/src/app/{healthz,readyz}/route.ts`. U11 extends `/readyz` with worker-health + SQLite integrity subchecks.
- **shadcn config:** `apps/web/components.json` anchors new-york style, RSC, neutral, lucide, aliases.
- **Severity vocabulary drift:** `evals/schemas/attack_case.schema.json` (`critical/high/medium/low/informational`) vs existing UI (`med`/`info`). Ingest normalizes at the boundary.
- **Existing test stubs:** `apps/web/tests/{health,smoke}.test.ts` are placeholders; U11 wires Vitest + Playwright.

### Institutional Learnings

`docs/solutions/` does not exist; no prior bug, decision, or pattern committed. Treating Better Auth + Pydantic Graph + SQLite WAL cross-language + supervisord + ULID + audit trigger + queue claim semantics + hybrid policy storage + heartbeat sentinels as net-new ground. Captured in U12 documentation notes as ce-compound seed material once landed.

### External References

Origin doc Dependencies section encodes external references for Better Auth, Pydantic Graph, Pydantic AI, Railway, SQLite WAL. The pre-planning spike at U3 verifies the Better Auth plugin combination against Next 16 / React 19 / pnpm + Node 22 and records resolved version pins back into the origin doc.

---

## Key Technical Decisions

These are plan-time technical decisions filling origin's Deferred-to-Planning items plus decisions made during plan-doc review.

- **Runtime: pnpm + Node 22. Bun is removed.** Replaces the Bun 1.3 toolchain. Resolves better-sqlite3 native-addon compatibility risk (better-sqlite3 is a Node N-API addon; runs natively on Node). Aligns with the prior deployment plan's `pnpm-workspace.yaml` reference. Trade: pnpm install is slower than Bun's, but install-cache CI tooling is mature.
- **Node SQLite driver: `better-sqlite3`.** Sync API matches Next.js Server Action transaction shape; WAL mode + 5000ms busy_timeout configured at connection time.
- **Python SQLite driver: `aiosqlite`.** Matches Pydantic Graph's async node model and Pydantic AI's async tool invocations.
- **LLM provider: OpenRouter for every agent.** `OPENROUTER_API_KEY` is the single provider secret. The `agent_provider_red_team`, `agent_provider_judge`, `agent_provider_orchestrator`, and `agent_provider_documentation` policy rows default to `openrouter`; per-role model variation uses OpenRouter model IDs in `BOUNDARY_*_MODEL`.
- **Process supervisor: `supervisord` in a multi-stage Dockerfile.** Two child processes: `next start` (web) and `python -m worker` (worker). Per-program config: `autorestart=true`, `stopasgroup=true`, `killasgroup=true`, `stopwaitsecs=30`. An `eventlistener` exits supervisord (and thus the container) when any child enters FATAL state so Railway's `restartPolicyType = ON_FAILURE` triggers a real container restart.
- **Python policy mirror: build-time codegen via execute-and-serialize.** `apps/web/src/server/safety-gate/schema.ts` exports a `policySchema` object; `scripts/codegen/emit-policy-json.ts` imports it and writes `worker/policy-schema.json` as `JSON.stringify(policySchema, null, 2)`. `scripts/codegen/policy_mirror.py` reads the JSON and emits `worker/safety_gate.py`. CI verifies the generated file matches what's checked in AND enumerates every action + system-reserved row from the JSON, asserting each is exercised by at least one test in `worker/tests/test_safety_gate.py`. Enumeration-driven parity is the load-bearing gate; file-diff is a backstop.
- **Policy edit model: per-row inline.** Each `policy_values` edit on `/settings/policy` is its own `policy:write` approval. System-reserved rows (`policy:write`, `baa_acknowledged`, `red_team_mode`, allowlist guards) are hidden from the grouped console view in U10a — they live in the schema but don't render as edit cards.
- **`red_team_mode` is system-reserved and hidden.** Defaults to `llm`; flips to `deterministic` only via direct policy_values mutation. Demo target is LLM-driven; deterministic fallback ships full but hidden so it's available if LLM path fails mid-demo without surfacing the toggle to a CISO viewing the policy console.
- **Test runner: Vitest (unit) + Playwright (E2E).** Vitest is the natural pick under pnpm + Node 22; Playwright covers App Router E2E and the XSS-escape integration scenarios (AE7/AE8).
- **ULID generation: `ulid` (npm) + `python-ulid`.** Lexicographically sortable, no Postgres dependency, common canonical format both sides parse.
- **Migration runner: idempotent, transactional per file.** Each migration in `apps/web/src/server/db/migrations/NNNN-*.sql` executes inside `BEGIN; … COMMIT;` so partial application is impossible. `schema_migrations` table tracks applied migrations. Web container's entrypoint runs migrations before supervisord launches children. Schema-ready handshake: worker waits up to 60s for `schema_ready` row in `policy_values`; on timeout, worker exits non-zero so supervisord (and Railway) restart.
- **Web-startup orchestration: `apps/web/src/instrumentation.ts`.** Next.js's documented startup hook hosts both U5's ingest sweep and U7's recovery sweep, run in order: recovery first (transition orphans), then ingest (materialize completed artifacts). A boot-id marker in `policy_values` guards against duplicate sweeps if Next.js instantiates the module multiple times.
- **CODEOWNERS skipped for Pillar 1.** Solo-owned project; R15 named-reviewer enforcement documented as unenforced in Risks. Branch protection + CODEOWNERS land as a follow-on when a second contributor or compliance review demands it.
- **Worker re-checks operator status at claim time.** Before executing any claimed `campaign_jobs` row, worker reads `operators.status` for the row's `submitted_by` field; refuses claim with `claim_refused_operator_revoked` audit + claim_token release if status ≠ `active`. Closes the revocation-propagation gap.
- **BAA hash source: Railway env var `BAA_DOCUMENT_HASH`.** Set out-of-band in Railway's secret store; `/settings/baa` reads from `process.env.BAA_DOCUMENT_HASH` at page render; admin types the value (obtained from a separate compliance workflow) to confirm. Hash is never in the repo. Strongest separation between policy and confirmation.
- **GitLab CI retirement superseded.** `.github/workflows/ci.yml` remains the primary PR/deploy gate, but `.gitlab-ci.yml` is retained as a mirror path for repo verification, manual provider-proof campaigns, readiness audit, and Railway runtime-env preflight.
- **Subprocess invocation contract: ULID only.** Worker invokes the eval runner via `subprocess.run(["python", "-u", "scripts/run_mvp_evals.py", "--run-id", ulid], shell=False)` — no other arguments. The runner reads target URL, categories, and budget from the `campaigns` / `campaign_jobs` rows by ULID.
- **CI event types.** `ci.yml` triggers on `pull_request` (not `pull_request_target`) and does not reference `RAILWAY_TOKEN`. `deploy-railway.yml` triggers only on push to protected branches and is the only workflow with `RAILWAY_TOKEN` in scope.
- **Per-category pending-approval cap semantics: absolute count.** Cap of 10 per category at any time; Red Team mutations refused beyond cap write `red_team_cap_exceeded` audit and are dropped (not requeued). Cap value lives in `policy_values` and is tunable.
- **Auth origin pinning.** `BETTER_AUTH_URL` env var pins the canonical app URL per environment. U3 verifies email/password session flow across dev / preview / production.
- **Diff component: single primitive with variant prop.** `diff.tsx` accepts `variant: "text" | "table"` — text variant for seed_version prompt diffs, table variant for `policy_values` before/after rows.
- **Threat-model category route uses slug column.** U2 schema adds `seeds.category_slug` (kebab-case, immutable); URL route is `/threat-model/[slug]`; renaming a category writes a new slug row + redirect entry rather than changing the slug.
- **`/settings/policy` accordion grouping.** Domain groups (Red Team, Orchestrator, Judge, Documentation, Promotion, Targets, Data Mode, Budget) are collapsible accordions; default-expanded for admin, default-collapsed for operator/reviewer. Domain jump-nav across the top.

---

## Open Questions

### Resolved During Planning

- ORM/driver choice: `better-sqlite3` (Node) + `aiosqlite` (Python).
- Process supervisor: `supervisord` in Dockerfile with eventlistener + per-program config.
- Policy mirror codegen mechanism: execute-and-serialize from TS exports + enumeration-driven CI check.
- Inline vs batch policy edits: per-row inline.
- Test runner: Vitest + Playwright.
- ULID library: `ulid` (npm) + `python-ulid`.
- Severity vocabulary normalization point: at ingest boundary; schema vocabulary canonical in DB.
- Legacy `var/artifacts/campaigns/*.json` handling: skip and audit-orphan.
- Runtime / package manager: pnpm + Node 22; Bun removed.
- LLM provider: both Anthropic + OpenAI, per-agent selection via policy_values.
- CODEOWNERS: skipped for Pillar 1; documented in Risks.
- Demo mode: LLM-driven primary; fallback ships full but hidden.
- U10 split: U10a (policy console + audit view) + U10b (BAA + secrets + schedule + worker-health).
- Phase ordering: minimum read-only CISO surfaces (audit + settings/policy view) ship in Phase 2 via U7.5.
- Worker re-check at claim time: yes; refuses claim for revoked operators.
- BAA hash source: Railway env var `BAA_DOCUMENT_HASH`.
- GitLab CI retirement: superseded; GitLab remains as a provider-proof mirror path rather than a primary deploy owner.
- Subprocess invocation: ULID-only argument array.
- CI event types: `pull_request` (not `pull_request_target`).
- Per-category cap: absolute count, refused mutations dropped + audited.
- Cancel reason: 1000-character cap, same cap on U9 reject comment.
- Migration safety: per-file transactions.
- Web-startup orchestration: `instrumentation.ts` runs recovery sweep then ingest sweep, guarded by boot-id marker.

### Deferred to Implementation

- Exact Better Auth plugin names and version pins — U3's pre-planning spike resolves and records into the origin doc Dependencies block.
- Concrete tunable defaults (`heartbeat_staleness_seconds`, `claim_timeout_seconds`, calibration threshold, sweep cadence) — seeded in `policy_seed.json` at U4 with reasonable initial values, tunable post-deploy.
- Exact Pydantic Graph node decomposition per agent — U6's graph implementation discovers the node split.
- Per-agent provider initial defaults can shift after U6 runtime testing reveals which models perform best for each role.
- Concrete supervisord config tuning beyond the named contract — sensible defaults in U1, tuning during U6 worker testing.

---

## Implementation Units

Units are grouped into 4 phases. Phase boundaries are sequencing aids, not gates — atomic-commit semantics mean any unit can land in its own PR. U5 is internally multi-commit (one commit per page migration); all others are single-commit-sized.

### Phase 1 — Foundation

- U1. **Dockerfile + supervisord + pnpm/Node 22 runtime + Railway volume mount**

**Goal:** Convert the deploy from NIXPACKS+Bun to a Dockerfile multi-stage build producing one container with pnpm-built Next.js + Python worker as supervised children. Mount `/data` volume for SQLite + artifacts. Replace Bun toolchain throughout.

**Requirements:** Origin R9, R10 enabling foundation.

**Dependencies:** None.

**Files:**
- Create: `Dockerfile` (multi-stage: pnpm install + build of `apps/web`; Python 3.12 + `worker/requirements.txt`; final stage composes both behind supervisord)
- Create: `docker/supervisord.conf` (web + worker programs, autorestart=true, stopasgroup=true, killasgroup=true, stopwaitsecs=30, eventlistener exit-on-FATAL)
- Create: `docker/entrypoint.sh` (run migrations before supervisord launches children)
- Create: `worker/requirements.txt` (`pydantic-graph`, `pydantic-ai`, `aiosqlite`, `python-ulid` — version pins recorded after U3 spike)
- Create: `pnpm-workspace.yaml` (workspace: `apps/web`)
- Modify: `package.json` (replace `packageManager: bun@1.3.12` with `packageManager: pnpm@<version>`; replace `bun` script invocations with `pnpm`; drop `workspaces` array in favor of `pnpm-workspace.yaml`)
- Delete: `bun.lock`
- Create: `pnpm-lock.yaml` (regenerated by `pnpm install`)
- Modify: `railway.toml` (switch `builder = "NIXPACKS"` → `builder = "DOCKERFILE"`; add `[[deploy.volumes]]` with `/data` mountpoint; remove buildCommand/startCommand)
- Modify: `apps/web/src/app/readyz/route.ts` (extend with worker-health subcheck reading `/data/worker.heartbeat` mtime + SQLite `PRAGMA integrity_check`)
- Modify: `apps/web/src/server/config.ts` (default `SQLITE_PATH=/data/boundary.db`, `BOUNDARY_ARTIFACT_DIR=/data/artifacts`; add `BETTER_AUTH_URL`, `BAA_DOCUMENT_HASH` env reads; add `OPENROUTER_API_KEY` readiness)
- Test: `tests/docker/smoke.test.sh` (build image, run, hit /healthz + /readyz)

**Approach:** Multi-stage Dockerfile. Stage 1: `node:22-alpine` + pnpm + build `apps/web` standalone. Stage 2: `python:3.12-slim` + install worker requirements. Final stage composes both with `supervisord`. `supervisord.conf` declares two programs with the named contract; eventlistener exits on FATAL so Railway restarts the container.

**Test scenarios:**
- Happy path: `docker build` succeeds; `docker run` starts both children; `/healthz` returns 200; `/readyz` returns 200 with worker-health subcheck.
- Error path: Python child fails to start → eventlistener exits supervisord → container exits non-zero → Railway restarts per `restartPolicyType=ON_FAILURE`.
- Edge case: Local dev without `/data` volume falls back to `apps/web/var/` via `BoundaryConfig`.
- Edge case: SIGTERM to container PID 1 → supervisord forwards via `stopasgroup=true` to both children → both shut down within `stopwaitsecs=30`.

**Verification:** Container builds locally; both processes appear in `supervisorctl status`; Railway preview deploy succeeds with `/healthz` green.

---

- U2. **SQLite schema + transactional migrations + WAL + append-only audit trigger + seed bootstrap**

**Goal:** Full persisted-entity schema with `better-sqlite3` connection, WAL + busy_timeout=5000, ULID columns, append-only audit trigger, transactional migration runner, first-boot seed materialization, policy_values bootstrap.

**Requirements:** Origin R5, R6 (path-jail config), R7 (seeds with skip-and-audit), R8 (coverage derived), R11 (natural keys), R17 (append-only audit).

**Dependencies:** U1.

**Files:**
- Create: `apps/web/src/server/db/client.ts` (better-sqlite3 + WAL pragma + busy_timeout)
- Create: `apps/web/src/server/db/schema.ts` (TS types per entity)
- Create: `apps/web/src/server/db/migrate.ts` (transactional, idempotent runner using `schema_migrations`)
- Create: `apps/web/src/server/db/migrations/0001_init.sql` (15 tables + indexes + audit trigger, wrapped in `BEGIN;…COMMIT;`)
- Create: `apps/web/src/server/db/migrations/0002_seed_library.sql` (idempotent helpers; adds `seeds.category_slug` column)
- Create: `policy_seed.json` (initial policy_values rows: all R16 actions, system-reserved rows including `policy:write`, `baa_acknowledged`, `red_team_mode=llm`, agent-provider defaults, tunable defaults)
- Create: `apps/web/src/server/seeds/bootstrap.ts` (scan `evals/seeds/`, materialize to `seeds` rows, skip-and-audit per R7, emit `seed_library_partial` audit on malformed files)
- Modify: `apps/web/package.json` (add `better-sqlite3`, `ulid` via pnpm)
- Modify: `docker/entrypoint.sh` (run migrations + policy_seed.json bootstrap + schema_ready write before supervisord starts)
- Test: `apps/web/tests/db/migrations.test.ts`, `audit-trigger.test.ts`, `seed-bootstrap.test.ts`

**Approach:** Each migration file executes inside `BEGIN; … COMMIT;` — partial application impossible. Migration runner uses `pragma user_version` for additive column changes. `bootstrap.ts` runs after migrations: scans `evals/seeds/`, validates via Zod schema, inserts to `seeds` table normalizing severity vocabulary at the boundary, audits malformed files.

**Test scenarios:**
- Happy path: Fresh DB → 15 tables + audit trigger + `schema_migrations` row + `seeds` populated from `evals/seeds/p0_mvp_cases.json` + `policy_values` populated from `policy_seed.json` + `schema_ready=true` row written.
- Happy path: Re-run migration on existing DB → no-op.
- Edge case (R7): Malformed seed JSON → seed skipped, `seed_library_partial` audit, other seeds load.
- Edge case: Migration crashes mid-file → restart → migration completes cleanly (transactional rollback removed all partial work).
- Error path (R17, AE18-adjacent): `UPDATE audit_events SET actor='other'` → trigger error; row unchanged.
- Error path (R17): `DELETE FROM audit_events WHERE id=1` → trigger error; row remains.

**Verification:** `pnpm run test apps/web/tests/db/*` passes; audit trigger provably append-only.

---

- U3. **Better Auth + 3-role RBAC + CSRF + cookie split + login flow**

**Goal:** Authenticated console: Better Auth on SQLite, email/password sign-in with email allowlist, 3 roles via policy function, CSRF, `SameSite=Strict` session cookies, operator records keyed by `(provider, sub)` with tombstone, first-deploy admin from env var. Replace the hardcoded operator literal AND wire the full `/campaigns/new` server action transactional shape (no intermediate state — U7 only adds the kill-switch and polling pieces atop this).

**Requirements:** Origin R1, R2, R3, R4, plus partial F1 (server action shape).

**Dependencies:** U2.

**Files:**
- Create: `apps/web/src/server/auth/{config.ts, session.ts, current-operator.ts}`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts` (Better Auth route handler)
- Create: `apps/web/src/middleware.ts` (redirect unauthenticated `/(app)/*` to `/login`; does NOT run boot sweeps)
- Create: `apps/web/src/instrumentation.ts` (Next.js startup hook; placeholder — U5 + U7 populate the boot orchestration)
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/server/operators/repository.ts` (insert-on-first-sign-in, tombstone, role lookup)
- Modify: `apps/web/src/server/policies/index.ts` (collapse 5 roles → 3; expand action enum to match R16; U4 will refactor to delegate)
- Modify: `apps/web/src/app/(app)/campaigns/new/actions.ts` (full rewrite: getCurrentOperator + Safety Gate stub + transactional insert across campaigns/campaign_jobs/audit_events + ULID redirect)
- Modify: `apps/web/package.json` (add `better-auth` + SQLite adapter via pnpm; pin versions from spike output)
- Test: `apps/web/tests/auth/{middleware,allowlist,tombstone}.test.ts`
- Test: `apps/web/tests/e2e/login.spec.ts`

**Execution note:** Run the Better Auth pre-planning spike at U3 start: install `better-auth` + chosen SQLite adapter against this exact Next 16 / React 19 / pnpm + Node 22 stack; verify email/password sign-in + account creation; verify session cookies; verify non-allowlisted email rejected during sign-up/sign-in; verify revoked (provider, sub) cannot re-register; record version pins in origin doc Dependencies. Spike failure blocks U3 only — U1 and U2 are spike-independent.

**Test scenarios:**
- Covers AE1. Unauthenticated → `/dashboard` → 302 → `/login`.
- Covers AE2 (revised). Operator without `target:manage` → POST `/settings/allowlist` blocked at Safety Gate + audit.
- Happy path: Allowlisted email signs in → operator row exists `status=active` → session cookie has `SameSite=Strict` + HttpOnly + Secure.
- Error path: Non-allowlisted email → sign-up/sign-in rejects; no session; no operator row.
- Error path: Revoked operator signs in → session refused.
- Edge case: First-deploy admin seeded from `BOUNDARY_OWNER_EMAIL` → admin role on first matching sign-in.
- Integration: CSRF token enforced on POST `/campaigns/new`; cross-origin form submission rejected.

**Verification:** Playwright login + privileged-action flow passes.

---

- U4. **Safety Gate + hybrid policy storage + Python mirror codegen + enumeration parity CI**

**Goal:** Safety Gate shared library imported by web + worker. Policy schema in TS; Python mirror generated at build time via execute-and-serialize. Policy values in SQLite. `/settings/policy` console is U10a. `policy:write` self-protected against system-reserved-row deletion or approval-path downgrade.

**Requirements:** Origin R15, R16 (data structure), R17 (snapshot policy values into audit events).

**Dependencies:** U2, U3.

**Files:**
- Create: `apps/web/src/server/safety-gate/{schema.ts, evaluate.ts, canonical-hash.ts, snapshot.ts, load.ts, policy-write-guard.ts}`
- Create: `scripts/codegen/emit-policy-json.ts` (imports `policySchema` from schema.ts, writes `worker/policy-schema.json`)
- Create: `scripts/codegen/policy_mirror.py` (reads policy-schema.json, emits `worker/safety_gate.py`)
- Create: `worker/safety_gate.py` (codegen output, committed; CI freshness + enumeration parity check)
- Create: `worker/policy_values.py` (aiosqlite reader for live rows + canonical-hash + snapshot helpers)
- Create: `worker/tests/test_safety_gate.py` (parity tests; enumeration-driven coverage of every action + system-reserved row)
- Modify: `policy_seed.json` (extend from U2 stub: all R16 rows including system-reserved `policy:write`, `baa_acknowledged`, `red_team_mode`, agent-provider defaults, tunable defaults)
- Modify: `apps/web/src/server/policies/index.ts` (delegate `can()` to `safety-gate/evaluate.ts`)
- Test: `apps/web/tests/safety-gate/{evaluate,self-protection,canonical-hash,policy-loaded-audit}.test.ts`

**Execution note:** Author Python parity test enumeration first (test names = action enum entries) to anchor the codegen contract.

**Test scenarios:**
- Happy path: Boot with empty policy_values → policy_seed.json populates → `policy_loaded` audit with hash + diff.
- Error path (R15): Schema file missing → process refuses to start.
- Error path (R15): System-reserved row missing → policy_seed.json re-seeds the missing row.
- Covers AE18: Admin requests `policy:write` deleting `policy:write` row → denied + `policy_write_self_protect_denied` audit.
- Edge case: Admin requests `policy:write` downgrading `baa_acknowledged` approval_path to `auto` → denied (below schema floor).
- Integration: Run codegen → resulting `worker/safety_gate.py` enforces same rules as TS for every enumerated action.
- Covers AE15: Approved action with mutated canonical_hash → execution refused + `approval_mismatch` audit.

**Verification:** Enumeration parity test passes (every action exercised in both processes); codegen freshness CI check fails on stale Python mirror.

---

### Phase 2 — Execution wiring + minimum CISO surfaces

- U5. **Entity repositories + ingest pipeline + fixture migration (multi-commit unit)**

**Goal:** Repositories for every persisted entity per R5; idempotent ingest from artifact JSON; migrate 9 console pages from fixtures to repository reads; severity vocabulary normalized at ingest. **U5 is internally multi-commit** — one commit per page migration plus the foundational repository + ingest commits.

**Requirements:** Origin R5, R6 (read+write path-jail at repository boundary), R8 (coverage derived), R11 (natural keys + idempotency).

**Dependencies:** U2.

**Files:**
- Create: `apps/web/src/server/{operators,campaigns,runs,attempts,verdicts,findings,seeds,seed_versions,approvals,audit,jobs,reports,policy}/repository.ts`
- Create: `apps/web/src/server/ingest/{from-artifact.ts, sweep.ts, types.ts}` (Zod schema + path-jail + severity normalization)
- Create: `apps/web/src/server/coverage/query.ts`
- Modify: `apps/web/src/instrumentation.ts` (add ingest sweep to startup orchestration, after recovery sweep — see U7)
- Modify: `apps/web/src/server/campaigns/{repository.ts, types.ts}` (SQLite-backed; extended statuses; `claim_token`, `claimed_at`, `relaunched_from`, `cancelling`, `partial-cancelled`)
- Modify: `apps/web/src/server/campaigns/fixtures.ts` (retire exports as pages migrate)
- Modify (one per commit): `apps/web/src/app/(app)/{dashboard,campaigns,findings,coverage,seeds,agents,judges,targets,threat-model}/page.tsx`
- Test: `apps/web/tests/repositories/*.test.ts`, `apps/web/tests/ingest/{from-artifact,idempotency,sweep,path-jail}.test.ts`, `apps/web/tests/coverage/derived-query.test.ts`

**Approach:** Each repository is a thin typed wrapper over better-sqlite3 prepared statements. Ingest reads artifact, validates via Zod, normalizes severity (`medium`→`med`, `informational`→`info`), inserts in one transaction across `runs`+`attempts`+`verdicts`+`findings`+`finding_attempts` via `INSERT … ON CONFLICT DO NOTHING`. Read+write path-jail (`path.resolve` + `startsWith(BOUNDARY_ARTIFACT_DIR)`) at every ingest entry point and repository read site.

**Test scenarios:**
- Covers AE4. Same artifact ingested twice → no new rows; UI unchanged on second observation.
- Covers AE5. Seed passed 3 times then failed → ingest creates finding; coverage query surfaces in regressed-seeds.
- Edge case: Artifact path `../../etc/passwd` after canonicalization escapes → ingest refuses + audit.
- Edge case: Severity `medium` → DB stores `med`; UI renders `med`.
- Error path: Malformed artifact JSON → ingest skips + `ingest_failed_malformed` audit.
- Integration: Each migrated page renders against repository reads.

**Verification:** All 9 pages render empty-state cleanly; once test artifact appears, ingest fires and pages populate.

---

- U6. **Python worker + Pydantic Graph agents + heartbeat/sentinel + LLM provider routing + runner contract rewrite**

**Goal:** Worker drains `campaign_jobs`, claims via atomic UPDATE, re-checks operator status, Safety Gate re-validates full policy at claim time, runs Pydantic Graph for agent jobs or spawns runner subprocess for campaign jobs. Heartbeat + `.complete`/`.failed` sentinels. F5 recovery on startup. Modify runner per origin contract. LLM provider per agent role from policy_values.

**Requirements:** Origin R9, R10 (worker side), R18, R19, R20, F1 (worker portion), F2 (sentinel emission), F3, F5 (worker startup sweep), F6, F7.

**Dependencies:** U2, U4, U5.

**Files:**
- Create: `worker/main.py` (boot, 60s schema_ready wait with exit-on-timeout, claim loop, graceful shutdown on SIGTERM)
- Create: `worker/queue.py` (atomic claim via `UPDATE … WHERE claim_token IS NULL AND status='queued' RETURNING id`; operator-status re-check at claim time)
- Create: `worker/heartbeat.py`, `worker/sentinels.py`, `worker/recovery.py` (worker startup sweep; three-mode F5 distinguishing `completed` / `failed (graph_error)` / `failed (orphaned)`)
- Create: `worker/path_jail.py` (write-side canonicalize + jail)
- Create: `worker/cron.py` (worker-side periodic Orchestrator/Red Team sweep, cadence from policy_values)
- Create: `worker/llm_provider.py` (reads `agent_provider_<role>` from policy_values; returns configured Pydantic AI model client; subprocess env scopes the API keys)
- Create: `worker/graphs/{red_team.py, judge.py, orchestrator.py, documentation.py}` (Pydantic Graph nodes)
- Create: `worker/fallback/{red_team.py, orchestrator.py}` (deterministic mutation library + coverage-gap scheduler; activated only when `policy_values.red_team_mode='deterministic'` — system-reserved + hidden from `/settings/policy` per Key Technical Decisions)
- Create: `worker/tests/{test_queue,test_heartbeat,test_sentinels,test_recovery,test_path_jail,test_graphs_judge,test_graphs_red_team,test_operator_recheck,test_llm_provider}.py`
- Modify: `scripts/run_mvp_evals.py` (add `--run-id` required arg; basename + run_id derived from arg; drop `latest.json` in run-id mode; write `.heartbeat` per case + `.complete`/`.failed` sentinels; refuse pre-existing artifact; exit code = process success only)
- Test: `worker/tests/test_run_mvp_evals_contract.py`

**Approach:** Worker boot waits for `schema_ready` (60s timeout → exit non-zero). Claim loop atomic via UPDATE … RETURNING. Each claim: re-check operator status; re-validate full policy via Safety Gate; if campaign job, spawn `subprocess.run(["python", "-u", "scripts/run_mvp_evals.py", "--run-id", ulid], shell=False, env=worker_env_with_llm_keys)`; if agent_pass job, dispatch to graph. Subprocess result interpretation: non-zero exit + no sentinel → worker writes `.failed` with `runner_crashed_no_sentinel`; `.complete` + missing JSON → `.failed` with `runner_completed_missing_artifact`; SIGTERM during shutdown → claim_token released (re-queue); live runner at worker shutdown → SIGTERM child before exit.

**Test scenarios:**
- Happy path: Worker claims campaign job → spawns runner → `.complete` → ingest materializes findings.
- Happy path: Worker claims agent_pass for Red Team → graph generates variants → Safety Gate auto-approves in-policy → variants land as seed_versions + new campaign_jobs.
- Covers AE6. Red Team mutates critical seed → Safety Gate denies → variant lands as `pending_approval` + audit.
- Covers AE11. Orchestrator pass finds tool-misuse most under-tested → proposal in `/approvals` (no auto-launch).
- Covers AE14. Two concurrent submissions → distinct ULIDs → worker drains serially → second campaign list shows `queued (1 ahead)`.
- Covers AE16. Judge calibration below threshold → verdicts route as `judge_quarantined` + rationale.
- Covers AE17. Malformed seed at boot → skipped + `seed_library_partial` audit; remaining seeds load.
- Edge case: Operator A submits campaign at T1; admin revokes A at T2; worker claims A's job at T3 → claim refused, `claim_refused_operator_revoked` audit, claim_token released.
- Edge case: Subprocess crashes before any sentinel → worker writes `.failed` with reason.
- Edge case: Worker SIGTERMed mid-run → claim_token released → next boot re-claims fresh.
- Error path (F5): Worker startup finds `running` row with no sentinel and stale heartbeat → `failed (orphaned)`.
- Error path (F5): Worker startup finds `.failed` sentinel → `failed (graph_error)` with captured exception.
- Integration: Full F1 flow — submit via `/campaigns/new` → worker claim → run → ingest.

**Verification:** Worker drains queue end-to-end against fixture target; sentinels appear at expected paths; Safety Gate parity holds.

---

- U7. **Campaign launch + status polling + kill-switch + recovery sweep (web side)**

**Goal:** Atop U3's already-rewritten `/campaigns/new`, add the kill-switch + cancellation flow + 3-second client polling + the web-side recovery sweep in `instrumentation.ts`. Update `/campaigns/{id}/page.tsx` to derive status + show last-checked timestamp between polls.

**Requirements:** Origin R10, R11 (web ingest trigger on read), R17 (audit ordering), R24 (kill-switch), F1, F5 (web portion).

**Dependencies:** U3, U4, U5.

**Files:**
- Create: `apps/web/src/app/(app)/campaigns/[campaignId]/cancel/actions.ts` (1000-char reason cap; transitions `running` → `cancelling` → `cancelled`; audit)
- Create: `apps/web/src/components/boundary/confirm-modal.tsx` (submitting state "Cancelling…" + disabled button; error inline; success closes; optional reason field with 1000-char cap)
- Create: `apps/web/src/components/boundary/campaign-status-poller.tsx` (client component; 3s revalidateTag tick; renders last-checked HH:MM:SS annotation in status row; no spinner between ticks)
- Create: `apps/web/src/server/recovery/web-startup-sweep.ts` (scan `campaigns` in `running` state; three-mode F5 check)
- Modify: `apps/web/src/app/(app)/campaigns/new/page.tsx` (handle `?relaunched_from=<id>` query param)
- Modify: `apps/web/src/app/(app)/campaigns/[campaignId]/page.tsx` (read campaign + run via repository; derive status; embed campaign-status-poller; relaunch button on `failed (orphaned)` with chain icon back to orphan)
- Modify: `apps/web/src/instrumentation.ts` (run recovery sweep first, then U5's ingest sweep, guarded by boot-id marker in policy_values)
- Test: `apps/web/tests/{campaigns/new-action,campaigns/cancel,recovery/web-sweep}.test.ts`
- Test: `apps/web/tests/e2e/campaign-launch.spec.ts` (Playwright)

**Approach:** Boot orchestration in `instrumentation.ts` writes a `boot_id` to policy_values, runs recovery sweep, then ingest sweep, then clears boot_id. Same module-load is idempotent because boot_id check is atomic. Status poller calls a tiny `revalidateTag` server action every 3s; page stays RSC; last-checked annotation comes from the server-action timestamp (rendered as forensic-console-style HH:MM:SS).

**Test scenarios:**
- Covers AE3. Submit `/campaigns/new` → row + queue + audit in 1 transaction; response < 1s.
- Covers AE9. Container restart + stale heartbeat + no sentinel → recovery transitions to `failed (orphaned)`; relaunch button visible.
- Covers AE10. Cancel running campaign → modal opens → optional reason ≤ 1000 chars → submit → `cancelling` → worker confirms → `cancelled`; partial-cancelled chip rendered.
- Covers AE12. Worker offline (no heartbeat within threshold) → campaign detail shows "worker offline since HH:MM — campaign will resume when worker recovers"; campaign stays `queued`.
- Edge case: Operator submits 5 campaigns simultaneously → 5 distinct ULIDs; no collisions.
- Edge case: Cancel reason of 1001 chars → server action refuses; form shows length error.
- Integration: Full F1 — submit → queue → claim → run → ingest → status flips to `completed`.

**Verification:** Playwright launch + cancel + relaunch flows pass.

---

- U7.5. **Minimum read-only CISO surfaces: /audit + /settings/policy view-only**

**Goal:** Ship read-only `/audit` ledger view and read-only `/settings/policy` console in Phase 2 so the CISO trust artifact (R16+R17+/approvals) is demonstrable even if Phase 3 slips. Both surfaces are read-only here; write affordances + approval routing land in U10a.

**Requirements:** Origin R17 (audit ledger surface), R26 partial (view-only), preserves trust narrative robustness.

**Dependencies:** U2, U3, U4, U5.

**Files:**
- Create: `apps/web/src/app/(app)/audit/page.tsx` (paginated audit_events list; filters by actor / action / target / time range; read-only)
- Create: `apps/web/src/app/(app)/settings/policy/page.tsx` (grouped collapsible policy_values cards by domain; read-only for all roles in U7.5; edit affordances + approval routing land in U10a)
- Modify: `apps/web/src/components/boundary/app-shell.tsx` (add `/audit` to `system` nav group; create new `// settings` group with `/settings/policy`; placeholder for U9's `/approvals` entry)
- Create: `apps/web/src/components/boundary/field-card.tsx` (read-only variant in U7.5; edit affordance added in U10a)
- Create: `apps/web/src/components/boundary/protected-badge.tsx` (system-reserved row indicator)
- Test: `apps/web/tests/audit/list.test.ts`, `apps/web/tests/settings/policy-read.test.ts`

**Approach:** Both pages are RSC reading from `audit/repository.ts` and `policy/repository.ts`. `/settings/policy` renders all non-system-reserved policy_values rows grouped by domain in collapsible accordions; system-reserved rows (`policy:write`, `baa_acknowledged`, `red_team_mode`, allowlist guards) are hidden. Field cards render read-only in U7.5; U10a swaps in the edit affordance for admin role.

**Test scenarios:**
- Happy path: Admin opens `/audit` → paginated list of audit events with filter chips.
- Happy path: Admin opens `/settings/policy` → 8 domain accordions, all collapsed, each expandable; system-reserved rows do not appear in the rendered list.
- Edge case: Operator opens `/settings/policy` → same read-only view (no role gating in U7.5 since there's no edit affordance to gate).
- Edge case: Audit list filter by `policy_loaded` action surfaces the boot-time entries.

**Verification:** CISO trust narrative is demonstrable end-to-end with just U1-U7.5 landed.

---

### Phase 3 — Operator surfaces

- U8. **Drilldowns: finding ↔ seed ↔ run ↔ category bidirectional + dashboard + coverage IA**

**Goal:** Land the four entity detail pages with right-rail Related-panel + ?from= referrer breadcrumb. Update dashboard R14 layout. Update coverage R13 IA. Per-seed sparklines. Pending-approval depth widget.

**Requirements:** Origin R12, R13, R14, AE5, AE7, AE8.

**Dependencies:** U5.

**Files:**
- Create: `apps/web/src/app/(app)/findings/[findingId]/page.tsx`
- Create: `apps/web/src/app/(app)/seeds/[seedId]/page.tsx`
- Create: `apps/web/src/app/(app)/threat-model/[slug]/page.tsx` (route uses `seeds.category_slug`)
- Modify: `apps/web/src/app/(app)/{findings,coverage,seeds,dashboard}/page.tsx` (link rows; R14 layout; R13 IA)
- Create: `apps/web/src/components/boundary/related-panel.tsx` (right-rail chip-list; expand-inline uses a disclosure-triangle accordion within the panel, making it a small client component)
- Create: `apps/web/src/components/boundary/{sparkline,kpi-cell,alert-strip,diff,empty-state-rail}.tsx`
- Create: `apps/web/src/components/boundary/breadcrumb-back.tsx` (reads `?from=<route>` query param; falls back to entity index page when absent)
- Test: `apps/web/tests/components/{related-panel,evidence-pane.escape}.test.tsx`
- Test: `apps/web/tests/e2e/drilldown.spec.ts`, `apps/web/tests/e2e/xss-escape.spec.ts`

**Approach:** Each detail page is RSC reading from entity repo + cross-link joins. Related-panel renders four other-node-type chips with disclosure expansion for run lists. Breadcrumb back-arrow reads `?from=` and falls back to entity index. `diff.tsx` accepts `variant: "text" | "table"` prop. Severity normalized at ingest; UI primitives keep `med`/`info`.

**Test scenarios:**
- Happy path: Dashboard → finding → seed → run → category drilldown chain.
- Covers AE5. Seed passed 3 prior runs, failed latest → category page top alert strip lists seed with timestamps.
- Covers AE7. `<script>alert(1)</script>` in artifact → evidence pane renders escaped.
- Covers AE8. Red-Team-generated seed title with script payload → findings list + approvals row render escaped.
- Edge case: Finding linked to 5 attempts across 3 runs → Related-panel shows run-chip count; click expands inline accordion.
- Edge case: Seed with 3 versions → seed detail chronological list with status chips + `diff variant="text"` expander.
- Edge case: Day-one dashboard → trend sparkline shows empty-state rail; cost-per-run tile hidden until 3 runs.
- Edge case: Arrive at finding from `/approvals/[id]` with `?from=/approvals/foo` → back-arrow returns to `/approvals/foo`.

**Verification:** Playwright drilldown roundtrip + XSS-escape spec pass.

---

- U9. **Approvals queue at /approvals with per-type detail views**

**Goal:** Land `/approvals` grouped queue with role-filtered pending-count badge in sidebar; per-type detail views (seed mutation, new-category campaign, regression promotion, report publish, allowlist, data-mode flip, budget cap raise, `policy:write`, `judge_quarantined`); inline approve/reject with required-on-reject comment (1000-char cap).

**Requirements:** Origin R25, R16, R17, F4, AE6, AE11, AE15, AE16.

**Dependencies:** U3, U4, U5.

**Files:**
- Create: `apps/web/src/app/(app)/approvals/{page.tsx, [approvalId]/page.tsx, actions.ts}`
- Create: `apps/web/src/components/boundary/approval-row.tsx`
- Modify: `apps/web/src/components/boundary/app-shell.tsx` (add `/approvals` to `review` group with role-filtered pending-count badge)
- Modify: `apps/web/src/server/approvals/repository.ts` (add `countByRoleFilter` helper for badge)
- Test: `apps/web/tests/approvals/{approve,reject,role-filter}.test.ts`, `apps/web/tests/e2e/approvals.spec.ts`

**Approach:** Grouped queue by `action` enum; per-type detail views dispatched by action field. Approve calls Safety Gate `evaluate()` with canonical-hash re-validation (R15, AE15). Pending-count badge resolves server-side based on current operator role. Reject requires 1000-char-max comment.

**Test scenarios:**
- Covers AE6 (visible side). Red Team mutation of critical seed → reviewer detail view (original + variant + diff:text + triggering attempt) → approve → variant auto_approved.
- Covers AE11. Orchestrator new-category proposal → reviewer approves → campaign enqueues.
- Covers AE15. Canonical hash mismatch (manual DB mutation in test) → approve refused + `approval_mismatch` audit.
- Covers AE16. Judge-quarantined verdict → reviewer detail shows transcript + verdict + calibration accuracy → "Approve verdict" applies this verdict only; Judge stays quarantined.
- Edge case: Reviewer tries to approve `policy:write` (admin-only) → UI hides approve button.
- Edge case: Reject without comment → form refuses; with 1001-char comment → form refuses.
- Edge case: Operator badge shows only operator-actionable types; admin badge shows full queue.

**Verification:** Playwright reviewer-approval flow passes.

---

- U10a. **Policy console + audit view edit affordances (CISO must-haves)**

**Goal:** Promote U7.5's read-only `/settings/policy` to a fully editable admin surface with `policy:write` approval routing, system-reserved row protection, and pending-edit amber badges. Audit view stays as U7.5 shipped (no edits needed). This is the second half of the CISO trust artifact (alongside U7.5's read-only first cut).

**Requirements:** Origin R26, R15 (write-side enforcement), AE18.

**Dependencies:** U4, U5, U7.5, U9.

**Files:**
- Modify: `apps/web/src/app/(app)/settings/policy/page.tsx` (admin sees inline edit affordances per field card; submitting routes through `policy:write` approval queue)
- Create: `apps/web/src/app/(app)/settings/policy/actions.ts` (edit server action → Safety Gate self-protection check → approval queue entry)
- Modify: `apps/web/src/components/boundary/field-card.tsx` (add edit variant + pending-amber-badge state)
- Test: `apps/web/tests/settings/{policy-edit,policy-self-protect}.test.ts`, `apps/web/tests/e2e/settings-policy.spec.ts`

**Approach:** Field cards conditionally render edit affordance when current operator is admin. Submit fires the action which calls Safety Gate self-protection (refuses delete/downgrade of system-reserved rows) and creates an `approvals` row tagged `policy:write` with the proposed diff. Pending edits show amber badge on the affected card until the approval lands.

**Test scenarios:**
- Covers AE18 (UI side). Admin attempts to delete the `policy:write` row via direct API call → Safety Gate refuses + `policy_write_self_protect_denied` audit; UI edit affordance is also hidden by the protected-badge guard.
- Happy path: Admin edits `red_team_pending_cap` from 10 → 15 → field shows amber pending badge → approval lands → value updates atomically.
- Edge case: Operator opens `/settings/policy` → still read-only; no edit affordances visible.

**Verification:** Playwright admin-policy-edit-through-approval flow passes.

---

- U10b. **Settings polish: /settings/baa + secrets admin drawer + schedule + targets worker-health tile**

**Goal:** Secondary settings surfaces — BAA confirmation, secrets rotation drawer, schedule display, worker-health tile on targets page. Can compress into U11 if Phase 3 pressure hits.

**Requirements:** Origin R21, R22, R23, AE13.

**Dependencies:** U2, U3, U5, U6 (for worker heartbeat data).

**Files:**
- Create: `apps/web/src/app/(app)/settings/baa/{page.tsx, actions.ts}` (reads `BAA_DOCUMENT_HASH` from `process.env`; admin types hash to confirm; sets `baa_acknowledged=true` with `BAA_DOCUMENT_HASH` value stored in audit event)
- Create: `apps/web/src/components/boundary/baa-confirm-input.tsx` (typed-hash confirmation)
- Create: `apps/web/src/server/worker-health/repository.ts` (reads heartbeat file mtime + claim_token state + recent backpressure events)
- Create: `apps/web/src/components/boundary/worker-health-tile.tsx`
- Modify: `apps/web/src/app/(app)/targets/page.tsx` (add worker-health tile + live `/readyz` polling)
- Modify: `apps/web/src/app/(app)/{secrets,schedule}/page.tsx` (drop fixtures; admin rotation drawer; configured cron windows from policy_values)
- Modify: `apps/web/src/components/boundary/app-shell.tsx` (add `/settings/baa` to `settings` nav group)
- Test: `apps/web/tests/settings/baa-flip-blocked.test.ts`

**Approach:** `/settings/baa` reads `BAA_DOCUMENT_HASH` from env at render; if absent, page shows "BAA not configured — set BAA_DOCUMENT_HASH in Railway env." Admin types the hash; submit validates string-equal and sets `baa_acknowledged=true`. Data-mode flip server action refuses if `baa_acknowledged=false` per AE13.

**Test scenarios:**
- Covers AE13. `baa_acknowledged=false` + admin attempts data-mode flip with admin approval present → denied + audit citing BAA gate.
- Happy path: Admin types correct BAA hash on `/settings/baa` → `baa_acknowledged=true` audit captures actor + hash + timestamp.
- Edge case: Admin types wrong hash → form refuses; no audit.
- Edge case: `BAA_DOCUMENT_HASH` env unset → page shows configuration notice; no confirm affordance.
- Edge case: Worker process down → targets-page tile shows "offline" with last-seen timestamp.

**Verification:** Playwright BAA confirmation + data-mode flip denial pass.

---

### Phase 4 — Operational polish

- U11. **CI workflow + deploy workflow updates + worker /readyz subchecks + runbook**

**Goal:** `.github/workflows/ci.yml` (pull_request trigger, no RAILWAY_TOKEN, lint + typecheck + Vitest + Playwright smoke + codegen freshness + enumeration parity check). Update `deploy-railway.yml` for Dockerfile build. Extend `/readyz` with full worker-health + SQLite integrity subchecks.

**Requirements:** Origin Dependencies (CI + readiness verification); origin R23 (operational visibility).

**Dependencies:** All U1-U10b landed.

**Files:**
- Create: `.github/workflows/ci.yml` (pull_request only, no deploy secrets, runs pnpm install + lint + typecheck + Vitest + Playwright smoke + codegen freshness diff + enumeration parity test + Python worker test)
- Modify: `.github/workflows/deploy-railway.yml` (push-to-main + manual dispatch; only workflow with RAILWAY_TOKEN; Docker build + Railway CLI deploy; policy_seed.json schema validation step)
- Modify: `.railwayignore` (ensure `worker/` and `policy_seed.json` included; `node_modules`, `var/`, `pnpm-store` excluded)
- Modify: `apps/web/src/app/readyz/route.ts` (add subchecks: worker heartbeat freshness, SQLite `PRAGMA integrity_check`, policy_values bootstrap state)
- Modify: `apps/web/src/components/boundary/app-shell.tsx` (final nav sweep: confirm group layout, scroll if overflow)
- Create: `docs/runbooks/worker-troubleshooting.md` (heartbeat staleness, graph_error vs orphaned diagnosis, drain queue manually, supervisorctl status)
- Modify: `README.md` (Docker-based local dev instructions; pnpm replaces Bun)

**Test scenarios:**
- Test expectation: minimal — CI workflow itself is the test surface.
- Edge case: PR with stale `worker/safety_gate.py` → freshness diff fails → PR blocked.
- Edge case: PR adds new action to schema but doesn't add parity test → enumeration check fails.
- Integration: First green CI run on this unit's PR.

**Verification:** First green CI; preview Railway deploy succeeds with all `/readyz` subchecks green.

---

- U12. **ARCHITECTURE.md + deployment plan sync + GitLab CI mirror**

**Goal:** Update ARCHITECTURE.md to reflect Pydantic Graph worker-as-child + hybrid policy + 3-role RBAC + single-container shape. Update the prior deployment plan to remove `boundary-worker` from Deferred services and reflect single-container. Keep `.gitlab-ci.yml` as a mirror path for repo verification, manual provider-proof campaigns, readiness audit, and Railway runtime-env preflight.

**Requirements:** Origin Dependencies (ARCHITECTURE.md + deployment plan sync commitments).

**Dependencies:** U11 has shipped at least one successful deploy.

**Files:**
- Modify: `docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md` (reflect single-container; remove `boundary-worker` from Deferred services; cross-reference this plan's U-IDs)
- Modify: `ARCHITECTURE.md` (replace FastAPI control plane with worker-as-child Pydantic Graph; update diagrams; note Better Auth + 3-role; reference this plan)
- Modify: `.gitlab-ci.yml`

**Test scenarios:**
- Test expectation: none — documentation-only unit.

**Verification:** Visual inspection of updated docs; final green GitHub Actions deploy plus GitLab mirror verification/proof jobs configured without owning primary deploy decisions.

---

## System-Wide Impact

- **Interaction graph:** Web + worker in one container sharing one SQLite file on `/data`. Safety Gate lives in both processes (TS canonical + Python codegen mirror, parity-tested). `audit_events` writes from both processes; trigger enforces append-only at DB level. Better Auth replaces hardcoded operator literal; every server action flows through `getCurrentOperator()` + Safety Gate. Pages migrate from fixtures to repositories per-commit in U5.
- **Error propagation:** Worker exceptions inside Pydantic Graph produce `.failed` sentinels with captured exception; F5 surfaces as `failed (graph_error)`. Web Safety Gate denials return inline error states (rule reference visible). Migration failures fail-fast at boot rather than partial-init.
- **State lifecycle risks:** Transition from JSON-file campaign metadata to SQLite is first-boot skip-and-orphan per R5. Concurrent ingest is idempotent via natural-key collision. Worker claim atomic via `UPDATE … WHERE claim_token IS NULL RETURNING`. Operator-status re-check at claim closes revocation gap. Container restart kills in-flight runs per F5 + relaunch contract.
- **API surface parity:** No external API changes. New internal routes: `/login`, `/approvals/*`, `/audit`, `/settings/{policy,baa}`, entity detail pages. `/healthz` + `/readyz` extended additively.
- **Integration coverage:** F1-F7 each get at least one E2E test proving cross-process flow. Playwright covers cross-boundary scenarios; Vitest covers unit-level repositories + components + Safety Gate.
- **Unchanged invariants:** Deployed Clinical Co-Pilot target untouched. Existing shadcn primitives keep CVA APIs. Design language preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Better Auth plugin matrix incompatibility with Next 16 / React 19 / pnpm + Node 22 | U3 pre-planning spike verifies; version pins recorded into origin doc |
| LLM provider API keys leak to web process via container env inheritance | Worker subprocess explicitly scopes env to include LLM keys; web process env does not include them; verified during U6 testing |
| SQLite cross-process write contention | WAL + busy_timeout=5000; write-domain split (web owns auth/audit/UI, worker owns queue-claim/graph outputs); escalation path documented if contention shows up |
| Codegen drift between TS schema and Python mirror | CI freshness diff + enumeration-driven parity test (every action exercised in both processes) |
| Worker single-replica SPOF | Operator-visible signal via worker-health tile + AE12 UX; supervisord autorestart for transient crashes; eventlistener exit on persistent FATAL triggers Railway restart |
| Pillar 5 LLM-driven loop ships rough | Deterministic fallback ships full in U6 but hidden (`red_team_mode=llm` default); `red_team_mode` is system-reserved and not visible in `/settings/policy` console; if LLM path crashes, admin can flip via direct DB mutation without exposing the toggle to a CISO |
| Page-by-page fixture migration breaks rendering | U5 is internally multi-commit; each page swap is its own commit with a render test before retiring the corresponding fixture export |
| Legacy `var/artifacts/campaigns/*.json` files | First-boot skip-and-orphan audit per R5; no data loss because legacy files are demo state |
| `audit_events` trigger blocks legitimate mutations | Trigger only blocks UPDATE/DELETE — INSERT always allowed; corrections append new audit rows that supersede older ones |
| Policy schema changes during implementation invalidate seeded values | `policy_seed.json` checked into repo; CI verifies seed parses against current schema |
| Pydantic Graph + Pydantic AI version churn | Pinned versions in `worker/requirements.txt`; CI installs from pinned set; upgrade is a deliberate PR |
| CODEOWNERS skipped for Pillar 1 — R15 named-reviewer requirement is unenforced | Documented; revisit when a second contributor lands or compliance demands it. Self-protection guard (`policy:write` refuses delete/downgrade of system-reserved rows) provides the runtime backstop |
| Migration crash mid-file (disk full, OOM) | Per-file `BEGIN;…COMMIT;` transactions; partial application impossible; restart re-runs cleanly |
| Worker boot fails (Pydantic Graph import error, malformed seed lib) | Supervisord eventlistener exits on FATAL → Railway restarts container; `/readyz` worker subcheck surfaces the FATAL state if it persists |
| `BAA_DOCUMENT_HASH` env var leak in deployment env | Set out-of-band via Railway secrets; never in repo; rotation guidance in U10b admin secrets drawer |
| Cancel reason / reject comment unbounded length | 1000-char cap enforced server-side in U7 + U9 |
| Sidebar nav overflow on small viewports | Sidebar scrolls if total content exceeds viewport height; U11 nav sweep confirms |

---

## Documentation / Operational Notes

- `docs/runbooks/worker-troubleshooting.md` (created U11) covers heartbeat freshness, graph_error vs orphaned diagnosis, manual queue drain, supervisorctl status, log paths.
- `ARCHITECTURE.md` updated in U12 to reflect worker-as-child Pydantic Graph, hybrid policy, 3-role RBAC, single-container, pnpm + Node 22 runtime.
- `docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md` updated in U12 for single-container + remove `boundary-worker` from Deferred services.
- `README.md` updated for Docker-based local dev + pnpm in U11.
- Once units land, capture non-obvious decisions via `/ce-compound` into `docs/solutions/` — Boundary Labs has substantial novel patterns (cross-language SQLite WAL, single-container Node+Python supervisor, hybrid policy with self-protection, audit trigger semantics, codegen enumeration parity) worth surfacing for future agents.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-13-platform-buildout-requirements.md](docs/brainstorms/2026-05-13-platform-buildout-requirements.md)
- **Architecture reference:** `ARCHITECTURE.md` (updated in U12)
- **Prior deployment plan:** `docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md` (updated in U12)
- **Threat model:** `THREAT_MODEL.md` (category list materialized as `seeds` rows in U2)
- **Existing eval runner:** `scripts/run_mvp_evals.py` (modified in U6)
- **Existing repository pattern:** `apps/web/src/server/campaigns/{repository,types,index}.ts`
- **Existing component primitives:** `apps/web/src/components/{ui,boundary}/`
- **Railway deploy:** `railway.toml` + `.github/workflows/deploy-railway.yml` (replaced with Dockerfile build in U1 + U11)
