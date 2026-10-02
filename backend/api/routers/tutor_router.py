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
from api.core.tutor_errors import MAINTENANCE_MESSAGE, STARTING_MESSAGE, TutorServiceError
from api.core.security import get_current_active_user, require_admin, require_teacher_or_higher
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
    related_meta: Optional[dict[str, Any]] = None
    turn_id: Optional[int] = None
    page_section: Optional[str] = None


class TutorSummaryResponse(BaseModel):
    summary: str
    state: dict[str, Any]
    structured: Optional[dict[str, Any]] = None   # 深い振り返り（did / understood / stuck / next / message）
    source: Optional[str] = None
    scope: Optional[str] = None


def _headers(user: Users) -> dict[str, str]:
    h = {"X-Student-Id": str(user.id)}
    if settings.TUTOR_SERVICE_TOKEN:
        h["X-Tutor-Token"] = settings.TUTOR_SERVICE_TOKEN
    return h


def _error_from_response(status_code: int, body: Any) -> TutorServiceError:
    """tutor サービスのエラー応答を、種類（code）つきのエラーにする。tutor が code を付けていれば、それを引き継ぐ。"""
    data = body if isinstance(body, dict) else {}
    code = data.get("code")
    detail = data.get("detail") if isinstance(data.get("detail"), str) else None
    extra = {k: data[k] for k in ("state", "retry_after_sec") if k in data}
    if code == "llm_unavailable":
        # 学内の AI サーバー（LLM）に繋がらない・手動のメンテナンス中。tutor が学生向けの文面を持っている
        return TutorServiceError(503, detail or MAINTENANCE_MESSAGE, "llm_unavailable", extra,
                                 headers={"Retry-After": str(data.get("retry_after_sec", 30))})
    if status_code == 503 and code is None:
        # code の無い 503 = tutor がまだ初期化中
        return TutorServiceError(503, STARTING_MESSAGE, "starting")
    return TutorServiceError(status_code, detail or "チューターでエラーが発生しました。", code or "error", extra)


async def _forward(method: str, path: str, user: Users, json: Any = None) -> Any:
    url = f"{settings.TUTOR_SERVICE_URL.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.request(method, url, json=json, headers=_headers(user))
    except httpx.TimeoutException:
        raise TutorServiceError(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "チューターの応答がタイムアウトしました。しばらくしてから再度お試しください。",
            "timeout",
        )
    except httpx.HTTPError:
        # tutor サービス自体に繋がらない（コンテナが止まっている・再起動中など）
        raise TutorServiceError(status.HTTP_502_BAD_GATEWAY, MAINTENANCE_MESSAGE, "tutor_unavailable")
    if res.status_code >= 400:
        try:
            body = res.json()
        except Exception:
            body = None
        raise _error_from_response(res.status_code, body)
    return res.json()


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\u3000]+")
PAGE_TEXT_MAX = 20000


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


async def _recent_tutor_evidence(
    db: AsyncSession, user_id: int, course_id: int | None, *, limit: int = 40
) -> list[dict[str, Any]]:
    """Return a recent candidate pool with per-question attempt summaries.

    Relevance is selected later using the current utterance, page, and KG. Raw
    answers are deliberately excluded from this cross-service payload.
    """
    stmt = (
        select(exercises_model.StudentAnswers, questions_model.Questions, exercises_model.ExerciseSessions.started_at)
        .join(exercises_model.ExerciseSessions, exercises_model.ExerciseSessions.id == exercises_model.StudentAnswers.session_id)
        .join(exercises_model.ExerciseSets, exercises_model.ExerciseSets.id == exercises_model.ExerciseSessions.exercise_set_id)
        .join(questions_model.Questions, questions_model.Questions.id == exercises_model.StudentAnswers.question_id)
        .options(selectinload(questions_model.Questions.tags))
        .where(exercises_model.ExerciseSessions.user_id == user_id)
    )
    if course_id is not None:
        stmt = stmt.where(exercises_model.ExerciseSets.course_id == course_id)
    rows = (await db.execute(stmt.order_by(exercises_model.StudentAnswers.id.desc()).limit(400))).all()
    by_question: dict[int, dict[str, Any]] = {}
    for answer, question, started_at in rows:
        outcome = "unknown" if answer.is_correct is None else ("correct" if answer.is_correct else "incorrect")
        record = by_question.get(question.id)
        if record is None:
            record = {
                "ref": f"exercise:{question.id}:{answer.id}",
                "source": "exercise",
                "topic_tags": [tag.name for tag in (question.tags or []) if tag.name][:8],
                "item_title": question.title or "",
                "result": outcome,
                "recorded_at": started_at.isoformat() if started_at else "",
                "attempt_count": 0,
                "recent_outcomes": [],
            }
            by_question[question.id] = record
        record["attempt_count"] = min(50, record["attempt_count"] + 1)
        if len(record["recent_outcomes"]) < 6:
            record["recent_outcomes"].append(outcome)
    return list(by_question.values())[:max(0, min(40, limit))]


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
        # その場で解答・採点するための情報（既存の演習ページと同じ採点規則: 許容誤差つき数値比較）
        "grading": {
            "type": q.question_type,
            "answers": cd.get("answers") if q.question_type == "numeric" else None,
            "tolerance": cd.get("tolerance", 0) if q.question_type == "numeric" else None,
            "blanks": [
                {"blank_id": b.get("blank_id"), "label": b.get("label") or b.get("blank_id") or "", "answers": b.get("answers"),
                 "tolerance": b.get("tolerance", 0)}
                for b in (cd.get("blanks") or []) if isinstance(b, dict)
            ] if q.question_type == "multiple_numeric" else [],
        },
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
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """いまの話題に近い既存問題。戻り値は (問題リスト, メタ{suppressed, topic_tags})。

    backend の仕事: 候補（public.questions）と学生の解答履歴・習熟度を集めて tutor に渡し、返ってきた問題を学生向けの形にする。
    選定（類似度の閾値、既に出した問題の除外 — 不正解は例外 —、加点・並べ替え、提示の記録）は tutor サービス側。
    """
    query = (query or "").strip()
    empty_meta: dict[str, Any] = {"suppressed": 0, "topic_tags": [], "more": 0}
    if not query:
        return [], empty_meta
    stmt = select(questions_model.Questions).options(selectinload(questions_model.Questions.tags)).where(
        questions_model.Questions.is_active == True  # noqa: E712
    )
    qs = (await db.execute(stmt)).scalars().unique().all()
    if tag:
        tag_l = tag.strip().lower()
        qs = [q for q in qs if any((t.name or "").lower() == tag_l or (t.slug or "").lower() == tag_l for t in (q.tags or []))]
    if not qs:
        return [], empty_meta
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
            return [], empty_meta
        payload = res.json()
        ranked = payload.get("items") or []
        meta_out = {
            "suppressed": len(payload.get("suppressed") or []),
            "topic_tags": payload.get("topic_tags") or [],
            "more": max(int(payload.get("eligible") or 0) - len(ranked), 0),  # 今回出さなかったが解ける問題の数
        }
    except httpx.HTTPError:
        return [], empty_meta
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
    return out, meta_out


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
    items, meta = await _related_questions(q, db, limit=limit, course_id=course_id, user_id=current_user.id, tag=tag)
    return {"items": items, "meta": meta}


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


# ---- 👍👎 フィードバック ----
class TutorFeedbackRequest(BaseModel):
    turn_id: int
    rating: int = Field(ge=-1, le=1)
    comment: Optional[str] = Field(default=None, max_length=1000)


@tutor_router.post("/feedback")
async def tutor_feedback(body: TutorFeedbackRequest, current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", "/session/feedback", current_user, json=body.model_dump())


# ---- 教員ビュー（集計・品質・対応表・設定） ----
async def _forward_service(method: str, path: str, json: Any = None, user: Optional[Users] = None) -> Any:
    """学生 ID を伴わない管理系の中継。"""
    url = f"{settings.TUTOR_SERVICE_URL.rstrip('/')}{path}"
    headers = {"X-Tutor-Token": settings.TUTOR_SERVICE_TOKEN} if settings.TUTOR_SERVICE_TOKEN else {}
    if user is not None:
        headers["X-Student-Id"] = str(user.id)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            res = await client.request(method, url, json=json, headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="チューターサービスに接続できません。")
    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail="チューターでエラーが発生しました。")
    return res.json()


@tutor_router.get("/admin/stats", dependencies=[Depends(require_teacher_or_higher)])
async def tutor_admin_stats(days: int = Query(default=30, ge=1, le=365), course_id: Optional[int] = None,
                            db: AsyncSession = Depends(get_db)):
    """教員ビュー: ページ別／学生別／概念別の集計、つまずきの多い問題、週次品質、最近のフィードバック。学生名・問題名を付ける。"""
    data = await _forward_service("GET", f"/admin/stats?days={days}" + (f"&course_id={course_id}" if course_id is not None else ""))
    # 学生名
    sids = [r["student_id"] for r in data.get("by_student", []) if r.get("student_id") is not None]
    if sids:
        rows = (await db.execute(select(Users.id, Users.username, Users.email).where(Users.id.in_(sids)))).all()
        names = {r[0]: (r[1] or r[2]) for r in rows}
        for r in data["by_student"]:
            r["name"] = names.get(r["student_id"], f"user {r['student_id']}")
    # 問題名
    qids = [r["question_id"] for r in data.get("hard_questions", [])]
    if qids:
        rows = (await db.execute(select(questions_model.Questions.id, questions_model.Questions.title).where(questions_model.Questions.id.in_(qids)))).all()
        titles = {r[0]: r[1] for r in rows}
        for r in data["hard_questions"]:
            r["title"] = titles.get(r["question_id"], f"問題 {r['question_id']}")
    # ページ名の補完
    pids = [r["lesson_page_id"] for r in data.get("by_page", []) if r.get("lesson_page_id")]
    if pids:
        rows = (await db.execute(select(lessons_model.LessonPages.id, lessons_model.LessonPages.title).where(lessons_model.LessonPages.id.in_(pids)))).all()
        pt = {r[0]: r[1] for r in rows}
        for r in data["by_page"]:
            r["page_title"] = r.get("page_title") or pt.get(r.get("lesson_page_id")) or "（ページ外）"
    return data


@tutor_router.get("/admin/sections", dependencies=[Depends(require_teacher_or_higher)])
async def tutor_admin_sections(course_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """LMS のページ → KG の節 の対応表。"""
    stmt = select(lessons_model.LessonPages.id, lessons_model.LessonPages.title, lessons_model.LessonPages.lesson_id).where(
        lessons_model.LessonPages.is_active == True  # noqa: E712
    )
    if course_id is not None:
        stmt = stmt.join(lessons_model.CourseLessons, lessons_model.CourseLessons.id == lessons_model.LessonPages.lesson_id).where(
            lessons_model.CourseLessons.course_id == course_id
        )
    rows = (await db.execute(stmt.order_by(lessons_model.LessonPages.lesson_id, lessons_model.LessonPages.page_number))).all()
    pages = [{"lesson_page_id": r[0], "title": r[1], "lesson_id": r[2]} for r in rows]
    data = await _forward_service("POST", "/admin/sections", json={"pages": pages})
    return data


@tutor_router.get("/admin/settings", dependencies=[Depends(require_teacher_or_higher)])
async def tutor_admin_settings_get():
    s = await _forward_service("GET", "/admin/settings")
    m = await _forward_service("GET", "/admin/models")
    return {**s, "models": m.get("models", []), "models_source": m.get("source"), "models_error": m.get("error")}


class TutorSettingsRequest(BaseModel):
    llm_model: Optional[str] = Field(default=None, max_length=200)
    page_section_overrides: Optional[dict[str, str]] = None
    # 手動のメンテナンス（学内の AI サーバーの計画停止など）。True の間、学生には「メンテナンス中」と表示される
    maintenance: Optional[bool] = None
    maintenance_message: Optional[str] = Field(default=None, max_length=300)   # 学生に見せる文面（空なら既定）


@tutor_router.put("/admin/settings")
async def tutor_admin_settings_put(body: TutorSettingsRequest, current_user: Users = Depends(require_admin)):
    """モデルの切替など（管理者のみ）。再起動なしで反映・保存。"""
    payload = body.model_dump(exclude_none=True)
    payload["updated_by"] = current_user.id
    return await _forward_service("PUT", "/admin/settings", json=payload)


@tutor_router.get("/health")
async def tutor_health(current_user: Users = Depends(get_current_active_user)):
    """チューターの状態（ログインユーザーのみ）。フロントエンドが「メンテナンス中」の表示を出すのに使う。

    常に HTTP 200 で、`llm` に状態を入れて返す（tutor サービスや LLM が落ちていても、画面側が判定できるように）:
      llm.ok=false のとき、llm.state は down（LLM に繋がらない）/ maintenance（手動のメンテナンス）/
      tutor_down（tutor サービスに繋がらない）/ starting（起動中）。llm.message が学生向けの文面。
    """
    url = f"{settings.TUTOR_SERVICE_URL.rstrip('/')}/health"
    try:
        # tutor が LLM の疎通確認（最大3秒）をすることがあるので、余裕を持たせる
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            res = await client.get(url)
        body = res.json() if res.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return {"ok": False, "service": "tutor",
                "llm": {"ok": False, "state": "tutor_down", "message": MAINTENANCE_MESSAGE, "retry_after_sec": 30}}
    if not body.get("ok"):
        return {"ok": False, "service": "tutor",
                "llm": {"ok": False, "state": "starting", "message": STARTING_MESSAGE, "retry_after_sec": 15}}
    llm = body.get("llm") if isinstance(body.get("llm"), dict) else {"ok": True, "state": "unknown"}
    return {"ok": True, "service": "tutor", "llm": llm}


@tutor_router.post("/message", response_model=TutorMessageResponse)
async def tutor_message(
    body: TutorMessageRequest,
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not (body.text or "").strip() and not (body.choice_id or "").strip():
        raise HTTPException(status_code=400, detail="text または choice_id が必要です")
    learner_evidence = await _recent_tutor_evidence(
        db,
        current_user.id,
        body.context.course_id if body.context else None,
    ) if (body.text or "").strip() else []
    payload = {
        "text": body.text,
        "choice_id": body.choice_id,
        "page_context": await _resolve_page_context(body.context, db),
        "answer_length": body.answer_length,
        "learner_evidence": learner_evidence,
    }
    data = await _forward("POST", "/session/message", current_user, json=payload)
    # 回答を返したターン（診断・clarify の待ち受け中でない）だけ、関連する既存問題を添える
    state = data.get("state") or {}
    if isinstance(data, dict) and state.get("phase") == "idle" and not data.get("diagnosis") and not data.get("clarify"):
        focus = str(state.get("focus_concept") or "").strip()
        query = " ".join(p for p in (focus, (body.text or "").strip()) if p)
        try:
            # 1問だけ出してその場で解けるようにする。続けて解きたい場合は演習ページへ（meta.more で案内）
            items, meta = await _related_questions(
                query, db, limit=1, course_id=body.context.course_id if body.context else None, user_id=current_user.id
            )
            data["related_questions"] = items
            data["related_meta"] = meta
        except Exception:  # 付加情報なので失敗しても回答は返す
            data["related_questions"] = []
            data["related_meta"] = {"suppressed": 0, "topic_tags": [], "more": 0}
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


async def _recent_exercise_outcomes(db: AsyncSession, user_id: int, *, days: int = 30, limit: int = 15) -> list[dict[str, Any]]:
    """振り返りの材料: 最近解いた問題ごとの最新の正誤（タイトル付き）。"""
    from datetime import timedelta

    since = datetime.now() - timedelta(days=days)
    rows = (await db.execute(
        select(exercises_model.StudentAnswers.question_id, exercises_model.StudentAnswers.is_correct,
               exercises_model.StudentAnswers.id, exercises_model.ExerciseSessions.started_at)
        .join(exercises_model.ExerciseSessions, exercises_model.ExerciseSessions.id == exercises_model.StudentAnswers.session_id)
        .where(exercises_model.ExerciseSessions.user_id == user_id)
        .where(exercises_model.ExerciseSessions.started_at >= since)
        .order_by(exercises_model.StudentAnswers.id.asc())
    )).all()
    agg: dict[int, dict[str, Any]] = {}
    for qid, ok, _id, started in rows:
        a = agg.setdefault(qid, {"attempts": 0, "last_correct": None, "last_at": None})
        a["attempts"] += 1
        a["last_correct"] = bool(ok)
        a["last_at"] = started.isoformat() if started else None
    if not agg:
        return []
    qs = (await db.execute(select(questions_model.Questions).where(questions_model.Questions.id.in_(list(agg))))).scalars().all()
    titles = {q.id: q.title for q in qs}
    out = [
        {"title": titles.get(qid, f"問題 {qid}"), "status": "正解" if a["last_correct"] else "不正解", "attempts": a["attempts"], "last_at": a["last_at"]}
        for qid, a in agg.items()
    ]
    out.sort(key=lambda x: (x["status"] == "正解", -(x["attempts"])))  # 不正解・試行回数多を先に
    return out[:limit]


@tutor_router.get("/summary", response_model=TutorSummaryResponse)
async def tutor_summary(
    scope: str = Query(default="current", pattern="^(current|previous|all)$"),
    days: int = Query(default=30, ge=1, le=365),
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """振り返り（深い版）: 会話ログ・理解度・演習結果・教科書の依存関係から LLM が構造化。失敗時はテンプレ。
    scope: current=この会話 / previous=前回の会話 / all=直近 days 日の全会話"""
    exercise = await _recent_exercise_outcomes(db, current_user.id, days=days if scope == "all" else 30)
    data = await _forward("POST", "/session/reflect", current_user, json={"exercise": exercise, "scope": scope, "days": days})
    return {"summary": data.get("summary") or "", "state": data.get("state") or {}, "structured": data.get("structured"),
            "source": data.get("source"), "scope": scope}


@tutor_router.get("/state")
async def tutor_state(current_user: Users = Depends(get_current_active_user)):
    return await _forward("GET", "/session/state", current_user)


@tutor_router.post("/reset", response_model=TutorSummaryResponse)
async def tutor_reset(current_user: Users = Depends(get_current_active_user)):
    return await _forward("POST", "/session/reset", current_user)
