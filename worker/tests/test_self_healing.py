from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from scripts.run_mvp_evals import HttpObservation, TurnObservation
from worker.graphs.campaign import (
    CampaignGraphDeps,
    CampaignGraphState,
    FileBackedFullStatePersistence,
    SafetyGateNode,
    campaign_graph,
)
from worker.main import process_job
from worker.queue import claim_next_job
from worker.recovery import recover_stale_running_jobs
from worker.sentinels import sentinel_paths


class SelfHealingTest(unittest.TestCase):
    def test_stale_claim_requeues_reclaims_and_resumes_graph_to_completion(self) -> None:
        sqlite_path, artifact_dir = make_db()
        first_claim = claim_next_job(sqlite_path, worker_id="worker-a")
        assert first_claim is not None

        deps = CampaignGraphDeps(
            run_id="run-1",
            artifact_dir=artifact_dir,
            sqlite_path=sqlite_path,
            target_url="https://clinical-copilot.up.railway.app",
            categories=["tool-misuse"],
            timeout_seconds=1,
        )

        async def write_interrupted_graph_history() -> None:
            state = CampaignGraphState()
            persistence = FileBackedFullStatePersistence(deps=deps)
            async with campaign_graph.iter(SafetyGateNode(), state=state, deps=deps, persistence=persistence) as run:
                node = run.next_node
                for _ in range(4):
                    node = await run.next(node)

        with (
            patch("worker.graphs.campaign.target_probe", return_value={"healthz": {"status": 200}}),
            patch("worker.graphs.campaign.deployed_probe", return_value={"healthz": {"status": 200}}),
        ):
            asyncio.run(write_interrupted_graph_history())

        paths = sentinel_paths(artifact_dir, "run-1")
        graph_history = json.loads(paths.graph_history.read_text(encoding="utf-8"))
        graph_history[-1]["status"] = "running"
        paths.graph_history.write_text(json.dumps(graph_history, indent=2) + "\n", encoding="utf-8")

        recovered = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)
        self.assertEqual(recovered, {"completed": 0, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 1})

        second_claim = claim_next_job(sqlite_path, worker_id="worker-b")
        assert second_claim is not None
        self.assertEqual(second_claim.id, "job-1")

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

        with (
            patch("worker.graphs.campaign.RedTeamAgent", FakeRedTeam),
            patch("worker.graphs.campaign.target_probe", return_value={"healthz": {"status": 200}}),
            patch("worker.graphs.campaign.deployed_probe", return_value={"healthz": {"status": 200}}),
        ):
            process_job(sqlite_path, artifact_dir, second_claim.id, second_claim.campaign_id)

        with closing(sqlite3.connect(sqlite_path)) as db:
            job = db.execute("SELECT status, claim_token, claimed_at FROM campaign_jobs WHERE id = 'job-1'").fetchone()
            campaign = db.execute("SELECT status FROM campaigns WHERE id = 'run-1'").fetchone()[0]
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE action = 'claim_requeued_graph_resume'").fetchone()
            nodes = [row[0] for row in db.execute("SELECT node_name FROM run_heartbeats ORDER BY heartbeat_at ASC").fetchall()]

        self.assertEqual(job, ("completed", None, None))
        self.assertEqual(campaign, "completed")
        self.assertEqual(audit, ("claim_requeued_graph_resume", "queued"))
        self.assertEqual(nodes.count("SafetyGateNode"), 1)
        self.assertEqual(nodes.count("TargetExecutionNode"), 1)
        self.assertTrue(paths.complete.exists())
        artifact = json.loads(paths.artifact.read_text(encoding="utf-8"))
        self.assertEqual(artifact["summary"]["total"], 1)


def make_db() -> tuple[Path, Path]:
    root = Path(tempfile.mkdtemp(prefix="boundary-self-heal-"))
    sqlite_path = root / "boundary.db"
    artifact_dir = root / "artifacts"
    now = datetime.now(UTC).isoformat()
    with closing(sqlite3.connect(sqlite_path)) as db:
        db.executescript(
            """
            CREATE TABLE operators (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL
            );
            CREATE TABLE campaigns (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
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
            CREATE TABLE policy_values (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL
            );
            CREATE TABLE run_heartbeats (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              worker_id TEXT NOT NULL,
              node_name TEXT,
              heartbeat_at TEXT NOT NULL,
              metadata_json TEXT NOT NULL DEFAULT '{}'
            );
            """
        )
        db.execute("INSERT INTO operators (id, status) VALUES ('operator-1', 'active')")
        db.execute("INSERT INTO campaigns (id, status, updated_at) VALUES ('run-1', 'queued', ?)", (now,))
        db.execute(
            """
            INSERT INTO campaign_jobs (
              id, campaign_id, job_type, status, submitted_by, payload_json, created_at, updated_at
            ) VALUES (
              'job-1',
              'run-1',
              'campaign_run',
              'queued',
              'operator-1',
              '{"targetUrl":"https://clinical-copilot.up.railway.app","categories":["tool-misuse"]}',
              ?,
              ?
            )
            """,
            (now, now),
        )
        db.commit()
    return sqlite_path, artifact_dir


if __name__ == "__main__":
    unittest.main()
