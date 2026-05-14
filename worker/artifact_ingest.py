from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from worker.queue import connect, table_exists


REQUIRED_TABLES = {"runs", "attempts", "verdicts", "campaigns"}


def ingest_completed_artifact(sqlite_path: Path, artifact_path: Path) -> dict[str, int]:
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    if not isinstance(artifact, dict):
        raise ValueError("Run artifact must be a JSON object.")

    inserted = {"runs": 0, "attempts": 0, "verdicts": 0, "findings": 0}
    with connect(sqlite_path) as db:
        if not all(table_exists(db, table) for table in REQUIRED_TABLES):
            return inserted
        ingest_artifact(db, artifact, artifact_path, inserted)
        db.commit()
    return inserted


def ingest_artifact(db: sqlite3.Connection, artifact: dict[str, Any], artifact_path: Path, inserted: dict[str, int]) -> None:
    now = datetime.now(UTC).isoformat()
    run_id = str(artifact["run_id"])
    results = artifact.get("results")
    if not isinstance(results, list):
        results = []
    categories = sorted({normalize_category(str(result.get("category", ""))) for result in results if isinstance(result, dict)})

    db.execute(
        """
        UPDATE campaigns
        SET target_url = ?, categories_json = ?, status = 'completed', artifact_path = ?, updated_at = ?
        WHERE id = ? AND status != 'cancelled'
        """,
        (
            str(artifact.get("target_url") or ""),
            json.dumps(categories),
            str(artifact_path),
            str(artifact.get("completed_at") or now),
            run_id,
        ),
    )

    inserted["runs"] += db.execute(
        """
        INSERT INTO runs (
          id, campaign_id, run_id, artifact_path, status, started_at, completed_at,
          summary_json, created_at
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?)
        ON CONFLICT(run_id) DO NOTHING
        """,
        (
            uuid4().hex,
            run_id,
            run_id,
            str(artifact_path),
            artifact.get("started_at"),
            artifact.get("completed_at"),
            json.dumps(artifact.get("summary") if isinstance(artifact.get("summary"), dict) else {}),
            now,
        ),
    ).rowcount

    for result in results:
        if isinstance(result, dict):
            ingest_result(db, artifact, result, artifact_path, now, inserted)


def ingest_result(
    db: sqlite3.Connection,
    artifact: dict[str, Any],
    result: dict[str, Any],
    artifact_path: Path,
    now: str,
    inserted: dict[str, int],
) -> None:
    run_id = str(artifact["run_id"])
    case_id = str(result["case_id"])
    category = normalize_category(str(result.get("category") or "unknown"))
    attempt = result.get("attempt") if isinstance(result.get("attempt"), dict) else {}
    judge_agent = result.get("judge_agent") if isinstance(result.get("judge_agent"), dict) else {}
    turns = attempt.get("turns") if isinstance(attempt.get("turns"), list) else []
    first_turn = turns[0] if turns and isinstance(turns[0], dict) else {}
    prompt_hash = hashlib.sha256(str(first_turn.get("input") or case_id).encode("utf-8")).hexdigest()

    inserted["attempts"] += db.execute(
        """
        INSERT INTO attempts (
          id, run_id, case_id, seed_id, category, prompt_hash,
          request_artifact_path, response_artifact_path, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, case_id) DO NOTHING
        """,
        (
            str(attempt.get("attempt_id") or f"att_{case_id}_{run_id}"),
            run_id,
            case_id,
            category,
            prompt_hash,
            str(artifact_path),
            str(artifact_path),
            str(attempt.get("observed_at") or now),
        ),
    ).rowcount

    inserted["verdicts"] += db.execute(
        """
        INSERT INTO verdicts (
          id, run_id, case_id, status, severity, rationale, judge_model, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, case_id) DO NOTHING
        """,
        (
            str(judge_agent.get("verdict_id") or uuid4().hex),
            run_id,
            case_id,
            str(judge_agent.get("status") or "invalid"),
            normalize_severity(str(judge_agent.get("severity") or "info")),
            judge_agent.get("rationale"),
            str(judge_agent.get("execution_mode") or "deterministic"),
            now,
        ),
    ).rowcount

    if str(judge_agent.get("status")) in {"fail", "partial"} and table_exists(db, "findings"):
        inserted["findings"] += upsert_finding(db, result, category, run_id, now)


def upsert_finding(db: sqlite3.Connection, result: dict[str, Any], category: str, run_id: str, now: str) -> int:
    case_id = str(result["case_id"])
    severity = normalize_severity(str((result.get("judge_agent") or {}).get("severity") or "info"))
    db.execute(
        """
        INSERT INTO findings (
          id, category, case_id, title, severity, status, first_seen_run_id,
          latest_run_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
        ON CONFLICT(category, case_id, status) DO UPDATE SET
          latest_run_id = excluded.latest_run_id,
          updated_at = excluded.updated_at
        """,
        (uuid4().hex, category, case_id, title_from_result(result), severity, run_id, run_id, now, now),
    )
    if table_exists(db, "finding_attempts"):
        finding = db.execute(
            "SELECT id FROM findings WHERE category = ? AND case_id = ? AND status = 'open'",
            (category, case_id),
        ).fetchone()
        attempt = result.get("attempt") if isinstance(result.get("attempt"), dict) else {}
        if finding:
            db.execute(
                """
                INSERT INTO finding_attempts (finding_id, attempt_id, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(finding_id, attempt_id) DO NOTHING
                """,
                (finding["id"], str(attempt.get("attempt_id") or f"att_{case_id}_{run_id}"), now),
            )
    return 1


def normalize_category(value: str) -> str:
    return value.strip().replace("_", "-")


def normalize_severity(value: str) -> str:
    if value == "medium":
        return "med"
    if value == "informational":
        return "info"
    return value


def title_from_result(result: dict[str, Any]) -> str:
    subcategory = result.get("subcategory")
    if isinstance(subcategory, str) and subcategory:
        title = subcategory.replace("_", " ")
        return title[:1].upper() + title[1:]
    return str(result["case_id"])
