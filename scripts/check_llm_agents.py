from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.llm_provider import check_all_agent_connections


DEFAULT_ROLES = ["orchestrator", "red_team", "judge", "documentation"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Boundary worker Pydantic AI provider connectivity.")
    parser.add_argument("--sqlite-path", type=Path, help="Optional Boundary SQLite DB path for agent_provider_* policy values.")
    parser.add_argument("--roles", nargs="+", default=DEFAULT_ROLES, help="Agent roles to check.")
    args = parser.parse_args(normalize_argv(sys.argv[1:]))

    policy_values = load_policy_values(args.sqlite_path) if args.sqlite_path else {}
    checks = asyncio.run(check_all_agent_connections(roles=args.roles, policy_values=policy_values))
    payload = {
        "ok": all(check.status == "executed" for check in checks),
        "checks": [check.as_dict() for check in checks],
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


def load_policy_values(sqlite_path: Path) -> dict[str, object]:
    values: dict[str, object] = {}
    with sqlite3.connect(sqlite_path) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            """
            SELECT key, value_json
            FROM policy_values
            WHERE key LIKE 'agent_provider_%'
            """
        ).fetchall()
    for row in rows:
        values[row["key"]] = parse_json_value(row["value_json"])
    return values


def parse_json_value(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


if __name__ == "__main__":
    raise SystemExit(main())
