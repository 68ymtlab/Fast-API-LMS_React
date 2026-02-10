"""
レッスン関連のスキーマ定義

このモジュールでは、レッスン、レッスン項目、レッスンページなどに関連する
Pydanticスキーマを定義します。
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

#
# Lesson Schemas (レッスン関連)
#

class LessonBase(BaseModel):
    """レッスン情報の基本スキーマ"""
    course_id: int = Field(..., description="関連するコースID")
    title: str = Field(..., description="レッスンタイトル", max_length=255)
    lesson_number: int = Field(..., description="レッスン番号")
    description: Optional[str] = Field(None, description="レッスン概要")
    display_order: int = Field(..., description="表示順序")
    is_active: bool = Field(True, description="有効フラグ")

class LessonCreate(LessonBase):
    """レッスン作成時の入力スキーマ"""
    pass

class LessonUpdate(LessonBase):
    """レッスン更新時の入力スキーマ"""
    pass

class LessonInDBBase(LessonBase):
    """データベース内のレッスン情報の基本スキーマ"""
    id: int = Field(..., description="レッスンID")
    created_at: datetime = Field(..., description="作成日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_at: datetime = Field(..., description="更新日時")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    model_config = ConfigDict(from_attributes=True)

class Lesson(LessonInDBBase):
    """クライアントに返すレッスン情報のスキーマ（レッスン項目は含まない）"""
    pass

class LessonWithItems(LessonInDBBase):
    """クライアントに返すレッスン情報のスキーマ（レッスン項目を含む）"""
    lesson_items: List['LessonItem'] # This will be loaded via relationship

#
# Lesson Item Schemas (レッスン項目関連)
#

class LessonItemBase(BaseModel):
    """レッスン項目情報の基本スキーマ"""
    lesson_id: int = Field(..., description="関連するレッスンID")
    title: str = Field(..., description="項目タイトル", max_length=255)
    item_content_type: str = Field(..., description="項目コンテンツタイプ (textbook, flow, video)")
    display_order: int = Field(..., description="表示順序")
    is_active: bool = Field(True, description="有効フラグ")
    description: Optional[str] = Field(None, description="項目概要")
    item_resource_id: Optional[int] = Field(None, description="参照するリソースID (例: LessonPage ID, FlowpageSet ID)")
    item_url: Optional[str] = Field(None, description="外部リソースURL")
    item_data_details: Optional[dict] = Field(None, description="追加データ詳細 (JSON)")

class LessonItemCreate(LessonItemBase):
    """レッスン項目作成時の入力スキーマ"""
    pass

class LessonItemUpdate(LessonItemBase):
    """レッスン項目更新時の入力スキーマ"""
    pass

class LessonItemInDBBase(LessonItemBase):
    """データベース内のレッスン項目情報の基本スキーマ"""
    id: int = Field(..., description="レッスン項目ID")
    created_at: datetime = Field(..., description="作成日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_at: datetime = Field(..., description="更新日時")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    model_config = ConfigDict(from_attributes=True)

class LessonItem(LessonItemInDBBase):
    """クライアントに返すレッスン項目情報のスキーマ"""
    pass

#
# Lesson Page Schemas (レッスンページ関連)
#

class LessonPageBase(BaseModel):
    """レッスンページ情報の基本スキーマ"""
    lesson_id: int = Field(..., description="関連するレッスンID (course_lessons)")
    page_number: int = Field(..., description="ページ番号")
    raw_content_id: Optional[int] = Field(None, description="元のコンテンツID (Contentsテーブル参照)")
    rendered_content_id: Optional[int] = Field(None, description="レンダリング済みコンテンツID (Contentsテーブル参照)")
    is_active: bool = Field(True, description="有効フラグ")
    title: Optional[str] = Field(None, description="ページタイトル")
    visibility_start_date_time: Optional[datetime] = Field(None, description="表示開始日時")
    visibility_end_date_time: Optional[datetime] = Field(None, description="表示終了日時")
    is_always_visible: Optional[bool] = Field(True, description="常に表示されるか")

class LessonPageCreate(LessonPageBase):
    """レッスンページ作成時の入力スキーマ"""
    pass

class LessonPageUpdate(LessonPageBase):
    """レッスンページ更新時の入力スキーマ"""
    pass

class LessonPageInDBBase(LessonPageBase):
    """データベース内のレッスンページ情報の基本スキーマ"""
    id: int = Field(..., description="レッスンページID")
    created_at: datetime = Field(..., description="作成日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_at: datetime = Field(..., description="更新日時")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    deleted_at: Optional[datetime] = Field(None, description="削除日時")
    model_config = ConfigDict(from_attributes=True)


class LessonPageWithContentBody(LessonPageInDBBase):
    """
    クライアントに返すレッスンページ情報＋コンテンツ本文（raw/rendered）
    lesson_pageのraw_content_id/rendered_content_idに対応するcontent_bodyを含めて返します。
    """
    raw_content_body: Optional[str] = Field(None, description="元コンテンツの本文")
    rendered_content_body: Optional[str] = Field(None, description="レンダリング済みコンテンツの本文")

#
# Lesson Content Upload Schemas (レッスンコンテンツアップロード関連)
#

class LessonContentFile(BaseModel):
    """レッスンコンテンツを構成する個々のファイル情報"""
    file_path: str = Field(..., description="ファイルパス (ルートディレクトリからの相対パス)")
    file_text: str = Field(..., description="ファイルの内容 (テキストまたはbase64エンコードされたバイナリ)")

class LessonContentUploadRequest(BaseModel):
    """レッスンコンテンツのアップロードリクエストスキーマ"""
    course_id: int = Field(..., description="関連するコースID")
    lesson_title: str = Field(..., description="レッスンタイトル", max_length=255)
    lesson_number: int = Field(..., description="レッスン番号")
    lesson_description: Optional[str] = Field(None, description="レッスン概要")
    lesson_display_order: int = Field(..., description="レッスン表示順序")
    lesson_is_active: bool = Field(True, description="レッスン有効フラグ")
    files: List[LessonContentFile] = Field(..., description="アップロードされるコンテンツファイルのリスト")


# 演習セット・問題一覧取得用スキーマ（グローバル定義）
class FlowpageQuestionDetail(BaseModel):
    """
    演習セット内の個々の問題情報
    """
    flowpage_id: int
    title: str
    page_type: str
    display_order: int
    points: int

class FlowpageSetQuestionDetail(BaseModel):
    """
    演習セットの問題一覧情報
    """
    flowpage_set_id: int
    questions: List[FlowpageQuestionDetail]

class FlowpageSetWithQuestions(BaseModel):
    """
    lesson_item_idに紐づく演習セット＋セット内問題一覧
    """
    id: int
    title: str
    lesson_item_id: int
    time_limit_seconds: Optional[int]
    challenge_limit: Optional[int]
    questions: List[FlowpageQuestionDetail]
