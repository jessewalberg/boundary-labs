from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.run_mvp_evals import load_cases
from scripts.verify_campaign_artifact import verify_artifact
from scripts.check_llm_agents import load_policy_values
from scripts.check_pydantic_evals import run_check as run_pydantic_evals_check
from scripts.check_runtime_env import runtime_missing
from worker.llm_provider import check_all_agent_connections


ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Criterion:
    id: str
    requirement: str
    status: str
    evidence: list[str]
    missing: list[str]


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Boundary Labs demo readiness against the active objective.")
    parser.add_argument("--artifact-path", type=Path, help="Provider-backed proof artifact to audit.")
    parser.add_argument("--sqlite-path", type=Path, help="Proof SQLite DB path to include in evidence.")
    parser.add_argument("--expected-target-origin", help="Expected deployed target origin for the proof artifact.")
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    audit = build_audit(
        artifact_path=args.artifact_path,
        sqlite_path=args.sqlite_path,
        expected_target_origin=args.expected_target_origin,
    )
    print(json.dumps(audit, indent=2))
    return 0 if audit["complete"] else 1


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


def build_audit(
    *,
    artifact_path: Path | None = None,
    sqlite_path: Path | None = None,
    expected_target_origin: str | None = None,
) -> dict[str, Any]:
    criteria = [
        audit_pydantic_graph(),
        audit_architecture_current_shape(),
        audit_email_password_auth_only(),
        audit_pydantic_ai_tooling(),
        audit_pydantic_evals_seed_corpus(),
        audit_provider_runtime_env(),
        audit_live_agent_connectivity(sqlite_path),
        audit_eval_coverage_wiring(),
        audit_full_eval_artifact(artifact_path, expected_target_origin),
        audit_self_healing(),
        audit_readiness_gate(sqlite_path),
        audit_provider_proof_preflight(),
        audit_gitlab_provider_proof_pipeline(),
        audit_web_provider_visibility(),
    ]
    return {
        "objective": "complete Pydantic Graph system, all agents connected, all evals covered, self-healing verified",
        "complete": all(item.status == "pass" for item in criteria),
        "criteria": [asdict(item) for item in criteria],
    }


def audit_pydantic_graph() -> Criterion:
    path = ROOT / "worker/graphs/campaign.py"
    worker_main = read_text(ROOT / "worker/main.py")
    process_tests = read_text(ROOT / "worker/tests/test_main_process_job.py")
    required = [
        "SafetyGateNode",
        "CoverageScoreNode",
        "OrchestratorNode",
        "RedTeamNode",
        "TargetExecutionNode",
        "JudgeNode",
        "DocumentationNode",
        "WriteArtifactNode",
        "campaign_graph = Graph",
    ]
    text = read_text(path)
    missing = [item for item in required if item not in text]
    if "policy_values=load_policy_value_map(sqlite_path)" not in worker_main:
        missing.append("worker/main.py passes policy_values into CampaignGraphDeps")
    if "test_process_job_passes_payload_and_policy_values_to_campaign_graph" not in process_tests:
        missing.append("worker/tests/test_main_process_job.py process_job graph deps coverage")
    return criterion(
        "complete_pydantic_graph",
        "Campaigns execute through the complete Pydantic Graph node chain with queued job payload and policy values.",
        not missing,
        [
            str(path),
            "worker/main.py",
            "worker/tests/test_main_process_job.py",
            "required node chain present" if not missing else "required node chain incomplete",
        ],
        missing,
    )


def audit_architecture_current_shape() -> Criterion:
    architecture = read_text(ROOT / "ARCHITECTURE.md")
    missing = []
    required = {
        "architecture names implemented graph file": "worker/graphs/campaign.py",
        "architecture lists SafetyGateNode": "SafetyGateNode",
        "architecture lists CoverageScoreNode": "CoverageScoreNode",
        "architecture lists OrchestratorNode": "OrchestratorNode",
        "architecture lists RedTeamNode": "RedTeamNode",
        "architecture lists TargetExecutionNode": "TargetExecutionNode",
        "architecture lists JudgeNode": "JudgeNode",
        "architecture lists DocumentationNode": "DocumentationNode",
        "architecture lists WriteArtifactNode": "WriteArtifactNode",
        "architecture documents provider executed requirement": "status: executed",
        "architecture documents deterministic fallback is not readiness": "does not satisfy provider-backed readiness",
        "architecture documents claim-token fencing": "claim_token",
        "architecture documents recovery before ingest": "recovery runs before artifact ingest",
        "architecture documents provider proof gates": "pnpm verify:readiness",
        "architecture scopes Slack to post-MVP": "Slack approval mirroring and automatic regression-promotion jobs remain post-MVP extensions",
    }
    for label, needle in required.items():
        if needle not in architecture:
            missing.append(label)
    stale_current_phrases = [
        "SlackApprovalWaitNode is a deterministic graph pause primitive",
        "`RegressionPromotionNode` (calling the Regression Promotion Service)",
    ]
    for phrase in stale_current_phrases:
        if phrase in architecture:
            missing.append(f"ARCHITECTURE.md contains stale current-lifecycle phrase: {phrase}")
    return criterion(
        "architecture_current_shape",
        "ARCHITECTURE.md reflects the implemented worker graph, provider-proof gate, and self-healing lifecycle.",
        not missing,
        ["ARCHITECTURE.md"],
        missing,
    )


def audit_email_password_auth_only() -> Criterion:
    auth_config = read_text(ROOT / "apps/web/src/server/auth/config.ts")
    login_form = read_text(ROOT / "apps/web/src/app/login/login-form.tsx")
    login_test = read_text(ROOT / "apps/web/tests/e2e/login.spec.ts")
    deployment_plan = read_text(ROOT / "docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md")
    requirements = read_text(ROOT / "docs/brainstorms/2026-05-13-platform-buildout-requirements.md")
    missing = []
    if "emailAndPassword" not in auth_config or "enabled: true" not in auth_config:
        missing.append("Better Auth email/password is enabled")
    if "authClient.signIn.email" not in login_form or "authClient.signUp.email" not in login_form:
        missing.append("login form uses email/password auth client methods")
    if "signIn.social" in login_form or "sign-in/social" in login_form:
        missing.append("login form must not call social sign-in")
    if (ROOT / "apps/web/src/app/login/login-buttons.tsx").exists():
        missing.append("legacy social login-buttons.tsx must not exist")
    if "Email" not in login_test or "Password" not in login_test:
        missing.append("login E2E test covers email/password fields")
    stale_docs = {
        "docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md": deployment_plan,
        "docs/brainstorms/2026-05-13-platform-buildout-requirements.md": requirements,
    }
    stale_phrases = [
        "Add social login for MVP",
        "Sign-in is social",
        "social provider plugin",
        "social sign-in only",
        "GitHub vs Google as the Better Auth social provider",
    ]
    for path, text in stale_docs.items():
        for phrase in stale_phrases:
            if phrase in text:
                missing.append(f"{path} contains stale social-auth phrase: {phrase}")
    return criterion(
        "email_password_auth_only",
        "Demo auth is email/password-only with allowlisted operators and no social sign-in route dependency.",
        not missing,
        [
            "apps/web/src/server/auth/config.ts",
            "apps/web/src/app/login/login-form.tsx",
            "apps/web/tests/e2e/login.spec.ts",
            "docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md",
            "docs/brainstorms/2026-05-13-platform-buildout-requirements.md",
        ],
        missing,
    )


def audit_pydantic_ai_tooling() -> Criterion:
    requirements = read_text(ROOT / "worker/requirements.txt")
    provider = read_text(ROOT / "worker/llm_provider.py")
    package_json = read_text(ROOT / "package.json")
    llm_check_tests = read_text(ROOT / "worker/tests/test_check_llm_agents.py")
    provider_tests = read_text(ROOT / "worker/tests/test_llm_provider.py")
    missing = []
    if "pydantic-graph" not in requirements:
        missing.append("worker/requirements.txt pydantic-graph")
    if "pydantic-ai" not in requirements:
        missing.append("worker/requirements.txt pydantic-ai")
    if "pydantic-evals" not in requirements:
        missing.append("worker/requirements.txt pydantic-evals")
    if "from pydantic_ai import Agent" not in provider:
        missing.append("worker/llm_provider.py pydantic_ai.Agent construction")
    if "check:llm-agents" not in package_json:
        missing.append("package.json check:llm-agents")
    if "test_main_passes_roles_and_policy_values_to_connection_checker" not in llm_check_tests:
        missing.append("worker/tests/test_check_llm_agents.py CLI policy/role coverage")
    if "test_main_fails_when_any_selected_agent_does_not_execute" not in llm_check_tests:
        missing.append("worker/tests/test_check_llm_agents.py CLI failure coverage")
    if "test_connection_check_executes_constructed_agent" not in provider_tests:
        missing.append("worker/tests/test_llm_provider.py connection execution coverage")
    return criterion(
        "pydantic_ai_tooling",
        "Pydantic Graph and Pydantic AI tooling are installed and wired.",
        not missing,
        [
            "worker/requirements.txt",
            "worker/llm_provider.py",
            "package.json",
            "worker/tests/test_check_llm_agents.py",
            "worker/tests/test_llm_provider.py",
        ],
        missing,
    )


def audit_pydantic_evals_seed_corpus() -> Criterion:
    package_json = read_text(ROOT / "package.json")
    verify_system = read_text(ROOT / "scripts/verify_system.py")
    tests = read_text(ROOT / "worker/tests/test_check_pydantic_evals.py")
    expected_cases = load_cases(ROOT / "evals/seeds")
    missing = []
    if "check:pydantic-evals" not in package_json:
        missing.append("package.json check:pydantic-evals")
    if "scripts/check_pydantic_evals.py" not in verify_system:
        missing.append("scripts/verify_system.py runs Pydantic Evals seed corpus check")
    if "test_run_check_builds_dataset_from_full_seed_corpus" not in tests:
        missing.append("worker/tests/test_check_pydantic_evals.py full corpus coverage")
    try:
        payload = run_pydantic_evals_check(ROOT / "evals/seeds", expected_total=len(expected_cases))
    except Exception as exc:
        return criterion(
            "pydantic_evals_seed_corpus",
            "The full eval seed corpus can be represented and evaluated as a Pydantic Evals dataset.",
            False,
            ["scripts/check_pydantic_evals.py"],
            missing + [f"{type(exc).__name__}: {exc}"],
        )
    if not payload.get("ok"):
        missing.extend(str(error) for error in payload.get("errors", []))
    if payload.get("total") != len(expected_cases):
        missing.append(f"Pydantic Evals dataset total must be {len(expected_cases)}, got {payload.get('total')!r}")
    return criterion(
        "pydantic_evals_seed_corpus",
        "The full eval seed corpus can be represented and evaluated as a Pydantic Evals dataset.",
        not missing,
        [
            "scripts/check_pydantic_evals.py",
            "worker/tests/test_check_pydantic_evals.py",
            f"dataset={payload.get('dataset')}",
            f"seed corpus count={len(expected_cases)}",
            f"assertion_rate={payload.get('assertion_rate')}",
        ],
        missing,
    )


def audit_provider_runtime_env() -> Criterion:
    missing = provider_runtime_missing()
    return criterion(
        "provider_runtime_env",
        "Provider-backed LLM runtime configuration is present.",
        not missing,
        provider_runtime_evidence(),
        missing,
    )


def audit_live_agent_connectivity(sqlite_path: Path | None) -> Criterion:
    env_missing = provider_runtime_missing()
    if env_missing:
        return criterion(
            "live_agent_connectivity",
            "All configured Pydantic AI agent roles execute against their live providers.",
            False,
            [],
            ["provider runtime env must pass before live agent connectivity"] + env_missing,
        )
    try:
        policy_values = load_policy_values(sqlite_path) if sqlite_path and sqlite_path.exists() else {}
        checks = asyncio.run(check_all_agent_connections(policy_values=policy_values))
    except Exception as exc:
        return criterion(
            "live_agent_connectivity",
            "All configured Pydantic AI agent roles execute against their live providers.",
            False,
            [str(sqlite_path) if sqlite_path else "policy_values=defaults"],
            [f"{type(exc).__name__}: {exc}"],
        )

    missing = [
        f"{check.role} status={check.status} detail={check.detail}"
        for check in checks
        if check.status != "executed"
    ]
    return criterion(
        "live_agent_connectivity",
        "All configured Pydantic AI agent roles execute against their live providers.",
        not missing,
        [f"{check.role} status={check.status} provider={check.provider} model={check.model}" for check in checks],
        missing,
    )


def audit_full_eval_artifact(artifact_path: Path | None, expected_target_origin: str | None) -> Criterion:
    if artifact_path is None:
        return criterion(
            "provider_proof_artifact",
            "A provider-backed proof artifact covers the full seed corpus and passes strict verification.",
            False,
            [],
            ["--artifact-path is required"],
        )
    if not expected_target_origin:
        return criterion(
            "provider_proof_artifact",
            "A provider-backed proof artifact covers the full seed corpus and passes strict verification.",
            False,
            [str(artifact_path)],
            ["--expected-target-origin is required when --artifact-path is supplied"],
        )
    expected_cases = load_cases(ROOT / "evals/seeds")
    errors = verify_artifact(
        artifact_path,
        expected_total=len(expected_cases),
        require_llm_agents=True,
        expected_case_ids={str(case["id"]) for case in expected_cases},
        allow_local_target=False,
        expected_target_origin=expected_target_origin,
    )
    return criterion(
        "provider_proof_artifact",
        "A provider-backed proof artifact covers the full seed corpus and passes strict verification.",
        not errors,
        [str(artifact_path), f"expected seed count={len(expected_cases)}", f"expected target origin={expected_target_origin}"],
        errors,
    )


def audit_eval_coverage_wiring() -> Criterion:
    proof_runner = read_text(ROOT / "scripts/run_proof_campaign.py")
    verifier = read_text(ROOT / "scripts/verify_campaign_artifact.py")
    proof_runner_tests = read_text(ROOT / "worker/tests/test_run_proof_campaign.py")
    verifier_tests = read_text(ROOT / "worker/tests/test_verify_campaign_artifact.py")
    graph_tests = read_text(ROOT / "worker/tests/test_graphs_campaign.py")
    expected_cases = load_cases(ROOT / "evals/seeds")
    missing = []

    required_proof_runner_wiring = {
        "proof runner loads evals/seeds": 'load_cases(Path("evals/seeds"))',
        "proof runner passes exact seed case IDs": "expected_case_ids={str(case[\"id\"]) for case in expected_cases}",
        "proof runner verifies target origin from selected target URL": "expected_target_origin=origin(args.target_url)",
        "proof runner blocks provider proof against mock target": "--mock-target is only allowed with --allow-deterministic",
    }
    for label, needle in required_proof_runner_wiring.items():
        if needle not in proof_runner:
            missing.append(label)

    required_verifier_wiring = {
        "verifier CLI loads evals/seeds": 'load_cases(Path("evals/seeds"))',
        "verifier enforces summary total": "summary.total must be",
        "verifier enforces result count": "results must contain",
        "verifier rejects duplicate seed case IDs": "results contain duplicate case IDs",
        "verifier rejects missing expected seed case IDs": "results missing expected seed case IDs",
        "verifier rejects unexpected seed case IDs": "results contain unexpected case IDs",
        "verifier rejects provider proof on localhost": "provider-backed proof target_url must not be localhost/loopback",
        "verifier enforces expected target origin": "target_url origin must be",
        "verifier requires red-team provider plans": "red_team_agent.provider_plan must be present",
        "verifier requires applied provider decisions": "provider_decision must be applied",
    }
    for label, needle in required_verifier_wiring.items():
        if needle not in verifier:
            missing.append(label)

    required_test_coverage = {
        "artifact test accepts full graph executed agents": "test_accepts_full_graph_artifact_with_executed_agents",
        "artifact test rejects partial eval coverage": "test_rejects_partial_eval_coverage",
        "artifact test rejects duplicate or unexpected seed coverage": "test_rejects_duplicate_or_unexpected_seed_coverage",
        "artifact test rejects provider-backed local target": "test_rejects_provider_backed_local_target",
        "artifact test rejects missing result-level provider assistance": "test_rejects_provider_required_artifact_without_result_level_provider_assistance",
        "artifact test rejects missing provider outputs": "test_rejects_missing_provider_outputs_for_orchestrator_and_documentation",
        "artifact test rejects unexpected target origin": "test_rejects_unexpected_target_origin",
        "graph test rejects duplicate or incomplete provider judge coverage": "test_provider_judge_verdicts_reject_duplicate_or_incomplete_case_coverage",
        "graph test rejects duplicate or incomplete provider red-team coverage": "test_provider_red_team_plans_reject_duplicate_or_incomplete_case_coverage",
        "proof runner test invokes strict provider artifact verification": "test_provider_proof_main_verifies_artifact_with_strict_provider_inputs",
    }
    for label, needle in required_test_coverage.items():
        if needle not in verifier_tests and needle not in graph_tests and needle not in proof_runner_tests:
            missing.append(label)

    seed_ids = {str(case["id"]) for case in expected_cases}
    if len(seed_ids) != len(expected_cases):
        missing.append("evals/seeds must not contain duplicate case IDs")

    return criterion(
        "eval_coverage_wiring",
        "Provider proof is statically wired to the full eval seed corpus, exact case IDs, deployed target origin, and provider-assisted result metadata.",
        not missing,
        [
            "scripts/run_proof_campaign.py",
            "scripts/verify_campaign_artifact.py",
            "worker/tests/test_run_proof_campaign.py",
            "worker/tests/test_verify_campaign_artifact.py",
            "worker/tests/test_graphs_campaign.py",
            f"seed corpus count={len(expected_cases)}",
        ],
        missing,
    )


def audit_self_healing() -> Criterion:
    required_paths = [
        ROOT / "worker/recovery.py",
        ROOT / "worker/queue.py",
        ROOT / "worker/tests/test_self_healing.py",
        ROOT / "worker/tests/test_worker_tick.py",
        ROOT / "worker/tests/test_recovery.py",
        ROOT / "worker/tests/test_queue.py",
    ]
    missing = [str(path) for path in required_paths if not path.exists()]
    queue_text = read_text(ROOT / "worker/queue.py")
    main_text = read_text(ROOT / "worker/main.py")
    recovery_tests = read_text(ROOT / "worker/tests/test_recovery.py")
    queue_tests = read_text(ROOT / "worker/tests/test_queue.py")
    tick_tests = read_text(ROOT / "worker/tests/test_worker_tick.py")
    graph_tests = read_text(ROOT / "worker/tests/test_graphs_campaign.py")
    process_tests = read_text(ROOT / "worker/tests/test_main_process_job.py")
    if "claim_token" not in queue_text:
        missing.append("claim-token fencing in worker/queue.py")
    if "claim_token_still_current" not in main_text or "process_job_claim_token_mismatch" not in main_text:
        missing.append("early stale claim-token guard in worker/main.py")
    if "recover_stale_running_jobs" not in main_text or "worker_tick" not in main_text:
        missing.append("periodic recovery before claim in worker/main.py")
    required_test_coverage = {
        "worker/tests/test_worker_tick.py recovery before claim": (tick_tests, "test_tick_runs_recovery_before_claiming_next_job"),
        "worker/tests/test_queue.py completion claim-token fence": (queue_tests, "test_completion_is_fenced_by_claim_token"),
        "worker/tests/test_queue.py release claim-token fence": (queue_tests, "test_release_is_fenced_by_claim_token"),
        "worker/tests/test_main_process_job.py stale completion guard": (process_tests, "test_late_worker_cannot_complete_after_claim_token_changes"),
        "worker/tests/test_main_process_job.py stale failure guard": (process_tests, "test_late_worker_cannot_fail_after_claim_token_changes"),
        "worker/tests/test_recovery.py graph resume requeue": (recovery_tests, "test_requeues_stale_claim_when_graph_history_can_resume_or_retry"),
        "worker/tests/test_recovery.py valid artifact recovery": (recovery_tests, "test_recovers_completed_job_from_valid_artifact_missing_complete_sentinel"),
        "worker/tests/test_recovery.py missing artifact failure": (recovery_tests, "test_complete_sentinel_without_artifact_fails_recovery"),
        "worker/tests/test_recovery.py sentinel conflict failure": (recovery_tests, "test_complete_and_failed_sentinel_conflict_fails_recovery"),
        "worker/tests/test_graphs_campaign.py graph resume": (graph_tests, "test_resumes_incomplete_graph_history_without_replaying_completed_nodes"),
        "worker/tests/test_main_process_job.py process existing graph history": (process_tests, "test_process_job_resumes_existing_graph_history"),
    }
    for label, (text, needle) in required_test_coverage.items():
        if needle not in text:
            missing.append(label)
    return criterion(
        "self_healing",
        "Recovery, claim-token fencing, and graph resume self-healing are implemented and test-covered.",
        not missing,
        [str(path) for path in required_paths] + ["self-healing scenario tests present"],
        missing,
    )


def audit_readiness_gate(sqlite_path: Path | None) -> Criterion:
    package_json = read_text(ROOT / "package.json")
    verifier = read_text(ROOT / "scripts/verify_system.py")
    workflow = read_text(ROOT / ".github/workflows/proof-campaign.yml")
    proof_runner = read_text(ROOT / "scripts/run_proof_campaign.py")
    proof_runner_tests = read_text(ROOT / "worker/tests/test_run_proof_campaign.py")
    missing = []
    if "verify:readiness" not in package_json:
        missing.append("package.json verify:readiness")
    if "--readiness" not in verifier:
        missing.append("scripts/verify_system.py --readiness")
    if "scripts/check_runtime_env.py" not in verifier:
        missing.append("scripts/verify_system.py provider runtime env check")
    if "scripts/check_runtime_env.py" not in workflow:
        missing.append(".github/workflows/proof-campaign.yml provider runtime env check")
    if "runtime_missing" not in proof_runner:
        missing.append("scripts/run_proof_campaign.py provider runtime env check")
    if "BOUNDARY_ENABLE_LLM_AGENTS must equal 1" not in proof_runner:
        missing.append("scripts/run_proof_campaign.py exact enable-flag runtime check")
    if "test_provider_proof_requires_enable_flag_to_equal_one_before_bootstrap" not in proof_runner_tests:
        missing.append("worker/tests/test_run_proof_campaign.py exact enable-flag pre-bootstrap coverage")
    if "pnpm verify:readiness" not in workflow:
        missing.append(".github/workflows/proof-campaign.yml uses verify:readiness")
    if sqlite_path is not None and not sqlite_path.exists():
        missing.append(f"SQLite path does not exist: {sqlite_path}")
    return criterion(
        "readiness_gate",
        "The final readiness gate refuses skipped or underspecified provider proof checks.",
        not missing,
        ["package.json", "scripts/verify_system.py", "scripts/run_proof_campaign.py", ".github/workflows/proof-campaign.yml"],
        missing,
    )


def audit_provider_proof_preflight() -> Criterion:
    package_json = read_text(ROOT / "package.json")
    script = read_text(ROOT / "scripts/check_provider_proof_config.py")
    tests = read_text(ROOT / "worker/tests/test_check_provider_proof_config.py")
    runbook = read_text(ROOT / "docs/runbooks/provider-proof-campaign.md")
    missing = []
    if "check:provider-proof" not in package_json:
        missing.append("package.json check:provider-proof")
    if "gh\", \"secret\", \"list\"" not in script:
        missing.append("scripts/check_provider_proof_config.py GitHub secret check")
    if '"railway"' not in script or '"run"' not in script:
        missing.append("scripts/check_provider_proof_config.py Railway runtime check")
    if "runtime_missing" not in script:
        missing.append("scripts/check_provider_proof_config.py local runtime env check")
    if "BOUNDARY_ENABLE_LLM_AGENTS must equal 1" not in script:
        missing.append("scripts/check_provider_proof_config.py exact enable-flag validation")
    if "test_github_check_reports_missing_secret_names_without_values" not in tests:
        missing.append("worker/tests/test_check_provider_proof_config.py GitHub missing secret coverage")
    if "test_local_runtime_env_requires_enable_flag_to_equal_one" not in tests:
        missing.append("worker/tests/test_check_provider_proof_config.py exact enable-flag coverage")
    if "pnpm check:provider-proof" not in runbook:
        missing.append("provider proof runbook documents preflight command")
    return criterion(
        "provider_proof_config_preflight",
        "Operators can preflight local, GitHub, and Railway provider-proof configuration without exposing secret values.",
        not missing,
        [
            "package.json",
            "scripts/check_provider_proof_config.py",
            "worker/tests/test_check_provider_proof_config.py",
            "docs/runbooks/provider-proof-campaign.md",
        ],
        missing,
    )


def audit_gitlab_provider_proof_pipeline() -> Criterion:
    pipeline = read_text(ROOT / ".gitlab-ci.yml")
    missing = []
    required = {
        "GitLab verify job runs repo verification": "pnpm verify:system -- --skip-llm --skip-artifact",
        "GitLab jobs provision Python venv in Node image": "python3 -m venv .venv",
        "GitLab provider proof job exists": "proof:provider",
        "GitLab provider proof enables LLM agents": 'BOUNDARY_ENABLE_LLM_AGENTS: "1"',
        "GitLab provider proof validates runtime env": "python scripts/check_runtime_env.py --require-provider-proof --require-smart-secret",
        "GitLab provider proof runs full proof campaign": "python scripts/run_proof_campaign.py",
        "GitLab provider proof runs readiness verification": "pnpm verify:readiness",
        "GitLab provider proof runs readiness audit": "pnpm audit:readiness",
        "GitLab deploy preflights Railway provider-proof env": "python scripts/check_provider_proof_config.py --skip-github",
        "Provider proof runbook documents GitLab manual job": "GitLab Manual Job",
    }
    runbook = read_text(ROOT / "docs/runbooks/provider-proof-campaign.md")
    for label, needle in required.items():
        source = runbook if "runbook" in label.lower() else pipeline
        if needle not in source:
            missing.append(label)
    stale_docs = {
        "docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md": read_text(
            ROOT / "docs/plans/2026-05-12-002-boundary-labs-frontend-auth-deployment-plan.md"
        ),
        "docs/plans/2026-05-13-001-feat-platform-buildout-plan.md": read_text(
            ROOT / "docs/plans/2026-05-13-001-feat-platform-buildout-plan.md"
        ),
    }
    stale_phrases = [
        "GitHub Actions is now the only deploy path",
        "Delete: `.gitlab-ci.yml`",
        "GitLab pipeline removed",
        "Retire `.gitlab-ci.yml` after",
    ]
    for path, text in stale_docs.items():
        for phrase in stale_phrases:
            if phrase in text:
                missing.append(f"{path} contains stale GitLab retirement phrase: {phrase}")
    return criterion(
        "gitlab_provider_proof_pipeline",
        "GitLab CI covers repo verification, manual provider proof, readiness audit, and Railway provider-proof preflight.",
        not missing,
        [".gitlab-ci.yml"],
        missing,
    )


def audit_web_provider_visibility() -> Criterion:
    agents = read_text(ROOT / "apps/web/src/server/agents/repository.ts")
    ingest = read_text(ROOT / "apps/web/src/server/ingest/from-artifact.ts")
    attempts = read_text(ROOT / "apps/web/src/server/attempts/repository.ts")
    tests = read_text(ROOT / "apps/web/tests/repositories/read-models.test.ts")
    missing = []
    if "readAgentConnections" not in agents or "pydantic_graph" not in agents:
        missing.append("agent status repository reads pydantic_graph.agent_connections")
    if "judge_model: result.judge_agent.execution_mode" not in ingest:
        missing.append("web ingest persists judge_agent.execution_mode")
    if "verdicts.judge_model AS judge" not in attempts:
        missing.append("attempt read model exposes verdicts.judge_model")
    if "pydantic-ai:openrouter:google/gemini-2.5-flash" not in tests:
        missing.append("repository test covers provider judge model visibility")
    if "listAgentStatuses" not in tests or "Red Team Agent" not in tests:
        missing.append("repository test covers provider agent status visibility")
    return criterion(
        "web_provider_visibility",
        "Provider-backed judge execution mode and graph agent connections survive artifact ingest into web read models.",
        not missing,
        [
            "apps/web/src/server/agents/repository.ts",
            "apps/web/src/server/ingest/from-artifact.ts",
            "apps/web/src/server/attempts/repository.ts",
            "apps/web/tests/repositories/read-models.test.ts",
        ],
        missing,
    )


def criterion(id: str, requirement: str, passed: bool, evidence: list[str], missing: list[str]) -> Criterion:
    return Criterion(id=id, requirement=requirement, status="pass" if passed else "fail", evidence=evidence, missing=missing)


def provider_runtime_missing() -> list[str]:
    missing = runtime_missing(require_provider_proof=True, require_smart_secret=True)
    if os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") and os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") != "1":
        missing.append("BOUNDARY_ENABLE_LLM_AGENTS must equal 1")
    return missing


def provider_runtime_evidence() -> list[str]:
    evidence = [
        f"{key}=present"
        for key in [
            "BOUNDARY_ENABLE_LLM_AGENTS",
            "BOUNDARY_REQUIRED_LLM_PROVIDERS",
            "OPENROUTER_API_KEY",
        ]
        if os.environ.get(key)
    ]
    for key in ["BOUNDARY_SMART_SESSION_SECRET", "SECURITY_SMART_SESSION_SECRET", "BOUNDARY_SMART_SESSION_SECRET_FILE"]:
        if os.environ.get(key):
            evidence.append(f"{key}=present")
            break
    return evidence


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


if __name__ == "__main__":
    raise SystemExit(main())
