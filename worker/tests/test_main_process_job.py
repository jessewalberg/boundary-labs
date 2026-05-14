from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from scripts.run_mvp_evals import HttpObservation, TurnObservation
from worker.graphs.campaign import CampaignGraphDeps, CampaignGraphState, FileBackedFullStatePersistence, SafetyGateNode, campaign_graph
from worker.main import process_job
from worker.sentinels import sentinel_paths, write_complete, write_failed


class ProcessJobTest(unittest.TestCase):
    def test_marks_job_completed_when_graph_writes_artifact_and_complete_sentinel(self) -> None:
        sqlite_path, artifact_dir = make_db(with_ingest_tables=True)

        def fake_graph(deps) -> None:
            deps.paths.artifact.parent.mkdir(parents=True, exist_ok=True)
            deps.paths.artifact.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")
            write_complete(deps.paths, {"run_id": "run-1"})

        with patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph):
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        self.assertEqual(job_status(sqlite_path), ("completed", "completed"))
        with closing(sqlite3.connect(sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM runs WHERE run_id = 'run-1'").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM attempts WHERE run_id = 'run-1'").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM verdicts WHERE run_id = 'run-1'").fetchone()[0], 1)

    def test_late_worker_cannot_complete_after_claim_token_changes(self) -> None:
        sqlite_path, artifact_dir = make_db(with_ingest_tables=True)
        with closing(sqlite3.connect(sqlite_path)) as db:
            db.execute("UPDATE campaign_jobs SET claim_token = 'worker-b:new-token' WHERE id = 'job-1'")
            db.commit()

        def fake_graph(deps) -> None:
            deps.paths.artifact.parent.mkdir(parents=True, exist_ok=True)
            deps.paths.artifact.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")
            write_complete(deps.paths, {"run_id": "run-1"})

        with patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph) as graph:
            process_job(sqlite_path, artifact_dir, "job-1", "run-1", claim_token="worker-a:stale-token")

        with closing(sqlite3.connect(sqlite_path)) as db:
            job = db.execute("SELECT status, claim_token FROM campaign_jobs WHERE id = 'job-1'").fetchone()
            campaign = db.execute("SELECT status FROM campaigns WHERE id = 'run-1'").fetchone()
            audit = db.execute(
                "SELECT action, outcome FROM audit_events WHERE action = 'process_job_claim_token_mismatch'"
            ).fetchone()
        graph.assert_not_called()
        self.assertEqual(job, ("claimed", "worker-b:new-token"))
        self.assertEqual(campaign[0], "running")
        self.assertEqual(audit, ("process_job_claim_token_mismatch", "ignored"))
        self.assertFalse(sentinel_paths(artifact_dir, "run-1").artifact.exists())
        self.assertFalse(sentinel_paths(artifact_dir, "run-1").complete.exists())
        self.assertFalse(sentinel_paths(artifact_dir, "run-1").failed.exists())

    def test_late_worker_cannot_fail_after_claim_token_changes(self) -> None:
        sqlite_path, artifact_dir = make_db()
        with closing(sqlite3.connect(sqlite_path)) as db:
            db.execute("UPDATE campaign_jobs SET claim_token = 'worker-b:new-token' WHERE id = 'job-1'")
            db.commit()

        with patch("worker.main.run_campaign_graph_sync", side_effect=RuntimeError("boom")) as graph:
            process_job(sqlite_path, artifact_dir, "job-1", "run-1", claim_token="worker-a:stale-token")

        with closing(sqlite3.connect(sqlite_path)) as db:
            job = db.execute("SELECT status, claim_token FROM campaign_jobs WHERE id = 'job-1'").fetchone()
            campaign = db.execute("SELECT status FROM campaigns WHERE id = 'run-1'").fetchone()
            audit = db.execute(
                "SELECT action, outcome FROM audit_events WHERE action = 'process_job_claim_token_mismatch'"
            ).fetchone()
        graph.assert_not_called()
        self.assertEqual(job, ("claimed", "worker-b:new-token"))
        self.assertEqual(campaign[0], "running")
        self.assertEqual(audit, ("process_job_claim_token_mismatch", "ignored"))
        self.assertFalse(sentinel_paths(artifact_dir, "run-1").failed.exists())

    def test_marks_job_completed_when_read_model_ingest_fails_after_graph_completion(self) -> None:
        sqlite_path, artifact_dir = make_db(with_ingest_tables=True)

        def fake_graph(deps) -> None:
            deps.paths.artifact.parent.mkdir(parents=True, exist_ok=True)
            deps.paths.artifact.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")
            write_complete(deps.paths, {"run_id": "run-1"})

        with (
            patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph),
            patch("worker.main.ingest_completed_artifact", side_effect=RuntimeError("locked")),
        ):
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        self.assertEqual(job_status(sqlite_path), ("completed", "completed"))
        with closing(sqlite3.connect(sqlite_path)) as db:
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE action = 'artifact_ingest_failed'").fetchone()
        self.assertEqual(audit, ("artifact_ingest_failed", "degraded"))

    def test_marks_job_failed_when_graph_raises_and_writes_failed_sentinel(self) -> None:
        sqlite_path, artifact_dir = make_db()

        with patch("worker.main.run_campaign_graph_sync", side_effect=RuntimeError("boom")):
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        self.assertEqual(job_status(sqlite_path), ("failed", "failed"))
        self.assertTrue(sentinel_paths(artifact_dir, "run-1").failed.exists())

    def test_marks_job_failed_when_graph_writes_failed_sentinel(self) -> None:
        sqlite_path, artifact_dir = make_db()

        def fake_graph(deps) -> None:
            write_failed(deps.paths, "graph_error")

        with patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph):
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        self.assertEqual(job_status(sqlite_path), ("failed", "failed"))

    def test_refuses_target_outside_allowlist_before_graph_execution(self) -> None:
        sqlite_path, artifact_dir = make_db(payload='{"targetUrl":"https://evil.example.test","categories":["prompt-injection"]}')

        with patch("worker.main.run_campaign_graph_sync") as graph:
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        graph.assert_not_called()
        self.assertEqual(job_status(sqlite_path), ("failed", "failed"))
        self.assertIn("target_not_allowlisted", sentinel_paths(artifact_dir, "run-1").failed.read_text(encoding="utf-8"))

    def test_process_job_passes_payload_and_policy_values_to_campaign_graph(self) -> None:
        sqlite_path, artifact_dir = make_db(
            payload=json.dumps(
                {
                    "targetUrl": "https://clinical-copilot.up.railway.app/path",
                    "deployedUrl": "https://clinical-copilot.up.railway.app",
                    "categories": ["tool-misuse"],
                    "timeoutSeconds": 12,
                    "mintSyntheticSession": True,
                    "syntheticPatientPid": 99,
                    "syntheticUserId": 42,
                    "syntheticFacilityId": 7,
                    "syntheticAccessToken": "synthetic-token",
                }
            ),
            with_ingest_tables=True,
        )
        with closing(sqlite3.connect(sqlite_path)) as db:
            db.execute("INSERT INTO policy_values (key, value_json) VALUES ('agent_provider_judge', '\"openrouter\"')")
            db.commit()
        captured: list[CampaignGraphDeps] = []

        def fake_graph(deps: CampaignGraphDeps) -> None:
            captured.append(deps)
            deps.paths.artifact.parent.mkdir(parents=True, exist_ok=True)
            deps.paths.artifact.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")
            write_complete(deps.paths, {"run_id": deps.run_id})

        with patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph):
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        self.assertEqual(job_status(sqlite_path), ("completed", "completed"))
        self.assertEqual(len(captured), 1)
        deps = captured[0]
        self.assertEqual(deps.target_url, "https://clinical-copilot.up.railway.app/path")
        self.assertEqual(deps.deployed_url, "https://clinical-copilot.up.railway.app")
        self.assertEqual(deps.categories, ["tool-misuse"])
        self.assertEqual(deps.timeout_seconds, 12)
        self.assertTrue(deps.mint_synthetic_session)
        self.assertEqual(deps.synthetic_patient_pid, 99)
        self.assertEqual(deps.synthetic_user_id, 42)
        self.assertEqual(deps.synthetic_facility_id, 7)
        self.assertEqual(deps.synthetic_access_token, "synthetic-token")
        self.assertEqual(deps.policy_values["agent_provider_judge"], "openrouter")

    def test_process_job_acquires_openemr_smart_session_for_ui_campaign(self) -> None:
        sqlite_path, artifact_dir = make_db(
            payload=json.dumps(
                {
                    "targetUrl": "https://clinical-copilot.up.railway.app",
                    "categories": ["prompt-injection"],
                    "timeoutSeconds": 12,
                }
            ),
            with_ingest_tables=True,
        )
        captured: list[CampaignGraphDeps] = []
        old_env = {
            key: os.environ.get(key)
            for key in [
                "BOUNDARY_ACQUIRE_SMART_SESSION",
                "BOUNDARY_OPENEMR_URL",
                "BOUNDARY_OPENEMR_USERNAME",
                "BOUNDARY_OPENEMR_PASSWORD",
                "BOUNDARY_OPENEMR_PATIENT_PID",
                "BOUNDARY_SMART_SESSION_COOKIE",
                "TARGET_SMART_SESSION_COOKIE",
            ]
        }

        def fake_graph(deps: CampaignGraphDeps) -> None:
            captured.append(deps)
            deps.paths.artifact.parent.mkdir(parents=True, exist_ok=True)
            deps.paths.artifact.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")
            write_complete(deps.paths, {"run_id": deps.run_id})

        try:
            os.environ["BOUNDARY_ACQUIRE_SMART_SESSION"] = "1"
            os.environ["BOUNDARY_OPENEMR_URL"] = "https://everybody-loves-healthcare.up.railway.app/interface/login/login.php?site=default"
            os.environ["BOUNDARY_OPENEMR_USERNAME"] = "pentest"
            os.environ["BOUNDARY_OPENEMR_PASSWORD"] = "secret"
            os.environ["BOUNDARY_OPENEMR_PATIENT_PID"] = "13"
            os.environ.pop("BOUNDARY_SMART_SESSION_COOKIE", None)
            os.environ.pop("TARGET_SMART_SESSION_COOKIE", None)
            with (
                patch("worker.main.acquire_smart_session", return_value={"smart_session_cookie": "real-smart-cookie"}) as acquire,
                patch("worker.main.run_campaign_graph_sync", side_effect=fake_graph),
            ):
                process_job(sqlite_path, artifact_dir, "job-1", "run-1")
        finally:
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        self.assertEqual(job_status(sqlite_path), ("completed", "completed"))
        self.assertEqual(captured[0].smart_session_cookie, "real-smart-cookie")
        self.assertFalse(captured[0].mint_synthetic_session)
        acquire.assert_called_once_with(
            openemr_url="https://everybody-loves-healthcare.up.railway.app",
            copilot_url="https://clinical-copilot.up.railway.app",
            site="default",
            username="pentest",
            password="secret",
            patient_pid=13,
            timeout_seconds=15.0,
        )

    def test_rejects_malformed_payload_before_target_resolution(self) -> None:
        sqlite_path, artifact_dir = make_db(payload="{targetUrl:https://clinical-copilot.up.railway.app}")

        with patch("worker.main.run_campaign_graph_sync") as graph:
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        graph.assert_not_called()
        self.assertEqual(job_status(sqlite_path), ("failed", "failed"))
        failed = sentinel_paths(artifact_dir, "run-1").failed.read_text(encoding="utf-8")
        self.assertIn("invalid_job_payload", failed)
        self.assertIn("not valid JSON", failed)

    def test_rejects_non_array_categories_payload(self) -> None:
        sqlite_path, artifact_dir = make_db(payload='{"targetUrl":"https://clinical-copilot.up.railway.app","categories":"tool-misuse"}')

        with patch("worker.main.run_campaign_graph_sync") as graph:
            process_job(sqlite_path, artifact_dir, "job-1", "run-1")

        graph.assert_not_called()
        self.assertEqual(job_status(sqlite_path), ("failed", "failed"))
        failed = sentinel_paths(artifact_dir, "run-1").failed.read_text(encoding="utf-8")
        self.assertIn("categories must be an array", failed)

    def test_process_job_resumes_existing_graph_history(self) -> None:
        sqlite_path, artifact_dir = make_db(payload='{"targetUrl":"https://clinical-copilot.up.railway.app","categories":["tool-misuse"]}')
        old_enabled = os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
        old_openrouter = os.environ.pop("OPENROUTER_API_KEY", None)
        deps = CampaignGraphDeps(
            run_id="run-1",
            artifact_dir=artifact_dir,
            sqlite_path=sqlite_path,
            target_url="https://clinical-copilot.up.railway.app",
            categories=["tool-misuse"],
            timeout_seconds=1,
        )

        async def write_running_history() -> None:
            state = CampaignGraphState()
            persistence = FileBackedFullStatePersistence(deps=deps)
            async with campaign_graph.iter(SafetyGateNode(), state=state, deps=deps, persistence=persistence) as run:
                node = run.next_node
                for _ in range(4):
                    node = await run.next(node)

        class FakeRedTeam:
            def __init__(self, *_args, **_kwargs) -> None:
                pass

            def execute_case(self, case: dict):
                return [
                    TurnObservation(
                        turn=1,
                        input="probe",
                        endpoint="/conversation",
                        http=HttpObservation(status=200, headers={}, body="refused", elapsed_ms=1),
                        events=[],
                    )
                ]

        try:
            with (
                patch("worker.graphs.campaign.target_probe", return_value={"healthz": {"status": 200}}),
                patch("worker.graphs.campaign.deployed_probe", return_value={"healthz": {"status": 200}}),
            ):
                asyncio.run(write_running_history())

            paths = sentinel_paths(artifact_dir, "run-1")
            graph_history = json.loads(paths.graph_history.read_text(encoding="utf-8"))
            graph_history[-1]["status"] = "running"
            paths.graph_history.write_text(json.dumps(graph_history, indent=2) + "\n", encoding="utf-8")

            with (
                patch("worker.graphs.campaign.RedTeamAgent", FakeRedTeam),
                patch("worker.graphs.campaign.target_probe", return_value={"healthz": {"status": 200}}),
                patch("worker.graphs.campaign.deployed_probe", return_value={"healthz": {"status": 200}}),
            ):
                process_job(sqlite_path, artifact_dir, "job-1", "run-1")
        finally:
            if old_enabled is not None:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_openrouter is not None:
                os.environ["OPENROUTER_API_KEY"] = old_openrouter

        self.assertEqual(job_status(sqlite_path), ("completed", "completed"))
        self.assertTrue(paths.complete.exists())
        artifact = json.loads(paths.artifact.read_text(encoding="utf-8"))
        self.assertEqual(artifact["summary"]["total"], 2)


def make_db(
    payload: str = '{"targetUrl":"https://clinical-copilot.up.railway.app","categories":["prompt-injection"]}',
    *,
    with_ingest_tables: bool = False,
) -> tuple[Path, Path]:
    root = Path(tempfile.mkdtemp(prefix="boundary-process-job-"))
    sqlite_path = root / "boundary.db"
    artifact_dir = root / "artifacts"
    now = datetime.now(UTC).isoformat()
    with closing(sqlite3.connect(sqlite_path)) as db:
        db.executescript(
            """
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
            CREATE TABLE policy_values (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL
            );
            """
        )
        if with_ingest_tables:
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
                """
            )
        else:
            db.executescript(
                """
                CREATE TABLE campaigns (
                  id TEXT PRIMARY KEY,
                  status TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                """
            )
        if with_ingest_tables:
            db.executescript(
                """
                CREATE TABLE runs (
                  id TEXT PRIMARY KEY,
                  campaign_id TEXT NOT NULL,
                  run_id TEXT NOT NULL UNIQUE,
                  artifact_path TEXT NOT NULL,
                  status TEXT NOT NULL,
                  started_at TEXT,
                  completed_at TEXT,
                  summary_json TEXT NOT NULL DEFAULT '{}',
                  created_at TEXT NOT NULL
                );
                CREATE TABLE attempts (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  case_id TEXT NOT NULL,
                  seed_id TEXT,
                  category TEXT NOT NULL,
                  prompt_hash TEXT,
                  request_artifact_path TEXT,
                  response_artifact_path TEXT,
                  created_at TEXT NOT NULL,
                  UNIQUE (run_id, case_id)
                );
                CREATE TABLE verdicts (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  case_id TEXT NOT NULL,
                  status TEXT NOT NULL,
                  severity TEXT NOT NULL,
                  rationale TEXT,
                  judge_model TEXT,
                  created_at TEXT NOT NULL,
                  UNIQUE (run_id, case_id)
                );
                """
            )
        if with_ingest_tables:
            db.execute(
                """
                INSERT INTO campaigns (
                  id, target_url, categories_json, status, data_mode, budget_cents,
                  submitted_by, artifact_path, created_at, updated_at
                ) VALUES (
                  'run-1', 'https://clinical-copilot.up.railway.app', '[]', 'running', 'synthetic', 500,
                  'operator-1', 'queued.json', ?, ?
                )
                """,
                (now, now),
            )
        else:
            db.execute("INSERT INTO campaigns (id, status, updated_at) VALUES ('run-1', 'running', ?)", (now,))
        db.execute(
            """
            INSERT INTO campaign_jobs (
              id, campaign_id, status, submitted_by, payload_json, created_at, updated_at
            ) VALUES (
              'job-1', 'run-1', 'claimed', 'operator-1', ?, ?, ?
            )
            """,
            (payload, now, now),
        )
        db.commit()
    return sqlite_path, artifact_dir


def job_status(sqlite_path: Path) -> tuple[str, str]:
    with closing(sqlite3.connect(sqlite_path)) as db:
        job = db.execute("SELECT status FROM campaign_jobs WHERE id = 'job-1'").fetchone()[0]
        campaign = db.execute("SELECT status FROM campaigns WHERE id = 'run-1'").fetchone()[0]
    return job, campaign


def build_artifact() -> dict:
    return {
        "run_id": "run-1",
        "started_at": "2026-05-13T12:00:00.000Z",
        "completed_at": "2026-05-13T12:00:02.000Z",
        "target_url": "https://clinical-copilot.up.railway.app",
        "summary": {"total": 1, "pass": 1, "fail": 0, "partial": 0, "invalid": 0},
        "results": [
            {
                "run_id": "run-1",
                "case_id": "case-pass",
                "category": "prompt_injection",
                "subcategory": "direct",
                "attempt": {
                    "attempt_id": "attempt-pass",
                    "observed_at": "2026-05-13T12:00:01.000Z",
                    "turns": [{"turn": 1, "input": "safe", "http": {"status": 200, "body": "refused"}}],
                },
                "judge_agent": {
                    "verdict_id": "verdict-pass",
                    "status": "pass",
                    "severity": "high",
                    "rationale": "Refused safely.",
                    "execution_mode": "deterministic-fallback",
                },
            }
        ],
    }


if __name__ == "__main__":
    unittest.main()
