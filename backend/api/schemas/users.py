from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Any, Dict, List

#
# Token Schemas
#
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """
    JWTのペイロードを型付けするためのスキーマ。
    実運用では `email` が最重要で、他は環境/ユーザーによって欠ける可能性があるため任意にする。
    """
    email: Optional[EmailStr] = None
    sub: Optional[EmailStr] = None
    id: Optional[int] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    role_id: Optional[int] = None
    theme_settings: Optional[Any] = None

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
    student_number: Optional[str] = Field(None, description="学籍番号")
    class_number: Optional[str] = Field(None, description="クラス番号")
    class_roster_number: Optional[str] = Field(None, description="名列番号")

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
    admin_password: str = Field(..., min_length=4, max_length=50, description="操作実行者（管理者）の現在パスワード")
    new_password: str = Field(..., min_length=4, max_length=50, description="新しいパスワード")


class AdminPasswordConfirm(BaseModel):
    """管理者パスワード確認のみを受け取る共通スキーマ"""
    admin_password: str = Field(..., min_length=4, max_length=50, description="操作実行者（管理者）の現在パスワード")


class AdminUserUpdate(BaseModel):
    """管理者によるユーザー情報更新用スキーマ（管理者パスワード再入力必須）"""
    admin_password: str = Field(..., min_length=4, max_length=50, description="操作実行者（管理者）の現在パスワード")
    username: Optional[str] = Field(None, max_length=255, description="ユーザー名")
    display_name: Optional[str] = Field(None, max_length=255, description="表示名")
    email: Optional[EmailStr] = Field(None, description="メールアドレス")
    role_id: Optional[int] = Field(None, ge=1, le=4, description="役割ID")
    is_disabled: Optional[bool] = Field(None, description="無効フラグ")

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


class UserBulkCreateResult(BaseModel):
    """一括登録の1件分結果"""
    email: EmailStr
    status: str = Field(..., description="created または failed")
    user_id: Optional[int] = None
    message: Optional[str] = None


class UserBulkCreateResponse(BaseModel):
    """一括登録レスポンス"""
    created_count: int
    failed_count: int
    results: List[UserBulkCreateResult]


class StudentUserOption(BaseModel):
    """履修登録UI向けの学生ユーザー簡易情報"""
    id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    email: EmailStr
    grade: Optional[int] = None
    department: Optional[str] = None
    student_number: Optional[str] = None
    class_number: Optional[str] = None
    class_roster_number: Optional[str] = None

class AccessHistoryCreate(BaseModel):
    """アクセス履歴作成用スキーマ"""
    date: str = Field(..., description="アクセス日付 (YYYY-MM-DD)")
    page: str = Field(..., description="ページ識別子")
    time: int = Field(..., description="滞在時間(秒)")
    details: Optional[str] = Field(None, description="詳細情報")

class AccessHistoryResponse(BaseModel):
    """アクセス履歴レスポンス"""
    id: int
    user_id: int
    access_date: datetime
    page: str
    time: int
    details: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class AdminAccessHistoryResponse(BaseModel):
    """管理者向けアクセス履歴レスポンス"""
    id: int
    user_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    email: EmailStr
    role_id: int
    access_date: date
    page: str
    time: int
    details: Optional[str] = None
    created_at: datetime
