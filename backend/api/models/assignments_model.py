"""
課題・ファイル提出関連のSQLAlchemyモデル
"""
from typing import Optional
from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKeyConstraint,
    Integer, Numeric, PrimaryKeyConstraint, String, Text, text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class Assignments(Base):
    __tablename__ = 'assignments'
    __table_args__ = (
        ForeignKeyConstraint(
            ['lesson_id'], ['public.course_lessons.id'],
            ondelete='CASCADE', name='assignments_lesson_id_fkey'
        ),
        ForeignKeyConstraint(
            ['created_by_user_id'], ['public.users.id'],
            ondelete='SET NULL', name='assignments_created_by_user_id_fkey'
        ),
        ForeignKeyConstraint(
            ['updated_by_user_id'], ['public.users.id'],
            ondelete='SET NULL', name='assignments_updated_by_user_id_fkey'
        ),
        PrimaryKeyConstraint('id', name='assignments_pkey'),
        {'comment': '課題定義', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # 公開制御
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    publish_start_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    publish_end_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    # 提出制御
    due_date: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    allow_late_submission: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    max_file_size_mb: Mapped[Optional[int]] = mapped_column(Integer, server_default=text('50'))
    allowed_file_types: Mapped[Optional[str]] = mapped_column(String(512))

    # メタデータ
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    lesson: Mapped['CourseLessons'] = relationship('CourseLessons', back_populates='assignments')
    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id])
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id])
    submissions: Mapped[list['AssignmentSubmissions']] = relationship(
        'AssignmentSubmissions', back_populates='assignment'
    )


class AssignmentSubmissions(Base):
    __tablename__ = 'assignment_submissions'
    __table_args__ = (
        ForeignKeyConstraint(
            ['assignment_id'], ['public.assignments.id'],
            ondelete='CASCADE', name='assignment_submissions_assignment_id_fkey'
        ),
        ForeignKeyConstraint(
            ['student_user_id'], ['public.users.id'],
            ondelete='CASCADE', name='assignment_submissions_student_user_id_fkey'
        ),
        ForeignKeyConstraint(
            ['graded_by_user_id'], ['public.users.id'],
            ondelete='SET NULL', name='assignment_submissions_graded_by_user_id_fkey'
        ),
        PrimaryKeyConstraint('id', name='assignment_submissions_pkey'),
        {'comment': '課題提出物', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(Integer, nullable=False)
    student_user_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # ファイル情報
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    content_type: Mapped[Optional[str]] = mapped_column(String(128))

    # バージョン管理
    submission_number: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    is_latest: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))

    # 採点
    score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    max_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    teacher_comment: Mapped[Optional[str]] = mapped_column(Text)
    graded_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    graded_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)

    # メタデータ
    submitted_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    assignment: Mapped['Assignments'] = relationship('Assignments', back_populates='submissions')
    student: Mapped['Users'] = relationship('Users', foreign_keys=[student_user_id])
    graded_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[graded_by_user_id])
