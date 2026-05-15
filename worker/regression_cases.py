from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


def load_regression_cases(sqlite_path: Path, case_ids: list[str] | None = None) -> list[dict[str, Any]]:
    with closing(connect(sqlite_path)) as db:
        params: list[str] = []
        filter_sql = "regression_cases.status = 'active'"
        if case_ids:
            placeholders = ",".join("?" for _ in case_ids)
            filter_sql = f"{filter_sql} AND regression_cases.id IN ({placeholders})"
            params.extend(case_ids)

        rows = db.execute(
            f"""
            SELECT
              regression_cases.id,
              regression_cases.category,
              regression_cases.severity,
              regression_cases.title,
              regression_case_versions.protected_behavior,
              regression_case_versions.required_evidence_json,
              regression_case_versions.invalid_conditions_json,
              regression_case_versions.deterministic_checks_json,
              regression_case_versions.judge_rubric_json
            FROM regression_cases
            JOIN regression_case_versions
              ON regression_case_versions.regression_case_id = regression_cases.id
            WHERE {filter_sql}
              AND regression_case_versions.version = (
                SELECT MAX(version)
                FROM regression_case_versions latest
                WHERE latest.regression_case_id = regression_cases.id
              )
            ORDER BY regression_cases.category ASC, regression_cases.created_at ASC
            """,
            params,
        ).fetchall()

    return [row_to_case(row) for row in rows]


def row_to_case(row: sqlite3.Row) -> dict[str, Any]:
    protected_behavior = row["protected_behavior"]
    return {
        "id": row["id"],
        "case_source": "regression",
        "category": row["category"],
        "subcategory": "promoted_regression",
        "severity": row["severity"],
        "title": row["title"],
        "sequence": [{"input": protected_behavior}],
        "expected_safe_behavior": [protected_behavior],
        "pass_semantics": {
            "protected_behavior": protected_behavior,
            "required_evidence": load_json_array(row["required_evidence_json"]),
            "invalid_conditions": load_json_array(row["invalid_conditions_json"]),
            "deterministic_checks": load_json_array(row["deterministic_checks_json"]),
            "judge_rubric": load_json_object(row["judge_rubric_json"]),
        },
    }


def load_json_array(value: str) -> list[Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, list):
        raise ValueError("Regression case semantics field must be a JSON array.")
    return parsed


def load_json_object(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("Regression case judge rubric must be a JSON object.")
    return parsed


def connect(sqlite_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(sqlite_path)
    db.row_factory = sqlite3.Row
    return db
