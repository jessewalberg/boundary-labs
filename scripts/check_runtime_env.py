from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


PROVIDER_SECRET_KEYS = {
    "openrouter": "OPENROUTER_API_KEY",
}
DEFAULT_REQUIRED_PROVIDERS = ["openrouter"]
SMART_SECRET_KEYS = [
    "BOUNDARY_SMART_SESSION_SECRET",
    "SECURITY_SMART_SESSION_SECRET",
]
SMART_SECRET_FILE_KEY = "BOUNDARY_SMART_SESSION_SECRET_FILE"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Boundary runtime environment requirements.")
    parser.add_argument("--require-provider-proof", action="store_true", help="Require provider-backed LLM agent env.")
    parser.add_argument("--require-smart-secret", action="store_true", help="Require a SMART session secret for synthetic proof runs.")
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    missing = runtime_missing(
        require_provider_proof=args.require_provider_proof,
        require_smart_secret=args.require_smart_secret,
    )
    if missing:
        print("Runtime environment is missing required values:")
        for key in missing:
            print(f"- {key}")
        return 1

    if args.require_provider_proof and os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") != "1":
        print("Runtime environment is invalid:")
        print("- BOUNDARY_ENABLE_LLM_AGENTS must be set to 1")
        return 1

    print("Runtime environment requirements are present.")
    return 0


def runtime_missing(*, require_provider_proof: bool = False, require_smart_secret: bool = False) -> list[str]:
    missing = []
    if require_provider_proof:
        if not os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS"):
            missing.append("BOUNDARY_ENABLE_LLM_AGENTS")
        for provider in required_provider_names():
            env_key = PROVIDER_SECRET_KEYS.get(provider)
            if env_key is None:
                missing.append(f"unsupported provider in BOUNDARY_REQUIRED_LLM_PROVIDERS: {provider}")
            elif not os.environ.get(env_key):
                missing.append(env_key)
    if require_smart_secret:
        smart_missing = smart_secret_missing()
        if smart_missing:
            missing.append(smart_missing)
    return missing


def required_provider_names() -> list[str]:
    raw = os.environ.get("BOUNDARY_REQUIRED_LLM_PROVIDERS")
    if not raw:
        return DEFAULT_REQUIRED_PROVIDERS
    providers = [provider.strip().lower() for provider in raw.split(",") if provider.strip()]
    return providers or DEFAULT_REQUIRED_PROVIDERS


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


def smart_secret_missing() -> str | None:
    if any(os.environ.get(key) for key in SMART_SECRET_KEYS):
        return None

    secret_file = os.environ.get(SMART_SECRET_FILE_KEY)
    if not secret_file:
        return "SMART session secret source (BOUNDARY_SMART_SESSION_SECRET, SECURITY_SMART_SESSION_SECRET, or BOUNDARY_SMART_SESSION_SECRET_FILE)"
    if not Path(secret_file).exists():
        return f"{SMART_SECRET_FILE_KEY} path does not exist: {secret_file}"
    return None


if __name__ == "__main__":
    raise SystemExit(main())
