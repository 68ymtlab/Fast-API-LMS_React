#!/usr/bin/env python3
"""適応型チュータ（adaptive_v1）+ 旧 probe モード（legacy_probe）。

adaptive_v1:
  条件付き MCQ 診断 → LearnerState → RAG（失敗時 decompose）→ 適応回答 + 出典 + 教科書外バナー

legacy_probe:
  Phase6 の確認質問 → 採点 → ヒント（設定で切替可能）

Usage:
  export WORKSPACE=...
  DEEPRAG_USE_VLLM_EMBED=0 .venv-rag/bin/python scripts/rag/tutor_session.py
  DEEPRAG_USE_VLLM_EMBED=0 .venv-rag/bin/python scripts/rag/tutor_session.py --once "ベクトルって何？"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

os.environ.setdefault("DEEPRAG_USE_VLLM_EMBED", "0")

from openai import OpenAI  # noqa: E402

from deeprag_search import (  # noqa: E402
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_EXTRA_BODY,
    LLM_MODEL,
    DeepRAGSearcher,
    _load_production_config,
    _strip_thinking_process,
    select_relevant_page_text,
)
from pedagogical_planner import (  # noqa: E402
    PLANNER_SYSTEM_PROMPT,
    build_planner_input,
    fallback_plan,
    is_social_only,
    planner_prompt_schema,
    validate_and_normalize_plan,
)
from tutor_viz import plan_viz  # noqa: E402

Phase = Literal[
    "idle",
    "awaiting_diagnosis",
    "awaiting_clarify",
    "awaiting_probe",
    "answered",
]
# 理解度は5段階（none < heard < can_compute < can_prove）。
# can_prove = 定義・計算は理解済みで、証明・一般化・反例など「なぜ」に進みたい上位層。
Understanding = Literal["unknown", "none", "heard", "can_compute", "can_prove"]
Goal = Literal[
    "definition", "intuition", "application", "proof", "generalization", "unknown"
]
UNDERSTANDING_ORDER = {"unknown": -1, "none": 0, "heard": 1, "can_compute": 2, "can_prove": 3}
Style = Literal["intuition", "formula", "mixed"]
TutorMode = Literal["adaptive_v1", "legacy_probe"]
TurnClass = Literal[
    "new_topic",
    "followup",
    "confused",
    "clarify_answer",
    "style_request",
    "ack",
    "meta",
]
ExplainMode = Literal["first", "simplify", "style_shift", "after_clarify"]

SYSTEM_PROMPT_PROBE_GEN = """あなたは線形代数のチューターです。
直前に学習者へ説明した内容の理解を確認するため、短い確認質問をちょうど1つ作ってください。

ルール:
1. 説明本文から答えられる質問にする（新しい事実を要求しない）
2. 答えは短く言えるもの（定義の言い換え、一言で何が分かるか、など）
3. 直接「答えは〜ですか？」というはい/いいえ質問は避ける
4. 質問文は日本語で40文字以内目安
5. 思考プロセスは出さず、JSONのみ出力

JSON:
{
  "probe": "確認質問",
  "expected_points": ["採点時に見てほしい要点1", "要点2"],
  "focus_entity_id": "検索結果の主なエンティティID（分かれば）"
}"""

SYSTEM_PROMPT_GRADE_PROBE = """あなたは線形代数のチューター採点官です。
確認質問に対する学習者の自由記述回答を採点してください。

ルール:
1. correct は true / false / partial のいずれか
2. feedback は学習者に見せる短い一文（答えそのものは書かない。どこが足りないかだけ）
3. gap_entity_id が分かれば検索コンテキスト内のエンティティID。分からなければ空文字
4. is_prerequisite_gap は「本題より前提概念の不足」と判断したら true
5. is_new_topic_question は、学習者の発言が確認質問への回答ではなく、
   話題を変えた別の質問（例: 「行列って何？」「内積の意味を教えて」）だと明確に判断できるときだけ true。
   「〜ですか？」「〜ですよね？」で終わる確認形の答えや、確認質問への推測・曖昧な答えは false。
6. JSONのみ出力。思考プロセスは出さない

JSON:
{
  "correct": true,
  "feedback": "短いフィードバック",
  "gap_entity_id": "",
  "is_prerequisite_gap": false,
  "is_new_topic_question": false
}"""

SYSTEM_PROMPT_HINT = """あなたはソクラテス式の線形代数チューターです。
学習者が確認質問に答えられていません。ヒントを出してください。

ルール:
1. 直接の正解は絶対に言わない
2. hint_level=1: 考え直すきっかけの質問やたとえ（やわらかい）
3. hint_level=2: 手順や見方を少し具体的に（まだ答えは言わない）
4. 日本語で2文以内
5. JSONのみ: {"hint": "..."}"""

SYSTEM_PROMPT_EXPLAIN = """あなたは線形代数チューターです。
学習者がヒントを使っても答えられなかったので、短い説明を出してください。

ルール:
1. 確認質問への正しい答えを1〜3文で
2. 前提知識の不足が指摘されている場合は、その前提も1文で触れる
3. 長くしない
4. JSONのみ: {"explanation": "..."}"""

DIAGNOSIS_CHOICES_TEMPLATE = [
    {"id": "A", "label": "初めて聞いた／ほとんど知らない", "understanding": "none", "goal": "intuition"},
    {"id": "B", "label": "聞いたことはある", "understanding": "heard", "goal": "definition"},
    {"id": "C", "label": "計算や式は使える", "understanding": "can_compute", "goal": "application"},
    {"id": "D", "label": "使い方・意味が知りたい", "understanding": "heard", "goal": "intuition"},
    {"id": "E", "label": "証明・一般化・なぜ成り立つかを知りたい", "understanding": "can_prove", "goal": "proof"},
]

WHAT_IS_RE = re.compile(
    r"(って何|とは何|とは\？|ってなに|教えて|意味)",
    re.IGNORECASE,
)
# 「わからない」は confused 専用（new_topic の WHAT_IS から分離）
CONFUSED_RE = re.compile(
    r"(わからない|分からない|もっとわから|まだわから|いまいち|微妙|"
    r"ピンとこない|ピンと来ない|しっくりこない|まだだめ|全然だめ|"
    r"違う|ちがう|意味がわからない|よくわからない|理解できない|混乱|"
    r"むずかしい|難しい|ついていけない)",
    re.IGNORECASE,
)
# 真の「わからない」を表す強シグナル（無条件で confused）
CONFUSED_STRONG_RE = re.compile(
    r"(わからない|分からない|もっとわから|まだわから|意味がわからない|"
    r"よくわからない|理解できない|ついていけない|混乱|いまいち|微妙|"
    r"ピンとこない|ピンと来ない|しっくりこない|まだだめ|全然だめ)",
    re.IGNORECASE,
)
# 弱シグナル（難しい/違う）。疑問文なら「鋭い質問・反論」なので confused にしない（A2）
CONFUSED_WEAK_RE = re.compile(r"(むずかしい|難しい|違う|ちがう)", re.IGNORECASE)
INTERROGATIVE_RE = re.compile(
    r"(どう|なぜ|どこ|どの|なに|何|いつ|ですか|ますか|でしょうか|のか|ますが|"
    r"違いますか|どちら|いかに)",
    re.IGNORECASE,
)


def _is_confused_utterance(t: str) -> bool:
    """真の混乱か。難しい/違うを含む『鋭い質問・反論』は混乱扱いしない（A2）。"""
    if CONFUSED_STRONG_RE.search(t):
        return True
    if CONFUSED_WEAK_RE.search(t):
        looks_question = bool(INTERROGATIVE_RE.search(t)) or t.rstrip().endswith(("？", "?"))
        return not looks_question
    return False


ACK_RE = re.compile(
    r"^(なるほど|わかった|分かりました|わかりました|了解|ok|OK|おけ|"
    r"うん|はい|そうなんだ|そうか|そっか|ありがとう|サンキュー|"
    r"いいね|ふむ|へー|へえ)[。．！!…]*$",
    re.IGNORECASE,
)
STYLE_RE = re.compile(
    r"(たとえ|例え|数式|式で|もっとやさしく|もっと簡単|かみ砕|直感)",
    re.IGNORECASE,
)
SIMPLE_CONFIRM_RE = re.compile(
    r"(で(合ってる|あってる|正しい)|ですか\？$|よね\？$|だよね)",
)
ADVANCED_SECTION_RE = re.compile(
    r"(基底|次元|行列式|固有|対角|余因子|1次独立|1次従属|jordan|Jordan)",
    re.IGNORECASE,
)

# 長い語を先にマッチ
KNOWN_CONCEPTS = [
    "固有ベクトル",
    "空間ベクトル",
    "平面ベクトル",
    "一次独立",
    "一次従属",
    "1次独立",
    "1次従属",
    "線形変換",
    "1次変換",
    "逆行列",
    "転置行列",
    "行列式",
    "対角化",
    "固有値",
    "内積",
    "外積",
    "ベクトル",
    "行列",
    "基底",
    "次元",
    "空間",
]

# 静的clarify（フォールバック用に残す）。動的gap特定が失敗したときだけ使う。
CLARIFY_CHOICES = [
    {"id": "A", "label": "たとえ・イメージがわからない", "intent": "analogy",
     "gap": "直感的なイメージがつかめていない"},
    {"id": "B", "label": "用語の意味がわからない", "intent": "term",
     "gap": "使われている用語の定義"},
    {"id": "C", "label": "何に使うのか知りたい", "intent": "use",
     "gap": "この概念の使い所・目的"},
]

# gap特定clarify: 「どのスタイルで言い直すか」ではなく「どこで止まっているか」を特定する。
# 製品ビジョン（tutoring_system_architecture.md v3）:
#   聞き返しは学習者を試すためではなく、分からない場所を特定するためだけに、最大1回。
# 選択肢は固定文言ではなく、焦点概念・直前の説明・KG前提候補から動的に作る。
SYSTEM_PROMPT_GAP_CLARIFY = """あなたは数学チューターの補助モジュールです。
学習者が「わからない」と言っています。どこでつまずいているかを特定するための
聞き返しを1つ作ってください。

ルール:
- question は短く1文。「どこで止まりましたか？」系。責める調子にしない。
- choices は2〜3個。**つまずきの場所の候補**にする（説明スタイルの好みではない）。
  直前の説明の論理ステップ、または前提概念（与えられた候補）から選ぶ。
- label は学習者に見せる短い文（20字以内）。gap はチューター内部用の
  「何が分かっていないか」の記述（教える側への指示になる形で）。
- 学習者を試す問題・クイズにしない。
出力はJSONのみ: {"question": "...", "choices": [{"label": "...", "gap": "..."}, ...]}"""

GAP_CLARIFY_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "gap_clarify",
        "schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "choices": {
                    "type": "array", "minItems": 2, "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {"label": {"type": "string"},
                                       "gap": {"type": "string"}},
                        "required": ["label", "gap"],
                    },
                },
            },
            "required": ["question", "choices"],
        },
    },
}


@dataclass
class LearnerState:
    understanding_level: Understanding = "unknown"
    goal: Goal = "unknown"
    needs_prereq: bool = False
    style: Style = "mixed"
    topic_key: str = ""


@dataclass
class TopicStat:
    entity_id: str = ""
    section: str = ""
    attempts: int = 0
    correct: int = 0
    marked_weak: bool = False


@dataclass
class SessionState:
    phase: Phase = "idle"
    history: list[dict[str, str]] = field(default_factory=list)
    topic_stats: dict[str, TopicStat] = field(default_factory=dict)
    focus_entity_id: str = ""
    focus_section: str = ""
    focus_concept: str = ""
    last_user_question: str = ""
    last_tutor_answer: str = ""
    last_explanation: str = ""
    current_probe: str = ""
    current_expected_points: list[str] = field(default_factory=list)
    probe_attempts: int = 0
    hints_given: int = 0
    hint_level: int = 1
    consecutive_correct: int = 0
    last_context: str = ""
    last_results: list[dict[str, Any]] = field(default_factory=list)
    prerequisite_candidates: list[dict[str, str]] = field(default_factory=list)
    topic_switch_count: int = 0
    # adaptive_v1 / dialogue tutor
    learner_state: LearnerState = field(default_factory=LearnerState)
    pending_query: str = ""
    diagnosis_choices: list[dict[str, Any]] = field(default_factory=list)
    diagnosis_prompt: str = ""
    last_citations: list[dict[str, Any]] = field(default_factory=list)
    knowledge_mode: str = "textbook"
    retrieval_path: str = ""
    last_banner: str = ""
    known_topics: list[str] = field(default_factory=list)
    dialogue: list[dict[str, str]] = field(default_factory=list)
    confusion_streak: int = 0
    pending_clarify: dict[str, Any] | None = None
    last_retrieval_query: str = ""
    last_turn_class: str = ""
    last_explain_mode: str = ""
    viz_last: dict[str, Any] | None = None
    # トピック別のレベル分析ログ（S4: セッションを通じた学習者分析を可視化）
    # topic -> {"level": str, "turns": int, "confused": int, "weak_hit": int}
    topic_level_log: dict[str, dict[str, Any]] = field(default_factory=dict)


def _chat_json(
    client: OpenAI,
    system: str,
    user: str,
    max_tokens: int = 400,
    temperature: float = 0.2,
    response_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # response_format(json_schema) を渡すと出力が文法レベルで拘束される。
    # 拘束なしだと約8%の呼び出しでモデルが推論を書き出し、遅延+パース失敗の原因になる
    # （実測: p95 23.6→5.5秒。measurement系レポート参照）。構造が必須の呼び出しでは必ず渡す。
    extra = dict(LLM_EXTRA_BODY)
    if response_format is not None:
        extra["response_format"] = response_format
    stream = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
        extra_body=extra,
    )
    parts: list[str] = []
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            parts.append(delta.content)
    text = _strip_thinking_process("".join(parts))
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {"_raw": text, "_parse_error": "no_json"}
    blob = m.group(0)
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        try:
            return json.loads(re.sub(r'\\(?![\\"/bfnrtu])', r"\\\\", blob))
        except Exception:  # noqa: BLE001
            return {"_raw": blob, "_parse_error": "json_fail"}


# [LMS port] 開いている教科書ページのタイトル（スレッド毎。TutorSession.handle_turn が毎ターン設定）
_page_hint = threading.local()


def _topic_key_from_query(query: str) -> str:
    q = (query or "").strip()
    hits = [c for c in KNOWN_CONCEPTS if c in q]
    # 短い語が長い語に含まれる場合は落とす（逆行列⊃行列 など）
    hits = [c for c in hits if not any(c != o and c in o for o in hits)]
    if len(hits) >= 2:
        a, b = hits[0], hits[1]
        if a in q and b in q:
            return f"{a}と{b}"
        return hits[0]
    if hits:
        return hits[0]
    # [LMS port] 指示語だけ／ごく短い質問は、開いているページのタイトルを話題にする（「このEって何」→「単位行列」）
    hint = str(getattr(_page_hint, "title", "") or "").strip()
    if hint and (re.search(r"(この|これ|ここ|それ|その|上の|下の|左の|右の)", q) or len(q) < 12):
        return hint
    q2 = re.sub(r"[？\?！!。．\s]+", "", q)
    q2 = re.sub(
        r"(って何|とは何|とは|ってなに|教えて|を説明|について|"
        r"の違い|の差|とはどう違う|を比較して|とはどのような|の意味は)",
        "",
        q2,
    )
    q2 = q2[:24]
    return q2 or q[:24]


class TutorSession:
    """単一セッションのチュータリング対話制御。"""

    def __init__(self, searcher: DeepRAGSearcher | None = None, cfg: dict | None = None):
        self.searcher = searcher or DeepRAGSearcher(device="cpu", pipeline="winner_v1")
        prod = cfg or _load_production_config()
        tutor_cfg = prod.get("tutor") or {}
        mode = str(tutor_cfg.get("mode", "adaptive_v1")).strip()
        self.mode: TutorMode = (
            "legacy_probe" if mode == "legacy_probe" else "adaptive_v1"
        )
        self.diagnose_when = str(tutor_cfg.get("diagnose_when", "conditional"))
        self.show_citations = bool(tutor_cfg.get("show_citations", True))
        self.announce_extra_knowledge = bool(
            tutor_cfg.get("announce_extra_knowledge", True)
        )
        self.attempts_before_strong_hint = int(
            tutor_cfg.get("attempts_before_strong_hint", 2)
        )
        self.hints_before_explanation = int(tutor_cfg.get("hints_before_explanation", 2))
        self.probe_after_every_answer = bool(
            tutor_cfg.get("probe_after_every_answer", False)
        )
        if self.mode == "legacy_probe":
            self.probe_after_every_answer = bool(
                tutor_cfg.get("probe_after_every_answer", True)
            )
        # 発話ベースのレベル推定（S4 対策）。既定オフ（1ターンあたり追加LLM呼出のため）。
        # on にすると、学習者発話ごとに理解度を推定して逐次更新する（2つ目以降の
        # 概念でも診断MCQ無しでレベルが動く）。診断MCQ とは併用可能。
        self.passive_level_estimation = bool(
            tutor_cfg.get("passive_level_estimation", False)
        )
        self.passive_est_min_confidence = float(
            tutor_cfg.get("passive_est_min_confidence", 0.6)
        )
        planner_cfg = tutor_cfg.get("pedagogical_planner") or {}
        self.planner_enabled = bool(planner_cfg.get("enabled", True))
        self.planner_timeout_sec = float(planner_cfg.get("timeout_seconds", 18))
        self.planner_max_tokens = int(planner_cfg.get("max_tokens", 700))
        self.last_level_estimate: dict[str, Any] | None = None
        self.client = OpenAI(
            base_url=f"{LLM_BASE_URL.rstrip('/')}/v1",
            api_key=LLM_API_KEY,
        )
        self.state = SessionState()
        self._last_turn: dict[str, Any] = {}
        # [LMS port] 学生がいま開いている教科書ページ {"title","text","lesson_page_id"}（LMS から毎ターン更新）
        self.page_context: dict[str, Any] | None = None
        # [LMS port] 学生が選んだ回答の長さ short / normal / long
        self.answer_length: str | None = None
        # LMS backendが現在の学生・コースで認可して取得した、直近の演習証拠。
        # page_contextと同様にリクエストスコープであり、SessionStateには保存しない。
        self.learner_evidence: list[dict[str, Any]] = []
        self._last_planner_record: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def handle_message(self, text: str, choice_id: str | None = None) -> str:
        """互換 API: 返答テキストのみ返す。"""
        turn = self.handle_turn(text, choice_id=choice_id)
        return str(turn.get("reply") or "")

    def handle_turn(self, text: str, choice_id: str | None = None) -> dict[str, Any]:
        """構造化ターン結果（Web / 評価用）。"""
        text = (text or "").strip()
        choice_id = (choice_id or "").strip() or None
        self._last_planner_record = None
        _page_hint.title = str((self.page_context or {}).get("title") or "")  # [LMS port]

        if not text and not choice_id:
            return self._pack_turn("何か質問を書いてください。")

        lower = (text or "").lower()
        if lower in {"quit", "exit", "q", "終了"}:
            summary = self.summarize_weak_points()
            return self._pack_turn(f"セッションを終了します。\n\n{summary}")

        if lower in {"summary", "弱點", "弱点", "まとめて"}:
            return self._pack_turn(self.summarize_weak_points())

        if self.mode == "adaptive_v1":
            if self.state.phase == "awaiting_diagnosis":
                return self._handle_diagnosis_choice(text, choice_id)
            if self.state.phase == "awaiting_clarify":
                return self._handle_clarify_choice(text, choice_id)
            return self._handle_adaptive_turn(text)

        # legacy_probe
        if self.state.phase == "awaiting_probe":
            grade = self._grade_probe(text)
            if bool(grade.get("is_new_topic_question")):
                self.state.topic_switch_count += 1
                self.state.phase = "idle"
                self.state.current_probe = ""
                self.state.probe_attempts = 0
                self.state.hints_given = 0
                self.state.hint_level = 1
                return self._pack_turn(self._handle_new_question_legacy(text))
            return self._pack_turn(self._handle_probe_answer(text, grade=grade))
        return self._pack_turn(self._handle_new_question_legacy(text))

    def summarize_weak_points(self) -> str:
        if self.mode == "adaptive_v1":
            ls = self.state.learner_state
            level_ja = {
                "none": "はじめて", "heard": "聞いたことがある",
                "can_compute": "計算できる", "can_prove": "証明・一般化まで",
                "unknown": "未推定",
            }
            lines = ["## このセッションの振り返り", ""]
            lines.append(
                f"- 現在の理解度: **{level_ja.get(ls.understanding_level, ls.understanding_level)}**"
                f" / 目的: {ls.goal}"
            )

            log = self.state.topic_level_log
            if log:
                # 躓きの多い/レベルの低いトピックを弱点として抽出
                def weak_score(item):
                    _t, d = item
                    return (d.get("confused", 0) + d.get("weak_hit", 0),
                            -UNDERSTANDING_ORDER.get(d.get("level", "unknown"), -1))

                ordered = sorted(log.items(), key=weak_score, reverse=True)
                weak = [
                    (t, d) for t, d in ordered
                    if d.get("confused", 0) > 0
                    or d.get("weak_hit", 0) > 0
                    or UNDERSTANDING_ORDER.get(d.get("level", "unknown"), 3) <= 0
                ]
                if weak:
                    lines.append("")
                    lines.append("### 復習するとよいところ")
                    for t, d in weak[:5]:
                        notes = []
                        if d.get("confused", 0) > 0:
                            notes.append(f"つまずき{d['confused']}回")
                        if UNDERSTANDING_ORDER.get(d.get("level", "unknown"), 3) <= 0:
                            notes.append("導入段階")
                        if d.get("weak_hit", 0) > 0:
                            notes.append("教科書該当が薄い")
                        suffix = f"（{', '.join(notes)}）" if notes else ""
                        lines.append(f"- {t}{suffix}")
                strong = [
                    t for t, d in ordered
                    if d.get("confused", 0) == 0
                    and UNDERSTANDING_ORDER.get(d.get("level", "unknown"), -1) >= 2
                ]
                if strong:
                    lines.append("")
                    lines.append("### よく理解できていたところ")
                    lines.append("- " + "、".join(strong[:5]))
                lines.append("")
                lines.append("### 触れたトピックと到達レベル")
                for t, d in list(log.items())[-8:]:
                    lines.append(
                        f"- {t}: {level_ja.get(d.get('level', 'unknown'), d.get('level'))}"
                        f"（{d.get('turns', 0)}回）"
                    )
            elif self.state.known_topics:
                lines.append("- 触れたトピック: " + "、".join(self.state.known_topics[-8:]))

            lines.append("")
            lines.append("次に知りたいことがあれば、そのまま質問してください。")
            return "\n".join(lines)

        if not self.state.topic_stats:
            return "まだ確認質問の記録がありません。何か聞いてみてください。"

        weak = [
            s
            for s in self.state.topic_stats.values()
            if s.marked_weak or (s.attempts > 0 and s.correct == 0)
        ]
        weak.sort(key=lambda s: (s.attempts - s.correct), reverse=True)
        lines = ["## このセッションの振り返り", ""]
        if not weak:
            lines.append("目立った弱点は記録されていません。よくできています。")
        else:
            lines.append("特に積み残しがありそうなところ:")
            for s in weak[:5]:
                label = s.section or s.entity_id or "（不明）"
                lines.append(
                    f"- {label}（attempts={s.attempts}, correct={s.correct}"
                    f"{', 弱点マーク' if s.marked_weak else ''}）"
                )
            lines.append("")
            lines.append(
                "次に勉強するなら、上の前提から戻って確認するのがおすすめです。"
            )

        ok = [
            s
            for s in self.state.topic_stats.values()
            if s.correct > 0 and not s.marked_weak
        ]
        if ok:
            lines.append("")
            lines.append("よく理解できていたところ:")
            for s in ok[:5]:
                label = s.section or s.entity_id
                lines.append(f"- {label}（{s.correct}/{s.attempts}）")
        return "\n".join(lines)

    def export_state(self) -> dict[str, Any]:
        raw = asdict(self.state)
        raw["topic_stats"] = {
            k: asdict(v) for k, v in self.state.topic_stats.items()
        }
        return raw

    def debug_state(self) -> dict[str, Any]:
        ls = self.state.learner_state
        return {
            "mode": self.mode,
            "phase": self.state.phase,
            "focus_entity_id": self.state.focus_entity_id,
            "focus_section": self.state.focus_section,
            "focus_concept": self.state.focus_concept,
            "current_probe": self.state.current_probe,
            "probe_attempts": self.state.probe_attempts,
            "hints_given": self.state.hints_given,
            "hint_level": self.state.hint_level,
            "topic_switch_count": self.state.topic_switch_count,
            "consecutive_correct": self.state.consecutive_correct,
            "learner_state": asdict(ls),
            "knowledge_mode": self.state.knowledge_mode,
            "retrieval_path": self.state.retrieval_path,
            "pending_query": self.state.pending_query,
            "diagnosis_prompt": self.state.diagnosis_prompt,
            "confusion_streak": self.state.confusion_streak,
            "turn_class": self.state.last_turn_class,
            "explain_mode": self.state.last_explain_mode,
            "dialogue_len": len(self.state.dialogue),
        }

    # ------------------------------------------------------------------
    # adaptive_v1 — dialogue tutor
    # ------------------------------------------------------------------

    def _pack_turn(self, reply: str, **extra: Any) -> dict[str, Any]:
        diagnosis = None
        if self.state.phase == "awaiting_diagnosis" and self.state.diagnosis_choices:
            diagnosis = {
                "prompt": self.state.diagnosis_prompt,
                "choices": [
                    {"id": c["id"], "label": c["label"]}
                    for c in self.state.diagnosis_choices
                ],
            }
        clarify = None
        if self.state.phase == "awaiting_clarify" and self.state.pending_clarify:
            clarify = {
                "prompt": self.state.pending_clarify.get("prompt", ""),
                "choices": list(self.state.pending_clarify.get("choices") or []),
            }
        payload = {
            "reply": reply,
            "state": self.debug_state(),
            "diagnosis": diagnosis,
            "clarify": clarify,
            "citations": list(self.state.last_citations) if self.show_citations else [],
            "knowledge_mode": self.state.knowledge_mode,
            "banner": self.state.last_banner if self.announce_extra_knowledge else "",
            "retrieval_path": self.state.retrieval_path,
            "turn_class": self.state.last_turn_class,
            "viz": self.state.viz_last,
            "answer_body": extra.get("answer_body", ""),
            "planner": self._last_planner_record,
        }
        payload.update(extra)
        self._last_turn = payload
        return payload

    def _append_dialogue(self, role: str, content: str) -> None:
        self.state.dialogue.append({"role": role, "content": content})
        self.state.history.append({"role": role, "content": content})
        if len(self.state.dialogue) > 12:
            self.state.dialogue = self.state.dialogue[-12:]

    def _filter_citations(
        self, citations: list[dict[str, Any]], focus: str, max_items: int = 3
    ) -> list[dict[str, Any]]:
        """表示する出典を **並べ替える**（落とさない）。

        以前はここで focus 文字列の部分一致を要求して出典を捨てていた。実測では:

          - 正解節を含む率  0.920（検索の生 citations）→ 0.393（表示後）
          - 出典が1件も出ない問  150問中 **50問**
          - precision も 0.623 → 0.446 と低下（＝絞り込みになっていなかった）

        原因は `_topic_key_from_query` が KNOWN_CONCEPTS に該当しないとき
        クエリ先頭24文字をそのまま focus にすることで、節名と一致しようがない点。
        （楕円・双曲線・放物線・複素数は KNOWN_CONCEPTS に無く、単元ごと該当した）

        検索側は既に gold_section_recall 0.920 を達成しているので、
        表示側は落とさず **順序の優先だけ** を行う。
        詳細: rag/reports/retrieval-e2e/citation_quality_v1.md
        """
        if not citations:
            return []

        ls = self.state.learner_state

        # 焦点トークン。24文字のクエリ断片が紛れ込まないよう長さで足切りする
        # （落とす判断には使わないので、外れても順序が変わらないだけで実害はない）。
        focus_tokens: set[str] = set()
        if focus:
            for t in KNOWN_CONCEPTS:
                if t in focus:
                    focus_tokens.add(t)
            for part in re.split(r"[と・/]", focus):
                part = part.strip()
                if part and len(part) <= 12:
                    focus_tokens.add(part)
            if len(focus) <= 12:
                focus_tokens.add(focus)

        advanced_ok = any(
            k in (focus or "")
            for k in (
                "基底", "次元", "行列式", "固有", "対角",
                "一次独立", "1次独立", "一次従属", "1次従属",
            )
        )

        def sort_key(c: dict[str, Any]) -> tuple[int, int, int]:
            section = c.get("section") or ""
            blob = (
                section
                + " "
                + (c.get("content") or "")
                + " "
                + (c.get("excerpt") or "")
            )
            if focus_tokens and any(tok in section for tok in focus_tokens):
                topical = 0  # 節名が焦点に一致
            elif focus_tokens and any(tok in blob for tok in focus_tokens):
                topical = 1  # 本文が焦点に一致
            else:
                topical = 2

            # 本当の初学者にだけ、焦点外の高度節を後ろに回す（除外はしない）
            advanced_penalty = int(
                ls.understanding_level == "none"
                and not advanced_ok
                and bool(ADVANCED_SECTION_RE.search(section))
            )
            # 理解度で種別の優先を変える（対称化）:
            #   none/heard → definition を先に
            #   can_prove  → theorem/proof を先に（上位者は「なぜ」を求める）
            ctype = (c.get("type") or "").lower()
            if ls.understanding_level == "can_prove":
                type_pref = 0 if ctype in ("theorem", "proof") else 1
            elif ls.understanding_level in ("none", "heard"):
                type_pref = 0 if ctype == "definition" else 1
            else:
                type_pref = 0
            return (topical, advanced_penalty, type_pref)

        # sorted は安定なので、同順位はリランク順のまま残る
        return sorted(citations, key=sort_key)[:max_items]

    def _classify_turn(self, text: str) -> TurnClass:
        t = text.strip()
        if ACK_RE.match(t) and self.state.focus_concept and self.state.last_explanation:
            return "ack"
        if _is_confused_utterance(t) and len(t) < 80:
            return "confused"
        if STYLE_RE.search(t) and self.state.focus_concept and len(t) < 60:
            if _is_confused_utterance(t):
                return "confused"
            return "style_request"
        if self.state.focus_concept and self.state.last_explanation:
            topic = _topic_key_from_query(t)
            fc = self.state.focus_concept
            if fc and (fc in t or (topic and (topic in fc or fc in topic))):
                if WHAT_IS_RE.search(t) or len(t) <= 40 or "?" in t or "？" in t:
                    return "followup"
            if len(t) <= 25 and not WHAT_IS_RE.search(t):
                if CONFUSED_RE.search(t) or t in {"？", "?", "へ？", "そうなの", "ふーん"}:
                    return "confused"
                if SIMPLE_CONFIRM_RE.search(t) or t.endswith("？") or t.endswith("?"):
                    return "followup"
        if WHAT_IS_RE.search(t) or len(t) > 12:
            topic = _topic_key_from_query(t)
            if self.state.focus_concept and topic:
                if topic != self.state.focus_concept and self.state.focus_concept not in topic:
                    if not any(
                        k in t for k in (self.state.focus_concept, "さっき", "それ", "矢印")
                    ):
                        return "new_topic"
            if not self.state.focus_concept:
                return "new_topic"
            return "followup" if self.state.last_explanation else "new_topic"
        if self.state.focus_concept and self.state.last_explanation:
            return "followup"
        return "new_topic"

    def _should_diagnose(self, query: str) -> bool:
        # Legacy integrations may still call this helper. Shortness or an unknown
        # learner level alone must never gate an answer behind a self-rating quiz.
        return bool(re.search(
            r"理解度.{0,8}(確認|診断|測)|(診断|レベル.{0,4}確認).{0,8}(して|お願い|ほしい)?",
            query or "",
        ))

    def _build_diagnosis(self, query: str) -> tuple[str, list[dict[str, Any]]]:
        topic = _topic_key_from_query(query)
        if topic:
            prompt = f"「{topic}」について、いまのあなたの状態に近いものを選んでください。"
        else:
            prompt = "いまのあなたの状態に近いものを選んでください。"
        choices = [dict(c) for c in DIAGNOSIS_CHOICES_TEMPLATE]
        if topic and len(topic) <= 12:
            choices[0]["label"] = f"「{topic}」は初めて聞いた／ほとんど知らない"
            choices[1]["label"] = f"「{topic}」は聞いたことはある"
            choices[2]["label"] = f"「{topic}」の計算や式は使える"
            choices[3]["label"] = f"「{topic}」の使い方・意味が知りたい"
            choices[4]["label"] = f"「{topic}」の証明・一般化・なぜ成り立つかを知りたい"
        return prompt, choices

    def _start_clarify(self, user_text: str = "") -> dict[str, Any]:
        """gap特定の聞き返し（最大1回）。

        旧実装は「たとえが/用語が/使い所が」という説明スタイルの選択だったが、
        製品ビジョンに従い「どこで止まっているか」の位置特定に変更。
        選択肢は焦点概念・直前の説明・KG前提候補から動的生成し、
        失敗時は静的 CLARIFY_CHOICES にフォールバックする。
        最後に必ず「D. 全部あやしい（自由記述もOK）」を付け、即説明へ逃げられるようにする。
        """
        focus = self.state.focus_concept or "いまの内容"
        question = f"「{focus}」のどこで止まりましたか？近いものを選んでください。"
        choices: list[dict[str, Any]] = []
        try:
            prereq_lines = [
                f"- {c['section']}: {c['content'][:60]}"
                for c in (self.state.prerequisite_candidates or [])[:4]
            ]
            user = (
                f"## 焦点の概念\n{focus}\n\n"
                f"## 学習者の発話\n{user_text or '（わからない、との訴え）'}\n\n"
                f"## 直前の説明（抜粋）\n{(self.state.last_explanation or '')[:900]}\n\n"
                f"## 前提概念の候補（知識グラフより）\n"
                + ("\n".join(prereq_lines) if prereq_lines else "（なし）")
            )
            data = _chat_json(
                self.client, SYSTEM_PROMPT_GAP_CLARIFY, user,
                max_tokens=300, response_format=GAP_CLARIFY_SCHEMA,
            )
            got = data.get("choices") or []
            if isinstance(got, list) and len(got) >= 2:
                question = str(data.get("question") or question).strip() or question
                for i, c in enumerate(got[:3]):
                    label = str(c.get("label") or "").strip()
                    gap = str(c.get("gap") or "").strip()
                    if label and gap:
                        choices.append({"id": chr(ord("A") + i), "label": label, "gap": gap})
        except Exception:
            choices = []
        if len(choices) < 2:  # 動的生成に失敗 → 静的フォールバック
            choices = [dict(c) for c in CLARIFY_CHOICES]
        choices.append({"id": "D", "label": "全部あやしい・うまく言えない",
                        "gap": "全体像がつかめていない。前提から順に、短いステップで"})

        self.state.pending_clarify = {"prompt": question, "choices": choices}
        self.state.phase = "awaiting_clarify"
        self.state.last_turn_class = "confused"
        lines = [question, ""]
        for c in choices:
            lines.append(f"{c['id']}. {c['label']}")
        lines.append("")
        lines.append("（記号を選ぶか、自由に書いてもらってもOKです）")
        reply = "\n".join(lines)
        self._append_dialogue("assistant", reply)
        return self._pack_turn(reply, clarify_choices=choices)

    def _handle_clarify_choice(
        self, text: str, choice_id: str | None
    ) -> dict[str, Any]:
        pending = self.state.pending_clarify or {}
        avail = pending.get("choices") or [
            {**c} for c in CLARIFY_CHOICES
        ]
        valid_ids = {c["id"] for c in avail}
        cid = (choice_id or "").upper()
        if not cid and text:
            t = text.strip().upper()
            if t in valid_ids:
                cid = t
            else:
                for c in avail:
                    if text.strip() == c["label"] or c["label"] in text:
                        cid = c["id"]
                        break
        if not cid:
            if text and len(text) > 10 and CONFUSED_RE.search(text) is None:
                # 自由記述も通常の学生発話として再計画し、前の教材文脈を使い回さない。
                self.state.phase = "idle"
                self.state.pending_clarify = None
                self.state.confusion_streak = 0
                return self._handle_adaptive_turn(text)
            ids_str = "〜".join((min(valid_ids), max(valid_ids))) if valid_ids else "A〜D"
            return self._pack_turn(f"{ids_str} のどれかを選ぶか、自由に書いてください。")

        chosen = next((c for c in avail if c["id"] == cid), None)
        if not chosen:
            ids_str = "〜".join((min(valid_ids), max(valid_ids))) if valid_ids else "A〜D"
            return self._pack_turn(f"{ids_str} のどれかを選ぶか、自由に書いてください。")

        # 旧スタイル選択肢（フォールバック時）は学習者の好みも更新する
        intent = chosen.get("intent")
        ls = self.state.learner_state
        if intent == "analogy":
            ls.style = "intuition"
            ls.goal = "intuition"
        elif intent == "term":
            ls.goal = "definition"
            ls.style = "mixed"
        elif intent == "use":
            ls.goal = "application"
            ls.style = "intuition"

        self._append_dialogue("user", f"[clarify] {cid} {chosen['label']}")
        self.state.phase = "idle"
        self.state.pending_clarify = None
        self.state.confusion_streak = 0
        # gap（何が分かっていないか）を、教える側への指示として retrieval/生成クエリに織り込む
        gap = str(chosen.get("gap") or chosen["label"])
        query = (
            f"{self.state.focus_concept}について、学習者は「{gap}」でつまずいています。"
            f"そこに焦点を絞って説明し直してください。"
        )
        # Treat the selected gap as new planning input and search for it afresh.
        # Reusing the previous retrieval can omit the prerequisite the learner named.
        return self._handle_adaptive_turn(query, append_user=False)

    def _maybe_update_level(self, text: str, turn_class: str) -> None:
        """発話ベースでレベルを逐次更新（passive_level_estimation が on のとき）。

        S4 対策: 診断MCQ の1回きり自己申告に依存せず、学習者の産出から更新する。
        ack/style_request のような中身の薄いターンでは動かさない。
        """
        # 外部が __new__ で組んだ最小セッションでも壊れないよう getattr で防御
        if not getattr(self, "passive_level_estimation", False):
            return
        if getattr(self, "client", None) is None:
            return
        if turn_class in ("ack", "style_request") or len(text) < 6:
            return
        try:
            from learner_model import estimate_level, fuse_estimate

            ls = self.state.learner_state
            est = estimate_level(
                self.client,
                self.state.dialogue[-6:] + [{"role": "user", "content": text}],
                topic=self.state.focus_concept or _topic_key_from_query(text),
                prior_level=ls.understanding_level,
            )
            self.last_level_estimate = est
            new_level = fuse_estimate(
                ls.understanding_level, est, self.passive_est_min_confidence
            )
            if new_level != ls.understanding_level:
                ls.understanding_level = new_level  # type: ignore[assignment]
                if est.get("goal") and est["goal"] != "unknown":
                    ls.goal = est["goal"]  # type: ignore[assignment]
        except Exception:  # noqa: BLE001  推定は補助。失敗しても対話は続ける
            pass

    def _make_pedagogical_plan(self, text: str) -> dict[str, Any]:
        """Run the structured planner and fail safely to an answer-first plan."""
        from time import monotonic

        started = monotonic()
        evidence = list(getattr(self, "learner_evidence", []) or [])[:8]
        if not getattr(self, "planner_enabled", True) or getattr(self, "client", None) is None:
            plan = fallback_plan(
                text=text, page_context=self.page_context, learner_evidence=evidence
            )
            self._last_planner_record = {
                "status": "disabled", "latency_ms": 0, "model": None, "plan": plan,
            }
            return plan

        try:
            planner_client = self.client.with_options(
                timeout=getattr(self, "planner_timeout_sec", 18), max_retries=0
            )
            planner_page = self.page_context
            if planner_page:
                # Let the planner see a query-relevant excerpt rather than only the
                # page prefix, so a concept mentioned only near the end is recognized
                # as part of the currently open lesson as well.
                planner_page = {
                    **planner_page,
                    "text": select_relevant_page_text(
                        planner_page.get("text"), text, max_chars=3600
                    ),
                }
            raw = _chat_json(
                planner_client,
                PLANNER_SYSTEM_PROMPT,
                build_planner_input(
                    text=text,
                    page_context=planner_page,
                    dialogue=self.state.dialogue,
                    answer_length=self.answer_length,
                    learner_state=asdict(self.state.learner_state),
                    learner_evidence=evidence,
                ),
                max_tokens=getattr(self, "planner_max_tokens", 700),
                temperature=0.1,
                response_format=planner_prompt_schema(),
            )
            plan = validate_and_normalize_plan(
                raw,
                text=text,
                page_context=self.page_context,
                learner_evidence=evidence,
            )
            status = "ok"
        except Exception as exc:  # Planner is advisory; a failure must not stop tutoring.
            plan = fallback_plan(
                text=text, page_context=self.page_context, learner_evidence=evidence
            )
            status = f"fallback:{type(exc).__name__}"

        self._last_planner_record = {
            "status": status,
            "latency_ms": int((monotonic() - started) * 1000),
            "model": LLM_MODEL if status == "ok" else None,
            "plan": plan,
        }
        return plan

    def _handle_adaptive_turn(
        self, text: str, *, append_user: bool = True, diagnostic_completed: bool = False
    ) -> dict[str, Any]:
        """Plan each natural-language turn before retrieval or answer generation."""
        if append_user:
            self._append_dialogue("user", text)
        self.state.last_user_question = text
        plan = self._make_pedagogical_plan(text)
        if diagnostic_completed:
            # The pending-state machine already collected the learner's answer for
            # this query; replanning must not open the same diagnostic a second time.
            plan["diagnostic"] = {
                "needed": False,
                "target": None,
                "reason": "diagnostic_already_completed_for_pending_turn",
            }
        intents = set(plan.get("intent") or [])
        move = str(plan.get("pedagogical_move") or "direct_explanation")

        if plan.get("action") == "social_response" or is_social_only(text):
            self.state.phase = "idle"
            self.state.confusion_streak = 0
            self.state.last_turn_class = "meta"
            self.state.last_banner = ""
            self.state.last_citations = []
            self.state.last_context = ""
            self.state.last_results = []
            self.state.retrieval_path = "planner:no_retrieval"
            self.state.viz_last = None
            # The LLM has already selected social_response. A small deterministic
            # renderer avoids turning a greeting into an unsolicited lesson or quiz.
            if re.search(r"おはよう", text):
                reply = "おはようございます。今日は何を一緒に見てみますか？"
            elif re.search(r"こんばんは", text):
                reply = "こんばんは。今日は何を一緒に見てみますか？"
            elif re.search(r"ありがとう", text):
                reply = "どういたしまして。ほかにも気になることがあれば聞いてください。"
            else:
                reply = "こんにちは。今日は何を一緒に見てみますか？"
            self.state.last_tutor_answer = reply
            self.state.last_explanation = reply
            self._append_dialogue("assistant", reply)
            return self._pack_turn(reply, turn_class="meta", citations=[])

        if plan.get("diagnostic", {}).get("needed"):
            prompt, choices = self._build_diagnosis(text)
            self.state.pending_query = text
            self.state.diagnosis_prompt = prompt
            self.state.diagnosis_choices = choices
            self.state.phase = "awaiting_diagnosis"
            lines = [prompt, ""]
            lines.extend(f"{choice['id']}. {choice['label']}" for choice in choices)
            lines.extend(["", "（A〜E のどれかを送ってください）"])
            reply = "\n".join(lines)
            self._append_dialogue("assistant", reply)
            return self._pack_turn(reply)

        if plan.get("action") == "clarify":
            if self.state.last_explanation:
                return self._start_clarify(text)
            # A page is evidence that can help answer; its presence alone is not a
            # reason to ask the learner for more information.
            plan["action"] = "answer"

        if "followup_question" in intents or "clarification_request" in intents:
            turn_class: TurnClass = "followup"
        elif move == "error_diagnosis" and self.state.last_explanation:
            turn_class = "confused"
        else:
            turn_class = "new_topic"
        self.state.last_turn_class = turn_class
        self.state.confusion_streak = self.state.confusion_streak + 1 if turn_class == "confused" else 0

        return self._compose_answer(
            text,
            turn_class=turn_class,
            explain_mode="simplify" if move in ("prerequisite_repair", "error_diagnosis") else "first",
            reuse_retrieval=False,
            plan=plan,
        )

    def _handle_diagnosis_choice(
        self, text: str, choice_id: str | None
    ) -> dict[str, Any]:
        cid = (choice_id or "").upper()
        if not cid and text:
            t = text.strip().upper()
            if t in ("A", "B", "C", "D", "E"):
                cid = t
            else:
                for c in self.state.diagnosis_choices:
                    if text.strip() == c["label"] or text.strip() in c["label"]:
                        cid = c["id"]
                        break
                    if c["id"] in t and len(t) <= 3:
                        cid = c["id"]
                        break

        if not cid:
            if text and not SIMPLE_CONFIRM_RE.search(text) and len(text) > 8:
                self.state.phase = "idle"
                self.state.pending_query = ""
                self.state.diagnosis_choices = []
                return self._handle_adaptive_turn(text)
            reply = "A〜E のどれかを選んでください。"
            return self._pack_turn(reply)

        chosen = None
        for c in self.state.diagnosis_choices:
            if c["id"] == cid:
                chosen = c
                break
        if not chosen:
            return self._pack_turn("A〜E のどれかを選んでください。")

        query = self.state.pending_query or self.state.last_user_question
        ls = self.state.learner_state
        ls.understanding_level = chosen.get("understanding", "heard")  # type: ignore[assignment]
        ls.goal = chosen.get("goal", "unknown")  # type: ignore[assignment]
        ls.needs_prereq = ls.understanding_level == "none"
        if ls.goal == "intuition":
            ls.style = "intuition"
        elif ls.goal in ("proof", "generalization"):
            ls.style = "formula"  # 上位層は形式・論理寄りを既定に
        else:
            ls.style = "mixed"
        ls.topic_key = _topic_key_from_query(query)

        self._append_dialogue("user", f"[診断] {cid}")
        self.state.phase = "idle"
        self.state.pending_query = ""
        self.state.diagnosis_choices = []
        self.state.diagnosis_prompt = ""

        # The state machine consumes the selection; planning then resumes using the
        # student's explicit self-report and the current request-scoped page context.
        return self._handle_adaptive_turn(
            query, append_user=False, diagnostic_completed=True
        )

    def _retrieval_query_for(
        self, user_text: str, *, reuse: bool, turn_class: str,
        plan: dict[str, Any] | None = None,
    ) -> str:
        if plan is not None:
            retrieval = plan.get("retrieval") or {}
            queries = [str(q).strip() for q in retrieval.get("queries", []) if str(q).strip()]
            prerequisites = [str(q).strip() for q in retrieval.get("prerequisite_concepts", []) if str(q).strip()]
            planned = " ".join((queries + prerequisites)[:5])
            if plan.get("source_scope") == "active_page_first":
                title = str((self.page_context or {}).get("title") or "").strip()
                if title and title not in planned:
                    planned = f"{title} {planned}".strip()
            return planned[:500] or user_text
        focus = self.state.focus_concept or _topic_key_from_query(user_text)
        if reuse and focus:
            if turn_class == "style_request":
                return f"{focus} の定義"
            if turn_class in ("confused", "followup", "clarify_answer"):
                return self.state.last_retrieval_query or f"{focus} とは何か"
            return self.state.last_retrieval_query or f"{focus} の定義"
        # new topic: 生文ではなく概念寄りの検索クエリ
        topic = _topic_key_from_query(user_text)
        # [LMS port] 「この式」「ここ」のような指示語だけの質問は、開いているページのタイトルを概念にする
        page_title = str((self.page_context or {}).get("title") or "").strip()
        if page_title and (not topic or len(user_text) < 12):
            return f"{page_title} {topic or user_text}".strip()
        if topic:
            return f"{topic} とは何か"
        return user_text

    def _learner_state_for_plan(
        self, user_text: str, plan: dict[str, Any] | None
    ) -> dict[str, Any]:
        state = asdict(self.state.learner_state)
        if plan is None:
            return state
        state_topic = str(state.get("topic_key") or "").strip()
        if not state_topic:
            return {**state, "understanding_level": "unknown", "goal": "unknown", "needs_prereq": False}
        current_topics = [
            str(topic).strip()
            for topic in (plan.get("target_concepts") or [])
            if str(topic).strip()
        ]
        extracted = _topic_key_from_query(user_text)
        if extracted:
            current_topics.append(extracted)
        if self.state.focus_concept and (
            "followup_question" in (plan.get("intent") or [])
            or "clarification_request" in (plan.get("intent") or [])
        ):
            current_topics.append(self.state.focus_concept)
        matches = any(
            state_topic == topic or state_topic in topic or topic in state_topic
            for topic in current_topics if topic
        )
        if not matches:
            return {**state, "understanding_level": "unknown", "goal": "unknown", "needs_prereq": False}
        return state

    def _compose_answer(
        self,
        user_text: str,
        *,
        turn_class: TurnClass,
        explain_mode: ExplainMode,
        reuse_retrieval: bool,
        skip_banner: bool = False,
        plan: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ls = self.state.learner_state
        answer_learner_state = self._learner_state_for_plan(user_text, plan)
        self.state.last_turn_class = turn_class
        self.state.last_explain_mode = explain_mode

        focus = self.state.focus_concept or _topic_key_from_query(
            self.state.pending_query or user_text
        )
        if turn_class == "new_topic":
            focus = _topic_key_from_query(user_text) or focus

        dialogue = list(self.state.dialogue[-6:])
        retrieval_q = self._retrieval_query_for(
            user_text, reuse=reuse_retrieval, turn_class=turn_class, plan=plan
        )
        page_for_turn = self.page_context
        if plan is not None and plan.get("source_scope") != "active_page_first":
            # The session property is refreshed on every request, but a page is only
            # evidence for this answer when this turn's plan selected it.
            page_for_turn = None
        elif page_for_turn:
            # Select relevant blocks from the full request-scoped page. This preserves
            # page-tail evidence while keeping the answer prompt inside model limits.
            page_for_turn = {
                **page_for_turn,
                "text": select_relevant_page_text(
                    page_for_turn.get("text"), user_text, plan
                ),
            }
        evidence_by_ref = {
            str(item.get("ref")): item
            for item in (getattr(self, "learner_evidence", []) or [])
            if item.get("ref")
        }
        selected_refs = set((plan or {}).get("learner_context", {}).get("evidence_refs") or [])
        selected_evidence = [evidence_by_ref[ref] for ref in selected_refs if ref in evidence_by_ref]

        if plan is not None and plan.get("source_scope") == "no_retrieval":
            answer_body = self.searcher.generate_answer(
                user_text,
                "",
                audience="adaptive",
                learner_state=answer_learner_state,
                dialogue=dialogue,
                focus_concept=focus,
                explain_mode=explain_mode,
                turn_class=turn_class,
                last_explanation=self.state.last_explanation,
                page_context=None,
                answer_length=self.answer_length,
                pedagogical_plan=plan,
                learner_evidence=selected_evidence,
            )
            answer = (answer_body or "こんにちは。今日は何を一緒に見てみますか？").strip()
            citations: list[dict[str, Any]] = []
            results: list[dict[str, Any]] = []
            banner = ""
            self.state.last_context = ""
            self.state.last_results = []
            self.state.last_retrieval_query = ""
            self.state.retrieval_path = "planner:no_retrieval"
            self.state.knowledge_mode = "textbook"
            self.state.last_banner = ""
        elif reuse_retrieval and self.state.last_context and self.state.last_results:
            # 再利用: 再検索せず前回 context で生成
            context = self.state.last_context
            citations = list(self.state.last_citations)
            results = list(self.state.last_results)
            km = "textbook"  # 言い直しでは extra を煽らない
            banner = ""
            answer_body = self.searcher.generate_answer(
                user_text,
                context,
                audience="adaptive",
                learner_state=answer_learner_state,
                knowledge_mode=km,
                dialogue=dialogue,
                focus_concept=focus,
                explain_mode=explain_mode,
                turn_class=turn_class,
                last_explanation=self.state.last_explanation,
                page_context=page_for_turn,
                answer_length=self.answer_length,
                pedagogical_plan=plan,
                learner_evidence=selected_evidence,
            )
            cite_block = (
                DeepRAGSearcher.format_citations_block(citations)
                if self.show_citations
                else ""
            )
            parts = [answer_body]
            if cite_block:
                parts.append(cite_block)
            answer = "\n".join(parts).strip()
            meta_path = (self.state.retrieval_path or "winner_v1") + "+reuse"
            self.state.retrieval_path = meta_path
            self.state.knowledge_mode = km
            self.state.last_banner = ""
        else:
            result = self.searcher.search(
                retrieval_q,
                generate_answer=True,
                audience="adaptive",
                learner_state=answer_learner_state,
                allow_fail_decompose=(turn_class == "new_topic"),
                dialogue=dialogue,
                focus_concept=focus,
                explain_mode=explain_mode,
                turn_class=turn_class,
                last_explanation=self.state.last_explanation or None,
                skip_banner=skip_banner,
                answer_query=user_text,
                page_context=page_for_turn,
                answer_length=self.answer_length,
                pedagogical_plan=plan,
                learner_evidence=selected_evidence,
            )
            answer = (result.get("answer") or "").strip() or "（回答を生成できませんでした）"
            answer_body = (result.get("answer_body") or "").strip()
            banner = result.get("banner") or ""
            if not self.announce_extra_knowledge or skip_banner:
                if banner and answer.startswith(banner):
                    answer = answer[len(banner) :].lstrip()
                banner = ""
            citations = result.get("citations") or []
            results = result.get("results") or []
            meta = result.get("metadata") or {}
            self.state.last_context = result.get("context") or ""
            self.state.last_results = list(results)
            self.state.last_retrieval_query = retrieval_q
            self.state.retrieval_path = str(
                meta.get("retrieval_path") or self.searcher.pipeline
            )
            if plan is not None and plan.get("source_scope") == "active_page_first":
                self.state.retrieval_path += "+active_page"
            self.state.knowledge_mode = str(result.get("knowledge_mode") or "textbook")
            self.state.last_banner = banner if self.announce_extra_knowledge else ""

        citations = self._filter_citations(citations, focus)
        if plan is not None and plan.get("source_scope") == "active_page_first" and page_for_turn:
            page_title = str(page_for_turn.get("title") or "現在開いている教科書ページ")
            page_text = " ".join(str(page_for_turn.get("text") or "").split())
            page_id = page_for_turn.get("lesson_page_id")
            page_citation = {
                "section": page_title,
                "type": "active_page",
                "entity_id": f"lesson_page:{page_id}" if page_id is not None else "active_page",
                "excerpt": page_text[:120] + ("…" if len(page_text) > 120 else ""),
                "page": None,
                "rerank_score": 1.0,
            }
            citations = [page_citation] + [
                citation for citation in citations
                if citation.get("entity_id") != page_citation["entity_id"]
            ][:2]
        if self.show_citations:
            # reply 内の旧出典を差し替え
            cite_idx = answer.find("## 参考（教科書）")
            if cite_idx >= 0:
                answer = answer[:cite_idx].rstrip()
            cite_block = DeepRAGSearcher.format_citations_block(citations)
            if cite_block:
                answer = (answer.rstrip() + "\n" + cite_block).strip()
        else:
            cite_idx = answer.find("## 参考（教科書）")
            if cite_idx >= 0:
                answer = answer[:cite_idx].rstrip()
            citations = []

        hits = results or self.state.last_results
        focus_id = hits[0]["entity_id"] if hits else self.state.focus_entity_id
        focus_section = (
            hits[0].get("section", "") if hits else self.state.focus_section
        )

        viz = plan_viz(
            focus,
            goal=ls.goal,
            turn_class=turn_class,
            explain_mode=explain_mode,
        )
        # 矢印確認フォローは vector2d を優先
        if any(k in user_text for k in ("矢印", "アロー")):
            viz = plan_viz(
                "ベクトル",
                goal="intuition",
                turn_class=turn_class,
                explain_mode="simplify",
            )

        self.state.focus_concept = focus
        self.state.last_user_question = user_text
        self.state.last_tutor_answer = answer
        self.state.last_explanation = answer_body or answer
        # strip citations from stored explanation
        ci = self.state.last_explanation.find("## 参考")
        if ci >= 0:
            self.state.last_explanation = self.state.last_explanation[:ci].rstrip()
        self.state.focus_entity_id = focus_id
        self.state.focus_section = focus_section
        self.state.prerequisite_candidates = self._prerequisite_candidates(focus_id)
        self.state.last_citations = citations
        self.state.viz_last = viz
        self.state.phase = "idle"

        if focus and focus not in self.state.known_topics:
            self.state.known_topics.append(focus)
        # トピック別の学習者分析ログを更新（S4: 振り返りを実質化）
        if focus:
            log = self.state.topic_level_log.setdefault(
                focus, {"level": ls.understanding_level, "turns": 0, "confused": 0, "weak_hit": 0}
            )
            log["level"] = ls.understanding_level  # 最新の推定/申告レベル
            log["turns"] += 1
            if turn_class == "confused":
                log["confused"] += 1
            if self.state.knowledge_mode == "extra":
                log["weak_hit"] += 1

        self._append_dialogue("assistant", answer)
        return self._pack_turn(answer, answer_body=answer_body or "", viz=viz)

    # ------------------------------------------------------------------
    # shared / legacy
    # ------------------------------------------------------------------

    def _ensure_topic(self, entity_id: str, section: str) -> TopicStat:
        key = entity_id or section or "_unknown"
        if key not in self.state.topic_stats:
            self.state.topic_stats[key] = TopicStat(
                entity_id=entity_id, section=section
            )
        return self.state.topic_stats[key]

    def _prerequisite_candidates(self, entity_id: str) -> list[dict[str, str]]:
        if not entity_id:
            return []
        deps = self.searcher.graph.get_dependencies(
            entity_id, max_depth=1, include_cross=True
        )
        out: list[dict[str, str]] = []
        seen: set[str] = set()
        for d in deps:
            eid = d.get("entity_id", "")
            if not eid or eid in seen:
                continue
            node = self.searcher.graph.nodes.get(eid) or {}
            if node.get("type") not in ("definition", "theorem", "formula"):
                continue
            seen.add(eid)
            out.append(
                {
                    "entity_id": eid,
                    "type": node.get("type", ""),
                    "section": node.get("section", "") or d.get("section", ""),
                    "content": (node.get("content") or "")[:120],
                    "scope": d.get("scope", ""),
                }
            )
            if len(out) >= 5:
                break
        return out

    def _handle_new_question_legacy(self, query: str) -> str:
        result = self.searcher.search(
            query,
            generate_answer=True,
            audience="beginner",
        )
        answer = (result.get("answer") or "").strip() or "（回答を生成できませんでした）"
        hits = result.get("results") or []
        focus_id = hits[0]["entity_id"] if hits else ""
        focus_section = hits[0].get("section", "") if hits else ""
        context = result.get("context") or ""
        meta = result.get("metadata") or {}

        self.state.last_user_question = query
        self.state.last_tutor_answer = answer
        self.state.last_context = context
        self.state.focus_entity_id = focus_id
        self.state.focus_section = focus_section
        self.state.prerequisite_candidates = self._prerequisite_candidates(focus_id)
        self.state.last_citations = result.get("citations") or []
        self.state.knowledge_mode = str(result.get("knowledge_mode") or "textbook")
        self.state.retrieval_path = str(meta.get("retrieval_path") or "")
        self.state.last_banner = result.get("banner") or ""
        self.state.probe_attempts = 0
        self.state.hints_given = 0
        self.state.hint_level = 1

        self.state.history.append({"role": "user", "content": query})
        self.state.history.append({"role": "assistant", "content": answer})

        if not self.probe_after_every_answer:
            self.state.phase = "idle"
            return answer

        probe_data = self._generate_probe(query, answer, context, focus_id)
        probe = str(probe_data.get("probe") or "").strip()
        if not probe:
            probe = "いまの説明を、自分の言葉で一言まとめるとどうなりますか？"
        expected = probe_data.get("expected_points") or []
        if isinstance(expected, str):
            expected = [expected]
        feid = str(probe_data.get("focus_entity_id") or focus_id).strip()
        if feid.startswith("ent_"):
            self.state.focus_entity_id = feid

        self.state.current_probe = probe
        self.state.current_expected_points = [str(x) for x in expected][:4]
        self.state.phase = "awaiting_probe"

        body = (
            f"{answer}\n\n"
            f"---\n"
            f"確認です: {probe}\n"
            f"（答えてみてください。終了するときは quit）"
        )
        self.state.history.append({"role": "assistant", "content": f"確認: {probe}"})
        return body

    def _generate_probe(
        self, query: str, answer: str, context: str, focus_id: str
    ) -> dict[str, Any]:
        prereq_lines = []
        for p in self.state.prerequisite_candidates[:3]:
            prereq_lines.append(
                f"- {p['entity_id']} [{p['type']}] {p['section']}: {p['content']}"
            )
        user = f"""## 学習者の質問
{query}

## チューターの説明
{answer[:1500]}

## 主なエンティティID
{focus_id}

## 前提候補（参考）
{chr(10).join(prereq_lines) if prereq_lines else "（なし）"}

## 検索コンテキスト（抜粋）
{context[:1200]}
"""
        data = _chat_json(self.client, SYSTEM_PROMPT_PROBE_GEN, user, max_tokens=350)
        if data.get("_parse_error"):
            return {"probe": "", "expected_points": [], "focus_entity_id": focus_id}
        return data

    def _handle_probe_answer(
        self, student_answer: str, grade: dict[str, Any] | None = None
    ) -> str:
        self.state.probe_attempts += 1
        self.state.history.append({"role": "user", "content": student_answer})

        if grade is None:
            grade = self._grade_probe(student_answer)
        correct_flag = grade.get("correct")
        is_correct = correct_flag is True or (
            isinstance(correct_flag, str) and correct_flag.lower() in ("true", "partial")
        )
        is_partial = (
            correct_flag == "partial"
            or (isinstance(correct_flag, str) and correct_flag.lower() == "partial")
        )
        feedback = str(grade.get("feedback") or "").strip()
        is_prereq = bool(grade.get("is_prerequisite_gap"))
        gap_eid = str(grade.get("gap_entity_id") or "").strip()

        topic = self._ensure_topic(self.state.focus_entity_id, self.state.focus_section)
        topic.attempts += 1

        if is_correct:
            topic.correct += 1
            self.state.consecutive_correct += 1
            self.state.phase = "idle"
            self.state.current_probe = ""
            self.state.probe_attempts = 0
            self.state.hints_given = 0
            self.state.hint_level = 1
            msg = "いいですね。"
            if is_partial and feedback:
                msg = f"だいたい合っています。{feedback}"
            elif feedback:
                msg = f"いいですね。{feedback}"
            msg += "\n\n次に知りたいことはありますか？（弱点のまとめは「弱点」と入力）"
            self.state.history.append({"role": "assistant", "content": msg})
            return msg

        self.state.consecutive_correct = 0

        if is_prereq and gap_eid.startswith("ent_"):
            node = self.searcher.graph.nodes.get(gap_eid) or {}
            weak = self._ensure_topic(gap_eid, node.get("section", ""))
            weak.marked_weak = True
            weak.attempts += 1
        elif is_prereq and self.state.prerequisite_candidates:
            p0 = self.state.prerequisite_candidates[0]
            weak = self._ensure_topic(p0["entity_id"], p0.get("section", ""))
            weak.marked_weak = True

        if self.state.hints_given >= self.hints_before_explanation:
            return self._give_explanation(topic, feedback, is_prereq, gap_eid)

        if self.state.probe_attempts >= self.attempts_before_strong_hint:
            self.state.hint_level = 2
        else:
            self.state.hint_level = 1

        return self._give_hint(topic, feedback, is_prereq)

    def _grade_probe(self, student_answer: str) -> dict[str, Any]:
        prereq_lines = [
            f"- {p['entity_id']}: {p['content']}"
            for p in self.state.prerequisite_candidates[:4]
        ]
        user = f"""## 確認質問
{self.state.current_probe}

## 期待する要点
{json.dumps(self.state.current_expected_points, ensure_ascii=False)}

## 学習者の回答
{student_answer}

## 直前のチューター説明（採点参考）
{self.state.last_tutor_answer[:1000]}

## 前提候補
{chr(10).join(prereq_lines) if prereq_lines else "（なし）"}
"""
        data = _chat_json(self.client, SYSTEM_PROMPT_GRADE_PROBE, user, max_tokens=350)
        if data.get("_parse_error"):
            return {
                "correct": False,
                "feedback": "もう少し別の言い方でもう一度試してみてください。",
                "gap_entity_id": "",
                "is_prerequisite_gap": False,
                "is_new_topic_question": False,
            }
        c = data.get("correct")
        if isinstance(c, str):
            low = c.lower()
            if low == "true":
                data["correct"] = True
            elif low == "false":
                data["correct"] = False
            elif low == "partial":
                data["correct"] = "partial"
        nt = data.get("is_new_topic_question", False)
        if isinstance(nt, str):
            data["is_new_topic_question"] = nt.lower() in ("true", "1", "yes")
        else:
            data["is_new_topic_question"] = bool(nt)
        return data

    def _give_hint(
        self, topic: TopicStat, feedback: str, is_prereq: bool
    ) -> str:
        level = self.state.hint_level
        prereq_note = ""
        if is_prereq and self.state.prerequisite_candidates:
            p = self.state.prerequisite_candidates[0]
            prereq_note = (
                f"前提の不足の可能性: {p['entity_id']} / {p['section']}: {p['content']}"
            )
        user = f"""## tip_level
hint_level={level}

## 確認質問
{self.state.current_probe}

## 期待要点
{json.dumps(self.state.current_expected_points, ensure_ascii=False)}

## 採点フィードバック（学習者にはそのまま見せない）
{feedback}

## 前提メモ
{prereq_note or "（特になし）"}
"""
        data = _chat_json(self.client, SYSTEM_PROMPT_HINT, user, max_tokens=250)
        hint = str(data.get("hint") or "").strip()
        if not hint:
            hint = "さっきの説明の中でいちばん大事だと思った言葉を、もう一度自分の言葉で言ってみてください。"

        self.state.hints_given += 1
        prefix = "ちょっと違います。"
        if feedback:
            prefix = f"ちょっと違います。{feedback}"
        if is_prereq:
            prefix += "（もしかすると、いまの話の前にある前提があやしいかも）"
        msg = (
            f"{prefix}\n\n"
            f"ヒント: {hint}\n\n"
            f"もう一度答えてみてください: {self.state.current_probe}"
        )
        self.state.history.append({"role": "assistant", "content": msg})
        self.state.phase = "awaiting_probe"
        return msg

    def _give_explanation(
        self,
        topic: TopicStat,
        feedback: str,
        is_prereq: bool,
        gap_eid: str,
    ) -> str:
        topic.marked_weak = True
        prereq_note = ""
        if is_prereq:
            node = self.searcher.graph.nodes.get(gap_eid) if gap_eid else None
            if node:
                prereq_note = f"{gap_eid} [{node.get('section','')}]: {node.get('content','')[:100]}"
            elif self.state.prerequisite_candidates:
                p = self.state.prerequisite_candidates[0]
                prereq_note = f"{p['entity_id']}: {p['content']}"

        user = f"""## 確認質問
{self.state.current_probe}

## 期待要点
{json.dumps(self.state.current_expected_points, ensure_ascii=False)}

## チューターの元の説明
{self.state.last_tutor_answer[:800]}

## 前提ギャップメモ
{prereq_note or "（なし）"}
"""
        data = _chat_json(self.client, SYSTEM_PROMPT_EXPLAIN, user, max_tokens=400)
        explanation = str(data.get("explanation") or "").strip()
        if not explanation:
            points = "、".join(self.state.current_expected_points) or "要点を見直す"
            explanation = f"確認質問の答えの核は次です: {points}."

        self.state.phase = "idle"
        self.state.current_probe = ""
        self.state.probe_attempts = 0
        self.state.hints_given = 0
        self.state.hint_level = 1

        weak_line = ""
        if topic.section or topic.entity_id:
            weak_line = (
                f"\n\nメモ: 「{topic.section or topic.entity_id}」は"
                "このセッションの弱点として記録しました。"
            )
        if is_prereq and prereq_note:
            weak_line += f"\n前提としても気になるところ: {prereq_note}"

        msg = (
            f"大丈夫、一緒に確認しましょう。\n\n{explanation}"
            f"{weak_line}\n\n"
            "次に知りたいことはありますか？（まとめは「弱点」）"
        )
        self.state.history.append({"role": "assistant", "content": msg})
        return msg


def run_cli(once: str = "") -> int:
    print("TutorSession 初期化中（DeepRAGSearcher 読込）...", flush=True)
    session = TutorSession()
    mode = session.mode
    if mode == "adaptive_v1":
        hint = (
            "準備完了（adaptive_v1）。質問をどうぞ。\n"
            "  - 必要なら診断の選択（A〜E）が出ます\n"
            "  - 「弱点」で振り返り / quit で終了\n"
        )
    else:
        hint = (
            "準備完了（legacy_probe）。質問をどうぞ。\n"
            "  - 確認質問に答えるとそのまま採点します\n"
            "  - 「弱点」で振り返り / quit で終了\n"
        )
    print(hint, flush=True)
    if once:
        print(f"あなた: {once}")
        print()
        print(f"チューター:\n{session.handle_message(once)}")
        return 0

    while True:
        try:
            user = input("あなた> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            print(session.summarize_weak_points())
            return 0
        if not user:
            continue
        reply = session.handle_message(user)
        print()
        print(f"チューター:\n{reply}")
        print()
        if user.lower() in {"quit", "exit", "q", "終了"}:
            return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="適応型チュータリングセッション")
    parser.add_argument("--once", type=str, default="", help="1回だけ質問して終了（動作確認用）")
    args = parser.parse_args()
    return run_cli(once=args.once)


if __name__ == "__main__":
    raise SystemExit(main())
