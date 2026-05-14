from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from worker.config import WorkerConfig
from worker.main import worker_tick
from worker.queue import ClaimedJob


class WorkerTickTest(unittest.TestCase):
    def test_tick_runs_recovery_before_claiming_next_job(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-worker-tick-"))
        config = WorkerConfig(
            sqlite_path=root / "boundary.db",
            artifact_dir=root / "artifacts",
            heartbeat_path=root / "worker.heartbeat",
            poll_interval_seconds=0,
            claim_timeout_seconds=5,
        )
        calls: list[str] = []

        def fake_recover(*_args, **_kwargs) -> dict[str, int]:
            calls.append("recover")
            return {"completed": 0, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 0}

        def fake_claim(*_args, **_kwargs) -> None:
            calls.append("claim")
            return None

        with (
            patch("worker.main.write_heartbeat"),
            patch("worker.main.recover_stale_running_jobs", side_effect=fake_recover),
            patch("worker.main.claim_next_job", side_effect=fake_claim),
        ):
            processed = worker_tick(config, worker_id="worker-test")

        self.assertFalse(processed)
        self.assertEqual(calls, ["recover", "claim"])

    def test_tick_passes_claim_token_to_process_job(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-worker-tick-"))
        config = WorkerConfig(
            sqlite_path=root / "boundary.db",
            artifact_dir=root / "artifacts",
            heartbeat_path=root / "worker.heartbeat",
        )
        job = ClaimedJob(
            id="job-1",
            campaign_id="run-1",
            job_type="campaign_run",
            submitted_by="operator-1",
            claim_token="worker:test-token",
            payload_json="{}",
        )

        with (
            patch("worker.main.write_heartbeat"),
            patch("worker.main.recover_stale_running_jobs"),
            patch("worker.main.claim_next_job", return_value=job),
            patch("worker.main.operator_is_active", return_value=True),
            patch("worker.main.process_job") as process_job,
        ):
            processed = worker_tick(config, worker_id="worker-test")

        self.assertTrue(processed)
        process_job.assert_called_once_with(
            config.sqlite_path,
            config.artifact_dir,
            "job-1",
            "run-1",
            claim_token="worker:test-token",
        )


if __name__ == "__main__":
    unittest.main()
