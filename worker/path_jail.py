from __future__ import annotations

from pathlib import Path


def assert_inside(root: Path, candidate: Path) -> Path:
    root = root.resolve()
    candidate = candidate.resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"path escapes configured artifact directory: {candidate}")
    return candidate
