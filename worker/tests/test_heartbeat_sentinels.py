from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from worker.heartbeat import write_heartbeat
from worker.path_jail import assert_inside
from worker.sentinels import sentinel_paths, write_complete, write_failed, write_run_heartbeat


class HeartbeatSentinelTest(unittest.TestCase):
    def test_writes_worker_and_run_heartbeats(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-heartbeat-"))
        heartbeat = root / "worker.heartbeat"
        write_heartbeat(heartbeat, worker_id="worker-test", now=1.5)
        self.assertIn("worker-test", heartbeat.read_text(encoding="utf-8"))

        paths = sentinel_paths(root / "artifacts", "run-1")
        write_run_heartbeat(paths, {"case_id": "case-1"})
        self.assertEqual(json.loads(paths.heartbeat.read_text(encoding="utf-8"))["case_id"], "case-1")

    def test_writes_complete_and_failed_sentinels(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-sentinel-"))
        paths = sentinel_paths(root / "artifacts", "run-1")

        write_complete(paths, {"run_id": "run-1"})
        write_failed(paths, "graph_error")

        self.assertTrue(paths.complete.exists())
        self.assertEqual(json.loads(paths.failed.read_text(encoding="utf-8"))["reason"], "graph_error")

    def test_path_jail_rejects_escape(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-jail-"))
        with self.assertRaises(ValueError):
            assert_inside(root / "artifacts", root / "outside.json")


if __name__ == "__main__":
    unittest.main()
