"""AI チューター（BFF プロキシ）

フロントエンド → LMS backend(/api/tutor/*) → tutor サービス(内部ネットワーク) の中継。
- 認証は LMS の JWT（get_current_active_user）で行い、tutor サービスへは
  X-Student-Id（= users.id）と共有シークレット X-Tutor-Token を付けて転送する。
- tutor サービス自体は公開しない（docker-compose で ports を閉じる）。
"""
import html
import re
from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.security import get_current_active_user, require_teacher_or_higher
from api.db.session import get_db
from api.models.users_model import Users
from api.repositories.contents_repo import ContentRepository
from api.repositories.lessons_repo import LessonRepository

tutor_router = APIRouter(prefix="/tutor", tags=["AIチューター"])

# 1ターン = 検索(約1秒) + LLM 生成(数秒〜20秒程度)。nginx の proxy_read_timeout(120s) 以内に収める。
_TIMEOUT = httpx.Timeout(connect=5.0, read=110.0, write=10.0, pool=5.0)


class TutorContext(BaseModel):
    """学生がいま開いている教科書ページ（フロントは ID だけ送る。本文は backend が DB から引く）。"""
    course_id: Optional[int] = None
    lesson_item_id: Optional[int] = None
    lesson_page_id: Optional[int] = None


class TutorOpenRequest(BaseModel):
    context: Optional[TutorContext] = None


class TutorMessageRequest(BaseModel):
    text: str = Field(default="", max_length=4000)
    choice_id: Optional[str] = Field(default=None, max_length=16)
    context: Optional[TutorContext] = None
    answer_length: Optional[str] = Field(default=None, pattern="^(short|normal|long)$")


class TutorPreferencesRequest(BaseModel):
    answer_length: Optional[str] = Field(default=None, pattern="^(short|normal|long)$")


class TutorRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class TutorMessageResponse(BaseModel):
    reply: str
    state: dict[str, Any]
    diagnosis: Optional[dict[str, Any]] = None
    clarify: Optional[dict[str, Any]] = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    knowledge_mode: str = "textbook"
    banner: str = ""
    retrieval_path: str = ""
    turn_class: str = ""
    viz: Optional[dict[str, Any]] = None
    conversation_id: Optional[int] = None


class TutorSummaryResponse(BaseModel):
    summary: str
    state: dict[str, Any]


def _headers(user: Users) -> dict[str, str]:
    h = {"X-Student-Id": str(user.id)}
    if settings.TUTOR_SERVICE_TOKEN:
        h["X-Tutor-Token"] = settings.TUTOR_SERVICE_TOKEN
    return h


async def _forward(method: str, path: str, user: Users, json: Any = None) -> Any:
    url = f"{settings.TUTOR_SERVICE_URL.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.request(method, url, json=json, headers=_headers(user))
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="チューターの応答がタイムアウトしました。しばらくしてから再度お試しください。",
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="チューターサービスに接続できません。",
        )
    if res.status_code == 503:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="チューターを準備中です。少し待ってから再度お試しください。",
        )
    if res.status_code >= 400:
        detail: Any = None
        try:
            detail = res.json().get("detail")
        except Exception:
            detail = None
        raise HTTPException(status_code=res.status_code, detail=detail or "チューターでエラーが発生しました。")
    return res.json()


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\u3000]+")
PAGE_TEXT_MAX = 6000


def _plain_text(body: str) -> str:
    """教科書本文（Markdown + HTML 混在）を LLM に渡すプレーンテキストへ。数式（$...$）はそのまま残す。"""
    t = _TAG_RE.sub(" ", body or "")
    t = html.unescape(t)
    t = re.sub(r"\$\\\\+\$", "\n", t)  # 本文中の改行代替 `$\\$`
    t = _WS_RE.sub(" ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()[:PAGE_TEXT_MAX]


async def _resolve_page_context(ctx: Optional[TutorContext], db: AsyncSession) -> Optional[dict[str, Any]]:
    """context.lesson_page_id から tutor 用の page_context（タイトル・本文）を組み立てる。見つからなければ ID だけ渡す。"""
    if ctx is None:
        return None
    out: dict[str, Any] = {
        "course_id": ctx.course_id,
        "lesson_item_id": ctx.lesson_item_id,
        "lesson_page_id": ctx.lesson_page_id,
        "title": "",
        "text": "",
    }
    if not ctx.lesson_page_id:
        return out
    page = await LessonRepository(db).get_lesson_page_by_id(page_id=ctx.lesson_page_id)
    if page is None or not page.is_active:
        return out
    out["title"] = page.title or ""
    content_id = page.raw_content_id or page.rendered_content_id
    if content_id:
        content = await ContentRepository(db).get_content_by_id(content_id=content_id)
        if content is not None:
            out["text"] = _plain_text(content.content_body)
    return out


@tutor_router.post("/open")
async def tutor_open(
    body: TutorOpenRequest,
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """チャットを開いたとき: 引き継ぎ（前回の続き）・挨拶・履歴。LLM は呼ばない。"""
    page_context = await _resolve_page_context(body.context, db)
    return await _forward("POST", "/session/open", current_user, json={"page_context": page_context})


@tutor_router.get("/history")
async def tutor_history(
    limit: int = Query(default=40, ge=1, le=200),
    current_user: Users = Depends(get_current_active_user),
):
    return await _forward("GET", f"/session/history?limit={limit}", current_user)


@tutor_router.get("/questions", dependencies=[Depends(require_teacher_or_higher)])
async def tutor_questions(
    limit: int = Query(default=100, ge=1, le=1000),
    course_id: Optional[int] = None,
    student_id: Optional[int] = None,
    since: Optional[datetime] = None,
    current_user: Users = Depends(get_current_active_user),
):
    """教員向け: 学生がチューターにした質問の一覧（tutor.v_student_questions）。"""
    qs = [f"limit={limit}"]
    if course_id is not None:
        qs.append(f"course_id={course_id}")
    if student_id is not None:
        qs.append(f"student_id={student_id}")
    if since is not None:
        qs.append(f"since={since.isoformat()}")
    return await _forward("GET", "/admin/questions?" + "&".join(qs), current_user)


@tutor_router.get("/health")
async def tutor_health(current_user: Users = Depends(get_current_active_user)):
    """チューターサービスの生存確認（ログインユーザーのみ）。"""
    url = f"{settings.TUTOR_SERVICE_URL.rstrip('/')}/health"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            res = await client.get(url)
        body = res.json() if res.status_code == 200 else {}
        return {"ok": bool(body.get("ok")), "service": "tutor"}
    except httpx.HTTPError:
        return {"ok": False, "service": "tutor"}


@tutor_router.post("/message", response_model=TutorMessageResponse)
async def tutor_message(
    body: TutorMessageRequest,
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not (body.text or "").strip() and not (body.choice_id or "").strip():
        raise HTTPException(status_code=400, detail="text または choice_id が必要です")
    payload = {
        "text": body.text,
        "choice_id": body.choice_id,
        "page_context": await _resolve_page_context(body.context, db),
        "answer_length": body.answer_length,
    }
    return await _forward("POST", "/session/message", current_user, json=payload)


# ---- 会話スレッド（保存済みの会話の一覧・切り替え・新規・名前変更・削除） ----
@tutor_router.get("/conversations")
async def tutor_conversations(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/conversations", current_user)


@tutor_router.post("/conversations")
async def tutor_new_conversation(current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", "/session/conversations", current_user)


@tutor_router.post("/conversations/{conversation_id}/switch")
async def tutor_switch_conversation(conversation_id: int, current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", f"/session/conversations/{conversation_id}/switch", current_user)


@tutor_router.put("/conversations/{conversation_id}")
async def tutor_rename_conversation(
    conversation_id: int, body: TutorRenameRequest, current_user: Users = Depends(get_current_active_user)
):
    return await _forward("PUT", f"/session/conversations/{conversation_id}", current_user, json=body.model_dump())


@tutor_router.delete("/conversations/{conversation_id}")
async def tutor_delete_conversation(conversation_id: int, current_user: Users = Depends(get_current_active_user)):
    return await _forward("DELETE", f"/session/conversations/{conversation_id}", current_user)


@tutor_router.post("/preferences")
async def tutor_preferences(body: TutorPreferencesRequest, current_user: Users = Depends(get_current_active_user)):
    """回答の長さなど、学生ごとの設定を保存する。"""
    return await _forward("POST", "/session/preferences", current_user, json=body.model_dump())


@tutor_router.get("/summary", response_model=TutorSummaryResponse)
async def tutor_summary(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/summary", current_user)


@tutor_router.get("/state")
async def tutor_state(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/state", current_user)


@tutor_router.post("/reset", response_model=TutorSummaryResponse)
async def tutor_reset(current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", "/session/reset", current_user)
