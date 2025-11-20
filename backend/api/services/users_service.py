from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from api.core.security import TokenManager
from api.core.password import SecurityManager
from api.repositories.users_repo import UserRepository
import api.schemas.users as user_schema
import api.models.users_model as user_model
from fastapi import HTTPException

class UserService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo
        
    async def get_current_user(self, token: str):
        """JWTトークンを検証し，対応するユーザーを返す。"""
        # TokenManagerでdecode
        payload = TokenManager.decode_token(token)
        
        # TokenDataに変換
        try:
            token_data = user_schema.TokenData(**payload)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token data")
        
        # ユーザーをDBから取得
        user = await self.user_repo.get_by_email(email=token_data.email)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    
    async def get_current_active_user(self, token: str):
        user = await self.get_current_user(token)
        
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
        return user

    async def login(self, *, email: str, password: str) -> Optional[user_model.Users]:
        """ユーザーを認証し、最終ログイン日時を更新します。"""
        user = await self.user_repo.get_by_email(email=email)
        if not user or not SecurityManager.verify_password(password, user.hashed_password) or not user.is_active:
            return None
        
        await self.user_repo.touch_last_login(user_id=user.id)
        await self.user_repo.db.commit()
        return user

    async def create_user(self, *, user_in: user_schema.UserCreate, current_user: user_model.Users) -> user_model.Users:
        """新しいユーザーを作成します。学生情報があればそれも同時に作成します。"""
        # --- 権限チェック ---
        role_to_create = user_in.role_id
        # 教師(role_id=2)がユーザーを作成する場合の制限
        if current_user.role_id == 2:
            if role_to_create not in [2, 3, 4]:  # 2:教師, 3:学生, 4:テスト
                raise ValueError("Teachers can only create users with roles Teacher, Student, or Test.")
        # 管理者(role_id=1)は制限なし

        # --- 既存処理 ---
        # メールアドレスの重複チェック
        existing_user = await self.user_repo.get_by_email(email=user_in.email)
        if existing_user:
            raise ValueError("User with this email already exists")

        hashed_password = SecurityManager.hash_password(user_in.password)
        
        async with self.user_repo.db.begin_nested(): # トランザクション管理
            created_user = await self.user_repo.create(user_in=user_in, hashed_password=hashed_password)
            
            if user_in.student_info:
                await self.user_repo.create_student_details(user_id=created_user.id, student_in=user_in.student_info)
        
        await self.user_repo.db.refresh(created_user)
        return created_user

    async def update_own_password(self, *, user: user_model.Users, password_in: user_schema.PasswordUpdate) -> bool:
        """ユーザー本人がパスワードを更新します。"""
        if not SecurityManager.verify_password(password_in.current_password, user.hashed_password):
            return False
        
        new_hashed_password = SecurityManager.hash_password(password_in.new_password)
        update_schema = user_schema.UserUpdate(password=password_in.new_password)
        await self.user_repo.update(user=user, user_in=update_schema, hashed_password=new_hashed_password)
        await self.user_repo.db.commit()
        return True

    async def reset_password_by_admin(self, *, password_in: user_schema.AdminPasswordReset) -> bool:
        """管理者がユーザーのパスワードをリセットします。"""
        user_to_reset = await self.user_repo.get_by_email(email=password_in.email)
        if not user_to_reset:
            return False
        
        new_hashed_password = SecurityManager.hash_password(password_in.new_password)
        update_schema = user_schema.UserUpdate(password=password_in.new_password)
        await self.user_repo.update(user=user_to_reset, user_in=update_schema, hashed_password=new_hashed_password)
        await self.user_repo.db.commit()
        return True

    async def get_user_by_id(self, *, user_id: int) -> Optional[user_model.Users]:
        """IDでユーザー情報を取得します。"""
        return await self.user_repo.get_by_id(user_id=user_id)

    async def get_all_users(self, *, include_roles_mask: Optional[str] = None) -> List[user_model.Users]:
        """全ユーザーのリストを取得します。"""
        return await self.user_repo.list_all(include_roles_mask=include_roles_mask)
