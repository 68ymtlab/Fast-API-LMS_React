"""
コース関連API

このモジュールでは、コースの履修情報など、
コースに関連するAPIエンドポイントを定義します。
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from api.db.session import get_db
from api.core.security import get_current_active_user, require_teacher_or_higher, require_admin
from api.models import users_model, courses_model, lessons_model, subjects_model
from api.repositories.courses_repo import CourseRepository
from api.repositories.users_repo import UserRepository
from api.repositories.lessons_repo import LessonRepository
from api.services.courses_service import CourseService
from api.services.lessons_service import LessonService
import api.schemas.courses as courses_schema
import api.schemas.lessons as lessons_schema # New import
import api.schemas.users as user_schema


courses_router = APIRouter(tags=["コース管理"])


class CreateCourseLegacyRequest(BaseModel):
    """既存フロント `/create_course` 呼び出し向けの互換リクエスト。"""
    subject_id: int
    course_name: str = Field(..., min_length=1, max_length=255)
    start_date_time: datetime
    end_date_time: datetime
    weeks: int = Field(1, ge=1, le=60)

#
# Dependency Injection
#
def get_course_repo(db: AsyncSession = Depends(get_db)) -> CourseRepository:
    """コースリポジトリの依存性注入"""
    return CourseRepository(db)

def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    """ユーザーリポジトリの依存性注入"""
    return UserRepository(db)

def get_lesson_repo(db: AsyncSession = Depends(get_db)) -> LessonRepository:
    """レッスンリポジトリの依存性注入"""
    return LessonRepository(db)

def get_course_service(
    course_repo: CourseRepository = Depends(get_course_repo),
    user_repo: UserRepository = Depends(get_user_repo)
) -> CourseService:
    """コースサービスの依存性注入"""
    return CourseService(course_repo, user_repo)

def get_lesson_service(
    lesson_repo: LessonRepository = Depends(get_lesson_repo)
) -> LessonService:
    """レッスンサービスの依存性注入"""
    return LessonService(lesson_repo)

#
# Endpoints
#

class SyllabusInfoResponse(BaseModel):
    """学生向けシラバス照会画面用のレスポンス（コースID指定で取得）"""
    subject_class: str = ""
    subject_name: str = ""
    subject_credit: int = 0
    subject_code: str = ""
    subject_period: str = ""
    subject_keyword: str = ""
    subject_goals: str = ""


@courses_router.get(
    "/get_syllabus_info/{course_id}",
    response_model=Optional[SyllabusInfoResponse],
    summary="（学生向け）コースに紐づくシラバス情報の取得",
)
async def get_syllabus_info_by_course(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    指定したコースに紐づく科目のシラバス情報を取得します。
    コースが存在しない場合は404、科目未紐づけ・シラバス未登録の場合は200でnullを返します。
    """
    stmt = (
        select(
            courses_model.Courses,
            subjects_model.Subjects,
            subjects_model.SubjectSyllabuses,
            subjects_model.SubjectCategories,
            subjects_model.Semesters,
        )
        .select_from(courses_model.Courses)
        .outerjoin(subjects_model.Subjects, courses_model.Courses.subject_id == subjects_model.Subjects.id)
        .outerjoin(subjects_model.SubjectSyllabuses, subjects_model.Subjects.id == subjects_model.SubjectSyllabuses.subject_id)
        .outerjoin(subjects_model.SubjectCategories, subjects_model.SubjectSyllabuses.subject_category_id == subjects_model.SubjectCategories.id)
        .outerjoin(subjects_model.Semesters, subjects_model.Subjects.semester_id == subjects_model.Semesters.id)
        .where(courses_model.Courses.id == course_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    course, subject, syllabus, category, semester = row
    if subject is None or syllabus is None:
        return None
    subject_class = category.name if category else ""
    subject_name = subject.subject_name or ""
    subject_credit = syllabus.credits or 0
    subject_code = syllabus.code or ""
    subject_period = semester.name if semester else ""
    keywords = syllabus.keywords
    if isinstance(keywords, list):
        subject_keyword = ",".join(str(k) for k in keywords)
    elif isinstance(keywords, dict):
        subject_keyword = ",".join(str(v) for v in keywords.values() if v)
    else:
        subject_keyword = ""
    subject_goals = syllabus.learning_goal or ""
    return SyllabusInfoResponse(
        subject_class=subject_class,
        subject_name=subject_name,
        subject_credit=subject_credit,
        subject_code=subject_code,
        subject_period=subject_period,
        subject_keyword=subject_keyword,
        subject_goals=subject_goals,
    )


@courses_router.get(
    "/courses/{course_id}/syllabus",
    response_model=Optional[SyllabusInfoResponse],
    summary="（学生向け）コースに紐づくシラバス情報の取得（courses path）",
)
async def get_syllabus_info_by_course_path(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """GET /get_syllabus_info/{course_id} と同じ処理。"""
    return await get_syllabus_info_by_course(course_id=course_id, current_user=current_user, db=db)


@courses_router.get("/courses/me/enrolled", response_model=List[courses_schema.Course], summary="（学生向け）履修中コース一覧の取得")
async def get_my_enrolled_courses(
    current_user: users_model.Users = Depends(get_current_active_user),
    course_service: CourseService = Depends(get_course_service),
    include_inactive: bool = Query(False, description="非アクティブなコースを含めるかどうか")
):
    """ログイン中のユーザーが現在履修しているコースの一覧を取得します。"""
    return await course_service.get_enrolled_courses(user_id=current_user.id, include_inactive=include_inactive)

@courses_router.get("/courses/{course_id}", response_model=courses_schema.Course, summary="コース情報の取得")
async def get_course_info(
    course_id: int,
    current_user: users_model.Users = Depends(get_current_active_user),
    course_service: CourseService = Depends(get_course_service)
):
    """指定されたIDのコース情報を取得します。"""
    course = await course_service.get_course_by_id(course_id=course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course



@courses_router.get("/courses/teacher/by-subject/{subject_id}", response_model=List[courses_schema.Course], summary="（教師向け）科目別コース一覧の取得")
async def get_teacher_courses_by_subject(
    subject_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service),
    include_inactive: bool = Query(False, description="非アクティブなコースを含めるかどうか")
):
    """ログイン中の教師が、指定した科目（subject_id）の中で閲覧可能なコースの一覧を取得します。"""
    if current_user.role_id == 1:
        return await course_service.get_all_courses_by_subject_for_admin(
            subject_id=subject_id,
            include_inactive=include_inactive,
        )

    return await course_service.get_courses_for_teacher(
        user_id=current_user.id, subject_id=subject_id, include_inactive=include_inactive
    )


@courses_router.post("/create_course", summary="コース作成（互換エンドポイント）")
async def create_course_legacy(
    body: CreateCourseLegacyRequest,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """
    既存フロントの `/api/create_course` 呼び出しを維持するための互換API。
    コース作成時に、作成者へ当該コースの閲覧/更新/削除権限も自動付与する。
    """
    if body.start_date_time >= body.end_date_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="開始日時は終了日時より前である必要があります",
        )

    course = courses_model.Courses(
        subject_id=body.subject_id,
        course_name=body.course_name.strip(),
        session_count=body.weeks,
        start_date_time=body.start_date_time,
        end_date_time=body.end_date_time,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(course)
    await db.flush()

    permission = courses_model.CourseContentPermissions(
        teacher_user_id=current_user.id,
        course_id=course.id,
        start_date_time=body.start_date_time,
        end_date_time=body.end_date_time,
        can_read_content=True,
        can_update_content=True,
        can_delete_content=True,
        created_by_user_id=current_user.id,
    )
    db.add(permission)

    lessons = [
        lessons_model.CourseLessons(
            course_id=course.id,
            title=f"第{i}回",
            lesson_number=i,
            display_order=i,
            is_active=True,
            created_by_user_id=current_user.id,
            updated_by_user_id=current_user.id,
        )
        for i in range(1, body.weeks + 1)
    ]
    db.add_all(lessons)

    await db.commit()
    return {"success": True, "course_id": course.id}

@courses_router.get("/admin/courses/by-subject/{subject_id}", response_model=List[courses_schema.Course], summary="（管理者向け）科目別コース一覧の取得", dependencies=[Depends(require_admin)])
async def get_admin_courses_by_subject(
    subject_id: int,
    course_service: CourseService = Depends(get_course_service),
    include_inactive: bool = Query(False, description="非アクティブなコースを含めるかどうか")
):
    """（管理者向け）指定した科目（subject_id）に紐づく全てのコースの一覧を取得します。"""
    return await course_service.get_all_courses_by_subject_for_admin(
        subject_id=subject_id, include_inactive=include_inactive
    )


@courses_router.post(
    "/admin/courses/{course_id}/duplicate",
    response_model=courses_schema.CourseDuplicateResult,
    summary="（管理者向け）コース複製",
)
async def duplicate_course_for_admin(
    course_id: int,
    duplicate_in: courses_schema.CourseDuplicateRequest,
    current_user: users_model.Users = Depends(require_admin),
    course_service: CourseService = Depends(get_course_service),
):
    """管理者がコースを複製します。履修者・権限・教材の複製範囲を選択できます。"""
    return await course_service.duplicate_course(
        source_course_id=course_id,
        duplicate_in=duplicate_in,
        current_user=current_user,
    )


@courses_router.delete(
    "/admin/courses/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="（管理者向け）コースの論理削除（管理者パスワード確認）",
)
async def delete_course_by_admin(
    course_id: int,
    delete_in: user_schema.AdminPasswordConfirm,
    current_user: users_model.Users = Depends(require_admin),
    course_service: CourseService = Depends(get_course_service),
):
    """管理者パスワード確認のうえ、指定したコースを論理削除します。"""
    success = await course_service.delete_course_by_admin(
        course_id=course_id,
        current_user=current_user,
        admin_password=delete_in.admin_password,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return

#
# Course Content Permission Endpoints
#

@courses_router.get("/courses/{course_id}/permissions", response_model=List[courses_schema.CourseContentPermission], summary="コースコンテンツ権限一覧の取得")
async def list_course_permissions(
    course_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db)
):
    """指定したコースに紐づく全てのコンテンツ権限一覧を取得します。"""
    from sqlalchemy import select
    stmt = select(courses_model.CourseContentPermissions).where(
        courses_model.CourseContentPermissions.course_id == course_id
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@courses_router.post("/courses/{course_id}/permissions", response_model=Optional[courses_schema.CourseContentPermission], summary="コースコンテンツ権限の付与/更新/削除")
async def grant_or_update_course_permission(
    course_id: int,
    permission_in: courses_schema.CourseContentPermissionCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースに対するユーザーのコンテンツ権限を付与または更新します。

    コース作成者、管理者、またはcan_update_content権限を持つユーザーが実行可能です。
    管理者アカウントへの権限付与はできません。
    全ての権限（閲覧、編集、削除）がFalseでリクエストされた場合、既存の権限エントリは削除されます。
    権限が削除された場合は、HTTP 204 No Contentが返されます。
    """
    updated_permission = await course_service.grant_or_update_course_content_permission(
        course_id=course_id, permission_in=permission_in, current_user=current_user
    )
    if updated_permission is None:
        return status.HTTP_204_NO_CONTENT # 権限が削除された場合
    return updated_permission

@courses_router.post("/courses/{course_id}/permissions/batch", response_model=List[Optional[courses_schema.CourseContentPermission]], summary="コースコンテンツ権限の一括付与/更新/削除")
async def grant_or_update_course_permissions_batch(
    course_id: int,
    permissions_in: courses_schema.CourseContentPermissionBatchCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースに対する複数のユーザーのコンテンツ権限を一括で付与または更新します。

    コース作成者、管理者、またはcan_update_content権限を持つユーザーが実行可能です。
    管理者アカウントへの権限付与はできません。
    個々の権限について、全ての権限（閲覧、編集、削除）がFalseでリクエストされた場合、既存の権限エントリは削除されます。
    """
    results = await course_service.grant_or_update_course_content_permissions_batch(
        course_id=course_id, permissions_in=permissions_in.permissions, current_user=current_user
    )
    return results

#
# Course Enrollment Endpoints
#

@courses_router.post("/courses/{course_id}/enrollments/batch", response_model=List[courses_schema.CourseEnrollment], summary="コースへの学生の一括登録")
async def enroll_students_batch(
    course_id: int,
    enrollments_in: courses_schema.CourseEnrollmentBatchCreate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースに複数の学生を一括で登録します。

    操作ユーザーは教師または管理者である必要があります。
    登録対象のユーザーは学生である必要があります。
    担当教師が指定された場合、そのユーザーは教師である必要があります。
    """
    results = await course_service.enroll_students_in_course_batch(
        course_id=course_id, enrollments_in=enrollments_in.enrollments, current_user=current_user
    )
    return results


@courses_router.get(
    "/courses/{course_id}/enrollments",
    response_model=List[courses_schema.CourseEnrolledStudent],
    summary="コース履修者一覧取得",
)
async def list_course_enrollments(
    course_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """指定コースの履修者（学生）一覧を取得します。"""
    _ = current_user
    stmt = (
        select(courses_model.CourseEnrollments)
        .where(courses_model.CourseEnrollments.course_id == course_id)
        .options(
            selectinload(courses_model.CourseEnrollments.user).selectinload(
                users_model.Users.student
            )
        )
        .order_by(courses_model.CourseEnrollments.enrolled_at.desc())
    )
    enrollments = (await db.execute(stmt)).scalars().all()
    return [
        {
            "user_id": e.user_id,
            "username": e.user.username if e.user else None,
            "display_name": e.user.display_name if e.user else None,
            "email": e.user.email if e.user else None,
            "grade": e.user.student.grade if e.user and e.user.student else None,
            "department": e.user.student.department if e.user and e.user.student else None,
            "student_number": e.user.student.student_number if e.user and e.user.student else None,
            "class_number": e.user.student.class_number if e.user and e.user.student else None,
            "class_roster_number": e.user.student.class_roster_number if e.user and e.user.student else None,
            "enrolled_at": e.enrolled_at,
        }
        for e in enrollments
    ]

@courses_router.delete("/courses/{course_id}/enrollments/batch", status_code=status.HTTP_204_NO_CONTENT, summary="コースからの学生の一括登録解除")
async def unenroll_students_batch(
    course_id: int,
    user_ids: List[int] = Query(..., description="登録解除するユーザーIDのリスト"),
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースから複数の学生を一括で登録解除します。

    操作ユーザーは教師または管理者である必要があります。
    """
    await course_service.unenroll_students_from_course_batch(
        course_id=course_id, user_ids=user_ids, current_user=current_user
    )
    return

#
# Course Management Endpoints
#

@courses_router.put("/courses/{course_id}", response_model=courses_schema.Course, summary="コース情報の更新")
async def update_course_info(
    course_id: int,
    course_in: courses_schema.CourseUpdate,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースの情報を更新します。

    コース作成者、管理者、またはcan_update_content権限を持つユーザーが実行可能です。
    """
    updated_course = await course_service.update_course(
        course_id=course_id, course_in=course_in, current_user=current_user
    )
    if updated_course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return updated_course

@courses_router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT, summary="コースの論理削除")
async def delete_course_info(
    course_id: int,
    current_user: users_model.Users = Depends(require_teacher_or_higher),
    course_service: CourseService = Depends(get_course_service)
):
    """指定したコースを論理削除します。

    コース作成者、管理者、またはcan_delete_content権限を持つユーザーが実行可能です。
    """
    success = await course_service.delete_course(
        course_id=course_id, current_user=current_user
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return