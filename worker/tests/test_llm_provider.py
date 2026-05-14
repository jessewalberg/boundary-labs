from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from worker.llm_provider import (
    agent_for_role,
    check_agent_connection,
    model_name_for_provider,
    provider_config_for_role,
    provider_for_role,
    worker_model_env,
)


class LlmProviderTest(unittest.TestCase):
    def test_role_defaults_route_all_agents_to_openrouter(self) -> None:
        self.assertEqual(provider_for_role("judge"), "openrouter")
        self.assertEqual(provider_for_role("red_team"), "openrouter")

    def test_unsupported_provider_policy_values_are_ignored(self) -> None:
        self.assertEqual(provider_for_role("red_team", {"agent_provider_red_team": "unsupported-provider"}), "openrouter")
        self.assertEqual(provider_for_role("judge", {"agent_provider_judge": "local-model"}), "openrouter")
        self.assertEqual(provider_for_role("judge", {"agent_provider_judge": "openrouter"}), "openrouter")

    def test_provider_config_reports_missing_key_without_constructing_agent(self) -> None:
        old_enabled = os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
        old = os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            config = provider_config_for_role("red_team")
            self.assertEqual(config.provider, "openrouter")
            self.assertFalse(config.api_key_configured)
            self.assertFalse(config.enabled)
        finally:
            if old_enabled is not None:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old is not None:
                os.environ["OPENROUTER_API_KEY"] = old

    def test_provider_config_reports_enabled_when_flag_and_key_are_present(self) -> None:
        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        try:
            config = provider_config_for_role("judge")
            self.assertEqual(config.provider, "openrouter")
            self.assertTrue(config.api_key_configured)
            self.assertTrue(config.enabled)
            self.assertTrue(config.model.startswith("openrouter:"))
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_agent_for_role_stays_disabled_without_flag_and_key(self) -> None:
        old_enabled = os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
        old_key = os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            self.assertIsNone(agent_for_role("red_team", "instructions"))
        finally:
            if old_enabled is not None:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is not None:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_agent_for_role_constructs_pydantic_ai_agent_when_enabled(self) -> None:
        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        try:
            agent = agent_for_role("red_team", "instructions")
            self.assertIsNotNone(agent)
            assert agent is not None
            self.assertEqual(agent.__class__.__module__, "pydantic_ai.agent")
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_openrouter_provider_uses_openai_compatible_model_adapter(self) -> None:
        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        old_model = os.environ.get("BOUNDARY_JUDGE_MODEL")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        os.environ["BOUNDARY_JUDGE_MODEL"] = "google/gemini-2.5-flash"
        try:
            config = provider_config_for_role("judge", {"agent_provider_judge": "openrouter"})
            self.assertEqual(config.provider, "openrouter")
            self.assertEqual(config.model, "openrouter:google/gemini-2.5-flash")
            self.assertEqual(model_name_for_provider(config), "google/gemini-2.5-flash")

            agent = agent_for_role("judge", "instructions", {"agent_provider_judge": "openrouter"})
            self.assertIsNotNone(agent)
            assert agent is not None
            self.assertEqual(agent.__class__.__module__, "pydantic_ai.agent")
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key
            if old_model is None:
                os.environ.pop("BOUNDARY_JUDGE_MODEL", None)
            else:
                os.environ["BOUNDARY_JUDGE_MODEL"] = old_model

    def test_worker_model_env_preserves_openrouter_secret_for_worker_child(self) -> None:
        with patch.dict(
            os.environ,
            {
                "OPENROUTER_API_KEY": "test-openrouter",
                "OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1",
                "UNRELATED": "ignore",
            },
            clear=True,
        ):
            self.assertEqual(
                worker_model_env(),
                {
                    "OPENROUTER_API_KEY": "test-openrouter",
                    "OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1",
                },
            )

    def test_connection_check_reports_disabled_without_flag(self) -> None:
        old_enabled = os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
        old_key = os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            result = async_run(check_agent_connection("red_team"))
            self.assertEqual(result.status, "disabled")
            self.assertFalse(result.enabled)
            self.assertFalse(result.api_key_configured)
        finally:
            if old_enabled is not None:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is not None:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_connection_check_executes_constructed_agent(self) -> None:
        class Result:
            output = "ready"

        class FakeAgent:
            async def run(self, prompt: str) -> Result:
                self.prompt = prompt
                return Result()

        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        try:
            with patch("worker.llm_provider.agent_for_role", return_value=FakeAgent()):
                result = async_run(check_agent_connection("red_team"))
            self.assertEqual(result.status, "executed")
            self.assertEqual(result.output_preview, "ready")
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_connection_check_reports_agent_failure(self) -> None:
        class FailingAgent:
            async def run(self, _prompt: str) -> object:
                raise RuntimeError("provider unavailable")

        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        try:
            with patch("worker.llm_provider.agent_for_role", return_value=FailingAgent()):
                result = async_run(check_agent_connection("red_team"))
            self.assertEqual(result.status, "failed")
            self.assertIn("provider unavailable", result.detail)
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key

    def test_connection_check_times_out_slow_agent(self) -> None:
        class SlowAgent:
            async def run(self, _prompt: str) -> object:
                import asyncio

                await asyncio.sleep(10)
                return object()

        old_enabled = os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS")
        old_key = os.environ.get("OPENROUTER_API_KEY")
        old_timeout = os.environ.get("BOUNDARY_LLM_AGENT_TIMEOUT_SECONDS")
        os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        os.environ["BOUNDARY_LLM_AGENT_TIMEOUT_SECONDS"] = "0.01"
        try:
            with patch("worker.llm_provider.agent_for_role", return_value=SlowAgent()):
                result = async_run(check_agent_connection("red_team"))
            self.assertEqual(result.status, "failed")
            self.assertIn("TimeoutError", result.detail)
        finally:
            if old_enabled is None:
                os.environ.pop("BOUNDARY_ENABLE_LLM_AGENTS", None)
            else:
                os.environ["BOUNDARY_ENABLE_LLM_AGENTS"] = old_enabled
            if old_key is None:
                os.environ.pop("OPENROUTER_API_KEY", None)
            else:
                os.environ["OPENROUTER_API_KEY"] = old_key
            if old_timeout is None:
                os.environ.pop("BOUNDARY_LLM_AGENT_TIMEOUT_SECONDS", None)
            else:
                os.environ["BOUNDARY_LLM_AGENT_TIMEOUT_SECONDS"] = old_timeout


def async_run(coro):
    import asyncio

    return asyncio.run(coro)


if __name__ == "__main__":
    unittest.main()
