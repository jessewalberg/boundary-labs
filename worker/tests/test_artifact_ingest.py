from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from worker.artifact_ingest import ingest_completed_artifact


class ArtifactIngestTest(unittest.TestCase):
    def test_ingests_run_attempt_verdict_and_finding_idempotently(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-worker-ingest-"))
        sqlite_path = root / "boundary.db"
        artifact_path = root / "artifacts" / "runs" / "run-1" / "run-1.json"
        artifact_path.parent.mkdir(parents=True)
        make_db(sqlite_path)
        artifact_path.write_text(json.dumps(build_artifact()) + "\n", encoding="utf-8")

        first = ingest_completed_artifact(sqlite_path, artifact_path)
        second = ingest_completed_artifact(sqlite_path, artifact_path)

        self.assertEqual(first, {"runs": 1, "attempts": 2, "verdicts": 2, "findings": 1})
        self.assertEqual(second, {"runs": 0, "attempts": 0, "verdicts": 0, "findings": 1})
        with closing(sqlite3.connect(sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM runs WHERE run_id = 'run-1'").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM attempts WHERE run_id = 'run-1'").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT severity FROM verdicts WHERE case_id = 'case-fail'").fetchone()[0], "med")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM findings WHERE case_id = 'case-fail'").fetchone()[0], 1)


def make_db(sqlite_path: Path) -> None:
    with closing(sqlite3.connect(sqlite_path)) as db:
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
            CREATE TABLE findings (
              id TEXT PRIMARY KEY,
              category TEXT NOT NULL,
              case_id TEXT NOT NULL,
              title TEXT NOT NULL,
              severity TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open',
              first_seen_run_id TEXT,
              latest_run_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE (category, case_id, status)
            );
            CREATE TABLE finding_attempts (
              finding_id TEXT NOT NULL,
              attempt_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (finding_id, attempt_id)
            );
            """
        )
        db.execute(
            """
            INSERT INTO campaigns (
              id, target_url, categories_json, status, data_mode, budget_cents,
              submitted_by, artifact_path, created_at, updated_at
            ) VALUES (
              'run-1', 'https://old.example.test', '[]', 'running', 'synthetic', 500,
              'operator-1', 'queued.json', '2026-05-13T11:00:00.000Z', '2026-05-13T11:00:00.000Z'
            )
            """
        )
        db.commit()


def build_artifact() -> dict:
    return {
        "run_id": "run-1",
        "started_at": "2026-05-13T12:00:00.000Z",
        "completed_at": "2026-05-13T12:00:02.000Z",
        "target_url": "https://clinical-copilot.up.railway.app",
        "summary": {"total": 2, "pass": 1, "fail": 1, "partial": 0, "invalid": 0},
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
                },
            },
            {
                "run_id": "run-1",
                "case_id": "case-fail",
                "category": "authorization_bypass",
                "subcategory": "cross_patient",
                "attempt": {
                    "attempt_id": "attempt-fail",
                    "observed_at": "2026-05-13T12:00:02.000Z",
                    "turns": [{"turn": 1, "input": "unsafe", "http": {"status": 200, "body": "leaked"}}],
                },
                "judge_agent": {
                    "verdict_id": "verdict-fail",
                    "status": "fail",
                    "severity": "medium",
                    "rationale": "Matched prohibited pattern.",
                },
            },
        ],
    }


if __name__ == "__main__":
    unittest.main()
