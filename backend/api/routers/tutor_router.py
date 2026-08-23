"""AI チューター（BFF プロキシ）

フロントエンド → LMS backend(/api/tutor/*) → tutor サービス(内部ネットワーク) の中継。
- 認証は LMS の JWT（get_current_active_user）で行い、tutor サービスへは
  X-Student-Id（= users.id）と共有シークレット X-Tutor-Token を付けて転送する。
- tutor サービス自体は公開しない（docker-compose で ports を閉じる）。
"""
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.core.config import settings
from api.core.security import get_current_active_user
from api.models.users_model import Users

tutor_router = APIRouter(prefix="/tutor", tags=["AIチューター"])

# 1ターン = 検索(約1秒) + LLM 生成(数秒〜20秒程度)。nginx の proxy_read_timeout(120s) 以内に収める。
_TIMEOUT = httpx.Timeout(connect=5.0, read=110.0, write=10.0, pool=5.0)


class TutorMessageRequest(BaseModel):
    text: str = Field(default="", max_length=4000)
    choice_id: Optional[str] = Field(default=None, max_length=16)


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
):
    if not (body.text or "").strip() and not (body.choice_id or "").strip():
        raise HTTPException(status_code=400, detail="text または choice_id が必要です")
    return await _forward("POST", "/session/message", current_user, json=body.model_dump())


@tutor_router.get("/summary", response_model=TutorSummaryResponse)
async def tutor_summary(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/summary", current_user)


@tutor_router.get("/state")
async def tutor_state(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/state", current_user)


@tutor_router.post("/reset", response_model=TutorSummaryResponse)
async def tutor_reset(current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", "/session/reset", current_user)
