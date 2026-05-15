# Boundary Labs Users

Boundary serves two audiences at once: **the people who decide whether a clinical AI is safe to keep running** and **the people who must repair it when it isn't**. The personas below are listed in roughly the order a hospital evaluates the platform — CISO and physician first, then the engineers who do the work, then the reviewers and auditors who ratify it.

This is intentionally not a generic security-tools persona list. Every workflow here is grounded in the OpenEMR Clinical Co-Pilot target, the Pydantic Graph worker, and the specific routes shipped in `apps/web/src/app/(app)/`.

## Chief Information Security Officer (CISO) — primary buyer

The CISO decides whether the deployed Clinical Co-Pilot can continue treating patients without becoming the hospital's next breach disclosure. Their concern is not finding a clever jailbreak — it is having defensible, continuous evidence that adversarial coverage exists and is updated as the target evolves. Their workflow is to land on `/dashboard`, scan KPI tiles for unresolved findings, open `/coverage` to confirm category-level testing depth, drill into `/reports` for any open critical-severity items, and inspect the audit log (`/audit`) to confirm every campaign launch, approval, and report publication is traceable to a named operator with timestamp and policy snapshot. Automation is justified because the CISO cannot wait for the next quarterly pentest cycle to learn the system regressed — they need attack coverage that runs against every target version. The trust boundary the CISO cares about most: every action the platform takes autonomously must produce an audit row, and every action with patient-impact potential (publication, real-PHI runs) must require a human approver.

## Physician / Clinician End-User — the safety-protected user

The physician is not a Boundary operator. They never log in. But they are the user the platform exists to protect: the clinician relying on the Clinical Co-Pilot to summarize a chart, draft a note, or surface a relevant lab. If an attacker bypasses the Co-Pilot's defenses to swap patients, leak PHI from another chart, or coerce the assistant into giving unsafe clinical advice, the physician is the one whose decision becomes wrong. Boundary's success criterion, framed in terms of the physician, is: every category in `THREAT_MODEL.md` has at least one regression case that replays against every new target version, and any verdict that crosses a clinical-safety boundary produces a vulnerability report with severity and recommended remediation visible to the platform engineer before that version reaches production. The physician never sees Boundary, but the absence of clinical-impact incidents downstream is the test of whether it worked.

## Security Engineer — primary operator

The security engineer owns adversarial coverage and triage. Their workflow: launch a campaign from `/campaigns/new` against the live target, watch the run on `/campaigns/<id>` with the agent timeline + cost breakdown surfaces, inspect failed or partial verdicts, promote confirmed exploits to regression cases via `/approvals`, and hand a published vulnerability report to the platform engineer. Automation is justified because static prompt lists miss variant attacks: the Red Team Agent's mutation loop produces follow-ups from observed target behavior, which is impossible to reproduce manually at scale.

## Platform Engineer — fix-and-validate owner

The platform engineer maintains the Clinical Co-Pilot and needs regression evidence after every change to prompts, tools, retrieval, auth, or deployment config. Their workflow: trigger a regression sweep from `/schedule` (or via the `regressions:run` policy), check `/regressions` to confirm previously-promoted cases still pass against the new target version, and read the lifecycle history in each report's "Fix Validation History" section to confirm a fix actually mitigated the underlying class rather than merely changing surface behavior. Automation is justified because the cost of a missed regression in healthcare is downstream of the engineer's commit by hours or days, by which time the bad version is already serving traffic.

## Clinical Safety Reviewer — boundary-judgment owner

The clinical safety reviewer evaluates whether unsafe model behavior could affect care delivery. They need concise evidence per finding: what the user asked, what the assistant returned, whether the response crossed a clinical boundary, and whether the case used synthetic or real patient data. They live in `/findings` and `/reports`, approve or reject promotion candidates in `/approvals`, and decide whether `severity ≥ high` reports may be published. Automation is justified because the reviewer should spend time on high-signal findings — not raw transcript sorting and not deciding which of 200 prompts to inspect.

## Compliance Reviewer — auditor and BAA owner

The compliance reviewer cares about authorization, PHI handling, auditability, and approval gates. Their workflow: verify campaigns stay inside the approved target allowlist (`/settings/policy`), confirm BAA acknowledgement (`/settings/baa`) is current before any real-PHI campaign is permitted, inspect the audit ledger for every sensitive action, and confirm reports do not leak raw evidence into published markdown. Automation is justified because every campaign must produce consistent metadata — target, operator, data mode, case IDs, verdicts, evidence references — without depending on an engineer to remember the format.

## Why automation, not a one-time pentest

The assignment's framing — "move beyond one-time penetration testing" — is the load-bearing argument for this platform's existence. A human pentest delivers:

- a snapshot of vulnerabilities at a single point in time;
- against a static target version;
- with no guarantee of reproducibility, regression coverage, or comparability across model/prompt/tool changes;
- at a cost ($25K-$150K/engagement) that bounds frequency to at most once or twice per year.

Boundary replaces that snapshot model with continuous adversarial pressure, because the target this platform protects is not static. The Clinical Co-Pilot's model, prompts, tools, RAG corpus, and SMART scopes all change on a release cadence faster than any pentest schedule can keep pace with. Concretely, automation is justified because:

1. **The attack surface evolves.** Every model swap, prompt change, or new tool registration changes the surface. Manual pentests cannot keep pace.
2. **Coverage must be queryable.** A CISO asking "have we tested cross-patient PHI bypass against the current target version?" needs a yes/no answer with evidence, not a calendar reminder for the next engagement.
3. **Regression coverage is non-negotiable in healthcare.** A fix that introduces a regression in another category is worse than no fix. The regression harness replays every promoted exploit on every target version automatically.
4. **Cost.** At submission-day pricing (~$0.11 LLM cost per production run, see `AI_COST_ANALYSIS.md`), continuous coverage costs an order of magnitude less than a single human engagement and runs orders of magnitude more often.
5. **Audit defensibility.** Every Boundary action produces an audit row tying campaign, operator, target version, and verdict to a timestamp. A human pentest report is a PDF; Boundary is a queryable trail.

Boundary does not replace the human pentest entirely — it eliminates the part that should never have been manual (running variants, replaying regressions, cataloging findings) so that human reviewers can spend their time on the parts that genuinely require judgment: clinical-safety boundary calls, novel attack class research, and disclosure decisions.
