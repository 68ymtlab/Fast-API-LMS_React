from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError, ExpiredSignatureError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.db.session import get_db
from api.repositories.users_repo import UserRepository
from api.models.users_model import Users

# Bearer 認証スキーム (NextAuthのトークン取得エンドポイントを指定)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token", scheme_name="JWT")

# NextAuth の JWT コールバックで埋め込んでいる想定のクレーム
class TokenData(BaseModel):
    id: Optional[int] = None
    email: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    role_id: Optional[int] = None
    theme_settings: Optional[dict] = None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# トークン検証 → 現在ユーザー取得 (アクティブ判定つき)
async def get_current_active_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Users:
    """
    NextAuth が発行した JWT を検証し、DB から最新のユーザーを返します。
    - 401: トークン不正/検証失敗/ユーザー不存在
    - 400: ユーザーが非アクティブ
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False, "leeway": 30},  # サーバ時刻ズレ対策に30秒の余裕
        )
        token_data = TokenData(**payload)
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired", headers={"WWW-Authenticate": "Bearer"})
    except JWTError as e:
        print(e)
        raise HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})

    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(email=token_data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

# 権限デコレータ（role_id 基準）
#   1: 管理者, 2: 教師
async def require_admin(current_user: Users = Depends(get_current_active_user)) -> Users:
    if not current_user:
        # 念のための防御
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if current_user.role_id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )
    return current_user

async def require_teacher_or_higher(current_user: Users = Depends(get_current_active_user)) -> Users:
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # 管理者(1) or 教師(2) を許可
    if current_user.role_id not in (1, 2):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )
    return current_user
