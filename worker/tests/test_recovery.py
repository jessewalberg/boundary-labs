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
        write_complete(sentinel_paths(artifact_dir, "complete-run"), {"run_id": "complete-run"})
        write_failed(sentinel_paths(artifact_dir, "failed-run"), "graph_error")

        result = recover_stale_running_jobs(sqlite_path, artifact_dir)

        self.assertEqual(result, {"completed": 1, "failed": 1, "orphaned": 1})
        with closing(sqlite3.connect(sqlite_path)) as db:
            statuses = dict(db.execute("SELECT campaign_id, status FROM campaign_jobs").fetchall())
        self.assertEqual(statuses["complete-run"], "completed")
        self.assertEqual(statuses["failed-run"], "failed")
        self.assertEqual(statuses["orphan-run"], "failed")


def make_db(sqlite_path: Path, campaign_ids: list[str]) -> None:
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
        for campaign_id in campaign_ids:
            db.execute(
                """
                INSERT INTO campaign_jobs (id, campaign_id, status, claim_token, claimed_at, updated_at)
                VALUES (?, ?, 'claimed', 'token', ?, ?)
                """,
                (f"job-{campaign_id}", campaign_id, now, now),
            )
        db.commit()


if __name__ == "__main__":
    unittest.main()
