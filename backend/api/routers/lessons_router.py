"""
レッスン関連API

このモジュールでは、レッスンコンテンツのアップロードなど、
レッスンに関連するAPIエンドポイントを定義します。
"""
from pathlib import Path
import os
from typing import List, Dict, Any, Optional
import json
import re
import yaml
from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher, require_admin
from api.models import users_model, questions_model, exercises_model, courses_model
from api.repositories.lessons_repo import LessonRepository
from api.repositories.contents_repo import ContentRepository
from api.repositories.users_repo import UserRepository
from api.services.lessons_service import LessonService
from api.services.contents_service import ContentService
from api.services.lesson_content_service import LessonContentService
import api.schemas.lessons as lessons_schema
import api.schemas.contents as contents_schema


lessons_router = APIRouter(tags=["レッスン管理"])


def get_lesson_repo(db: AsyncSession = Depends(get_db)) -> LessonRepository:
    return LessonRepository(db)


def _normalize_question_ids(raw_ids) -> List[int]:
    """JSONBに保存されたquestion_idsを int の配列へ正規化する。"""
    if raw_ids is None:
        return []
    if isinstance(raw_ids, list):
        result = []
        for qid in raw_ids:
            try:
                result.append(int(qid))
            except (TypeError, ValueError):
                continue
        return result
    if isinstance(raw_ids, dict):
        # 旧データ互換: {"ids":[1,2]} / {"question_ids":[...]} など
        for key in ("ids", "question_ids"):
            if key in raw_ids and isinstance(raw_ids[key], list):
                return _normalize_question_ids(raw_ids[key])
    return []


def _normalize_tag_names(raw_names: List[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for raw in raw_names:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(name)
    return normalized


def _slugify_tag_name(tag_name: str) -> str:
    return "-".join(tag_name.strip().lower().split())


def get_content_repo(db: AsyncSession = Depends(get_db)) -> ContentRepository:
    return ContentRepository(db)


def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def get_lesson_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo)
) -> LessonService:
    return LessonService(lesson_repo)


def get_content_service(
    content_repo: ContentRepository = Depends(get_content_repo),
    user_repo: UserRepository = Depends(get_user_repo)
) -> ContentService:
    return ContentService(content_repo, user_repo)


def get_lesson_content_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    content_repo: ContentRepository = Depends(get_content_repo),
    user_repo: UserRepository = Depends(get_user_repo)
) -> LessonContentService:
    return LessonContentService(
        lesson_repo=lesson_repo,
        content_repo=content_repo,
        user_repo=user_repo
    )


@lessons_router.get("/courses/{course_id}/lessons", response_model=List[lessons_schema.Lesson], summary="コースのレッスン一覧取得")
async def get_course_lessons(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのレッスンの一覧を取得します。"""
    return await lesson_service.get_lessons_by_course_id(course_id=course_id, include_inactive=include_inactive)


@lessons_router.post("/courses/{course_id}/lessons", response_model=lessons_schema.Lesson, status_code=status.HTTP_201_CREATED, summary="レッスンコンテンツの登録")
async def register_lesson_content(
    course_id: int,
    request_body: lessons_schema.LessonContentUploadRequest,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_content_service: LessonContentService = Depends(get_lesson_content_service)
):
    """レッスンコンテンツをアップロードし、データベースに登録します。"""
    try:
        # リクエストボディの course_id をパスパラメータで上書き
        request_body.course_id = course_id
        db_lesson = await lesson_content_service.register_lesson_content(
            lesson_upload_request=request_body,
            current_user=current_user
        )
        return db_lesson
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Server Error during registration: {str(e)}")


@lessons_router.put("/lessons/{lesson_id}", response_model=lessons_schema.Lesson, summary="レッスン情報更新")
async def update_lesson(
    lesson_id: int,
    lesson_in: lessons_schema.LessonUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
):
    """レッスン情報（lesson_number, display_order, title など）を更新します。"""
    lesson = await lesson_repo.get_lesson_by_id(lesson_id=lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="該当するレッスンが見つかりません")

    updated = await lesson_repo.update_lesson(
        lesson=lesson,
        lesson_in=lesson_in,
        updated_by_user_id=current_user.id,
    )
    await lesson_repo.db.commit()
    return updated


@lessons_router.get("/lesson-item/{lesson_item_id}", response_model=lessons_schema.LessonItem, summary="レッスン項目情報取得")
async def get_lesson_item_by_id(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service)
):
    """指定したレッスン項目IDに対応するレッスン項目情報を取得します。"""
    item = await lesson_service.get_lesson_item_by_id(lesson_item_id=lesson_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="該当するレッスン項目が見つかりません")
    return item


@lessons_router.get("/lesson-items/{lesson_item_id}/lesson-pages", response_model=List[lessons_schema.LessonPageWithContentBody], summary="レッスン項目に紐づく教科書ページ一覧＋本文取得")
async def list_lesson_pages_with_content_body_by_lesson_item(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    content_repo: ContentRepository = Depends(get_content_repo)
):
    """指定したレッスン項目IDに紐づく教科書ページを全て取得し、content_bodyも含めて返します。"""
    pages = await lesson_service.list_lesson_pages_with_content_body_by_lesson_item_id(
        lesson_item_id=lesson_item_id, content_repo=content_repo
    )
    if not pages:
        raise HTTPException(status_code=404, detail="該当する教科書ページが見つかりません")
    return pages


@lessons_router.get("/lesson-items/{lesson_item_id}/flowpage-sets", response_model=List[lessons_schema.FlowpageSetWithQuestions], summary="レッスン項目に紐づく演習セット＋問題一覧取得")
async def list_flowpage_sets_with_questions_by_lesson_item(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service)
):
    """指定したレッスン項目IDに紐づく演習セットと問題一覧を取得します。新スキーマでは空リストを返します。"""
    return await lesson_service.list_flowpage_sets_with_questions_by_lesson_item_id(lesson_item_id=lesson_item_id)


@lessons_router.get("/courses/{course_id}/lesson-items", response_model=Dict[int, List[lessons_schema.LessonItem]], summary="コースのレッスン項目一覧取得")
async def get_course_lesson_items(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのすべてのレッスン項目を、レッスンIDをキーとする辞書で取得します。"""
    return await lesson_service.get_lesson_items_by_course_id(course_id=course_id, include_inactive=include_inactive)


@lessons_router.put("/lesson-item/{lesson_item_id}", response_model=lessons_schema.LessonItem, summary="レッスン項目更新")
async def update_lesson_item(
    lesson_item_id: int,
    item_in: lessons_schema.LessonItemUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
):
    """レッスン項目情報を更新します。"""
    item = await lesson_repo.get_lesson_item_by_id(item_id=lesson_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="該当するレッスン項目が見つかりません")

    updated = await lesson_repo.update_lesson_item(
        item=item,
        item_in=item_in,
        updated_by_user_id=current_user.id,
    )
    await lesson_repo.db.commit()
    return updated


@lessons_router.delete(
    "/lesson-item/{lesson_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="レッスン項目削除（論理削除）",
)
async def delete_lesson_item(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
):
    """レッスン項目を論理削除します。"""
    _ = current_user
    item = await lesson_repo.get_lesson_item_by_id(item_id=lesson_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="該当するレッスン項目が見つかりません")

    await lesson_repo.soft_delete_lesson_item(item=item)
    await lesson_repo.db.commit()
    return


@lessons_router.put("/lesson-pages/{lesson_page_id}/content", response_model=lessons_schema.LessonPageWithContentBody, summary="教科書ページ本文更新")
async def update_lesson_page_content(
    lesson_page_id: int,
    body_in: lessons_schema.LessonPageContentUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    content_service: ContentService = Depends(get_content_service),
):
    """教科書ページの本文（raw/rendered）を更新します。"""
    page = await lesson_repo.get_lesson_page_by_id(page_id=lesson_page_id)
    if not page:
        raise HTTPException(status_code=404, detail="該当する教科書ページが見つかりません")

    updated_raw_body = None
    updated_rendered_body = None

    if page.raw_content_id:
        updated_raw = await content_service.update_content(
            content_id=page.raw_content_id,
            content_in=contents_schema.ContentCreate(content_body=body_in.content, format_type="markdown"),
            current_user=current_user,
        )
        updated_raw_body = updated_raw.content_body if updated_raw else None

    if page.rendered_content_id:
        updated_rendered = await content_service.update_content(
            content_id=page.rendered_content_id,
            content_in=contents_schema.ContentCreate(content_body=body_in.content, format_type="markdown"),
            current_user=current_user,
        )
        updated_rendered_body = updated_rendered.content_body if updated_rendered else None

    return {
        "id": page.id,
        "lesson_id": page.lesson_id,
        "page_number": page.page_number,
        "raw_content_id": page.raw_content_id,
        "rendered_content_id": page.rendered_content_id,
        "is_active": page.is_active,
        "title": page.title,
        "visibility_start_date_time": page.visibility_start_date_time,
        "visibility_end_date_time": page.visibility_end_date_time,
        "is_always_visible": page.is_always_visible,
        "created_at": page.created_at,
        "created_by_user_id": page.created_by_user_id,
        "updated_at": page.updated_at,
        "updated_by_user_id": page.updated_by_user_id,
        "deleted_at": page.deleted_at,
        "raw_content_body": updated_raw_body,
        "rendered_content_body": updated_rendered_body,
    }


@lessons_router.get(
    "/lesson-pages/{lesson_page_id}/markers",
    response_model=List[lessons_schema.TextbookMarkerResponse],
    summary="教科書ページのマーカー一覧取得",
)
async def list_textbook_markers(
    lesson_page_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    lesson_service: LessonService = Depends(get_lesson_service),
):
    """ログインユーザーの教科書マーカー一覧を取得します。"""
    page = await lesson_repo.get_lesson_page_by_id(page_id=lesson_page_id)
    if not page:
        raise HTTPException(status_code=404, detail="該当する教科書ページが見つかりません")

    return await lesson_service.list_textbook_markers_by_page_and_user(
        lesson_page_id=lesson_page_id,
        user_id=current_user.id,
    )


@lessons_router.post(
    "/lesson-pages/{lesson_page_id}/markers",
    response_model=lessons_schema.TextbookMarkerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="教科書ページにマーカー追加",
)
async def create_textbook_marker(
    lesson_page_id: int,
    marker_in: lessons_schema.TextbookMarkerCreate,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    lesson_service: LessonService = Depends(get_lesson_service),
):
    """ログインユーザーの教科書マーカーを追加します。"""
    page = await lesson_repo.get_lesson_page_by_id(page_id=lesson_page_id)
    if not page:
        raise HTTPException(status_code=404, detail="該当する教科書ページが見つかりません")

    marker = await lesson_service.create_textbook_marker(
        lesson_page_id=lesson_page_id,
        marker_in=marker_in,
        user_id=current_user.id,
    )
    await lesson_repo.db.commit()
    return marker


@lessons_router.delete(
    "/textbook-markers/{marker_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="教科書マーカー削除",
)
async def delete_textbook_marker(
    marker_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    lesson_service: LessonService = Depends(get_lesson_service),
):
    """ログインユーザーの教科書マーカーを削除します。"""
    deleted = await lesson_service.delete_textbook_marker_by_id_and_user(
        marker_id=marker_id,
        user_id=current_user.id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="該当するマーカーが見つかりません")
    await lesson_repo.db.commit()
    return


@lessons_router.get("/questions", response_model=List[lessons_schema.CourseQuestion], summary="演習問題一覧取得")
async def list_questions(
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    content_service: ContentService = Depends(get_content_service),
    include_inactive: bool = Query(False, description="非アクティブ問題を含めるかどうか"),
):
    """全問題一覧を返します。"""
    _ = current_user
    stmt = select(questions_model.Questions).options(selectinload(questions_model.Questions.tags))
    if not include_inactive:
        stmt = stmt.where(questions_model.Questions.is_active == True)  # noqa: E712
    stmt = stmt.order_by(questions_model.Questions.id.desc())
    questions = (await db.execute(stmt)).scalars().unique().all()

    response_items = []
    for q in questions:
        normalized_content = await _normalize_image_refs_in_content_data(
            q.content_data, content_service
        )
        response_items.append(
            {
                "id": q.id,
                "title": q.title,
                "question_type": q.question_type,
                "difficulty": q.difficulty,
                "is_active": q.is_active,
                "content_data": normalized_content,
                "tag_names": [tag.name for tag in q.tags],
            }
        )
    return response_items


def _parse_question_file(file_content: bytes, filename: str) -> Dict[str, Any]:
    """ファイル（JSON/YAML）をパースして、API形式に変換します。"""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    
    try:
        if ext in ("yaml", "yml"):
            data = yaml.safe_load(file_content.decode("utf-8"))
        elif ext == "json":
            data = json.loads(file_content.decode("utf-8"))
        else:
            raise HTTPException(
                status_code=400,
                detail=f"サポートされていないファイル形式です: {ext}。JSON または YAML ファイルをアップロードしてください。"
            )
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"YAMLのパースに失敗しました: {str(e)}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JSONのパースに失敗しました: {str(e)}")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail=f"ファイルの文字エンコーディングが無効です: {str(e)}")
    
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="ファイルのルート要素はオブジェクトである必要があります")
    
    # ファイル形式（content, tags）をAPI形式（content_data, tag_names）に変換
    if "content" not in data:
        raise HTTPException(status_code=400, detail="ファイルに 'content' フィールドがありません")
    
    result = {
        "title": data.get("title", "").strip(),
        "question_type": data.get("question_type", "").strip(),
        "difficulty": data.get("difficulty"),
        "is_active": data.get("is_active", True),
        "content_data": data["content"],
        "tag_names": data.get("tags", []),
    }
    
    if not result["title"]:
        raise HTTPException(status_code=400, detail="'title' フィールドが必須です")
    if not result["question_type"]:
        raise HTTPException(status_code=400, detail="'question_type' フィールドが必須です")
    
    return result


IMAGE_REF_PATTERN = re.compile(r"\[image/([^\]\s]+)\]")


async def _replace_image_refs_in_text(
    text: str, content_service: ContentService
) -> str:
    """`[image/xxx.png]` を `![xxx.png](/api/images/{id})` へ変換する。"""
    if not text:
        return text

    image_names = {m.group(1).strip() for m in IMAGE_REF_PATTERN.finditer(text)}
    if not image_names:
        return text

    image_id_map: Dict[str, int] = {}
    for image_name in image_names:
        image = await content_service.get_image_by_original_name(original_name=image_name)
        if image is not None:
            image_id_map[image_name] = image.id

    if not image_id_map:
        return text

    def _to_markdown_image(match: re.Match) -> str:
        image_name = match.group(1).strip()
        image_id = image_id_map.get(image_name)
        if image_id is None:
            return match.group(0)
        return f"![{image_name}](/api/images/{image_id})"

    return IMAGE_REF_PATTERN.sub(_to_markdown_image, text)


async def _normalize_image_refs_in_content_data(
    content_data: Any, content_service: ContentService
) -> Any:
    """content_data 全体を再帰的に走査して画像参照記法を置換する。"""
    if isinstance(content_data, dict):
        normalized: Dict[str, Any] = {}
        for key, value in content_data.items():
            normalized[key] = await _normalize_image_refs_in_content_data(
                value, content_service
            )
        return normalized
    if isinstance(content_data, list):
        return [
            await _normalize_image_refs_in_content_data(item, content_service)
            for item in content_data
        ]
    if isinstance(content_data, str):
        return await _replace_image_refs_in_text(content_data, content_service)
    return content_data


@lessons_router.post(
    "/questions/upload",
    summary="演習問題ファイル一括アップロード",
)
async def upload_question_files(
    files: List[UploadFile] = File(..., description="アップロードする問題ファイル（JSON/YAML、複数可）"),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
    content_service: ContentService = Depends(get_content_service),
):
    """JSON/YAMLファイルから演習問題を一括登録します。1ファイル=1問の形式を想定しています。
    
    成功した問題とエラー情報の両方を返します。
    - すべて成功: 201 Created で問題リストを返す
    - 一部成功・一部失敗: 207 Multi-Status で成功分とエラー情報を返す
    - すべて失敗: 400 Bad Request でエラー情報を返す
    """
    if not files:
        raise HTTPException(status_code=400, detail="ファイルを1つ以上選択してください")
    
    created_questions = []
    errors = []
    
    for f in files:
        if not f.filename:
            errors.append("ファイル名がありません")
            continue
        
        try:
            file_content = await f.read()
            if len(file_content) == 0:
                errors.append(f"{f.filename}: ファイルが空です")
                continue
            
            # ファイルをパースしてAPI形式に変換
            parsed = _parse_question_file(file_content, f.filename)
            parsed["content_data"] = await _normalize_image_refs_in_content_data(
                parsed["content_data"], content_service
            )
            
            # 既存のcreate_questionロジックを再利用
            normalized_tag_names = _normalize_tag_names(parsed["tag_names"])
            
            attached_tags: List[questions_model.Tags] = []
            if normalized_tag_names:
                existing_stmt = select(questions_model.Tags).where(
                    questions_model.Tags.name.in_(normalized_tag_names)
                )
                existing_tags = (await db.execute(existing_stmt)).scalars().all()
                tag_map = {tag.name.lower(): tag for tag in existing_tags}
                
                missing_tags = []
                for tag_name in normalized_tag_names:
                    lower_name = tag_name.lower()
                    tag = tag_map.get(lower_name)
                    if tag is None:
                        missing_tags.append(tag_name)
                    else:
                        attached_tags.append(tag)
                
                if missing_tags:
                    errors.append(f"{f.filename}: 以下のタグは存在しません: {', '.join(missing_tags)}")
                    continue
            
            db_obj = questions_model.Questions(
                title=parsed["title"],
                question_type=parsed["question_type"],
                difficulty=parsed["difficulty"],
                content_data=parsed["content_data"],
                is_active=parsed["is_active"],
                tags=attached_tags,
            )
            db.add(db_obj)
            await db.flush()
            await db.refresh(db_obj)
            
            # attached_tags を直接使用（既に読み込まれているため、リレーションシップアクセスを避ける）
            tag_names_list = [tag.name for tag in attached_tags]
            
            created_questions.append({
                "id": db_obj.id,
                "title": db_obj.title,
                "question_type": db_obj.question_type,
                "difficulty": db_obj.difficulty,
                "is_active": db_obj.is_active,
                "content_data": db_obj.content_data,
                "tag_names": tag_names_list,
            })
            
        except HTTPException as e:
            errors.append(f"{f.filename}: {e.detail}")
            continue
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")
            continue
    
    await db.commit()
    
    # すべて失敗した場合
    if errors and not created_questions:
        raise HTTPException(
            status_code=400,
            detail=f"すべてのファイルの処理に失敗しました:\n" + "\n".join(errors)
        )
    
    # 一部成功・一部失敗の場合
    if errors:
        return JSONResponse(
            status_code=status.HTTP_207_MULTI_STATUS,
            content={
                "created_questions": created_questions,
                "errors": errors,
                "success_count": len(created_questions),
                "error_count": len(errors),
            }
        )
    
    # すべて成功した場合
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=created_questions
    )


@lessons_router.post(
    "/questions",
    response_model=lessons_schema.CourseQuestion,
    status_code=status.HTTP_201_CREATED,
    summary="演習問題作成",
)
async def create_question(
    question_in: lessons_schema.CourseQuestionCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
    content_service: ContentService = Depends(get_content_service),
):
    """演習問題を作成します。"""
    _ = current_user
    normalized_tag_names = _normalize_tag_names(question_in.tag_names)

    attached_tags: List[questions_model.Tags] = []
    if normalized_tag_names:
        existing_stmt = select(questions_model.Tags).where(
            questions_model.Tags.name.in_(normalized_tag_names)
        )
        existing_tags = (await db.execute(existing_stmt)).scalars().all()
        tag_map = {tag.name.lower(): tag for tag in existing_tags}
        
        # 存在しないタグがないかチェック
        missing_tags = []
        for tag_name in normalized_tag_names:
            lower_name = tag_name.lower()
            tag = tag_map.get(lower_name)
            if tag is None:
                missing_tags.append(tag_name)
            else:
                attached_tags.append(tag)
        
        if missing_tags:
            raise HTTPException(
                status_code=400,
                detail=f"以下のタグは存在しません。事前にタグ管理画面で作成してください: {', '.join(missing_tags)}"
            )

    normalized_content_data = await _normalize_image_refs_in_content_data(
        question_in.content_data, content_service
    )

    db_obj = questions_model.Questions(
        title=question_in.title.strip(),
        question_type=question_in.question_type.strip(),
        difficulty=question_in.difficulty,
        content_data=normalized_content_data,
        is_active=question_in.is_active,
        tags=attached_tags,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return {
        "id": db_obj.id,
        "title": db_obj.title,
        "question_type": db_obj.question_type,
        "difficulty": db_obj.difficulty,
        "is_active": db_obj.is_active,
        "content_data": db_obj.content_data,
        "tag_names": [tag.name for tag in db_obj.tags],
    }


@lessons_router.put(
    "/questions/{question_id}",
    response_model=lessons_schema.CourseQuestion,
    summary="演習問題更新",
)
async def update_course_question(
    question_id: int,
    question_in: lessons_schema.CourseQuestionUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
    content_service: ContentService = Depends(get_content_service),
):
    """演習問題を更新します。"""
    _ = current_user
    stmt = (
        select(questions_model.Questions)
        .where(questions_model.Questions.id == question_id)
        .options(selectinload(questions_model.Questions.tags))
    )
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="該当する問題が見つかりません")

    normalized_tag_names = _normalize_tag_names(question_in.tag_names)
    
    attached_tags: List[questions_model.Tags] = []
    if normalized_tag_names:
        existing_stmt = select(questions_model.Tags).where(
            questions_model.Tags.name.in_(normalized_tag_names)
        )
        existing_tags = (await db.execute(existing_stmt)).scalars().all()
        tag_map = {tag.name.lower(): tag for tag in existing_tags}
        
        # 存在しないタグがないかチェック
        missing_tags = []
        for tag_name in normalized_tag_names:
            lower_name = tag_name.lower()
            tag = tag_map.get(lower_name)
            if tag is None:
                missing_tags.append(tag_name)
            else:
                attached_tags.append(tag)
        
        if missing_tags:
            raise HTTPException(
                status_code=400,
                detail=f"以下のタグは存在しません。事前にタグ管理画面で作成してください: {', '.join(missing_tags)}"
            )

    normalized_content_data = await _normalize_image_refs_in_content_data(
        question_in.content_data, content_service
    )

    db_obj.title = question_in.title.strip()
    db_obj.question_type = question_in.question_type.strip()
    db_obj.difficulty = question_in.difficulty
    db_obj.content_data = normalized_content_data
    db_obj.is_active = question_in.is_active
    db_obj.tags = attached_tags
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return {
        "id": db_obj.id,
        "title": db_obj.title,
        "question_type": db_obj.question_type,
        "difficulty": db_obj.difficulty,
        "is_active": db_obj.is_active,
        "content_data": db_obj.content_data,
        "tag_names": [tag.name for tag in db_obj.tags],
    }


@lessons_router.delete(
    "/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="演習問題削除",
)
async def delete_question(
    question_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """演習問題を削除します。"""
    _ = current_user
    stmt = select(questions_model.Questions).where(questions_model.Questions.id == question_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="該当する問題が見つかりません")
    
    await db.delete(db_obj)
    await db.commit()
    return None


@lessons_router.get("/tags", response_model=List[lessons_schema.CourseTag], summary="タグ一覧取得")
async def list_tags(
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """タグ一覧を取得します。"""
    _ = current_user
    stmt = select(questions_model.Tags).order_by(questions_model.Tags.name.asc())
    tags = (await db.execute(stmt)).scalars().all()
    return [{"id": t.id, "name": t.name, "slug": t.slug} for t in tags]


@lessons_router.post(
    "/tags",
    response_model=lessons_schema.CourseTag,
    status_code=status.HTTP_201_CREATED,
    summary="タグ作成",
)
async def create_tag(
    tag_in: lessons_schema.CourseTagCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """タグを作成します。既存タグ（大文字小文字違い含む）がある場合はそれを返します。"""
    _ = current_user
    normalized_name = tag_in.name.strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="タグ名を入力してください")

    existing_stmt = select(questions_model.Tags).where(
        func.lower(questions_model.Tags.name) == normalized_name.lower()
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "name": existing.name, "slug": existing.slug}

    db_obj = questions_model.Tags(
        name=normalized_name,
        slug=_slugify_tag_name(normalized_name),
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return {"id": db_obj.id, "name": db_obj.name, "slug": db_obj.slug}


@lessons_router.delete(
    "/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="タグ削除",
)
async def delete_tag(
    tag_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """タグを削除します。問題に紐づいているタグも自動的に削除されます。"""
    _ = current_user
    stmt = select(questions_model.Tags).where(questions_model.Tags.id == tag_id)
    tag = (await db.execute(stmt)).scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="該当するタグが見つかりません")
    
    await db.delete(tag)
    await db.commit()
    return


@lessons_router.get("/courses/{course_id}/questions", response_model=List[lessons_schema.CourseQuestion], summary="コース編集用・演習問題一覧取得")
async def list_course_questions(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    content_service: ContentService = Depends(get_content_service),
    include_inactive: bool = Query(True, description="非アクティブ問題を含めるか（編集画面では true 推奨）"),
):
    """コースの演習問題編集時に参照する問題一覧を返します。全問題を返し、演習セットへの割り当てに利用します。"""
    _ = (current_user, course_id)
    stmt = select(questions_model.Questions).options(selectinload(questions_model.Questions.tags))
    if not include_inactive:
        stmt = stmt.where(questions_model.Questions.is_active == True)  # noqa: E712
    stmt = stmt.order_by(questions_model.Questions.id.desc())
    questions = (await db.execute(stmt)).scalars().unique().all()
    response_items = []
    for q in questions:
        normalized_content = await _normalize_image_refs_in_content_data(
            q.content_data, content_service
        )
        response_items.append(
            {
                "id": q.id,
                "title": q.title,
                "question_type": q.question_type,
                "difficulty": q.difficulty,
                "is_active": q.is_active,
                "content_data": normalized_content,
                "tag_names": [tag.name for tag in q.tags],
            }
        )
    return response_items


@lessons_router.get("/courses/{course_id}/exercise-sets", response_model=List[lessons_schema.ExerciseSet], summary="コース演習セット一覧取得")
async def list_course_exercise_sets(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """コースに紐づく演習セット一覧を取得します。"""
    _ = current_user
    stmt = (
        select(exercises_model.ExerciseSets)
        .where(exercises_model.ExerciseSets.course_id == course_id)
        .order_by(exercises_model.ExerciseSets.id.desc())
    )
    sets = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "course_id": s.course_id,
            "question_ids": _normalize_question_ids(s.question_ids),
            "due_date": s.due_date,
        }
        for s in sets
    ]


@lessons_router.post("/courses/{course_id}/exercise-sets", response_model=lessons_schema.ExerciseSet, status_code=status.HTTP_201_CREATED, summary="演習セット作成")
async def create_exercise_set(
    course_id: int,
    set_in: lessons_schema.ExerciseSetCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """コースに演習セットを作成します。"""
    _ = current_user
    db_obj = exercises_model.ExerciseSets(
        title=set_in.title,
        description=set_in.description,
        course_id=course_id,
        question_ids=set_in.question_ids,
        due_date=set_in.due_date,
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return {
        "id": db_obj.id,
        "title": db_obj.title,
        "description": db_obj.description,
        "course_id": db_obj.course_id,
        "question_ids": _normalize_question_ids(db_obj.question_ids),
        "due_date": db_obj.due_date,
    }


@lessons_router.get("/exercise-sets/{exercise_set_id}", response_model=lessons_schema.ExerciseSet, summary="演習セット1件取得")
async def get_exercise_set(
    exercise_set_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """演習セットを1件取得します（プレビュー等で使用）。"""
    _ = current_user
    stmt = select(exercises_model.ExerciseSets).where(exercises_model.ExerciseSets.id == exercise_set_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="該当する演習セットが見つかりません")
    return {
        "id": db_obj.id,
        "title": db_obj.title,
        "description": db_obj.description,
        "course_id": db_obj.course_id,
        "question_ids": _normalize_question_ids(db_obj.question_ids),
        "due_date": db_obj.due_date,
    }


@lessons_router.put("/exercise-sets/{exercise_set_id}", response_model=lessons_schema.ExerciseSet, summary="演習セット更新")
async def update_exercise_set(
    exercise_set_id: int,
    set_in: lessons_schema.ExerciseSetCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """演習セット情報（タイトル、説明、問題構成）を更新します。"""
    _ = current_user
    stmt = select(exercises_model.ExerciseSets).where(exercises_model.ExerciseSets.id == exercise_set_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="該当する演習セットが見つかりません")

    db_obj.title = set_in.title
    db_obj.description = set_in.description
    db_obj.question_ids = set_in.question_ids
    db_obj.due_date = set_in.due_date
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return {
        "id": db_obj.id,
        "title": db_obj.title,
        "description": db_obj.description,
        "course_id": db_obj.course_id,
        "question_ids": _normalize_question_ids(db_obj.question_ids),
        "due_date": db_obj.due_date,
    }


@lessons_router.delete(
    "/exercise-sets/{exercise_set_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="演習セット削除",
)
async def delete_exercise_set(
    exercise_set_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """演習セットを削除します。"""
    _ = current_user
    stmt = select(exercises_model.ExerciseSets).where(exercises_model.ExerciseSets.id == exercise_set_id)
    db_obj = (await db.execute(stmt)).scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="該当する演習セットが見つかりません")
    await db.delete(db_obj)
    await db.commit()
    return None


@lessons_router.post("/images/upload", response_model=List[contents_schema.Image], summary="画像一括アップロード")
async def upload_images(
    files: List[UploadFile] = File(..., description="アップロードする画像ファイル（複数可）"),
    content_service: ContentService = Depends(get_content_service),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
):
    """画像をまとめてアップロードし、演習問題などで参照できるようにします。同じファイル名が既に登録されている場合は弾きます。"""
    if not files:
        raise HTTPException(status_code=400, detail="ファイルを1つ以上選択してください")
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
    # 有効なファイルだけ読み込み (filename, content_type, data)
    candidates = []
    for f in files:
        if not f.filename or f.filename.strip() == "":
            continue
        content_type = f.content_type or ""
        if content_type and content_type not in allowed_types:
            ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
            if ext not in ("jpg", "jpeg", "png", "gif", "webp", "svg"):
                continue
        try:
            data = await f.read()
        except Exception:
            continue
        if len(data) == 0:
            continue
        candidates.append((f.filename.strip(), content_type or "image/jpeg", data))

    if not candidates:
        raise HTTPException(status_code=400, detail="有効な画像ファイルがありません")

    # 同一リクエスト内で同じファイル名が複数ある場合は弾く
    name_lower_to_count = {}
    for name, _, _ in candidates:
        key = name.lower()
        name_lower_to_count[key] = name_lower_to_count.get(key, 0) + 1
    dupes_in_request = []
    seen_lower = {}
    for name, _, _ in candidates:
        if name_lower_to_count[name.lower()] > 1 and name.lower() not in seen_lower:
            seen_lower[name.lower()] = name
            dupes_in_request.append(name)
    if dupes_in_request:
        raise HTTPException(
            status_code=400,
            detail=f"同じリクエスト内で重複しているファイル名があります: {', '.join(dupes_in_request)}",
        )

    # 既にDBに同じ original_name が存在する場合は弾く
    already_exists = []
    for name, _, _ in candidates:
        if await content_service.image_original_name_exists(original_name=name):
            already_exists.append(name)
    if already_exists:
        raise HTTPException(
            status_code=400,
            detail=f"次のファイル名は既に登録されています: {', '.join(already_exists)}",
        )

    created = []
    for original_file_name, mime_type, data in candidates:
        img = await content_service.upload_image(
            file_data=data,
            original_file_name=original_file_name,
            mime_type=mime_type,
            uploaded_by_user_id=current_user.id,
            alt_text=None,
        )
        created.append(contents_schema.Image.model_validate(img))
    return created


@lessons_router.get("/images", response_model=List[contents_schema.Image], summary="画像一覧取得")
async def list_images(
    limit: int = Query(100, ge=1, le=500, description="取得件数"),
    offset: int = Query(0, ge=0, description="オフセット"),
    content_service: ContentService = Depends(get_content_service),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
):
    """登録済み画像の一覧を取得します。演習問題の content_data で ![](/api/images/{id}) として参照できます。"""
    _ = current_user
    images = await content_service.list_images(limit=limit, offset=offset)
    return [contents_schema.Image.model_validate(img) for img in images]


@lessons_router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT, summary="画像削除")
async def delete_image(
    image_id: int,
    content_service: ContentService = Depends(get_content_service),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
):
    """画像を削除します。問題文中で参照している場合は表示できなくなります。"""
    success = await content_service.delete_image(image_id=image_id, current_user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="画像が見つかりません")


@lessons_router.get("/images/{image_id}", summary="画像ファイル取得")
async def get_image_file(
    image_id: int,
    content_service: ContentService = Depends(get_content_service),
):
    """
    画像IDから画像ファイルを返します。
    images.file_path は相対パス("./static/...")で保存されるため、backend ディレクトリ基準で解決します。
    """
    file_path = await content_service.get_image_file_path(image_id=image_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="画像が見つかりません")

    backend_dir = Path(__file__).resolve().parents[2]  # .../backend
    upload_root = Path(os.getenv("UPLOAD_ROOT", "/app/uploads"))

    normalized = file_path.lstrip("./\\")
    raw_path = Path(file_path)
    candidates: List[Path] = []

    if raw_path.is_absolute():
        candidates.append(raw_path)
    else:
        candidates.append((backend_dir / normalized).resolve())
        candidates.append((upload_root / normalized).resolve())

    absolute_path = next(
        (candidate for candidate in candidates if candidate.exists() and candidate.is_file()),
        None,
    )

    if absolute_path is None:
        raise HTTPException(status_code=404, detail="画像ファイルが見つかりません")

    return FileResponse(path=str(absolute_path))

#
# Exercise Session / Student Answer Endpoints
#

@lessons_router.post("/exercise-sets/{exercise_set_id}/sessions", response_model=lessons_schema.ExerciseSessionResponse, status_code=status.HTTP_201_CREATED, summary="テスト(演習)の開始")
async def start_exercise_session(
    exercise_set_id: int,
    _body: lessons_schema.ExerciseSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    from datetime import datetime
    db_obj = exercises_model.ExerciseSessions(
        user_id=current_user.id,
        exercise_set_id=exercise_set_id,
        started_at=datetime.utcnow()
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@lessons_router.post("/exercise-sessions/{session_id}/answers", response_model=lessons_schema.StudentAnswerResponse, summary="1問の解答を保存")
async def save_student_answer(
    session_id: int,
    answer_in: lessons_schema.StudentAnswerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    from sqlalchemy.future import select
    # Check session
    result = await db.execute(select(exercises_model.ExerciseSessions).filter_by(id=session_id, user_id=current_user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="セッションが見つかりません(または権限がありません)")

    # Insert or Update answer
    stmt = select(exercises_model.StudentAnswers).filter_by(session_id=session_id, question_id=answer_in.question_id)
    ans_result = await db.execute(stmt)
    db_ans = ans_result.scalars().first()

    if db_ans:
        db_ans.answer_data = answer_in.answer_data
        db_ans.is_correct = answer_in.is_correct
    else:
        db_ans = exercises_model.StudentAnswers(
            session_id=session_id,
            question_id=answer_in.question_id,
            answer_data=answer_in.answer_data,
            is_correct=answer_in.is_correct
        )
        db.add(db_ans)

    await db.commit()
    await db.refresh(db_ans)
    return db_ans

@lessons_router.put("/exercise-sessions/{session_id}/finish", status_code=status.HTTP_204_NO_CONTENT, summary="テスト(演習)の完了とスコア保存")
async def finish_exercise_session(
    session_id: int,
    finish_in: lessons_schema.ExerciseSessionFinish,
    db: AsyncSession = Depends(get_db),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    from sqlalchemy.future import select
    from datetime import datetime
    result = await db.execute(select(exercises_model.ExerciseSessions).filter_by(id=session_id, user_id=current_user.id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")

    session.completed_at = datetime.utcnow()
    if finish_in.score is not None:
        session.score = finish_in.score
    
    await db.commit()
    return


#
# Exercise Session Overview for Teachers
#

@lessons_router.get(
    "/courses/{course_id}/exercise-sessions/teacher",
    response_model=List[lessons_schema.StudentExerciseSessions],
    summary="（教師向け）コース別演習セッション一覧取得",
)
async def list_course_exercise_sessions_for_teacher(
    course_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """
    指定したコースに紐づく演習セットについて、
    学生ごとの演習セッション一覧を返します。

    - 対象コースに属する全ての `exercise_sets` を取得
    - それらに紐づく `exercise_sessions` を学生情報とあわせて集計
    """
    _ = current_user

    # 1. コースに紐づく演習セットを取得
    sets_stmt = (
        select(exercises_model.ExerciseSets)
        .where(exercises_model.ExerciseSets.course_id == course_id)
        .order_by(exercises_model.ExerciseSets.id.asc())
    )
    exercise_sets = (await db.execute(sets_stmt)).scalars().all()

    if not exercise_sets:
        return []

    exercise_set_id_to_title = {s.id: s.title for s in exercise_sets}
    exercise_set_ids = list(exercise_set_id_to_title.keys())

    # 2. 対象演習セットに紐づく全セッションを、学生情報と一緒に取得
    sessions_stmt = (
        select(
            exercises_model.ExerciseSessions,
            users_model.Users,
            users_model.Students,
        )
        .join(
            users_model.Users,
            exercises_model.ExerciseSessions.user_id == users_model.Users.id,
        )
        .outerjoin(
            users_model.Students,
            users_model.Students.user_id == users_model.Users.id,
        )
        .where(exercises_model.ExerciseSessions.exercise_set_id.in_(exercise_set_ids))
        .order_by(exercises_model.ExerciseSessions.started_at.desc())
    )

    result = await db.execute(sessions_stmt)
    rows = result.all()

    # 3. 学生ごとにセッションをグルーピング
    sessions_by_user: Dict[int, Dict[str, Any]] = {}

    for session, user, student in rows:
        if user.id not in sessions_by_user:
            sessions_by_user[user.id] = {
                "student": lessons_schema.ExerciseSessionStudentInfo(
                    user_id=user.id,
                    username=user.username,
                    display_name=user.display_name,
                    email=user.email,
                    grade=getattr(student, "grade", None) if student is not None else None,
                    department=getattr(student, "department", None) if student is not None else None,
                    student_number=getattr(student, "student_number", None) if student is not None else None,
                    class_number=getattr(student, "class_number", None) if student is not None else None,
                    class_roster_number=getattr(student, "class_roster_number", None) if student is not None else None,
                ),
                "sessions": [],
            }

        score_value = None
        if session.score is not None:
            try:
                score_value = float(session.score)
            except (TypeError, ValueError):
                score_value = None

        sessions_by_user[user.id]["sessions"].append(
            lessons_schema.ExerciseSessionSummary(
                session_id=session.id,
                exercise_set_id=session.exercise_set_id,
                exercise_set_title=exercise_set_id_to_title.get(
                    session.exercise_set_id, ""
                ),
                score=score_value,
                started_at=session.started_at,
                completed_at=session.completed_at,
            )
        )

    # 4. レスポンス形式へ変換
    response_items: List[lessons_schema.StudentExerciseSessions] = []
    for payload in sessions_by_user.values():
        response_items.append(
            lessons_schema.StudentExerciseSessions(
                student=payload["student"],
                sessions=payload["sessions"],
            )
        )

    return response_items


@lessons_router.get(
    "/admin/exercise-sessions",
    response_model=List[lessons_schema.AdminExerciseSessionLog],
    summary="（管理者向け）演習セッションログ一覧取得",
    dependencies=[Depends(require_admin)],
)
async def list_exercise_sessions_for_admin(
    limit: int = Query(200, ge=1, le=1000, description="取得件数の上限"),
    course_id: Optional[int] = Query(None, description="コースIDで絞り込み"),
    user_id: Optional[int] = Query(None, description="ユーザーIDで絞り込み"),
    db: AsyncSession = Depends(get_db),
):
    """（管理者向け）全コース対象の演習セッションログを新しい順に取得します。"""
    stmt = (
        select(
            exercises_model.ExerciseSessions,
            exercises_model.ExerciseSets,
            courses_model.Courses,
            users_model.Users,
            users_model.Students,
        )
        .join(
            exercises_model.ExerciseSets,
            exercises_model.ExerciseSessions.exercise_set_id == exercises_model.ExerciseSets.id,
        )
        .join(
            courses_model.Courses,
            exercises_model.ExerciseSets.course_id == courses_model.Courses.id,
        )
        .join(users_model.Users, exercises_model.ExerciseSessions.user_id == users_model.Users.id)
        .outerjoin(users_model.Students, users_model.Students.user_id == users_model.Users.id)
        .order_by(exercises_model.ExerciseSessions.started_at.desc())
        .limit(limit)
    )

    if course_id is not None:
        stmt = stmt.where(courses_model.Courses.id == course_id)
    if user_id is not None:
        stmt = stmt.where(users_model.Users.id == user_id)

    rows = (await db.execute(stmt)).all()

    response: List[lessons_schema.AdminExerciseSessionLog] = []
    for session, exercise_set, course, user, student in rows:
        score_value = None
        if session.score is not None:
            try:
                score_value = float(session.score)
            except (TypeError, ValueError):
                score_value = None

        response.append(
            lessons_schema.AdminExerciseSessionLog(
                session_id=session.id,
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                email=user.email,
                grade=getattr(student, "grade", None) if student is not None else None,
                department=getattr(student, "department", None) if student is not None else None,
                course_id=course.id,
                course_name=course.course_name,
                exercise_set_id=exercise_set.id,
                exercise_set_title=exercise_set.title,
                score=score_value,
                started_at=session.started_at,
                completed_at=session.completed_at,
            )
        )

    return response
