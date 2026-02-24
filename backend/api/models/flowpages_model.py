"""
フローページ（演習問題）関連モデル

このモジュールでは、演習問題（Flowpage）、キーワード、演習セット、
解答欄、正答、選択肢などに関連するSQLAlchemyモデルを定義します。
models_generated.py からDB定義を元に抽出・再構成しています。
"""
from typing import Optional, List
import datetime

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Double, Enum,
    ForeignKeyConstraint, Identity, PrimaryKeyConstraint, String,
    Table, Text, UniqueConstraint, text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.session import Base


class FlowpageKeywordDependency(Base):
    """演習問題キーワード"""
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
    parent_keyword_reverse: Mapped[List['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', remote_side=[parent_keyword_id], back_populates='parent_keyword')
    flowpage: Mapped[List['Flowpages']] = relationship('Flowpages', secondary='public.flowpage_keywords', back_populates='keyword')


class Flowpages(Base):
    """演習問題ページ"""
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

    keyword: Mapped[List['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', secondary='public.flowpage_keywords', back_populates='flowpage')
    flowpage_blanks: Mapped[List['FlowpageBlanks']] = relationship('FlowpageBlanks', back_populates='flowpage')
    hints: Mapped[List['Hints']] = relationship('Hints', back_populates='flowpage')
    question_choices: Mapped[List['QuestionChoices']] = relationship('QuestionChoices', back_populates='flowpage')
    flowpage_set_question: Mapped[List['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage')


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


class FlowpageBlanks(Base):
    """解答欄"""
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
    correct_answer: Mapped[List['CorrectAnswer']] = relationship('CorrectAnswer', back_populates='blank')


class CorrectAnswer(Base):
    """正答テーブル"""
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


class QuestionChoices(Base):
    """選択肢テーブル"""
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


class Hints(Base):
    """ヒント"""
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


class FlowpageSets(Base):
    """演習セット"""
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

    flowpage_set_question: Mapped[List['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage_set')


class FlowpageSetQuestion(Base):
    """演習セット-問題"""
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
