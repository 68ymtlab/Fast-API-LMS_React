"""AI チューター サービス（LMS 内部サービス）

agents/workspace/rag/project/tutor-web/app/tutor_web.py を LMS 向けに移植したもの。
違い:
  - 単一セッション → 学生ごとのセッション（SessionManager, TTL 付き）
  - HTML 配信なし（UI は LMS フロントエンド側）
  - 公開 API は LMS backend（/api/tutor/*）からのみ呼ばれる想定。
    呼び出し元は X-Student-Id ヘッダで学生を識別する（LMS backend が JWT 検証済みの user.id を入れる）。
"""
from __future__ import annotations

import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

# 本番経路: クエリ埋め込みは vLLM(LiteLLM) /v1/embeddings、リランクは Manager /rerank
os.environ.setdefault("DEEPRAG_USE_VLLM_EMBED", "1")

APP_DIR = Path(__file__).resolve().parent
CORE_DIR = Path(os.environ.get("TUTOR_CORE_DIR", APP_DIR.parent / "core"))
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

from fastapi import Depends, FastAPI, Header, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from tutor_session import TutorSession  # noqa: E402

SESSION_TTL_SEC = int(os.environ.get("TUTOR_SESSION_TTL_SEC", str(30 * 60)))
SESSION_MAX = int(os.environ.get("TUTOR_SESSION_MAX", "200"))
SERVICE_TOKEN = os.environ.get("TUTOR_SERVICE_TOKEN", "").strip()


class _Entry:
    __slots__ = ("session", "lock", "last_used")

    def __init__(self, session: TutorSession):
        self.session = session
        self.lock = threading.Lock()
        self.last_used = time.monotonic()


class SessionManager:
    """student_id → TutorSession。DeepRAGSearcher（重い）はプロセス内で共有する。"""

    def __init__(self) -> None:
        self._searcher = None
        self._entries: dict[str, _Entry] = {}
        self._guard = threading.Lock()

    def warmup(self) -> None:
        with self._guard:
            if self._searcher is None:
                self._searcher = TutorSession().searcher

    @property
    def ready(self) -> bool:
        return self._searcher is not None

    def _evict_locked(self) -> None:
        now = time.monotonic()
        expired = [k for k, e in self._entries.items() if now - e.last_used > SESSION_TTL_SEC]
        for k in expired:
            self._entries.pop(k, None)
        if len(self._entries) > SESSION_MAX:
            for k, _ in sorted(self._entries.items(), key=lambda kv: kv[1].last_used)[
                : len(self._entries) - SESSION_MAX
            ]:
                self._entries.pop(k, None)

    def get(self, student_id: str, create: bool = True) -> _Entry | None:
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            self._evict_locked()
            entry = self._entries.get(student_id)
            if entry is None and create:
                entry = _Entry(TutorSession(searcher=self._searcher))
                self._entries[student_id] = entry
            if entry is not None:
                entry.last_used = time.monotonic()
            return entry

    def reset(self, student_id: str) -> tuple[TutorSession | None, TutorSession]:
        with self._guard:
            if self._searcher is None:
                raise HTTPException(status_code=503, detail="チューターがまだ初期化されていません")
            old = self._entries.pop(student_id, None)
            new = _Entry(TutorSession(searcher=self._searcher))
            self._entries[student_id] = new
            return (old.session if old else None), new.session

    def stats(self) -> dict[str, Any]:
        with self._guard:
            return {"active_sessions": len(self._entries), "ttl_sec": SESSION_TTL_SEC}


manager = SessionManager()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("TutorSession/DeepRAGSearcher 初期化中（初回は数十秒かかることがあります）...", flush=True)
    manager.warmup()
    print("チューター準備完了。", flush=True)
    yield


app = FastAPI(title="LMS AI Tutor Service", version="0.1", lifespan=lifespan)


# ---- 認証（内部サービス用の簡易トークン + 学生ID） ----
def _auth(
    x_student_id: str = Header(..., alias="X-Student-Id"),
    x_tutor_token: str | None = Header(default=None, alias="X-Tutor-Token"),
) -> str:
    if SERVICE_TOKEN and (x_tutor_token or "") != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid service token")
    sid = (x_student_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="X-Student-Id が必要です")
    return sid


# ---- スキーマ（tutor_web.py と同形） ----
class MessageRequest(BaseModel):
    text: str = Field(default="")
    choice_id: str | None = Field(default=None)


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


class SummaryResponse(BaseModel):
    summary: str
    state: dict[str, Any]


# ---- エンドポイント ----
@app.get("/health")
def health():
    return {"ok": manager.ready, **manager.stats()}


@app.post("/session/message", response_model=MessageResponse)
def post_message(body: MessageRequest, student_id: str = Depends(_auth)):
    text = (body.text or "").strip()
    choice_id = (body.choice_id or "").strip() or None
    if not text and not choice_id:
        raise HTTPException(status_code=400, detail="text または choice_id が必要です")
    entry = manager.get(student_id)
    assert entry is not None
    with entry.lock:  # TutorSession はスレッドセーフでないため学生単位で直列化
        session = entry.session
        turn = session.handle_turn(text or choice_id or "", choice_id=choice_id)
        state = turn.get("state") or session.debug_state()
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
    )


@app.get("/session/summary", response_model=SummaryResponse)
def get_summary(student_id: str = Depends(_auth)):
    entry = manager.get(student_id)
    assert entry is not None
    with entry.lock:
        return SummaryResponse(
            summary=entry.session.summarize_weak_points(),
            state=entry.session.debug_state(),
        )


@app.get("/session/state")
def get_state(student_id: str = Depends(_auth)):
    entry = manager.get(student_id, create=False)
    if entry is None:
        return {"exists": False, "state": None}
    with entry.lock:
        return {"exists": True, "state": entry.session.debug_state()}


@app.post("/session/reset", response_model=SummaryResponse)
def post_reset(student_id: str = Depends(_auth)):
    old, new = manager.reset(student_id)
    summary = old.summarize_weak_points() if old is not None else ""
    return SummaryResponse(summary=summary, state=new.debug_state())


def main() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("TUTOR_HOST", "0.0.0.0"),
        port=int(os.environ.get("TUTOR_PORT", "8765")),
    )


if __name__ == "__main__":
    main()
