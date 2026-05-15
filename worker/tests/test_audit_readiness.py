from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.audit_readiness import build_audit
from worker.llm_provider import AgentConnectionCheck


class AuditReadinessTest(unittest.TestCase):
    def test_audit_reports_missing_provider_env_and_artifact(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            audit = build_audit()

        statuses = {item["id"]: item for item in audit["criteria"]}
        self.assertFalse(audit["complete"])
        self.assertEqual(statuses["complete_pydantic_graph"]["status"], "pass")
        self.assertEqual(statuses["architecture_current_shape"]["status"], "pass")
        self.assertEqual(statuses["email_password_auth_only"]["status"], "pass")
        self.assertEqual(statuses["pydantic_ai_tooling"]["status"], "pass")
        self.assertEqual(statuses["pydantic_evals_seed_corpus"]["status"], "pass")
        self.assertEqual(statuses["provider_runtime_env"]["status"], "fail")
        self.assertIn("OPENROUTER_API_KEY", statuses["provider_runtime_env"]["missing"])
        self.assertEqual(statuses["live_agent_connectivity"]["status"], "fail")
        self.assertIn("provider runtime env must pass before live agent connectivity", statuses["live_agent_connectivity"]["missing"])
        self.assertEqual(statuses["eval_coverage_wiring"]["status"], "pass")
        self.assertIn("seed corpus count=12", statuses["eval_coverage_wiring"]["evidence"])
        self.assertEqual(statuses["self_healing"]["status"], "pass")
        self.assertIn("self-healing scenario tests present", statuses["self_healing"]["evidence"])
        self.assertEqual(statuses["provider_proof_config_preflight"]["status"], "pass")
        self.assertEqual(statuses["gitlab_provider_proof_pipeline"]["status"], "pass")
        self.assertEqual(statuses["provider_proof_artifact"]["status"], "fail")
        self.assertIn("--artifact-path is required", statuses["provider_proof_artifact"]["missing"])

    def test_audit_reports_missing_sqlite_path(self) -> None:
        missing_sqlite = Path("/tmp/definitely-missing-boundary-proof.db")

        audit = build_audit(sqlite_path=missing_sqlite)

        readiness = next(item for item in audit["criteria"] if item["id"] == "readiness_gate")
        self.assertEqual(readiness["status"], "fail")
        self.assertIn(f"SQLite path does not exist: {missing_sqlite}", readiness["missing"])

    def test_audit_requires_expected_target_origin_with_artifact(self) -> None:
        artifact_path = Path("/tmp/boundary-proof-artifact.json")

        audit = build_audit(artifact_path=artifact_path)

        artifact = next(item for item in audit["criteria"] if item["id"] == "provider_proof_artifact")
        self.assertEqual(artifact["status"], "fail")
        self.assertIn("--expected-target-origin is required when --artifact-path is supplied", artifact["missing"])

    def test_normalizes_pnpm_forwarded_separator(self) -> None:
        from scripts.audit_readiness import normalize_argv

        self.assertEqual(
            normalize_argv(["--", "--artifact-path", "artifact.json"]),
            ["--artifact-path", "artifact.json"],
        )

    def test_audit_runs_live_agent_connectivity_when_env_is_present(self) -> None:
        async def fake_check_all_agent_connections(*, policy_values=None, roles=None):
            return [
                AgentConnectionCheck(
                    role="orchestrator",
                    provider="openrouter",
                    model="openrouter:google/gemini-2.5-flash",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="agent run completed",
                ),
                AgentConnectionCheck(
                    role="red_team",
                    provider="openrouter",
                    model="openrouter:google/gemini-2.5-flash",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="agent run completed",
                ),
                AgentConnectionCheck(
                    role="judge",
                    provider="openrouter",
                    model="openrouter:google/gemini-2.5-flash",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="agent run completed",
                ),
                AgentConnectionCheck(
                    role="documentation",
                    provider="openrouter",
                    model="openrouter:google/gemini-2.5-flash",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="agent run completed",
                ),
            ]

        env = {
            "BOUNDARY_ENABLE_LLM_AGENTS": "1",
            "OPENROUTER_API_KEY": "test-openrouter",
            "BOUNDARY_SMART_SESSION_SECRET": "test-smart-secret",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch("scripts.audit_readiness.check_all_agent_connections", side_effect=fake_check_all_agent_connections) as check,
        ):
            audit = build_audit()

        connectivity = next(item for item in audit["criteria"] if item["id"] == "live_agent_connectivity")
        self.assertEqual(connectivity["status"], "pass")
        self.assertIn("orchestrator status=executed provider=openrouter model=openrouter:google/gemini-2.5-flash", connectivity["evidence"])
        check.assert_called_once()


if __name__ == "__main__":
    unittest.main()
