"""
コース関連のスキーマ定義

このモジュールでは、コース、コース履修、コースコンテンツなどに関連する
Pydanticスキーマを定義します。
"""
from datetime import datetime, date
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

# 外部キーとして利用する他スキーマをインポート
from api.schemas.subjects import SubjectWithSemester
from api.schemas.lessons import Lesson # New import

#
# Course Schemas (コース関連)
#

class CourseBase(BaseModel):
    """コース情報の基本スキーマ"""
    course_name: Optional[str] = Field(None, description="コース名", max_length=255)
    description: Optional[str] = Field(None, description="コース概要")
    lesson_count: Optional[int] = Field(15, description="レッスン数")
    start_date: Optional[date] = Field(None, description="開始日")
    end_date: Optional[date] = Field(None, description="終了日")
    is_active: bool = Field(True, description="公開フラグ")

class CourseCreate(CourseBase):
    """コース作成時の入力スキーマ"""
    subject_id: int = Field(..., description="関連する科目ID")
    course_name: str = Field(..., description="コース名", max_length=255)
    start_date: date = Field(..., description="開始日")
    end_date: date = Field(..., description="終了日")

class CourseUpdate(CourseBase):
    """コース更新時の入力スキーマ"""
    pass

class CourseInDBBase(CourseBase):
    """データベース内のコース情報の基本スキーマ"""
    id: int = Field(..., description="コースID")
    subject_id: int = Field(..., description="科目ID")
    created_at: datetime = Field(..., description="作成日時")
    updated_at: datetime = Field(..., description="更新日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    model_config = ConfigDict(from_attributes=True)

class Course(CourseInDBBase):
    """クライアントに返す基本的なコース情報のスキーマ（レッスン情報は含まない）"""
    # 科目情報をネストして含める
    subject: SubjectWithSemester

class CourseWithLessons(Course):
    """クライアントに返す、レッスン情報を含むコース情報のスキーマ"""
    # レッスン情報をネストして含める
    lessons: List[Lesson] = []

#
# Course Enrollment Schemas (コース履修関連)
#

class CourseEnrollmentBase(BaseModel):
    """コース履修情報の基本スキーマ"""
    user_id: int = Field(..., description="ユーザーID")
    course_id: int = Field(..., description="コースID")
    assigned_teacher_id: Optional[int] = Field(None, description="担当教師のユーザーID")

class CourseEnrollmentCreate(CourseEnrollmentBase):
    """コース履修登録時の入力スキーマ"""
    pass

class CourseEnrollment(CourseEnrollmentBase):
    """クライアントに返すコース履修情報のスキーマ"""
    enrolled_at: datetime = Field(..., description="登録日時")
    last_accessed_at: Optional[datetime] = Field(None, description="最終アクセス日時")
    model_config = ConfigDict(from_attributes=True)

class CourseEnrollmentBatchCreate(BaseModel):
    """複数のコース履修登録を一括で行うためのスキーマ"""
    enrollments: List[CourseEnrollmentCreate] = Field(..., description="履修登録情報のリスト")

#
# Course Content Permission Schemas (コースコンテンツ権限関連)
#

class CourseContentPermissionBase(BaseModel):
    """コースコンテンツ権限の基本スキーマ"""
    user_id: int = Field(..., description="権限を付与されるユーザーのID")
    course_id: int = Field(..., description="権限を付与するコースのID")
    can_read_content: bool = Field(False, description="コンテンツ閲覧権限")
    can_update_content: bool = Field(False, description="コンテンツ更新権限")
    can_delete_content: bool = Field(False, description="コンテンツ削除権限")

class CourseContentPermissionCreate(CourseContentPermissionBase):
    """コースコンテンツ権限作成時の入力スキーマ"""
    # user_idとcourse_idは必須
    pass

class CourseContentPermissionUpdate(BaseModel):
    """コースコンテンツ権限更新時の入力スキーマ"""
    can_read_content: Optional[bool] = Field(None, description="コンテンツ閲覧権限")
    can_update_content: Optional[bool] = Field(None, description="コンテンツ更新権限")
    can_delete_content: Optional[bool] = Field(None, description="コンテンツ削除権限")

class CourseContentPermission(CourseContentPermissionBase):
    """クライアントに返すコースコンテンツ権限情報のスキーマ"""
    created_at: datetime = Field(..., description="作成日時")
    created_by_user_id: int = Field(..., description="作成者ID")
    updated_at: datetime = Field(..., description="更新日時")
    model_config = ConfigDict(from_attributes=True)

class CourseContentPermissionBatchCreate(BaseModel):
    """複数のコースコンテンツ権限を一括作成・更新するためのスキーマ"""
    permissions: List[CourseContentPermissionCreate] = Field(..., description="権限情報のリスト")