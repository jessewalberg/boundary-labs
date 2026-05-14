from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from worker.recovery import recover_stale_running_jobs
from worker.sentinels import sentinel_paths, write_complete, write_failed


class RecoveryTest(unittest.TestCase):
    def test_recovers_claimed_jobs_from_sentinels(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["complete-run", "failed-run", "orphan-run"])
        complete_paths = sentinel_paths(artifact_dir, "complete-run")
        complete_paths.artifact.parent.mkdir(parents=True, exist_ok=True)
        complete_paths.artifact.write_text('{"run_id":"complete-run","summary":{}}\n', encoding="utf-8")
        write_complete(complete_paths, {"run_id": "complete-run"})
        write_failed(sentinel_paths(artifact_dir, "failed-run"), "graph_error")

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 1, "failed": 1, "orphaned": 1, "fresh": 0, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            statuses = dict(db.execute("SELECT campaign_id, status FROM campaign_jobs").fetchall())
        self.assertEqual(statuses["complete-run"], "completed")
        self.assertEqual(statuses["failed-run"], "failed")
        self.assertEqual(statuses["orphan-run"], "failed")

    def test_skips_recent_claim_without_sentinel(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-fresh-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["fresh-run"])

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=600)

        self.assertEqual(result, {"completed": 0, "failed": 0, "orphaned": 0, "fresh": 1, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            status = db.execute("SELECT status FROM campaign_jobs WHERE campaign_id = 'fresh-run'").fetchone()[0]
        self.assertEqual(status, "claimed")

    def test_requeues_stale_claim_when_graph_history_can_resume_or_retry(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-resume-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["resume-run"], with_campaigns=True)
        paths = sentinel_paths(artifact_dir, "resume-run")
        paths.graph_history.parent.mkdir(parents=True, exist_ok=True)
        paths.graph_history.write_text(
            '[{"kind":"node","status":"success"},{"kind":"node","status":"running"}]\n',
            encoding="utf-8",
        )

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 0, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 1})
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status, claim_token, claimed_at FROM campaign_jobs WHERE campaign_id = 'resume-run'").fetchone()
            campaign_status = db.execute("SELECT status FROM campaigns WHERE id = 'resume-run'").fetchone()[0]
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE target_id = 'job-resume-run'").fetchone()
        self.assertEqual(job_status, ("queued", None, None))
        self.assertEqual(campaign_status, "queued")
        self.assertEqual(audit, ("claim_requeued_graph_resume", "queued"))

    def test_recovers_completed_job_from_valid_artifact_missing_complete_sentinel(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-artifact-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["artifact-run"], with_ingest_tables=True)
        paths = sentinel_paths(artifact_dir, "artifact-run")
        paths.artifact.parent.mkdir(parents=True, exist_ok=True)
        paths.artifact.write_text(
            """
            {
              "run_id": "artifact-run",
              "started_at": "2026-05-13T12:00:00.000Z",
              "completed_at": "2026-05-13T12:00:02.000Z",
              "target_url": "https://clinical-copilot.up.railway.app",
              "summary": {"total": 1, "pass": 1},
              "results": [
                {
                  "run_id": "artifact-run",
                  "case_id": "case-pass",
                  "category": "prompt_injection",
                  "attempt": {
                    "attempt_id": "attempt-pass",
                    "observed_at": "2026-05-13T12:00:01.000Z",
                    "turns": [{"turn": 1, "input": "safe", "http": {"status": 200}}]
                  },
                  "judge_agent": {
                    "verdict_id": "verdict-pass",
                    "status": "pass",
                    "severity": "high",
                    "rationale": "Refused safely."
                  }
                }
              ]
            }
            """,
            encoding="utf-8",
        )

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 1, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 0})
        self.assertTrue(paths.complete.exists())
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status, claim_token, claimed_at FROM campaign_jobs WHERE campaign_id = 'artifact-run'").fetchone()
            campaign_status = db.execute("SELECT status FROM campaigns WHERE id = 'artifact-run'").fetchone()[0]
            run_count = db.execute("SELECT COUNT(*) FROM runs WHERE run_id = 'artifact-run'").fetchone()[0]
            attempt_count = db.execute("SELECT COUNT(*) FROM attempts WHERE run_id = 'artifact-run'").fetchone()[0]
            verdict_count = db.execute("SELECT COUNT(*) FROM verdicts WHERE run_id = 'artifact-run'").fetchone()[0]
        self.assertEqual(job_status, ("completed", None, None))
        self.assertEqual(campaign_status, "completed")
        self.assertEqual(run_count, 1)
        self.assertEqual(attempt_count, 1)
        self.assertEqual(verdict_count, 1)

    def test_recovered_completed_job_still_completes_when_ingest_fails(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-ingest-fails-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["ingest-fails"], with_campaigns=True)
        paths = sentinel_paths(artifact_dir, "ingest-fails")
        paths.artifact.parent.mkdir(parents=True, exist_ok=True)
        paths.artifact.write_text("{not-json\n", encoding="utf-8")
        write_complete(paths, {"run_id": "ingest-fails"})

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 1, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status FROM campaign_jobs WHERE campaign_id = 'ingest-fails'").fetchone()[0]
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE action = 'artifact_ingest_failed'").fetchone()
        self.assertEqual(job_status, "completed")
        self.assertEqual(audit, ("artifact_ingest_failed", "degraded"))

    def test_complete_sentinel_without_artifact_fails_recovery(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-missing-artifact-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["missing-artifact"], with_campaigns=True)
        write_complete(sentinel_paths(artifact_dir, "missing-artifact"), {"run_id": "missing-artifact"})

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 0, "failed": 1, "orphaned": 0, "fresh": 0, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status FROM campaign_jobs WHERE campaign_id = 'missing-artifact'").fetchone()[0]
            campaign_status = db.execute("SELECT status FROM campaigns WHERE id = 'missing-artifact'").fetchone()[0]
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE action = 'runner_completed_missing_artifact'").fetchone()
        self.assertEqual(job_status, "failed")
        self.assertEqual(campaign_status, "failed")
        self.assertEqual(audit, ("runner_completed_missing_artifact", "failed"))

    def test_complete_and_failed_sentinel_conflict_fails_recovery(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-sentinel-conflict-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["conflict-run"], with_campaigns=True)
        paths = sentinel_paths(artifact_dir, "conflict-run")
        paths.artifact.parent.mkdir(parents=True, exist_ok=True)
        paths.artifact.write_text('{"run_id":"conflict-run","summary":{}}\n', encoding="utf-8")
        write_complete(paths, {"run_id": "conflict-run"})
        write_failed(paths, "graph_error")

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 0, "failed": 1, "orphaned": 0, "fresh": 0, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status FROM campaign_jobs WHERE campaign_id = 'conflict-run'").fetchone()[0]
            audit = db.execute("SELECT action, outcome FROM audit_events WHERE action = 'claim_failed_sentinel_conflict'").fetchone()
        self.assertEqual(job_status, "failed")
        self.assertEqual(audit, ("claim_failed_sentinel_conflict", "failed"))

    def test_updates_campaign_status_for_failed_recovery(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-recovery-failed-campaign-"))
        sqlite_path = root / "boundary.db"
        artifact_dir = root / "artifacts"
        make_db(sqlite_path, ["failed-campaign"], with_campaigns=True)
        write_failed(sentinel_paths(artifact_dir, "failed-campaign"), "graph_error")

        result = recover_stale_running_jobs(sqlite_path, artifact_dir, claim_timeout_seconds=0)

        self.assertEqual(result, {"completed": 0, "failed": 1, "orphaned": 0, "fresh": 0, "requeued": 0})
        with closing(sqlite3.connect(sqlite_path)) as db:
            job_status = db.execute("SELECT status FROM campaign_jobs WHERE campaign_id = 'failed-campaign'").fetchone()[0]
            campaign_status = db.execute("SELECT status FROM campaigns WHERE id = 'failed-campaign'").fetchone()[0]
        self.assertEqual(job_status, "failed")
        self.assertEqual(campaign_status, "failed")


def make_db(
    sqlite_path: Path,
    campaign_ids: list[str],
    *,
    with_campaigns: bool = False,
    with_ingest_tables: bool = False,
) -> None:
    now = datetime.now(UTC).isoformat()
    with closing(sqlite3.connect(sqlite_path)) as db:
        db.executescript(
            """
            CREATE TABLE campaign_jobs (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              status TEXT NOT NULL,
              claim_token TEXT,
              claimed_at TEXT,
              updated_at TEXT
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
        elif with_campaigns:
            db.executescript(
                """
                CREATE TABLE campaigns (
                  id TEXT PRIMARY KEY,
                  status TEXT NOT NULL,
                  updated_at TEXT
                );
                """
            )
        for campaign_id in campaign_ids:
            db.execute(
                """
                INSERT INTO campaign_jobs (id, campaign_id, status, claim_token, claimed_at, updated_at)
                VALUES (?, ?, 'claimed', 'token', ?, ?)
                """,
                (f"job-{campaign_id}", campaign_id, now, now),
            )
            if with_campaigns:
                db.execute(
                    "INSERT INTO campaigns (id, status, updated_at) VALUES (?, 'running', ?)",
                    (campaign_id, now),
                )
            if with_ingest_tables:
                db.execute(
                    """
                    INSERT INTO campaigns (
                      id, target_url, categories_json, status, data_mode, budget_cents,
                      submitted_by, artifact_path, created_at, updated_at
                    ) VALUES (?, 'https://clinical-copilot.up.railway.app', '[]', 'running', 'synthetic', 500,
                      'operator-1', 'queued.json', ?, ?)
                    """,
                    (campaign_id, now, now),
                )
        db.commit()


if __name__ == "__main__":
    unittest.main()
