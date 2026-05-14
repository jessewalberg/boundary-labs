from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from worker.graphs.documentation import run_documentation_graph
from worker.graphs.judge import run_judge_graph
from worker.graphs.orchestrator import run_orchestrator_graph
from worker.graphs.red_team import run_red_team_graph
from worker.llm_provider import AgentConnectionCheck


class AgentGraphWrapperTest(unittest.TestCase):
    def test_wrappers_delegate_to_role_connection_checks(self) -> None:
        async def fake_check(role: str, **_kwargs) -> AgentConnectionCheck:
            return AgentConnectionCheck(
                role=role,
                provider="openrouter",
                model="openrouter:test",
                enabled=True,
                api_key_configured=True,
                status="executed",
                detail="agent run completed",
            )

        with patch("worker.graphs.orchestrator.check_agent_connection", side_effect=fake_check), \
            patch("worker.graphs.red_team.check_agent_connection", side_effect=fake_check), \
            patch("worker.graphs.judge.check_agent_connection", side_effect=fake_check), \
            patch("worker.graphs.documentation.check_agent_connection", side_effect=fake_check):
            results = asyncio.run(run_all_wrappers())

        self.assertEqual(
            [result["role"] for result in results],
            ["orchestrator", "red_team", "judge", "documentation"],
        )
        self.assertTrue(all(result["status"] == "executed" for result in results))


async def run_all_wrappers() -> list[dict]:
    return [
        await run_orchestrator_graph({"run_id": "run-1"}),
        await run_red_team_graph({"run_id": "run-1"}),
        await run_judge_graph({"run_id": "run-1"}),
        await run_documentation_graph({"run_id": "run-1"}),
    ]


if __name__ == "__main__":
    unittest.main()
