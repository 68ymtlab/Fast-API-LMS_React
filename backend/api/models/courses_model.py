from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class Courses(Base):
    __tablename__ = 'courses'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='courses_created_by_user_id_fkey'),
        ForeignKeyConstraint(['subject_id'], ['public.subjects.id'], ondelete='SET NULL', name='courses_subject_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='courses_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='courses_pkey'),
        {'comment': 'コース情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_id: Mapped[Optional[int]] = mapped_column(Integer)
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    session_count: Mapped[Optional[int]] = mapped_column(Integer)
    target_audience: Mapped[Optional[str]] = mapped_column(String(255))
    start_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    end_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='courses')
    subject: Mapped[Optional['Subjects']] = relationship('Subjects', back_populates='courses')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='courses_')
    course_content_permissions: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', back_populates='course')
    course_enrollments: Mapped[list['CourseEnrollments']] = relationship('CourseEnrollments', back_populates='course')
    course_lessons: Mapped[list['CourseLessons']] = relationship('CourseLessons', back_populates='course')
    exercise_sets: Mapped[list['ExerciseSets']] = relationship('ExerciseSets', back_populates='course')


class CourseContentPermissions(Base):
    __tablename__ = 'course_content_permissions'
    __table_args__ = (
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], ondelete='CASCADE', name='course_content_permissions_course_id_fkey'),
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='course_content_permissions_created_by_user_id_fkey'),
        ForeignKeyConstraint(['teacher_user_id'], ['public.users.id'], ondelete='CASCADE', name='course_content_permissions_teacher_user_id_fkey'),
        PrimaryKeyConstraint('teacher_user_id', 'course_id', name='course_content_permissions_pkey'),
        {'comment': 'コースコンテンツ操作権限', 'schema': 'public'}
    )

    teacher_user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    end_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    can_read_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    can_update_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    can_delete_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    course: Mapped['Courses'] = relationship('Courses', back_populates='course_content_permissions')
    teacher: Mapped['Users'] = relationship('Users', foreign_keys=[teacher_user_id], back_populates='course_content_permissions')
    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='course_content_permissions_created')


class CourseEnrollments(Base):
    __tablename__ = 'course_enrollments'
    __table_args__ = (
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], ondelete='CASCADE', name='course_enrollments_course_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='course_enrollments_user_id_fkey'),
        PrimaryKeyConstraint('user_id', 'course_id', name='course_enrollments_pkey'),
        {'comment': 'コース履修情報', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enrolled_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    last_accessed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    course: Mapped['Courses'] = relationship('Courses', back_populates='course_enrollments')
    user: Mapped['Users'] = relationship('Users', back_populates='course_enrollments')
