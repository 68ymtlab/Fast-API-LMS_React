# Pedagogical Planner counterfactual evaluation

Dataset: `planner_counterfactual_v1`
Model: `Qwen/Qwen3.8-27B-FP8`
Prompt/schema: `pedagogical_planner_prompt_v2` / `2`
Scope: planner_decisions_with_stubbed_retrieval_and_answer_generation

Baseline: pre-Planner adaptive_v1 classify/state-machine/_should_diagnose_legacy/retrieval-answer path; no planner LLM call

Retrieval and answer generation are deterministic stubs. This report evaluates planning/evidence policy, not factual answer quality or production RAG retrieval.

## baseline

Cases: 18
- diagnostic_expectation_accuracy: passed 2/18 (rate 0.1111)
- page_grounding_rate: passed 0/3 (rate 0.0)
- page_counterfactual_accuracy: passed 0/3 (rate 0.0)
- no_stale_page_rate: passed 3/3 (rate 1.0)
- diagnostic_rate: 0.9444
- retrieval_usage_rate: 0.0556
- fallback_rate: 0.0
- LLM planner calls: 0; token usage: unavailable
- latency ms: {'mean': 0.0, 'p50': 0.0, 'p95': 0.0, 'planner_mean': None, 'planner_p95': None}

## planner

Cases: 18
- evidence_utilization_rate: passed 7/7 (rate 1.0)
- irrelevant_evidence_rejection_rate: passed 1/1 (rate 1.0)
- pedagogical_adaptation_rate: passed 4/4 (rate 1.0)
- counterfactual_pair_adaptation: passed 3/3 (rate 1.0)
- unsupported_personalization_rate: violations 0/11 (rate 0.0)
- diagnostic_expectation_accuracy: passed 18/18 (rate 1.0)
- page_grounding_rate: passed 3/3 (rate 1.0)
- page_counterfactual_accuracy: passed 3/3 (rate 1.0)
- no_stale_page_rate: passed 3/3 (rate 1.0)
- diagnostic_rate: 0.0556
- retrieval_usage_rate: 0.8889
- fallback_rate: 0.0
- LLM planner calls: 20; token usage: unavailable
- latency ms: {'mean': 5697.17, 'p50': 4981.0, 'p95': 15294.0, 'planner_mean': 5126.9, 'planner_p95': 6369.0}
