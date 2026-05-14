from __future__ import annotations

from worker.llm_provider import check_agent_connection


async def run_judge_graph(payload: dict) -> dict:
    check = await check_agent_connection(
        "judge",
        instructions="You are the independent Boundary Labs Judge. Return one concise calibration note.",
        prompt=str(payload),
    )
    return check.as_dict()
