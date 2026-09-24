from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

CORE_DIR = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE_DIR))

from pedagogical_planner import (  # noqa: E402
    PedagogicalPlan,
    build_planner_input,
    fallback_plan,
    is_social_only,
    validate_and_normalize_plan,
)
from deeprag_search import select_relevant_page_text  # noqa: E402
import tutor_session as tutor_session_module  # noqa: E402
from tutor_session import TutorSession  # noqa: E402


def candidate_plan(**overrides):
    plan = {
        "schema_version": "1",
        "intent": ["concept_question"],
        "target_concepts": ["固有値"],
        "action": "answer",
        "page_relation": "no_open_page",
        "source_scope": "rag",
        "pedagogical_move": "explain_then_example",
        "support_level": "standard",
        "diagnostic": {"needed": False, "target": None, "reason": "answer_first"},
        "learner_context": {"use_relevant_evidence": False, "evidence_refs": []},
        "retrieval": {"queries": ["固有値 直感"], "prerequisite_concepts": []},
    }
    plan.update(overrides)
    return plan


class PedagogicalPlannerTests(unittest.TestCase):
    def test_greeting_fallback_never_retrieves_or_diagnoses(self):
        plan = fallback_plan(text="おはよう", page_context=None)
        self.assertTrue(is_social_only("おはよう"))
        self.assertEqual(plan["action"], "social_response")
        self.assertEqual(plan["source_scope"], "no_retrieval")
        self.assertFalse(plan["diagnostic"]["needed"])

    def test_mixed_greeting_and_question_is_not_social_only(self):
        self.assertFalse(is_social_only("おはよう、固有値って何？"))

    def test_simple_concept_question_cannot_be_gated_by_planner_diagnosis(self):
        plan = validate_and_normalize_plan(
            candidate_plan(
                diagnostic={"needed": True, "target": "固有値", "reason": "unknown_level"}
            ),
            text="固有値って何？",
            page_context=None,
            learner_evidence=[],
        )
        self.assertEqual(plan["source_scope"], "rag")
        self.assertFalse(plan["diagnostic"]["needed"])

    def test_concept_question_cannot_be_turned_into_a_clarify_gate(self):
        plan = validate_and_normalize_plan(
            candidate_plan(action="clarify"),
            text="固有値って何？",
            page_context=None,
            learner_evidence=[],
        )
        self.assertEqual(plan["action"], "answer")

    def test_invalid_or_timed_out_planner_uses_safe_fallback(self):
        class FailingClient:
            def with_options(self, **kwargs):
                return self

        for error in (TimeoutError("planner timeout"), ValueError("invalid JSON")):
            with self.subTest(error=type(error).__name__):
                session = _make_session(_FakeSearcher())
                session.client = FailingClient()
                session.planner_enabled = True
                with patch.object(tutor_session_module, "_chat_json", side_effect=error):
                    plan = session._make_pedagogical_plan("固有値って何？")
                self.assertEqual(plan["source_scope"], "rag")
                self.assertFalse(plan["diagnostic"]["needed"])
                self.assertTrue(session._last_planner_record["status"].startswith("fallback:"))

    def test_planner_receives_relevant_page_tail_not_only_the_prefix(self):
        class CapturingClient:
            def with_options(self, **kwargs):
                return self

        page = {
            "lesson_page_id": 43,
            "title": "固有値",
            "text": ("前半の行列の説明。" * 520) + "\n末尾だけにある余白係数は λ=7。",
        }
        session = _make_session(_FakeSearcher())
        session.planner_enabled = True
        session.client = CapturingClient()
        session.page_context = page
        with patch.object(tutor_session_module, "_chat_json", return_value=candidate_plan()) as planner:
            session._make_pedagogical_plan("余白係数って何？")
        planner_input = planner.call_args.args[2]
        self.assertIn("余白係数は λ=7", planner_input)
        self.assertLess(len(planner_input), 6000)

    def test_page_reference_forces_page_first_even_if_model_suggests_global_rag(self):
        page = {"lesson_page_id": 41, "title": "固有値の定義", "text": "λ は固有値である。"}
        plan = validate_and_normalize_plan(
            candidate_plan(page_relation="no_open_page", source_scope="rag"),
            text="この式はなぜ？",
            page_context=page,
            learner_evidence=[],
        )
        self.assertEqual(plan["page_relation"], "explicit_reference")
        self.assertEqual(plan["source_scope"], "active_page_first")

    def test_active_page_is_never_used_when_page_context_is_absent(self):
        plan = validate_and_normalize_plan(
            candidate_plan(page_relation="related_to_open_page", source_scope="active_page_first"),
            text="固有値って何？",
            page_context=None,
            learner_evidence=[],
        )
        self.assertEqual(plan["page_relation"], "no_open_page")
        self.assertEqual(plan["source_scope"], "rag")

    def test_explicit_unrelated_topic_does_not_get_forced_to_active_page(self):
        page = {"lesson_page_id": 41, "title": "固有値", "text": "ページ本文"}
        plan = validate_and_normalize_plan(
            candidate_plan(page_relation="related_to_open_page", source_scope="active_page_first"),
            text="別件だけど微分を説明して",
            page_context=page,
            learner_evidence=[],
        )
        self.assertEqual(plan["page_relation"], "unrelated_new_topic")
        self.assertEqual(plan["source_scope"], "rag")

    def test_only_backend_supplied_evidence_refs_survive_validation(self):
        evidence = [{"ref": "exercise:12:89", "source": "exercise", "result": "incorrect"}]
        plan = validate_and_normalize_plan(
            candidate_plan(learner_context={
                "use_relevant_evidence": True,
                "evidence_refs": ["exercise:12:89", "exercise:999:999"],
            }),
            text="固有値って何？",
            page_context=None,
            learner_evidence=evidence,
        )
        self.assertEqual(plan["learner_context"]["evidence_refs"], ["exercise:12:89"])
        self.assertTrue(plan["learner_context"]["use_relevant_evidence"])

    def test_planner_input_marks_page_request_scoped_and_bounds_history(self):
        payload = build_planner_input(
            text="この式は？",
            page_context={"lesson_page_id": 41, "title": "行列", "text": "x" * 9000},
            dialogue=[{"role": "user", "content": "前の発話"}],
            answer_length="short",
            learner_state=None,
            learner_evidence=[],
        )
        self.assertIn('"lesson_page_id": 41', payload)
        self.assertIn('"answer_length": "short"', payload)
        self.assertLess(len(payload), 6000)

    def test_schema_rejects_unrecognized_fields(self):
        plan = candidate_plan(untrusted_page_id=999)
        with self.assertRaises(Exception):
            PedagogicalPlan.model_validate(plan)

    def test_tutor_greeting_does_not_retrieve_or_show_diagnosis(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        session._make_pedagogical_plan = lambda text: fallback_plan(text=text, page_context=None)
        turn = session.handle_turn("おはよう")
        self.assertEqual(searcher.search_calls, [])
        self.assertIsNone(turn["diagnosis"])
        self.assertIn("おはようございます", turn["reply"])

    def test_tutor_page_question_keeps_current_page_on_retrieval_and_citation(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        page = {
            "lesson_page_id": 41,
            "title": "固有値の定義",
            "text": "ページ先頭の説明。ページ後半の式 λv = Av。",
            "section": "固有値",
        }
        session.page_context = page
        session._make_pedagogical_plan = lambda text: fallback_plan(text=text, page_context=page)
        turn = session.handle_turn("この式は何？")
        self.assertEqual(searcher.search_calls[0]["page_context"]["lesson_page_id"], 41)
        self.assertEqual(searcher.search_calls[0]["pedagogical_plan"]["source_scope"], "active_page_first")
        self.assertEqual(turn["citations"][0]["type"], "active_page")

    def test_page_switch_and_close_use_only_the_current_request_page(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        session._make_pedagogical_plan = lambda text: fallback_plan(
            text=text, page_context=session.page_context
        )
        session.page_context = {"lesson_page_id": 51, "title": "固有値", "text": "ページAの内容。"}
        session.handle_turn("この式は何？")
        session.page_context = {"lesson_page_id": 52, "title": "行列式", "text": "ページBの内容。"}
        session.handle_turn("この式は何？")
        session.page_context = None
        turn = session.handle_turn("固有値とは？")
        self.assertEqual(
            [call["page_context"]["lesson_page_id"] if call["page_context"] else None
             for call in searcher.search_calls],
            [51, 52, None],
        )
        self.assertEqual(searcher.search_calls[-1]["pedagogical_plan"]["page_relation"], "no_open_page")
        self.assertNotIn("active_page", [c.get("type") for c in turn["citations"]])

    def test_answer_generator_receives_original_query_and_only_supplied_evidence(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        evidence = {
            "ref": "exercise:101:202", "source": "exercise", "topic_tags": ["固有値"],
            "item_title": "固有値の基礎", "result": "correct", "recorded_at": "2026-09-24",
        }
        session.learner_evidence = [evidence]
        plan = candidate_plan(learner_context={"use_relevant_evidence": True, "evidence_refs": [evidence["ref"]]})
        session._make_pedagogical_plan = lambda text: plan
        session.handle_turn("固有値って何？")
        call = searcher.search_calls[0]
        self.assertEqual(call["answer_query"], "固有値って何？")
        self.assertEqual(call["learner_evidence"], [evidence])

    def test_completed_diagnostic_does_not_repeat_after_state_machine_choice(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        session.state.phase = "awaiting_diagnosis"
        session.state.pending_query = "この問題が全然分からない"
        session.state.diagnosis_choices = [
            {"id": "A", "label": "初めて", "understanding": "none", "goal": "intuition"}
        ]
        plan = candidate_plan(
            intent=["problem_solving"],
            diagnostic={"needed": True, "target": "前提", "reason": "複数原因"},
        )
        session._make_pedagogical_plan = lambda text: plan
        turn = session.handle_turn("A")
        self.assertIsNone(turn["diagnosis"])
        self.assertEqual(len(searcher.search_calls), 1)

    def test_long_active_page_selects_a_relevant_tail_block_for_answer(self):
        filler = "前半の説明として、行列とベクトルの関係をここに記す。" * 520
        tail = "後半の特別な記述：余白係数は λ=7 とする。"
        page = {
            "lesson_page_id": 42,
            "title": "固有値",
            "text": filler + "\n" + tail,
            "section": "固有値",
        }
        selected = select_relevant_page_text(
            page["text"],
            "このページの最後にある余白係数はいくつ？",
            candidate_plan(target_concepts=["余白係数"]),
        )
        self.assertIn("余白係数は λ=7", selected)
        self.assertLess(len(selected), len(page["text"]) // 2)

        searcher = _FakeSearcher()
        session = _make_session(searcher)
        session.page_context = page
        session._make_pedagogical_plan = lambda text: fallback_plan(text=text, page_context=page)
        turn = session.handle_turn("このページの最後にある余白係数はいくつ？")
        sent_page = searcher.search_calls[0]["page_context"]
        self.assertIn("余白係数は λ=7", sent_page["text"])
        self.assertLess(len(sent_page["text"]), len(page["text"]) // 2)
        self.assertEqual(turn["citations"][0]["entity_id"], "lesson_page:42")

    def test_tutor_without_page_uses_rag_and_never_passes_previous_page(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        session.page_context = None
        session._make_pedagogical_plan = lambda text: fallback_plan(text=text, page_context=None)
        session.handle_turn("固有値って何？")
        self.assertIsNone(searcher.search_calls[0]["page_context"])
        self.assertEqual(searcher.search_calls[0]["pedagogical_plan"]["page_relation"], "no_open_page")
        self.assertFalse(session._should_diagnose("固有値って何？"))


class _FakeSearcher:
    pipeline = "test"

    def __init__(self):
        self.search_calls = []
        self.graph = SimpleNamespace(get_dependencies=lambda *args, **kwargs: [], nodes={})

    def search(self, query, **kwargs):
        self.search_calls.append({"query": query, **kwargs})
        return {
            "answer": "教材根拠からの回答\n## 参考（教科書）\n- 節: 固有値",
            "answer_body": "教材根拠からの回答",
            "banner": "",
            "citations": [],
            "results": [],
            "metadata": {"retrieval_path": "test"},
            "knowledge_mode": "textbook",
            "context": "教材根拠",
        }

    def generate_answer(self, query, context, **kwargs):
        return "自然な応答"


def _make_session(searcher):
    return TutorSession(
        searcher=searcher,
        cfg={"tutor": {"pedagogical_planner": {"enabled": False}}},
    )


if __name__ == "__main__":
    unittest.main()
