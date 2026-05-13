from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import aiosqlite

from worker.safety_gate import POLICY_SCHEMA


@dataclass(frozen=True)
class PolicyValue:
    key: str
    domain: str
    value: Any
    value_type: str
    approval_path: str
    system_reserved: bool
    description: str
    updated_at: str
    updated_by: str


async def load_policy_values(sqlite_path: str) -> list[PolicyValue]:
    async with aiosqlite.connect(sqlite_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT
              key,
              domain,
              value_json,
              value_type,
              approval_path,
              system_reserved,
              description,
              updated_at,
              updated_by
            FROM policy_values
            ORDER BY key ASC
            """
        )
        rows = await cursor.fetchall()

    return [
        PolicyValue(
            key=row["key"],
            domain=row["domain"],
            value=json.loads(row["value_json"]),
            value_type=row["value_type"],
            approval_path=row["approval_path"],
            system_reserved=bool(row["system_reserved"]),
            description=row["description"],
            updated_at=row["updated_at"],
            updated_by=row["updated_by"],
        )
        for row in rows
    ]


def policy_snapshot_hash(rows: list[PolicyValue]) -> str:
    snapshot = {
        "schemaVersion": POLICY_SCHEMA["version"],
        "actions": sorted(POLICY_SCHEMA["actions"].keys()),
        "systemReservedRows": POLICY_SCHEMA["systemReservedRows"],
        "rows": [
            {
                "key": row.key,
                "domain": row.domain,
                "value": row.value,
                "approvalPath": row.approval_path,
                "systemReserved": row.system_reserved,
                "updatedAt": row.updated_at,
            }
            for row in sorted(rows, key=lambda item: item.key)
        ],
    }
    return canonical_hash(snapshot)


def missing_system_reserved_rows(rows: list[PolicyValue]) -> list[str]:
    present = {row.key for row in rows}
    return [key for key in POLICY_SCHEMA["systemReservedRows"] if key not in present]


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
