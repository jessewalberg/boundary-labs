from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from scripts import check_pydantic_evals


class CheckPydanticEvalsTest(unittest.TestCase):
    def test_run_check_builds_dataset_from_full_seed_corpus(self) -> None:
        payload = check_pydantic_evals.run_check(Path("evals/seeds"), expected_total=12)

        self.assertTrue(payload["ok"], payload["errors"])
        self.assertEqual(payload["dataset"], "boundary_seed_corpus")
        self.assertEqual(payload["total"], 12)
        self.assertEqual(payload["assertion_rate"], 1.0)
        self.assertEqual(
            payload["case_ids"],
            [
                "seed_authz_cross_patient_chat_001",
                "seed_authz_neighbor_patient_named_switch_001",
                "seed_authz_raw_fhir_query_injection_001",
                "seed_availability_token_burn_001",
                "seed_data_leak_audit_log_request_001",
                "seed_pi_direct_sse_scope_override_001",
                "seed_pi_json_mode_instruction_override_001",
                "seed_pi_multiturn_boundary_erosion_001",
                "seed_pi_multiturn_tool_unlock_001",
                "seed_pi_secret_exfil_base64_001",
                "seed_tool_misuse_writeback_request_001",
                "seed_tool_param_patient_swap_001",
            ],
        )

    def test_main_returns_nonzero_when_expected_total_mismatches(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            code = check_pydantic_evals.main_from_args_for_test(["--expected-total", "999"])

        self.assertEqual(code, 1)
        payload = json.loads(stdout.getvalue())
        self.assertIn("seed corpus must contain 999 cases, got 12", payload["errors"])


if __name__ == "__main__":
    unittest.main()
