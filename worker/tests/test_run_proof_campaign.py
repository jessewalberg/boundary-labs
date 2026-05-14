from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

from scripts.run_proof_campaign import configure_worker_environment, insert_claimed_campaign_job, main, normalize_argv, proof_runtime_missing, provider_agent_preflight
from worker.llm_provider import AgentConnectionCheck


class RunProofCampaignTest(unittest.TestCase):
    def test_configure_worker_environment_adds_target_origin_to_allowlist(self) -> None:
        old_sqlite = os.environ.get("SQLITE_PATH")
        old_artifact = os.environ.get("BOUNDARY_ARTIFACT_DIR")
        old_allowlist = os.environ.get("BOUNDARY_TARGET_ALLOWLIST")
        try:
            os.environ["BOUNDARY_TARGET_ALLOWLIST"] = "not-a-url,https://existing.example"
            configure_worker_environment(
                Path("/tmp/proof.db"),
                Path("/tmp/proof-artifacts"),
                "https://clinical-copilot.up.railway.app/path",
            )

            self.assertEqual(os.environ["SQLITE_PATH"], "/tmp/proof.db")
            self.assertEqual(os.environ["BOUNDARY_ARTIFACT_DIR"], "/tmp/proof-artifacts")
            self.assertIn("https://clinical-copilot.up.railway.app", os.environ["BOUNDARY_TARGET_ALLOWLIST"])
        finally:
            restore_env("SQLITE_PATH", old_sqlite)
            restore_env("BOUNDARY_ARTIFACT_DIR", old_artifact)
            restore_env("BOUNDARY_TARGET_ALLOWLIST", old_allowlist)

    def test_insert_claimed_campaign_job_uses_all_seed_payload(self) -> None:
        old_artifact = os.environ.get("BOUNDARY_ARTIFACT_DIR")
        root = Path(tempfile.mkdtemp(prefix="boundary-proof-job-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        os.environ["BOUNDARY_ARTIFACT_DIR"] = str(artifact_dir)
        make_db(sqlite_path)
        try:
            insert_claimed_campaign_job(
                sqlite_path,
                job_id="job-proof",
                run_id="run-proof",
                target_url="https://clinical-copilot.up.railway.app",
                deployed_url="https://clinical-copilot.up.railway.app",
                timeout_seconds=12,
                mint_synthetic_session=True,
                synthetic_patient_pid=13,
            )

            with sqlite3.connect(sqlite_path) as db:
                campaign = db.execute("SELECT status FROM campaigns WHERE id = 'run-proof'").fetchone()
                job = db.execute("SELECT status, payload_json FROM campaign_jobs WHERE id = 'job-proof'").fetchone()
            self.assertEqual(campaign[0], "running")
            self.assertEqual(job[0], "claimed")
            self.assertIn('"categories": []', job[1])
            self.assertIn('"mintSyntheticSession": true', job[1])
        finally:
            restore_env("BOUNDARY_ARTIFACT_DIR", old_artifact)

    def test_provider_agent_preflight_requires_executed_roles(self) -> None:
        async def fake_checks(**_kwargs):
            return [
                AgentConnectionCheck(
                    role="orchestrator",
                    provider="openrouter",
                    model="openrouter:test",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="ok",
                ),
                AgentConnectionCheck(
                    role="judge",
                    provider="openrouter",
                    model="openrouter:test",
                    enabled=True,
                    api_key_configured=False,
                    status="missing_secret",
                    detail="openrouter API key is not configured",
                ),
            ]

        sqlite_path = Path(tempfile.mkdtemp(prefix="boundary-proof-preflight-")) / "boundary.db"
        make_policy_db(sqlite_path)
        with patch("scripts.run_proof_campaign.check_all_agent_connections", side_effect=fake_checks) as check:
            errors = run_async(provider_agent_preflight(sqlite_path))

        self.assertEqual(errors, ["judge: missing_secret (openrouter API key is not configured)"])
        self.assertEqual(check.call_args.kwargs["policy_values"]["agent_provider_red_team"], "openrouter")

    def test_mock_target_is_rejected_for_provider_proof(self) -> None:
        with patch("sys.argv", ["run_proof_campaign.py", "--mock-target"]), redirect_stdout(StringIO()):
            self.assertEqual(main(), 2)

    def test_provider_proof_requires_runtime_env_before_bootstrap(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("sys.argv", ["run_proof_campaign.py", "--bootstrap"]),
            patch("scripts.run_proof_campaign.bootstrap_database") as bootstrap,
            redirect_stdout(StringIO()) as stdout,
        ):
            self.assertEqual(main(), 1)

        bootstrap.assert_not_called()
        self.assertIn("Provider proof runtime environment is missing required values", stdout.getvalue())

    def test_provider_proof_requires_enable_flag_to_equal_one_before_bootstrap(self) -> None:
        env = {
            "BOUNDARY_ENABLE_LLM_AGENTS": "true",
            "OPENROUTER_API_KEY": "test",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch("sys.argv", ["run_proof_campaign.py", "--bootstrap"]),
            patch("scripts.run_proof_campaign.bootstrap_database") as bootstrap,
            redirect_stdout(StringIO()) as stdout,
        ):
            self.assertEqual(main(), 1)

        bootstrap.assert_not_called()
        self.assertIn("BOUNDARY_ENABLE_LLM_AGENTS must equal 1", stdout.getvalue())

    def test_proof_runtime_missing_reports_invalid_enable_flag(self) -> None:
        env = {
            "BOUNDARY_ENABLE_LLM_AGENTS": "yes",
            "OPENROUTER_API_KEY": "test",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(proof_runtime_missing(require_smart_secret=False), ["BOUNDARY_ENABLE_LLM_AGENTS must equal 1"])

    def test_provider_proof_requires_smart_secret_only_when_minting(self) -> None:
        env = {
            "BOUNDARY_ENABLE_LLM_AGENTS": "1",
            "OPENROUTER_API_KEY": "test",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch("sys.argv", ["run_proof_campaign.py", "--mint-synthetic-session"]),
            patch("scripts.run_proof_campaign.bootstrap_database") as bootstrap,
            redirect_stdout(StringIO()) as stdout,
        ):
            self.assertEqual(main(), 1)

        bootstrap.assert_not_called()
        self.assertIn("SMART session secret source", stdout.getvalue())

    def test_allow_deterministic_skips_provider_runtime_env_check(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("sys.argv", ["run_proof_campaign.py", "--allow-deterministic"]),
            patch("scripts.run_proof_campaign.configure_worker_environment", side_effect=RuntimeError("past env check")),
            redirect_stdout(StringIO()),
        ):
            with self.assertRaisesRegex(RuntimeError, "past env check"):
                main()

    def test_provider_proof_main_verifies_artifact_with_strict_provider_inputs(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-proof-main-strict-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        output_path = root / "proof-output.json"
        make_db(sqlite_path)
        env = {
            "BOUNDARY_ENABLE_LLM_AGENTS": "1",
            "OPENROUTER_API_KEY": "test-openrouter",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch(
                "sys.argv",
                [
                    "run_proof_campaign.py",
                    "--sqlite-path",
                    str(sqlite_path),
                    "--artifact-dir",
                    str(artifact_dir),
                    "--target-url",
                    "https://clinical-copilot.up.railway.app/path",
                    "--output-file",
                    str(output_path),
                ],
            ),
            patch("scripts.run_proof_campaign.provider_agent_preflight", new=AsyncMock(return_value=[])),
            patch("scripts.run_proof_campaign.process_job") as process_job,
            patch("scripts.run_proof_campaign.verify_artifact", return_value=[]) as verify_artifact,
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main(), 0)

        process_job.assert_called_once()
        verify_kwargs = verify_artifact.call_args.kwargs
        self.assertEqual(verify_kwargs["expected_total"], 4)
        self.assertTrue(verify_kwargs["require_llm_agents"])
        self.assertEqual(
            verify_kwargs["expected_case_ids"],
            {
                "seed_authz_cross_patient_chat_001",
                "seed_pi_direct_sse_scope_override_001",
                "seed_pi_multiturn_boundary_erosion_001",
                "seed_tool_param_patient_swap_001",
            },
        )
        self.assertEqual(verify_kwargs["expected_target_origin"], "https://clinical-copilot.up.railway.app")
        self.assertFalse(verify_kwargs["allow_local_target"])
        proof_output = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertEqual(proof_output["target_origin"], "https://clinical-copilot.up.railway.app")
        self.assertFalse(proof_output["allow_deterministic"])

    def test_normalizes_pnpm_argument_separator(self) -> None:
        self.assertEqual(
            normalize_argv(["--", "--allow-deterministic"]),
            ["--allow-deterministic"],
        )


def make_db(sqlite_path: Path) -> None:
    with sqlite3.connect(sqlite_path) as db:
        db.executescript(
            """
            CREATE TABLE campaigns (
              id TEXT PRIMARY KEY,
              target_url TEXT NOT NULL,
              categories_json TEXT NOT NULL,
              status TEXT NOT NULL,
              data_mode TEXT NOT NULL DEFAULT 'synthetic',
              budget_cents INTEGER NOT NULL,
              submitted_by TEXT NOT NULL,
              artifact_path TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE campaign_jobs (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              job_type TEXT NOT NULL DEFAULT 'campaign_run',
              status TEXT NOT NULL DEFAULT 'queued',
              claim_token TEXT UNIQUE,
              claimed_at TEXT,
              submitted_by TEXT NOT NULL,
              priority INTEGER NOT NULL DEFAULT 0,
              payload_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE audit_events (
              id TEXT PRIMARY KEY,
              occurred_at TEXT NOT NULL,
              actor_type TEXT NOT NULL,
              actor_id TEXT,
              action TEXT NOT NULL,
              target_type TEXT NOT NULL,
              target_id TEXT,
              outcome TEXT NOT NULL,
              rule_ref TEXT,
              policy_snapshot_hash TEXT,
              metadata_json TEXT NOT NULL DEFAULT '{}'
            );
            """
        )


def make_policy_db(sqlite_path: Path) -> None:
    with sqlite3.connect(sqlite_path) as db:
        db.executescript(
            """
            CREATE TABLE policy_values (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL
            );
            INSERT INTO policy_values (key, value_json)
            VALUES ('agent_provider_red_team', '"openrouter"');
            """
        )


def restore_env(key: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = value


def run_async(coro):
    import asyncio

    return asyncio.run(coro)


if __name__ == "__main__":
    unittest.main()
