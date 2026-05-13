from __future__ import annotations

import json
import unittest
from pathlib import Path

from worker import safety_gate


class SafetyGateMirrorTest(unittest.TestCase):
    def test_generated_schema_matches_json_interchange(self) -> None:
        schema = json.loads(Path("worker/policy-schema.json").read_text(encoding="utf-8"))
        self.assertEqual(safety_gate.POLICY_SCHEMA, schema)

    def test_role_checks_match_declared_policy(self) -> None:
        self.assertTrue(safety_gate.can("operator", "campaign:create"))
        self.assertFalse(safety_gate.can("operator", "target:manage"))
        self.assertTrue(safety_gate.can("reviewer", "approval:review"))

    def test_every_action_has_parity_test_coverage(self) -> None:
        expected = {
            "approval:review",
            "budget:raise",
            "campaign:cancel",
            "campaign:create",
            "campaign:run",
            "data_mode:flip_real_phi",
            "documentation:draft",
            "finding:triage",
            "judge:verdict",
            "low_signal:stop_rule",
            "orchestrator:new_category",
            "orchestrator:regression_sweep",
            "policy:write",
            "red_team:mutate_seed",
            "red_team:new_category",
            "regression:promote",
            "report:publish",
            "schedule:manage",
            "secret:manage",
            "seed:promote",
            "target:allowlist_add",
            "target:manage",
        }
        self.assertEqual(set(safety_gate.ACTIONS), expected)
        for action in expected:
            self.assertIn(action, safety_gate.POLICY_SCHEMA["actions"])

    def test_system_reserved_floors_are_enforced_helpers(self) -> None:
        self.assertEqual(safety_gate.minimum_approval_path("policy:write"), "admin")
        self.assertFalse(safety_gate.approval_path_allows("auto", "admin"))
        self.assertTrue(safety_gate.approval_path_allows("admin", "admin"))

    def test_canonical_hash_is_stable(self) -> None:
        left = {"b": 2, "a": {"z": True, "c": [3, 2, 1]}}
        right = {"a": {"c": [3, 2, 1], "z": True}, "b": 2}
        self.assertEqual(safety_gate.canonical_hash(left), safety_gate.canonical_hash(right))


if __name__ == "__main__":
    unittest.main()
