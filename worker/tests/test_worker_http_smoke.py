from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from worker.main import process_job
from worker.sentinels import sentinel_paths


class WorkerHttpSmokeTest(unittest.TestCase):
    def test_process_job_runs_real_graph_against_local_http_target_and_ingests_results(self) -> None:
        try:
            server = ThreadingHTTPServer(("127.0.0.1", 0), SmokeTargetHandler)
        except PermissionError as exc:
            self.skipTest(f"local HTTP listener is unavailable in this sandbox: {exc}")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        target_url = f"http://127.0.0.1:{server.server_address[1]}"

        try:
            sqlite_path, artifact_dir = make_db(
                payload=json.dumps({
                    "targetUrl": target_url,
                    "deployedUrl": target_url,
                    "categories": [],
                    "timeoutSeconds": 2,
                })
            )
            with patch.dict(
                os.environ,
                {
                    "BOUNDARY_TARGET_ALLOWLIST": target_url,
                    "BOUNDARY_ENABLE_LLM_AGENTS": "",
                    "OPENROUTER_API_KEY": "",
                },
                clear=False,
            ):
                process_job(sqlite_path, artifact_dir, "job-1", "run-1")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        paths = sentinel_paths(artifact_dir, "run-1")
        artifact = json.loads(paths.artifact.read_text(encoding="utf-8"))
        self.assertEqual(artifact["summary"], {"total": 4, "pass": 4, "fail": 0, "partial": 0, "invalid": 0})
        self.assertEqual(len(artifact["results"]), 4)
        self.assertEqual(artifact["results"][0]["attempt"]["turns"][0]["http"]["status"], 200)
        self.assertEqual(artifact["pydantic_graph"]["agent_connections"]["red_team"]["status"], "disabled")

        with closing(sqlite3.connect(sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT status FROM campaign_jobs WHERE id = 'job-1'").fetchone()[0], "completed")
            self.assertEqual(db.execute("SELECT status FROM campaigns WHERE id = 'run-1'").fetchone()[0], "completed")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM runs WHERE run_id = 'run-1'").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM attempts WHERE run_id = 'run-1'").fetchone()[0], 4)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM verdicts WHERE run_id = 'run-1' AND status = 'pass'").fetchone()[0], 4)


class SmokeTargetHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.startswith("/healthz") or self.path.startswith("/readyz"):
            self.respond_json(200, {"status": "ok"})
            return
        if self.path.startswith("/auth/session"):
            self.respond_json(401, {"authenticated": False})
            return
        if self.path.startswith("/conversation"):
            body = 'event: refused\ndata: {"detail":"refused"}\n\n'
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(body.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
            return
        self.respond_json(404, {"error": "not_found"})

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def respond_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def make_db(payload: str) -> tuple[Path, Path]:
    root = Path(tempfile.mkdtemp(prefix="boundary-worker-http-smoke-"))
    sqlite_path = root / "boundary.db"
    artifact_dir = root / "artifacts"
    now = datetime.now(UTC).isoformat()
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
            CREATE TABLE policy_values (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL
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
            CREATE TABLE run_heartbeats (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              worker_id TEXT NOT NULL,
              node_name TEXT,
              heartbeat_at TEXT NOT NULL,
              metadata_json TEXT NOT NULL DEFAULT '{}'
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
        db.execute(
            """
            INSERT INTO campaigns (
              id, target_url, categories_json, status, data_mode, budget_cents,
              submitted_by, artifact_path, created_at, updated_at
            ) VALUES (
              'run-1', 'http://127.0.0.1', '[]', 'running', 'synthetic', 500,
              'operator-1', 'queued.json', ?, ?
            )
            """,
            (now, now),
        )
        db.execute(
            """
            INSERT INTO campaign_jobs (
              id, campaign_id, status, submitted_by, payload_json, created_at, updated_at
            ) VALUES ('job-1', 'run-1', 'claimed', 'operator-1', ?, ?, ?)
            """,
            (payload, now, now),
        )
        db.commit()
    return sqlite_path, artifact_dir


if __name__ == "__main__":
    unittest.main()
