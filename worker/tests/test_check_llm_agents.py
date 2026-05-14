from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from scripts.check_llm_agents import load_policy_values, main, normalize_argv, parse_json_value
from worker.llm_provider import AgentConnectionCheck


class CheckLlmAgentsScriptTest(unittest.TestCase):
    def test_normalizes_pnpm_argument_separator(self) -> None:
        self.assertEqual(
            normalize_argv(["--", "--roles", "judge"]),
            ["--roles", "judge"],
        )

    def test_parse_json_value_falls_back_to_raw_string(self) -> None:
        self.assertEqual(parse_json_value('"openrouter"'), "openrouter")
        self.assertEqual(parse_json_value("openrouter"), "openrouter")

    def test_load_policy_values_reads_agent_provider_rows(self) -> None:
        sqlite_path = Path(tempfile.mkdtemp(prefix="boundary-check-llm-agents-")) / "policy.db"
        with sqlite3.connect(sqlite_path) as db:
            db.executescript(
                """
                CREATE TABLE policy_values (
                  key TEXT PRIMARY KEY,
                  value_json TEXT NOT NULL
                );
                INSERT INTO policy_values (key, value_json)
                VALUES
                  ('agent_provider_red_team', '"openrouter"'),
                  ('budget_limit', '100');
                """
            )

        self.assertEqual(load_policy_values(sqlite_path), {"agent_provider_red_team": "openrouter"})

    def test_main_passes_roles_and_policy_values_to_connection_checker(self) -> None:
        sqlite_path = Path(tempfile.mkdtemp(prefix="boundary-check-llm-agents-main-")) / "policy.db"
        with sqlite3.connect(sqlite_path) as db:
            db.executescript(
                """
                CREATE TABLE policy_values (
                  key TEXT PRIMARY KEY,
                  value_json TEXT NOT NULL
                );
                INSERT INTO policy_values (key, value_json)
                VALUES ('agent_provider_judge', '"openrouter"');
                """
            )

        async def fake_check_all_agent_connections(*, roles=None, policy_values=None):
            self.assertEqual(roles, ["judge"])
            self.assertEqual(policy_values, {"agent_provider_judge": "openrouter"})
            return [
                AgentConnectionCheck(
                    role="judge",
                    provider="openrouter",
                    model="openrouter:test",
                    enabled=True,
                    api_key_configured=True,
                    status="executed",
                    detail="agent run completed",
                )
            ]

        with (
            patch("sys.argv", ["check_llm_agents.py", "--sqlite-path", str(sqlite_path), "--roles", "judge"]),
            patch("scripts.check_llm_agents.check_all_agent_connections", side_effect=fake_check_all_agent_connections),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main(), 0)

    def test_main_fails_when_any_selected_agent_does_not_execute(self) -> None:
        async def fake_check_all_agent_connections(*, roles=None, policy_values=None):
            return [
                AgentConnectionCheck(
                    role="judge",
                    provider="openrouter",
                    model="openrouter:test",
                    enabled=False,
                    api_key_configured=False,
                    status="disabled",
                    detail="BOUNDARY_ENABLE_LLM_AGENTS is not enabled",
                )
            ]

        with (
            patch("sys.argv", ["check_llm_agents.py", "--roles", "judge"]),
            patch("scripts.check_llm_agents.check_all_agent_connections", side_effect=fake_check_all_agent_connections),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(main(), 1)


if __name__ == "__main__":
    unittest.main()
