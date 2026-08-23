"""振り返り（深い版）: 会話ログ・学習者状態・解答結果・KG（前提／発展）を材料に、LLM で構造化した振り返りを作る。

出力は JSON（response_format で拘束）→ Markdown に整形。LLM が失敗したら研究側のテンプレ（summarize_weak_points）に戻す。
LLM 呼び出しは 1 回。生成はしても「演習問題の生成」はしない（次に学ぶことの提案だけ）。
"""
from __future__ import annotations

import json
from typing import Any

from tutor_session import TutorSession, _chat_json  # noqa: F401  (研究側の JSON 呼び出しヘルパーを流用)

LEVEL_JA = {"none": "はじめて", "heard": "聞いたことがある", "can_compute": "計算できる", "can_prove": "証明・一般化まで", "unknown": "未推定"}
GOAL_JA = {"intuition": "イメージをつかむ", "application": "使い方を知る", "definition": "定義を正確に", "proof": "証明を理解する",
           "generalization": "一般化・条件を知る", "unknown": "未設定"}

SYSTEM = """あなたは線形代数を学ぶ大学生の学習コーチです。与えられた記録（会話・理解度・演習の結果・教科書の依存関係）だけを根拠に、
学生本人に向けた振り返りを JSON で書きます。
ルール:
- 記録にないことは書かない。推測は「〜かもしれません」と書く
- 「何をしたか」は事実を時系列で短く。「できていること」「つまずき」は根拠（何回聞き直したか、演習の正誤、など）を添える
- つまずきが記録に見当たらなければ stuck は「今回は目立ったつまずきはありません」の 1 項目だけにする（無理に探さない）
- 「次に勉強するとよいこと」の topic は教科書の節名か概念名。同じ節を 2 回挙げない
- 「次に勉強するとよいこと」は 2〜3 個。教科書の依存関係（前提／発展）と、間違えた演習を優先。各項目に「なぜ」と「どうやるか（教科書の節・やる順番）」を 1 文ずつ
- 演習問題を自分で作って出さない。解き方を長々と説明しない
- 口調はていねいで前向き。日本語。各文は短く
- JSON 以外は出力しない"""

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "reflection",
        "schema": {
            "type": "object",
            "properties": {
                "did": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 5},
                "understood": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                "stuck": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                "next": {
                    "type": "array", "minItems": 1, "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {"topic": {"type": "string"}, "why": {"type": "string"}, "how": {"type": "string"}},
                        "required": ["topic", "why", "how"],
                    },
                },
                "message": {"type": "string"},
            },
            "required": ["did", "understood", "stuck", "next", "message"],
        },
    },
}


def _kg_neighbors(session: TutorSession, entity_id: str) -> tuple[list[str], list[str]]:
    """焦点エンティティの前提（get_dependencies）と発展（get_dependents）を節名で返す。"""
    if not entity_id:
        return [], []
    g = session.searcher.graph
    def names(items):
        out, seen = [], set()
        for d in items:
            node = g.nodes.get(d.get("entity_id"), {}) or {}
            sec = (node.get("section") or d.get("section") or "").lstrip("# ").strip()
            label = sec  # 節名で集約（同じ節の例・式が何件もあるため）
            if label and label not in seen:
                seen.add(label); out.append(label)
            if len(out) >= 5:
                break
        return out
    try:
        pre = names(g.get_dependencies(entity_id, max_depth=1, include_cross=True))
        post = names(g.get_dependents(entity_id, max_depth=1, include_cross=True))
    except Exception:  # noqa: BLE001
        pre, post = [], []
    return pre, post


SCOPE_LABEL = {"current": "この会話", "previous": "前回の会話", "all": "これまで（期間内）"}


def build_facts(session: TutorSession, *, turns: list[dict[str, Any]], exercise: list[dict[str, Any]], profile: dict[str, Any] | None,
                scope: str = "current", days: int = 30) -> dict[str, Any]:
    st = session.state
    ls = st.learner_state
    questions = [t for t in turns if t.get("role") == "student" and not t.get("choice_id")]
    clarifies = [t for t in turns if t.get("role") == "tutor" and (t.get("clarify") or {}).get("choices")]
    pre, post = _kg_neighbors(session, st.focus_entity_id)
    if scope == "all":
        # 会話をまたぐ: 「会話タイトル（日付）: 質問」の形で時系列に
        asked = []
        for q in questions[-40:]:
            d = q.get("created_at")
            ds = d.strftime("%m/%d") if hasattr(d, "strftime") else ""
            asked.append(f"[{ds} {str(q.get('conversation_title') or '')[:14]}] {str(q.get('text') or '')[:60]}")
        asked_key = f"この{days}日間に聞いたこと（時系列）"
    else:
        asked = [str(q.get("text") or "")[:80] for q in questions][-12:]
        asked_key = "この会話で聞いたこと（時系列）" if scope == "current" else "前回の会話で聞いたこと（時系列）"
    topic_log = (st.topic_level_log or {}) if scope == "current" else ((profile or {}).get("topic_level_log") or st.topic_level_log or {})
    return {
        "振り返りの範囲": SCOPE_LABEL.get(scope, scope) + (f"（直近{days}日）" if scope == "all" else ""),
        "理解度": LEVEL_JA.get(str(ls.understanding_level), str(ls.understanding_level)),
        "目的": GOAL_JA.get(str(ls.goal), str(ls.goal)),
        "焦点概念": st.focus_concept or "",
        "焦点の節": (st.focus_section or "").lstrip("# "),
        asked_key: asked,
        "会話の数（範囲内）": len({t.get("conversation_id") for t in turns}) if scope == "all" else 1,
        "聞き直し・言い直しの回数": sum(1 for t in turns if t.get("turn_class") in ("confused", "clarify_answer")),
        "つまずきの位置特定（clarify）の回数": len(clarifies),
        "トピック別の到達": {
            t: {"レベル": LEVEL_JA.get(str(d.get("level")), str(d.get("level"))), "やりとり": d.get("turns", 0), "混乱": d.get("confused", 0)}
            for t, d in list(topic_log.items())[-10:]
        },
        "既知のトピック": list(st.known_topics or [])[-10:],
        "演習の結果（最近）": exercise[:10],
        "教科書の前提（この概念の前に要るもの）": pre,
        "教科書の発展（この概念の次に学ぶもの）": post,
        "これまでの利用": {"会話数": (profile or {}).get("conversation_count"), "発話数": (profile or {}).get("turn_count")} if profile else {},
    }


DID_HEADING = {"current": "この会話でやったこと", "previous": "前回やったこと", "all": "これまでにやったこと"}


def render_markdown(r: dict[str, Any], facts: dict[str, Any], scope: str = "current") -> str:
    lines = [f"## 振り返り（{SCOPE_LABEL.get(scope, scope)}）", ""]
    if r.get("did"):
        lines.append(f"### {DID_HEADING.get(scope, 'やったこと')}")
        lines += [f"- {x}" for x in r["did"]]
        lines.append("")
    if r.get("understood"):
        lines.append("### できていること")
        lines += [f"- {x}" for x in r["understood"]]
        lines.append("")
    if r.get("stuck"):
        lines.append("### つまずいたところ")
        lines += [f"- {x}" for x in r["stuck"]]
        lines.append("")
    if r.get("next"):
        lines.append("### 次に勉強するとよいこと")
        for i, n in enumerate(r["next"], 1):
            lines.append(f"{i}. **{n.get('topic','')}** — {n.get('why','')}")
            if n.get("how"):
                lines.append(f"   - やり方: {n['how']}")
        lines.append("")
    if r.get("message"):
        lines.append(f"> {r['message']}")
        lines.append("")
    lv, goal = facts.get("理解度"), facts.get("目的")
    lines.append(f"<small>現在の理解度: {lv} / 目的: {goal}</small>")
    return "\n".join(lines).strip()


def reflect(session: TutorSession, *, turns: list[dict[str, Any]], exercise: list[dict[str, Any]], profile: dict[str, Any] | None,
            scope: str = "current", days: int = 30) -> dict[str, Any]:
    facts = build_facts(session, turns=turns, exercise=exercise, profile=profile, scope=scope, days=days)
    if scope != "current" and not turns and not exercise:
        return {"summary": "まだ振り返る記録がありません。質問をしてみてください。", "structured": None, "facts": facts, "source": "empty", "scope": scope}
    hint = {"current": "「この会話」だけを対象にします。",
            "previous": "「前回の会話」（今開いている会話の 1 つ前）だけを対象にします。did の主語は前回の学習です。",
            "all": f"直近 {days} 日の全会話を対象にします。did は日付や会話名を添えて、学習の流れ（何から何へ進んだか）が分かるように。"}[scope if scope in ("current","previous","all") else "current"]
    user = "## 振り返りの範囲\n" + hint + "\n\n## 記録\n" + json.dumps(facts, ensure_ascii=False, indent=1) + "\n\n## 出力\nJSON のみ。"
    try:
        r = _chat_json(session.client, SYSTEM, user, max_tokens=1000, temperature=0.3, response_format=SCHEMA)
        if not isinstance(r, dict) or r.get("_parse_error") or not r.get("did"):
            raise ValueError("bad reflection")
        return {"summary": render_markdown(r, facts, scope), "structured": r, "facts": facts, "source": "llm", "scope": scope}
    except Exception as exc:  # noqa: BLE001
        return {"summary": session.summarize_weak_points(), "structured": None, "facts": facts, "source": f"fallback:{type(exc).__name__}", "scope": scope}
