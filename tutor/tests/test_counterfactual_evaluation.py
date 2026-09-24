from __future__ import annotations

import sys
import unittest
from pathlib import Path

TUTOR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR_ROOT / "evaluation"))

from run_counterfactual import DATASET_PATH, load_dataset, run_case, summarize_results  # noqa: E402


class CounterfactualEvaluationTests(unittest.TestCase):
    def test_dataset_has_required_counterfactual_categories_and_evidence_variants(self):
        cases = load_dataset(DATASET_PATH)
        categories = {case["category"] for case in cases}
        self.assertTrue({"concept", "why", "problem_solving", "difficulty", "page", "page_counterfactual", "page_sequence"}.issubset(categories))
        eigenvalue = [case for case in cases if case.get("group") == "eigenvalue_definition"]
        self.assertEqual(
            {case.get("role") for case in eigenvalue},
            {"no_history", "prerequisite_success", "prerequisite_failure", "irrelevant_only"},
        )
        page_roles = {case.get("role") for case in cases if case.get("group") == "page_counterfactual"}
        self.assertEqual(page_roles, {"page_a", "page_b", "no_page"})

    def test_baseline_runner_is_no_planner_and_preserves_legacy_diagnostic_behavior(self):
        case = next(case for case in load_dataset() if case["id"] == "greeting_morning")
        result = run_case(case, "baseline")
        self.assertEqual(result["mode_requested"], "baseline")
        self.assertEqual(result["mode_effective"], "baseline")
        self.assertEqual(result["planner_calls"], 0)
        self.assertTrue(result["diagnostic"])

    def test_pair_adaptation_uses_pedagogical_policy_not_only_evidence_ref_difference(self):
        def record(case_id, role, move, support, refs):
            return {
                "case_id": case_id,
                "expected": {"personalization_expected": True, "adaptation_expected": True},
                "checks": {"evidence_utilization": True, "pedagogical_move": True, "support_level": True},
                "selected_evidence_refs": refs,
                "reason_codes": [],
                "counterfactual_group": "test_group",
                "counterfactual_role": role,
                "plan": {"pedagogical_move": move, "support_level": support, "retrieval": {"prerequisite_concepts": []}},
                "diagnostic": False,
                "page_grounding": False,
                "retrieval_used": True,
                "fallback": False,
                "planner_calls": 1,
                "planner_latency_ms": [10],
                "total_latency_ms": 10,
                "mode_effective": "planner",
            }

        no_history = record("none", "no_history", "explain_then_example", "standard", [])
        success = record("success", "prerequisite_success", "intuitive_explanation", "standard", ["ev-success"])
        failure = record("failure", "prerequisite_failure", "prerequisite_repair", "high", ["ev-failure"])
        summary = summarize_results([no_history, success, failure], "planner")
        self.assertEqual(summary["counterfactual_pair_adaptation"]["rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
