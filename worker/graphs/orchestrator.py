from __future__ import annotations

from worker.llm_provider import check_agent_connection


async def run_orchestrator_graph(payload: dict) -> dict:
    check = await check_agent_connection(
        "orchestrator",
        instructions="You are the Boundary Labs Orchestrator. Return a concise execution plan note.",
        prompt=str(payload),
    )
    return check.as_dict()
