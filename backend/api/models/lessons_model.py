from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class CourseLessons(Base):
    __tablename__ = 'course_lessons'
    __table_args__ = (
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], name='course_lessons_course_id_fkey'),
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='course_lessons_created_by_user_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='course_lessons_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='course_lessons_pkey'),
        {'comment': 'コースレッスン情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    course_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    lesson_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    course: Mapped['Courses'] = relationship('Courses', back_populates='course_lessons')
    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='course_lessons')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='course_lessons_')
    lesson_items: Mapped[list['LessonItems']] = relationship('LessonItems', back_populates='lesson')
    
class LessonItems(Base):
    __tablename__ = 'lesson_items'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='lesson_items_created_by_user_id_fkey'),
        ForeignKeyConstraint(['lesson_id'], ['public.course_lessons.id'], name='lesson_items_lesson_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='lesson_items_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='lesson_items_pkey'),
        {'comment': 'レッスン項目情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    lesson_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    item_content_type: Mapped[str] = mapped_column(Enum('textbook', 'flow', 'video', name='content_type'), nullable=False)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    item_resource_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    item_url: Mapped[Optional[str]] = mapped_column(String)
    item_data_details: Mapped[Optional[dict]] = mapped_column(JSONB, comment='項目内容詳細 (拡張用)')
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='lesson_items')
    lesson: Mapped['CourseLessons'] = relationship('CourseLessons', back_populates='lesson_items')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='lesson_items_')
    flowpage_sets: Mapped[list['FlowpageSets']] = relationship('FlowpageSets', back_populates='lesson_item')
    lesson_pages: Mapped[list['LessonPages']] = relationship('LessonPages', back_populates='lesson_item')


class LessonPages(Base):
    __tablename__ = 'lesson_pages'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='lesson_pages_created_by_user_id_fkey'),
        ForeignKeyConstraint(['lesson_item_id'], ['public.lesson_items.id'], name='lesson_pages_lesson_item_id_fkey'),
        ForeignKeyConstraint(['raw_content_id'], ['public.contents.id'], name='lesson_pages_row_content_id_fkey'),
        ForeignKeyConstraint(['rendered_content_id'], ['public.contents.id'], name='lesson_pages_rendered_content_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='lesson_pages_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='lesson_pages_pkey'),
        {'comment': 'レッスンページ情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    lesson_item_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    page_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    raw_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    rendered_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String)
    visibility_start_date_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    visibility_end_date_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    is_always_visible: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('true'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='lesson_pages')
    lesson_item: Mapped['LessonItems'] = relationship('LessonItems', back_populates='lesson_pages')
    raw_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_content_id], back_populates='lesson_pages')
    rendered_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[rendered_content_id], back_populates='lesson_pages_')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='lesson_pages_')
    textbook_markers: Mapped[list['TextbookMarkers']] = relationship('TextbookMarkers', back_populates='lesson_page')
    
class TextbookMarkers(Base):
    __tablename__ = 'textbook_markers'
    __table_args__ = (
        ForeignKeyConstraint(['lesson_page_id'], ['public.lesson_pages.id'], name='textbook_markers_lesson_page_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='textbook_markers_user_id_fkey'),
        PrimaryKeyConstraint('id', name='textbook_markers_pkey'),
        {'comment': '教科書マーカー', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    lesson_page_id: Mapped[int] = mapped_column(BigInteger)
    exact_text: Mapped[str] = mapped_column(Text)
    text_prefix: Mapped[str] = mapped_column(Text)
    text_suffix: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    note: Mapped[Optional[str]] = mapped_column(Text)

    lesson_page: Mapped['LessonPages'] = relationship('LessonPages', back_populates='textbook_markers')
    user: Mapped['Users'] = relationship('Users', back_populates='textbook_markers')