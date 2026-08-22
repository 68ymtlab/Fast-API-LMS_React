"""
課題・ファイル提出関連のAPIエンドポイント

設計:
  - 課題はコースレッスン（course_lessons）に紐づく。各レッスンに複数作成可能。
  - ファイルはサーバーのファイルシステムに保存。
  - 学生は何度でも再提出可能（is_latest フラグで最新を管理）。
  - 教師は採点（点数＋コメント）と課題の公開/非公開を制御できる。
  - 提出ファイルのダウンロードは教師・当該学生のみ可能。
"""
import os
import uuid
import shutil
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query,
    UploadFile, status
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher
from api.models import users_model
from api.models.assignments_model import Assignments, AssignmentSubmissions
from api.models.lessons_model import CourseLessons
import api.schemas.assignments as assignments_schema

assignments_router = APIRouter(tags=["課題管理"])

# ── ファイル保存ルートディレクトリ ──────────────────────
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/app/uploads"))
SUBMISSIONS_DIR = UPLOAD_ROOT / "submissions"
SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ── ヘルパー ────────────────────────────────────────────

def _is_teacher_or_admin(user: users_model.Users) -> bool:
    return user.role_id in (1, 2)  # 1=admin, 2=teacher


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _safe_path_component(value: str) -> str:
    """ZIP 内の安全なフォルダ・ファイル名に整形する。"""
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", value).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned[:80] or "untitled")


ZIP_NAME_MODES = {
    "legacy",
    "assignment_title",
    "lesson_assignment_title",
}

INNER_FILE_NAME_MODES = {
    "student_number_name",
    "class_roster_name",
}


def _resolve_student_labels(sub: AssignmentSubmissions) -> Dict[str, str]:
    student_display = (
        sub.student.display_name
        if sub.student and sub.student.display_name
        else f"user_{sub.student_user_id}"
    )
    student_number = (
        sub.student.student.student_number
        if sub.student and sub.student.student and sub.student.student.student_number
        else f"user{sub.student_user_id}"
    )
    class_number = (
        sub.student.student.class_number
        if sub.student and sub.student.student and sub.student.student.class_number
        else "class_unknown"
    )
    class_roster_number = (
        sub.student.student.class_roster_number
        if sub.student and sub.student.student and sub.student.student.class_roster_number
        else f"user{sub.student_user_id}"
    )
    return {
        "student_display": _safe_path_component(student_display),
        "student_number": _safe_path_component(student_number),
        "class_number": _safe_path_component(class_number),
        "class_roster_number": _safe_path_component(class_roster_number),
    }


def _build_submission_file_stem(sub: AssignmentSubmissions, mode: str) -> str:
    labels = _resolve_student_labels(sub)
    if mode == "class_roster_name":
        return (
            f"{labels['class_number']}_{labels['class_roster_number']}_"
            f"{labels['student_display']}"
        )
    return f"{labels['student_number']}_{labels['student_display']}"


def _build_export_zip_filename(
    assignment: Assignments,
    lesson_number: int,
    mode: str,
) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if mode == "assignment_title":
        base = f"{_safe_path_component(assignment.title)}_{assignment.id}_submissions"
    elif mode == "lesson_assignment_title":
        base = (
            f"lesson{lesson_number:02d}_"
            f"{_safe_path_component(assignment.title)}_{assignment.id}_submissions"
        )
    else:
        base = f"assignment_{assignment.id}_submissions"
    return f"{base}_{timestamp}.zip"


def _build_content_disposition(filename: str) -> str:
    # filename は ASCII フォールバック、filename* は UTF-8 を使う
    ascii_fallback = re.sub(r"[^\x20-\x7E]+", "_", filename)
    ascii_fallback = re.sub(r'[\\/:*?"<>|;]+', "_", ascii_fallback).strip()
    ascii_fallback = re.sub(r"\s+", "_", ascii_fallback)
    if not ascii_fallback:
        ascii_fallback = "export.zip"
    return (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )


async def _get_assignment_or_404(
    assignment_id: int, db: AsyncSession
) -> Assignments:
    stmt = select(Assignments).where(
        Assignments.id == assignment_id,
        Assignments.deleted_at == None  # noqa: E711
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="課題が見つかりません")
    return obj


def _assignment_to_response(
    obj: Assignments,
    submission_count: int = 0,
    my_submission: Optional[AssignmentSubmissions] = None,
) -> assignments_schema.AssignmentResponse:
    my_sub_resp = None
    if my_submission:
        my_sub_resp = _submission_to_response(my_submission)
    return assignments_schema.AssignmentResponse(
        id=obj.id,
        lesson_id=obj.lesson_id,
        title=obj.title,
        description=obj.description,
        is_published=obj.is_published,
        publish_start_at=obj.publish_start_at,
        publish_end_at=obj.publish_end_at,
        due_date=obj.due_date,
        allow_late_submission=obj.allow_late_submission,
        max_file_size_mb=obj.max_file_size_mb or 50,
        allowed_file_types=obj.allowed_file_types,
        display_order=obj.display_order,
        created_at=obj.created_at,
        created_by_user_id=obj.created_by_user_id,
        updated_at=obj.updated_at,
        updated_by_user_id=obj.updated_by_user_id,
        submission_count=submission_count,
        my_submission=my_sub_resp,
    )


def _submission_to_response(
    sub: AssignmentSubmissions,
    student: Optional[users_model.Users] = None,
) -> assignments_schema.SubmissionResponse:
    return assignments_schema.SubmissionResponse(
        id=sub.id,
        assignment_id=sub.assignment_id,
        student_user_id=sub.student_user_id,
        original_filename=sub.original_filename,
        file_size_bytes=sub.file_size_bytes,
        content_type=sub.content_type,
        submission_number=sub.submission_number,
        is_latest=sub.is_latest,
        score=float(sub.score) if sub.score is not None else None,
        max_score=float(sub.max_score) if sub.max_score is not None else None,
        teacher_comment=sub.teacher_comment,
        graded_at=sub.graded_at,
        graded_by_user_id=sub.graded_by_user_id,
        submitted_at=sub.submitted_at,
        student_display_name=(student or getattr(sub, 'student', None)) and (
            (student or sub.student).display_name
        ) or None,
        student_email=(student or getattr(sub, 'student', None)) and (
            (student or sub.student).email
        ) or None,
    )


# ── 課題 CRUD ──────────────────────────────────────────

@assignments_router.post(
    "/lessons/{lesson_id}/assignments",
    response_model=assignments_schema.AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="課題作成（教師向け）",
)
async def create_assignment(
    lesson_id: int,
    body: assignments_schema.AssignmentCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """指定レッスンに課題を作成します（教師・管理者のみ）。"""
    # レッスン存在確認
    lesson = (await db.execute(
        select(CourseLessons).where(CourseLessons.id == lesson_id)
    )).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="レッスンが見つかりません")

    obj = Assignments(
        lesson_id=lesson_id,
        title=body.title.strip(),
        description=body.description,
        is_published=body.is_published,
        publish_start_at=body.publish_start_at,
        publish_end_at=body.publish_end_at,
        due_date=body.due_date,
        allow_late_submission=body.allow_late_submission,
        max_file_size_mb=body.max_file_size_mb,
        allowed_file_types=body.allowed_file_types,
        display_order=body.display_order,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _assignment_to_response(obj)


@assignments_router.get(
    "/lessons/{lesson_id}/assignments",
    response_model=List[assignments_schema.AssignmentResponse],
    summary="課題一覧取得",
)
async def list_assignments(
    lesson_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    include_unpublished: bool = Query(False, description="非公開課題も含める（教師のみ有効）"),
):
    """指定レッスンの課題一覧を取得します。学生には公開中の課題のみ返します。"""
    stmt = select(Assignments).where(
        Assignments.lesson_id == lesson_id,
        Assignments.deleted_at == None,  # noqa: E711
    ).order_by(Assignments.display_order, Assignments.id)

    # 学生は公開中のみ
    if not _is_teacher_or_admin(current_user):
        now = _now_utc()
        stmt = stmt.where(
            Assignments.is_published == True,  # noqa: E712
        )
    elif not include_unpublished:
        pass  # 教師はデフォルトで全て見える

    assignments = (await db.execute(stmt)).scalars().all()

    results = []
    for a in assignments:
        # 提出件数（教師向け）
        count = 0
        my_sub = None
        if _is_teacher_or_admin(current_user):
            count_stmt = select(func.count()).where(
                AssignmentSubmissions.assignment_id == a.id,
                AssignmentSubmissions.is_latest == True,  # noqa: E712
            )
            count = (await db.execute(count_stmt)).scalar() or 0
        else:
            # 自分の最新提出
            my_sub_stmt = select(AssignmentSubmissions).where(
                AssignmentSubmissions.assignment_id == a.id,
                AssignmentSubmissions.student_user_id == current_user.id,
                AssignmentSubmissions.is_latest == True,  # noqa: E712
            )
            my_sub = (await db.execute(my_sub_stmt)).scalar_one_or_none()

        results.append(_assignment_to_response(a, submission_count=count, my_submission=my_sub))

    return results


@assignments_router.get(
    "/assignments/{assignment_id}",
    response_model=assignments_schema.AssignmentResponse,
    summary="課題詳細取得",
)
async def get_assignment(
    assignment_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """課題の詳細を取得します。"""
    obj = await _get_assignment_or_404(assignment_id, db)

    # 学生は非公開課題を見られない
    if not _is_teacher_or_admin(current_user) and not obj.is_published:
        raise HTTPException(status_code=403, detail="この課題は非公開です")

    count = 0
    my_sub = None
    if _is_teacher_or_admin(current_user):
        count_stmt = select(func.count()).where(
            AssignmentSubmissions.assignment_id == obj.id,
            AssignmentSubmissions.is_latest == True,  # noqa: E712
        )
        count = (await db.execute(count_stmt)).scalar() or 0
    else:
        my_sub_stmt = select(AssignmentSubmissions).where(
            AssignmentSubmissions.assignment_id == obj.id,
            AssignmentSubmissions.student_user_id == current_user.id,
            AssignmentSubmissions.is_latest == True,  # noqa: E712
        )
        my_sub = (await db.execute(my_sub_stmt)).scalar_one_or_none()

    return _assignment_to_response(obj, submission_count=count, my_submission=my_sub)


@assignments_router.put(
    "/assignments/{assignment_id}",
    response_model=assignments_schema.AssignmentResponse,
    summary="課題更新（教師向け）",
)
async def update_assignment(
    assignment_id: int,
    body: assignments_schema.AssignmentUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """課題情報を更新します（教師・管理者のみ）。"""
    obj = await _get_assignment_or_404(assignment_id, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "title" and value:
            value = value.strip()
        setattr(obj, field, value)
    obj.updated_at = _now_utc()
    obj.updated_by_user_id = current_user.id

    db.add(obj)
    await db.commit()
    await db.refresh(obj)

    count_stmt = select(func.count()).where(
        AssignmentSubmissions.assignment_id == obj.id,
        AssignmentSubmissions.is_latest == True,  # noqa: E712
    )
    count = (await db.execute(count_stmt)).scalar() or 0
    return _assignment_to_response(obj, submission_count=count)


@assignments_router.delete(
    "/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="課題削除（論理削除）（教師向け）",
)
async def delete_assignment(
    assignment_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """課題を論理削除します（教師・管理者のみ）。"""
    obj = await _get_assignment_or_404(assignment_id, db)
    obj.deleted_at = _now_utc()
    obj.updated_by_user_id = current_user.id
    db.add(obj)
    await db.commit()


# ── 提出物 ────────────────────────────────────────────

@assignments_router.post(
    "/assignments/{assignment_id}/submissions",
    response_model=assignments_schema.SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="課題ファイルを提出（学生向け）",
)
async def submit_assignment(
    assignment_id: int,
    file: UploadFile = File(..., description="提出するファイル"),
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """学生が課題にファイルを提出します。再提出の場合は前の提出を非最新にします。"""
    # 課題取得
    obj = await _get_assignment_or_404(assignment_id, db)

    # 公開チェック（学生のみ）
    if not _is_teacher_or_admin(current_user):
        if not obj.is_published:
            raise HTTPException(status_code=403, detail="この課題は現在提出できません")
        # 締切チェック
        if obj.due_date and not obj.allow_late_submission:
            if _now_utc() > obj.due_date.replace(tzinfo=None):
                raise HTTPException(status_code=400, detail="提出期限を過ぎています")

    # ファイルサイズチェック
    file_content = await file.read()
    max_bytes = (obj.max_file_size_mb or 50) * 1024 * 1024
    if len(file_content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"ファイルサイズが上限（{obj.max_file_size_mb}MB）を超えています"
        )

    # ファイル拡張子チェック
    if obj.allowed_file_types:
        allowed = [ext.strip().lower() for ext in obj.allowed_file_types.split(",")]
        filename = file.filename or ""
        ext = Path(filename).suffix.lower()
        if ext not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"許可されていないファイル形式です。許可: {obj.allowed_file_types}"
            )

    # 既存提出の is_latest を False に更新
    prev_stmt = select(AssignmentSubmissions).where(
        AssignmentSubmissions.assignment_id == assignment_id,
        AssignmentSubmissions.student_user_id == current_user.id,
        AssignmentSubmissions.is_latest == True,  # noqa: E712
    )
    prev_sub = (await db.execute(prev_stmt)).scalar_one_or_none()
    submission_number = 1
    if prev_sub:
        prev_sub.is_latest = False
        submission_number = prev_sub.submission_number + 1
        db.add(prev_sub)

    # ファイルを保存
    save_dir = SUBMISSIONS_DIR / str(assignment_id) / str(current_user.id)
    save_dir.mkdir(parents=True, exist_ok=True)
    # 保存名にクライアント由来の filename を使わない（../ 等のパストラバーサル対策）。
    # 表示・ダウンロード時の名前は original_filename カラム側で保持している。
    safe_ext = re.sub(r"[^A-Za-z0-9.]", "", Path(file.filename or "").suffix)[:16]
    unique_name = f"{uuid.uuid4()}{safe_ext}"
    save_path = save_dir / unique_name

    with open(save_path, "wb") as f_out:
        f_out.write(file_content)

    # レコード作成
    new_sub = AssignmentSubmissions(
        assignment_id=assignment_id,
        student_user_id=current_user.id,
        file_path=str(save_path),
        original_filename=file.filename or "unknown",
        file_size_bytes=len(file_content),
        content_type=file.content_type,
        submission_number=submission_number,
        is_latest=True,
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)

    return _submission_to_response(new_sub)


@assignments_router.get(
    "/assignments/{assignment_id}/submissions",
    response_model=List[assignments_schema.SubmissionResponse],
    summary="提出一覧取得（教師向け）",
)
async def list_submissions(
    assignment_id: int,
    latest_only: bool = Query(True, description="最新提出のみ取得するか"),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """指定課題の全提出一覧を取得します（教師・管理者のみ）。"""
    stmt = (
        select(AssignmentSubmissions)
        .where(AssignmentSubmissions.assignment_id == assignment_id)
        .options(selectinload(AssignmentSubmissions.student))
        .order_by(AssignmentSubmissions.submitted_at.desc())
    )
    if latest_only:
        stmt = stmt.where(AssignmentSubmissions.is_latest == True)  # noqa: E712

    subs = (await db.execute(stmt)).scalars().all()

    return [
        assignments_schema.SubmissionResponse(
            id=s.id,
            assignment_id=s.assignment_id,
            student_user_id=s.student_user_id,
            original_filename=s.original_filename,
            file_size_bytes=s.file_size_bytes,
            content_type=s.content_type,
            submission_number=s.submission_number,
            is_latest=s.is_latest,
            score=float(s.score) if s.score is not None else None,
            max_score=float(s.max_score) if s.max_score is not None else None,
            teacher_comment=s.teacher_comment,
            graded_at=s.graded_at,
            graded_by_user_id=s.graded_by_user_id,
            submitted_at=s.submitted_at,
            student_display_name=s.student.display_name if s.student else None,
            student_email=s.student.email if s.student else None,
        )
        for s in subs
    ]


@assignments_router.get(
    "/submissions/{submission_id}/download",
    summary="提出ファイルダウンロード",
)
async def download_submission(
    submission_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """提出ファイルをダウンロードします。教師または提出した本人のみ可能。"""
    stmt = select(AssignmentSubmissions).where(AssignmentSubmissions.id == submission_id)
    sub = (await db.execute(stmt)).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="提出物が見つかりません")

    # アクセス制御
    if not _is_teacher_or_admin(current_user) and sub.student_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="このファイルにアクセスする権限がありません")

    file_path = Path(sub.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません（サーバー上のファイルが欠損しています）")

    return FileResponse(
        path=str(file_path),
        filename=sub.original_filename,
        media_type=sub.content_type or "application/octet-stream",
    )


@assignments_router.get(
    "/assignments/{assignment_id}/export",
    summary="課題提出一括エクスポート（ZIP）（教師向け）",
)
async def export_assignment_submissions_zip(
    assignment_id: int,
    zip_name_mode: str = Query(
        "legacy",
        description="ZIP名の命名規則（legacy / assignment_title / lesson_assignment_title）",
    ),
    inner_file_name_mode: str = Query(
        "student_number_name",
        description="ZIP内ファイル名の命名規則（student_number_name / class_roster_name）",
    ),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """
    指定課題の情報と提出ファイルを ZIP で一括エクスポートします。
    """
    if zip_name_mode not in ZIP_NAME_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"zip_name_mode が不正です: {zip_name_mode}",
        )
    if inner_file_name_mode not in INNER_FILE_NAME_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"inner_file_name_mode が不正です: {inner_file_name_mode}",
        )

    assignment = await _get_assignment_or_404(assignment_id, db)
    lesson = (await db.execute(
        select(CourseLessons).where(CourseLessons.id == assignment.lesson_id)
    )).scalar_one_or_none()
    lesson_number = lesson.lesson_number if lesson else 0
    lesson_title = lesson.title if lesson else "unknown_lesson"

    submissions_stmt = (
        select(AssignmentSubmissions)
        .where(
            AssignmentSubmissions.assignment_id == assignment_id,
            AssignmentSubmissions.is_latest == True,  # noqa: E712
        )
        .options(
            selectinload(AssignmentSubmissions.student).selectinload(users_model.Users.student)
        )
        .order_by(
            AssignmentSubmissions.student_user_id,
            AssignmentSubmissions.submission_number,
        )
    )
    submissions = (await db.execute(submissions_stmt)).scalars().all()

    buffer = io.BytesIO()
    missing_files: List[Dict[str, Any]] = []
    used_arc_names: set[str] = set()

    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        assignment_dir = (
            f"{_safe_path_component(assignment.title)}_{assignment.id}"
        )

        assignment_meta = {
            "id": assignment.id,
            "lesson_id": assignment.lesson_id,
            "lesson_title": lesson_title,
            "lesson_number": lesson_number,
            "title": assignment.title,
            "description": assignment.description,
            "is_published": assignment.is_published,
            "publish_start_at": assignment.publish_start_at.isoformat() if assignment.publish_start_at else None,
            "publish_end_at": assignment.publish_end_at.isoformat() if assignment.publish_end_at else None,
            "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
            "allow_late_submission": assignment.allow_late_submission,
            "max_file_size_mb": assignment.max_file_size_mb,
            "allowed_file_types": assignment.allowed_file_types,
            "display_order": assignment.display_order,
            "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
            "updated_at": assignment.updated_at.isoformat() if assignment.updated_at else None,
        }
        zf.writestr(
            f"{assignment_dir}/assignment.json",
            json.dumps(assignment_meta, ensure_ascii=False, indent=2),
        )

        if not submissions:
            zf.writestr(
                f"{assignment_dir}/README.txt",
                "この課題には提出ファイルがありません。",
            )

        for sub in submissions:
            file_path = Path(sub.file_path)
            original_name = Path(sub.original_filename).name
            safe_original = _safe_path_component(original_name)
            stem = _build_submission_file_stem(sub, inner_file_name_mode)
            submission_filename = f"{stem}_{safe_original}"
            submission_arcname = f"{assignment_dir}/{submission_filename}"

            if submission_arcname in used_arc_names:
                stem_with_id = f"{stem}_sub{sub.id}"
                submission_filename = f"{stem_with_id}_{safe_original}"
                submission_arcname = f"{assignment_dir}/{submission_filename}"
            used_arc_names.add(submission_arcname)

            if file_path.exists():
                zf.write(file_path, submission_arcname)
            else:
                missing_files.append({
                    "assignment_id": assignment.id,
                    "submission_id": sub.id,
                    "file_path": str(file_path),
                    "expected_arcname": submission_arcname,
                })

        manifest = {
            "assignment_id": assignment.id,
            "exported_at": _now_utc().isoformat(),
            "exported_by_user_id": current_user.id,
            "submission_count": len(submissions),
            "zip_name_mode": zip_name_mode,
            "inner_file_name_mode": inner_file_name_mode,
            "missing_file_count": len(missing_files),
            "missing_files": missing_files,
        }
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
        )

    buffer.seek(0)
    filename = _build_export_zip_filename(assignment, lesson_number, zip_name_mode)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": _build_content_disposition(filename)},
    )


@assignments_router.put(
    "/submissions/{submission_id}/grade",
    response_model=assignments_schema.SubmissionResponse,
    summary="採点（教師向け）",
)
async def grade_submission(
    submission_id: int,
    body: assignments_schema.GradeSubmissionRequest,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """提出物に採点とコメントをつけます（教師・管理者のみ）。"""
    stmt = (
        select(AssignmentSubmissions)
        .where(AssignmentSubmissions.id == submission_id)
        .options(selectinload(AssignmentSubmissions.student))
    )
    sub = (await db.execute(stmt)).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="提出物が見つかりません")

    sub.score = body.score
    sub.max_score = body.max_score
    sub.teacher_comment = body.teacher_comment
    sub.graded_at = _now_utc() if (body.score is not None or body.teacher_comment) else None
    sub.graded_by_user_id = current_user.id if sub.graded_at else None

    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    return assignments_schema.SubmissionResponse(
        id=sub.id,
        assignment_id=sub.assignment_id,
        student_user_id=sub.student_user_id,
        original_filename=sub.original_filename,
        file_size_bytes=sub.file_size_bytes,
        content_type=sub.content_type,
        submission_number=sub.submission_number,
        is_latest=sub.is_latest,
        score=float(sub.score) if sub.score is not None else None,
        max_score=float(sub.max_score) if sub.max_score is not None else None,
        teacher_comment=sub.teacher_comment,
        graded_at=sub.graded_at,
        graded_by_user_id=sub.graded_by_user_id,
        submitted_at=sub.submitted_at,
        student_display_name=sub.student.display_name if sub.student else None,
        student_email=sub.student.email if sub.student else None,
    )


@assignments_router.get(
    "/assignments/{assignment_id}/my-submissions",
    response_model=List[assignments_schema.SubmissionResponse],
    summary="自分の提出履歴取得（学生向け）",
)
async def get_my_submissions(
    assignment_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """学生が自分の提出履歴を取得します（全バージョン）。"""
    stmt = (
        select(AssignmentSubmissions)
        .where(
            AssignmentSubmissions.assignment_id == assignment_id,
            AssignmentSubmissions.student_user_id == current_user.id,
        )
        .order_by(AssignmentSubmissions.submission_number.desc())
    )
    subs = (await db.execute(stmt)).scalars().all()
    return [_submission_to_response(s) for s in subs]
