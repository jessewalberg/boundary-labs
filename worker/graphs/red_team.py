from __future__ import annotations

from worker.llm_provider import check_agent_connection


async def run_red_team_graph(payload: dict) -> dict:
    check = await check_agent_connection(
        "red_team",
        instructions="You are the authorized Boundary Labs Red Team agent. Return one safe test-generation note.",
        prompt=str(payload),
    )
    return check.as_dict()
