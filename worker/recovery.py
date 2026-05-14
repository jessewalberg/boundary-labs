from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from contextlib import closing
from pathlib import Path

from worker.artifact_ingest import ingest_completed_artifact
from worker.queue import connect, table_exists, write_audit
from worker.sentinels import sentinel_paths, write_complete


def recover_stale_running_jobs(sqlite_path: Path, artifact_dir: Path, *, claim_timeout_seconds: float = 600.0) -> dict[str, int]:
    recovered = {"completed": 0, "failed": 0, "orphaned": 0, "fresh": 0, "requeued": 0}
    with closing(connect(sqlite_path)) as db:
        rows = db.execute(
            """
            SELECT campaign_jobs.id, campaign_jobs.campaign_id, campaign_jobs.claimed_at
            FROM campaign_jobs
            WHERE campaign_jobs.status = 'claimed'
            """
        ).fetchall()
        now_dt = datetime.now(UTC)
        now = now_dt.isoformat()
        for row in rows:
            paths = sentinel_paths(artifact_dir, row["campaign_id"])
            if paths.complete.exists() and paths.failed.exists():
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "failed", now)
                write_audit(db, action="claim_failed_sentinel_conflict", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["failed"] += 1
            elif paths.complete.exists() and not paths.artifact.exists():
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "failed", now)
                write_audit(db, action="runner_completed_missing_artifact", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["failed"] += 1
            elif paths.complete.exists():
                try_ingest_recovered_artifact(sqlite_path, db, row["id"], paths.artifact)
                db.execute(
                    "UPDATE campaign_jobs SET status = 'completed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "completed", now)
                recovered["completed"] += 1
            elif artifact_can_be_completed(paths.artifact, row["campaign_id"]):
                artifact = load_json_file(paths.artifact)
                write_complete(
                    paths,
                    {
                        "run_id": row["campaign_id"],
                        "artifact": str(paths.artifact),
                        "summary": artifact.get("summary", {}) if isinstance(artifact, dict) else {},
                        "recovered": True,
                    },
                )
                try_ingest_recovered_artifact(sqlite_path, db, row["id"], paths.artifact)
                db.execute(
                    "UPDATE campaign_jobs SET status = 'completed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "completed", now)
                recovered["completed"] += 1
            elif paths.failed.exists():
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "failed", now)
                write_audit(db, action="claim_failed_graph_error", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["failed"] += 1
            elif not claim_is_stale(row["claimed_at"], now_dt, claim_timeout_seconds):
                recovered["fresh"] += 1
            elif graph_history_has_resumable_snapshot(paths.graph_history):
                db.execute(
                    "UPDATE campaign_jobs SET status = 'queued', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                if table_exists(db, "campaigns"):
                    db.execute(
                        "UPDATE campaigns SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'running'",
                        (now, row["campaign_id"]),
                    )
                write_audit(db, action="claim_requeued_graph_resume", target_type="campaign_job", target_id=row["id"], outcome="queued")
                recovered["requeued"] += 1
            else:
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                update_campaign_status_if_present(db, row["campaign_id"], "failed", now)
                write_audit(db, action="claim_failed_orphaned", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["orphaned"] += 1
        db.commit()
    return recovered


def try_ingest_recovered_artifact(sqlite_path: Path, db, job_id: str, artifact_path: Path) -> None:
    if not artifact_path.exists():
        return
    try:
        ingest_completed_artifact(sqlite_path, artifact_path)
    except Exception:
        write_audit(db, action="artifact_ingest_failed", target_type="campaign_job", target_id=job_id, outcome="degraded")


def graph_history_has_resumable_snapshot(graph_history_path: Path) -> bool:
    try:
        snapshots = json.loads(graph_history_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return False
    if not isinstance(snapshots, list):
        return False
    return any(
        isinstance(snapshot, dict)
        and snapshot.get("kind") == "node"
        and snapshot.get("status") in {"created", "pending", "running"}
        for snapshot in snapshots
    )


def artifact_can_be_completed(artifact_path: Path, run_id: str) -> bool:
    artifact = load_json_file(artifact_path)
    return isinstance(artifact, dict) and artifact.get("run_id") == run_id and isinstance(artifact.get("summary"), dict)


def load_json_file(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def update_campaign_status_if_present(db, campaign_id: str, status: str, updated_at: str) -> None:
    if not table_exists(db, "campaigns"):
        return
    db.execute(
        "UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ? AND status != 'cancelled'",
        (status, updated_at, campaign_id),
    )


def claim_is_stale(claimed_at: str | None, now: datetime, timeout_seconds: float) -> bool:
    if not claimed_at:
        return True
    try:
        claimed = datetime.fromisoformat(claimed_at)
    except ValueError:
        return True
    if claimed.tzinfo is None:
        claimed = claimed.replace(tzinfo=UTC)
    return now - claimed > timedelta(seconds=timeout_seconds)
