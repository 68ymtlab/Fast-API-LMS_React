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
from api.models import adaptive_model, courses_model, exercises_model, lessons_model, questions_model
from api.models.users_model import Users
from api.repositories.contents_repo import ContentRepository
from sqlalchemy import select
from sqlalchemy.orm import selectinload
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
    related_questions: list[dict[str, Any]] = Field(default_factory=list)


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


# ---- 類似問題（教員が作った既存問題を、いまの話題に近い順に出す。LLM 生成はしない） ----
_MD_NOISE_RE = re.compile(r"^#+\s*|\\fbox\{[^}]*\}|\(半角で入力\)", re.M)


def _question_text(q: questions_model.Questions) -> str:
    """埋め込み用のテキスト（タイトル + タグ + 問題文 + 空欄ラベル）。"""
    cd = q.content_data or {}
    parts = [q.title or ""]
    tag_names = [t.name for t in (getattr(q, "tags", None) or [])]
    if tag_names:
        parts.append("タグ: " + " ".join(tag_names))
    if isinstance(cd, dict):
        if cd.get("question"):
            parts.append(str(cd["question"]))
        for b in cd.get("blanks") or []:
            if isinstance(b, dict) and b.get("label"):
                parts.append(str(b["label"]))
    text = "\n".join(p for p in parts if p)
    return _MD_NOISE_RE.sub("", text)[:2000]


def _question_public(q: questions_model.Questions) -> dict[str, Any]:
    """学生に見せる形。正解は『答えを確認』用に answers として同梱（教員作成の確定値）。"""
    cd = q.content_data if isinstance(q.content_data, dict) else {}
    answers: list[dict[str, Any]] = []
    if q.question_type == "numeric" and cd.get("answers") is not None:
        answers.append({"label": "答え", "answers": cd.get("answers")})
    for b in cd.get("blanks") or []:
        if isinstance(b, dict):
            answers.append({"label": b.get("label") or b.get("blank_id") or "", "answers": b.get("answers")})
    return {
        "id": q.id,
        "title": q.title,
        "question_type": q.question_type,
        "difficulty": q.difficulty,
        "question": str(cd.get("question") or ""),
        "hint": str(cd.get("hint") or ""),
        "answers": answers,
        "tags": [t.name for t in (getattr(q, "tags", None) or [])],
    }


async def _answer_status(db: AsyncSession, user_id: int, question_ids: list[int]) -> dict[int, dict[str, Any]]:
    """question_id → {status, attempts, last_correct}。最新の解答（id が大きいもの）で判定。"""
    if not question_ids:
        return {}
    rows = (await db.execute(
        select(exercises_model.StudentAnswers.question_id, exercises_model.StudentAnswers.is_correct, exercises_model.StudentAnswers.id)
        .join(exercises_model.ExerciseSessions, exercises_model.ExerciseSessions.id == exercises_model.StudentAnswers.session_id)
        .where(exercises_model.ExerciseSessions.user_id == user_id)
        .where(exercises_model.StudentAnswers.question_id.in_(question_ids))
        .order_by(exercises_model.StudentAnswers.id.asc())
    )).all()
    out: dict[int, dict[str, Any]] = {}
    for qid, is_correct, _ in rows:
        st = out.setdefault(qid, {"attempts": 0, "last_correct": None, "ever_correct": False})
        st["attempts"] += 1
        st["last_correct"] = is_correct
        st["ever_correct"] = st["ever_correct"] or bool(is_correct)
    for qid in question_ids:
        st = out.setdefault(qid, {"attempts": 0, "last_correct": None, "ever_correct": False})
        if st["attempts"] == 0:
            st["status"] = "unanswered"
        elif st["last_correct"]:
            st["status"] = "correct"
        else:
            st["status"] = "wrong"
    return out


async def _mastery_for_course(db: AsyncSession, user_id: int, course_id: Optional[int]) -> Optional[float]:
    """student_competencies（科目単位の習熟度）を、コース→科目で引く。無ければ None。"""
    if course_id is None:
        return None
    subject_id = (await db.execute(
        select(courses_model.Courses.subject_id).where(courses_model.Courses.id == course_id)
    )).scalar_one_or_none()
    if subject_id is None:
        return None
    m = (await db.execute(
        select(adaptive_model.StudentCompetencies.mastery_level)
        .where(adaptive_model.StudentCompetencies.user_id == user_id)
        .where(adaptive_model.StudentCompetencies.subject_id == subject_id)
    )).scalar_one_or_none()
    return float(m) if m is not None else None


async def _related_questions(
    query: str,
    db: AsyncSession,
    *,
    limit: int = 3,
    course_id: Optional[int] = None,
    user_id: Optional[int] = None,
    tag: Optional[str] = None,
    record: bool = True,
) -> list[dict[str, Any]]:
    """いまの話題に近い既存問題。

    backend の仕事: 候補（public.questions）と学生の解答履歴・習熟度を集めて tutor に渡し、返ってきた問題を学生向けの形にする。
    選定（類似度の閾値、既に出した問題の除外 — 不正解は例外 —、加点・並べ替え、提示の記録）は tutor サービス側。
    """
    query = (query or "").strip()
    if not query:
        return []
    stmt = select(questions_model.Questions).options(selectinload(questions_model.Questions.tags)).where(
        questions_model.Questions.is_active == True  # noqa: E712
    )
    qs = (await db.execute(stmt)).scalars().unique().all()
    if tag:
        tag_l = tag.strip().lower()
        qs = [q for q in qs if any((t.name or "").lower() == tag_l or (t.slug or "").lower() == tag_l for t in (q.tags or []))]
    if not qs:
        return []
    by_id = {q.id: q for q in qs}
    statuses = await _answer_status(db, user_id, list(by_id)) if user_id is not None else {}
    mastery = await _mastery_for_course(db, user_id, course_id) if user_id is not None else None
    candidates = [
        {
            "id": q.id,
            "text": _question_text(q),
            "status": statuses.get(q.id, {}).get("status", "unknown") if statuses else "unknown",
            "difficulty": float(q.difficulty) if q.difficulty is not None else None,
            "tags": [t.name for t in (q.tags or []) if t.name],
        }
        for q in qs
    ]
    headers = {"X-Student-Id": str(user_id)} if user_id is not None else {}
    if settings.TUTOR_SERVICE_TOKEN:
        headers["X-Tutor-Token"] = settings.TUTOR_SERVICE_TOKEN
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            res = await client.post(
                f"{settings.TUTOR_SERVICE_URL.rstrip('/')}/related/rank",
                json={"query": query, "candidates": candidates, "top_k": limit, "mastery": mastery, "record": record},
                headers=headers,
            )
        if res.status_code != 200:
            return []
        ranked = res.json().get("items") or []
    except httpx.HTTPError:
        return []
    # 問題が入っている演習セット（あれば「演習ページで解く」リンク先）
    sets = (await db.execute(select(exercises_model.ExerciseSets))).scalars().all()
    set_by_q: dict[int, exercises_model.ExerciseSets] = {}
    for st in sets:
        ids = st.question_ids if isinstance(st.question_ids, list) else []
        for qid in ids:
            try:
                qid_i = int(qid)
            except (TypeError, ValueError):
                continue
            if qid_i not in set_by_q or (course_id is not None and st.course_id == course_id):
                set_by_q[qid_i] = st
    first_lesson: dict[int, int] = {}
    out = []
    for r in ranked:
        q = by_id.get(r["id"])
        if not q:
            continue
        item = _question_public(q)
        item["score"] = r.get("score")
        item["status"] = r.get("status")  # wrong / unanswered / correct / unknown
        item["attempts"] = statuses.get(q.id, {}).get("attempts", 0) if statuses else 0
        item["shown_before"] = bool(r.get("shown_before"))
        st = set_by_q.get(q.id)
        if st is not None:
            if st.course_id not in first_lesson:
                row = (await db.execute(
                    select(lessons_model.CourseLessons.id).where(lessons_model.CourseLessons.course_id == st.course_id)
                    .order_by(lessons_model.CourseLessons.display_order, lessons_model.CourseLessons.id).limit(1)
                )).scalar_one_or_none()
                first_lesson[st.course_id] = row or 0
            item["exercise_set"] = {"id": st.id, "title": st.title, "course_id": st.course_id,
                                    "url": f"/weekflows/{st.course_id}/{first_lesson[st.course_id]}/set/{st.id}"}
        out.append(item)
    return out


class RelatedEventRequest(BaseModel):
    kind: str = Field(pattern="^(revealed|clicked)$")


@tutor_router.post("/related-questions/{question_id}/event")
async def tutor_related_event(
    question_id: int, body: RelatedEventRequest, current_user: Users = Depends(get_current_active_user)
):
    """「答えを確認」「演習ページで解く」を記録（次回の提示判断に使う）。"""
    return await _forward("POST", "/related/event", current_user, json={"question_id": question_id, "kind": body.kind})


@tutor_router.get("/related-questions")
async def tutor_related_questions(
    q: str = Query(min_length=1, max_length=2000),
    limit: int = Query(default=3, ge=1, le=10),
    course_id: Optional[int] = None,
    tag: Optional[str] = Query(default=None, max_length=50),
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """いまの話題に近い既存の演習問題（教員作成）。学生の解答履歴で並べ替え、tag で絞り込める。"""
    return {"items": await _related_questions(q, db, limit=limit, course_id=course_id, user_id=current_user.id, tag=tag)}


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
    data = await _forward("POST", "/session/message", current_user, json=payload)
    # 回答を返したターン（診断・clarify の待ち受け中でない）だけ、関連する既存問題を添える
    state = data.get("state") or {}
    if isinstance(data, dict) and state.get("phase") == "idle" and not data.get("diagnosis") and not data.get("clarify"):
        focus = str(state.get("focus_concept") or "").strip()
        query = " ".join(p for p in (focus, (body.text or "").strip()) if p)
        try:
            data["related_questions"] = await _related_questions(
                query, db, limit=3, course_id=body.context.course_id if body.context else None, user_id=current_user.id
            )
        except Exception:  # 付加情報なので失敗しても回答は返す
            data["related_questions"] = []
    return data


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
