from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.verify_campaign_artifact import REQUIRED_AGENT_ROLES, REQUIRED_NODES, verify_artifact


class VerifyCampaignArtifactTest(unittest.TestCase):
    def test_accepts_full_graph_artifact_with_executed_agents(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True)

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertEqual(errors, [])

    def test_rejects_deterministic_artifact_when_llm_agents_are_required(self) -> None:
        artifact_path = write_artifact(agent_status="disabled", api_key_configured=False)

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertIn("orchestrator agent must be executed, got 'disabled'", errors)
        self.assertIn("judge agent must report api_key_configured=true", errors)

    def test_allows_deterministic_artifact_when_requested(self) -> None:
        artifact_path = write_artifact(agent_status="disabled", api_key_configured=False)

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=False,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertEqual(errors, [])

    def test_rejects_partial_eval_coverage(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True, total=1)

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertIn("summary.total must be at least 4, got 1", errors)
        self.assertIn("results must contain at least 4 cases, got 1", errors)

    def test_rejects_duplicate_or_unexpected_seed_coverage(self) -> None:
        artifact_path = write_artifact(
            agent_status="executed",
            api_key_configured=True,
            case_ids=[
                "seed_pi_direct_sse_scope_override_001",
                "seed_pi_direct_sse_scope_override_001",
                "seed_tool_param_patient_swap_001",
                "unexpected_case",
            ],
        )

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertIn("results contain duplicate case IDs: ['seed_pi_direct_sse_scope_override_001']", errors)
        self.assertIn("results missing expected seed case IDs: ['seed_authz_cross_patient_chat_001', 'seed_pi_multiturn_boundary_erosion_001']", errors)
        self.assertIn("results contain unexpected case IDs: ['unexpected_case']", errors)

    def test_rejects_summary_counts_that_do_not_sum_to_total(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True, summary_overrides={"pass": 1})

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertIn("summary pass/fail/partial/invalid counts must sum to total 9, got 1", errors)

    def test_rejects_provider_backed_local_target(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True, target_url="http://127.0.0.1:1234")

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
        )

        self.assertIn("provider-backed proof target_url must not be localhost/loopback: http://127.0.0.1:1234", errors)

    def test_rejects_provider_required_artifact_without_result_level_provider_assistance(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True)
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        artifact["results"][0]["judge_agent"]["provider_status"] = "disabled"
        artifact["results"][1]["red_team_agent"]["execution_mode"] = "deterministic-fallback"
        artifact["results"][2]["judge_agent"]["provider_review"] = ""
        artifact["results"][3]["judge_agent"]["provider_decision"] = "fallback"
        artifact["results"][3]["red_team_agent"]["provider_decision"] = "fallback"
        artifact["results"][3]["red_team_agent"]["provider_plan"] = None
        artifact_path.write_text(json.dumps(artifact), encoding="utf-8")

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
        )

        self.assertIn("seed_authz_cross_patient_chat_001 judge_agent.provider_status must be executed, got 'disabled'", errors)
        self.assertIn("seed_pi_direct_sse_scope_override_001 red_team_agent.execution_mode must start with pydantic-ai:, got 'deterministic-fallback'", errors)
        self.assertIn("seed_pi_multiturn_boundary_erosion_001 judge_agent.provider_review must contain provider output", errors)
        self.assertIn("seed_tool_param_patient_swap_001 judge_agent.provider_decision must be applied, got 'fallback'", errors)
        self.assertIn("seed_tool_param_patient_swap_001 red_team_agent.provider_decision must be applied, got 'fallback'", errors)
        self.assertIn("seed_tool_param_patient_swap_001 red_team_agent.provider_plan must be present", errors)

    def test_rejects_missing_provider_outputs_for_orchestrator_and_documentation(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True)
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        artifact["agent_notes"]["orchestrator"] = ""
        artifact["documentation_agent"] = [
            {
                "case_id": "seed_authz_cross_patient_chat_001",
                "execution_mode": "deterministic-fallback",
                "provider_status": "disabled",
                "provider_note": "",
            }
        ]
        artifact_path.write_text(json.dumps(artifact), encoding="utf-8")

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
        )

        self.assertIn("agent_notes.orchestrator must contain provider output", errors)
        self.assertIn("documentation_agent[0].provider_status must be executed, got 'disabled'", errors)
        self.assertIn("documentation_agent[0].execution_mode must start with pydantic-ai:, got 'deterministic-fallback'", errors)
        self.assertIn("documentation_agent[0].provider_note must contain provider output", errors)

    def test_rejects_unexpected_target_origin(self) -> None:
        artifact_path = write_artifact(agent_status="executed", api_key_configured=True, target_url="https://other.example")

        errors = verify_artifact(
            artifact_path,
            expected_total=4,
            require_llm_agents=True,
            expected_case_ids=CASE_IDS,
            expected_target_origin="https://clinical-copilot.up.railway.app",
        )

        self.assertIn(
            "target_url origin must be 'https://clinical-copilot.up.railway.app', got 'https://other.example'",
            errors,
        )


CASE_IDS = {
    "seed_pi_direct_sse_scope_override_001",
    "seed_authz_cross_patient_chat_001",
    "seed_tool_param_patient_swap_001",
    "seed_pi_multiturn_boundary_erosion_001",
}


def write_artifact(
    *,
    agent_status: str,
    api_key_configured: bool,
    total: int = 4,
    case_ids: list[str] | None = None,
    summary_overrides: dict[str, int] | None = None,
    target_url: str = "https://clinical-copilot.up.railway.app",
) -> Path:
    root = Path(tempfile.mkdtemp(prefix="boundary-proof-artifact-"))
    artifact_path = root / "run.json"
    selected_case_ids = case_ids or sorted(CASE_IDS)[:total]
    include_generated = agent_status == "executed" and case_ids is None and total == len(CASE_IDS)
    result_case_ids = list(selected_case_ids)
    if include_generated:
        result_case_ids.extend(f"{case_id}::provider-red-team" for case_id in selected_case_ids)
        result_case_ids.append(f"{selected_case_ids[0]}::adaptive-001")
    actual_total = len(result_case_ids)
    summary = {"total": actual_total, "pass": actual_total, "fail": 0, "partial": 0, "invalid": 0}
    if summary_overrides:
        summary.update(summary_overrides)
    artifact = {
        "schema_version": "boundary.campaign_graph.v1",
        "run_id": "run-proof",
        "target_url": target_url,
        "agent_roles_executed": ["Orchestrator", "Red Team Agent", "Judge Agent", "Documentation Agent"]
        if agent_status == "executed"
        else [],
        "agent_notes": {
            role: f"{role}-provider-output" if agent_status == "executed" else ""
            for role in REQUIRED_AGENT_ROLES
        },
        "documentation_agent": [],
        "inter_agent_messages": [
            {"sender": "orchestrator", "recipient": "red_team", "message": "plan", "metadata": {}},
            {"sender": "target", "recipient": "red_team", "message": "observed", "metadata": {}},
            {"sender": "red_team", "recipient": "judge", "message": "generated", "metadata": {}},
            {"sender": "judge", "recipient": "documentation", "message": "reviewed", "metadata": {}},
        ]
        if agent_status == "executed"
        else [],
        "provider_generated_cases": [
            {
                "case_id": f"{case_id}::provider-red-team",
                "base_case_id": case_id,
                "turn_count": 1,
                "risk_focus": "test focus",
            }
            for case_id in selected_case_ids
        ]
        if include_generated
        else [],
        "adaptive_generated_cases": [
            {
                "case_id": f"{selected_case_ids[0]}::adaptive-001",
                "base_case_id": selected_case_ids[0],
                "turn_count": 1,
                "finding": "Observed refusal behavior worth probing.",
                "risk_focus": "test focus",
            }
        ]
        if include_generated
        else [],
        "summary": summary,
        "results": [
            {
                "case_id": case_id,
                "source": source_for_case_id(case_id),
                "base_case_id": base_case_id_for_case_id(case_id),
                "red_team_agent": provider_role_payload(
                    agent_status,
                    execution_mode="pydantic-ai:openrouter:google/gemini-2.5-flash" if agent_status == "executed" else "deterministic-fallback",
                    note_field="provider_note",
                )
                | {
                    "provider_decision": "applied" if agent_status == "executed" else "fallback",
                    "provider_plan": {
                        "case_id": case_id,
                        "strategy": "test strategy",
                        "risk_focus": "test focus",
                        "expected_boundary": "test boundary",
                        "attack_sequence": ["generated attack"],
                        "finding": "Observed refusal behavior worth probing." if "::adaptive-" in case_id else None,
                    }
                    if agent_status == "executed"
                    else None,
                },
                "judge_agent": {
                    "status": "pass",
                    **provider_role_payload(
                        agent_status,
                        execution_mode="pydantic-ai:openrouter:google/gemini-2.5-flash" if agent_status == "executed" else "deterministic-fallback",
                        note_field="provider_review",
                    ),
                    "provider_decision": "applied" if agent_status == "executed" else "fallback",
                },
            }
            for case_id in result_case_ids
        ],
        "pydantic_graph": {
            "nodes": REQUIRED_NODES,
            "agent_connections": {
                role: {
                    "role": role,
                    "provider": "openrouter",
                    "model": "openrouter:google/gemini-2.5-flash",
                    "status": agent_status,
                    "enabled": agent_status == "executed",
                    "api_key_configured": api_key_configured,
                    "detail": "test",
                    "usage": {"input_tokens": 10, "output_tokens": 5, "requests": 1},
                }
                for role in REQUIRED_AGENT_ROLES
            },
        },
    }
    artifact_path.write_text(json.dumps(artifact), encoding="utf-8")
    return artifact_path


def provider_role_payload(agent_status: str, *, execution_mode: str, note_field: str) -> dict[str, str]:
    return {
        "provider_status": agent_status,
        "execution_mode": execution_mode,
        note_field: f"{agent_status}-provider-output" if agent_status == "executed" else "",
    }


def source_for_case_id(case_id: str) -> str:
    if "::adaptive-" in case_id:
        return "adaptive_red_team"
    if case_id.endswith("::provider-red-team"):
        return "provider_red_team"
    return "seed"


def base_case_id_for_case_id(case_id: str) -> str | None:
    if "::adaptive-" in case_id:
        return case_id.split("::adaptive-", 1)[0]
    if case_id.endswith("::provider-red-team"):
        return case_id.removesuffix("::provider-red-team")
    return None


if __name__ == "__main__":
    unittest.main()
