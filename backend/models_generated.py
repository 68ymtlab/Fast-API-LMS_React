from typing import Optional
import datetime

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class FlowpageKeywordDependency(Base):
    __tablename__ = 'flowpage_keyword_dependency'
    __table_args__ = (
        ForeignKeyConstraint(['parent_keyword_id'], ['public.flowpage_keyword_dependency.id'], name='flowpage_keyword_dependency_parent_keyword_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_keywords_pkey'),
        UniqueConstraint('keyword_name', name='flowpage_keywords_keyword_name_key'),
        {'comment': '演習問題_キーワード', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    keyword_name: Mapped[str] = mapped_column(String, nullable=False)
    parent_keyword_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    description: Mapped[Optional[str]] = mapped_column(Text)

    parent_keyword: Mapped[Optional['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', remote_side=[id], back_populates='parent_keyword_reverse')
    parent_keyword_reverse: Mapped[list['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', remote_side=[parent_keyword_id], back_populates='parent_keyword')
    learning_recommendations: Mapped[list['LearningRecommendations']] = relationship('LearningRecommendations', back_populates='reason_keyword')
    student_competencies: Mapped[list['StudentCompetencies']] = relationship('StudentCompetencies', back_populates='keyword')
    flowpage: Mapped[list['Flowpages']] = relationship('Flowpages', secondary='public.flowpage_keywords', back_populates='keyword')


class Images(Base):
    __tablename__ = 'images'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='images_pkey'),
        {'comment': '画像情報テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    original_file_name: Mapped[str] = mapped_column(String, nullable=False)
    stored_file_path: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    alt_text: Mapped[Optional[str]] = mapped_column(String)
    lesson_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))


class Roles(Base):
    __tablename__ = 'roles'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='roles_pkey'),
        {'comment': '役割マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text("(now() AT TIME ZONE 'JST'::text)"))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    users: Mapped[list['Users']] = relationship('Users', back_populates='role')


class Semesters(Base):
    __tablename__ = 'semesters'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='semesters_pkey'),
        {'comment': '学期マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    sort_order: Mapped[Optional[int]] = mapped_column(BigInteger)

    subjects: Mapped[list['Subjects']] = relationship('Subjects', back_populates='semester')


class SubjectCategories(Base):
    __tablename__ = 'subject_categories'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='subject_categories_pkey'),
        {'comment': '授業科目区分マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text("(now() AT TIME ZONE 'utc'::text)"))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    subject_syllabuses: Mapped[list['SubjectSyllabuses']] = relationship('SubjectSyllabuses', back_populates='subject_category')


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


class Contents(Base):
    __tablename__ = 'contents'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='CASCADE', name='created_by_user_id'),
        PrimaryKeyConstraint('id', name='contents_pkey'),
        {'comment': 'コンテンツ実態', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True, comment='コンテンツID')
    content_body: Mapped[str] = mapped_column(Text, nullable=False)
    format_type: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text("(now() AT TIME ZONE 'jst'::text)"))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text("(now() AT TIME ZONE 'jst'::text)"))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    version_notes: Mapped[Optional[str]] = mapped_column(String)

    created_by_user: Mapped['Users'] = relationship('Users', back_populates='contents')
    flowpages: Mapped[list['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.raw_body_content_id]', back_populates='raw_body_content')
    flowpages_: Mapped[list['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.rendered_body_content_id]', back_populates='rendered_body_content')
    hints: Mapped[list['Hints']] = relationship('Hints', foreign_keys='[Hints.raw_hint_content_id]', back_populates='raw_hint_content')
    hints_: Mapped[list['Hints']] = relationship('Hints', foreign_keys='[Hints.renderd_hint_content_id]', back_populates='renderd_hint_content')
    question_choices: Mapped[list['QuestionChoices']] = relationship('QuestionChoices', foreign_keys='[QuestionChoices.raw_choice_content_id]', back_populates='raw_choice_content')
    question_choices_: Mapped[list['QuestionChoices']] = relationship('QuestionChoices', foreign_keys='[QuestionChoices.renderd_choice_content_id]', back_populates='renderd_choice_content')
    lesson_pages: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.raw_content_id]', back_populates='raw_content')
    lesson_pages_: Mapped[list['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.rendered_content_id]', back_populates='rendered_content')


class Goals(Base):
    __tablename__ = 'goals'
    __table_args__ = (
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='goals_user_id_fkey'),
        PrimaryKeyConstraint('id', name='goals_pkey'),
        {'comment': '目標', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    is_achieved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    is_point_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    is_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    achieved_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    user: Mapped['Users'] = relationship('Users', back_populates='goals')


class LearningRecommendations(Base):
    __tablename__ = 'learning_recommendations'
    __table_args__ = (
        ForeignKeyConstraint(['reason_keyword_id'], ['public.flowpage_keyword_dependency.id'], name='learning_recommendations_reason_keyword_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='learning_recommendations_user_id_fkey'),
        PrimaryKeyConstraint('id', name='learning_recommendations_pkey'),
        {'comment': '学習推薦', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason_keyword_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    recommended_item_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    recommended_item_type: Mapped[Optional[str]] = mapped_column(String)

    reason_keyword: Mapped['FlowpageKeywordDependency'] = relationship('FlowpageKeywordDependency', back_populates='learning_recommendations')
    user: Mapped['Users'] = relationship('Users', back_populates='learning_recommendations')


class StudentCompetencies(Base):
    __tablename__ = 'student_competencies'
    __table_args__ = (
        ForeignKeyConstraint(['keyword_id'], ['public.flowpage_keyword_dependency.id'], name='student_competencies_keyword_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='student_competencies_user_id_fkey'),
        PrimaryKeyConstraint('user_id', 'keyword_id', name='student_competencies_pkey'),
        {'comment': '学生習熟度', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    keyword_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mastery_level: Mapped[float] = mapped_column(Double(53), nullable=False)
    last_assessed_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    confidence_level: Mapped[float] = mapped_column(Double(53), nullable=False)

    keyword: Mapped['FlowpageKeywordDependency'] = relationship('FlowpageKeywordDependency', back_populates='student_competencies')
    user: Mapped['Users'] = relationship('Users', back_populates='student_competencies')


class Students(Users):
    __tablename__ = 'students'
    __table_args__ = (
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='user_id'),
        PrimaryKeyConstraint('user_id', name='students_pkey'),
        UniqueConstraint('user_id', name='students_user_id_key'),
        {'comment': '学生特有情報テーブル', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    grade: Mapped[str] = mapped_column(Enum('B1', 'B2', 'B3', 'B4', 'M1', 'M2', 'D1', 'D2', 'D3', name='grade'), nullable=False)
    department: Mapped[str] = mapped_column(Enum('EM', 'EA', 'ER', 'EL', 'EP', 'EV', 'FM', 'FS', 'FY', 'AA', 'BC', 'BB', 'S', 'M', 'E', 'D', 'C', 'Y', 'I', 'P', 'A', 'B', 'Z', 'DM', 'DE', 'MM', 'MP', 'CC', 'CA', 'CR', 'BE', 'BS', 'KM', 'KS', 'KA', 'KE', 'KI', 'KC', 'AE', 'AD', name='department'), nullable=False)
    class_number: Mapped[str] = mapped_column(String, nullable=False)
    point: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'0'::bigint"))
    login_days: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'0'::bigint"))
    metadata_: Mapped[Optional[dict]] = mapped_column('metadata', JSONB)


class SubjectSyllabuses(Base):
    __tablename__ = 'subject_syllabuses'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='subject_syllabuses_created_by_user_id_fkey'),
        ForeignKeyConstraint(['subject_category_id'], ['public.subject_categories.id'], name='subject_syllabuses_subject_category_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='subject_syllabuses_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('subject_id', name='subject_syllabuses_pkey'),
        {'comment': '科目シラバス', 'schema': 'public'}
    )

    subject_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    subject_category_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    credits: Mapped[int] = mapped_column(BigInteger, nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    keywords: Mapped[dict] = mapped_column(JSON, nullable=False, server_default=text('\'{"keyword":""}\'::json'))
    learning_goal: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    prerequisites: Mapped[str] = mapped_column(Text, nullable=False)
    behavioral_objectives: Mapped[dict] = mapped_column(JSON, nullable=False)
    achievement_targets: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='subject_syllabuses')
    subject_category: Mapped['SubjectCategories'] = relationship('SubjectCategories', back_populates='subject_syllabuses')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='subject_syllabuses_')


class Subjects(Base):
    __tablename__ = 'subjects'
    __table_args__ = (
        ForeignKeyConstraint(['semester_id'], ['public.semesters.id'], ondelete='CASCADE', name='semester_id'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='CASCADE', name='updated_by_user_id'),
        PrimaryKeyConstraint('id', name='subjects_pkey'),
        {'comment': '科目基本情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    subject_name: Mapped[str] = mapped_column(String, nullable=False)
    academic_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    semester_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    semester: Mapped['Semesters'] = relationship('Semesters', back_populates='subjects')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', back_populates='subjects')
    courses: Mapped[list['Courses']] = relationship('Courses', back_populates='subject')


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


class Flowpages(Base):
    __tablename__ = 'flowpages'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='flowpages_created_by_user_id_fkey'),
        ForeignKeyConstraint(['parent_flowpage_id'], ['public.flowpages.id'], name='flowpages_parent_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_body_content_id'], ['public.contents.id'], name='flowpages_raw_body_content_id_fkey'),
        ForeignKeyConstraint(['rendered_body_content_id'], ['public.contents.id'], name='flowpages_rendered_body_content_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='flowpages_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpages_pkey'),
        {'comment': '演習問題', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    page_type: Mapped[str] = mapped_column(Enum('single_text_question', 'multiple_text_question', 'choice_question', 'descriptive_question', name='page_type'), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    raw_body_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    rendered_body_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    difficulty_score: Mapped[float] = mapped_column(Double(53), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    parent_flowpage_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='flowpages')
    parent_flowpage: Mapped[Optional['Flowpages']] = relationship('Flowpages', remote_side=[id], back_populates='parent_flowpage_reverse')
    parent_flowpage_reverse: Mapped[list['Flowpages']] = relationship('Flowpages', remote_side=[parent_flowpage_id], back_populates='parent_flowpage')
    raw_body_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_body_content_id], back_populates='flowpages')
    rendered_body_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[rendered_body_content_id], back_populates='flowpages_')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='flowpages_')
    keyword: Mapped[list['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', secondary='public.flowpage_keywords', back_populates='flowpage')
    flowpage_blanks: Mapped[list['FlowpageBlanks']] = relationship('FlowpageBlanks', back_populates='flowpage')
    hints: Mapped[list['Hints']] = relationship('Hints', back_populates='flowpage')
    question_choices: Mapped[list['QuestionChoices']] = relationship('QuestionChoices', back_populates='flowpage')
    flowpage_set_question: Mapped[list['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage')
    answer: Mapped[list['Answer']] = relationship('Answer', back_populates='flowpage')
    flow_session_question: Mapped[list['FlowSessionQuestion']] = relationship('FlowSessionQuestion', back_populates='flowpage')


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
    start_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    end_date_time: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    can_read_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    can_update_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    can_delete_content: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)

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


class FlowpageBlanks(Base):
    __tablename__ = 'flowpage_blanks'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flowpage_blanks_flowpage_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_blanks_pkey'),
        {'comment': '解答欄', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    display_order_in_flowpage: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    blank_name: Mapped[Optional[str]] = mapped_column(String)

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flowpage_blanks')
    correct_answer: Mapped[list['CorrectAnswer']] = relationship('CorrectAnswer', back_populates='blank')
    answer: Mapped[list['Answer']] = relationship('Answer', back_populates='blank')


t_flowpage_keywords = Table(
    'flowpage_keywords', Base.metadata,
    Column('flowpage_id', BigInteger, primary_key=True),
    Column('keyword_id', BigInteger, primary_key=True),
    ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], ondelete='CASCADE', name='flowpage_keywords_flowpage_id_fkey'),
    ForeignKeyConstraint(['keyword_id'], ['public.flowpage_keyword_dependency.id'], ondelete='CASCADE', name='flowpage_keywords_keyword_id_fkey'),
    PrimaryKeyConstraint('flowpage_id', 'keyword_id', name='flowpage_keywords_pkey1'),
    schema='public',
    comment='演習問題-キーワード'
)


class Hints(Base):
    __tablename__ = 'hints'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='hints_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_hint_content_id'], ['public.contents.id'], name='hints_raw_hint_content_id_fkey'),
        ForeignKeyConstraint(['renderd_hint_content_id'], ['public.contents.id'], name='hints_renderd_hint_content_id_fkey'),
        PrimaryKeyConstraint('id', name='hints_pkey'),
        {'comment': 'ヒント', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    raw_hint_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    renderd_hint_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='hints')
    raw_hint_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_hint_content_id], back_populates='hints')
    renderd_hint_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[renderd_hint_content_id], back_populates='hints_')


class QuestionChoices(Base):
    __tablename__ = 'question_choices'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='question_choices_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_choice_content_id'], ['public.contents.id'], name='question_choices_raw_choice_content_id_fkey'),
        ForeignKeyConstraint(['renderd_choice_content_id'], ['public.contents.id'], name='question_choices_renderd_choice_content_id_fkey'),
        PrimaryKeyConstraint('id', name='question_choices_pkey'),
        {'comment': '選択肢テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    raw_choice_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    renderd_choice_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    is_correct_option: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='question_choices')
    raw_choice_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_choice_content_id], back_populates='question_choices')
    renderd_choice_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[renderd_choice_content_id], back_populates='question_choices_')


class CorrectAnswer(Base):
    __tablename__ = 'correct_answer'
    __table_args__ = (
        ForeignKeyConstraint(['blank_id'], ['public.flowpage_blanks.id'], name='correct_answer_blank_id_fkey'),
        PrimaryKeyConstraint('id', name='correct_answer_pkey'),
        {'comment': '正答テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    blank_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    answer_value: Mapped[str] = mapped_column(String, nullable=False)
    value_type: Mapped[str] = mapped_column(Enum('string', 'int', 'float', name='value_type'), nullable=False)
    score_weight: Mapped[float] = mapped_column(Double(53), nullable=False, server_default=text("'1'::double precision"))

    blank: Mapped['FlowpageBlanks'] = relationship('FlowpageBlanks', back_populates='correct_answer')


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


class FlowpageSets(Base):
    __tablename__ = 'flowpage_sets'
    __table_args__ = (
        ForeignKeyConstraint(['lesson_item_id'], ['public.lesson_items.id'], name='flowpage_sets_lesson_item_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_sets_pkey'),
        {'comment': '演習セット', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    lesson_item_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    time_limit_seconds: Mapped[Optional[int]] = mapped_column(BigInteger)
    challenge_limit: Mapped[Optional[int]] = mapped_column(BigInteger)

    lesson_item: Mapped[Optional['LessonItems']] = relationship('LessonItems', back_populates='flowpage_sets')
    flow_sessions: Mapped[list['FlowSessions']] = relationship('FlowSessions', back_populates='flowpage_set')
    flowpage_set_question: Mapped[list['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage_set')


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
    title: Mapped[str] = mapped_column(String, nullable=False)
    raw_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    rendered_content_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
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


class FlowSessions(Base):
    __tablename__ = 'flow_sessions'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_set_id'], ['public.flowpage_sets.id'], name='flow_sessions_flowpage_set_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='flow_sessions_user_id_fkey'),
        PrimaryKeyConstraint('id', name='flow_sessions_pkey'),
        {'comment': '演習セッション情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    attempt_number: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    started_ayt: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    flowpage_set_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    grade: Mapped[Optional[float]] = mapped_column(Double(53))
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)

    flowpage_set: Mapped[Optional['FlowpageSets']] = relationship('FlowpageSets', back_populates='flow_sessions')
    user: Mapped['Users'] = relationship('Users', back_populates='flow_sessions')
    answer: Mapped[list['Answer']] = relationship('Answer', back_populates='flow_session')
    flow_session_question: Mapped[list['FlowSessionQuestion']] = relationship('FlowSessionQuestion', back_populates='flow_session')


class FlowpageSetQuestion(Base):
    __tablename__ = 'flowpage_set_question'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flowpage_set_question_flowpage_id_fkey'),
        ForeignKeyConstraint(['flowpage_set_id'], ['public.flowpage_sets.id'], name='flowpage_set_question_flowpage_set_id_fkey'),
        PrimaryKeyConstraint('flowpage_set_id', 'flowpage_id', name='flowpage_set_question_pkey'),
        {'comment': '演習セット-問題', 'schema': 'public'}
    )

    flowpage_set_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    points: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flowpage_set_question')
    flowpage_set: Mapped['FlowpageSets'] = relationship('FlowpageSets', back_populates='flowpage_set_question')


class TextbookMarkers(Base):
    __tablename__ = 'textbook_markers'
    __table_args__ = (
        ForeignKeyConstraint(['lesson_page_id'], ['public.lesson_pages.id'], name='textbook_markers_lesson_page_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='textbook_markers_user_id_fkey'),
        PrimaryKeyConstraint('id', name='textbook_markers_pkey'),
        {'comment': '教科書マーカー', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lesson_page_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    exact_text: Mapped[str] = mapped_column(Text, nullable=False)
    text_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    text_suffix: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)

    lesson_page: Mapped['LessonPages'] = relationship('LessonPages', back_populates='textbook_markers')
    user: Mapped['Users'] = relationship('Users', back_populates='textbook_markers')


class Answer(Base):
    __tablename__ = 'answer'
    __table_args__ = (
        ForeignKeyConstraint(['blank_id'], ['public.flowpage_blanks.id'], name='answer_blank_id_fkey'),
        ForeignKeyConstraint(['flow_session_id'], ['public.flow_sessions.id'], name='answer_flow_session_id_fkey'),
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='answer_flowpage_id_fkey'),
        PrimaryKeyConstraint('id', name='answer_pkey'),
        {'comment': '学生解答情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flow_session_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    blank_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    submitted_answer: Mapped[str] = mapped_column(Text, nullable=False)
    attempt_number: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    submitted_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean)
    points_awarded: Mapped[Optional[float]] = mapped_column(Double(53))
    evaluated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    evaluator_feedback: Mapped[Optional[str]] = mapped_column(Text)

    blank: Mapped['FlowpageBlanks'] = relationship('FlowpageBlanks', back_populates='answer')
    flow_session: Mapped['FlowSessions'] = relationship('FlowSessions', back_populates='answer')
    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='answer')


class FlowSessionQuestion(Base):
    __tablename__ = 'flow_session_question'
    __table_args__ = (
        ForeignKeyConstraint(['flow_session_id'], ['public.flow_sessions.id'], name='flow_session_question_flow_session_id_fkey'),
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flow_session_question_flowpage_id_fkey'),
        PrimaryKeyConstraint('flow_session_id', 'flowpage_id', name='flow_session_question_pkey'),
        {'comment': '演習セッション出題記録', 'schema': 'public'}
    )

    flow_session_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    display_order: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("'1'::bigint"))
    is_submitted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, server_default=text('now()'))
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))

    flow_session: Mapped['FlowSessions'] = relationship('FlowSessions', back_populates='flow_session_question')
    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flow_session_question')
