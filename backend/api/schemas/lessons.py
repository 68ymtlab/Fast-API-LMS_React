"""
レッスン関連のスキーマ定義

このモジュールでは、レッスン、レッスン項目、レッスンページなどに関連する
Pydanticスキーマを定義します。
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any

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


class LessonPageContentUpdate(BaseModel):
    """レッスンページ本文更新時の入力スキーマ"""
    content: str = Field(..., description="更新する本文")


class TextbookMarkerBase(BaseModel):
    """教科書マーカーの基本スキーマ"""
    lesson_page_id: int = Field(..., description="対象の教科書ページID")
    exact_text: str = Field(..., min_length=1, description="選択したテキスト")
    text_prefix: str = Field(..., description="選択テキスト直前の文脈")
    text_suffix: str = Field(..., description="選択テキスト直後の文脈")
    color: str = Field("yellow", description="マーカー色")
    note: Optional[str] = Field(None, description="メモ")


class TextbookMarkerCreate(BaseModel):
    """教科書マーカー作成入力"""
    exact_text: str = Field(..., min_length=1, description="選択したテキスト")
    text_prefix: str = Field("", description="選択テキスト直前の文脈")
    text_suffix: str = Field("", description="選択テキスト直後の文脈")
    color: str = Field("yellow", description="マーカー色")
    note: Optional[str] = Field(None, description="メモ")


class TextbookMarkerResponse(TextbookMarkerBase):
    """教科書マーカー返却スキーマ"""
    id: int = Field(..., description="マーカーID")
    user_id: int = Field(..., description="作成ユーザーID")
    created_at: datetime = Field(..., description="作成日時")
    updated_at: datetime = Field(..., description="更新日時")

    model_config = ConfigDict(from_attributes=True)


class CourseQuestion(BaseModel):
    """コース用問題一覧の返却スキーマ"""
    id: int
    title: str
    question_type: str
    difficulty: Optional[int] = None
    is_active: bool
    content_data: Dict[str, Any]
    tag_names: List[str] = []


class CourseQuestionCreate(BaseModel):
    """演習問題作成時の入力スキーマ"""
    title: str = Field(..., min_length=1, max_length=255)
    question_type: str = Field(..., min_length=1, max_length=50)
    difficulty: Optional[int] = None
    content_data: Dict[str, Any] = Field(default_factory=dict)
    tag_names: List[str] = Field(default_factory=list)
    is_active: bool = True


class CourseQuestionUpdate(BaseModel):
    """演習問題更新時の入力スキーマ"""
    title: str = Field(..., min_length=1, max_length=255)
    question_type: str = Field(..., min_length=1, max_length=50)
    difficulty: Optional[int] = None
    content_data: Dict[str, Any] = Field(default_factory=dict)
    tag_names: List[str] = Field(default_factory=list)
    is_active: bool = True


class CourseTag(BaseModel):
    """タグ返却スキーマ"""
    id: int
    name: str
    slug: Optional[str] = None


class CourseTagCreate(BaseModel):
    """タグ作成入力スキーマ"""
    name: str = Field(..., min_length=1, max_length=50)


class ExerciseSet(BaseModel):
    """演習セット返却スキーマ"""
    id: int
    title: str
    description: Optional[str] = None
    course_id: int
    question_ids: List[int]
    due_date: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ExerciseSetCreate(BaseModel):
    """演習セット作成/更新入力スキーマ"""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    question_ids: List[int] = Field(default_factory=list)
    due_date: Optional[datetime] = None

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

#
# Exercise Session Schemas (セッション・解答保存)
#

class ExerciseSessionCreate(BaseModel):
    """
    演習セッション開始リクエスト
    """
    pass

class ExerciseSessionResponse(BaseModel):
    """
    演習セッション開始レスポンス
    """
    id: int
    user_id: int
    exercise_set_id: int
    started_at: datetime
    model_config = ConfigDict(from_attributes=True)

class StudentAnswerCreate(BaseModel):
    """
    1問ごとの解答保存リクエスト
    """
    question_id: int
    answer_data: Dict[str, Any]
    is_correct: Optional[bool] = None

class StudentAnswerResponse(BaseModel):
    """
    解答保存レスポンス
    """
    id: int
    session_id: int
    question_id: int
    is_correct: Optional[bool]
    model_config = ConfigDict(from_attributes=True)

class ExerciseSessionFinish(BaseModel):
    """
    演習セッション完了(提出)リクエスト
    """
    score: Optional[float] = None


#
# Exercise Session Summary Schemas (教師向け閲覧)
#

class ExerciseSessionStudentInfo(BaseModel):
    """
    教師向けに返す学生情報サマリ
    """
    user_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    email: str
    grade: Optional[int] = None
    department: Optional[str] = None
    student_number: Optional[str] = None
    class_number: Optional[str] = None
    class_roster_number: Optional[str] = None


class ExerciseSessionSummary(BaseModel):
    """
    教師向けに返す個々の演習セッション情報
    """
    session_id: int
    exercise_set_id: int
    exercise_set_title: str
    score: Optional[float] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


class StudentExerciseSessions(BaseModel):
    """
    学生ごとの演習セッション一覧
    """
    student: ExerciseSessionStudentInfo
    sessions: List[ExerciseSessionSummary] = []


class AdminExerciseSessionLog(BaseModel):
    """管理者向け演習セッションログ"""
    session_id: int
    user_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    email: str
    grade: Optional[int] = None
    department: Optional[str] = None
    course_id: int
    course_name: str
    exercise_set_id: int
    exercise_set_title: str
    score: Optional[float] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

