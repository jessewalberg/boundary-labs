from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any

SUPPORTED_PROVIDERS = {"openrouter"}
PROVIDER_ENV_KEYS = {
    "openrouter": "OPENROUTER_API_KEY",
}
OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_LLM_AGENT_TIMEOUT_SECONDS = 45.0


def provider_for_role(role: str, policy_values: dict[str, object] | None = None) -> str:
    values = policy_values or {}
    configured = values.get(f"agent_provider_{role}")
    if configured in SUPPORTED_PROVIDERS:
        return str(configured)
    return "openrouter"


def worker_model_env() -> dict[str, str]:
    return {
        key: value
        for key, value in os.environ.items()
        if key in set(PROVIDER_ENV_KEYS.values()) | {"OPENROUTER_BASE_URL"}
    }


@dataclass(frozen=True)
class AgentProviderConfig:
    role: str
    provider: str
    model: str
    api_key_configured: bool
    enabled: bool


@dataclass(frozen=True)
class AgentConnectionCheck:
    role: str
    provider: str
    model: str
    enabled: bool
    api_key_configured: bool
    status: str
    detail: str
    output_preview: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "provider": self.provider,
            "model": self.model,
            "enabled": self.enabled,
            "api_key_configured": self.api_key_configured,
            "status": self.status,
            "detail": self.detail,
            "output_preview": self.output_preview,
        }


def provider_config_for_role(role: str, policy_values: dict[str, object] | None = None) -> AgentProviderConfig:
    provider = provider_for_role(role, policy_values)
    env_key = PROVIDER_ENV_KEYS[provider]
    model = os.environ.get(f"BOUNDARY_{role.upper()}_MODEL") or default_model_for_provider(provider)
    return AgentProviderConfig(
        role=role,
        provider=provider,
        model=f"{provider}:{model}" if ":" not in model else model,
        api_key_configured=bool(os.environ.get(env_key)),
        enabled=os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") == "1",
    )


def default_model_for_provider(provider: str) -> str:
    return "google/gemini-2.5-flash"


def agent_for_role(role: str, instructions: str, policy_values: dict[str, object] | None = None):
    config = provider_config_for_role(role, policy_values)
    if not config.enabled or not config.api_key_configured:
        return None

    from pydantic_ai import Agent

    if config.provider == "openrouter":
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        model_name = model_name_for_provider(config)
        model = OpenAIChatModel(
            model_name,
            provider=OpenAIProvider(
                base_url=os.environ.get("OPENROUTER_BASE_URL", OPENROUTER_DEFAULT_BASE_URL),
                api_key=os.environ["OPENROUTER_API_KEY"],
            ),
        )
        return Agent(model, instructions=instructions, defer_model_check=True)

    return Agent(config.model, instructions=instructions, defer_model_check=True)


def model_name_for_provider(config: AgentProviderConfig) -> str:
    prefix = f"{config.provider}:"
    if config.model.startswith(prefix):
        return config.model[len(prefix):]
    return config.model


def llm_agent_timeout_seconds() -> float:
    raw = os.environ.get("BOUNDARY_LLM_AGENT_TIMEOUT_SECONDS")
    if raw is None:
        return DEFAULT_LLM_AGENT_TIMEOUT_SECONDS
    try:
        parsed = float(raw)
    except ValueError:
        return DEFAULT_LLM_AGENT_TIMEOUT_SECONDS
    return parsed if parsed > 0 else DEFAULT_LLM_AGENT_TIMEOUT_SECONDS


async def check_agent_connection(
    role: str,
    *,
    instructions: str = "Return the word ready.",
    prompt: str = "Connectivity check. Return the word ready.",
    policy_values: dict[str, object] | None = None,
) -> AgentConnectionCheck:
    config = provider_config_for_role(role, policy_values)
    agent = agent_for_role(role, instructions, policy_values)
    if agent is None:
        status = "disabled" if not config.enabled else "missing_secret"
        detail = "BOUNDARY_ENABLE_LLM_AGENTS is not enabled" if not config.enabled else f"{config.provider} API key is not configured"
        return AgentConnectionCheck(
            role=role,
            provider=config.provider,
            model=config.model,
            enabled=config.enabled,
            api_key_configured=config.api_key_configured,
            status=status,
            detail=detail,
        )

    try:
        result = await asyncio.wait_for(agent.run(prompt), timeout=llm_agent_timeout_seconds())
    except Exception as exc:
        return AgentConnectionCheck(
            role=role,
            provider=config.provider,
            model=config.model,
            enabled=config.enabled,
            api_key_configured=config.api_key_configured,
            status="failed",
            detail=f"{type(exc).__name__}: {exc}",
        )

    return AgentConnectionCheck(
        role=role,
        provider=config.provider,
        model=config.model,
        enabled=config.enabled,
        api_key_configured=config.api_key_configured,
        status="executed",
        detail="agent run completed",
        output_preview=str(result.output)[:240],
    )


async def check_all_agent_connections(
    *,
    roles: list[str] | None = None,
    policy_values: dict[str, object] | None = None,
) -> list[AgentConnectionCheck]:
    selected_roles = roles or ["orchestrator", "red_team", "judge", "documentation"]
    return [
        await check_agent_connection(role, policy_values=policy_values)
        for role in selected_roles
    ]
