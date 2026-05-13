from __future__ import annotations

from datetime import UTC, datetime
from contextlib import closing
from pathlib import Path

from worker.queue import connect, write_audit
from worker.sentinels import sentinel_paths


def recover_stale_running_jobs(sqlite_path: Path, artifact_dir: Path) -> dict[str, int]:
    recovered = {"completed": 0, "failed": 0, "orphaned": 0}
    with closing(connect(sqlite_path)) as db:
        rows = db.execute(
            """
            SELECT campaign_jobs.id, campaign_jobs.campaign_id
            FROM campaign_jobs
            WHERE campaign_jobs.status = 'claimed'
            """
        ).fetchall()
        now = datetime.now(UTC).isoformat()
        for row in rows:
            paths = sentinel_paths(artifact_dir, row["campaign_id"])
            if paths.complete.exists():
                db.execute(
                    "UPDATE campaign_jobs SET status = 'completed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                recovered["completed"] += 1
            elif paths.failed.exists():
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                write_audit(db, action="claim_failed_graph_error", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["failed"] += 1
            else:
                db.execute(
                    "UPDATE campaign_jobs SET status = 'failed', claim_token = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                write_audit(db, action="claim_failed_orphaned", target_type="campaign_job", target_id=row["id"], outcome="failed")
                recovered["orphaned"] += 1
        db.commit()
    return recovered
