"""
コンテンツ関連のビジネスロジック

このモジュールでは、テキストコンテンツや画像などの
コンテンツ実体に関連するビジネスルールをカプセル化したサービスクラスを定義します。
"""
import os
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException, status

from api.repositories.contents_repo import ContentRepository
from api.repositories.users_repo import UserRepository
from api.models import contents_model, users_model
import api.schemas.contents as contents_schema

# 画像保存のベースディレクトリ
IMAGE_UPLOAD_DIR = "./static/images"

class ContentService:
    """コンテンツ関連のビジネスロジックを担うサービスクラス"""

    def __init__(self, content_repo: ContentRepository, user_repo: UserRepository):
        """コンストラクタ"""
        self.content_repo = content_repo
        self.user_repo = user_repo

    async def create_content(self, *, content_in: contents_schema.ContentCreate, created_by_user_id: int) -> contents_model.Contents:
        """新しいコンテンツを作成します。"""
        created_content = await self.content_repo.create_content(content_in=content_in, created_by_user_id=created_by_user_id)
        await self.content_repo.db.commit()
        return created_content

    async def get_content_by_id(self, *, content_id: int) -> Optional[contents_model.Contents]:
        """IDでコンテンツを一件取得します。"""
        return await self.content_repo.get_content_by_id(content_id=content_id)

    async def update_content(self, *, content_id: int, content_in: contents_schema.ContentCreate, current_user: users_model.Users) -> Optional[contents_model.Contents]:
        """コンテンツを更新します。"""
        content = await self.content_repo.get_content_by_id(content_id=content_id)
        if content is None:
            return None
        # TODO: 権限チェック (コンテンツ作成者、管理者など)
        updated_content = await self.content_repo.update_content(content=content, content_in=content_in)
        await self.content_repo.db.commit()
        return updated_content

    async def delete_content(self, *, content_id: int, current_user: users_model.Users) -> bool:
        """コンテンツを削除します。"""
        content = await self.content_repo.get_content_by_id(content_id=content_id)
        if content is None:
            return False
        # TODO: 権限チェック (コンテンツ作成者、管理者など)
        success = await self.content_repo.delete_content(content=content)
        await self.content_repo.db.commit()
        return success

    async def upload_image(
        self, 
        *, 
        file_data: bytes, 
        original_file_name: str, 
        mime_type: str, 
        uploaded_by_user_id: int,
        lesson_id: Optional[int] = None,
        alt_text: Optional[str] = None
    ) -> contents_model.Images:
        """画像をファイルシステムに保存し、その情報をデータベースに登録します。"""
        # ファイル名生成 (ユーザーID_タイムスタンプ_UUID.拡張子)
        file_extension = original_file_name.split('.')[-1] if '.' in original_file_name else 'bin'
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        unique_id = uuid.uuid4().hex[:8]

        # ユーザーIDごとのサブディレクトリを作成
        user_dir = os.path.join(IMAGE_UPLOAD_DIR, str(uploaded_by_user_id))
        os.makedirs(user_dir, exist_ok=True)

        stored_file_name = f"{uploaded_by_user_id}_{timestamp}_{unique_id}.{file_extension}"
        file_path = os.path.join(user_dir, stored_file_name)

        # ファイルを保存
        with open(file_path, "wb") as f:
            f.write(file_data)

        # データベースに画像情報を登録（新スキーマ: file_path, alt_text, original_name）
        image_in = contents_schema.ImageCreate(
            file_path=file_path,
            alt_text=alt_text,
            original_name=original_file_name
        )
        db_image = await self.content_repo.create_image(image_in=image_in)
        await self.content_repo.db.commit()
        return db_image

    async def get_image_by_id(self, *, image_id: int) -> Optional[contents_model.Images]:
        """IDで画像情報を取得します。"""
        return await self.content_repo.get_image_by_id(image_id=image_id)

    async def get_image_file_path(self, *, image_id: int) -> Optional[str]:
        """画像IDからファイルシステム上のパスを取得します。"""
        image = await self.content_repo.get_image_by_id(image_id=image_id)
        if image:
            return image.file_path
        return None

    async def delete_image(self, *, image_id: int, current_user: users_model.Users) -> bool:
        """画像情報を削除します。"""
        image = await self.content_repo.get_image_by_id(image_id=image_id)
        if image is None:
            return False
        # TODO: 権限チェック (アップロード者、管理者など)
        success = await self.content_repo.delete_image(image=image)
        await self.content_repo.db.commit()
        return success
