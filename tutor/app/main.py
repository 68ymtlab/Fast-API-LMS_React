"""AI チューター サービス（LMS 内部サービス）

agents/workspace/rag/project/tutor-web/app/tutor_web.py を LMS 向けに移植・拡張したもの。
  - 学生ごとのセッション（SessionManager, TTL 付き）
  - Postgres（tutor スキーマ）への会話・質問・プロファイルの永続化と、再起動／翌日の引き継ぎ（store.py / state_io.py）
  - 教科書ページ文脈（page_context）の注入
  - 公開 API は LMS backend（/api/tutor/*）からのみ呼ばれる想定。X-Student-Id = LMS の users.id
"""
from __future__ import annotations

import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("DEEPRAG_USE_VLLM_EMBED", "1")

APP_DIR = Path(__file__).resolve().parent
CORE_DIR = Path(os.environ.get("TUTOR_CORE_DIR", APP_DIR.parent / "core"))
for d in (str(CORE_DIR), str(APP_DIR)):
    if d not in sys.path:
        sys.path.insert(0, d)

from fastapi import Depends, FastAPI, Header, HTTPException, Query  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from deeprag_search import LLM_MODEL  # noqa: E402
from related import rank as rank_related  # noqa: E402
from state_io import restore_state  # noqa: E402
from store import TutorStore  # noqa: E402
from tutor_session import TutorSession  # noqa: E402

SESSION_TTL_SEC = int(os.environ.get("TUTOR_SESSION_TTL_SEC", str(30 * 60)))
SESSION_MAX = int(os.environ.get("TUTOR_SESSION_MAX", "200"))
# この時間内に活動があった未終了の会話は「同じ会話の続き」として復元する
RESUME_WINDOW_SEC = int(os.environ.get("TUTOR_RESUME_WINDOW_SEC", str(24 * 60 * 60)))
SERVICE_TOKEN = os.environ.get("TUTOR_SERVICE_TOKEN", "").strip()
STAGE4_DIR = os.environ.get("TUTOR_STAGE4_DIR")

LEVEL_JA = {"none": "はじめて", "heard": "聞いたことがある", "can_compute": "計算できる", "can_prove": "証明できる", "unknown": "未設定"}


class _Entry:
    __slots__ = ("session", "lock", "last_used", "conversation_id", "lesson_page_id", "resumed")

    def __init__(self, session: TutorSession, conversation_id: int | None, resumed: bool):
        self.session = session
        self.lock = threading.Lock()
        self.last_used = time.monotonic()
        self.conversation_id = conversation_id
        self.lesson_page_id: int | None = None
        self.resumed = resumed


ANSWER_LENGTHS = ("short", "normal", "long")


class SessionManager:
    """student_id → TutorSession。DeepRAGSearcher（重い）はプロセス内で共有し、状態は store にも書く。"""

    def __init__(self, store: TutorStore) -> None:
        self.store = store
        self._searcher = None
        self._entries: dict[str, _Entry] = {}
        self._guard = threading.Lock()

    def warmup(self) -> None:
        with self._guard:
            if self._searcher is None:
                self._searcher = TutorSession().searcher
        self.store.connect(STAGE4_DIR, len(getattr(self._searcher, "entities", {}) or {}) or None)

    @property
    def ready(self) -> bool:
        return self._searcher is not None

    # ---- 内部 ----
    def _evict_locked(self) -> None:
        now = time.monotonic()
        expired = [k for k, e in self._entries.items() if now - e.last_used > SESSION_TTL_SEC]
        for k in expired:
            e = self._entries.pop(k)
            self.store.end_conversation(e.conversation_id, "ttl", state=e.session.export_state())
        if len(self._entries) > SESSION_MAX:
            for k, e in sorted(self._entries.items(), key=lambda kv: kv[1].last_used)[: len(self._entries) - SESSION_MAX]:
                self._entries.pop(k, None)
                self.store.end_conversation(e.conversation_id, "evicted", state=e.session.export_state())

    def _hydrate(self, student_id: str) -> _Entry:
        """メモリに無い学生のセッションを DB から組み立てる（無ければ素のセッション）。"""
        session = TutorSession(searcher=self._searcher)
        sid = _to_int(student_id)
        if sid is None or not self.store.enabled:
            return _Entry(session, None, resumed=False)
        profile = self.store.load_profile(sid)
        if profile and profile.get("answer_length") in ANSWER_LENGTHS:
            session.answer_length = profile["answer_length"]
        conv = self.store.load_latest_conversation(sid)
        if not conv:
            return _Entry(session, None, resumed=False)
        same_kb = (conv.get("kb_version_id") == self.store.kb_version_id)
        last = conv.get("last_activity_at")
        recent = bool(last) and (datetime.now(timezone.utc) - last) < timedelta(seconds=RESUME_WINDOW_SEC)
        cont = recent and conv.get("ended_at") is None
        session.state = restore_state(conv.get("state_json"), same_kb=same_kb, continue_conversation=cont)
        entry = _Entry(session, conv["id"] if cont else None, resumed=cont)
        if cont:
            entry.lesson_page_id = conv.get("lesson_page_id")
        return entry

    # ---- 公開 ----
    def get(self, student_id: str) -> _Entry:
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            self._evict_locked()
            entry = self._entries.get(student_id)
            if entry is None:
                entry = self._hydrate(student_id)
                self._entries[student_id] = entry
            entry.last_used = time.monotonic()
            return entry

    def ensure_conversation(self, student_id: str, entry: _Entry, context: dict[str, Any] | None) -> None:
        if entry.conversation_id is None:
            sid = _to_int(student_id)
            if sid is not None:
                entry.conversation_id = self.store.start_conversation(sid, context)
        elif context and context.get("lesson_page_id") and context.get("lesson_page_id") != entry.lesson_page_id:
            self.store.touch_context(entry.conversation_id, context)
        if context and context.get("lesson_page_id"):
            entry.lesson_page_id = int(context["lesson_page_id"])

    def reset(self, student_id: str) -> tuple[str, _Entry]:
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = self._entries.pop(student_id, None)
            summary = ""
            seed = None
            if old is not None:
                summary = old.session.summarize_weak_points()
                seed = old.session.export_state()
                self.store.end_conversation(old.conversation_id, "reset", summary=summary, state=seed)
            session = TutorSession(searcher=self._searcher)
            # 理解度などの長期情報は引き継ぎ、会話は新規
            session.state = restore_state(seed, same_kb=True, continue_conversation=False)
            session.answer_length = old.session.answer_length if old is not None else None
            entry = _Entry(session, None, resumed=False)
            self._entries[student_id] = entry
            return summary, entry

    def new_conversation(self, student_id: str) -> _Entry:
        """「新しい会話」: いまの会話は終了させずに置いておき（一覧から戻れる）、空の会話に切り替える。"""
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = self._entries.pop(student_id, None)
            seed = old.session.export_state() if old is not None else None
            session = TutorSession(searcher=self._searcher)
            session.state = restore_state(seed, same_kb=True, continue_conversation=False)
            session.answer_length = old.session.answer_length if old is not None else None
            entry = _Entry(session, None, resumed=False)
            self._entries[student_id] = entry
            return entry

    def switch_conversation(self, student_id: str, conversation_id: int) -> _Entry:
        """保存済みの会話に切り替える（その会話の続きとして復元）。"""
        sid = _to_int(student_id)
        if sid is None or not self.store.enabled:
            raise HTTPException(status_code=404, detail="会話が見つかりません")
        conv = self.store.load_conversation(sid, conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="会話が見つかりません")
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = self._entries.pop(student_id, None)
            same_kb = conv.get("kb_version_id") == self.store.kb_version_id
            session = TutorSession(searcher=self._searcher)
            session.state = restore_state(conv.get("state_json"), same_kb=same_kb, continue_conversation=True)
            session.answer_length = old.session.answer_length if old is not None else None
            if conv.get("ended_at") is not None and conv.get("end_reason") in ("reset", "ttl", "evicted"):
                # 終了済みの会話を開き直す: 続きとして再開できるよう終了を取り消す
                self.store.reopen_conversation(conversation_id)
            entry = _Entry(session, conversation_id, resumed=True)
            entry.lesson_page_id = conv.get("lesson_page_id")
            self._entries[student_id] = entry
            return entry

    def stats(self) -> dict[str, Any]:
        with self._guard:
            return {"active_sessions": len(self._entries), "ttl_sec": SESSION_TTL_SEC, "store": self.store.stats()}


def _to_int(s: str) -> int | None:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


store = TutorStore(os.environ.get("TUTOR_DATABASE_URL"))
manager = SessionManager(store)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("TutorSession/DeepRAGSearcher 初期化中（初回は数十秒かかることがあります）...", flush=True)
    manager.warmup()
    print("チューター準備完了。", flush=True)
    yield
    store.close()


app = FastAPI(title="LMS AI Tutor Service", version="0.2", lifespan=lifespan)


# ---- 認証（内部サービス用の簡易トークン + 学生ID） ----
def _service_auth(x_tutor_token: str | None = Header(default=None, alias="X-Tutor-Token")) -> None:
    if SERVICE_TOKEN and (x_tutor_token or "") != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid service token")


def _auth(
    x_student_id: str = Header(..., alias="X-Student-Id"),
    _: None = Depends(_service_auth),
) -> str:
    sid = (x_student_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="X-Student-Id が必要です")
    return sid


# ---- スキーマ ----
class PageContext(BaseModel):
    """学生がいま開いている教科書ページ（LMS backend が本文を埋めて渡す）。"""
    course_id: int | None = None
    lesson_item_id: int | None = None
    lesson_page_id: int | None = None
    title: str = ""
    text: str = Field(default="", max_length=20000)


class OpenRequest(BaseModel):
    page_context: PageContext | None = None


class MessageRequest(BaseModel):
    text: str = Field(default="")
    choice_id: str | None = Field(default=None)
    page_context: PageContext | None = None
    answer_length: str | None = None  # short / normal / long（指定があれば設定として保存）


class PreferencesRequest(BaseModel):
    answer_length: str | None = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class MessageResponse(BaseModel):
    reply: str
    state: dict[str, Any]
    diagnosis: dict[str, Any] | None = None
    clarify: dict[str, Any] | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    knowledge_mode: str = "textbook"
    banner: str = ""
    retrieval_path: str = ""
    turn_class: str = ""
    viz: dict[str, Any] | None = None
    conversation_id: int | None = None


class SummaryResponse(BaseModel):
    summary: str
    state: dict[str, Any]


def _ctx_dict(pc: PageContext | None) -> dict[str, Any] | None:
    if pc is None:
        return None
    return {"course_id": pc.course_id, "lesson_item_id": pc.lesson_item_id, "lesson_page_id": pc.lesson_page_id,
            "page_title": pc.title or None}


def _apply_page_context(session: TutorSession, pc: PageContext | None) -> None:
    if pc is None or not (pc.title or pc.text):
        session.page_context = None
        return
    session.page_context = {"lesson_page_id": pc.lesson_page_id, "title": pc.title, "text": pc.text}


def _concept_label(focus: str | None) -> str:
    """挨拶に出してよい概念名か。発話そのもの（文）が焦点に入っているときは名指ししない。"""
    f = (focus or "").strip()
    if not f or len(f) > 14 or any(ch in f for ch in "、。？?！!"):
        return ""
    return f


def _greeting(entry: _Entry, pc: PageContext | None, profile: dict[str, Any] | None) -> str:
    st = entry.session.state
    ls = st.learner_state
    parts: list[str] = []
    if entry.resumed:
        name = _concept_label(st.focus_concept)
        if name:
            parts.append(f"前回の続きです。「{name}」について話していました。そのまま続けてください。")
        else:
            parts.append("前回の続きです。そのまま続けてください。")
    elif profile and (profile.get("last_focus_concept") or profile.get("turn_count")):
        lvl = LEVEL_JA.get(str(ls.understanding_level), "")
        name = _concept_label(profile.get("last_focus_concept"))
        if name:
            parts.append(
                f"おかえりなさい。前回は「{name}」を学んでいましたね"
                + (f"（理解度: {lvl}）" if lvl and lvl != "未設定" else "")
                + "。続きからでも、別の質問でも大丈夫です。"
            )
        else:
            parts.append("おかえりなさい。わからないところをそのまま聞いてください。")
    else:
        parts.append("はじめまして。わからないところをそのまま聞いてください。教科書の該当箇所を引用しながら説明します。")
    if pc is not None and pc.title:
        parts.append(f"いま開いている「{pc.title}」のページについても、そのまま聞けます（「この式は？」だけでも大丈夫です）。")
    return " ".join(parts)


def _history_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        out.append({
            "seq": r["seq"], "role": r["role"], "text": r["text"], "choice_id": r.get("choice_id"),
            "banner": r.get("banner") or "", "citations": r.get("citations") or [], "viz": r.get("viz"),
            "diagnosis": r.get("diagnosis"), "clarify": r.get("clarify"), "knowledge_mode": r.get("knowledge_mode"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    return out


# ---- エンドポイント ----
@app.get("/health")
def health():
    return {"ok": manager.ready, **manager.stats()}


@app.post("/session/open")
def open_session(body: OpenRequest, student_id: str = Depends(_auth)):
    """画面を開いたとき: 引き継ぎ状況・挨拶・（継続なら）直近の履歴を返す。LLM は呼ばない。"""
    entry = manager.get(student_id)
    sid = _to_int(student_id)
    profile = store.load_profile(sid) if sid is not None else None
    with entry.lock:
        history = _history_items(store.load_turns(entry.conversation_id)) if entry.resumed and entry.conversation_id else []
        return {
            "resumed": entry.resumed,
            "conversation_id": entry.conversation_id,
            "greeting": _greeting(entry, body.page_context, profile),
            "history": history,
            "state": entry.session.debug_state(),
            "persistence": store.enabled,
            "answer_length": entry.session.answer_length or "normal",
            "conversations": _conv_items(store.list_conversations(sid)) if sid is not None else [],
        }


def _conv_items(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "title": r.get("title") or r.get("page_title") or "（無題）",
            "page_title": r.get("page_title"), "lesson_page_id": r.get("lesson_page_id"), "course_id": r.get("course_id"),
            "turn_count": r.get("turn_count"), "ended": r.get("ended_at") is not None,
            "started_at": r["started_at"].isoformat() if r.get("started_at") else None,
            "last_activity_at": r["last_activity_at"].isoformat() if r.get("last_activity_at") else None,
        })
    return out


@app.get("/session/conversations")
def list_conversations(student_id: str = Depends(_auth)):
    entry = manager.get(student_id)
    sid = _to_int(student_id)
    return {"current_id": entry.conversation_id, "items": _conv_items(store.list_conversations(sid)) if sid is not None else []}


@app.post("/session/conversations")
def new_conversation(student_id: str = Depends(_auth)):
    entry = manager.new_conversation(student_id)
    return {"conversation_id": entry.conversation_id, "state": entry.session.debug_state()}


@app.post("/session/conversations/{conversation_id}/switch")
def switch_conversation(conversation_id: int, student_id: str = Depends(_auth)):
    entry = manager.switch_conversation(student_id, conversation_id)
    with entry.lock:
        last = store.load_turns(conversation_id, 40)
        return {"conversation_id": conversation_id, "history": _history_items(last), "state": entry.session.debug_state()}


@app.put("/session/conversations/{conversation_id}")
def rename_conversation(conversation_id: int, body: RenameRequest, student_id: str = Depends(_auth)):
    sid = _to_int(student_id)
    if sid is None or not store.rename_conversation(sid, conversation_id, body.title.strip()):
        raise HTTPException(status_code=404, detail="会話が見つかりません")
    return {"ok": True}


@app.delete("/session/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, student_id: str = Depends(_auth)):
    sid = _to_int(student_id)
    if sid is None or not store.delete_conversation(sid, conversation_id):
        raise HTTPException(status_code=404, detail="会話が見つかりません")
    entry = manager.get(student_id)
    if entry.conversation_id == conversation_id:
        manager.new_conversation(student_id)
    return {"ok": True}


@app.post("/session/preferences")
def set_preferences(body: PreferencesRequest, student_id: str = Depends(_auth)):
    if body.answer_length is not None and body.answer_length not in ANSWER_LENGTHS:
        raise HTTPException(status_code=400, detail="answer_length は short / normal / long")
    entry = manager.get(student_id)
    with entry.lock:
        entry.session.answer_length = body.answer_length
    sid = _to_int(student_id)
    if sid is not None:
        store.save_preferences(sid, answer_length=body.answer_length)
    return {"ok": True, "answer_length": body.answer_length or "normal"}


@app.post("/session/message", response_model=MessageResponse)
def post_message(body: MessageRequest, student_id: str = Depends(_auth)):
    text = (body.text or "").strip()
    choice_id = (body.choice_id or "").strip() or None
    if not text and not choice_id:
        raise HTTPException(status_code=400, detail="text または choice_id が必要です")
    entry = manager.get(student_id)
    with entry.lock:  # TutorSession はスレッドセーフでないため学生単位で直列化
        session = entry.session
        manager.ensure_conversation(student_id, entry, _ctx_dict(body.page_context))
        _apply_page_context(session, body.page_context)
        if body.answer_length in ANSWER_LENGTHS and body.answer_length != (session.answer_length or "normal"):
            session.answer_length = body.answer_length
            sid0 = _to_int(student_id)
            if sid0 is not None:
                store.save_preferences(sid0, answer_length=body.answer_length)
        t0 = time.monotonic()
        turn = session.handle_turn(text or choice_id or "", choice_id=choice_id)
        latency_ms = int((time.monotonic() - t0) * 1000)
        state = turn.get("state") or session.debug_state()
        sid = _to_int(student_id)
        if sid is not None:
            try:
                store.record_turn_pair(
                    conversation_id=entry.conversation_id, student_id=sid, student_text=text, choice_id=choice_id,
                    turn=turn, state=session.export_state(), debug_state=session.debug_state(),
                    lesson_page_id=entry.lesson_page_id, latency_ms=latency_ms, llm_model=LLM_MODEL,
                )
            except Exception as exc:  # 永続化失敗で対話を止めない
                print(f"  [store] record failed: {exc}", flush=True)
    return MessageResponse(
        reply=str(turn.get("reply") or ""),
        state=state,
        diagnosis=turn.get("diagnosis"),
        clarify=turn.get("clarify"),
        citations=list(turn.get("citations") or []),
        knowledge_mode=str(turn.get("knowledge_mode") or "textbook"),
        banner=str(turn.get("banner") or ""),
        retrieval_path=str(turn.get("retrieval_path") or ""),
        turn_class=str(turn.get("turn_class") or ""),
        viz=turn.get("viz"),
        conversation_id=entry.conversation_id,
    )


@app.get("/session/history")
def get_history(limit: int = Query(default=40, ge=1, le=200), student_id: str = Depends(_auth)):
    entry = manager.get(student_id)
    if entry.conversation_id is None:
        return {"conversation_id": None, "items": []}
    return {"conversation_id": entry.conversation_id, "items": _history_items(store.load_turns(entry.conversation_id, limit))}


@app.get("/session/summary", response_model=SummaryResponse)
def get_summary(student_id: str = Depends(_auth)):
    entry = manager.get(student_id)
    with entry.lock:
        return SummaryResponse(summary=entry.session.summarize_weak_points(), state=entry.session.debug_state())


@app.get("/session/state")
def get_state(student_id: str = Depends(_auth)):
    entry = manager.get(student_id)
    with entry.lock:
        return {"exists": True, "conversation_id": entry.conversation_id, "resumed": entry.resumed,
                "state": entry.session.debug_state()}


@app.post("/session/reset", response_model=SummaryResponse)
def post_reset(student_id: str = Depends(_auth)):
    summary, entry = manager.reset(student_id)
    return SummaryResponse(summary=summary, state=entry.session.debug_state())


# ---- 類似問題（既存の教員作成問題のランキング。生成はしない） ----
EXPOSURE_COOLDOWN_DAYS = int(os.environ.get("TUTOR_EXPOSURE_COOLDOWN_DAYS", "30"))  # 0 = 期限なし（一度出したら出さない）
# 学生の解答履歴に基づく優先度（前回不正解 > 未回答 > 正解済み）。類似度への加点として効かせる
STATUS_BONUS = {"wrong": 0.08, "unanswered": 0.03, "correct": -0.05}


class RelatedCandidate(BaseModel):
    id: int
    text: str = Field(max_length=4000)
    status: str = "unknown"         # wrong / unanswered / correct / unknown（LMS の解答履歴。backend が付ける）
    difficulty: float | None = None
    tags: list[str] = Field(default_factory=list)


class RelatedRankRequest(BaseModel):
    query: str = Field(max_length=2000)
    candidates: list[RelatedCandidate] = Field(default_factory=list, max_length=2000)
    top_k: int = Field(default=3, ge=1, le=20)
    min_score: float = 0.53           # bge-m3 の実測: 無関係 ≈0.50 / 関係あり 0.55〜0.66
    max_gap: float = 0.07            # 上位との類似度差がこれより大きい候補は別話題とみなして落とす
    mastery: float | None = None     # 科目の習熟度（0..1）。難易度の並びに使う
    record: bool = True              # 返した問題を「提示した」として記録する
    student_id: int | None = None    # 省略時は X-Student-Id


@app.post("/related/rank")
def related_rank(
    body: RelatedRankRequest,
    _: None = Depends(_service_auth),
    x_student_id: str | None = Header(default=None, alias="X-Student-Id"),
):
    """類似度で絞る → 既に出した問題を除外（不正解の問題は例外） → 解答履歴・タグ・習熟度で並べ替え → 提示を記録。"""
    if manager._searcher is None:
        raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
    model_id = getattr(manager._searcher, "embed_model_id", "BAAI/bge-m3")
    sid = body.student_id if body.student_id is not None else _to_int(x_student_id or "")
    cands = {c.id: c for c in body.candidates}
    ranked = rank_related(model_id, body.query, [{"id": c.id, "text": c.text} for c in body.candidates],
                          top_k=max(body.top_k * 4, 12), min_score=body.min_score)
    if ranked:
        top = float(ranked[0]["score"])
        ranked = [r for r in ranked if float(r["score"]) >= top - body.max_gap]
    # トピック固定: 問い合わせ（焦点概念＋発話）に単元タグ名が含まれていれば、そのタグの問題だけにする。
    # 「不正解なら再提示」もこの中だけで効くので、隣のトピック（単位行列の話題中に行列式など）は混ざらない。
    # 候補の大半に付いているタグ（線形代数 など教科名）は単元を表さないので無視する
    q_lower = body.query.lower()
    n_cand = max(len(body.candidates), 1)
    tag_freq: dict[str, int] = {}
    for c in body.candidates:
        for t in set(c.tags):
            tag_freq[t] = tag_freq.get(t, 0) + 1
    topic_tags = {t for t, n in tag_freq.items() if len(t) >= 2 and n / n_cand <= 0.5 and t.lower() in q_lower}
    if topic_tags:
        locked = [r for r in ranked if set(cands[r["id"]].tags) & topic_tags]
        if locked:
            ranked = locked
    # ここまでで「いまの話題に関係ある問題」だけに絞れている（min_score と上位差、タグ一致）。
    # 以降の「不正解なら再提示」「不正解に加点」は、この絞り込みを通った問題にしか効かない
    # → 話題と関係ない不正解問題が浮いてくることはない。
    # 既に出した問題は外す。ただし「前回不正解」はもう一度出す
    exposures = store.load_exposures(sid, EXPOSURE_COOLDOWN_DAYS) if sid is not None else {}
    suppressed: list[int] = []
    kept = []
    for r in ranked:
        c = cands[r["id"]]
        if r["id"] in exposures and c.status != "wrong":
            suppressed.append(r["id"])
            continue
        kept.append(r)
    for r in kept:
        c = cands[r["id"]]
        adj = float(r["score"]) + STATUS_BONUS.get(c.status, 0.0)
        if any(t and t.lower() in q_lower for t in c.tags):
            adj += 0.05
        if body.mastery is not None and c.difficulty is not None:
            adj += (c.difficulty - 2.5) * 0.01 * (1 if body.mastery >= 0.7 else -1)
        r["adj_score"] = round(adj, 4)
        r["status"] = c.status
        ex = exposures.get(r["id"])
        r["shown_before"] = bool(ex)
        r["shown_times"] = int(ex["times"]) if ex else 0
    kept.sort(key=lambda r: -r["adj_score"])
    kept = kept[: body.top_k]
    if body.record and sid is not None and kept:
        conv_id = None
        with manager._guard:
            e = manager._entries.get(str(sid))
            conv_id = e.conversation_id if e else None
        store.record_exposures(sid, conv_id, [(r["id"], r["status"]) for r in kept])
    return {"items": kept, "suppressed": suppressed, "topic_tags": sorted(topic_tags), "model": model_id,
            "cooldown_days": EXPOSURE_COOLDOWN_DAYS}


class RelatedEventRequest(BaseModel):
    question_id: int
    kind: str = Field(pattern="^(revealed|clicked)$")


@app.post("/related/event")
def related_event(body: RelatedEventRequest, student_id: str = Depends(_auth)):
    """「答えを確認」「演習ページで解く」を記録する。"""
    sid = _to_int(student_id)
    ok = store.mark_exposure(sid, body.question_id, body.kind) if sid is not None else False
    return {"ok": ok}


# ---- 教員／管理用（LMS backend が教員権限を確認してから呼ぶ） ----
@app.get("/admin/questions")
def admin_questions(
    limit: int = Query(default=100, ge=1, le=1000),
    course_id: int | None = None,
    student_id: int | None = None,
    since: datetime | None = None,
    _: None = Depends(_service_auth),
):
    rows = store.list_questions(limit=limit, course_id=course_id, student_id=student_id, since=since)
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = r["created_at"].isoformat()
    return {"items": rows, "persistence": store.enabled}


def main() -> None:
    import uvicorn

    uvicorn.run(app, host=os.environ.get("TUTOR_HOST", "0.0.0.0"), port=int(os.environ.get("TUTOR_PORT", "8765")))


if __name__ == "__main__":
    main()
