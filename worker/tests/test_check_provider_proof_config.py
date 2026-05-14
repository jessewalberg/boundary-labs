from __future__ import annotations

import argparse
import os
import subprocess
import unittest
from unittest.mock import patch

from scripts.check_provider_proof_config import (
    build_checks,
    check_github_environment,
    check_local_runtime_env,
    check_railway_environment,
    github_required_secrets,
    main,
    normalize_argv,
    parse_gh_secret_names,
    parse_missing_lines,
)


class CheckProviderProofConfigTest(unittest.TestCase):
    def test_parse_gh_secret_names(self) -> None:
        output = """
NAME                       UPDATED
OPENROUTER_API_KEY         2026-05-14
"""

        self.assertEqual(parse_gh_secret_names(output), {"OPENROUTER_API_KEY"})

    def test_github_check_reports_missing_secret_names_without_values(self) -> None:
        result = subprocess.CompletedProcess(
            ["gh", "secret", "list"],
            0,
            stdout="",
            stderr="",
        )

        with patch("scripts.check_provider_proof_config.run_command", return_value=result):
            check = check_github_environment("demo")

        self.assertFalse(check.ok)
        self.assertEqual(check.evidence, [])
        self.assertEqual(check.missing, ["BOUNDARY_SMART_SESSION_SECRET", "OPENROUTER_API_KEY"])

    def test_github_check_does_not_require_smart_secret_when_not_minting(self) -> None:
        result = subprocess.CompletedProcess(
            ["gh", "secret", "list"],
            0,
            stdout="OPENROUTER_API_KEY\t2026-05-14\n",
            stderr="",
        )

        with patch("scripts.check_provider_proof_config.run_command", return_value=result):
            check = check_github_environment("demo", mint_synthetic_session=False)

        self.assertTrue(check.ok)
        self.assertEqual(check.missing, [])

    def test_railway_check_requires_project_and_service_unless_skipped(self) -> None:
        check = check_railway_environment(None, "service", "production")

        self.assertFalse(check.ok)
        self.assertEqual(check.missing, ["--railway-project required unless --skip-railway is used"])

    def test_railway_check_parses_runtime_missing_values(self) -> None:
        result = subprocess.CompletedProcess(
            ["railway", "run"],
            1,
            stdout="Runtime environment is missing required values:\n- OPENROUTER_API_KEY\n",
            stderr="",
        )

        with patch("scripts.check_provider_proof_config.run_command", return_value=result):
            check = check_railway_environment("project", "service", "production")

        self.assertFalse(check.ok)
        self.assertEqual(check.missing, ["OPENROUTER_API_KEY"])

    def test_build_checks_can_skip_external_surfaces(self) -> None:
        args = argparse.Namespace(
            github_env="demo",
            skip_github=True,
            railway_project=None,
            railway_service=None,
            railway_environment="production",
            mint_synthetic_session=True,
            skip_railway=True,
        )

        checks = build_checks(args)

        self.assertEqual([check.name for check in checks], ["local runtime env"])

    def test_local_runtime_env_requires_enable_flag_to_equal_one(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BOUNDARY_ENABLE_LLM_AGENTS": "true",
                "OPENROUTER_API_KEY": "test",
            },
            clear=True,
        ):
            check = check_local_runtime_env(mint_synthetic_session=False)

        self.assertFalse(check.ok)
        self.assertEqual(check.missing, ["BOUNDARY_ENABLE_LLM_AGENTS must equal 1"])

    def test_parse_missing_lines(self) -> None:
        self.assertEqual(parse_missing_lines("one\n- first\n- second\n"), ["first", "second"])

    def test_normalizes_pnpm_argument_separator(self) -> None:
        self.assertEqual(
            normalize_argv(["--", "--github-env", "demo"]),
            ["--github-env", "demo"],
        )

    def test_github_required_secrets_depend_on_smart_minting(self) -> None:
        self.assertEqual(
            github_required_secrets(mint_synthetic_session=False),
            {"OPENROUTER_API_KEY"},
        )
        self.assertEqual(
            github_required_secrets(mint_synthetic_session=True),
            {"OPENROUTER_API_KEY", "BOUNDARY_SMART_SESSION_SECRET"},
        )

    def test_railway_check_omits_smart_secret_requirement_when_not_minting(self) -> None:
        result = subprocess.CompletedProcess(["railway", "run"], 0, stdout="", stderr="")

        with patch("scripts.check_provider_proof_config.run_command", return_value=result) as run:
            check = check_railway_environment("project", "service", "production", mint_synthetic_session=False)

        self.assertTrue(check.ok)
        self.assertNotIn("--require-smart-secret", run.call_args.args[0])

    def test_railway_args_default_from_environment(self) -> None:
        env = {
            "RAILWAY_PROJECT_ID": "project-from-env",
            "RAILWAY_SERVICE_ID": "service-from-env",
            "RAILWAY_ENVIRONMENT": "staging",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch("sys.argv", ["check_provider_proof_config.py", "--skip-github", "--no-mint-synthetic-session"]),
            patch("scripts.check_provider_proof_config.build_checks", return_value=[]) as build,
            patch("builtins.print"),
        ):
            self.assertEqual(main(), 0)

        args = build.call_args.args[0]
        self.assertEqual(args.railway_project, "project-from-env")
        self.assertEqual(args.railway_service, "service-from-env")
        self.assertEqual(args.railway_environment, "staging")
        self.assertFalse(args.mint_synthetic_session)


if __name__ == "__main__":
    unittest.main()
