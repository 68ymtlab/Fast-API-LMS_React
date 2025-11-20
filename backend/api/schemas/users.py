from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Any, Dict
from api.models.enum import GradeEnum, DepartmentEnum

#
# Token Schemas
#
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    role_id: int
    theme_settings: Optional[dict] = None

#
# Role Schemas
#
class RoleBase(BaseModel):
    """ロールの基本情報"""
    name: str = Field(..., description="役割名")
    description: Optional[str] = Field(None, description="説明")

class Role(RoleBase):
    """レスポンスで返すロール情報"""
    id: int
    model_config = ConfigDict(from_attributes=True)

#
# Student Schemas
#
class StudentBase(BaseModel):
    """学生情報の共通ベース"""
    grade: Optional[GradeEnum] = Field(None, description="学年")
    department: Optional[DepartmentEnum] = Field(None, description="所属")
    class_number: Optional[str] = Field(None, description="クラス番号")

class StudentCreate(StudentBase):
    """学生情報作成時の入力スキーマ"""
    grade: GradeEnum
    department: DepartmentEnum
    class_number: str

class StudentUpdate(StudentBase):
    """学生情報更新時の入力スキーマ"""
    pass

class StudentInDB(StudentBase):
    """DBに格納されている学生情報"""
    user_id: int
    model_config = ConfigDict(from_attributes=True)

#
# User Schemas
#
class UserBase(BaseModel):
    """ユーザー情報の共通ベース"""
    username: Optional[str] = Field(None, description="ユーザー名")
    display_name: Optional[str] = Field(None, description="表示名")
    email: Optional[EmailStr] = Field(None, description="メールアドレス")
    role_id: Optional[int] = Field(None, description="役割ID")
    is_active: bool = Field(True, description="有効フラグ")

class UserCreate(UserBase):
    """ユーザー作成時の統一入力スキーマ"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=4, max_length=50, description="パスワード")
    role_id: int = Field(..., description="1:管理者, 2:教師, 3:学生")
    # 学生情報は任意で受け取る
    student_info: Optional[StudentCreate] = None

class UserUpdate(UserBase):
    """（管理者向け）ユーザー情報更新スキーマ"""
    password: Optional[str] = Field(None, min_length=4, max_length=50, description="新しいパスワード")
    student_info: Optional[StudentUpdate] = None

class PasswordUpdate(BaseModel):
    """ユーザー本人によるパスワード更新用スキーマ"""
    current_password: str = Field(..., description="現在のパスワード")
    new_password: str = Field(..., min_length=4, max_length=50, description="新しいパスワード")

class AdminPasswordReset(BaseModel):
    """管理者によるパスワードリセット用スキーマ"""
    email: EmailStr = Field(..., description="対象ユーザーのメールアドレス")
    new_password: str = Field(..., min_length=4, max_length=50, description="新しいパスワード")

class UserInDBBase(UserBase):
    """DBに格納されているユーザー情報のベース"""
    id: int
    username: str
    email: EmailStr
    role_id: int
    hashed_password: str
    theme_settings: Dict[str, Any] = Field(default_factory=lambda: {"mode": "light", "theme": "default", "font_size": "medium"})
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class User(UserInDBBase):
    """クライアントに返すユーザー情報のスキーマ"""
    hashed_password: Any = Field(exclude=True)
    role: Role

class UserWithStudent(User):
    """学生情報を含むユーザー情報のレスポンススキーマ"""
    student: Optional[StudentInDB] = None
