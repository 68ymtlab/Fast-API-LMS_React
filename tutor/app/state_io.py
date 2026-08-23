"""SessionState のスナップショット ⇄ 復元。

KG（埋め込み・知識グラフ）は再構築され得るので、復元時は KG に依存する値と依存しない値を分ける。
  - KG 非依存（常に復元）: learner_state / known_topics / topic_level_log / dialogue / focus_concept / focus_section
  - KG 依存（同じ kb_version のときだけ復元）: focus_entity_id / last_results / last_context / last_citations /
    prerequisite_candidates / topic_stats（entity_id を含む）
"""
from __future__ import annotations

from dataclasses import fields
from typing import Any

from tutor_session import LearnerState, SessionState, TopicStat

KG_DEPENDENT = {
    "focus_entity_id", "last_results", "last_context", "last_citations",
    "prerequisite_candidates", "topic_stats",
}
# 会話をまたいで持ち越すもの（新しい会話の種にする最小集合）
CARRY_OVER = {"learner_state", "known_topics", "topic_level_log"}
# 途中状態（待ち受け）は、同じ会話の継続でなければ捨てる
TRANSIENT = {
    "phase", "pending_query", "diagnosis_choices", "diagnosis_prompt", "pending_clarify",
    "current_probe", "current_expected_points", "probe_attempts", "hints_given", "hint_level",
}


def restore_state(snapshot: dict[str, Any] | None, *, same_kb: bool, continue_conversation: bool) -> SessionState:
    """スナップショット dict から SessionState を組み立てる。

    continue_conversation=False のときは CARRY_OVER と focus_concept/focus_section だけを引き継ぐ（新しい会話の種）。
    """
    st = SessionState()
    if not snapshot:
        return st
    allowed = {f.name for f in fields(SessionState)}
    for key, val in snapshot.items():
        if key not in allowed:
            continue
        if key in KG_DEPENDENT and not same_kb:
            continue
        if not continue_conversation and key not in CARRY_OVER and key not in ("focus_concept", "focus_section"):
            continue
        if key == "learner_state" and isinstance(val, dict):
            ls = LearnerState()
            for k, v in val.items():
                if hasattr(ls, k):
                    setattr(ls, k, v)
            st.learner_state = ls
        elif key == "topic_stats" and isinstance(val, dict):
            st.topic_stats = {k: TopicStat(**{kk: vv for kk, vv in v.items() if kk in TopicStat.__dataclass_fields__})
                              for k, v in val.items() if isinstance(v, dict)}
        else:
            setattr(st, key, val)
    if not continue_conversation:
        # 新しい会話: 待ち受け状態は持ち越さない。focus は挨拶用に残すが混乱カウンタ等はリセット
        st.phase = "idle"
        st.confusion_streak = 0
        st.pending_clarify = None
        st.dialogue = []
    elif not same_kb:
        # 同じ会話の継続だが KG が変わった: 待ち受け中の診断/clarify は KG 由来の選択肢を含み得るので解除
        if st.phase in ("awaiting_diagnosis", "awaiting_clarify"):
            st.phase = "idle"
            st.pending_clarify = None
            st.diagnosis_choices = []
    return st
