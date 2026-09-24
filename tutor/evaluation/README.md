# Tutor planner evaluation

`counterfactual_cases.jsonl` contains fixed synthetic queries and learner-evidence variants. Each case runs in a fresh `TutorSession`; page-switch cases intentionally share one session across their listed turns.

Run the deterministic baseline and the configured Planner with the same fixtures:

```sh
mkdir -p artifacts/evaluation
docker compose run --rm --no-deps -T \
  -v ./tutor/core:/app/core:ro \
  -v ./tutor/evaluation:/app/evaluation:ro \
  -v ./artifacts/evaluation:/output \
  tutor python /app/evaluation/run_counterfactual.py \
  --mode both --output-dir /output
```

`--mode baseline` runs the pre-Planner `adaptive_v1` classification, state-machine, diagnosis, and retrieval path without calling the Planner. `--mode planner` calls the configured planning model. A Planner failure is reported as `mode_effective=fallback`, never as baseline.

This suite evaluates planning and evidence policy. Retrieval and answer generation are deterministic stubs; it does not score factual answer quality or production RAG ranking. The report records the model identifier, temperature, prompt/schema/dataset versions, dataset SHA-256, latency, Planner call count, and fallback rate. The serving client currently does not expose token usage, so that field is explicitly null.

Key metrics:

- Evidence utilization: expected relevant evidence refs appear in the normalized plan.
- Irrelevant evidence rejection: irrelevant-only history is not used as learner evidence.
- Pedagogical adaptation: evidence-sensitive fixtures satisfy expected move/support behavior, not merely a different evidence ref.
- Unsupported personalization: no observed-evidence refs or evidence reason codes appear where personalization is not justified.
- Page grounding / page counterfactual accuracy / stale-page rate: current page is cited when relevant, page A/B change the plan for the same utterance, and a closed page is not reused.

The checked-in timestamped report is a synthetic benchmark run; it contains no production learner records.
