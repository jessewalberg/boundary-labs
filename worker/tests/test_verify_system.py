from __future__ import annotations

import tempfile
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.verify_system import build_checks, main, normalize_argv, readiness_configuration_errors


class VerifySystemTest(unittest.TestCase):
    def test_provider_check_uses_explicit_sqlite_path(self) -> None:
        sqlite_path = Path(tempfile.mkdtemp(prefix="boundary-verify-system-")) / "proof.db"
        sqlite_path.write_text("", encoding="utf-8")

        checks = build_checks(args(sqlite_path=sqlite_path))

        llm_check = next(check for check in checks if check.name == "provider-backed LLM agents")
        self.assertEqual(llm_check.command[-2:], ["--sqlite-path", str(sqlite_path)])

    def test_provider_check_defaults_to_local_db_when_it_exists(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-verify-system-"))
        local_db = root / "apps/web/var/boundary.db"
        local_db.parent.mkdir(parents=True)
        local_db.write_text("", encoding="utf-8")

        with patch("scripts.verify_system.ROOT", root):
            checks = build_checks(args())

        llm_check = next(check for check in checks if check.name == "provider-backed LLM agents")
        self.assertEqual(llm_check.command[-2:], ["--sqlite-path", str(local_db)])

    def test_main_rejects_missing_explicit_sqlite_path(self) -> None:
        missing_path = Path(tempfile.mkdtemp(prefix="boundary-verify-system-")) / "missing.db"

        with (
            patch("sys.argv", ["verify_system.py", "--sqlite-path", str(missing_path)]),
            patch("scripts.verify_system.subprocess.run") as run,
            redirect_stdout(StringIO()),
            redirect_stderr(StringIO()),
        ):
            exit_code = main()

        self.assertEqual(exit_code, 2)
        run.assert_not_called()

    def test_readiness_rejects_skips_and_missing_proof_inputs(self) -> None:
        errors = readiness_configuration_errors(args(readiness=True, skip_llm=True, skip_artifact=True))

        self.assertIn("--readiness cannot be used with --skip-llm", errors)
        self.assertIn("--readiness cannot be used with --skip-artifact", errors)
        self.assertIn("--readiness requires --sqlite-path from the proof campaign output", errors)
        self.assertIn("--readiness requires --artifact-path from the proof campaign output", errors)
        self.assertIn("--readiness requires --expected-target-origin from the proof campaign output", errors)

    def test_readiness_accepts_complete_proof_inputs(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-verify-system-"))
        sqlite_path = root / "proof.db"
        artifact_path = root / "proof.json"
        sqlite_path.write_text("", encoding="utf-8")
        artifact_path.write_text("{}", encoding="utf-8")

        errors = readiness_configuration_errors(
            args(
                readiness=True,
                skip_build=False,
                skip_artifact=False,
                sqlite_path=sqlite_path,
                artifact_path=artifact_path,
                expected_target_origin="https://clinical-copilot.up.railway.app",
            )
        )

        self.assertEqual(errors, [])

    def test_readiness_includes_provider_runtime_env_check(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-verify-system-"))
        sqlite_path = root / "proof.db"
        artifact_path = root / "proof.json"
        sqlite_path.write_text("", encoding="utf-8")
        artifact_path.write_text("{}", encoding="utf-8")

        checks = build_checks(
            args(
                readiness=True,
                skip_build=False,
                skip_artifact=False,
                sqlite_path=sqlite_path,
                artifact_path=artifact_path,
                expected_target_origin="https://clinical-copilot.up.railway.app",
            )
        )

        self.assertEqual(checks[0].name, "provider runtime environment")
        self.assertEqual(
            checks[0].command,
            [
                sys.executable,
                "scripts/check_runtime_env.py",
                "--require-provider-proof",
                "--require-smart-secret",
            ],
        )

    def test_readiness_stops_after_provider_runtime_env_failure(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="boundary-verify-system-"))
        sqlite_path = root / "proof.db"
        artifact_path = root / "proof.json"
        sqlite_path.write_text("", encoding="utf-8")
        artifact_path.write_text("{}", encoding="utf-8")

        failed_result = SimpleNamespace(returncode=1)

        with (
            patch(
                "sys.argv",
                [
                    "verify_system.py",
                    "--readiness",
                    "--sqlite-path",
                    str(sqlite_path),
                    "--artifact-path",
                    str(artifact_path),
                    "--expected-target-origin",
                    "https://clinical-copilot.up.railway.app",
                ],
            ),
            patch("scripts.verify_system.subprocess.run", return_value=failed_result) as run,
            redirect_stdout(StringIO()),
            redirect_stderr(StringIO()),
        ):
            self.assertEqual(main(), 1)

        run.assert_called_once()

    def test_normalizes_pnpm_argument_separator(self) -> None:
        self.assertEqual(
            normalize_argv(["--", "--sqlite-path", "proof.db", "--artifact-path", "proof.json"]),
            ["--sqlite-path", "proof.db", "--artifact-path", "proof.json"],
        )


def args(**overrides: object) -> SimpleNamespace:
    values = {
        "skip_build": True,
        "skip_llm": False,
        "skip_artifact": True,
        "readiness": False,
        "sqlite_path": None,
        "artifact_path": None,
        "expected_target_origin": None,
        "allow_local_target": False,
        "include_docker": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


if __name__ == "__main__":
    unittest.main()
