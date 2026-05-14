from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from types import SimpleNamespace
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Check:
    name: str
    command: list[str]
    env: dict[str, str] | None = None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Boundary Labs system verification gates.")
    parser.add_argument("--skip-build", action="store_true", help="Skip the Next.js production build gate.")
    parser.add_argument("--skip-llm", action="store_true", help="Skip provider-backed LLM agent connectivity.")
    parser.add_argument("--skip-artifact", action="store_true", help="Skip proof campaign artifact verification.")
    parser.add_argument("--readiness", action="store_true", help="Fail if any provider-proof readiness gate is skipped or underspecified.")
    parser.add_argument("--sqlite-path", type=Path, help="Boundary SQLite DB path for policy-backed LLM provider checks.")
    parser.add_argument("--artifact-path", type=Path, help="Campaign artifact JSON to verify. Defaults to newest local run artifact.")
    parser.add_argument("--expected-target-origin", help="Require proof artifact target_url to match this origin.")
    parser.add_argument("--allow-local-target", action="store_true", help="Allow localhost/loopback proof artifacts in provider-required mode.")
    parser.add_argument("--include-docker", action="store_true", help="Also build the single-container Docker image.")
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    readiness_errors = readiness_configuration_errors(args)
    if readiness_errors:
        print("Readiness verification is not fully specified:", file=sys.stderr, flush=True)
        for error in readiness_errors:
            print(f"- {error}", file=sys.stderr, flush=True)
        return 2

    checks = build_checks(args)

    failed: list[str] = []
    for check in checks:
        print(f"\n==> {check.name}", flush=True)
        env = os.environ.copy()
        if check.env:
            env.update(check.env)
        result = subprocess.run(check.command, cwd=ROOT, env=env)
        if result.returncode != 0:
            failed.append(check.name)
            if args.readiness and check.name == "provider runtime environment":
                break

    if failed:
        print("\nSystem verification failed:", flush=True)
        for name in failed:
            print(f"- {name}", flush=True)
        return 1

    print("\nSystem verification passed.", flush=True)
    return 0


def build_checks(args: argparse.Namespace | SimpleNamespace) -> list[Check]:
    checks = [
        Check("worker tests", [sys.executable, "-m", "unittest", "discover", "-s", "worker/tests"]),
        Check("Pydantic Evals seed corpus", [sys.executable, "scripts/check_pydantic_evals.py"]),
        Check("web tests", ["pnpm", "--dir", "apps/web", "test"]),
        Check("web typecheck", ["pnpm", "run", "typecheck"]),
    ]
    if getattr(args, "readiness", False):
        checks.insert(
            0,
            Check(
                "provider runtime environment",
                [
                    sys.executable,
                    "scripts/check_runtime_env.py",
                    "--require-provider-proof",
                    "--require-smart-secret",
                ],
            ),
        )
    if not args.skip_build:
        checks.append(
            Check(
                "web production build",
                ["pnpm", "run", "build"],
                env={
                    "BETTER_AUTH_URL": "http://localhost:3000",
                    "BETTER_AUTH_SECRET": "boundary-labs-build-only-placeholder-9f4f7124f8ad4ef0",
                },
            )
        )
    if not args.skip_llm:
        command = [sys.executable, "scripts/check_llm_agents.py"]
        sqlite_path = args.sqlite_path or ROOT / "apps/web/var/boundary.db"
        if sqlite_path.exists():
            command.extend(["--sqlite-path", str(sqlite_path)])
        checks.append(Check("provider-backed LLM agents", command))
    if not args.skip_artifact:
        artifact_path = args.artifact_path or latest_campaign_artifact()
        command = [sys.executable, "scripts/verify_campaign_artifact.py"]
        if artifact_path is not None:
            command.append(str(artifact_path))
        else:
            command.append(str(ROOT / "apps/web/var/artifacts/runs/latest-run-artifact.json"))
        if args.expected_target_origin:
            command.extend(["--expected-target-origin", args.expected_target_origin])
        if args.allow_local_target:
            command.append("--allow-local-target")
        checks.append(Check("proof campaign artifact", command))
    if args.include_docker:
        checks.append(Check("single-container Docker image", ["docker", "build", "-t", "boundary-labs:verify", "."]))
    return checks


def readiness_configuration_errors(args: argparse.Namespace | SimpleNamespace) -> list[str]:
    errors: list[str] = []
    sqlite_path = getattr(args, "sqlite_path", None)
    readiness = bool(getattr(args, "readiness", False))
    if sqlite_path and not sqlite_path.exists():
        errors.append(f"SQLite path does not exist: {sqlite_path}")
    if not readiness:
        return errors
    if getattr(args, "skip_build", False):
        errors.append("--readiness cannot be used with --skip-build")
    if getattr(args, "skip_llm", False):
        errors.append("--readiness cannot be used with --skip-llm")
    if getattr(args, "skip_artifact", False):
        errors.append("--readiness cannot be used with --skip-artifact")
    if not sqlite_path:
        errors.append("--readiness requires --sqlite-path from the proof campaign output")
    if not getattr(args, "artifact_path", None):
        errors.append("--readiness requires --artifact-path from the proof campaign output")
    if not getattr(args, "expected_target_origin", None):
        errors.append("--readiness requires --expected-target-origin from the proof campaign output")
    if getattr(args, "allow_local_target", False):
        errors.append("--readiness cannot be used with --allow-local-target")
    return errors


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


def latest_campaign_artifact() -> Path | None:
    root = ROOT / "apps/web/var/artifacts/runs"
    if not root.exists():
        return None
    candidates = [
        path
        for path in root.glob("*/*.json")
        if not path.name.endswith(".graph.json")
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


if __name__ == "__main__":
    raise SystemExit(main())
