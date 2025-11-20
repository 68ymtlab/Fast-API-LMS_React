from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError, ExpiredSignatureError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.db.session import get_db
from api.services.users_service import UserService
from api.repositories.users_repo import UserRepository
from api.models.users_model import Users

# Bearer 認証スキーム (NextAuthのトークン取得エンドポイントを指定)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token", scheme_name="JWT")

class TokenManager:
    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """
        アクセストークンの作成
        """
        to_encode = data.copy()
        
        # トークンの有効期限設定
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})
        
        # JWTの生成
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def create_refresh_token(data: dict) -> str:
        """
        リフレッシュトークンの作成
        """
        return TokenManager.create_access_token(
            data,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        """
        トークンの検証と復号
        """
        try:
            # トークンをデコードし，検証
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            return dict(payload)
        except ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="トークンの有効期限が切れています")
        except JWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="トークンが無効です")
        


# 権限デコレータ（role_id 基準）
#   1: 管理者, 2: 教師
async def require_admin(current_user: Users = Depends(UserService.get_current_active_user)) -> Users:
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

async def require_teacher_or_higher(current_user: Users = Depends(UserService.get_current_active_user)) -> Users:
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
