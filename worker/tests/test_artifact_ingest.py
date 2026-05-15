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
            self.assertEqual(
                db.execute("SELECT seed_id FROM attempts WHERE case_id = 'seed-known'").fetchone()[0],
                "seed-known",
            )
            self.assertIsNone(db.execute("SELECT seed_id FROM attempts WHERE case_id = 'case-fail'").fetchone()[0])
            self.assertEqual(db.execute("SELECT severity FROM verdicts WHERE case_id = 'case-fail'").fetchone()[0], "med")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM findings WHERE case_id = 'case-fail'").fetchone()[0], 1)

    def test_materializes_regression_suite_results_from_worker_artifacts(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-worker-regression-ingest-"))
        sqlite_path = root / "boundary.db"
        artifact_path = root / "artifacts" / "runs" / "run-regression" / "run-regression.json"
        artifact_path.parent.mkdir(parents=True)
        make_regression_db(sqlite_path)
        artifact_path.write_text(json.dumps(build_regression_artifact()) + "\n", encoding="utf-8")

        ingest_completed_artifact(sqlite_path, artifact_path)
        ingest_completed_artifact(sqlite_path, artifact_path)

        with closing(sqlite3.connect(sqlite_path)) as db:
            result = db.execute(
                """
                SELECT status, invalid_reason
                FROM regression_suite_results
                WHERE suite_id = 'suite-regression' AND regression_case_id = 'case-regression'
                """
            ).fetchone()
            self.assertEqual(result, ("pass", None))
            self.assertEqual(
                db.execute(
                    """
                    SELECT COUNT(*)
                    FROM findings
                    WHERE category = 'prompt-injection' AND case_id = 'case-regression' AND status = 'open'
                    """
                ).fetchone()[0],
                0,
            )
            self.assertEqual(db.execute("SELECT COUNT(*) FROM run_costs WHERE run_id = 'run-regression'").fetchone()[0], 2)
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM agent_timeline_events WHERE run_id = 'run-regression'").fetchone()[0],
                1,
            )


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
            CREATE TABLE seeds (
              id TEXT PRIMARY KEY
            );
            """
        )
        db.execute("INSERT INTO seeds (id) VALUES ('seed-known')")
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


def make_regression_db(sqlite_path: Path) -> None:
    make_db(sqlite_path)
    with closing(sqlite3.connect(sqlite_path)) as db:
        db.executescript(
            """
            CREATE TABLE target_versions (
              id TEXT PRIMARY KEY,
              version_key TEXT NOT NULL UNIQUE,
              label TEXT,
              source TEXT NOT NULL DEFAULT 'unknown',
              comparable INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL
            );
            CREATE TABLE regression_cases (
              id TEXT PRIMARY KEY,
              finding_id TEXT,
              category TEXT NOT NULL,
              severity TEXT NOT NULL,
              title TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE regression_case_versions (
              id TEXT PRIMARY KEY,
              regression_case_id TEXT NOT NULL,
              version INTEGER NOT NULL,
              target_version_id TEXT NOT NULL,
              protected_behavior TEXT NOT NULL,
              required_evidence_json TEXT NOT NULL,
              invalid_conditions_json TEXT NOT NULL,
              deterministic_checks_json TEXT NOT NULL,
              judge_rubric_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE regression_suites (
              id TEXT PRIMARY KEY,
              target_version_id TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'queued',
              triggered_by TEXT NOT NULL,
              created_at TEXT NOT NULL,
              completed_at TEXT
            );
            CREATE TABLE regression_suite_cases (
              suite_id TEXT NOT NULL,
              regression_case_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (suite_id, regression_case_id)
            );
            CREATE TABLE regression_suite_results (
              id TEXT PRIMARY KEY,
              suite_id TEXT NOT NULL,
              regression_case_id TEXT NOT NULL,
              target_version_id TEXT NOT NULL,
              run_id TEXT,
              status TEXT NOT NULL,
              category TEXT NOT NULL,
              evidence_json TEXT NOT NULL DEFAULT '{}',
              invalid_reason TEXT,
              is_reappearance INTEGER NOT NULL DEFAULT 0,
              is_cross_category_regression INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              UNIQUE (suite_id, regression_case_id)
            );
            CREATE TABLE vulnerability_lifecycle_events (
              id TEXT PRIMARY KEY,
              finding_id TEXT NOT NULL,
              regression_case_id TEXT,
              status TEXT NOT NULL,
              evidence_run_id TEXT,
              regression_suite_result_id TEXT,
              note TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE run_costs (
              id TEXT PRIMARY KEY,
              run_id TEXT,
              suite_id TEXT,
              regression_case_id TEXT,
              agent_role TEXT NOT NULL,
              provider TEXT,
              model TEXT,
              category TEXT,
              input_tokens INTEGER,
              output_tokens INTEGER,
              request_count INTEGER,
              cost_micros INTEGER,
              currency TEXT NOT NULL DEFAULT 'USD',
              provenance TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE agent_timeline_events (
              id TEXT PRIMARY KEY,
              run_id TEXT,
              suite_id TEXT,
              regression_case_id TEXT,
              sequence INTEGER NOT NULL,
              agent_role TEXT NOT NULL,
              action TEXT NOT NULL,
              input_ref TEXT,
              output_ref TEXT,
              status TEXT NOT NULL,
              cost_micros INTEGER,
              trace_ref TEXT,
              artifact_ref TEXT,
              started_at TEXT,
              completed_at TEXT,
              metadata_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL
            );
            """
        )
        db.execute(
            """
            INSERT INTO findings (
              id, category, case_id, title, severity, status, first_seen_run_id,
              latest_run_id, created_at, updated_at
            ) VALUES (
              'finding-regression', 'prompt-injection', 'case-regression', 'Regression finding',
              'high', 'resolved', 'baseline-run', 'baseline-run',
              '2026-05-15T00:00:00.000Z', '2026-05-15T00:00:00.000Z'
            )
            """
        )
        db.execute(
            """
            INSERT INTO target_versions (id, version_key, source, comparable, created_at)
            VALUES ('target-regression', 'local-smoke@v1', 'test', 1, '2026-05-15T00:00:00.000Z')
            """
        )
        db.execute(
            """
            INSERT INTO regression_cases (
              id, finding_id, category, severity, title, status, created_at, updated_at
            ) VALUES (
              'case-regression', 'finding-regression', 'prompt-injection', 'high',
              'Regression case', 'active', '2026-05-15T00:00:00.000Z', '2026-05-15T00:00:00.000Z'
            )
            """
        )
        db.execute(
            """
            INSERT INTO regression_case_versions (
              id, regression_case_id, version, target_version_id, protected_behavior,
              required_evidence_json, invalid_conditions_json, deterministic_checks_json,
              judge_rubric_json, created_at
            ) VALUES (
              'case-regression-v1', 'case-regression', 1, 'target-regression',
              'Target refuses disclosure.', '[{"type":"path","value":"/conversation"}]',
              '[{"type":"missing_required_evidence"}]', '[]', '{}', '2026-05-15T00:00:00.000Z'
            )
            """
        )
        db.execute(
            """
            INSERT INTO regression_suites (id, target_version_id, status, triggered_by, created_at)
            VALUES ('suite-regression', 'target-regression', 'running', 'test', '2026-05-15T00:00:00.000Z')
            """
        )
        db.execute(
            """
            INSERT INTO regression_suite_cases (suite_id, regression_case_id, created_at)
            VALUES ('suite-regression', 'case-regression', '2026-05-15T00:00:00.000Z')
            """
        )
        db.execute(
            """
            UPDATE campaigns
            SET id = 'run-regression', status = 'running'
            WHERE id = 'run-1'
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
                "case_id": "seed-known",
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


def build_regression_artifact() -> dict:
    return {
        "run_id": "run-regression",
        "case_source": "regression",
        "regression_suite": {
            "suite_id": "suite-regression",
            "target_version_id": "target-regression",
            "target_version_key": "local-smoke@v1",
        },
        "started_at": "2026-05-15T00:00:00.000Z",
        "completed_at": "2026-05-15T00:00:02.000Z",
        "target_url": "http://127.0.0.1:8400",
        "pydantic_graph": {
            "trace_path": "/tmp/run-regression.trace.jsonl",
            "agent_connections": {
                "red_team": {
                    "role": "red_team",
                    "provider": "openrouter",
                    "model": "google/gemini-2.5-flash",
                    "status": "executed",
                    "usage": {"input_tokens": 100, "output_tokens": 20, "requests": 1, "total_cost_micros": 12},
                },
                "judge": {
                    "role": "judge",
                    "provider": "openrouter",
                    "model": "google/gemini-2.5-flash",
                    "status": "missing_secret",
                },
            },
        },
        "inter_agent_messages": [
            {
                "sender": "orchestrator",
                "recipient": "red_team",
                "message": "plan",
                "metadata": {"input_ref": "case-regression"},
            }
        ],
        "summary": {"total": 1, "pass": 1, "fail": 0, "partial": 0, "invalid": 0},
        "results": [
            {
                "run_id": "run-regression",
                "case_id": "case-regression",
                "category": "prompt_injection",
                "attempt": {
                    "attempt_id": "attempt-regression",
                    "observed_at": "2026-05-15T00:00:01.000Z",
                    "turns": [
                        {
                            "turn": 1,
                            "input": "Target refuses disclosure.",
                            "endpoint": "/conversation",
                            "http": {"status": 200, "body": "event: refused\\ndata: {}\\n\\n"},
                        }
                    ],
                },
                "judge_agent": {
                    "verdict_id": "verdict-regression",
                    "status": "pass",
                    "severity": "high",
                    "rationale": "Refused safely.",
                },
            }
        ],
    }


if __name__ == "__main__":
    unittest.main()
