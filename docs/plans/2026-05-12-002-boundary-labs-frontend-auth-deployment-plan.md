---
status: active
created: 2026-05-12
origin: README.md, ARCHITECTURE.md, THREAT_MODEL.md
---

# Boundary Labs Frontend, Auth, and Deployment Plan

## Problem Frame

Boundary Labs has a working MVP evaluation harness, threat model, architecture document, and deployed target proof. The next step is a deployable dev/demo web application: an authenticated security console that operators can use to launch campaigns, review findings, approve high-risk actions, inspect evidence, and manage regression promotion.

This should not become a UI wrapper around one Python script. The frontend should be the operator surface for the full Boundary Labs platform described in `ARCHITECTURE.md`: Security Console, control plane, Campaign Runner, Safety Gate Service, Target Adapter, storage, audit, and observability.

## Recommendation

Build a single-service app first:

- `apps/web`: Next.js App Router console, TypeScript, server-rendered authenticated UI, route handlers/server actions for the control plane, deployed as one Docker-backed Railway service.
- `worker/`: Python worker hosted in the same container as a supervised child process. It claims SQLite `campaign_jobs`, runs the Pydantic Graph path, writes sentinels/artifacts, and mirrors Safety Gate policy from generated code.
- `scripts/run_mvp_evals.py`: the deterministic runner contract used by the worker for campaign execution artifacts.

Use Tailwind CSS 4 and shadcn/ui as the React component foundation. The static designs in `designs/` are the visual source of truth and should be rebuilt as composable React components, not embedded as HTML exports or inline-style ports.

Use Better Auth as the application auth layer in `apps/web`, backed by SQLite for the demo. Better Auth gives us a TypeScript-native auth surface with database-backed sessions, plugins for admin controls, two-factor auth, passkeys, organizations/RBAC, API keys, and SSO/OIDC. The demo uses email/password so it can run without external identity-provider setup; keep authorization decisions inside Boundary Labs.

Default auth path:

- MVP/demo mode: Better Auth email/password sign-in, explicit email allowlist, database sessions, and app-side role assignment.
- Stronger demo mode: Better Auth passkeys or two-factor plugin required for owners/admins.
- Production/security-demo mode: Better Auth SSO/OIDC plugin pointed at WorkOS, Auth0, Okta, Google Workspace, or another enterprise IdP with MFA, org membership, sign-in logs, and a BAA path before any real PHI use.

Deployment target:

- One Railway service for `boundary-web`, built from the root `Dockerfile`.
- `supervisord` runs `next start`, `python -m worker`, and the fatal-exit listener as sibling processes.
- One persistent Railway volume mounted at `/data` for SQLite and artifacts.
- GitHub Actions owns CI and deploy orchestration using a Railway project token and a `demo` GitHub Environment.

This keeps the UI modern, keeps deployment simple, and avoids spending time on extra infrastructure before the product surface proves itself. Postgres, a separate FastAPI service, and horizontally scaled workers remain planned upgrade paths.

## Scope

### In Scope

- Authenticated operator console.
- Role-based access control.
- Target allowlist management.
- Campaign launch and campaign details.
- Eval result and finding review.
- Approval queue.
- Audit log.
- GitHub Actions CI/CD.
- Dev/demo deployment to Railway.
- Security controls for synthetic data now and PHI-ready boundaries later.

### Out of Scope For First Frontend Cut

- Real PHI campaigns.
- Self-service password registration.
- Multi-tenant billing.
- Autonomous remediation or code-fix generation.
- Browser upload adapter for indirect injection, except as a visible planned surface.
- Full Slack approval implementation, unless time permits after console approvals.

## Architecture

```text
Browser
  -> apps/web Next.js console
    -> Better Auth
    -> SQLite on /data
    -> Safety Gate + approvals + audit
    -> SQLite campaign_jobs queue
    -> supervised Python worker
    -> Artifact Store on /data
    -> Clinical Co-Pilot target
```

The browser never calls the target directly. All campaign and evidence operations flow through server-side Next.js route handlers/actions, where Safety Gate, RBAC, target allowlists, rate limits, and audit logging are enforced.

## Core Product Surfaces

### 1. Dashboard

Purpose: morning triage.

Shows:

- Campaigns needing attention.
- Findings awaiting triage.
- Approvals awaiting decision.
- Latest deployed target readiness.
- Latest regression status.
- Cost/budget warnings.

### 2. Campaigns

Views:

- Campaign list with status, target, categories, started by, cost, and result counts.
- Campaign detail with run timeline, cases, attempts, judge verdicts, and artifacts.
- New campaign wizard.

New campaign wizard should require:

- Target URL from allowlist.
- Data mode: `synthetic`, `approved_phi` disabled until compliance setup exists.
- Attack categories.
- Budget cap.
- Max concurrency.
- Human approval reason if scope is elevated.

### 3. Findings and Reports

Views:

- Findings list: severity, category, exploitability, regression status.
- Finding detail: sanitized evidence, judge rationale, reproduction steps, affected boundary, audit trail.
- Report preview: documentation-agent draft with operator edit/approval.

### 4. Coverage

Views:

- Threat-model coverage matrix.
- Category health over time.
- Regression suite status.
- Gaps recommended by Coverage Scoring Service.

### 5. Approvals

Views:

- Pending approvals.
- Approval history.
- Approval detail with scope, risk, expiration, requester, and audit chain.

Console approval should exist before Slack approval. Slack can later mirror and link back to this canonical approval surface.

### 6. Admin and Settings

Views:

- Operators and roles.
- Target allowlist.
- Model/provider status, without exposing secrets.
- Environment health.
- Retention settings.
- Audit export for synthetic-only data.

## Authentication and Authorization

### Better Auth Baseline

Better Auth should be the auth server for `apps/web`, using SQLite in the same `/data/boundary.db` file as the rest of the demo app. Keep auth tables separate by naming/prefix where the adapter allows it, and keep Boundary Labs authorization decisions in app-owned role/policy tables.

Required Better Auth capabilities:

- Database-backed sessions.
- Social provider sign-in for MVP.
- Admin plugin or equivalent owner/admin user-management API.
- Two-factor or passkey plugin for privileged users.
- Organizations/RBAC plugin only if it cleanly maps to Boundary Labs roles; otherwise keep Boundary authorization in the server-side policy layer.
- SSO/OIDC plugin for enterprise IdP integration.

Disable public self-service registration. New users must be invited or explicitly allowlisted.

### Identity Provider

Future enterprise identity provider should support:

- OIDC.
- MFA enforcement.
- User disable/revoke.
- Login audit logs.
- Optional organization/team claims.
- BAA path before real PHI is enabled.

Boundary Labs stores an internal operator record keyed by external `sub`.

### Roles

Initial roles:

| Role | Allowed actions |
| --- | --- |
| `owner` | Manage auth settings, targets, roles, deployment settings, all campaign actions. |
| `admin` | Manage operators, targets, budgets, approvals. |
| `operator` | Launch synthetic campaigns, review results, request approvals. |
| `reviewer` | Review findings, approve reports, promote regressions when permitted. |
| `viewer` | Read-only access to sanitized dashboards and reports. |

Authorization should be policy-based, not scattered conditionals. Define actions such as:

- `campaign:create`
- `campaign:run`
- `campaign:cancel`
- `finding:triage`
- `report:publish`
- `regression:promote`
- `target:manage`
- `user:manage`
- `audit:read`

### Session and Token Flow

Recommended flow:

1. Better Auth handles login and the browser session in `apps/web`.
2. `apps/web` server components/actions resolve the Better Auth session server-side.
3. Server-side route handlers/actions resolve the operator record, enforce RBAC, and write audit events before launching campaigns or reading evidence.
4. If/when a separate API service is introduced later, `apps/web` will call it with a short-lived API-bound operator assertion or a server-side service token plus signed operator context.

Avoid putting long-lived API credentials in the browser. Browser-visible state should never include provider access tokens, target cookies, internal target tokens, model keys, or Railway tokens.

## Data Model

Use SQLite for the MVP/demo. This is enough because the first deploy should be a single Railway replica with low write concurrency, synthetic-only data, and limited retention. The SQLite file should live on the Railway volume at `/data/boundary.db`, not inside the app checkout.

Use Postgres later only if one of these becomes true:

- Multiple app replicas or separate workers need concurrent writes.
- Campaign history needs longer retention and backup/restore guarantees.
- Real PHI mode becomes in scope.
- Query volume or reporting grows beyond SQLite comfort.
- We need external BI/reporting access.

Core tables:

- `operators`: external subject, email, display name, status.
- `operator_roles`: role assignments and scope.
- `targets`: allowlisted targets and readiness metadata.
- `campaigns`: requested campaigns and execution status.
- `attack_cases`: generated or seed cases.
- `attack_attempts`: one execution transcript per case/target.
- `judge_verdicts`: pass/fail/partial/invalid verdicts.
- `findings`: confirmed or triaged vulnerabilities.
- `reports`: documentation-agent output and publication status.
- `approvals`: approval requests, decisions, expirations.
- `audit_events`: immutable security/event log.
- `artifacts`: pointers to files or JSONL payloads, with redaction status.

Do not store raw secrets in SQLite. Store secret references and health states only.

## HIPAA and Security Posture

Data mode starts as synthetic-only. The frontend and server-side handlers should still be built as if target output could contain PHI.

Required controls:

- TLS for all browser and service traffic.
- HttpOnly, Secure cookies.
- No raw prompts, target responses, cookies, access tokens, or secrets in frontend logs.
- Strict evidence rendering: text escaped by default, no raw HTML rendering from target output.
- CSP headers, frame restrictions, and no third-party analytics on evidence pages.
- Audit every access to campaign details, findings, reports, approvals, target settings, and user management.
- Role checks at every server-side mutation and read boundary.
- Per-operator and per-target rate limits.
- Campaign budget caps enforced server-side.
- Artifact retention policy with deletion path.
- BAA review gate before enabling real PHI mode with any vendor.

Go/no-go for real PHI:

- No real PHI until identity provider, hosting, logging/observability, database, backups, and any model provider are covered by the required contractual and compliance posture.
- Real PHI mode requires explicit approval, narrower retention, stricter audit review, and disabled external model calls unless approved.

## Frontend Design Direction

Boundary Labs is an operational security console, not a marketing site.

Required implementation workflow:

- Use the `compound-engineering:ce-frontend-design` skill during the CE plan and CE work phases for all UI implementation.
- Before writing UI code, inspect the design system that exists in the repo at that time: tokens, CSS variables, component primitives, layout conventions, icon library, typography, spacing, radius, color, and interaction states.
- Treat the repo design system as the source of truth. If the design system conflicts with the guidance below, follow the repo design system and document the exception in the implementation notes.
- Add or modify shared UI primitives only when the existing design system cannot support the needed operational console state.
- Verify the result visually with screenshots before calling the UI work complete.

Current design source:

- `designs/styles/colors_and_type.css`: primary tokens for dark forensic console surfaces, typography, spacing, radius, motion, borders, focus rings, and status colors.
- `designs/styles/components.css`: current component behavior for buttons, inputs, chips, verdicts, severity labels, panels, run rows, analytical tables, coverage cells, and live indicators.
- `designs/app/components.jsx`: current shell/component references for sidebar, topbar, page shell, panel, verdict pill, severity badge, and shared chrome.
- `designs/app/dashboard.jsx`: current dashboard composition for KPI strip, telemetry feed, active agents, recent runs, findings, coverage, target health, and attack surface.
- `designs/app/runs.jsx`: current runs index, run detail, and seed/finding detail interaction model.
- `designs/Marketing.html` plus `designs/assets/`: marketing/top-level visual language, grid, reticle, perimeter, logo marks, and console CTA treatment.
- `designs/screenshots/`: visual acceptance references. Implementation should compare against these screenshots during verification.

Design-system translation rules:

- Rebuild the visual language in React using Tailwind CSS 4 CSS-first tokens in `apps/web/src/app/globals.css` with `@import "tailwindcss"` and `@theme`.
- Configure shadcn/ui with CSS variables, neutral base color, TypeScript, React Server Components support, lucide icons, and aliases for `@/components`, `@/components/ui`, `@/lib`, and `@/hooks`.
- Build app-specific components as shadcn-composable primitives under `apps/web/src/components/boundary/` and keep generic shadcn primitives under `apps/web/src/components/ui/`.
- Preserve the design's signature choices: dark-native graphite/void surfaces, mono-led headings and data labels, sharp 1-3px radii, dense 4px spacing rhythm, alarm red for failure/risk, signal lime for pass/live/healthy, cyan for judge/info, amber for partial/degraded, flat bordered panels, tabular numeric data, and uppercase mono metadata.
- Do not directly copy inline style objects from `designs/app/*.jsx` into production components. Extract intent into reusable Tailwind classes, component variants, and CSS variables.
- Prefer lucide icons through shadcn-compatible React components instead of the hand-rolled SVG icon helper in `designs/app/components.jsx`, except for brand assets in `designs/assets/`.
- Avoid generic SaaS cards. Use dense panels, tables, rows, status rails, matrix cells, side panels, and evidence panes that match the reference console.

Design principles:

- Dense, scannable, utilitarian.
- First screen is the campaign/finding triage console.
- Avoid hero pages and oversized cards.
- Use tables, filters, status pills, timelines, and side panels.
- Use color sparingly for severity and state.
- Every risky action has a confirmation state and audit consequence.
- Evidence panes should visually distinguish trusted metadata from untrusted target output.

Recommended first navigation:

- Dashboard
- Campaigns
- Findings
- Coverage
- Approvals
- Audit
- Settings

## Deployment Architecture

Railway services for the demo:

- `boundary-web`: Dockerfile-built service containing Next.js web and Python worker child processes under `supervisord`.
- `/data` volume attached to `boundary-web` for SQLite and artifacts.

Deferred services:

- `boundary-api`: FastAPI service, only if Next route handlers become too crowded or we need Python-native orchestration online.
- `boundary-db`: Postgres, only when SQLite limits become real.
- `boundary-redis`: post-MVP queue/cache if needed.

The worker is no longer deferred for the demo; it runs inside `boundary-web` as `python -m worker`. A separate worker service is a future scale-out option, not a current missing deployment unit.

Service readiness:

- `boundary-web /readyz`: checks app boot, worker heartbeat freshness, SQLite `PRAGMA integrity_check`, `policy_values` bootstrap state, local state paths, target allowlist config, and data mode.

## GitHub Actions

### Required Workflows

#### `.github/workflows/ci.yml`

Runs on pull request only:

- Install Node dependencies with pnpm.
- Install Python worker dependencies.
- Typecheck web.
- Unit test web.
- Build web.
- Run Playwright login smoke.
- Verify Safety Gate codegen freshness.
- Run Python worker tests and parity checks.

#### `.github/workflows/deploy-preview.yml`

Runs on PR when requested:

- Deploy preview web app to a preview Railway environment if budget allows.
- Run smoke tests against preview.
- Comment preview URLs on PR.

This can be deferred if time is tight.

#### `.github/workflows/deploy-railway.yml`

Runs on push to `main` and `workflow_dispatch`:

- Uses GitHub Environment `demo`.
- Uses concurrency group `railway-production`.
- Validates `policy_seed.json` and migrations against a temporary SQLite database.
- Runs Docker build preflight from the root `Dockerfile`.
- Deploys the root project with Railway CLI.
- Runs public smoke checks:
  - `GET /healthz`
  - `GET /readyz`
  - login page loads
  - unauthenticated app routes redirect to login
  - authenticated smoke with test operator if available

Use Railway project tokens, not personal tokens. Pin third-party GitHub Actions by version or commit SHA. A protected production-grade environment is deferred until this is more than a synthetic-data demo.

Legacy `.gitlab-ci.yml` retirement was superseded during provider-proof hardening. GitHub Actions remains the primary deploy path, but `.gitlab-ci.yml` is retained as a mirror path for repository verification, manual provider-proof campaigns, readiness audit, and Railway runtime-env preflight.

## Secrets and Environment Variables

GitHub Environment secrets:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_SERVICE_ID`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BAA_DOCUMENT_HASH`
- `OPENROUTER_API_KEY`
- `SQLITE_PATH=/data/boundary.db` should be a Railway variable, not a GitHub secret.
- `BOUNDARY_ARTIFACT_DIR=/data/artifacts` should be a Railway variable.

Rules:

- No secrets in repo.
- No `NEXT_PUBLIC_*` variables unless they are truly public.
- Rotate deploy tokens after demos.
- Demo deploy secrets only available to the `demo` GitHub Environment.

## Implementation Units

### U0. Design System Translation

Files:

- `designs/`
- `apps/web/components.json`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ui/`
- `apps/web/src/components/boundary/`
- `apps/web/src/lib/utils.ts`
- `apps/web/tests/design-system.spec.ts`

Work:

- Run `compound-engineering:ce-frontend-design` context detection and record the design references used from `designs/`.
- Install/configure Tailwind CSS 4 and shadcn/ui for the Next.js app.
- Translate `designs/styles/colors_and_type.css` into Tailwind 4 `@theme` variables and global CSS custom properties.
- Translate `designs/styles/components.css` into shadcn-composable primitives and app-specific Boundary components.
- Add reusable components for `AppShell`, `Sidebar`, `TopBar`, `Panel`, `Button` variants, `Input`, `Chip`, `VerdictPill`, `SeverityBadge`, `RunRow`, `DataTable`, `CoverageCell`, `LiveDot`, `MetricCell`, and `EvidencePane`.
- Copy brand SVG assets from `designs/assets/` into `apps/web/public/brand/` or import them through the framework asset pipeline.
- Preserve visual parity with `designs/screenshots/01-dash.png`, `designs/screenshots/01-runs.png`, and `designs/screenshots/marketing-top.png` before building feature screens.

Tests:

- `components.json` points shadcn to the correct CSS file, aliases, icon library, and TypeScript settings.
- Tailwind 4 build can resolve all Boundary theme tokens.
- Shared components render accessible roles/names where applicable.
- Keyboard focus is visible on buttons, links, filters, rows, and form controls.
- Screenshot comparison confirms the shell, dashboard primitives, and runs primitives match the supplied design direction closely enough for implementation to continue.

### U1. App Skeleton and Monorepo Layout

Files:

- `apps/web/`
- `apps/web/src/server/`
- `apps/web/src/server/campaigns/`
- `package.json`
- `pnpm-workspace.yaml`
- `README.md`

Work:

- Create Next.js App Router web app.
- Use Tailwind CSS 4 and shadcn/ui configuration from U0.
- Add server-side modules for campaigns, storage, policy checks, and eval-runner execution.
- Add SQLite location and artifact directory config.
- Add local dev orchestration.

Tests:

- `apps/web/tests/smoke.test.ts`
- `apps/web/tests/health.test.ts`

Scenarios:

- Web app renders a protected shell placeholder.
- `/healthz` and `/readyz` respond.
- Local dev can boot the service with a local SQLite file.

### U2. Auth and RBAC Foundation

Files:

- `apps/web/src/auth/`
- `apps/web/src/middleware.ts`
- `apps/web/src/server/auth/`
- `apps/web/src/server/policies/`
- `apps/web/tests/authz.test.ts`

Work:

- Add Better Auth server/client integration.
- Add email/password-only auth for the demo, with email allowlist. Social login is intentionally removed from the demo path so `/api/auth/sign-in/social` is not required or exposed.
- Add documented enterprise SSO/OIDC upgrade path.
- Add database-backed sessions.
- Add owner/admin two-factor or passkey requirement.
- Protect all app routes.
- Add operator profile endpoint.
- Add policy-based RBAC.
- Seed owner/admin operator from environment.

Tests:

- Unauthenticated users redirect to login.
- Non-allowlisted users cannot create an operator session.
- Owner/admin users without required second factor cannot perform privileged actions.
- Disabled operator cannot access protected server routes.
- Viewer cannot launch campaign.
- Operator cannot manage targets.
- Admin can manage operators.

### U3. SQLite State and Audit Ledger

Files:

- `apps/web/src/server/db/`
- `apps/web/src/server/db/schema.ts`
- `apps/web/src/server/audit/`
- `apps/web/src/server/migrations/`
- `apps/web/tests/audit.test.ts`

Work:

- Add SQLite models and migrations.
- Store the SQLite file under `/data` in deployed demo and `./var/boundary.db` locally.
- Add immutable audit event writes for protected actions.
- Add redaction boundary before audit persistence.

Tests:

- Campaign read/write creates audit event.
- Secret-looking fields are redacted.
- Audit event cannot be updated through public server routes.

### U4. Console Shell and Dashboard

Files:

- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/app/(app)/dashboard/page.tsx`
- `apps/web/src/components/navigation/`
- `apps/web/src/components/status/`
- `apps/web/tests/dashboard.spec.ts`

Work:

- Rebuild the `designs/app/components.jsx` sidebar/topbar/page shell as typed React components composed from shadcn-compatible primitives.
- Rebuild the `designs/app/dashboard.jsx` dashboard composition using Tailwind 4 utilities and Boundary components from U0.
- Add navigation for dashboard, runs/campaigns, seeds, agents, judges, threat model, coverage, findings, targets, secrets, and schedule, with MVP-disabled sections visibly inert.
- Add KPI strip, live harness telemetry, active agents, recent runs, findings, threat-model coverage, and target health widgets.
- Keep the first screen dense and operational; no landing-page hero inside the console.

Tests:

- Viewer sees dashboard but not admin nav.
- Campaign/finding rows link to detail routes.
- Readiness failure appears as degraded, not hidden.
- Dashboard screenshot is visually aligned with `designs/screenshots/01-dash.png` for shell, density, colors, and component hierarchy.

### U5. Campaign Management

Files:

- `apps/web/src/server/campaigns/`
- `apps/web/src/app/(app)/campaigns/`
- `apps/web/tests/campaigns.spec.ts`
- `apps/web/tests/campaigns.test.ts`

Work:

- Rebuild `designs/app/runs.jsx` as Campaign/Runs list, run detail, seed detail, and finding detail views.
- Campaign list/detail/new campaign wizard.
- Server-side target allowlist check.
- Budget and category selection.
- Persist campaign records.
- Wire existing `scripts/run_mvp_evals.py` as a temporary execution adapter, then replace with native campaign runner.

Tests:

- Non-allowlisted target rejected.
- Missing budget rejected.
- Synthetic-only mode allowed.
- Approved-PHI mode blocked until compliance flag exists.
- Campaign creates audit event.
- Runs list screenshot is visually aligned with `designs/screenshots/01-runs.png`.

### U6. Findings, Reports, and Evidence Rendering

Files:

- `apps/web/src/server/findings/`
- `apps/web/src/server/reports/`
- `apps/web/src/app/(app)/findings/`
- `apps/web/src/app/(app)/reports/`
- `apps/web/tests/evidence-rendering.spec.ts`

Work:

- Import/display eval results.
- Finding detail with sanitized evidence.
- Report draft/approval flow.
- Evidence component that treats target output as untrusted text.

Tests:

- Target output containing HTML renders as text, not markup.
- Prompt-injection text inside evidence cannot alter UI behavior.
- Viewer cannot publish report.
- Reviewer can approve synthetic report.

### U7. Approvals

Files:

- `apps/web/src/server/approvals/`
- `apps/web/src/app/(app)/approvals/`
- `apps/web/tests/approvals.test.ts`
- `apps/web/tests/approvals.spec.ts`

Work:

- Approval request list/detail.
- Approve/reject/comment actions.
- Expiration behavior.
- Safety Gate revalidation before resume.

Tests:

- Expired approval cannot be accepted.
- Approval outside operator role fails.
- Approval decision is auditable.
- High-risk campaign stays paused until approved.

### U8. Coverage and Regression Views

Files:

- `apps/web/src/server/coverage/`
- `apps/web/src/app/(app)/coverage/`
- `apps/web/src/app/(app)/regressions/`
- `apps/web/tests/coverage.spec.ts`

Work:

- Threat category coverage matrix.
- Regression case list.
- Latest run trends from `evals/results`.
- Promotion queue UI.

Tests:

- At least three MVP categories display.
- Regression promotion requires reviewer/admin role.
- Coverage gaps are visible when no case exists for a category.

### U9. CI/CD and Railway Deployment

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-railway.yml`
- `Dockerfile`
- `railway.toml`
- `.railwayignore`

Work:

- Add CI.
- Add Railway deploy from GitHub Actions.
- Add demo environment instructions.
- Add health and smoke checks.

Tests:

- CI fails on type/test/lint failure.
- Workflow does not print secrets.
- Deploy smoke fails if `/readyz` fails.

### U10. Security Hardening Pass

Files:

- `apps/web/src/security/`
- `docs/security/frontend-security.md`
- `docs/security/hipaa-readiness.md`

Work:

- CSP and security headers.
- Rate limits.
- CSRF strategy for mutations.
- Log redaction.
- Retention policy.
- HIPAA readiness checklist.

Tests:

- Mutations require CSRF/session protection.
- Logs redact cookies/tokens.
- Evidence pages have strict CSP.
- Synthetic-only gate blocks real-PHI mode.

## Open Decisions

1. What is the operator seed policy for the first public demo?
2. Should the demo branch deploy from `main`, or should `feat/architecture-deck` remain the deploy branch until renamed/merged?
3. Do we need PR preview environments for defense/demo, or is one persistent demo deployment enough?
4. Should password reset stay out-of-band for the demo, or should SMTP-backed reset be added before launch?
5. What threshold triggers graduating from SQLite to Postgres and/or splitting a FastAPI API service?
6. Should the marketing page from `designs/Marketing.html` ship in the first app cut, or should the first cut be console-only with `/login` as the only public route?

## Suggested Build Order

1. U0 design-system translation from `designs/`.
2. U1 app skeleton.
3. U2 auth/RBAC.
4. U3 SQLite/audit.
5. U4 dashboard.
6. U5 campaign management using current eval runner.
7. U9 CI/deploy once the app boots.
8. U6 findings/reports.
9. U7 approvals.
10. U8 coverage/regressions.
11. U10 hardening.

## Release Gates

First deployed console is ready when:

- Public app requires login for all non-health routes.
- At least one owner/admin can log in.
- `/readyz` passes for the web service.
- A synthetic campaign can be launched from UI against the deployed Clinical Co-Pilot target.
- Latest run results appear in Campaign detail and Findings views.
- Every campaign launch, finding triage, and approval decision writes an audit event.
- GitHub Actions can deploy to the demo Railway service.
- No real PHI mode exists or can be enabled accidentally.

## External References

- Next.js standalone output and environment variable behavior: https://nextjs.org/docs
- Tailwind CSS 4 CSS-first `@import "tailwindcss"` and `@theme` customization: https://tailwindcss.com/docs
- shadcn/ui CLI, `components.json`, Tailwind CSS variables, and component installation: https://ui.shadcn.com
- Better Auth framework, database adapters, sessions, two-factor, passkeys, API keys, admin, organizations/RBAC, and SSO/OIDC plugins: https://www.better-auth.com
- Railway CLI deploy, project tokens, `railway up`, and `--path-as-root`: https://docs.railway.com/cli/deploying
- Railway `railway up` reference: https://docs.railway.com/cli/up
- GitHub Actions deployment environments and protection rules: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments
- GitHub Actions encrypted secrets: https://docs.github.com/en/actions/reference/encrypted-secrets
