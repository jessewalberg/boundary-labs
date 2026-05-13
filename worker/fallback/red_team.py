from __future__ import annotations


def deterministic_mutations(seed: dict) -> list[dict]:
    return [{**seed, "mutation": "deterministic_scope_variant"}]
