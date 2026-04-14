from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from api.core.security import TokenManager
from api.core.password import SecurityManager
from api.repositories.users_repo import UserRepository
import api.schemas.users as user_schema
import api.models.users_model as user_model
from fastapi import HTTPException, status

class UserService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def get_user_by_email(self, *, email: str) -> Optional[user_model.Users]:
        """メールアドレスでユーザーを取得します。"""
        return await self.user_repo.get_by_email(email=email)
    
    async def login(self, *, email: str, password: str) -> Optional[user_model.Users]:
        """ユーザーを認証し、最終ログイン日時を更新します。"""
        user = await self.user_repo.get_by_email(email=email)
        if not user or not SecurityManager.verify_password(password, user.password_hash) or user.is_disabled:
            return None
        
        await self.user_repo.touch_last_login(user_id=user.id)
        await self.user_repo.db.commit()
        return user
    
    async def perform_login(self, email: str, password: str):
        """
        Swagger / NextAuth / 内部API どの用途でも共通して使える
        ログイン処理：認証 → token生成 → (user, access, refresh) を返す
        """
        # --- ① 認証 ---
        user = await self.login(email=email, password=password)
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # --- ② Token payload ---
        token_payload = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "role_id": user.role_id,
            "theme_settings": user.theme_settings,
        }
        
        # --- ③ JWT生成 ---
        access_token = TokenManager.create_access_token(token_payload)
        refresh_token = TokenManager.create_refresh_token(token_payload)
        
        return user, access_token, refresh_token

    async def create_user(
        self,
        *,
        user_in: user_schema.UserCreate,
        current_user: user_model.Users,
        commit: bool = True,
    ) -> user_model.Users:
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

        # get_db() は自動コミットしないため、ここで明示的にコミットする
        # （コミットしないとリクエスト終了時にロールバックされ、DBに残らない）
        if commit:
            await self.user_repo.db.commit()
        
        # 直近で作成したユーザーに関連情報（role / student）を含めて返すため、
        # 関連を読み込む get_by_id を使って再取得する
        await self.user_repo.db.refresh(created_user)
        user_with_relations = await self.user_repo.get_by_id(user_id=created_user.id)
        return user_with_relations or created_user

    async def create_users_bulk(
        self,
        *,
        users_in: List[user_schema.UserCreate],
        current_user: user_model.Users,
    ) -> user_schema.UserBulkCreateResponse:
        """複数ユーザーを一括作成します。失敗行はスキップして継続します。"""
        results: List[user_schema.UserBulkCreateResult] = []

        for user_in in users_in:
            try:
                created = await self.create_user(
                    user_in=user_in,
                    current_user=current_user,
                    commit=False,
                )
                results.append(
                    user_schema.UserBulkCreateResult(
                        email=user_in.email,
                        status="created",
                        user_id=created.id,
                        message=None,
                    )
                )
            except ValueError as e:
                results.append(
                    user_schema.UserBulkCreateResult(
                        email=user_in.email,
                        status="failed",
                        user_id=None,
                        message=str(e),
                    )
                )

        await self.user_repo.db.commit()

        created_count = sum(1 for r in results if r.status == "created")
        failed_count = len(results) - created_count
        return user_schema.UserBulkCreateResponse(
            created_count=created_count,
            failed_count=failed_count,
            results=results,
        )

    async def update_own_password(self, *, user: user_model.Users, password_in: user_schema.PasswordUpdate) -> bool:
        """ユーザー本人がパスワードを更新します。"""
        if not SecurityManager.verify_password(password_in.current_password, user.password_hash):
            return False
        
        new_hashed_password = SecurityManager.hash_password(password_in.new_password)
        update_schema = user_schema.UserUpdate(password=password_in.new_password)
        await self.user_repo.update(user=user, user_in=update_schema, hashed_password=new_hashed_password)
        await self.user_repo.db.commit()
        return True

    async def reset_password_by_admin(
        self,
        *,
        admin_user: user_model.Users,
        password_in: user_schema.AdminPasswordReset
    ) -> bool:
        """管理者がユーザーのパスワードをリセットします。"""
        if not SecurityManager.verify_password(password_in.admin_password, admin_user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect admin password")

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

    async def get_student_users(self) -> List[user_model.Users]:
        """学生ユーザー一覧を取得します。"""
        return await self.user_repo.list_students()

    async def update_user_by_admin(
        self,
        *,
        admin_user: user_model.Users,
        user_id: int,
        user_in: user_schema.AdminUserUpdate,
    ) -> Optional[user_model.Users]:
        """管理者がユーザー情報を更新します（管理者パスワード再入力必須）。"""
        if not SecurityManager.verify_password(user_in.admin_password, admin_user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect admin password")

        user_to_update = await self.user_repo.get_by_id(user_id=user_id)
        if not user_to_update:
            return None

        if user_in.email and user_in.email != user_to_update.email:
            existing_user = await self.user_repo.get_by_email(email=user_in.email)
            if existing_user and existing_user.id != user_to_update.id:
                raise HTTPException(status_code=400, detail="User with this email already exists")

        update_payload = {}
        for field in ("username", "display_name", "email", "role_id", "is_disabled"):
            value = getattr(user_in, field)
            if value is not None:
                update_payload[field] = value

        if not update_payload:
            raise HTTPException(status_code=400, detail="No user fields to update")

        update_schema = user_schema.UserUpdate(**update_payload)
        await self.user_repo.update(user=user_to_update, user_in=update_schema)
        await self.user_repo.db.commit()
        updated_user = await self.user_repo.get_by_id(user_id=user_id)
        return updated_user or user_to_update

    async def delete_user_by_admin(
        self,
        *,
        admin_user: user_model.Users,
        user_id: int,
        delete_in: user_schema.AdminPasswordConfirm,
    ) -> bool:
        """管理者がユーザーを論理削除します（管理者パスワード再入力必須）。"""
        if not SecurityManager.verify_password(delete_in.admin_password, admin_user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect admin password")

        if admin_user.id == user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot delete your own account",
            )

        user_to_delete = await self.user_repo.get_by_id(user_id=user_id)
        if not user_to_delete:
            return False

        await self.user_repo.soft_delete(user=user_to_delete)
        await self.user_repo.db.commit()
        return True
