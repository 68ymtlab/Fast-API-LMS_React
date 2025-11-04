from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Courses(Base):
    __tablename__ = 'courses'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='courses_created_by_user_id_fkey'),
        ForeignKeyConstraint(['subject_id'], ['public.subjects.id'], name='courses_subject_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='courses_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='courses_pkey'),
        {'comment': 'コース情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    subject_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    course_name: Mapped[str] = mapped_column(String, nullable=False)
    lesson_count: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'15'::bigint"))
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    target_audience: Mapped[Optional[str]] = mapped_column(String)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='courses')
    subject: Mapped['Subjects'] = relationship('Subjects', back_populates='courses')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='courses_')
    course_content_permissions: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', back_populates='course')
    course_enrollments: Mapped[list['CourseEnrollments']] = relationship('CourseEnrollments', back_populates='course')
    course_lessons: Mapped[list['CourseLessons']] = relationship('CourseLessons', back_populates='course')
    
class CourseContentPermissions(Base):
  __tablename__ = 'course_content_permissions'
  __table_args__ = (
    ForeignKeyConstraint(['course_id'], ['public.courses.id'], name='course_content_permissions_course_id_fkey'),
    ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='course_content_permissions_created_by_user_id_fkey'),
    ForeignKeyConstraint(['user_id'], ['public.users.id'], name='course_content_permissions_user_id_fkey'),
    PrimaryKeyConstraint('user_id', 'course_id', name='course_content_permissions_pkey'),
    {'comment': 'コースコンテンツ操作権限', 'schema': 'public'}
  )

  user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
  course_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
  start_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  end_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  can_read_content: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
  can_update_content: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
  can_delete_content: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('now()'))
  created_by_user_id: Mapped[int] = mapped_column(BigInteger)
  updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))

  course: Mapped['Courses'] = relationship('Courses', back_populates='course_content_permissions')
  created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='course_content_permissions')
  user: Mapped['Users'] = relationship('Users', foreign_keys=[user_id], back_populates='course_content_permissions_')


class CourseEnrollments(Base):
    __tablename__ = 'course_enrollments'
    __table_args__ = (
        ForeignKeyConstraint(['assigned_teacher_id'], ['public.users.id'], name='course_enrollments_assigned_teacher_id_fkey'),
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], name='course_enrollments_course_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='course_enrollments_user_id_fkey'),
        PrimaryKeyConstraint('user_id', 'course_id', name='course_enrollments_pkey'),
        {'comment': 'コース履修情報', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    course_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    enrolled_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    last_accessed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    assigned_teacher_id: Mapped[Optional[int]] = mapped_column(BigInteger, comment='担当教員')

    assigned_teacher: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[assigned_teacher_id], back_populates='course_enrollments')
    course: Mapped['Courses'] = relationship('Courses', back_populates='course_enrollments')
    user: Mapped['Users'] = relationship('Users', foreign_keys=[user_id], back_populates='course_enrollments_')
