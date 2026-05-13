from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from worker.config import load_config
from worker.heartbeat import write_heartbeat
from worker.queue import (
    claim_next_job,
    mark_job_completed,
    mark_job_failed,
    operator_is_active,
    release_claim,
)
from worker.recovery import recover_stale_running_jobs
from worker.sentinels import sentinel_paths, write_failed


running = True


def handle_shutdown(_signum: int, _frame: object) -> None:
    global running
    running = False


def main() -> None:
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    config = load_config()
    worker_id = os.environ.get("BOUNDARY_WORKER_ID", f"worker-{uuid4()}")
    wait_for_schema_ready(config.sqlite_path)
    recover_stale_running_jobs(config.sqlite_path, config.artifact_dir)

    while running:
        write_heartbeat(config.heartbeat_path, worker_id=worker_id)
        job = claim_next_job(config.sqlite_path, worker_id=worker_id)
        if not job:
            time.sleep(config.poll_interval_seconds)
            continue

        if not operator_is_active(config.sqlite_path, job.submitted_by):
            release_claim(config.sqlite_path, job.id, reason="claim_refused_operator_revoked")
            continue

        process_job(config.sqlite_path, config.artifact_dir, job.id, job.campaign_id)


def process_job(sqlite_path: Path, artifact_dir: Path, job_id: str, run_id: str) -> None:
    paths = sentinel_paths(artifact_dir, run_id)
    try:
        result = subprocess.run(
            [sys.executable, "-u", "scripts/run_mvp_evals.py", "--run-id", run_id],
            check=False,
            env=worker_subprocess_env(),
        )
    except Exception as exc:
        write_failed(paths, "runner_spawn_failed", {"error": str(exc)})
        mark_job_failed(sqlite_path, job_id, reason="runner_spawn_failed")
        return

    if paths.complete.exists() and paths.artifact.exists():
        mark_job_completed(sqlite_path, job_id)
    elif paths.complete.exists():
        write_failed(paths, "runner_completed_missing_artifact")
        mark_job_failed(sqlite_path, job_id, reason="runner_completed_missing_artifact")
    elif paths.failed.exists():
        mark_job_failed(sqlite_path, job_id, reason="runner_failed_sentinel")
    elif result.returncode != 0:
        write_failed(paths, "runner_crashed_no_sentinel", {"returncode": result.returncode})
        mark_job_failed(sqlite_path, job_id, reason="runner_crashed_no_sentinel")
    else:
        write_failed(paths, "runner_completed_no_sentinel")
        mark_job_failed(sqlite_path, job_id, reason="runner_completed_no_sentinel")


def worker_subprocess_env() -> dict[str, str]:
    allowed = dict(os.environ)
    # Explicitly keep model-provider keys in the worker subprocess while the web child strips them.
    return allowed


def wait_for_schema_ready(sqlite_path: Path, timeout_seconds: float = 60.0) -> None:
    from worker.queue import connect

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not sqlite_path.exists():
            time.sleep(1)
            continue
        try:
            with closing(connect(sqlite_path)) as db:
                row = db.execute("SELECT value_json FROM policy_values WHERE key = 'schema_ready'").fetchone()
            if row and row["value_json"] == "true":
                return
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit("Timed out waiting for schema_ready policy_values row.")
