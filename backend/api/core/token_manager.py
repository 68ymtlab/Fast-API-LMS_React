from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from fastapi import HTTPException, status
from jose import jwt, JWTError, ExpiredSignatureError

from api.core.config import settings

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
            
        to_encode["exp"] = expire
        
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
            expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
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