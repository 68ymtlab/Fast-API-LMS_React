"""
 レッスンコンテンツ取り込みのビジネスロジック

 このモジュールでは、YAMLファイルからレッスンコンテンツを解析、バリデーションし、
 データベースに登録するプロセスを統括するサービスクラスを定義します。

 現在は教科書コンテンツ（blocks/）のみを登録します。
 演習問題は questions テーブルで別途管理されるため、ここでは扱いません。
"""
import base64
import os
import re
import uuid
from pathlib import Path
from datetime import datetime
import yaml
import yamale
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

from api.repositories.lessons_repo import LessonRepository
from api.repositories.contents_repo import ContentRepository
from api.repositories.users_repo import UserRepository
from api.models import users_model, lessons_model
import api.schemas.lessons as lessons_schema
import api.schemas.contents as contents_schema

# YAMLスキーマファイルのパス
YAML_SCHEMA_DIR = "./api/yaml_validation_schemas"
BLOCK_SCHEMA = os.path.join(YAML_SCHEMA_DIR, "block.yml")

# 画像保存のベースディレクトリ
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "/app/uploads"))
IMAGE_UPLOAD_DIR = UPLOAD_ROOT / "images"


class LessonContentService:
    """レッスンコンテンツの取り込みプロセスを統括するサービスクラス（教科書コンテンツ専用）"""

    def __init__(
        self,
        lesson_repo: LessonRepository,
        content_repo: ContentRepository,
        user_repo: UserRepository
    ):
        """コンストラクタ"""
        self.lesson_repo = lesson_repo
        self.content_repo = content_repo
        self.user_repo = user_repo

    async def register_lesson_content(
        self,
        lesson_upload_request: lessons_schema.LessonContentUploadRequest,
        current_user: users_model.Users
    ) -> lessons_model.CourseLessons:
        """レッスンコンテンツ（教科書）をアップロードし、データベースに登録します。"""
        # 権限チェック: 管理者または教師のみが実行可能
        if current_user.role_id not in [1, 2]: # 1:管理者, 2:教師
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to register lesson content."
            )

        # 1. ファイル構造の解析とバリデーション
        directory_structure = self._create_directory_structure(lesson_upload_request.files)
        validation_result = self._validate_files(directory_structure)
        if not validation_result["success"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=validation_result["error_msg"])

        # 2. レッスン情報の登録（初期プレースホルダがあれば再利用）
        lesson_in = lessons_schema.LessonCreate(
            course_id=lesson_upload_request.course_id,
            title=lesson_upload_request.lesson_title,
            lesson_number=lesson_upload_request.lesson_number,
            description=lesson_upload_request.lesson_description,
            display_order=lesson_upload_request.lesson_display_order,
            is_active=lesson_upload_request.lesson_is_active
        )
        reusable_lesson = await self._find_reusable_lesson(
            course_id=lesson_upload_request.course_id,
            lesson_number=lesson_upload_request.lesson_number,
        )
        if reusable_lesson:
            lesson_update = lessons_schema.LessonUpdate(
                course_id=lesson_upload_request.course_id,
                title=lesson_upload_request.lesson_title,
                lesson_number=lesson_upload_request.lesson_number,
                description=lesson_upload_request.lesson_description,
                display_order=lesson_upload_request.lesson_display_order,
                is_active=lesson_upload_request.lesson_is_active,
            )
            db_lesson = await self.lesson_repo.update_lesson(
                lesson=reusable_lesson,
                lesson_in=lesson_update,
                updated_by_user_id=current_user.id,
            )
        else:
            db_lesson = await self.lesson_repo.create_lesson(
                lesson_in=lesson_in, created_by_user_id=current_user.id
            )

        # 3. コンテンツの登録 (画像、LessonPage)
        # 画像の登録
        image_map = await self._register_images(directory_structure, current_user.id, db_lesson.id)

        # LessonPage (教科書コンテンツ) と LessonItems の登録
        await self._register_lesson_pages(directory_structure, image_map, current_user.id, db_lesson.id)

        await self.lesson_repo.db.commit()

        return db_lesson

    async def _find_reusable_lesson(self, course_id: int, lesson_number: int) -> Optional[lessons_model.CourseLessons]:
        """
        コース作成直後に生成される空の「第N回」レッスンを再利用する。
        条件:
        - 同じ course_id / lesson_number
        - lesson_item が 0 件（未コンテンツ）
        """
        lessons = await self.lesson_repo.list_lessons_with_items_by_course_id(
            course_id=course_id,
            include_inactive=False,
        )
        for lesson in lessons:
            active_items = [item for item in (lesson.lesson_items or []) if item.is_active]
            if lesson.lesson_number == lesson_number and len(active_items) == 0:
                return lesson
        return None

    def _create_directory_structure(self, files: List[lessons_schema.LessonContentFile]) -> Dict[str, Any]:
        """アップロードされたファイルリストからディレクトリ構造を再構築します。"""
        directory_structure = {}
        for file in files:
            current_dict = directory_structure
            splited_path = file.file_path.split('/')
            file_name = splited_path[-1]
            for dir_name in splited_path[:-1]:
                if dir_name not in current_dict:
                    current_dict[dir_name] = {}
                current_dict = current_dict[dir_name]
            current_dict[file_name] = file.file_text
        return directory_structure

    def _resolve_includes(self, file_content: str, directory_structure: Dict[str, Any], root_path: str) -> str:
        """YAMLファイル内の {{include(...)}} を再帰的に解決する"""
        # 正規表現で {{include(...)}} を探す (スペースの有無を許容)
        pattern = re.compile(r'\{\{\s*include\s*\(\s*(.*?)\s*\)\s*\}\}')
        
        def replace_match(match):
            include_path = match.group(1).strip()
            # include_path は 'pages/hoge.yml' のような形式
            path_parts = include_path.split('/')
            
            # directory_structure から該当するファイルの内容を取得
            try:
                current_level = directory_structure[root_path]
                for part in path_parts:
                    current_level = current_level[part]
                
                # 取得した内容も再帰的に解決
                return self._resolve_includes(current_level, directory_structure, root_path)
            except KeyError:
                return f"!! INCLUDE FAILED: {include_path} not found !!"

        # file_content 内のすべての include を置換
        resolved_content = pattern.sub(replace_match, file_content)
        return resolved_content

    def _validate_files(self, directory_structure: Dict[str, Any]) -> Dict[str, Any]:
        """ファイル構造とYAMLコンテンツのバリデーションを行います（教科書コンテンツのみ）。"""
        error_msg = ''
        success = True

        # ルートディレクトリのチェック
        if len(directory_structure.keys()) != 1:
            error_msg += 'ルートディレクトリは1つにしてください\n'
            return {'success': False, 'error_msg': error_msg}
        root_directory = list(directory_structure.keys())[0]

        # blocksディレクトリのバリデーション
        if 'blocks' not in directory_structure[root_directory]:
            error_msg += 'blocksディレクトリが見つかりません\n'
            success = False
        else:
            block_files = directory_structure[root_directory]['blocks']
            if not block_files:
                error_msg += 'blocksディレクトリ内にファイルが見つかりません\n'
                success = False
            for file_name, file_content in block_files.items():
                if not (file_name.endswith('.yml') or file_name.endswith('.yaml')):
                    error_msg += f'{file_name} はymlファイルではありません\n'
                    success = False
                else:
                    try:
                        # include を解決する
                        resolved_content = self._resolve_includes(file_content, directory_structure, root_directory)
                        # 解決後の内容でバリデーション
                        yamale.validate(yamale.make_schema(BLOCK_SCHEMA), [(yaml.safe_load(resolved_content), '')])
                    except (ValueError, yaml.YAMLError) as e:
                        error_msg += f'{file_name} のバリデーションエラー: {e}\n'
                        success = False

        # imagesディレクトリのバリデーション
        if 'images' in directory_structure[root_directory]:
            image_files = directory_structure[root_directory]['images']
            for file_name, file_content in image_files.items():
                if not (file_name.endswith('.jpeg') or file_name.endswith('.jpg') or file_name.endswith('.png') or file_name.endswith('.svg')):
                    error_msg += f'{file_name} は対応する画像ファイルではありません\n'
                    success = False

        # flows/ は演習問題用のため、ここではスキップ（警告のみ）
        if 'flows' in directory_structure[root_directory]:
            print(f"INFO: flows/ ディレクトリは演習問題用です。教科書コンテンツの登録ではスキップされます。")

        return {'success': success, 'error_msg': error_msg}

    async def _register_images(self, directory_structure: Dict[str, Any], uploaded_by_user_id: int, lesson_id: int) -> Dict[str, int]:
        """画像ファイルを保存し、データベースに登録します。"""
        image_map = {} # {original_file_name: image_id}
        root_directory = list(directory_structure.keys())[0]
        if 'images' in directory_structure[root_directory]:
            for image_name, image_data_str in directory_structure[root_directory]['images'].items():
                try:
                    # Base64デコード
                    file_data = base64.b64decode(image_data_str)

                    # ファイルをディスクに保存
                    file_extension = image_name.split('.')[-1] if '.' in image_name else 'bin'
                    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                    unique_id = uuid.uuid4().hex[:8]
                    user_dir = IMAGE_UPLOAD_DIR / str(uploaded_by_user_id)
                    user_dir.mkdir(parents=True, exist_ok=True)
                    stored_file_name = f"{uploaded_by_user_id}_{timestamp}_{unique_id}.{file_extension}"
                    file_path = user_dir / stored_file_name
                    with open(file_path, "wb") as f:
                        f.write(file_data)

                    # DBに画像情報を登録（commit なし）
                    image_in = contents_schema.ImageCreate(
                        file_path=str(file_path),
                        alt_text=None,
                        original_name=image_name
                    )
                    db_image = await self.content_repo.create_image(image_in=image_in)
                    image_map[image_name] = db_image.id
                except (base64.binascii.Error, Exception) as e:
                    print(f"Failed to process image {image_name}: {e}")
                    continue
        return image_map

    async def _register_lesson_pages(
        self,
        directory_structure: Dict[str, Any],
        image_map: Dict[str, int],
        created_by_user_id: int,
        lesson_id: int
    ):
        """LessonPage (教科書コンテンツ) と LessonItems をデータベースに登録します。"""
        root_directory = list(directory_structure.keys())[0]
        if 'blocks' not in directory_structure[root_directory]:
            return

        parsed_blocks: List[Dict[str, Any]] = []
        for block_file_name, block_file_content in directory_structure[root_directory]['blocks'].items():
            # include を解決
            resolved_content = self._resolve_includes(block_file_content, directory_structure, root_directory)
            block_yml_dict = yaml.safe_load(resolved_content)
            parsed_blocks.append(
                {
                    "file_name": block_file_name,
                    "page_number": block_yml_dict.get("page"),
                    "title": block_yml_dict.get("title"),
                    "raw_content_body": block_yml_dict.get("content", ""),
                }
            )

        if not parsed_blocks:
            return

        # page 指定がある場合は page 番号優先、同率はファイル名で安定ソート
        parsed_blocks.sort(
            key=lambda block: (
                block["page_number"] if isinstance(block["page_number"], int) else 10**9,
                block["file_name"],
            )
        )

        first_page_id: Optional[int] = None
        for index, block in enumerate(parsed_blocks, start=1):
            rendered_content_body = self._replace_content_links(block["raw_content_body"], image_map)

            db_raw_content = await self.content_repo.create_content(
                content_in=contents_schema.ContentCreate(
                    content_body=block["raw_content_body"],
                    format_type="yaml_source",
                ),
                created_by_user_id=created_by_user_id,
            )
            db_rendered_content = await self.content_repo.create_content(
                content_in=contents_schema.ContentCreate(
                    content_body=rendered_content_body,
                    format_type="html_rendered",
                ),
                created_by_user_id=created_by_user_id,
            )

            lesson_page_in = lessons_schema.LessonPageCreate(
                lesson_id=lesson_id,
                page_number=block["page_number"] if isinstance(block["page_number"], int) else index,
                raw_content_id=db_raw_content.id,
                rendered_content_id=db_rendered_content.id,
                title=block["title"],
            )
            db_lesson_page = await self.lesson_repo.create_lesson_page(
                page_in=lesson_page_in, created_by_user_id=created_by_user_id
            )
            if first_page_id is None:
                first_page_id = db_lesson_page.id

        # 教科書コンテンツは lesson ごとに 1 つの lesson_item を作成する
        lesson_item_in = lessons_schema.LessonItemCreate(
            lesson_id=lesson_id,
            title=(parsed_blocks[0].get("title") or "教科書コンテンツ"),
            item_content_type="textbook",
            display_order=1,
            item_resource_id=first_page_id,
        )
        await self.lesson_repo.create_lesson_item(
            item_in=lesson_item_in, created_by_user_id=created_by_user_id
        )

    def _replace_content_links(self, content_body: str, image_map: Dict[str, int]) -> str:
        """コンテンツ内の画像リンクを解決し、置換します。"""
        # 画像リンクの置換: (image/{image_name}) → ![contentsimage](/api/images/{image_id})
        for image_name, image_id in image_map.items():
            content_body = content_body.replace(
                f"(image/{image_name})",
                f"![{image_name}](/api/images/{image_id})"
            )
            # 角括弧形式にも対応: [image/{image_name}] → ![image_name](/api/images/{image_id})
            content_body = content_body.replace(
                f"[image/{image_name}]",
                f"![{image_name}](/api/images/{image_id})"
            )

        return content_body