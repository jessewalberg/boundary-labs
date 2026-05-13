from __future__ import annotations

import time
from pathlib import Path


def write_heartbeat(path: Path, *, worker_id: str, now: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{worker_id} {now or time.time():.6f}\n", encoding="utf-8")
