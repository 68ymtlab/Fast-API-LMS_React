"""
レッスン関連API

このモジュールでは、レッスンコンテンツのアップロードなど、
レッスンに関連するAPIエンドポイントを定義します。
"""
from typing import List, Dict
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher
from api.models import users_model
from api.repositories.lessons_repo import LessonRepository
from api.repositories.contents_repo import ContentRepository
from api.services.lessons_service import LessonService
import api.schemas.lessons as lessons_schema


lessons_router = APIRouter(tags=["レッスン管理"])


def get_lesson_repo(db: AsyncSession = Depends(get_db)) -> LessonRepository:
    return LessonRepository(db)


def get_content_repo(db: AsyncSession = Depends(get_db)) -> ContentRepository:
    return ContentRepository(db)


def get_lesson_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo)
) -> LessonService:
    return LessonService(lesson_repo)


@lessons_router.get("/courses/{course_id}/lessons", response_model=List[lessons_schema.Lesson], summary="コースのレッスン一覧取得")
async def get_course_lessons(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのレッスンの一覧を取得します。"""
    return await lesson_service.get_lessons_by_course_id(course_id=course_id, include_inactive=include_inactive)


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
