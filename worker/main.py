from __future__ import annotations

import os
import signal
import json
import time
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from worker.config import WorkerConfig, load_config
from worker.artifact_ingest import ingest_completed_artifact
from worker.heartbeat import write_heartbeat
from worker.queue import (
    claim_next_job,
    connect,
    mark_job_completed,
    mark_job_failed,
    operator_is_active,
    release_claim,
    write_audit,
)
from worker.recovery import recover_stale_running_jobs
from worker.sentinels import sentinel_paths, write_failed
from worker.graphs.campaign import CampaignGraphDeps, run_campaign_graph_sync


running = True


def handle_shutdown(_signum: int, _frame: object) -> None:
    global running
    running = False


def main() -> None:
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    config = load_config()
    worker_id = os.environ.get("BOUNDARY_WORKER_ID", f"worker-{uuid4()}")
    wait_for_schema_ready(config.sqlite_path)
    recover_stale_running_jobs(config.sqlite_path, config.artifact_dir, claim_timeout_seconds=config.claim_timeout_seconds)

    while running:
        if not worker_tick(config, worker_id=worker_id):
            time.sleep(config.poll_interval_seconds)


def worker_tick(config: WorkerConfig, *, worker_id: str) -> bool:
    write_heartbeat(config.heartbeat_path, worker_id=worker_id)
    recover_stale_running_jobs(config.sqlite_path, config.artifact_dir, claim_timeout_seconds=config.claim_timeout_seconds)
    job = claim_next_job(config.sqlite_path, worker_id=worker_id)
    if not job:
        return False

    if not operator_is_active(config.sqlite_path, job.submitted_by):
        release_claim(config.sqlite_path, job.id, reason="claim_refused_operator_revoked", claim_token=job.claim_token)
        return True

    process_job(config.sqlite_path, config.artifact_dir, job.id, job.campaign_id, claim_token=job.claim_token)
    return True


def process_job(sqlite_path: Path, artifact_dir: Path, job_id: str, run_id: str, *, claim_token: str | None = None) -> None:
    paths = sentinel_paths(artifact_dir, run_id)
    if claim_token and not claim_token_still_current(sqlite_path, job_id, claim_token):
        with closing(connect(sqlite_path)) as db:
            write_audit(
                db,
                action="process_job_claim_token_mismatch",
                target_type="campaign_job",
                target_id=job_id,
                outcome="ignored",
            )
            db.commit()
        return

    try:
        payload = load_job_payload(sqlite_path, job_id)
        categories = payload_categories(payload)
    except ValueError as exc:
        write_failed(paths, "invalid_job_payload", {"error": str(exc)})
        mark_job_failed(sqlite_path, job_id, reason="invalid_job_payload", claim_token=claim_token)
        return

    target_url = resolve_target_url(payload)
    if not target_is_allowed(target_url):
        write_failed(paths, "target_not_allowlisted", {"targetUrl": target_url})
        mark_job_failed(sqlite_path, job_id, reason="target_not_allowlisted", claim_token=claim_token)
        return

    try:
        run_campaign_graph_sync(
            CampaignGraphDeps(
                run_id=run_id,
                artifact_dir=artifact_dir,
                sqlite_path=sqlite_path,
                target_url=target_url,
                deployed_url=str(payload.get("deployedUrl") or os.environ.get("BOUNDARY_DEPLOYED_TARGET_URL") or os.environ.get("TARGET_DEPLOYED_COPILOT_URL") or "https://clinical-copilot.up.railway.app"),
                categories=categories,
                timeout_seconds=float(payload.get("timeoutSeconds") or os.environ.get("BOUNDARY_RUN_TIMEOUT_SECONDS") or 75.0),
                smart_session_cookie=os.environ.get("BOUNDARY_SMART_SESSION_COOKIE") or os.environ.get("TARGET_SMART_SESSION_COOKIE"),
                mint_synthetic_session=truthy(payload.get("mintSyntheticSession")) or os.environ.get("BOUNDARY_MINT_SYNTHETIC_SESSION") == "1",
                session_secret=os.environ.get("BOUNDARY_SMART_SESSION_SECRET") or os.environ.get("SECURITY_SMART_SESSION_SECRET") or "",
                session_secret_file=os.environ.get("BOUNDARY_SMART_SESSION_SECRET_FILE") or "",
                synthetic_patient_pid=int(payload.get("syntheticPatientPid") or os.environ.get("BOUNDARY_SYNTHETIC_PATIENT_PID") or 13),
                synthetic_user_id=int(payload.get("syntheticUserId") or os.environ.get("BOUNDARY_SYNTHETIC_USER_ID") or 1),
                synthetic_facility_id=int(payload.get("syntheticFacilityId") or os.environ.get("BOUNDARY_SYNTHETIC_FACILITY_ID") or 1),
                synthetic_access_token=str(payload.get("syntheticAccessToken") or os.environ.get("BOUNDARY_SYNTHETIC_ACCESS_TOKEN") or "boundary-labs-synthetic-token"),
                policy_values=load_policy_value_map(sqlite_path),
            )
        )
    except Exception as exc:
        write_failed(paths, "graph_error", {"error": str(exc), "type": type(exc).__name__})
        mark_job_failed(sqlite_path, job_id, reason="graph_error", claim_token=claim_token)
        return

    if paths.complete.exists() and paths.artifact.exists():
        if mark_job_completed(sqlite_path, job_id, claim_token=claim_token):
            try_ingest_completed_artifact(sqlite_path, job_id, paths.artifact)
    elif paths.complete.exists():
        write_failed(paths, "runner_completed_missing_artifact")
        mark_job_failed(sqlite_path, job_id, reason="runner_completed_missing_artifact", claim_token=claim_token)
    elif paths.failed.exists():
        mark_job_failed(sqlite_path, job_id, reason="runner_failed_sentinel", claim_token=claim_token)
    else:
        write_failed(paths, "runner_completed_no_sentinel")
        mark_job_failed(sqlite_path, job_id, reason="runner_completed_no_sentinel", claim_token=claim_token)


def try_ingest_completed_artifact(sqlite_path: Path, job_id: str, artifact_path: Path) -> None:
    try:
        ingest_completed_artifact(sqlite_path, artifact_path)
    except Exception:
        with closing(connect(sqlite_path)) as db:
            write_audit(db, action="artifact_ingest_failed", target_type="campaign_job", target_id=job_id, outcome="degraded")
            db.commit()


def worker_subprocess_env() -> dict[str, str]:
    allowed = dict(os.environ)
    # Explicitly keep model-provider keys in the worker subprocess while the web child strips them.
    return allowed


def load_job_payload(sqlite_path: Path, job_id: str) -> dict[str, object]:
    from worker.queue import connect

    with closing(connect(sqlite_path)) as db:
        row = db.execute("SELECT payload_json FROM campaign_jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        raise ValueError(f"Missing campaign job payload for {job_id}.")
    try:
        value = json.loads(row["payload_json"])
    except json.JSONDecodeError:
        raise ValueError("campaign_jobs.payload_json is not valid JSON.")
    if not isinstance(value, dict):
        raise ValueError("campaign_jobs.payload_json must be a JSON object.")
    return value


def claim_token_still_current(sqlite_path: Path, job_id: str, claim_token: str) -> bool:
    with closing(connect(sqlite_path)) as db:
        row = db.execute(
            "SELECT 1 FROM campaign_jobs WHERE id = ? AND claim_token = ? AND status = 'claimed'",
            (job_id, claim_token),
        ).fetchone()
    return bool(row)


def payload_categories(payload: dict[str, object]) -> list[str]:
    raw = payload.get("categories", [])
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("campaign_jobs.payload_json categories must be an array.")
    return [str(category) for category in raw]


def load_policy_value_map(sqlite_path: Path) -> dict[str, object]:
    from worker.queue import connect

    values: dict[str, object] = {}
    with closing(connect(sqlite_path)) as db:
        rows = db.execute("SELECT key, value_json FROM policy_values").fetchall()
    for row in rows:
        try:
            values[row["key"]] = json.loads(row["value_json"])
        except json.JSONDecodeError:
            values[row["key"]] = row["value_json"]
    return values


def truthy(value: object) -> bool:
    return value is True or (isinstance(value, str) and value.lower() in {"1", "true", "yes", "on"})


def resolve_target_url(payload: dict[str, object]) -> str:
    return str(
        payload.get("targetUrl")
        or os.environ.get("BOUNDARY_TARGET_URL")
        or os.environ.get("TARGET_COPILOT_BASE_URL")
        or "http://localhost:8400"
    )


def target_is_allowed(target_url: str) -> bool:
    try:
        target_origin = origin(target_url)
    except ValueError:
        return False

    allowlist = os.environ.get("BOUNDARY_TARGET_ALLOWLIST") or "https://clinical-copilot.up.railway.app"
    for raw in allowlist.split(","):
        item = raw.strip()
        if not item:
            continue
        try:
            if origin(item) == target_origin:
                return True
        except ValueError:
            continue
    return False


def origin(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Invalid target URL: {value}")
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def wait_for_schema_ready(sqlite_path: Path, timeout_seconds: float = 60.0) -> None:
    from worker.queue import connect

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not sqlite_path.exists():
            time.sleep(1)
            continue
        try:
            with closing(connect(sqlite_path)) as db:
                row = db.execute("SELECT value_json FROM policy_values WHERE key = 'schema_ready'").fetchone()
            if row and row["value_json"] == "true":
                return
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit("Timed out waiting for schema_ready policy_values row.")
