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
            ingest_regression_result(db, artifact, result, now)
    materialize_cost_and_timeline(db, artifact, artifact_path, now)


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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id, case_id) DO NOTHING
        """,
        (
            str(attempt.get("attempt_id") or f"att_{case_id}_{run_id}"),
            run_id,
            case_id,
            seed_id_for_case(db, case_id),
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

    if (
        str(artifact.get("case_source")) != "regression"
        and str(judge_agent.get("status")) in {"fail", "partial"}
        and table_exists(db, "findings")
    ):
        inserted["findings"] += upsert_finding(db, result, category, run_id, now)


def ingest_regression_result(
    db: sqlite3.Connection,
    artifact: dict[str, Any],
    result: dict[str, Any],
    now: str,
) -> None:
    if str(artifact.get("case_source")) != "regression":
        return
    if not table_exists(db, "regression_suite_results") or not table_exists(db, "regression_cases"):
        return
    suite = artifact.get("regression_suite")
    if not isinstance(suite, dict):
        return
    suite_id = suite.get("suite_id")
    target_version_id = suite.get("target_version_id")
    if not isinstance(suite_id, str) or not isinstance(target_version_id, str):
        return

    case_id = str(result["case_id"])
    row = db.execute(
        """
        SELECT
          regression_cases.id,
          regression_cases.finding_id,
          regression_cases.category,
          regression_case_versions.required_evidence_json
        FROM regression_cases
        JOIN regression_case_versions
          ON regression_case_versions.regression_case_id = regression_cases.id
        WHERE regression_cases.id = ?
        ORDER BY regression_case_versions.version DESC
        LIMIT 1
        """,
        (case_id,),
    ).fetchone()
    if not row:
        return

    required_evidence = json.loads(row["required_evidence_json"])
    status, invalid_reason = classify_regression_status(result, required_evidence)
    prior_pass = db.execute(
        """
        SELECT id
        FROM regression_suite_results
        WHERE regression_case_id = ? AND status = 'pass'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (row["id"],),
    ).fetchone()
    fixed_category = normalize_category(str(suite.get("fixed_category") or "")) or None
    is_failure = status in {"fail", "partial"}
    is_reappearance = bool(prior_pass and is_failure)
    is_cross_category = bool(is_reappearance and fixed_category and fixed_category != normalize_category(str(row["category"])))

    proposed_result_id = uuid4().hex
    db.execute(
        """
        INSERT INTO regression_suite_results (
          id, suite_id, regression_case_id, target_version_id, run_id, status,
          category, evidence_json, invalid_reason, is_reappearance,
          is_cross_category_regression, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(suite_id, regression_case_id) DO UPDATE SET
          run_id = excluded.run_id,
          status = excluded.status,
          category = excluded.category,
          evidence_json = excluded.evidence_json,
          invalid_reason = excluded.invalid_reason,
          is_reappearance = excluded.is_reappearance,
          is_cross_category_regression = excluded.is_cross_category_regression
        """,
        (
            proposed_result_id,
            suite_id,
            row["id"],
            target_version_id,
            str(artifact["run_id"]),
            status,
            normalize_category(str(result.get("category") or row["category"])),
            json.dumps({"turns": len(turns_for_result(result))}),
            invalid_reason,
            1 if is_reappearance else 0,
            1 if is_cross_category else 0,
            now,
        ),
    )

    persisted = db.execute(
        "SELECT id FROM regression_suite_results WHERE suite_id = ? AND regression_case_id = ?",
        (suite_id, row["id"]),
    ).fetchone()
    result_id = persisted["id"] if persisted else proposed_result_id
    if is_reappearance and row["finding_id"] and table_exists(db, "vulnerability_lifecycle_events"):
        existing = db.execute(
            """
            SELECT id
            FROM vulnerability_lifecycle_events
            WHERE finding_id = ? AND status = 'reopened' AND regression_suite_result_id = ?
            """,
            (row["finding_id"], result_id),
        ).fetchone()
        if not existing:
            db.execute(
                """
                INSERT INTO vulnerability_lifecycle_events (
                  id, finding_id, regression_case_id, status, evidence_run_id,
                  regression_suite_result_id, note, created_at
                ) VALUES (?, ?, ?, 'reopened', ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    row["finding_id"],
                    row["id"],
                    str(artifact["run_id"]),
                    result_id,
                    "Cross-category regression detected." if is_cross_category else "Regression case failed after a prior pass.",
                    now,
                ),
            )
        if table_exists(db, "findings"):
            db.execute(
                "UPDATE findings SET status = 'reopened', latest_run_id = ?, updated_at = ? WHERE id = ?",
                (str(artifact["run_id"]), now, row["finding_id"]),
            )


def classify_regression_status(result: dict[str, Any], required_evidence: list[Any]) -> tuple[str, str | None]:
    for turn in turns_for_result(result):
        http = turn.get("http") if isinstance(turn.get("http"), dict) else {}
        if http.get("error") or int(http.get("status") or 0) >= 500:
            return "invalid", "target_unavailable"

    for evidence in required_evidence:
        if not isinstance(evidence, dict):
            continue
        if evidence.get("type") == "path":
            expected = str(evidence.get("value") or "")
            exercised = any(turn.get("endpoint") == expected for turn in turns_for_result(result))
            if not exercised:
                return "invalid", f"missing_required_evidence:path:{expected}"

    judge_agent = result.get("judge_agent") if isinstance(result.get("judge_agent"), dict) else {}
    status = str(judge_agent.get("status") or "invalid")
    return status, "judge_invalid" if status == "invalid" else None


def turns_for_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    attempt = result.get("attempt") if isinstance(result.get("attempt"), dict) else {}
    turns = attempt.get("turns") if isinstance(attempt.get("turns"), list) else []
    return [turn for turn in turns if isinstance(turn, dict)]


def materialize_cost_and_timeline(
    db: sqlite3.Connection,
    artifact: dict[str, Any],
    artifact_path: Path,
    now: str,
) -> None:
    run_id = str(artifact["run_id"])
    suite = artifact.get("regression_suite") if isinstance(artifact.get("regression_suite"), dict) else {}
    suite_id = suite.get("suite_id") if isinstance(suite, dict) and isinstance(suite.get("suite_id"), str) else None

    if table_exists(db, "run_costs"):
        db.execute("DELETE FROM run_costs WHERE run_id = ?", (run_id,))
        graph = artifact.get("pydantic_graph") if isinstance(artifact.get("pydantic_graph"), dict) else {}
        connections = graph.get("agent_connections") if isinstance(graph.get("agent_connections"), dict) else {}
        for role, connection in connections.items():
            if not isinstance(connection, dict):
                continue
            usage = connection.get("usage") if isinstance(connection.get("usage"), dict) else None
            db.execute(
                """
                INSERT INTO run_costs (
                  id, run_id, suite_id, regression_case_id, agent_role, provider, model,
                  category, input_tokens, output_tokens, request_count, cost_micros,
                  currency, provenance, created_at
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, 'USD', ?, ?)
                """,
                (
                    uuid4().hex,
                    run_id,
                    suite_id,
                    str(connection.get("role") or role),
                    connection.get("provider") if isinstance(connection.get("provider"), str) else None,
                    connection.get("model") if isinstance(connection.get("model"), str) else None,
                    number_or_none(usage.get("input_tokens")) if usage else None,
                    number_or_none(usage.get("output_tokens")) if usage else None,
                    number_or_none(usage.get("requests") if usage else None),
                    number_or_none((usage or {}).get("total_cost_micros") or (usage or {}).get("cost_micros")) if usage else None,
                    "provider_reported" if usage else "unavailable",
                    now,
                ),
            )

    if table_exists(db, "agent_timeline_events"):
        db.execute("DELETE FROM agent_timeline_events WHERE run_id = ?", (run_id,))
        graph = artifact.get("pydantic_graph") if isinstance(artifact.get("pydantic_graph"), dict) else {}
        trace_path = graph.get("trace_path") if isinstance(graph.get("trace_path"), str) else None
        messages = artifact.get("inter_agent_messages") if isinstance(artifact.get("inter_agent_messages"), list) else []
        for index, message in enumerate(message for message in messages if isinstance(message, dict)):
            sender = str(message.get("sender") or "agent")
            recipient = str(message.get("recipient") or "agent")
            metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
            db.execute(
                """
                INSERT INTO agent_timeline_events (
                  id, run_id, suite_id, regression_case_id, sequence, agent_role, action,
                  input_ref, output_ref, status, cost_micros, trace_ref, artifact_ref,
                  started_at, completed_at, metadata_json, created_at
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'completed', NULL, ?, ?, NULL, NULL, ?, ?)
                """,
                (
                    uuid4().hex,
                    run_id,
                    suite_id,
                    index + 1,
                    sender,
                    f"message:{sender}->{recipient}",
                    metadata.get("input_ref") if isinstance(metadata.get("input_ref"), str) else None,
                    metadata.get("output_ref") if isinstance(metadata.get("output_ref"), str) else None,
                    trace_path,
                    str(artifact_path),
                    json.dumps(message),
                    now,
                ),
            )


def number_or_none(value: object) -> int | float | None:
    return value if isinstance(value, (int, float)) else None


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


def seed_id_for_case(db: sqlite3.Connection, case_id: str) -> str | None:
    if not table_exists(db, "seeds"):
        return None
    row = db.execute("SELECT id FROM seeds WHERE id = ?", (case_id,)).fetchone()
    return str(row["id"]) if row else None
