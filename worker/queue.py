from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    campaign_id: str
    job_type: str
    submitted_by: str
    claim_token: str
    payload_json: str


def claim_next_job(sqlite_path: Path, *, worker_id: str) -> ClaimedJob | None:
    claim_token = f"{worker_id}:{uuid4()}"
    now = datetime.now(UTC).isoformat()
    with closing(connect(sqlite_path)) as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """
            UPDATE campaign_jobs
            SET status = 'claimed',
                claim_token = ?,
                claimed_at = ?,
                updated_at = ?
            WHERE id = (
              SELECT id
              FROM campaign_jobs
              WHERE status = 'queued' AND claim_token IS NULL
              ORDER BY priority DESC, created_at ASC
              LIMIT 1
            )
            RETURNING id, campaign_id, job_type, submitted_by, claim_token, payload_json
            """,
            (claim_token, now, now),
        ).fetchone()
        db.commit()

    if not row:
        return None
    return ClaimedJob(
        id=row["id"],
        campaign_id=row["campaign_id"],
        job_type=row["job_type"],
        submitted_by=row["submitted_by"],
        claim_token=row["claim_token"],
        payload_json=row["payload_json"],
    )


def operator_is_active(sqlite_path: Path, operator_id: str) -> bool:
    with closing(connect(sqlite_path)) as db:
        row = db.execute("SELECT status FROM operators WHERE id = ?", (operator_id,)).fetchone()
    return bool(row and row["status"] == "active")


def release_claim(sqlite_path: Path, job_id: str, *, reason: str) -> None:
    now = datetime.now(UTC).isoformat()
    with closing(connect(sqlite_path)) as db:
        db.execute(
            """
            UPDATE campaign_jobs
            SET status = 'queued', claim_token = NULL, claimed_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (now, job_id),
        )
        write_audit(db, action=reason, target_type="campaign_job", target_id=job_id, outcome="refused")
        db.commit()


def mark_job_completed(sqlite_path: Path, job_id: str) -> None:
    update_job_status(sqlite_path, job_id, "completed")


def mark_job_failed(sqlite_path: Path, job_id: str, *, reason: str) -> None:
    update_job_status(sqlite_path, job_id, "failed", reason=reason)


def update_job_status(sqlite_path: Path, job_id: str, status: str, *, reason: str | None = None) -> None:
    now = datetime.now(UTC).isoformat()
    with closing(connect(sqlite_path)) as db:
        db.execute(
            """
            UPDATE campaign_jobs
            SET status = ?, claim_token = NULL, claimed_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (status, now, job_id),
        )
        if reason:
            write_audit(db, action=reason, target_type="campaign_job", target_id=job_id, outcome=status)
        db.commit()


def write_audit(
    db: sqlite3.Connection,
    *,
    action: str,
    target_type: str,
    target_id: str,
    outcome: str,
) -> None:
    db.execute(
        """
        INSERT INTO audit_events (
          id, occurred_at, actor_type, actor_id, action, target_type, target_id,
          outcome, rule_ref, policy_snapshot_hash, metadata_json
        ) VALUES (
          lower(hex(randomblob(16))), ?, 'worker', NULL, ?, ?, ?,
          ?, 'R9', NULL, '{}'
        )
        """,
        (datetime.now(UTC).isoformat(), action, target_type, target_id, outcome),
    )


def connect(sqlite_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(sqlite_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 5000")
    db.execute("PRAGMA foreign_keys = ON")
    return db
