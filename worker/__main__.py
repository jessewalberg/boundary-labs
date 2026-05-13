from __future__ import annotations

import os
import signal
import time
from pathlib import Path


running = True


def handle_shutdown(_signum: int, _frame: object) -> None:
    global running
    running = False


def main() -> None:
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    heartbeat_path = Path(os.environ.get("BOUNDARY_WORKER_HEARTBEAT_PATH", "/data/worker.heartbeat"))
    heartbeat_path.parent.mkdir(parents=True, exist_ok=True)

    while running:
        heartbeat_path.write_text(str(time.time()), encoding="utf-8")
        time.sleep(5)


if __name__ == "__main__":
    main()
