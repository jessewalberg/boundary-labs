from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.check_runtime_env import PROVIDER_SECRET_KEYS, required_provider_names, runtime_missing


GITHUB_SMART_SECRET = "BOUNDARY_SMART_SESSION_SECRET"


@dataclass
class CheckResult:
    name: str
    ok: bool
    evidence: list[str]
    missing: list[str]


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight provider proof configuration without printing secret values.")
    parser.add_argument("--github-env", default="demo", help="GitHub environment name to check with gh secret list.")
    parser.add_argument("--skip-github", action="store_true", help="Skip GitHub environment secret checks.")
    parser.add_argument("--railway-project", default=os.environ.get("RAILWAY_PROJECT_ID"), help="Railway project ID for runtime env validation. Defaults to RAILWAY_PROJECT_ID.")
    parser.add_argument("--railway-service", default=os.environ.get("RAILWAY_SERVICE_ID"), help="Railway service ID for runtime env validation. Defaults to RAILWAY_SERVICE_ID.")
    parser.add_argument("--railway-environment", default=os.environ.get("RAILWAY_ENVIRONMENT", "production"), help="Railway environment name. Defaults to RAILWAY_ENVIRONMENT or production.")
    parser.add_argument("--skip-railway", action="store_true", help="Skip Railway runtime env validation.")
    parser.add_argument("--no-mint-synthetic-session", dest="mint_synthetic_session", action="store_false", help="Do not require SMART session secret sources.")
    parser.set_defaults(mint_synthetic_session=True)
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    checks = build_checks(args)
    payload = {
        "ok": all(check.ok for check in checks),
        "checks": [asdict(check) for check in checks],
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


def build_checks(args: argparse.Namespace) -> list[CheckResult]:
    checks = [check_local_runtime_env(args.mint_synthetic_session)]
    if not args.skip_github:
        checks.append(check_github_environment(args.github_env, args.mint_synthetic_session))
    if not args.skip_railway:
        checks.append(check_railway_environment(args.railway_project, args.railway_service, args.railway_environment, args.mint_synthetic_session))
    return checks


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


def check_local_runtime_env(mint_synthetic_session: bool = True) -> CheckResult:
    missing = runtime_missing(require_provider_proof=True, require_smart_secret=mint_synthetic_session)
    if os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") and os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") != "1":
        missing.append("BOUNDARY_ENABLE_LLM_AGENTS must equal 1")
    return CheckResult(
        name="local runtime env",
        ok=not missing,
        evidence=[] if missing else ["provider runtime env requirements are present"],
        missing=missing,
    )


def check_github_environment(environment: str, mint_synthetic_session: bool = True) -> CheckResult:
    result = run_command(["gh", "secret", "list", "--env", environment])
    if result.returncode != 0:
        return CheckResult(
            name=f"GitHub environment secrets ({environment})",
            ok=False,
            evidence=[],
            missing=[command_error(result)],
        )
    names = parse_gh_secret_names(result.stdout)
    required = github_required_secrets(mint_synthetic_session)
    missing = sorted(required - names)
    return CheckResult(
        name=f"GitHub environment secrets ({environment})",
        ok=not missing,
        evidence=[f"{name}=present" for name in sorted(required & names)],
        missing=missing,
    )


def check_railway_environment(project: str | None, service: str | None, environment: str, mint_synthetic_session: bool = True) -> CheckResult:
    missing_args = []
    if not project:
        missing_args.append("--railway-project")
    if not service:
        missing_args.append("--railway-service")
    if missing_args:
        return CheckResult(
            name=f"Railway runtime env ({environment})",
            ok=False,
            evidence=[],
            missing=[f"{', '.join(missing_args)} required unless --skip-railway is used"],
        )

    runtime_command = [sys.executable, "scripts/check_runtime_env.py", "--require-provider-proof"]
    if mint_synthetic_session:
        runtime_command.append("--require-smart-secret")
    result = run_command(
        [
            "railway",
            "run",
            "--project",
            project,
            "--service",
            service,
            "--environment",
            environment,
            "--",
            *runtime_command,
        ]
    )
    if result.returncode == 0:
        return CheckResult(
            name=f"Railway runtime env ({environment})",
            ok=True,
            evidence=["provider runtime env requirements are present"],
            missing=[],
        )
    return CheckResult(
        name=f"Railway runtime env ({environment})",
        ok=False,
        evidence=[],
        missing=parse_missing_lines(result.stdout) or [command_error(result)],
    )


def parse_gh_secret_names(output: str) -> set[str]:
    names: set[str] = set()
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped or stripped.lower().startswith("name"):
            continue
        names.add(stripped.split()[0])
    return names


def github_required_secrets(mint_synthetic_session: bool = True) -> set[str]:
    required = {
        PROVIDER_SECRET_KEYS[provider]
        for provider in required_provider_names()
        if provider in PROVIDER_SECRET_KEYS
    }
    if mint_synthetic_session:
        required.add(GITHUB_SMART_SECRET)
    return required


def parse_missing_lines(output: str) -> list[str]:
    return [line[2:] for line in output.splitlines() if line.startswith("- ")]


def command_error(result: subprocess.CompletedProcess[str]) -> str:
    detail = (result.stderr or result.stdout).strip()
    return detail or f"command exited {result.returncode}"


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, cwd=Path(__file__).resolve().parents[1])


if __name__ == "__main__":
    raise SystemExit(main())
