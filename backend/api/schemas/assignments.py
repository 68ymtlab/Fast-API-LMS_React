"""
課題・ファイル提出関連のPydanticスキーマ
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


# ──────────────────────────────────────────
# Assignment Schemas（課題定義）
# ──────────────────────────────────────────

class AssignmentBase(BaseModel):
    title: str = Field(..., max_length=255, description="課題タイトル")
    description: Optional[str] = Field(None, description="課題の説明")
    is_published: bool = Field(False, description="公開フラグ")
    publish_start_at: Optional[datetime] = Field(None, description="公開開始日時（NULLで即時）")
    publish_end_at: Optional[datetime] = Field(None, description="公開終了日時（NULLで無期限）")
    due_date: Optional[datetime] = Field(None, description="提出締切日時（NULLで締切なし）")
    allow_late_submission: bool = Field(True, description="締切後の提出を許可するか")
    max_file_size_mb: int = Field(50, ge=1, le=500, description="最大ファイルサイズ（MB）")
    allowed_file_types: Optional[str] = Field(None, description="許可ファイル形式（例: .pdf,.docx）NULLで全許可")
    display_order: int = Field(1, ge=1, description="表示順")


class AssignmentCreate(AssignmentBase):
    lesson_id: int = Field(..., description="対象レッスンID")


class AssignmentUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    is_published: Optional[bool] = None
    publish_start_at: Optional[datetime] = None
    publish_end_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    allow_late_submission: Optional[bool] = None
    max_file_size_mb: Optional[int] = Field(None, ge=1, le=500)
    allowed_file_types: Optional[str] = None
    display_order: Optional[int] = Field(None, ge=1)


class AssignmentResponse(AssignmentBase):
    id: int
    lesson_id: int
    created_at: datetime
    created_by_user_id: Optional[int] = None
    updated_at: datetime
    updated_by_user_id: Optional[int] = None
    # 補助フィールド（APIで付加）
    submission_count: int = Field(0, description="提出件数（教師向け）")
    my_submission: Optional["SubmissionResponse"] = Field(None, description="自分の最新提出（学生向け）")

    model_config = ConfigDict(from_attributes=True)


# ──────────────────────────────────────────
# Submission Schemas（提出物）
# ──────────────────────────────────────────

class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_user_id: int
    original_filename: str
    file_size_bytes: Optional[int] = None
    content_type: Optional[str] = None
    submission_number: int
    is_latest: bool
    score: Optional[float] = None
    max_score: Optional[float] = None
    teacher_comment: Optional[str] = None
    graded_at: Optional[datetime] = None
    graded_by_user_id: Optional[int] = None
    submitted_at: datetime
    # 学生情報（教師向け一覧で付加）
    student_display_name: Optional[str] = None
    student_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GradeSubmissionRequest(BaseModel):
    score: Optional[float] = Field(None, ge=0, description="得点（NULLで未採点）")
    max_score: Optional[float] = Field(None, ge=0, description="満点")
    teacher_comment: Optional[str] = Field(None, description="コメント")


class SubmissionListResponse(BaseModel):
    assignment_id: int
    assignment_title: str
    submissions: List[SubmissionResponse]


# forward ref 解決
AssignmentResponse.model_rebuild()
