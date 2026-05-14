from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from worker.path_jail import assert_inside


@dataclass(frozen=True)
class SentinelPaths:
    heartbeat: Path
    complete: Path
    failed: Path
    artifact: Path
    graph_history: Path
    trace: Path


def sentinel_paths(artifact_dir: Path, run_id: str) -> SentinelPaths:
    run_dir = assert_inside(artifact_dir, artifact_dir / "runs" / run_id)
    return SentinelPaths(
        heartbeat=run_dir / f"{run_id}.heartbeat",
        complete=run_dir / f"{run_id}.complete",
        failed=run_dir / f"{run_id}.failed",
        artifact=run_dir / f"{run_id}.json",
        graph_history=run_dir / f"{run_id}.graph.json",
        trace=run_dir / f"{run_id}.trace.jsonl",
    )


def write_complete(paths: SentinelPaths, metadata: dict[str, Any]) -> None:
    paths.complete.parent.mkdir(parents=True, exist_ok=True)
    paths.complete.write_text(json.dumps(metadata, sort_keys=True) + "\n", encoding="utf-8")


def write_failed(paths: SentinelPaths, reason: str, metadata: dict[str, Any] | None = None) -> None:
    paths.failed.parent.mkdir(parents=True, exist_ok=True)
    paths.failed.write_text(
        json.dumps({"reason": reason, **(metadata or {})}, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def write_run_heartbeat(paths: SentinelPaths, metadata: dict[str, Any]) -> None:
    paths.heartbeat.parent.mkdir(parents=True, exist_ok=True)
    paths.heartbeat.write_text(json.dumps(metadata, sort_keys=True) + "\n", encoding="utf-8")


def write_trace_event(paths: SentinelPaths, event: dict[str, Any]) -> None:
    paths.trace.parent.mkdir(parents=True, exist_ok=True)
    with paths.trace.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, sort_keys=True) + "\n")
