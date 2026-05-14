from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import EqualsExpected

from scripts.run_mvp_evals import load_cases


REQUIRED_CASE_FIELDS = {
    "id",
    "category",
    "subcategory",
    "sequence",
    "expected_safe_behavior",
    "severity",
    "exploitability",
    "regression_recommendation",
}


def main() -> int:
    return main_from_args_for_test(sys.argv[1:])


def main_from_args_for_test(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate Boundary seed corpus through Pydantic Evals.")
    parser.add_argument("--cases-dir", type=Path, default=Path("evals/seeds"))
    parser.add_argument("--expected-total", type=int)
    args = parser.parse_args(normalize_argv(argv))

    payload = run_check(args.cases_dir, expected_total=args.expected_total)
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


def run_check(cases_dir: Path, *, expected_total: int | None = None) -> dict[str, Any]:
    errors: list[str] = []
    cases = load_cases(cases_dir)
    if expected_total is not None and len(cases) != expected_total:
        errors.append(f"seed corpus must contain {expected_total} cases, got {len(cases)}")

    seen: set[str] = set()
    duplicate_ids: set[str] = set()
    categories: set[str] = set()
    pydantic_cases: list[Case[dict[str, Any], str, Any]] = []
    for index, case in enumerate(cases):
        case_id = str(case.get("id") or "")
        if not case_id:
            errors.append(f"case[{index}] missing id")
            continue
        if case_id in seen:
            duplicate_ids.add(case_id)
        seen.add(case_id)
        missing_fields = sorted(field for field in REQUIRED_CASE_FIELDS if field not in case)
        if missing_fields:
            errors.append(f"{case_id} missing required fields: {missing_fields}")
        if not isinstance(case.get("sequence"), list) or not case.get("sequence"):
            errors.append(f"{case_id} sequence must be a non-empty list")
        if not isinstance(case.get("expected_safe_behavior"), list) or not case.get("expected_safe_behavior"):
            errors.append(f"{case_id} expected_safe_behavior must be a non-empty list")
        if isinstance(case.get("category"), str):
            categories.add(str(case["category"]))

        pydantic_cases.append(
            Case(
                name=case_id,
                inputs={
                    "case_id": case_id,
                    "category": case.get("category"),
                    "subcategory": case.get("subcategory"),
                    "sequence_length": len(case.get("sequence", [])) if isinstance(case.get("sequence"), list) else 0,
                },
                expected_output=case_id,
            )
        )

    if duplicate_ids:
        errors.append(f"seed corpus contains duplicate case IDs: {sorted(duplicate_ids)}")

    dataset: Dataset[dict[str, Any], str, Any] = Dataset(
        name="boundary_seed_corpus",
        cases=pydantic_cases,
        evaluators=[EqualsExpected()],
    )
    report = dataset.evaluate_sync(seed_case_identity, progress=False)
    averages = report.averages()
    assertion_rate = averages.assertions if averages is not None else None
    if assertion_rate != 1.0:
        errors.append(f"Pydantic Evals assertion rate must be 1.0, got {assertion_rate!r}")

    return {
        "ok": not errors,
        "dataset": dataset.name,
        "total": len(cases),
        "case_ids": sorted(seen),
        "categories": sorted(categories),
        "assertion_rate": assertion_rate,
        "errors": errors,
    }


def seed_case_identity(inputs: dict[str, Any]) -> str:
    return str(inputs["case_id"])


def normalize_argv(argv: list[str]) -> list[str]:
    return [arg for arg in argv if arg != "--"]


if __name__ == "__main__":
    raise SystemExit(main())
