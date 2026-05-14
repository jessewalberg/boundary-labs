from __future__ import annotations

import argparse
from collections import Counter
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.run_mvp_evals import load_cases


REQUIRED_NODES = [
    "SafetyGateNode",
    "CoverageScoreNode",
    "OrchestratorNode",
    "RedTeamNode",
    "TargetExecutionNode",
    "JudgeNode",
    "DocumentationNode",
    "WriteArtifactNode",
]
REQUIRED_AGENT_ROLES = ["orchestrator", "red_team", "judge", "documentation"]
REQUIRED_AGENT_ROLE_LABELS = ["Orchestrator", "Red Team Agent", "Judge Agent", "Documentation Agent"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a Boundary campaign proof artifact.")
    parser.add_argument("artifact", type=Path, help="Path to the campaign artifact JSON.")
    parser.add_argument("--expected-total", type=int, default=len(load_cases(Path("evals/seeds"))))
    parser.add_argument("--expected-target-origin", help="Require artifact target_url to match this origin.")
    parser.add_argument("--allow-local-target", action="store_true", help="Allow localhost/loopback target URLs in provider-required mode.")
    parser.add_argument("--allow-deterministic", action="store_true", help="Do not require provider-backed agent execution.")
    args = parser.parse_args()

    expected_case_ids = {str(case["id"]) for case in load_cases(Path("evals/seeds"))}
    errors = verify_artifact(
        args.artifact,
        expected_total=args.expected_total,
        require_llm_agents=not args.allow_deterministic,
        expected_case_ids=expected_case_ids,
        expected_target_origin=args.expected_target_origin,
        allow_local_target=args.allow_local_target,
    )
    if errors:
        print("Campaign artifact verification failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Campaign artifact verification passed.")
    return 0


def verify_artifact(
    artifact_path: Path,
    *,
    expected_total: int,
    require_llm_agents: bool,
    expected_case_ids: set[str] | None = None,
    expected_target_origin: str | None = None,
    allow_local_target: bool = False,
) -> list[str]:
    errors: list[str] = []
    try:
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"artifact does not exist: {artifact_path}"]
    except json.JSONDecodeError as exc:
        return [f"artifact is not valid JSON: {exc}"]

    if not isinstance(artifact, dict):
        return ["artifact root must be a JSON object"]

    if artifact.get("schema_version") != "boundary.campaign_graph.v1":
        errors.append("schema_version must be boundary.campaign_graph.v1")

    target_url = artifact.get("target_url")
    target_origin = url_origin(str(target_url)) if isinstance(target_url, str) else None
    if expected_target_origin and target_origin != normalize_origin(expected_target_origin):
        errors.append(f"target_url origin must be {normalize_origin(expected_target_origin)!r}, got {target_origin!r}")
    if require_llm_agents and not allow_local_target and target_origin and is_local_origin(target_origin):
        errors.append(f"provider-backed proof target_url must not be localhost/loopback: {target_origin}")

    summary = artifact.get("summary")
    if not isinstance(summary, dict):
        errors.append("summary must be present")
    else:
        total = summary.get("total")
        if total != expected_total:
            errors.append(f"summary.total must be {expected_total}, got {total!r}")
        status_total = sum_int_summary(summary, "pass", "fail", "partial", "invalid")
        if isinstance(total, int) and status_total != total:
            errors.append(f"summary pass/fail/partial/invalid counts must sum to total {total}, got {status_total}")
        if summary.get("invalid", 0) != 0:
            errors.append(f"summary.invalid must be 0, got {summary.get('invalid')!r}")

    results = artifact.get("results")
    if not isinstance(results, list):
        errors.append("results must be present")
    elif len(results) != expected_total:
        errors.append(f"results must contain {expected_total} cases, got {len(results)}")
    elif expected_case_ids is not None:
        actual_case_ids = [str(result.get("case_id")) for result in results if isinstance(result, dict)]
        if len(actual_case_ids) != len(results):
            errors.append("every result must be an object with case_id")
        actual_counts = Counter(actual_case_ids)
        duplicates = sorted(case_id for case_id, count in actual_counts.items() if count > 1)
        if duplicates:
            errors.append(f"results contain duplicate case IDs: {duplicates}")
        actual_ids = set(actual_case_ids)
        missing = sorted(expected_case_ids - actual_ids)
        unexpected = sorted(actual_ids - expected_case_ids)
        if missing:
            errors.append(f"results missing expected seed case IDs: {missing}")
        if unexpected:
            errors.append(f"results contain unexpected case IDs: {unexpected}")
    if require_llm_agents and isinstance(results, list):
        errors.extend(verify_provider_assisted_results(results))
        errors.extend(verify_documentation_entries(artifact.get("documentation_agent")))

    graph = artifact.get("pydantic_graph")
    if not isinstance(graph, dict):
        errors.append("pydantic_graph must be present")
        return errors

    nodes = graph.get("nodes")
    if nodes != REQUIRED_NODES:
        errors.append(f"pydantic_graph.nodes must be {REQUIRED_NODES}, got {nodes!r}")

    connections = graph.get("agent_connections")
    if not isinstance(connections, dict):
        errors.append("pydantic_graph.agent_connections must be present")
        return errors

    if require_llm_agents and artifact.get("agent_roles_executed") != REQUIRED_AGENT_ROLE_LABELS:
        errors.append(
            f"agent_roles_executed must be {REQUIRED_AGENT_ROLE_LABELS}, got {artifact.get('agent_roles_executed')!r}"
        )
    if require_llm_agents:
        errors.extend(verify_agent_notes(artifact.get("agent_notes")))

    for role in REQUIRED_AGENT_ROLES:
        connection = connections.get(role)
        if not isinstance(connection, dict):
            errors.append(f"agent connection missing for {role}")
            continue
        if require_llm_agents and connection.get("status") != "executed":
            errors.append(f"{role} agent must be executed, got {connection.get('status')!r}")
        if require_llm_agents and connection.get("api_key_configured") is not True:
            errors.append(f"{role} agent must report api_key_configured=true")

    return errors


def verify_agent_notes(agent_notes: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(agent_notes, dict):
        return ["agent_notes must be present"]
    for role in REQUIRED_AGENT_ROLES:
        note = agent_notes.get(role)
        if not isinstance(note, str) or not note.strip():
            errors.append(f"agent_notes.{role} must contain provider output")
    return errors


def verify_documentation_entries(documentation: object) -> list[str]:
    errors: list[str] = []
    if documentation is None:
        return errors
    if not isinstance(documentation, list):
        return ["documentation_agent must be a list when present"]
    for index, entry in enumerate(documentation):
        label = f"documentation_agent[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be an object")
            continue
        if entry.get("provider_status") != "executed":
            errors.append(f"{label}.provider_status must be executed, got {entry.get('provider_status')!r}")
        mode = entry.get("execution_mode")
        if not isinstance(mode, str) or not mode.startswith("pydantic-ai:"):
            errors.append(f"{label}.execution_mode must start with pydantic-ai:, got {mode!r}")
        note = entry.get("provider_note")
        if not isinstance(note, str) or not note.strip():
            errors.append(f"{label}.provider_note must contain provider output")
    return errors


def verify_provider_assisted_results(results: list[object]) -> list[str]:
    errors: list[str] = []
    for index, result in enumerate(results):
        if not isinstance(result, dict):
            continue
        case_id = result.get("case_id") or f"result[{index}]"
        red_team = result.get("red_team_agent")
        judge = result.get("judge_agent")
        if not isinstance(red_team, dict):
            errors.append(f"{case_id} red_team_agent must be present")
        else:
            require_provider_assisted_role(errors, str(case_id), "red_team_agent", red_team, "provider_note")
        if not isinstance(judge, dict):
            errors.append(f"{case_id} judge_agent must be present")
        else:
            require_provider_assisted_role(errors, str(case_id), "judge_agent", judge, "provider_review")
    return errors


def require_provider_assisted_role(
    errors: list[str],
    case_id: str,
    field_name: str,
    payload: dict[str, object],
    note_field: str,
) -> None:
    if payload.get("provider_status") != "executed":
        errors.append(f"{case_id} {field_name}.provider_status must be executed, got {payload.get('provider_status')!r}")
    mode = payload.get("execution_mode")
    if not isinstance(mode, str) or not mode.startswith("pydantic-ai:"):
        errors.append(f"{case_id} {field_name}.execution_mode must start with pydantic-ai:, got {mode!r}")
    note = payload.get(note_field)
    if not isinstance(note, str) or not note.strip():
        errors.append(f"{case_id} {field_name}.{note_field} must contain provider output")
    if field_name == "judge_agent" and payload.get("provider_decision") != "applied":
        errors.append(f"{case_id} judge_agent.provider_decision must be applied, got {payload.get('provider_decision')!r}")
    if field_name == "red_team_agent":
        if payload.get("provider_decision") != "applied":
            errors.append(f"{case_id} red_team_agent.provider_decision must be applied, got {payload.get('provider_decision')!r}")
        provider_plan = payload.get("provider_plan")
        if not isinstance(provider_plan, dict):
            errors.append(f"{case_id} red_team_agent.provider_plan must be present")


def sum_int_summary(summary: dict[str, object], *keys: str) -> int:
    total = 0
    for key in keys:
        value = summary.get(key, 0)
        if isinstance(value, int):
            total += value
    return total


def normalize_origin(value: str) -> str | None:
    return url_origin(value)


def url_origin(value: str) -> str | None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def is_local_origin(value: str) -> bool:
    parsed = urlparse(value)
    host = parsed.hostname or ""
    return host in {"localhost", "127.0.0.1", "::1"} or host.startswith("127.")


if __name__ == "__main__":
    raise SystemExit(main())
