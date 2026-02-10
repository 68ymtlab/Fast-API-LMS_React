from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Any, Dict

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

class RefreshTokenRequest(BaseModel):
    """リフレッシュトークンリクエストスキーマ"""
    refresh_token: str = Field(..., description="リフレッシュトークン")

class RefreshTokenResponse(BaseModel):
    """リフレッシュトークンレスポンススキーマ"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

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
    grade: Optional[int] = Field(None, description="学年")
    department: Optional[str] = Field(None, description="所属")
    class_number: Optional[str] = Field(None, description="クラス番号")

class StudentCreate(StudentBase):
    """学生情報作成時の入力スキーマ"""
    pass

class StudentUpdate(StudentBase):
    """学生情報更新時の入力スキーマ"""
    pass

class StudentInDB(StudentBase):
    """DBに格納されている学生情報"""
    user_id: int
    points: Optional[int] = Field(None, description="保持ポイント")
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
    is_disabled: bool = Field(False, description="無効フラグ")

class UserCreate(UserBase):
    """ユーザー作成時の統一入力スキーマ"""
    username: Optional[str] = Field(None, max_length=255)
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
    username: Optional[str] = None
    email: EmailStr
    role_id: int
    password_hash: str
    theme_settings: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class User(UserInDBBase):
    """クライアントに返すユーザー情報のスキーマ"""
    password_hash: Any = Field(exclude=True)
    role: Role
    
class LoginResponse(BaseModel):
    """ログインレスポンススキーマ"""
    user: User
    access_token: str
    refresh_token: str

class UserWithStudent(User):
    """学生情報を含むユーザー情報のレスポンススキーマ"""
    student: Optional[StudentInDB] = None
