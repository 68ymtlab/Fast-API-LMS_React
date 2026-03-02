"""
科目関連API

このモジュールでは、科目情報の取得、登録、更新など、
科目に関連するAPIエンドポイントを定義します。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from api.db.session import get_db
from api.models import users_model
from api.core.security import require_teacher_or_higher, get_current_active_user
from api.repositories.subjects_repo import SubjectRepository
from api.services.subjects_service import SubjectService
import api.schemas.subjects as subject_schema

subjects_router = APIRouter(tags=["科目管理"])

#
# Dependency Injection
#
def get_subject_repo(db: AsyncSession = Depends(get_db)) -> SubjectRepository:
    """科目リポジトリの依存性注入"""
    return SubjectRepository(db)

def get_subject_service(repo: SubjectRepository = Depends(get_subject_repo)) -> SubjectService:
    """科目サービスの依存性注入"""
    return SubjectService(repo)

#
# Subject Endpoints
#

@subjects_router.get("/subjects", response_model=List[subject_schema.Subject], summary="科目一覧取得")
async def list_subjects(
    service: SubjectService = Depends(get_subject_service)
):
    """登録されている科目の詳細情報一覧を取得します。"""
    return await service.get_list()

@subjects_router.get("/semesters", response_model=List[subject_schema.SemesterSimple], summary="学期一覧取得")
async def list_semesters(
    service: SubjectService = Depends(get_subject_service)
):
    """学期マスタの一覧を取得します。"""
    return await service.get_semesters()


@subjects_router.post(
    "/semesters",
    response_model=subject_schema.SemesterSimple,
    status_code=status.HTTP_201_CREATED,
    summary="学期登録",
    dependencies=[Depends(require_teacher_or_higher)],
)
async def create_semester(
    semester_in: subject_schema.SemesterCreate,
    service: SubjectService = Depends(get_subject_service),
    current_user: users_model.Users = Depends(get_current_active_user),
):
    """（教師以上の権限）新しい学期マスタを登録します。"""
    _ = current_user
    return await service.create_semester(semester_in=semester_in)

@subjects_router.get("/subject-categories", response_model=List[subject_schema.SubjectCategorySimple], summary="授業科目区分一覧取得")
async def list_subject_categories(
    service: SubjectService = Depends(get_subject_service)
):
    """授業科目区分マスタの一覧を取得します。"""
    return await service.get_subject_categories()

@subjects_router.post("/subjects", response_model=subject_schema.Subject, status_code=status.HTTP_201_CREATED, summary="科目およびシラバス登録", dependencies=[Depends(require_teacher_or_higher)])
async def create_subject(
    subject_in: subject_schema.SubjectWithSyllabusCreate,
    service: SubjectService = Depends(get_subject_service),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    """（教師以上の権限）新しい科目とシラバスを同時に登録します。"""
    return await service.create_subject_with_syllabus(subject_with_syllabus=subject_in, user_id=current_user.id)

@subjects_router.get("/subjects/{subject_id}", response_model=subject_schema.Subject, summary="科目情報取得")
async def get_subject(
    subject_id: int,
    service: SubjectService = Depends(get_subject_service)
):
    """指定したIDの科目の詳細情報を取得します。"""
    subject = await service.get_by_id(subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return subject

@subjects_router.put("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT, summary="科目情報更新", dependencies=[Depends(require_teacher_or_higher)])
async def update_subject(
    subject_id: int,
    subject_in: subject_schema.SubjectUpdate,
    service: SubjectService = Depends(get_subject_service),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    """（教師以上の権限）指定した科目の情報を更新します。"""
    subject = await service.get_by_id(subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    await service.update_subject(subject_id=subject_id, subject_in=subject_in, user_id=current_user.id)
    return

@subjects_router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT, summary="科目削除", dependencies=[Depends(require_teacher_or_higher)])
async def delete_subject(
    subject_id: int,
    service: SubjectService = Depends(get_subject_service),
    current_user: users_model.Users = Depends(get_current_active_user)
):
    """（教師以上の権限）指定した科目を論理削除します。"""
    subject = await service.get_by_id(subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    await service.delete_subject(subject_id=subject_id, user_id=current_user.id)
    return