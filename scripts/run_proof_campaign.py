from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.verify_campaign_artifact import verify_artifact
from scripts.acquire_smart_session import acquire_smart_session
from scripts.run_mvp_evals import load_cases
from scripts.check_runtime_env import runtime_missing
from worker.llm_provider import check_all_agent_connections
from worker.main import load_policy_value_map, process_job
from worker.sentinels import sentinel_paths


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = "https://clinical-copilot.up.railway.app"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a full Boundary proof campaign through the worker graph.")
    parser.add_argument("--sqlite-path", type=Path, help="SQLite DB path. Defaults to a temp proof DB.")
    parser.add_argument("--artifact-dir", type=Path, help="Artifact directory. Defaults to a temp proof artifact dir.")
    parser.add_argument("--target-url", default=os.environ.get("BOUNDARY_TARGET_URL", DEFAULT_TARGET))
    parser.add_argument("--deployed-url", default=os.environ.get("BOUNDARY_DEPLOYED_TARGET_URL", DEFAULT_TARGET))
    parser.add_argument("--timeout-seconds", type=float, default=float(os.environ.get("BOUNDARY_RUN_TIMEOUT_SECONDS", "75")))
    parser.add_argument("--run-id", default=f"proof-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}")
    parser.add_argument("--bootstrap", action="store_true", help="Run web DB migrations/bootstrap before inserting the proof job.")
    parser.add_argument("--allow-deterministic", action="store_true", help="Allow deterministic agent fallback in artifact verification.")
    parser.add_argument("--allow-local-target", action="store_true", help="Allow localhost/loopback target URLs while still requiring provider-backed agents.")
    parser.add_argument("--mint-synthetic-session", action="store_true", help="Ask the worker graph to mint a synthetic SMART session.")
    parser.add_argument("--acquire-smart-session", action="store_true", help="Log into local OpenEMR and acquire a real SMART session cookie.")
    parser.add_argument("--openemr-url", default=os.environ.get("BOUNDARY_OPENEMR_URL", "http://localhost:8300"))
    parser.add_argument("--openemr-username", default=os.environ.get("BOUNDARY_OPENEMR_USERNAME", os.environ.get("OPENEMR_USERNAME", "admin")))
    parser.add_argument("--openemr-password", default=os.environ.get("BOUNDARY_OPENEMR_PASSWORD", os.environ.get("OPENEMR_PASSWORD", "pass")))
    parser.add_argument("--openemr-patient-pid", type=int, default=int(os.environ.get("BOUNDARY_OPENEMR_PATIENT_PID", "13")))
    parser.add_argument("--quiet", action="store_true", help="Suppress progress logs; final JSON is still printed.")
    parser.add_argument("--mock-target", action="store_true", help="Run against a local mock target for offline proof-runner verification.")
    parser.add_argument("--output-file", type=Path, help="Optional path to write proof result JSON.")
    parser.add_argument("--synthetic-patient-pid", type=int, default=13)
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    if args.mock_target and not args.allow_deterministic:
        print("--mock-target is only allowed with --allow-deterministic; provider proof must exercise a real target.")
        return 2
    if args.acquire_smart_session and args.mint_synthetic_session:
        print("--acquire-smart-session and --mint-synthetic-session are mutually exclusive.")
        return 2
    if not args.allow_deterministic:
        progress(args, "runtime.preflight.start", require_smart_secret=args.mint_synthetic_session)
        missing = proof_runtime_missing(require_smart_secret=args.mint_synthetic_session)
        if missing:
            print("Provider proof runtime environment is missing required values:")
            for item in missing:
                print(f"- {item}")
            return 1
        progress(args, "runtime.preflight.end")

    mock_server: ThreadingHTTPServer | None = None
    mock_thread: threading.Thread | None = None
    if args.mock_target:
        mock_server = ThreadingHTTPServer(("127.0.0.1", 0), MockTargetHandler)
        mock_thread = threading.Thread(target=mock_server.serve_forever, daemon=True)
        mock_thread.start()
        args.target_url = f"http://127.0.0.1:{mock_server.server_address[1]}"
        args.deployed_url = args.target_url
        progress(args, "mock_target.started", target_url=args.target_url)

    root = Path(tempfile.mkdtemp(prefix="boundary-proof-campaign-"))
    sqlite_path = (args.sqlite_path or root / "boundary.db").resolve()
    artifact_dir = (args.artifact_dir or root / "artifacts").resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        configure_worker_environment(sqlite_path, artifact_dir, args.target_url)
        progress(args, "run.paths", sqlite_path=str(sqlite_path), artifact_dir=str(artifact_dir), target_url=args.target_url)
        if args.acquire_smart_session:
            progress(args, "smart_session.acquire.start", openemr_url=args.openemr_url, patient_pid=args.openemr_patient_pid)
            auth_result = acquire_smart_session(
                openemr_url=args.openemr_url,
                copilot_url=args.target_url,
                site="default",
                username=args.openemr_username,
                password=args.openemr_password,
                patient_pid=args.openemr_patient_pid,
                timeout_seconds=min(max(args.timeout_seconds, 15.0), 120.0),
            )
            os.environ["BOUNDARY_SMART_SESSION_COOKIE"] = str(auth_result["smart_session_cookie"])
            progress(
                args,
                "smart_session.acquire.end",
                auth_session_status=auth_result["auth_session_status"],
                redirect_count=auth_result["redirect_count"],
                final_url=auth_result["final_url"],
            )

        if args.bootstrap or not sqlite_path.exists():
            progress(args, "database.bootstrap.start")
            bootstrap_database(sqlite_path, artifact_dir)
            progress(args, "database.bootstrap.end")

        if not args.allow_deterministic:
            progress(args, "provider.preflight.start")
            preflight_errors = asyncio.run(provider_agent_preflight(sqlite_path))
            if preflight_errors:
                print("Provider-backed agent preflight failed:")
                for error in preflight_errors:
                    print(f"- {error}")
                return 1
            progress(args, "provider.preflight.end")

        job_id = f"job-{uuid4().hex}"
        progress(args, "campaign.insert_job.start", job_id=job_id, run_id=args.run_id)
        insert_claimed_campaign_job(
            sqlite_path,
            job_id=job_id,
            run_id=args.run_id,
            target_url=args.target_url,
            deployed_url=args.deployed_url,
            timeout_seconds=args.timeout_seconds,
            mint_synthetic_session=args.mint_synthetic_session,
            synthetic_patient_pid=args.synthetic_patient_pid,
        )

        progress(args, "campaign.graph.start", job_id=job_id, run_id=args.run_id)
        started = time.monotonic()
        process_job(sqlite_path, artifact_dir, job_id, args.run_id)
        progress(args, "campaign.graph.end", duration_ms=int((time.monotonic() - started) * 1000))
        artifact_path = sentinel_paths(artifact_dir, args.run_id).artifact
        expected_cases = load_cases(Path("evals/seeds"))
        progress(args, "artifact.verify.start", artifact=str(artifact_path), expected_total=len(expected_cases))
        errors = verify_artifact(
            artifact_path,
            expected_total=len(expected_cases),
            require_llm_agents=not args.allow_deterministic,
            expected_case_ids={str(case["id"]) for case in expected_cases},
            expected_target_origin=origin(args.target_url),
            allow_local_target=args.allow_deterministic or args.allow_local_target,
        )
        if errors:
            print(f"Proof campaign failed verification: {artifact_path}")
            for error in errors:
                print(f"- {error}")
            return 1
        progress(args, "artifact.verify.end")

        result = {
            "ok": True,
            "run_id": args.run_id,
            "sqlite_path": str(sqlite_path),
            "artifact_dir": str(artifact_dir),
            "artifact": str(artifact_path),
            "target_origin": origin(args.target_url),
            "mock_target": args.mock_target,
            "allow_deterministic": args.allow_deterministic,
        }
        if args.output_file:
            args.output_file.parent.mkdir(parents=True, exist_ok=True)
            args.output_file.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            progress(args, "output.write", output_file=str(args.output_file))
        print(json.dumps(result, indent=2))
        return 0
    finally:
        if mock_server is not None:
            mock_server.shutdown()
            mock_server.server_close()
        if mock_thread is not None:
            mock_thread.join(timeout=2)


def configure_worker_environment(sqlite_path: Path, artifact_dir: Path, target_url: str) -> None:
    os.environ["SQLITE_PATH"] = str(sqlite_path)
    os.environ["BOUNDARY_ARTIFACT_DIR"] = str(artifact_dir)
    allowlist = os.environ.get("BOUNDARY_TARGET_ALLOWLIST", "")
    allowlist_items = [item.strip() for item in allowlist.split(",") if item.strip()]
    target_origin = origin(target_url)
    existing_origins = set()
    for item in allowlist_items:
        try:
            existing_origins.add(origin(item))
        except ValueError:
            continue
    if target_origin not in existing_origins:
        allowlist_items.append(target_origin)
    os.environ["BOUNDARY_TARGET_ALLOWLIST"] = ",".join(allowlist_items)


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


def progress(args: argparse.Namespace, event: str, **fields: object) -> None:
    if getattr(args, "quiet", False):
        return
    payload = {
        "at": datetime.now(UTC).isoformat(),
        "event": event,
        **fields,
    }
    print(f"[proof] {json.dumps(payload, sort_keys=True)}", flush=True)


def proof_runtime_missing(*, require_smart_secret: bool) -> list[str]:
    missing = runtime_missing(
        require_provider_proof=True,
        require_smart_secret=require_smart_secret,
    )
    if os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") and os.environ.get("BOUNDARY_ENABLE_LLM_AGENTS") != "1":
        missing.append("BOUNDARY_ENABLE_LLM_AGENTS must equal 1")
    return missing


def bootstrap_database(sqlite_path: Path, artifact_dir: Path) -> None:
    env = os.environ.copy()
    env["SQLITE_PATH"] = str(sqlite_path)
    env["BOUNDARY_ARTIFACT_DIR"] = str(artifact_dir)
    subprocess.run(
        ["pnpm", "--dir", "apps/web", "exec", "tsx", "src/server/db/migrate.ts"],
        cwd=ROOT,
        env=env,
        check=True,
    )


async def provider_agent_preflight(sqlite_path: Path | None = None) -> list[str]:
    policy_values = load_policy_value_map(sqlite_path) if sqlite_path is not None and sqlite_path.exists() else None
    checks = await check_all_agent_connections(policy_values=policy_values)
    errors: list[str] = []
    for check in checks:
        if check.status != "executed":
            errors.append(f"{check.role}: {check.status} ({check.detail})")
    return errors


def insert_claimed_campaign_job(
    sqlite_path: Path,
    *,
    job_id: str,
    run_id: str,
    target_url: str,
    deployed_url: str,
    timeout_seconds: float,
    mint_synthetic_session: bool,
    synthetic_patient_pid: int,
) -> None:
    now = datetime.now(UTC).isoformat()
    artifact_path = sentinel_paths(Path(os.environ["BOUNDARY_ARTIFACT_DIR"]), run_id).artifact
    payload = {
        "targetUrl": target_url,
        "deployedUrl": deployed_url,
        "categories": [],
        "timeoutSeconds": timeout_seconds,
        "mintSyntheticSession": mint_synthetic_session,
        "syntheticPatientPid": synthetic_patient_pid,
    }
    with sqlite3.connect(sqlite_path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute(
            """
            INSERT INTO campaigns (
              id, target_url, categories_json, status, data_mode, budget_cents,
              submitted_by, artifact_path, created_at, updated_at
            ) VALUES (?, ?, '[]', 'running', 'synthetic', 10000, 'proof-runner', ?, ?, ?)
            """,
            (run_id, target_url, str(artifact_path), now, now),
        )
        db.execute(
            """
            INSERT INTO campaign_jobs (
              id, campaign_id, job_type, status, claim_token, claimed_at,
              submitted_by, priority, payload_json, created_at, updated_at
            ) VALUES (?, ?, 'campaign_run', 'claimed', ?, ?, 'proof-runner', 100, ?, ?, ?)
            """,
            (job_id, run_id, f"proof-runner:{uuid4()}", now, json.dumps(payload), now, now),
        )
        db.execute(
            """
            INSERT INTO audit_events (
              id, occurred_at, actor_type, actor_id, action, target_type, target_id,
              outcome, rule_ref, policy_snapshot_hash, metadata_json
            ) VALUES (?, ?, 'system', NULL, 'proof_campaign:create', 'campaign', ?, 'ok', 'THE-30', NULL, ?)
            """,
            (uuid4().hex, now, run_id, json.dumps(payload)),
        )
        db.commit()


def origin(value: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Invalid target URL: {value}")
    return f"{parsed.scheme}://{parsed.netloc}".lower()


class MockTargetHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.startswith("/healthz") or self.path.startswith("/readyz"):
            self.respond_json(200, {"status": "ok"})
            return
        if self.path.startswith("/auth/session"):
            self.respond_json(401, {"authenticated": False})
            return
        if self.path.startswith("/conversation"):
            body = 'event: refused\ndata: {"detail":"refused"}\n\n'
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(body.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
            return
        self.respond_json(404, {"error": "not_found"})

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def respond_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    raise SystemExit(main())
