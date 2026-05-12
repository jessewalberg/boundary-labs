# Boundary Labs Users

## Security Engineer

The security engineer owns adversarial coverage and triage. Their workflow is to choose a target environment, run a bounded campaign, inspect failed or partial verdicts, promote confirmed exploits to regression cases, and hand actionable findings to the product team. Automation is justified because static prompt lists miss variant attacks and because confirmed exploits need repeatable replay without manual prompt crafting every time.

## Clinical Safety Reviewer

The clinical safety reviewer evaluates whether unsafe model behavior could affect care delivery. They need concise evidence: what the user asked, what the assistant returned, whether the response crossed a clinical boundary, and whether the case used synthetic or real patient data. Automation is justified because the reviewer should spend time on high-signal findings, not raw transcript sorting.

## Platform Engineer

The platform engineer maintains the Clinical Co-Pilot and needs regression evidence after changes to prompts, tools, retrieval, auth, or deployment configuration. Their workflow is to run the eval suite before and after a target change, compare pass/fail rates, and investigate request IDs or traces for regressions. Automation is justified because target changes can reintroduce vulnerabilities in unrelated categories.

## Compliance Reviewer

The compliance reviewer cares about authorization, PHI handling, auditability, and approval gates. Their workflow is to verify that campaigns stay inside approved scope, real PHI is not used in MVP, audit records exist for sensitive actions, and reports do not leak raw evidence. Automation is justified because every campaign should produce consistent metadata: target, operator, data mode, case IDs, verdicts, and evidence references.

## Instructor Or Evaluator

The evaluator needs to confirm the project satisfies the assignment hard gates. Their workflow is to open the threat model, inspect the architecture, run the MVP eval command, and verify that results cover at least three attack categories against a live target. Automation is justified because the submission should be reproducible from files rather than explained verbally.
