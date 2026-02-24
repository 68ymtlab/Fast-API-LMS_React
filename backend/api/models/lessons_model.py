from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class CourseLessons(Base):
    __tablename__ = 'course_lessons'
    __table_args__ = (
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], ondelete='CASCADE', name='course_lessons_course_id_fkey'),
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='course_lessons_created_by_user_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='course_lessons_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='course_lessons_pkey'),
        {'comment': 'コースレッスン情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    lesson_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    course: Mapped['Courses'] = relationship('Courses', back_populates='course_lessons')
    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='course_lessons')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='course_lessons_')
    lesson_items: Mapped[list['LessonItems']] = relationship('LessonItems', back_populates='lesson')
    lesson_pages: Mapped[list['LessonPages']] = relationship('LessonPages', back_populates='lesson')
    assignments: Mapped[list['Assignments']] = relationship('Assignments', back_populates='lesson')


class LessonItems(Base):
    __tablename__ = 'lesson_items'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='lesson_items_created_by_user_id_fkey'),
        ForeignKeyConstraint(['lesson_id'], ['public.course_lessons.id'], ondelete='CASCADE', name='lesson_items_lesson_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='lesson_items_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='lesson_items_pkey'),
        {'comment': 'レッスン項目情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    item_content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    item_resource_id: Mapped[Optional[int]] = mapped_column(Integer)
    item_url: Mapped[Optional[str]] = mapped_column(String(2048))
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    item_data_details: Mapped[Optional[dict]] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='lesson_items')
    lesson: Mapped['CourseLessons'] = relationship('CourseLessons', back_populates='lesson_items')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='lesson_items_')


class LessonPages(Base):
    __tablename__ = 'lesson_pages'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='lesson_pages_created_by_user_id_fkey'),
        ForeignKeyConstraint(['lesson_id'], ['public.course_lessons.id'], ondelete='CASCADE', name='lesson_pages_lesson_id_fkey'),
        ForeignKeyConstraint(['raw_content_id'], ['public.contents.id'], ondelete='SET NULL', name='lesson_pages_raw_content_id_fkey'),
        ForeignKeyConstraint(['rendered_content_id'], ['public.contents.id'], ondelete='SET NULL', name='lesson_pages_rendered_content_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='lesson_pages_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='lesson_pages_pkey'),
        {'comment': 'レッスンページ情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(Integer, nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255))
    raw_content_id: Mapped[Optional[int]] = mapped_column(Integer)
    rendered_content_id: Mapped[Optional[int]] = mapped_column(Integer)
    visibility_start_date_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    visibility_end_date_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    is_always_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='lesson_pages')
    lesson: Mapped['CourseLessons'] = relationship('CourseLessons', back_populates='lesson_pages')
    raw_content: Mapped[Optional['Contents']] = relationship('Contents', foreign_keys=[raw_content_id], back_populates='lesson_pages_raw')
    rendered_content: Mapped[Optional['Contents']] = relationship('Contents', foreign_keys=[rendered_content_id], back_populates='lesson_pages_rendered')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='lesson_pages_')
    textbook_markers: Mapped[list['TextbookMarkers']] = relationship('TextbookMarkers', back_populates='lesson_page')


class TextbookMarkers(Base):
    __tablename__ = 'textbook_markers'
    __table_args__ = (
        ForeignKeyConstraint(['lesson_page_id'], ['public.lesson_pages.id'], ondelete='CASCADE', name='textbook_markers_lesson_page_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='textbook_markers_user_id_fkey'),
        PrimaryKeyConstraint('id', name='textbook_markers_pkey'),
        {'comment': '教科書マーカー', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_page_id: Mapped[int] = mapped_column(Integer, nullable=False)
    exact_text: Mapped[str] = mapped_column(Text, nullable=False)
    text_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    text_suffix: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'yellow'"))
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    lesson_page: Mapped['LessonPages'] = relationship('LessonPages', back_populates='textbook_markers')
    user: Mapped['Users'] = relationship('Users', back_populates='textbook_markers')
