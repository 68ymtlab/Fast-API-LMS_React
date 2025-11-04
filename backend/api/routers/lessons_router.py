"""
レッスン関連API

このモジュールでは、レッスンコンテンツのアップロードなど、
レッスンに関連するAPIエンドポイントを定義します。
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher, require_admin
from api.models import users_model
from api.repositories.lessons_repo import LessonRepository
from api.repositories.users_repo import UserRepository
from api.repositories.contents_repo import ContentRepository
from api.repositories.flows_repo import FlowpageKeywordRepository, FlowpageSetsRepository, FlowpageRepository
from api.services.contents_service import ContentService
from api.services.flows_service import FlowpageService, FlowpageKeywordService, FlowpageSetsService
from api.services.lesson_content_service import LessonContentService
from api.services.lessons_service import LessonService
import api.schemas.lessons as lessons_schema


lessons_router = APIRouter(tags=["レッスン管理"])

#
# Dependency Injection
#
def get_lesson_repo(db: AsyncSession = Depends(get_db)) -> LessonRepository:
    """レッスンリポジトリの依存性注入"""
    return LessonRepository(db)

def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    """ユーザーリポジトリの依存性注入"""
    return UserRepository(db)

def get_content_repo(db: AsyncSession = Depends(get_db)) -> ContentRepository:
    """コンテンツリポジトリの依存性注入"""
    return ContentRepository(db)

def get_flowpage_keyword_repo(db: AsyncSession = Depends(get_db)) -> FlowpageKeywordRepository:
    """Flowpageキーワードリポジトリの依存性注入"""
    return FlowpageKeywordRepository(db)

def get_flowpage_sets_repo(db: AsyncSession = Depends(get_db)) -> FlowpageSetsRepository:
    """Flowpageセットリポジトリの依存性注入"""
    return FlowpageSetsRepository(db)

def get_flowpage_repo(db: AsyncSession = Depends(get_db)) -> FlowpageRepository:
    """Flowpageリポジトリの依存性注入"""
    return FlowpageRepository(db)

def get_lesson_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo)
) -> LessonService:
    """レッスンサービスの依存性注入"""
    return LessonService(lesson_repo)

def get_content_service(
    content_repo: ContentRepository = Depends(get_content_repo),
    user_repo: UserRepository = Depends(get_user_repo)
) -> ContentService:
    """コンテンツサービスの依存性注入"""
    return ContentService(content_repo=content_repo, user_repo=user_repo)


def get_flowpage_keyword_service(
    keyword_repo: FlowpageKeywordRepository = Depends(get_flowpage_keyword_repo)
) -> FlowpageKeywordService:
    """Flowpageキーワードサービスの依存性注入"""
    return FlowpageKeywordService(keyword_repo=keyword_repo)

def get_flowpage_sets_service(
    flowpage_sets_repo: FlowpageSetsRepository = Depends(get_flowpage_sets_repo)
) -> FlowpageSetsService:
    """Flowpageセットサービスの依存性注入"""
    return FlowpageSetsService(flowpage_sets_repo=flowpage_sets_repo)

def get_flowpage_service(
    flowpage_repo: FlowpageRepository = Depends(get_flowpage_repo),
    content_service: ContentService = Depends(get_content_service),
    keyword_service: FlowpageKeywordService = Depends(get_flowpage_keyword_service)
) -> FlowpageService:
    """Flowpageサービスの依存性注入"""
    return FlowpageService(
        flowpage_repo=flowpage_repo,
        content_service=content_service,
        keyword_service=keyword_service
    )

def get_lesson_content_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    content_service: ContentService = Depends(get_content_service),
    flowpage_service: FlowpageService = Depends(get_flowpage_service),
    flowpage_keyword_service: FlowpageKeywordService = Depends(get_flowpage_keyword_service),
    flowpage_sets_service: FlowpageSetsService = Depends(get_flowpage_sets_service),
    user_repo: UserRepository = Depends(get_user_repo)
) -> LessonContentService:
    """レッスンコンテンツサービスの依存性注入"""
    return LessonContentService(
        lesson_repo=lesson_repo,
        content_service=content_service,
        flowpage_service=flowpage_service,
        flowpage_keyword_service=flowpage_keyword_service,
        flowpage_sets_service=flowpage_sets_service,
        user_repo=user_repo
    )

#
# Endpoints


#

@lessons_router.get("/courses/{course_id}/lesson-items", response_model=List[lessons_schema.LessonItem], summary="コースのレッスン項目一覧取得")
async def get_course_lesson_items(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのすべてのレッスン項目をフラットなリストで取得します。"""
    return await lesson_service.get_lesson_items_by_course_id(course_id=course_id, include_inactive=include_inactive)

from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher, require_admin
from api.models import users_model
from api.repositories.lessons_repo import LessonRepository
from api.repositories.users_repo import UserRepository
from api.repositories.contents_repo import ContentRepository
from api.repositories.flows_repo import FlowpageKeywordRepository, FlowpageSetsRepository, FlowpageRepository
from api.services.contents_service import ContentService
from api.services.flows_service import FlowpageService, FlowpageKeywordService, FlowpageSetsService
from api.services.lesson_content_service import LessonContentService
from api.services.lessons_service import LessonService
import api.schemas.lessons as lessons_schema


lessons_router = APIRouter(tags=["レッスン管理"])

#
# Dependency Injection
#
def get_lesson_repo(db: AsyncSession = Depends(get_db)) -> LessonRepository:
    """レッスンリポジトリの依存性注入"""
    return LessonRepository(db)

def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    """ユーザーリポジトリの依存性注入"""
    return UserRepository(db)

def get_content_repo(db: AsyncSession = Depends(get_db)) -> ContentRepository:
    """コンテンツリポジトリの依存性注入"""
    return ContentRepository(db)

def get_flowpage_keyword_repo(db: AsyncSession = Depends(get_db)) -> FlowpageKeywordRepository:
    """Flowpageキーワードリポジトリの依存性注入"""
    return FlowpageKeywordRepository(db)

def get_flowpage_sets_repo(db: AsyncSession = Depends(get_db)) -> FlowpageSetsRepository:
    """Flowpageセットリポジトリの依存性注入"""
    return FlowpageSetsRepository(db)

def get_flowpage_repo(db: AsyncSession = Depends(get_db)) -> FlowpageRepository:
    """Flowpageリポジトリの依存性注入"""
    return FlowpageRepository(db)

def get_lesson_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo)
) -> LessonService:
    """レッスンサービスの依存性注入"""
    return LessonService(lesson_repo)

def get_content_service(
    content_repo: ContentRepository = Depends(get_content_repo),
    user_repo: UserRepository = Depends(get_user_repo)
) -> ContentService:
    """コンテンツサービスの依存性注入"""
    return ContentService(content_repo=content_repo, user_repo=user_repo)


def get_flowpage_keyword_service(
    keyword_repo: FlowpageKeywordRepository = Depends(get_flowpage_keyword_repo)
) -> FlowpageKeywordService:
    """Flowpageキーワードサービスの依存性注入"""
    return FlowpageKeywordService(keyword_repo=keyword_repo)

def get_flowpage_sets_service(
    flowpage_sets_repo: FlowpageSetsRepository = Depends(get_flowpage_sets_repo)
) -> FlowpageSetsService:
    """Flowpageセットサービスの依存性注入"""
    return FlowpageSetsService(flowpage_sets_sets_repo=flowpage_sets_repo)

def get_flowpage_service(
    flowpage_repo: FlowpageRepository = Depends(get_flowpage_repo),
    content_service: ContentService = Depends(get_content_service),
    keyword_service: FlowpageKeywordService = Depends(get_flowpage_keyword_service)
) -> FlowpageService:
    """Flowpageサービスの依存性注入"""
    return FlowpageService(
        flowpage_repo=flowpage_repo,
        content_service=content_service,
        keyword_service=keyword_service
    )

def get_lesson_content_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo),
    content_service: ContentService = Depends(get_content_service),
    flowpage_service: FlowpageService = Depends(get_flowpage_service),
    flowpage_keyword_service: FlowpageKeywordService = Depends(get_flowpage_keyword_service),
    flowpage_sets_service: FlowpageSetsService = Depends(get_flowpage_sets_service),
    user_repo: UserRepository = Depends(get_user_repo)
) -> LessonContentService:
    """レッスンコンテンツサービスの依存性注入"""
    return LessonContentService(
        lesson_repo=lesson_repo,
        content_service=content_service,
        flowpage_service=flowpage_service,
        flowpage_keyword_service=flowpage_keyword_service,
        flowpage_sets_service=flowpage_sets_service,
        user_repo=user_repo
    )

#
# Endpoints
#

@lessons_router.get("/courses/{course_id}/lessons", response_model=List[lessons_schema.Lesson], summary="コースのレッスン一覧取得")
async def get_course_lessons(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのレッスンの一覧を取得します。"""
    return await lesson_service.get_lessons_by_course_id(course_id=course_id, include_inactive=include_inactive)

# レッスン項目IDでレッスン項目情報を取得するエンドポイント
@lessons_router.get("/lesson-item/{lesson_item_id}", response_model=lessons_schema.LessonItem, summary="レッスン項目情報取得")
async def get_lesson_item_by_id(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service)
):
    """
    指定したレッスン項目ID(lesson_item_id)に対応するレッスン項目情報を取得します。
    """
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
    """
    指定したレッスン項目ID(lesson_item_id)に紐づく教科書ページ(lesson_pages)を全て取得し、
    各ページのraw_content_id/rendered_content_idに対応するcontent_bodyも含めて返します。
    """
    pages = await lesson_service.list_lesson_pages_with_content_body_by_lesson_item_id(lesson_item_id=lesson_item_id, content_repo=content_repo)
    if not pages:
        raise HTTPException(status_code=404, detail="該当する教科書ページが見つかりません")
    return pages

# lesson_item_idから演習セット＋問題一覧取得API
@lessons_router.get("/lesson-items/{lesson_item_id}/flowpage-sets", response_model=List[lessons_schema.FlowpageSetWithQuestions], summary="レッスン項目に紐づく演習セット＋問題一覧取得")
async def list_flowpage_sets_with_questions_by_lesson_item(
    lesson_item_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service)
):
    """
    指定したレッスン項目ID(lesson_item_id)に紐づく演習セット(flowpage_sets)と、
    各セット内の問題(flowpage_set_question)一覧を取得します。
    """
    sets = await lesson_service.list_flowpage_sets_with_questions_by_lesson_item_id(lesson_item_id=lesson_item_id)
    if not sets:
        raise HTTPException(status_code=404, detail="該当する演習セットが見つかりません")
    return sets

@lessons_router.get("/courses/{course_id}/lesson-items", response_model=Dict[int, List[lessons_schema.LessonItem]], summary="コースのレッスン項目一覧取得")
async def get_course_lesson_items(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    lesson_service: LessonService = Depends(get_lesson_service),
    include_inactive: bool = Query(False, description="非アクティブなレッスンを含めるかどうか")
):
    """指定されたコースのすべてのレッスン項目を、レッスンIDをキーとする辞書で取得します。"""
    return await lesson_service.get_lesson_items_by_course_id(course_id=course_id, include_inactive=include_inactive)

@lessons_router.post("/lessons/upload-content", response_model=lessons_schema.Lesson, summary="レッスンコンテンツのアップロードと登録", status_code=status.HTTP_201_CREATED)
async def upload_lesson_content(
    lesson_upload_request: lessons_schema.LessonContentUploadRequest,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    lesson_content_service: LessonContentService = Depends(get_lesson_content_service)
):
    """YAMLファイル群を含むレッスンコンテンツをアップロードし、データベースに登録します。

    教師または管理者のみが実行可能です。
    """
    return await lesson_content_service.register_lesson_content(
        lesson_upload_request=lesson_upload_request,
        current_user=current_user
    )