from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKeyConstraint, Identity, PrimaryKeyConstraint, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Users(Base):
    __tablename__ = 'users'
    __table_args__ = (
        ForeignKeyConstraint(['role_id'], ['public.roles.id'], ondelete='CASCADE', name='role_id'),
        PrimaryKeyConstraint('id', name='users_pkey'),
        UniqueConstraint('id', name='users_id_key'),
        {'comment': 'ユーザー共通情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    username: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    theme_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text('\'{"mode": "light", "theme": "default", "font_size": "medium"}\'::jsonb'))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    display_name: Mapped[Optional[str]] = mapped_column(String)
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    last_access_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), comment='最終アクセス日時')

    role: Mapped['Roles'] = relationship('Roles', back_populates='users')
    contents: Mapped[list['Contents']] = relationship('Contents', back_populates='created_by_user')
    goals: Mapped[list['Goals']] = relationship('Goals', back_populates='user')
    learning_recommendations: Mapped[list['LearningRecommendations']] = relationship('LearningRecommendations', back_populates='user')
    student_competencies: Mapped[list['StudentCompetencies']] = relationship('StudentCompetencies', back_populates='user')
    subject_syllabuses: Mapped[list['SubjectSyllabuses']] = relationship('SubjectSyllabuses', foreign_keys='[SubjectSyllabuses.created_by_user_id]', back_populates='created_by_user')
    subject_syllabuses_: Mapped[list['SubjectSyllabuses']] = relationship('SubjectSyllabuses', foreign_keys='[SubjectSyllabuses.updated_by_user_id]', back_populates='updated_by_user')
    subjects: Mapped[list['Subjects']] = relationship('Subjects', back_populates='updated_by_user')
    courses: Mapped[list['Courses']] = relationship('Courses', foreign_keys='[Courses.created_by_user_id]', back_populates='created_by_user')
    courses_: Mapped[list['Courses']] = relationship('Courses', foreign_keys='[Courses.updated_by_user_id]', back_populates='updated_by_user')
    flowpages: Mapped[list['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.created_by_user_id]', back_populates='created_by_user')
    flowpages_: Mapped[list['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.updated_by_user_id]', back_populates='updated_by_user')
    course_content_permissions: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', foreign_keys='[CourseContentPermissions.created_by_user_id]', back_populates='created_by_user')
    course_content_permissions_: Mapped[list['CourseContentPermissions']] = relationship('CourseContentPermissions', foreign_keys='[CourseContentPermissions.user_id]', back_populates='user')
    course_enrollments: Mapped[list['CourseEnrollments']] = relationship('CourseEnrollments', foreign_keys='[CourseEnrollments.assigned_teacher_id]', back_populates='assigned_teacher')
    course_enrollments_: Mapped[list['CourseEnrollments']] = relationship('CourseEnrollments', foreign_keys='[CourseEnrollments.user_id]', back_populates='user')
    course_lessons: Mapped[list['CourseLessons']] = relationship('CourseLessons', foreign_keys='[CourseLessons.created_by_user_id]', back_populates='created_by_user')
    course_lessons_: Mapped[list['CourseLessons']] = relationship('CourseLessons', foreign_keys='[CourseLessons.updated_by_user_id]', back_populates='updated_by_user')
    lesson_items: Mapped[list['LessonItems']] = relationship('LessonItems', foreign_keys='[LessonItems.created_by_user_id]', back_populates='created_by_user')
    lesson_items_: Mapped[list['LessonItems']] = relationship('LessonItems', foreign_keys='[LessonItems.updated_by_user_id]', back_populates='updated_by_user')
    lesson_pages: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.created_by_user_id]', back_populates='created_by_user')
    lesson_pages_: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.updated_by_user_id]', back_populates='updated_by_user')
    flow_sessions: Mapped[list['FlowSessions']] = relationship('FlowSessions', back_populates='user')
    textbook_markers: Mapped[list['TextbookMarkers']] = relationship('TextbookMarkers', back_populates='user')

class Roles(Base):
    __tablename__ = 'roles'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='roles_pkey'),
        {'comment': '役割マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text("(now() AT TIME ZONE 'JST'::text)"))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
    description: Mapped[Optional[str]] = mapped_column(Text)

    users: Mapped[List['Users']] = relationship('Users', back_populates='role')
  
class Students(Users):
    __tablename__ = 'students'
    __table_args__ = (
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='user_id'),
        PrimaryKeyConstraint('user_id', name='students_pkey'),
        UniqueConstraint('user_id', name='students_user_id_key'),
        {'comment': '学生特有情報テーブル', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    grade: Mapped[str] = mapped_column(Enum('B1', 'B2', 'B3', 'B4', 'M1', 'M2', 'D1', 'D2', 'D3', name='grade'))
    department: Mapped[str] = mapped_column(Enum('EM', 'EA', 'ER', 'EL', 'EP', 'EV', 'FM', 'FS', 'FY', 'AA', 'BC', 'BB', 'S', 'M', 'E', 'D', 'C', 'Y', 'I', 'P', 'A', 'B', 'Z', 'DM', 'DE', 'MM', 'MP', 'CC', 'CA', 'CR', 'BE', 'BS', 'KM', 'KS', 'KA', 'KE', 'KI', 'KC', 'AE', 'AD', name='department'))
    class_number: Mapped[str] = mapped_column(String)
    point: Mapped[int] = mapped_column(BigInteger, server_default=text("'0'::bigint"))
    login_days: Mapped[int] = mapped_column(BigInteger, server_default=text("'0'::bigint"))
    metadata_: Mapped[Optional[dict]] = mapped_column('metadata', JSONB)


