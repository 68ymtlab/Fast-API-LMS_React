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
from learner_evidence import select_relevant_learner_evidence  # noqa: E402
import tutor_session as tutor_session_module  # noqa: E402
from tutor_session import TutorSession  # noqa: E402


def candidate_plan(**overrides):
    plan = {
        "schema_version": "2",
        "math_related": True,
        "intent": ["concept_question"],
        "target_concepts": ["固有値"],
        "action": "answer",
        "page_relation": "no_open_page",
        "source_scope": "rag",
        "pedagogical_move": "explain_then_example",
        "support_level": "standard",
        "diagnostic": {"needed": False, "target": None, "reason": "answer_first"},
        "reason_codes": ["direct_concept_request"],
        "learner_context": {"use_relevant_evidence": False, "evidence_refs": [], "connection_basis": "none"},
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

    def test_explicit_diagnostic_request_is_respected_for_a_concept_question(self):
        plan = validate_and_normalize_plan(
            candidate_plan(diagnostic={"needed": False, "target": None, "reason": "answer_first"}),
            text="固有値について理解度を確認して",
            page_context=None,
            learner_evidence=[],
        )
        self.assertTrue(plan["diagnostic"]["needed"])
        self.assertIn("explicit_diagnostic_request", plan["reason_codes"])

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
                self.assertEqual(session._last_planner_record["mode_requested"], "planner")
                self.assertEqual(session._last_planner_record["mode_effective"], "fallback")
                self.assertTrue(session._last_planner_record["planner_called"])

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
        evidence = [{
            "ref": "exercise:12:89", "source": "exercise", "result": "incorrect",
            "relation_to_query": "direct_concept", "recent_outcomes": ["incorrect"],
        }]
        plan = validate_and_normalize_plan(
            candidate_plan(learner_context={
                "use_relevant_evidence": True,
                "evidence_refs": ["exercise:12:89", "exercise:999:999"],
                "connection_basis": "observed_evidence",
            }),
            text="固有値って何？",
            page_context=None,
            learner_evidence=evidence,
        )
        self.assertEqual(plan["learner_context"]["evidence_refs"], ["exercise:12:89"])
        self.assertTrue(plan["learner_context"]["use_relevant_evidence"])
        self.assertEqual(plan["learner_context"]["connection_basis"], "observed_evidence")

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
        # 定型文ではなく、検索なしで LLM（generate_answer）が答える
        self.assertEqual(turn["reply"], "自然な応答")
        self.assertEqual(turn["turn_class"], "meta")

    def test_off_topic_plan_is_trusted_not_forced_into_retrieval(self):
        # LLM が「数学の学習説明は不要」と判断した発話（英語の挨拶でも）は、ルールで検索や診断を強制しない
        plan = validate_and_normalize_plan(
            candidate_plan(
                math_related=False, intent=["social"], action="answer", source_scope="rag",
                pedagogical_move="guided_question", target_concepts=[],
                diagnostic={"needed": True, "target": None, "reason": "x"},
                reason_codes=["social_turn"], retrieval={"queries": ["hello"], "prerequisite_concepts": []},
            ),
            text="hello", page_context=None, learner_evidence=[],
        )
        self.assertEqual(plan["source_scope"], "no_retrieval")
        self.assertEqual(plan["action"], "answer")
        self.assertFalse(plan["diagnostic"]["needed"])
        self.assertEqual(plan["retrieval"]["queries"], [])
        self.assertEqual(plan["pedagogical_move"], "guided_question")

    def test_math_related_plan_still_forces_retrieval_and_rejects_social_response(self):
        # 数学の学習説明が必要なら、従来どおりサーバー側のルールを適用する
        plan = validate_and_normalize_plan(
            candidate_plan(math_related=True, action="social_response", source_scope="no_retrieval"),
            text="固有値って何？", page_context=None, learner_evidence=[],
        )
        self.assertEqual(plan["action"], "answer")
        self.assertEqual(plan["source_scope"], "rag")

    def test_off_topic_question_is_answered_without_retrieval_and_marked_extra(self):
        searcher = _FakeSearcher()
        session = _make_session(searcher)
        off_topic = candidate_plan(
            math_related=False, intent=["other"], action="answer", source_scope="no_retrieval",
            pedagogical_move="direct_explanation", target_concepts=[], reason_codes=["unrelated_new_topic"],
            retrieval={"queries": [], "prerequisite_concepts": []},
        )
        session._make_pedagogical_plan = lambda text: validate_and_normalize_plan(
            off_topic, text=text, page_context=None, learner_evidence=[]
        )
        turn = session.handle_turn("このシステムの使い方を教えて")
        self.assertEqual(searcher.search_calls, [])
        self.assertEqual(turn["reply"], "自然な応答")
        self.assertEqual(turn["knowledge_mode"], "extra")
        self.assertEqual(turn["banner"], "")

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
        plan = candidate_plan(learner_context={
            "use_relevant_evidence": True,
            "evidence_refs": [evidence["ref"]],
            "connection_basis": "observed_evidence",
        })
        def make_plan(text):
            session._planner_evidence = [evidence]
            return plan

        session._make_pedagogical_plan = make_plan
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

    def test_relevant_evidence_beats_more_recent_irrelevant_evidence(self):
        searcher = _FakeSearcher()
        selected = select_relevant_learner_evidence(
            [
                {"ref": "exercise:1:1", "item_title": "微分係数", "topic_tags": ["微分"], "result": "correct"},
                {"ref": "exercise:2:2", "item_title": "固有値の基礎", "topic_tags": ["線形代数"], "result": "incorrect"},
            ],
            query="固有値とは？",
            page_context=None,
            searcher=searcher,
        )
        self.assertEqual([item["ref"] for item in selected["selected"]], ["exercise:2:2"])
        self.assertEqual(selected["selected"][0]["relation_to_query"], "direct_concept")
        self.assertEqual(selected["rejected_count"], 1)

    def test_kg_prerequisite_evidence_is_selected_but_unrelated_history_is_dropped(self):
        searcher = _FakeSearcher()
        searcher.entities = {"eigen": {"title": "固有値", "section": "固有値"}}
        searcher.graph = SimpleNamespace(
            nodes={"eigen": {"title": "固有値", "section": "固有値"}},
            get_dependencies=lambda *args, **kwargs: [
                {"title": "線形変換", "section": "線形変換"}
            ],
        )
        selected = select_relevant_learner_evidence(
            [
                {"ref": "exercise:3:3", "item_title": "線形変換の基礎", "topic_tags": [], "result": "correct"},
                {"ref": "exercise:4:4", "item_title": "微分の計算", "topic_tags": [], "result": "incorrect"},
            ],
            query="固有値って何？",
            page_context=None,
            searcher=searcher,
        )
        self.assertEqual([item["ref"] for item in selected["selected"]], ["exercise:3:3"])
        self.assertEqual(selected["selected"][0]["relation_to_query"], "prerequisite_concept")

    def test_no_relevant_evidence_means_no_personalization_evidence(self):
        selected = select_relevant_learner_evidence(
            [{"ref": "exercise:9:9", "item_title": "微分", "topic_tags": ["微分"], "result": "correct"}],
            query="固有値とは？",
            page_context=None,
            searcher=_FakeSearcher(),
        )
        self.assertEqual(selected["selected"], [])

    def test_unrelated_new_topic_does_not_select_evidence_from_open_page(self):
        selected = select_relevant_learner_evidence(
            [{"ref": "exercise:8:8", "item_title": "固有値の計算", "topic_tags": ["固有値"], "result": "correct"}],
            query="別件だけど微分を説明して",
            page_context={"title": "固有値", "section": "固有値"},
            searcher=_FakeSearcher(),
        )
        self.assertEqual(selected["selected"], [])

    def test_repeated_prerequisite_failures_change_move_and_support_from_observed_evidence(self):
        evidence = [{
            "ref": "exercise:20:20", "item_title": "線形変換の基礎", "topic_tags": ["線形変換"],
            "result": "incorrect", "recent_outcomes": ["incorrect", "incorrect"],
            "relation_to_query": "prerequisite_concept",
        }]
        plan = validate_and_normalize_plan(
            candidate_plan(
                pedagogical_move="explain_then_example",
                support_level="standard",
                learner_context={"use_relevant_evidence": False, "evidence_refs": [], "connection_basis": "none"},
            ),
            text="固有値って何？",
            page_context=None,
            learner_evidence=evidence,
        )
        self.assertEqual(plan["pedagogical_move"], "prerequisite_repair")
        self.assertEqual(plan["support_level"], "high")
        self.assertEqual(plan["learner_context"]["evidence_refs"], ["exercise:20:20"])
        self.assertIn("relevant_prerequisite_failures", plan["reason_codes"])

    def test_prerequisite_success_prevents_unnecessary_high_level_repair(self):
        evidence = [{
            "ref": "exercise:21:21", "item_title": "線形変換の基礎", "topic_tags": ["線形変換"],
            "result": "correct", "recent_outcomes": ["correct", "correct"],
            "relation_to_query": "prerequisite_concept",
        }]
        plan = validate_and_normalize_plan(
            candidate_plan(pedagogical_move="prerequisite_repair", support_level="high"),
            text="固有値って何？",
            page_context=None,
            learner_evidence=evidence,
        )
        self.assertNotEqual(plan["pedagogical_move"], "prerequisite_repair")
        self.assertNotEqual(plan["support_level"], "high")
        self.assertIn("relevant_prerequisite_success", plan["reason_codes"])

    def test_prerequisite_failures_take_priority_over_direct_success_for_next_step(self):
        evidence = [
            {"ref": "exercise:31:31", "item_title": "線形変換", "topic_tags": [],
             "result": "incorrect", "recent_outcomes": ["incorrect", "incorrect"],
             "relation_to_query": "prerequisite_concept"},
            {"ref": "exercise:32:32", "item_title": "固有値問題", "topic_tags": [],
             "result": "correct", "recent_outcomes": ["correct", "correct"],
             "relation_to_query": "direct_concept"},
        ]
        plan = validate_and_normalize_plan(
            candidate_plan(intent=["problem_solving"], pedagogical_move="guided_question", support_level="minimal"),
            text="この固有値問題、次にどうすればいい？",
            page_context=None,
            learner_evidence=evidence,
        )
        self.assertEqual(plan["pedagogical_move"], "prerequisite_repair")
        self.assertEqual(plan["support_level"], "high")

    def test_baseline_uses_legacy_route_without_calling_planner(self):
        searcher = _FakeSearcher()
        session = TutorSession(
            searcher=searcher,
            cfg={"tutor": {"pedagogical_planner": {"mode": "baseline"}}},
        )
        with patch.object(tutor_session_module, "_chat_json", side_effect=AssertionError("planner called")):
            turn = session.handle_turn("おはよう")
        self.assertEqual(turn["planner"]["mode_requested"], "baseline")
        self.assertEqual(turn["planner"]["mode_effective"], "baseline")
        self.assertFalse(turn["planner"]["planner_called"])
        # The comparator deliberately preserves the old short-input diagnostic rule.
        self.assertIsNotNone(turn["diagnosis"])

    def test_planner_invalid_mode_is_not_misreported_as_baseline(self):
        session = _make_session(_FakeSearcher())
        session.client = SimpleNamespace(with_options=lambda **kwargs: SimpleNamespace())
        with patch.object(tutor_session_module, "_chat_json", side_effect=ValueError("bad schema")):
            turn = session.handle_turn("固有値って何？")
        self.assertEqual(turn["planner"]["mode_requested"], "planner")
        self.assertEqual(turn["planner"]["mode_effective"], "fallback")

    def test_planner_kill_switch_fallback_is_not_logged_as_baseline(self):
        session = TutorSession(
            searcher=_FakeSearcher(),
            cfg={"tutor": {"pedagogical_planner": {"mode": "planner", "enabled": False}}},
        )
        with patch.object(tutor_session_module, "_chat_json", side_effect=AssertionError("planner should be disabled")):
            turn = session.handle_turn("固有値とは何？")
        self.assertEqual(turn["planner"]["mode_requested"], "planner")
        self.assertEqual(turn["planner"]["mode_effective"], "fallback")
        self.assertFalse(turn["planner"]["planner_called"])


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
        cfg={"tutor": {"pedagogical_planner": {"mode": "planner", "enabled": True}}},
    )


if __name__ == "__main__":
    unittest.main()
