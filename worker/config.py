from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkerConfig:
    sqlite_path: Path
    artifact_dir: Path
    heartbeat_path: Path
    poll_interval_seconds: float = 2.0
    claim_timeout_seconds: float = 600.0


def load_config() -> WorkerConfig:
    artifact_dir = Path(os.environ.get("BOUNDARY_ARTIFACT_DIR", "/data/artifacts")).resolve()
    return WorkerConfig(
        sqlite_path=Path(os.environ.get("SQLITE_PATH", "/data/boundary.db")).resolve(),
        artifact_dir=artifact_dir,
        heartbeat_path=Path(os.environ.get("BOUNDARY_WORKER_HEARTBEAT_PATH", "/data/worker.heartbeat")).resolve(),
        poll_interval_seconds=float(os.environ.get("BOUNDARY_WORKER_POLL_SECONDS", "2.0")),
        claim_timeout_seconds=float(os.environ.get("BOUNDARY_CLAIM_TIMEOUT_SECONDS", "600.0")),
    )
