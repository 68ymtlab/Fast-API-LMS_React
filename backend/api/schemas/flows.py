"""
フロー（演習問題）関連のスキーマ定義

このモジュールでは、演習問題（Flowpage）、キーワード、演習セットなどに関連する
Pydanticスキーマを定義します。
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any

#
# Flowpage Keyword Dependency Schemas (演習問題キーワード関連)
#

class FlowpageKeywordDependencyBase(BaseModel):
    """演習問題キーワードの基本スキーマ"""
    keyword_name: str = Field(..., description="キーワード名", max_length=255)
    parent_keyword_id: Optional[int] = Field(None, description="親キーワードID")
    description: Optional[str] = Field(None, description="キーワードの説明")

class FlowpageKeywordDependencyCreate(FlowpageKeywordDependencyBase):
    """演習問題キーワード作成時の入力スキーマ"""
    pass

class FlowpageKeywordDependency(FlowpageKeywordDependencyBase):
    """クライアントに返す演習問題キーワード情報のスキーマ"""
    id: int = Field(..., description="キーワードID")
    model_config = ConfigDict(from_attributes=True)

#
# Flowpage Sets Schemas (演習セット関連)
#

class FlowpageSetsBase(BaseModel):
    """演習セットの基本スキーマ"""
    title: str = Field(..., description="演習セットタイトル", max_length=255)
    lesson_id: Optional[int] = Field(None, description="関連するレッスンID")
    time_limit_seconds: Optional[int] = Field(None, description="時間制限（秒）")
    challenge_limit: Optional[int] = Field(None, description="挑戦回数制限")

class FlowpageSetsCreate(FlowpageSetsBase):
    """演習セット作成時の入力スキーマ"""
    pass

class FlowpageSets(FlowpageSetsBase):
    """クライアントに返す演習セット情報のスキーマ"""
    id: int = Field(..., description="演習セットID")
    model_config = ConfigDict(from_attributes=True)

#
# Flowpage Schemas (演習問題ページ関連)
#

class FlowpageBase(BaseModel):
    """演習問題ページの基本スキーマ"""
    page_type: str = Field(..., description="ページタイプ (例: single_text_question)")
    title: str = Field(..., description="問題タイトル", max_length=255)
    raw_body_content_id: int = Field(..., description="元の問題本文コンテンツID (Contentsテーブル参照)")
    rendered_body_content_id: int = Field(..., description="レンダリング済み問題本文コンテンツID (Contentsテーブル参照)")
    original_flowpage_id: Optional[int] = Field(None, description="元のFlowpageのID (Flowpagesテーブル参照、再利用時)")
    difficulty_score: Optional[float] = Field(None, description="難易度スコア")
    is_active: bool = Field(True, description="有効フラグ")
    keywords: Optional[List[str]] = Field(None, description="関連キーワードのリスト") # 新規追加
    parent_flowpage_id: Optional[int] = Field(None, description="連続問題の場合の親Flowpage ID") # 追加

class FlowpageCreate(FlowpageBase):
    """演習問題ページ作成時の入力スキーマ"""
    pass

class Flowpage(FlowpageBase):
    """クライアントに返す演習問題ページ情報のスキーマ"""
    id: int = Field(..., description="Flowpage ID")
    created_at: datetime = Field(..., description="作成日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_at: datetime = Field(..., description="更新日時")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    model_config = ConfigDict(from_attributes=True)

#
# Question Detail Schemas (問題詳細関連)
#

class BlankBase(BaseModel):
    """解答欄の基本スキーマ"""
    flowpage_id: int = Field(..., description="関連するFlowpage ID")
    display_order_in_flowpage: int = Field(..., description="Flowpage内での表示順序")
    blank_name: Optional[str] = Field(None, description="解答欄の名前")

class BlankCreate(BlankBase):
    """解答欄作成時の入力スキーマ"""
    pass

class Blank(BlankBase):
    """クライアントに返す解答欄情報のスキーマ"""
    id: int = Field(..., description="解答欄ID")
    model_config = ConfigDict(from_attributes=True)

class CorrectAnswerBase(BaseModel):
    """正答の基本スキーマ"""
    blank_id: int = Field(..., description="関連する解答欄ID")
    answer_value: str = Field(..., description="正答の値")
    value_type: str = Field(..., description="値の型 (例: string, int, float)")
    score_weight: Optional[float] = Field(1.0, description="スコアの重み")

class CorrectAnswerCreate(CorrectAnswerBase):
    """正答作成時の入力スキーマ"""
    pass

class CorrectAnswer(CorrectAnswerBase):
    """クライアントに返す正答情報のスキーマ"""
    id: int = Field(..., description="正答ID")
    model_config = ConfigDict(from_attributes=True)

class ChoiceBase(BaseModel):
    """選択肢の基本スキーマ"""
    flowpage_id: int = Field(..., description="関連するFlowpage ID")
    raw_choice_content_id: int = Field(..., description="元の選択肢コンテンツID")
    rendered_choice_content_id: int = Field(..., description="レンダリング済み選択肢コンテンツID")
    display_order: int = Field(..., description="表示順序")
    is_correct_option: bool = Field(False, description="正解の選択肢か")

class ChoiceCreate(ChoiceBase):
    """選択肢作成時の入力スキーマ"""
    pass

class Choice(ChoiceBase):
    """クライアントに返す選択肢情報のスキーマ"""
    id: int = Field(..., description="選択肢ID")
    model_config = ConfigDict(from_attributes=True)

#
# Specific Flowpage Question Type Schemas (特定の演習問題タイプ関連)
#

class SingleTextQuestionCreate(FlowpageCreate):
    """単一テキスト問題作成時の入力スキーマ"""
    # FlowpageCreateを継承し、追加のフィールドはなし
    pass

class MultipleTextQuestionCreate(FlowpageCreate):
    """複数テキスト問題作成時の入力スキーマ"""
    answer_column: str = Field(..., description="解答カラムの定義")
    correct_answers: List[CorrectAnswerCreate] = Field(..., description="正答のリスト")

class DescriptiveTextQuestionCreate(FlowpageCreate):
    """記述式テキスト問題作成時の入力スキーマ"""
    correct_answer: CorrectAnswerCreate = Field(..., description="正答")

class ChoiceQuestionCreate(FlowpageCreate):
    """選択問題作成時の入力スキーマ"""
    choices: List[ChoiceCreate] = Field(..., description="選択肢のリスト")
    correct_choices: List[int] = Field(..., description="正解の選択肢IDのリスト") # Assuming int IDs for choices
