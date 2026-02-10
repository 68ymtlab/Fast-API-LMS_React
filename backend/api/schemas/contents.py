"""
コンテンツ関連のスキーマ定義

このモジュールでは、テキストコンテンツや画像などの
コンテンツ実体に関連するPydanticスキーマを定義します。
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

#
# Content Schemas (テキストコンテンツ関連)
#

class ContentBase(BaseModel):
    """コンテンツ実体の基本スキーマ"""
    content_body: str = Field(..., description="コンテンツ本文")
    format_type: str = Field("markdown", description="コンテンツのフォーマットタイプ (例: markdown, html)")
    version_notes: Optional[str] = Field(None, description="バージョンノート")

class ContentCreate(ContentBase):
    """コンテンツ作成時の入力スキーマ"""
    pass

class Content(ContentBase):
    """クライアントに返すコンテンツ情報のスキーマ"""
    id: int = Field(..., description="コンテンツID")
    created_at: datetime = Field(..., description="作成日時")
    updated_at: datetime = Field(..., description="更新日時")
    created_by_user_id: Optional[int] = Field(None, description="作成者ID")
    model_config = ConfigDict(from_attributes=True)

#
# Image Schemas (画像関連)
#

class ImageBase(BaseModel):
    """画像情報の基本スキーマ"""
    file_path: str = Field(..., description="ファイルパス")
    alt_text: Optional[str] = Field(None, description="代替テキスト")
    original_name: Optional[str] = Field(None, description="アップロード時のファイル名")

class ImageCreate(ImageBase):
    """画像作成時の入力スキーマ"""
    pass

class Image(ImageBase):
    """クライアントに返す画像情報のスキーマ"""
    id: int = Field(..., description="画像ID")
    model_config = ConfigDict(from_attributes=True)
