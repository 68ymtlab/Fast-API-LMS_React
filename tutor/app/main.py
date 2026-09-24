"""AI チューター サービス（LMS 内部サービス）

agents/workspace/rag/project/tutor-web/app/tutor_web.py を LMS 向けに移植・拡張したもの。
  - Postgres 有効時は要求ごとに学生状態を復元し、学生単位の DB ロック下で処理
  - Postgres 未設定の開発時のみ、学生ごとのプロセス内セッション（TTL 付き）
  - Postgres（tutor スキーマ）への会話・質問・プロファイルの永続化と、再起動／翌日の引き継ぎ（store.py / state_io.py）
  - 教科書ページ文脈（page_context）の注入
  - 公開 API は LMS backend（/api/tutor/*）からのみ呼ばれる想定。X-Student-Id = LMS の users.id
"""
from __future__ import annotations

import os
import re
import sys
import threading
import time
from contextlib import asynccontextmanager, contextmanager
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

import deeprag_search  # noqa: E402
import tutor_session as tutor_session_mod  # noqa: E402
from deeprag_search import LLM_BASE_URL, LLM_API_KEY  # noqa: E402
from reflection import reflect  # noqa: E402
from sections import SectionMatcher  # noqa: E402
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
    """DeepRAGSearcher is process-local; with persistence on, learner state is loaded per request from Postgres."""

    def __init__(self, store: TutorStore) -> None:
        self.store = store
        self._searcher = None
        self._entries: dict[str, _Entry] = {}
        self._guard = threading.Lock()
        self.sections = SectionMatcher([])

    def warmup(self) -> None:
        with self._guard:
            if self._searcher is None:
                self._searcher = TutorSession().searcher
        self.store.connect(STAGE4_DIR, len(getattr(self._searcher, "entities", {}) or {}) or None)
        # LMS ページ → KG 節 の対応表（KG の節名から）
        ents = getattr(self._searcher, "entities", {}) or {}
        self.sections = SectionMatcher([e.get("section") for e in ents.values()], ents)
        apply_settings(self.store.get_settings())

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
        """Build a request-local session from the selected conversation snapshot and learner profile."""
        session = TutorSession(searcher=self._searcher)
        sid = _to_int(student_id)
        if sid is None or not self.store.enabled:
            return _Entry(session, None, resumed=False)
        profile = self.store.load_profile(sid)
        if profile and profile.get("answer_length") in ANSWER_LENGTHS:
            session.answer_length = profile["answer_length"]
        pointer_exists, active_id = self.store.active_session(sid)
        active = self.store.load_conversation(sid, active_id) if active_id is not None else None
        # Before active_sessions existed, recover the most recent unfinished conversation once.
        legacy = self.store.load_latest_conversation(sid) if not pointer_exists else None
        carry = active or legacy or self.store.load_latest_conversation(sid)

        def is_recent(conv: dict[str, Any] | None) -> bool:
            last = conv.get("last_activity_at") if conv else None
            return bool(last) and (datetime.now(timezone.utc) - last) < timedelta(seconds=RESUME_WINDOW_SEC)

        cont = bool(active and active.get("ended_at") is None and is_recent(active))
        if not pointer_exists and legacy and legacy.get("ended_at") is None and is_recent(legacy):
            active = legacy
            carry = legacy
            cont = True
            self.store.set_active_session(sid, int(legacy["id"]))
        elif not pointer_exists:
            if legacy and legacy.get("ended_at") is None:
                self.store.end_conversation(int(legacy["id"]), "ttl", state=legacy.get("state_json"))
            self.store.set_active_session(sid, None)
        elif active_id is not None and not cont:
            # Resume eligibility is a conversation rule; cache expiry must never silently end it.
            if active and active.get("ended_at") is None:
                self.store.end_conversation(active_id, "ttl", state=active.get("state_json"))
            self.store.set_active_session(sid, None)

        if carry:
            same_kb = carry.get("kb_version_id") == self.store.kb_version_id
            session.state = restore_state(carry.get("state_json"), same_kb=same_kb, continue_conversation=cont)
        entry = _Entry(session, int(active["id"]) if cont and active else None,
                       resumed=bool(cont and active and int(active.get("turn_count") or 0) > 0))
        if cont and active:
            entry.lesson_page_id = active.get("lesson_page_id")
        return entry

    @contextmanager
    def session(self, student_id: str):
        """Use a fresh DB-backed state under a cross-process lock; retain the old cache only in dev fallback mode."""
        if not self.store.enabled:
            entry = self.get(student_id)
            with entry.lock:
                yield entry
            return
        sid = _to_int(student_id)
        if sid is None:
            raise HTTPException(status_code=401, detail="学生IDが不正です")
        with self.store.student_lock(sid):
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            entry = self._hydrate(student_id)
            with entry.lock:
                yield entry

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
        # Page identity is request-scoped. In particular, a standalone Tutor request
        # clears the previous page instead of inheriting it from conversation metadata.
        page_id = context.get("lesson_page_id") if context else None
        entry.lesson_page_id = int(page_id) if page_id is not None else None

    def reset_session(self, student_id: str, current: _Entry | None = None) -> tuple[str, _Entry]:
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = current if self.store.enabled else self._entries.pop(student_id, None)
            summary = ""
            seed = None
            if old is not None:
                summary = old.session.summarize_weak_points()
                seed = old.session.export_state()
                self.store.end_conversation(old.conversation_id, "reset", summary=summary, state=seed)
            sid = _to_int(student_id)
            if self.store.enabled and sid is not None:
                self.store.set_active_session(sid, None)
            session = TutorSession(searcher=self._searcher)
            # 理解度などの長期情報は引き継ぎ、会話は新規
            session.state = restore_state(seed, same_kb=True, continue_conversation=False)
            session.answer_length = old.session.answer_length if old is not None else None
            entry = _Entry(session, None, resumed=False)
            if not self.store.enabled:
                self._entries[student_id] = entry
            return summary, entry

    def new_conversation(self, student_id: str, current: _Entry | None = None) -> _Entry:
        """「新しい会話」: いまの会話は終了させずに置いておき（一覧から戻れる）、空の会話に切り替える。"""
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = current if self.store.enabled else self._entries.pop(student_id, None)
            seed = old.session.export_state() if old is not None else None
            session = TutorSession(searcher=self._searcher)
            session.state = restore_state(seed, same_kb=True, continue_conversation=False)
            session.answer_length = old.session.answer_length if old is not None else None
            entry = _Entry(session, None, resumed=False)
            sid = _to_int(student_id)
            if self.store.enabled and sid is not None:
                entry.conversation_id = self.store.start_conversation(sid, None, session.export_state())
            else:
                self._entries[student_id] = entry
            return entry

    def switch_conversation(self, student_id: str, conversation_id: int, current: _Entry | None = None) -> _Entry:
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
            old = current if self.store.enabled else self._entries.pop(student_id, None)
            same_kb = conv.get("kb_version_id") == self.store.kb_version_id
            session = TutorSession(searcher=self._searcher)
            session.state = restore_state(conv.get("state_json"), same_kb=same_kb, continue_conversation=True)
            session.answer_length = old.session.answer_length if old is not None else None
            # A deliberate selection is an explicit resume, even after the automatic resume window.
            self.store.reopen_conversation(sid, conversation_id)
            if not self.store.set_active_session(sid, conversation_id):
                raise HTTPException(status_code=404, detail="会話が見つかりません")
            entry = _Entry(session, conversation_id, resumed=True)
            entry.lesson_page_id = conv.get("lesson_page_id")
            if not self.store.enabled:
                self._entries[student_id] = entry
            return entry

    def stats(self) -> dict[str, Any]:
        with self._guard:
            active = self.store.active_session_count() if self.store.enabled else len(self._entries)
            return {
                "active_sessions": active,
                "state_backend": "postgres" if self.store.enabled else "process-memory",
                "ttl_sec": None if self.store.enabled else SESSION_TTL_SEC,
                "store": self.store.stats(),
            }

    def active_conversation_id(self, student_id: str) -> int | None:
        sid = _to_int(student_id)
        if sid is None:
            return None
        if self.store.enabled:
            exists, conversation_id = self.store.active_session(sid)
            return conversation_id if exists else None
        with self._guard:
            entry = self._entries.get(student_id)
            return entry.conversation_id if entry else None


def _to_int(s: str) -> int | None:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def current_model() -> str:
    return str(deeprag_search.LLM_MODEL)


def apply_settings(settings: dict[str, Any]) -> dict[str, Any]:
    """tutor.settings を実行時に反映（再起動不要）。対象: llm_model / page_section_overrides。"""
    applied: dict[str, Any] = {}
    model = settings.get("llm_model")
    if isinstance(model, str) and model.strip():
        deeprag_search.LLM_MODEL = model.strip()
        tutor_session_mod.LLM_MODEL = model.strip()   # tutor_session は値を import しているので両方に書く
        applied["llm_model"] = model.strip()
    ov = settings.get("page_section_overrides")
    if isinstance(ov, dict):
        manager.sections.set_overrides(ov)
        applied["page_section_overrides"] = len(ov)
    return applied


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
    learner_evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=8)


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
    turn_id: int | None = None          # フィードバック用（チュータ返答の turns.id）
    page_section: str | None = None     # 開いていたページに対応付いた KG の節


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
    section = manager.sections.match(pc.title, pc.lesson_page_id)   # 対応する KG の節（検索の一次候補をこの節に寄せる）
    session.page_context = {
        "course_id": pc.course_id,
        "lesson_page_id": pc.lesson_page_id,
        "title": pc.title,
        "text": pc.text,
        "section": section,
    }


def _sanitize_learner_evidence(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Accept only bounded, backend-shaped exercise evidence; never persist it as mastery."""
    safe: list[dict[str, Any]] = []
    for item in items[:8]:
        if not isinstance(item, dict):
            continue
        ref = str(item.get("ref") or "")
        if not re.fullmatch(r"exercise:\d+:\d+", ref):
            continue
        tags = item.get("topic_tags") if isinstance(item.get("topic_tags"), list) else []
        result = str(item.get("result") or "unknown")
        if result not in ("correct", "incorrect", "unknown"):
            result = "unknown"
        safe.append({
            "ref": ref,
            "source": "exercise",
            "topic_tags": [str(tag)[:80] for tag in tags[:8]],
            "item_title": str(item.get("item_title") or "")[:180],
            "result": result,
            "recorded_at": str(item.get("recorded_at") or "")[:40],
        })
    return safe


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
            "id": r.get("id"), "seq": r["seq"], "role": r["role"], "text": r["text"], "choice_id": r.get("choice_id"),
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
    sid = _to_int(student_id)
    with manager.session(student_id) as entry:
        profile = store.load_profile(sid) if sid is not None else None
        history = _history_items(store.load_turns(entry.conversation_id, student_id=sid)) if entry.resumed and entry.conversation_id else []
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
    sid = _to_int(student_id)
    with manager.session(student_id) as entry:
        return {"current_id": entry.conversation_id, "items": _conv_items(store.list_conversations(sid)) if sid is not None else []}


@app.post("/session/conversations")
def new_conversation(student_id: str = Depends(_auth)):
    with manager.session(student_id) as current:
        entry = manager.new_conversation(student_id, current=current)
        return {"conversation_id": entry.conversation_id, "state": entry.session.debug_state()}


@app.post("/session/conversations/{conversation_id}/switch")
def switch_conversation(conversation_id: int, student_id: str = Depends(_auth)):
    with manager.session(student_id) as current:
        entry = manager.switch_conversation(student_id, conversation_id, current=current)
        last = store.load_turns(conversation_id, 40, student_id=_to_int(student_id))
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
    if sid is None:
        raise HTTPException(status_code=404, detail="会話が見つかりません")
    with manager.session(student_id) as entry:
        if not store.delete_conversation(sid, conversation_id):
            raise HTTPException(status_code=404, detail="会話が見つかりません")
        if entry.conversation_id == conversation_id:
            manager.new_conversation(student_id, current=entry)
        return {"ok": True}


@app.post("/session/preferences")
def set_preferences(body: PreferencesRequest, student_id: str = Depends(_auth)):
    if body.answer_length is not None and body.answer_length not in ANSWER_LENGTHS:
        raise HTTPException(status_code=400, detail="answer_length は short / normal / long")
    with manager.session(student_id) as entry:
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
    sid = _to_int(student_id)
    with manager.session(student_id) as entry:
        session = entry.session
        manager.ensure_conversation(student_id, entry, _ctx_dict(body.page_context))
        _apply_page_context(session, body.page_context)
        session.learner_evidence = _sanitize_learner_evidence(body.learner_evidence)
        if body.answer_length in ANSWER_LENGTHS and body.answer_length != (session.answer_length or "normal"):
            session.answer_length = body.answer_length
            if sid is not None:
                store.save_preferences(sid, answer_length=body.answer_length)
        t0 = time.monotonic()
        turn = session.handle_turn(text or choice_id or "", choice_id=choice_id)
        latency_ms = int((time.monotonic() - t0) * 1000)
        session.learner_evidence = []
        state = turn.get("state") or session.debug_state()
        turn_id = None
        if sid is not None and store.enabled:
            try:
                turn_id = store.record_turn_pair(
                    conversation_id=entry.conversation_id, student_id=sid, student_text=text, choice_id=choice_id,
                    turn=turn, state=session.export_state(), debug_state=session.debug_state(),
                    lesson_page_id=entry.lesson_page_id, latency_ms=latency_ms, llm_model=current_model(),
                )
            except Exception as exc:
                print(f"  [store] record failed: {exc}", flush=True)
                raise HTTPException(status_code=503, detail="会話を保存できませんでした。再度お試しください。") from exc
            if turn_id is None:
                raise HTTPException(status_code=503, detail="会話を保存できませんでした。再度お試しください。")
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
        turn_id=turn_id,
        page_section=(session.page_context or {}).get("section") if session.page_context else None,
    )


@app.get("/session/history")
def get_history(limit: int = Query(default=40, ge=1, le=200), student_id: str = Depends(_auth)):
    with manager.session(student_id) as entry:
        if entry.conversation_id is None:
            return {"conversation_id": None, "items": []}
        return {"conversation_id": entry.conversation_id,
                "items": _history_items(store.load_turns(entry.conversation_id, limit, student_id=_to_int(student_id)))}


class ReflectRequest(BaseModel):
    """backend が LMS 側の事実（演習の結果）を添えて呼ぶ。"""
    exercise: list[dict[str, Any]] = Field(default_factory=list)   # [{title, status, attempts, last_at}]
    scope: str = Field(default="current", pattern="^(current|previous|all)$")
    days: int = Field(default=30, ge=1, le=365)


@app.get("/session/summary", response_model=SummaryResponse)
def get_summary(student_id: str = Depends(_auth)):
    """互換: 研究側テンプレの振り返り（LLM 不使用）。"""
    with manager.session(student_id) as entry:
        return SummaryResponse(summary=entry.session.summarize_weak_points(), state=entry.session.debug_state())


@app.post("/session/reflect")
def post_reflect(body: ReflectRequest, student_id: str = Depends(_auth)):
    """深い振り返り: 会話ログ・理解度・演習結果・KG を材料に LLM で構造化（1 回の呼び出し）。失敗時はテンプレに戻す。"""
    sid = _to_int(student_id)
    with manager.session(student_id) as entry:
        profile = store.load_profile(sid) if sid is not None else None
        if body.scope == "current":
            turns = store.load_turns(entry.conversation_id, 60, student_id=sid) if entry.conversation_id else []
        elif body.scope == "previous":
            prev_id = store.previous_conversation_id(sid, entry.conversation_id) if sid is not None else None
            turns = store.load_recent_turns(sid, days=365, limit=80, only_conversation_id=prev_id) if prev_id else []
        else:
            turns = store.load_recent_turns(sid, days=body.days, limit=120) if sid is not None else []
        out = reflect(entry.session, turns=turns, exercise=body.exercise, profile=profile, scope=body.scope, days=body.days)
        out["state"] = entry.session.debug_state()
        return out


@app.get("/session/state")
def get_state(student_id: str = Depends(_auth)):
    with manager.session(student_id) as entry:
        return {"exists": True, "conversation_id": entry.conversation_id, "resumed": entry.resumed,
                "state": entry.session.debug_state()}


@app.post("/session/reset", response_model=SummaryResponse)
def post_reset(student_id: str = Depends(_auth)):
    with manager.session(student_id) as current:
        summary, entry = manager.reset_session(student_id, current=current)
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
    eligible = len(kept)  # 今回出せる問題の総数（top_k で切る前）。「他の問題も解く」の案内に使う
    kept = kept[: body.top_k]
    if body.record and sid is not None and kept:
        with store.student_lock(sid):
            conv_id = manager.active_conversation_id(str(sid))
            store.record_exposures(sid, conv_id, [(r["id"], r["status"]) for r in kept])
    return {"items": kept, "suppressed": suppressed, "eligible": eligible, "topic_tags": sorted(topic_tags),
            "model": model_id, "cooldown_days": EXPOSURE_COOLDOWN_DAYS}


class RelatedEventRequest(BaseModel):
    question_id: int
    kind: str = Field(pattern="^(revealed|clicked)$")


@app.post("/related/event")
def related_event(body: RelatedEventRequest, student_id: str = Depends(_auth)):
    """「答えを確認」「演習ページで解く」を記録する。"""
    sid = _to_int(student_id)
    ok = store.mark_exposure(sid, body.question_id, body.kind) if sid is not None else False
    return {"ok": ok}


class FeedbackRequest(BaseModel):
    turn_id: int
    rating: int = Field(ge=-1, le=1)
    comment: str | None = Field(default=None, max_length=1000)


@app.post("/session/feedback")
def post_feedback(body: FeedbackRequest, student_id: str = Depends(_auth)):
    """チュータ返答への 👍👎（rating=1/-1）と任意コメント。"""
    if body.rating not in (-1, 1):
        raise HTTPException(status_code=400, detail="rating は 1 か -1")
    sid = _to_int(student_id)
    ok = store.save_feedback(sid, body.turn_id, body.rating, (body.comment or "").strip() or None) if sid is not None else False
    return {"ok": ok}


# ---- 教員／管理用（LMS backend が教員権限を確認してから呼ぶ） ----
@app.get("/admin/stats")
def admin_stats(days: int = Query(default=30, ge=1, le=365), course_id: int | None = None, _: None = Depends(_service_auth)):
    return store.teacher_stats(days=days, course_id=course_id)


@app.get("/admin/settings")
def admin_get_settings(_: None = Depends(_service_auth)):
    saved = store.get_settings()
    return {"settings": saved, "effective": {"llm_model": current_model(), "llm_base_url": LLM_BASE_URL,
            "embed_model": getattr(manager._searcher, "embed_model_id", None), "rerank_model": getattr(manager._searcher, "rerank_model_id", None),
            "kb_version_id": store.kb_version_id, "persistence": store.enabled}}


class SettingsRequest(BaseModel):
    llm_model: str | None = Field(default=None, max_length=200)
    page_section_overrides: dict[str, str] | None = None
    updated_by: int | None = None


@app.put("/admin/settings")
def admin_put_settings(body: SettingsRequest, _: None = Depends(_service_auth)):
    """再起動なしで反映し、tutor.settings に保存（次回起動時にも適用）。"""
    changes: dict[str, Any] = {}
    if body.llm_model is not None:
        changes["llm_model"] = body.llm_model.strip()
    if body.page_section_overrides is not None:
        changes["page_section_overrides"] = body.page_section_overrides
    for k, v in changes.items():
        store.set_setting(k, v, body.updated_by)
    applied = apply_settings(changes)
    return {"ok": True, "applied": applied, "effective_model": current_model()}


@app.get("/admin/models")
def admin_models(_: None = Depends(_service_auth)):
    """LiteLLM ゲートウェイが提供するチャットモデル一覧（選択肢）。"""
    import urllib.error
    import urllib.request
    try:
        req = urllib.request.Request(f"{LLM_BASE_URL.rstrip('/')}/v1/models", headers={"Authorization": f"Bearer {LLM_API_KEY}"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            import json as _json
            data = _json.loads(resp.read().decode("utf-8"))
        ids = sorted({m.get("id") for m in data.get("data", []) if m.get("id")})
    except Exception as exc:  # noqa: BLE001
        # ゲートウェイが一覧を出さない（401 など）場合は env の候補リストにフォールバック
        choices = [m.strip() for m in os.environ.get("TUTOR_MODEL_CHOICES", "").split(",") if m.strip()]
        return {"models": sorted(set(choices + [current_model()])), "error": str(exc)[:200], "current": current_model(), "source": "env"}
    return {"models": ids, "current": current_model(), "source": "gateway"}


class SectionsRequest(BaseModel):
    pages: list[dict[str, Any]] = Field(default_factory=list)   # [{lesson_page_id, title}]


@app.post("/admin/sections")
def admin_sections(body: SectionsRequest, _: None = Depends(_service_auth)):
    """LMS のページ → KG の節 の対応表（教員ビュー用）。"""
    return {"items": manager.sections.table(body.pages), "sections": manager.sections.sections}


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
