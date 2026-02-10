from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class Users(Base):
    __tablename__ = 'users'
    __table_args__ = (
        ForeignKeyConstraint(['role_id'], ['public.roles.id'], ondelete='RESTRICT', name='users_role_id_fkey'),
        PrimaryKeyConstraint('id', name='users_pkey'),
        UniqueConstraint('email', name='users_email_key'),
        {'comment': 'ユーザー共通情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[Optional[str]] = mapped_column(String(255))
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, nullable=False)
    theme_settings: Mapped[Optional[str]] = mapped_column(Text)
    is_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    role: Mapped['Roles'] = relationship('Roles', back_populates='users')
    contents: Mapped[list['Contents']] = relationship('Contents', back_populates='created_by_user')
    student_competencies: Mapped[list['StudentCompetencies']] = relationship('StudentCompetencies', back_populates='user')
    subject_syllabuses: Mapped[list['SubjectSyllabuses']] = relationship('SubjectSyllabuses', foreign_keys='[SubjectSyllabuses.created_by_user_id]', back_populates='created_by_user')
    subject_syllabuses_: Mapped[list['SubjectSyllabuses']] = relationship('SubjectSyllabuses', foreign_keys='[SubjectSyllabuses.updated_by_user_id]', back_populates='updated_by_user')
    subjects: Mapped[list['Subjects']] = relationship('Subjects', foreign_keys='[Subjects.created_by_user_id]', back_populates='created_by_user')
    subjects_: Mapped[list['Subjects']] = relationship('Subjects', foreign_keys='[Subjects.updated_by_user_id]', back_populates='updated_by_user')
    courses: Mapped[list['Courses']] = relationship('Courses', foreign_keys='[Courses.created_by_user_id]', back_populates='created_by_user')
    courses_: Mapped[list['Courses']] = relationship('Courses', foreign_keys='[Courses.updated_by_user_id]', back_populates='updated_by_user')
    course_content_permissions: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', foreign_keys='[CourseContentPermissions.teacher_user_id]', back_populates='teacher')
    course_content_permissions_created: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', foreign_keys='[CourseContentPermissions.created_by_user_id]', back_populates='created_by_user')
    course_enrollments: Mapped[list['CourseEnrollments']] = relationship('CourseEnrollments', back_populates='user')
    course_lessons: Mapped[list['CourseLessons']] = relationship('CourseLessons', foreign_keys='[CourseLessons.created_by_user_id]', back_populates='created_by_user')
    course_lessons_: Mapped[list['CourseLessons']] = relationship('CourseLessons', foreign_keys='[CourseLessons.updated_by_user_id]', back_populates='updated_by_user')
    lesson_items: Mapped[list['LessonItems']] = relationship('LessonItems', foreign_keys='[LessonItems.created_by_user_id]', back_populates='created_by_user')
    lesson_items_: Mapped[list['LessonItems']] = relationship('LessonItems', foreign_keys='[LessonItems.updated_by_user_id]', back_populates='updated_by_user')
    lesson_pages: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.created_by_user_id]', back_populates='created_by_user')
    lesson_pages_: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.updated_by_user_id]', back_populates='updated_by_user')
    textbook_markers: Mapped[list['TextbookMarkers']] = relationship('TextbookMarkers', back_populates='user')
    student: Mapped[Optional['Students']] = relationship('Students', back_populates='user', uselist=False)
    exercise_sessions: Mapped[list['ExerciseSessions']] = relationship('ExerciseSessions', back_populates='user')


class Roles(Base):
    __tablename__ = 'roles'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='roles_pkey'),
        {'comment': '役割マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('CURRENT_TIMESTAMP'))

    users: Mapped[List['Users']] = relationship('Users', back_populates='role')


class Students(Base):
    __tablename__ = 'students'
    __table_args__ = (
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='students_user_id_fkey'),
        PrimaryKeyConstraint('user_id', name='students_pkey'),
        {'comment': '学生特有情報', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grade: Mapped[Optional[int]] = mapped_column(Integer)
    department: Mapped[Optional[str]] = mapped_column(String(255))
    class_number: Mapped[Optional[str]] = mapped_column(String(255))
    points: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    student_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)

    user: Mapped['Users'] = relationship('Users', back_populates='student', uselist=False)
