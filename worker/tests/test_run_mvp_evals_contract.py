from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


class RunnerContractTest(unittest.TestCase):
    def test_runner_exposes_run_id_mode_and_sentinels(self) -> None:
        module = load_runner()
        parser = module.build_parser()
        args = parser.parse_args(["--run-id", "run-1"])
        self.assertEqual(args.run_id, "run-1")

        root = Path(tempfile.mkdtemp(prefix="boundary-runner-"))
        base = root / "run-1"
        module.write_heartbeat_sentinel(base, {"case_id": "case-1"})
        module.write_complete_sentinel(base, {"run_id": "run-1"})
        module.write_failed_sentinel(base, "runner_refused_overwrite")

        self.assertEqual(json.loads((root / "run-1.heartbeat").read_text(encoding="utf-8"))["case_id"], "case-1")
        self.assertTrue((root / "run-1.complete").exists())
        self.assertEqual(json.loads((root / "run-1.failed").read_text(encoding="utf-8"))["reason"], "runner_refused_overwrite")


def load_runner():
    path = Path("scripts/run_mvp_evals.py")
    spec = importlib.util.spec_from_file_location("run_mvp_evals", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["run_mvp_evals"] = module
    spec.loader.exec_module(module)
    return module


if __name__ == "__main__":
    unittest.main()
