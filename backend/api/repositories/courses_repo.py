"""
コース関連のデータベース操作

このモジュールでは、コース(Courses)やその履修(CourseEnrollments)に関連する
データベースへのCRUD操作を担うリポジトリを定義します。
"""
import datetime
from typing import List, Optional
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload

from api.repositories.base import BaseRepository
from api.models import courses_model, subjects_model, lessons_model
import api.schemas.courses as courses_schema

class CourseRepository(BaseRepository):
    """コース関連のデータ操作をまとめたリポジトリクラス"""

    async def list_enrolled_courses_by_user_id(self, *, user_id: int, include_inactive: bool = False) -> List[courses_model.Courses]:
        """指定されたユーザーが履修しているコースの一覧を取得します。

        関連する科目情報も同時に読み込みます。
        """
        stmt = (
            select(courses_model.Courses)
            .join(courses_model.CourseEnrollments)
            .where(courses_model.CourseEnrollments.user_id == user_id)
            .options(selectinload(courses_model.Courses.subject).selectinload(subjects_model.Subjects.semester)) # Modified
            .order_by(courses_model.Courses.id)
        )
        if not include_inactive:
            stmt = stmt.where(courses_model.Courses.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def list_courses_by_permission(
        self, *, user_id: int, subject_id: int, include_inactive: bool = False
    ) -> List[courses_model.Courses]:
        """指定された教師が閲覧可能な、特定の科目に紐づくコース一覧を取得します。
        """
        stmt = (
            select(courses_model.Courses)
            .join(courses_model.CourseContentPermissions)
            .where(
                courses_model.CourseContentPermissions.teacher_user_id == user_id,
                courses_model.CourseContentPermissions.can_read_content == True,
                courses_model.Courses.subject_id == subject_id,
            )
            .options(selectinload(courses_model.Courses.subject).selectinload(subjects_model.Subjects.semester)) # Modified
            .order_by(courses_model.Courses.id)
        )
        if not include_inactive:
            stmt = stmt.where(courses_model.Courses.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def list_all_courses_by_subject_id(
        self, *, subject_id: int, include_inactive: bool = False
    ) -> List[courses_model.Courses]:
        """指定された科目に紐づく全てのコースを取得します。
        """
        stmt = (
            select(courses_model.Courses)
            .where(courses_model.Courses.subject_id == subject_id)
            .options(selectinload(courses_model.Courses.subject).selectinload(subjects_model.Subjects.semester)) # Modified
            .order_by(courses_model.Courses.id)
        )
        if not include_inactive:
            stmt = stmt.where(courses_model.Courses.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_course_by_id(self, *, course_id: int) -> Optional[courses_model.Courses]:
        """IDでコースを一件取得します。

        関連する科目情報も同時に読み込みます。
        """
        stmt = (
            select(courses_model.Courses)
            .where(courses_model.Courses.id == course_id)
            .options(selectinload(courses_model.Courses.subject).selectinload(subjects_model.Subjects.semester))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_lessons_with_items_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> List[lessons_model.CourseLessons]:
        """指定されたコースのレッスンとそのアイテムの一覧を取得します。"""
        stmt = (
            select(lessons_model.CourseLessons)
            .where(lessons_model.CourseLessons.course_id == course_id)
            .options(selectinload(lessons_model.CourseLessons.lesson_items))
            .order_by(lessons_model.CourseLessons.display_order)
        )
        if not include_inactive:
            stmt = stmt.where(lessons_model.CourseLessons.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    #
    # Course Content Permission Methods
    #

    async def create_course_content_permission(
        self, *, permission_in: courses_schema.CourseContentPermissionCreate, created_by_user_id: int
    ) -> courses_model.CourseContentPermissions:
        """コースコンテンツ権限を新規作成します。"""
        db_obj = courses_model.CourseContentPermissions(
            teacher_user_id=permission_in.teacher_user_id,
            course_id=permission_in.course_id,
            start_date_time=getattr(permission_in, 'start_date_time', datetime.datetime.now()),
            end_date_time=getattr(permission_in, 'end_date_time', datetime.datetime.now()),
            can_read_content=permission_in.can_read_content,
            can_update_content=permission_in.can_update_content,
            can_delete_content=permission_in.can_delete_content,
            created_by_user_id=created_by_user_id,
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_course_content_permission(
        self, *, user_id: int, course_id: int
    ) -> Optional[courses_model.CourseContentPermissions]:
        """指定された教師ユーザーとコースのコンテンツ権限を取得します。"""
        stmt = select(courses_model.CourseContentPermissions).where(
            courses_model.CourseContentPermissions.teacher_user_id == user_id,
            courses_model.CourseContentPermissions.course_id == course_id,
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_course_content_permission(
        self, *, permission: courses_model.CourseContentPermissions, permission_in: courses_schema.CourseContentPermissionUpdate
    ) -> courses_model.CourseContentPermissions:
        """既存のコースコンテンツ権限を更新します。"""
        update_data = permission_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(permission, field, value)
        self.db.add(permission)
        await self.db.flush()
        await self.db.refresh(permission)
        return permission

    async def delete_course_content_permission(self, *, permission: courses_model.CourseContentPermissions) -> bool:
        """コースコンテンツ権限を削除します。"""
        await self.db.delete(permission)
        return True

    async def get_course_creator_id(self, *, course_id: int) -> Optional[int]:
        """指定されたコースの作成者ユーザーIDを取得します。"""
        stmt = select(courses_model.Courses.created_by_user_id).where(courses_model.Courses.id == course_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    #
    # Course Enrollment Methods
    #

    async def create_course_enrollment(
        self, *, enrollment_in: courses_schema.CourseEnrollmentCreate
    ) -> courses_model.CourseEnrollments:
        """コース履修を新規作成します。"""
        db_obj = courses_model.CourseEnrollments(
            user_id=enrollment_in.user_id,
            course_id=enrollment_in.course_id,
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_course_enrollment(
        self, *, user_id: int, course_id: int
    ) -> Optional[courses_model.CourseEnrollments]:
        """指定されたユーザーとコースの履修情報を取得します。"""
        stmt = select(courses_model.CourseEnrollments).where(
            courses_model.CourseEnrollments.user_id == user_id,
            courses_model.CourseEnrollments.course_id == course_id,
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_course_enrollment(
        self, *, enrollment: courses_model.CourseEnrollments, enrollment_in: courses_schema.CourseEnrollmentCreate
    ) -> courses_model.CourseEnrollments:
        """コース履修を更新します。"""
        update_data = enrollment_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(enrollment, field, value)
        self.db.add(enrollment)
        await self.db.flush()
        await self.db.refresh(enrollment)
        return enrollment

    async def delete_course_enrollment(
        self, *, user_id: int, course_id: int
    ) -> bool:
        """コース履修を削除します。"""
        stmt = select(courses_model.CourseEnrollments).where(
            courses_model.CourseEnrollments.user_id == user_id,
            courses_model.CourseEnrollments.course_id == course_id,
        )
        enrollment_to_delete = (await self.db.execute(stmt)).scalar_one_or_none()
        if enrollment_to_delete:
            await self.db.delete(enrollment_to_delete)
            return True
        return False

    async def update_course(
        self, *, course: courses_model.Courses, course_in: courses_schema.CourseUpdate
    ) -> courses_model.Courses:
        """コース情報を更新します。"""
        update_data = course_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(course, field, value)
        course.updated_at = func.now()
        self.db.add(course)
        await self.db.flush()
        await self.db.refresh(course)
        return course

    async def soft_delete_course(self, *, course: courses_model.Courses) -> courses_model.Courses:
        """コースを論理削除します。"""
        course.is_active = False
        course.deleted_at = func.now()
        self.db.add(course)
        await self.db.flush()
        await self.db.refresh(course)
        return course
