from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from worker.queue import claim_next_job, operator_is_active, release_claim


class QueueTest(unittest.TestCase):
    def test_claims_next_queued_job_atomically(self) -> None:
        sqlite_path = make_db()

        job = claim_next_job(sqlite_path, worker_id="worker-test")

        self.assertIsNotNone(job)
        assert job is not None
        self.assertEqual(job.id, "job-1")
        with closing(sqlite3.connect(sqlite_path)) as db:
            row = db.execute("SELECT status, claim_token FROM campaign_jobs WHERE id = 'job-1'").fetchone()
        self.assertEqual(row[0], "claimed")
        self.assertTrue(row[1].startswith("worker-test:"))

    def test_operator_recheck_refuses_revoked_submitter(self) -> None:
        sqlite_path = make_db(operator_status="revoked")
        job = claim_next_job(sqlite_path, worker_id="worker-test")
        assert job is not None

        self.assertFalse(operator_is_active(sqlite_path, job.submitted_by))
        release_claim(sqlite_path, job.id, reason="claim_refused_operator_revoked")

        with closing(sqlite3.connect(sqlite_path)) as db:
            row = db.execute("SELECT status, claim_token FROM campaign_jobs WHERE id = 'job-1'").fetchone()
            audit = db.execute("SELECT action FROM audit_events WHERE action = 'claim_refused_operator_revoked'").fetchone()
        self.assertEqual(row, ("queued", None))
        self.assertEqual(audit[0], "claim_refused_operator_revoked")


def make_db(operator_status: str = "active") -> Path:
    root = Path(tempfile.mkdtemp(prefix="boundary-worker-"))
    sqlite_path = root / "boundary.db"
    now = datetime.now(UTC).isoformat()
    with closing(sqlite3.connect(sqlite_path)) as db:
        db.executescript(
            """
            CREATE TABLE operators (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL
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
        db.execute("INSERT INTO operators (id, status) VALUES (?, ?)", ("operator-1", operator_status))
        db.execute(
            """
            INSERT INTO campaign_jobs (
              id, campaign_id, job_type, status, submitted_by, payload_json, created_at, updated_at
            ) VALUES (
              'job-1', 'run-1', 'campaign_run', 'queued', 'operator-1', '{}', ?, ?
            )
            """,
            (now, now),
        )
        db.commit()
    return sqlite_path


if __name__ == "__main__":
    unittest.main()
