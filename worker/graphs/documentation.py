from __future__ import annotations

from worker.llm_provider import check_agent_connection


async def run_documentation_graph(payload: dict) -> dict:
    check = await check_agent_connection(
        "documentation",
        instructions="You are the Boundary Labs Documentation agent. Return one concise report-writing note.",
        prompt=str(payload),
    )
    return check.as_dict()
