from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.token_manager import TokenManager
from api.schemas.users import TokenData
from api.db.session import get_db
from api.repositories.users_repo import UserRepository
from api.models.users_model import Users


# Bearer 認証スキーム (NextAuthのトークン取得エンドポイントを指定)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token", scheme_name="JWT")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Users:

    payload = TokenManager.decode_token(token)

    try:
        token_data = TokenData(**payload)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token data")

    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(email=token_data.email)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

async def get_current_active_user(
    current_user: Users = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


# 権限デコレータ（role_id 基準）
#   1: 管理者, 2: 教師
async def require_admin(current_user: Users = Depends(get_current_active_user)) -> Users:
    if current_user.role_id != 1:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to perform this action",
        )
    return current_user

async def require_teacher_or_higher(current_user: Users = Depends(get_current_active_user)) -> Users:
    # 管理者(1) or 教師(2) を許可
    if current_user.role_id not in (1, 2):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to perform this action",
        )
    return current_user
