from __future__ import annotations

import os


def provider_for_role(role: str, policy_values: dict[str, object] | None = None) -> str:
    values = policy_values or {}
    configured = values.get(f"agent_provider_{role}")
    if configured in {"anthropic", "openai"}:
        return str(configured)
    if role in {"judge", "documentation"}:
        return "anthropic"
    return "openai"


def worker_model_env() -> dict[str, str]:
    return {
        key: value
        for key, value in os.environ.items()
        if key in {"ANTHROPIC_API_KEY", "OPENAI_API_KEY"}
    }
