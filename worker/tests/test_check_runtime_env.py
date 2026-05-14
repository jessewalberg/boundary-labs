from __future__ import annotations

import os
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from scripts.check_runtime_env import main, normalize_argv, required_provider_names


class CheckRuntimeEnvTest(unittest.TestCase):
    def test_requires_provider_proof_values(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof"]), 1)

    def test_requires_enable_flag_to_equal_one(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "true",
                "OPENROUTER_API_KEY": "test",
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof"]), 1)

    def test_accepts_provider_proof_values(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "OPENROUTER_API_KEY": "test",
                "BOUNDARY_SMART_SESSION_SECRET": "test",
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof", "--require-smart-secret"]), 0)

    def test_accepts_openrouter_as_only_required_provider(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "BOUNDARY_REQUIRED_LLM_PROVIDERS": "openrouter",
                "OPENROUTER_API_KEY": "test",
            },
            clear=True,
        ):
            self.assertEqual(required_provider_names(), ["openrouter"])
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof"]), 0)

    def test_rejects_missing_openrouter_key_when_required(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "BOUNDARY_REQUIRED_LLM_PROVIDERS": "openrouter",
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof"]), 1)

    def test_accepts_security_smart_session_secret_alias(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "OPENROUTER_API_KEY": "test",
                "SECURITY_SMART_SESSION_SECRET": "test",
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof", "--require-smart-secret"]), 0)

    def test_accepts_existing_smart_session_secret_file(self) -> None:
        secret_file = Path(tempfile.mkdtemp(prefix="boundary-runtime-secret-file-")) / ".env"
        secret_file.write_text("SESSION_SECRET=test\n", encoding="utf-8")
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "OPENROUTER_API_KEY": "test",
                "BOUNDARY_SMART_SESSION_SECRET_FILE": str(secret_file),
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof", "--require-smart-secret"]), 0)

    def test_rejects_missing_smart_session_secret_file_path(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "1",
                "OPENROUTER_API_KEY": "test",
                "BOUNDARY_SMART_SESSION_SECRET_FILE": "/tmp/definitely-missing-boundary-session-secret.env",
            },
            clear=True,
        ):
            self.assertEqual(main_with_args(["check_runtime_env.py", "--require-provider-proof", "--require-smart-secret"]), 1)

    def test_normalizes_forwarded_argument_separator(self) -> None:
        self.assertEqual(
            normalize_argv(["--", "--require-provider-proof"]),
            ["--require-provider-proof"],
        )


def main_with_args(argv: list[str]) -> int:
    with patch("sys.argv", argv), redirect_stdout(StringIO()):
        return main()


if __name__ == "__main__":
    unittest.main()
