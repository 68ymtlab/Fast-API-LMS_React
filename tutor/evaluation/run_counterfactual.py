#!/usr/bin/env python3
"""Run the synthetic decision-level counterfactual suite against TutorSession.

Planner mode uses the configured planner LLM. Retrieval and answer generation
are deterministic stubs so this suite isolates planner/evidence policy; it is
not an evaluation of answer quality or production RAG ranking.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TUTOR_ROOT = Path(__file__).resolve().parents[1]
ROOT = TUTOR_ROOT.parent if TUTOR_ROOT.name == "tutor" else TUTOR_ROOT
CORE = TUTOR_ROOT / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

import tutor_session as tutor_session_module  # noqa: E402
from deeprag_search import LLM_MODEL  # noqa: E402
from pedagogical_planner import PLANNER_PROMPT_VERSION, PLANNER_SCHEMA_VERSION  # noqa: E402
from tutor_session import TutorSession  # noqa: E402

DATASET_VERSION = "planner_counterfactual_v1"
DATASET_PATH = Path(__file__).with_name("counterfactual_cases.jsonl")


class _EvaluationGraph:
    nodes = {
        "eigenvalue": {"title": "固有値", "section": "固有値"},
        "linear_transform": {"title": "線形変換", "section": "線形変換"},
        "determinant": {"title": "行列式", "section": "行列式"},
        "matrix": {"title": "行列", "section": "行列"},
    }
    _dependencies = {
        "eigenvalue": [
            {"entity_id": "linear_transform", "title": "線形変換", "section": "線形変換"},
            {"entity_id": "determinant", "title": "行列式", "section": "行列式"},
        ],
        "determinant": [{"entity_id": "matrix", "title": "行列", "section": "行列"}],
    }

    def get_dependencies(self, entity_id, max_depth=1, include_cross=False):
        return list(self._dependencies.get(entity_id, []))


class _EvaluationSearcher:
    """Capture retrieval inputs and return deterministic, non-factual test output."""
    pipeline = "evaluation_stub"
    entities = {
        entity_id: dict(node)
        for entity_id, node in _EvaluationGraph.nodes.items()
    }

    def __init__(self):
        self.graph = _EvaluationGraph()
        self.search_calls: list[dict[str, Any]] = []

    def search(self, query, **kwargs):
        self.search_calls.append({"query": query, **kwargs})
        page = kwargs.get("page_context")
        citations = []
        results = []
        if page and page.get("lesson_page_id") and page.get("text"):
            citations.append({
                "section": page.get("title") or "active page",
                "type": "active_page",
                "entity_id": f"lesson_page:{page['lesson_page_id']}",
                "excerpt": str(page.get("text") or "")[:120],
            })
            results.append({"entity_id": f"lesson_page:{page['lesson_page_id']}", "section": page.get("title", "")})
        return {
            "answer": "[evaluation stub] planner/retrieval input captured",
            "answer_body": "[evaluation stub] planner/retrieval input captured",
            "banner": "",
            "citations": citations,
            "results": results,
            "metadata": {"retrieval_path": "evaluation_stub"},
            "knowledge_mode": "textbook",
            "context": "[evaluation stub] no textbook facts are supplied",
        }

    def generate_answer(self, query, context, **kwargs):
        return "[evaluation stub] answer generation omitted"


class _NoCallClient:
    def __init__(self, *args, **kwargs):
        pass


def load_dataset(path: Path = DATASET_PATH) -> list[dict[str, Any]]:
    cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not cases or any(case.get("dataset_version") != DATASET_VERSION for case in cases):
        raise ValueError(f"dataset version mismatch or empty dataset: {path}")
    return cases


def _safe_session(mode: str, searcher: _EvaluationSearcher) -> TutorSession:
    config = {"tutor": {"mode": "adaptive_v1", "show_citations": True,
                        "pedagogical_planner": {"mode": mode, "enabled": mode == "planner",
                                                "timeout_seconds": 24, "max_tokens": 800}}}
    original = tutor_session_module.OpenAI
    if mode == "baseline":
        tutor_session_module.OpenAI = _NoCallClient
    try:
        return TutorSession(searcher=searcher, cfg=config)
    finally:
        tutor_session_module.OpenAI = original


def _page_context(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not value:
        return None
    return {
        "lesson_page_id": value.get("lesson_page_id"),
        "course_id": value.get("course_id"),
        "title": value.get("title") or "",
        "section": value.get("section") or "",
        "text": value.get("text") or "",
    }


def run_case(case: dict[str, Any], mode: str) -> dict[str, Any]:
    searcher = _EvaluationSearcher()
    session = _safe_session(mode, searcher)
    turns = case.get("turns") or [{
        "text": case.get("text", ""),
        "page_context": case.get("page_context"),
        "learner_evidence": case.get("learner_evidence", []),
    }]
    observations: list[dict[str, Any]] = []
    started_case = time.monotonic()
    for fixture_turn in turns:
        session.page_context = _page_context(fixture_turn.get("page_context"))
        session.learner_evidence = list(fixture_turn.get("learner_evidence", case.get("learner_evidence", [])))
        call_count_before = len(searcher.search_calls)
        started_turn = time.monotonic()
        turn = session.handle_turn(str(fixture_turn.get("text") or ""))
        duration_ms = round((time.monotonic() - started_turn) * 1000)
        planner = turn.get("planner") or {}
        observations.append({
            "text": fixture_turn.get("text", ""),
            "page_id_sent": (session.page_context or {}).get("lesson_page_id"),
            "page_ids_passed_to_retrieval": [
                (call.get("page_context") or {}).get("lesson_page_id")
                for call in searcher.search_calls[call_count_before:]
                if call.get("page_context")
            ],
            "citations": turn.get("citations") or [],
            "diagnostic": bool(turn.get("diagnosis")),
            "retrieval_calls": len(searcher.search_calls) - call_count_before,
            "retrieval_query": (searcher.search_calls[-1].get("query") if len(searcher.search_calls) > call_count_before else None),
            "mode_requested": planner.get("mode_requested"),
            "mode_effective": planner.get("mode_effective"),
            "planner": planner,
            "turn_class": turn.get("turn_class"),
            "latency_ms": duration_ms,
        })
        session.learner_evidence = []

    final = observations[-1]
    plan = (final.get("planner") or {}).get("plan") or {}
    used_refs = list((plan.get("learner_context") or {}).get("evidence_refs") or [])
    citations = final.get("citations") or []
    active_page_citations = [item for item in citations if item.get("type") == "active_page"]
    expected = case.get("expected") or {}
    checks: dict[str, bool | None] = {}
    if "diagnostic" in expected:
        checks["diagnostic"] = final["diagnostic"] == expected["diagnostic"]
    if "page_relation" in expected:
        checks["page_relation"] = plan.get("page_relation") == expected["page_relation"] if plan else None
    if "source_scope" in expected:
        checks["source_scope"] = plan.get("source_scope") == expected["source_scope"] if plan else None
    if expected.get("selected_refs"):
        checks["evidence_utilization"] = set(expected["selected_refs"]).issubset(used_refs)
    if expected.get("reject_refs"):
        checks["irrelevant_evidence_rejection"] = not bool(set(expected["reject_refs"]) & set(used_refs))
    if expected.get("pedagogical_move"):
        checks["pedagogical_move"] = plan.get("pedagogical_move") == expected["pedagogical_move"] if plan else None
    if expected.get("move_not_any"):
        checks["move_not_any"] = plan.get("pedagogical_move") not in expected["move_not_any"] if plan else None
    if expected.get("support_level"):
        checks["support_level"] = plan.get("support_level") == expected["support_level"] if plan else None
    if expected.get("support_not"):
        checks["support_not"] = plan.get("support_level") != expected["support_not"] if plan else None
    if expected.get("requires_page_grounding"):
        checks["page_grounding"] = bool(active_page_citations)
    if expected.get("retrieval_expected") is not None:
        checks["retrieval_usage"] = (sum(turn["retrieval_calls"] for turn in observations) > 0) == expected["retrieval_expected"]
    if expected.get("no_page_expected"):
        checks["no_stale_page"] = (
            not final["page_ids_passed_to_retrieval"]
            and not active_page_citations
            and (not plan or plan.get("page_relation") == "no_open_page")
        )
    if expected.get("adaptation_expected"):
        adaptation_checks = [
            checks[key]
            for key in (
                "evidence_utilization", "pedagogical_move", "move_not_any",
                "support_level", "support_not",
            )
            if key in checks
        ]
        checks["adaptation"] = bool(adaptation_checks) and all(value is True for value in adaptation_checks)

    planner_records = [turn.get("planner") or {} for turn in observations]
    return {
        "case_id": case["id"],
        "category": case.get("category"),
        "counterfactual_group": case.get("group"),
        "counterfactual_role": case.get("role"),
        "mode": mode,
        "mode_requested": final.get("mode_requested"),
        "mode_effective": final.get("mode_effective"),
        "expected": expected,
        "checks": checks,
        "plan": plan or None,
        "selected_evidence_refs": used_refs,
        "evidence_selection": (final.get("planner") or {}).get("evidence_selection"),
        "reason_codes": plan.get("reason_codes", []),
        "diagnostic": final["diagnostic"],
        "retrieval_used": sum(turn["retrieval_calls"] for turn in observations) > 0,
        "page_grounding": bool(active_page_citations),
        "page_ids_passed_to_retrieval": final["page_ids_passed_to_retrieval"],
        "fallback": any(record.get("mode_effective") == "fallback" for record in planner_records),
        "planner_calls": sum(bool(record.get("planner_called")) for record in planner_records),
        "planner_latency_ms": [record.get("latency_ms", 0) for record in planner_records],
        "total_latency_ms": round((time.monotonic() - started_case) * 1000),
        "token_usage": None,
        "turns": observations,
    }


def _rate(passed: int, total: int) -> dict[str, Any]:
    return {"passed": passed, "total": total, "rate": round(passed / total, 4) if total else None}


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def summarize_results(cases: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    planner_mode = mode == "planner"
    evidence_expected = [case for case in cases if case["expected"].get("selected_refs")]
    evidence_used = sum(bool(case["checks"].get("evidence_utilization")) for case in evidence_expected)
    irrelevant_cases = [case for case in cases if case["expected"].get("reject_refs")]
    irrelevant_rejected = sum(bool(case["checks"].get("irrelevant_evidence_rejection")) for case in irrelevant_cases)
    adaptation_cases = [case for case in cases if case["expected"].get("adaptation_expected")]
    adapted = sum(case["checks"].get("adaptation") is True for case in adaptation_cases)
    unsupported_cases = [case for case in cases if not case["expected"].get("personalization_expected", False)]
    evidence_reason_codes = {
        "relevant_observed_evidence", "relevant_prerequisite_success", "relevant_prerequisite_failures",
        "repeated_task_success", "repeated_task_failures",
    }
    unsupported = sum(
        bool(case["selected_evidence_refs"])
        or bool(set(case["reason_codes"]) & evidence_reason_codes)
        for case in unsupported_cases
    )
    diagnostics = sum(bool(case["diagnostic"]) for case in cases)
    page_cases = [case for case in cases if case["expected"].get("requires_page_grounding")]
    page_grounded = sum(bool(case["checks"].get("page_grounding")) for case in page_cases)
    stale_cases = [case for case in cases if case["expected"].get("no_page_expected")]
    stale_free = sum(bool(case["checks"].get("no_stale_page")) for case in stale_cases)
    page_counterfactual_cases = [case for case in cases if case.get("counterfactual_group") == "page_counterfactual"]
    page_counterfactual_passed = sum(
        case["checks"].get("page_relation") is True
        and case["checks"].get("source_scope") is True
        and (not case["expected"].get("requires_page_grounding") or case["checks"].get("page_grounding") is True)
        and (not case["expected"].get("no_page_expected") or case["checks"].get("no_stale_page") is True)
        for case in page_counterfactual_cases
    )
    expected_diagnostics = [case for case in cases if "diagnostic" in case["expected"]]
    diagnostic_correct = sum(bool(case["checks"].get("diagnostic")) for case in expected_diagnostics)
    latencies = [float(case["total_latency_ms"]) for case in cases]
    planner_latencies = [
        float(latency)
        for case in cases
        for latency in case["planner_latency_ms"]
        if latency is not None and case["mode_effective"] == "planner"
    ]
    group_roles: dict[str, dict[str, dict[str, Any]]] = {}
    for case in cases:
        if case.get("counterfactual_group") and case.get("counterfactual_role"):
            group_roles.setdefault(case["counterfactual_group"], {})[case["counterfactual_role"]] = case
    pair_checks = []
    if planner_mode:
        for group, roles in group_roles.items():
            success = roles.get("prerequisite_success") or roles.get("direct_success")
            failure = roles.get("prerequisite_failure")
            if success and failure:
                success_plan = success.get("plan") or {}
                failure_plan = failure.get("plan") or {}
                signature_differs = any(
                    success_plan.get(field) != failure_plan.get(field)
                    for field in ("pedagogical_move", "support_level", "retrieval")
                )
                desired_failure_support = (
                    failure_plan.get("support_level") == "high"
                    and failure_plan.get("pedagogical_move") == "prerequisite_repair"
                )
                success_not_overhelped = (
                    success_plan.get("support_level") != "high"
                    and success_plan.get("pedagogical_move") != "prerequisite_repair"
                )
                pair_checks.append({
                    "group": group,
                    "meaningful_difference": signature_differs,
                    "failure_direction": desired_failure_support,
                    "success_not_overhelped": success_not_overhelped,
                    "passed": signature_differs and desired_failure_support and success_not_overhelped,
                })
            direct_success = roles.get("direct_success")
            no_history = roles.get("no_history")
            if direct_success and no_history and group == "eigenvalue_next_step":
                success_plan = direct_success.get("plan") or {}
                pair_checks.append({
                    "group": group,
                    "meaningful_difference": success_plan.get("pedagogical_move") == "guided_question"
                    and success_plan.get("support_level") == "minimal",
                    "failure_direction": None,
                    "success_not_overhelped": None,
                    "passed": success_plan.get("pedagogical_move") == "guided_question"
                    and success_plan.get("support_level") == "minimal",
                })
    return {
        "case_count": len(cases),
        "evidence_utilization_rate": _rate(evidence_used, len(evidence_expected)) if planner_mode else None,
        "irrelevant_evidence_rejection_rate": _rate(irrelevant_rejected, len(irrelevant_cases)) if planner_mode else None,
        "pedagogical_adaptation_rate": _rate(adapted, len(adaptation_cases)) if planner_mode else None,
        "counterfactual_pair_adaptation": _rate(sum(pair["passed"] for pair in pair_checks), len(pair_checks)) if planner_mode else None,
        "counterfactual_pair_details": pair_checks,
        "unsupported_personalization_rate": {
            "violations": unsupported,
            "total": len(unsupported_cases),
            "rate": round(unsupported / len(unsupported_cases), 4) if unsupported_cases else None,
        } if planner_mode else None,
        "diagnostic_rate": round(diagnostics / len(cases), 4) if cases else None,
        "diagnostic_expectation_accuracy": _rate(diagnostic_correct, len(expected_diagnostics)),
        "page_grounding_rate": _rate(page_grounded, len(page_cases)),
        "page_counterfactual_accuracy": _rate(page_counterfactual_passed, len(page_counterfactual_cases)),
        "no_stale_page_rate": _rate(stale_free, len(stale_cases)),
        "retrieval_usage_rate": round(sum(case["retrieval_used"] for case in cases) / len(cases), 4) if cases else None,
        "fallback_rate": round(sum(case["fallback"] for case in cases) / len(cases), 4) if cases else None,
        "latency_ms": {
            "mean": round(statistics.mean(latencies), 2) if latencies else None,
            "p50": _percentile(latencies, 0.50),
            "p95": _percentile(latencies, 0.95),
            "planner_mean": round(statistics.mean(planner_latencies), 2) if planner_latencies else None,
            "planner_p95": _percentile(planner_latencies, 0.95),
        },
        "llm_calls": sum(case["planner_calls"] for case in cases),
        "token_usage": None,
    }


def run_evaluation(
    cases: list[dict[str, Any]], modes: list[str], dataset_path: Path = DATASET_PATH
) -> dict[str, Any]:
    output_modes: dict[str, Any] = {}
    for mode in modes:
        rows = []
        for index, case in enumerate(cases, 1):
            print(f"[{mode}] {index}/{len(cases)} {case['id']}", flush=True)
            rows.append(run_case(case, mode))
        output_modes[mode] = {"summary": summarize_results(rows, mode), "cases": rows}
    now = datetime.now(timezone.utc).isoformat()
    return {
        "metadata": {
            "timestamp_utc": now,
            "model": LLM_MODEL if "planner" in modes else None,
            "model_version": None,
            "temperature": 0.1 if "planner" in modes else None,
            "planner_prompt_version": PLANNER_PROMPT_VERSION if "planner" in modes else None,
            "planner_schema_version": PLANNER_SCHEMA_VERSION if "planner" in modes else None,
            "dataset_version": DATASET_VERSION,
            "dataset_path": str(dataset_path),
            "dataset_sha256": hashlib.sha256(dataset_path.read_bytes()).hexdigest(),
            "baseline_definition": "pre-Planner adaptive_v1 classify/state-machine/_should_diagnose_legacy/retrieval-answer path; no planner LLM call",
            "evaluation_scope": "planner_decisions_with_stubbed_retrieval_and_answer_generation",
            "token_usage_available": False,
        },
        "modes": output_modes,
    }


def _markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Pedagogical Planner counterfactual evaluation",
        "",
        f"Dataset: `{report['metadata']['dataset_version']}`",
        f"Model: `{report['metadata']['model']}`",
        f"Prompt/schema: `{report['metadata']['planner_prompt_version']}` / `{report['metadata']['planner_schema_version']}`",
        f"Scope: {report['metadata']['evaluation_scope']}",
        "",
        f"Baseline: {report['metadata']['baseline_definition']}",
        "",
        "Retrieval and answer generation are deterministic stubs. This report evaluates planning/evidence policy, not factual answer quality or production RAG retrieval.",
        "",
    ]
    for mode, data in report["modes"].items():
        summary = data["summary"]
        lines.extend([f"## {mode}", "", f"Cases: {summary['case_count']}"])
        for key in (
            "evidence_utilization_rate", "irrelevant_evidence_rejection_rate",
            "pedagogical_adaptation_rate", "counterfactual_pair_adaptation",
            "unsupported_personalization_rate", "diagnostic_expectation_accuracy",
            "page_grounding_rate", "page_counterfactual_accuracy", "no_stale_page_rate",
        ):
            value = summary.get(key)
            if isinstance(value, dict):
                count = value.get("violations", value.get("passed"))
                label = "violations" if "violations" in value else "passed"
                lines.append(f"- {key}: {label} {count}/{value['total']} (rate {value['rate']})")
            elif value is not None:
                lines.append(f"- {key}: {value}")
        lines.append(f"- diagnostic_rate: {summary['diagnostic_rate']}")
        lines.append(f"- retrieval_usage_rate: {summary['retrieval_usage_rate']}")
        lines.append(f"- fallback_rate: {summary['fallback_rate']}")
        lines.append(f"- LLM planner calls: {summary['llm_calls']}; token usage: unavailable")
        lines.append(f"- latency ms: {summary['latency_ms']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("planner", "baseline", "both"), default="both")
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "artifacts" / "evaluation")
    args = parser.parse_args()
    cases = load_dataset(args.dataset)
    modes = ["baseline", "planner"] if args.mode == "both" else [args.mode]
    report = run_evaluation(cases, modes, args.dataset)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = args.output_dir / f"pedagogical_planner_{stamp}.json"
    markdown_path = args.output_dir / f"pedagogical_planner_{stamp}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(_markdown_report(report), encoding="utf-8")
    print(f"JSON: {json_path}")
    print(f"Summary: {markdown_path}")


if __name__ == "__main__":
    main()
