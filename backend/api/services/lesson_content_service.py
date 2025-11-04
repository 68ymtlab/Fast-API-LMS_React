"""
 レッスンコンテンツ取り込みのビジネスロジック

 このモジュールでは、YAMLファイルからレッスンコンテンツを解析、バリデーションし、
 データベースに登録するプロセスを統括するサービスクラスを定義します。
"""
import os
import re
import uuid
from api.models import flowpages_model
import yaml
import yamale
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException, status

from api.repositories.lessons_repo import LessonRepository
from api.repositories.users_repo import UserRepository
from api.services.contents_service import ContentService
from api.services.flows_service import FlowpageService, FlowpageKeywordService, FlowpageSetsService
from api.models import users_model, lessons_model, contents_model
import api.schemas.lessons as lessons_schema
import api.schemas.contents as contents_schema
import api.schemas.flows as flows_schema

# YAMLスキーマファイルのパス
YAML_SCHEMA_DIR = "./api/yaml_validation_schemas"
BLOCK_SCHEMA = os.path.join(YAML_SCHEMA_DIR, "block.yml")
FLOW_SCHEMA = os.path.join(YAML_SCHEMA_DIR, "flow.yml") # ページタイプ定義のために参照

# ページタイプごとのスキーマパス
PAGE_TYPE_SCHEMAS = {
    "single_text_question": os.path.join(YAML_SCHEMA_DIR, "pages", "single_text_question.yml"),
    "multiple_text_question": os.path.join(YAML_SCHEMA_DIR, "pages", "multiple_text_question.yml"),
    "descriptive_text_question": os.path.join(YAML_SCHEMA_DIR, "pages", "descriptive_text_question.yml"),
    "choice_question": os.path.join(YAML_SCHEMA_DIR, "pages", "choice_question.yml"),
}

class LessonContentService:
    """レッスンコンテンツの取り込みプロセスを統括するサービスクラス"""

    def __init__(
        self,
        lesson_repo: LessonRepository,
        content_service: ContentService,
        flowpage_service: FlowpageService,
        flowpage_keyword_service: FlowpageKeywordService,
        flowpage_sets_service: FlowpageSetsService,
        user_repo: UserRepository # ユーザー情報取得用
    ):
        """コンストラクタ"""
        self.lesson_repo = lesson_repo
        self.content_service = content_service
        self.flowpage_service = flowpage_service
        self.flowpage_keyword_service = flowpage_keyword_service
        self.flowpage_sets_service = flowpage_sets_service
        self.user_repo = user_repo

    async def register_lesson_content(
        self,
        lesson_upload_request: lessons_schema.LessonContentUploadRequest,
        current_user: users_model.Users
    ) -> lessons_model.CourseLessons:
        """レッスンコンテンツをアップロードし、データベースに登録します。"""
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

        # 2. レッスン情報の登録
        lesson_in = lessons_schema.LessonCreate(
            course_id=lesson_upload_request.course_id,
            title=lesson_upload_request.lesson_title,
            lesson_number=lesson_upload_request.lesson_number,
            description=lesson_upload_request.lesson_description,
            display_order=lesson_upload_request.lesson_display_order,
            is_active=lesson_upload_request.lesson_is_active
        )
        db_lesson = await self.lesson_repo.create_lesson(lesson_in=lesson_in, created_by_user_id=current_user.id)
        await self.lesson_repo.db.commit()

        # 3. コンテンツの登録 (画像、Flowpage、LessonPage)
        # トランザクション開始
        async with self.lesson_repo.db.begin_nested():
            # 画像の登録
            image_map = await self._register_images(directory_structure, current_user.id, db_lesson.id)

            # Flowpage (演習問題) の登録
            flowpage_map = await self._register_flowpages(directory_structure, image_map, current_user.id)

            # LessonPage (教科書コンテンツ) の登録
            await self._register_lesson_pages(directory_structure, image_map, flowpage_map, current_user.id, db_lesson.id)
        
        await self.lesson_repo.db.commit() # 全体のコミット

        return db_lesson

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

    def _validate_files(self, directory_structure: Dict[str, Any]) -> Dict[str, Any]:
        """ファイル構造とYAMLコンテンツのバリデーションを行います。"""
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
                        yamale.validate(yamale.make_schema(BLOCK_SCHEMA), [(yaml.safe_load(file_content), '')])
                    except ValueError as e:
                        error_msg += f'{file_name} のバリデーションエラー: {e}\n'
                        success = False

        # flowsディレクトリのバリデーション (FlowpageSets用)
        if 'flows' in directory_structure[root_directory]: # flowsディレクトリは必須ではない
            flow_files = directory_structure[root_directory]['flows']
            for file_name, file_content in flow_files.items():
                if not (file_name.endswith('.yml') or file_name.endswith('.yaml')):
                    error_msg += f'{file_name} はymlファイルではありません\n'
                    success = False
                else:
                    try:
                        # FlowpageSetsのバリデーションスキーマは別途定義が必要
                        # ここではFlowpageのページタイプチェックのみ行う
                        flow_data = yaml.safe_load(file_content)
                        if 'page_groups' in flow_data: # 古いflow.ymlの構造
                            error_msg += f'{file_name} は古いflow.ymlの構造を含んでいます。FlowpageSetsの構造に更新してください。\n'
                            success = False
                        # TODO: FlowpageSetsのバリデーションスキーマをyamaleで定義し、ここで検証する
                    except Exception as e:
                        error_msg += f'{file_name} のバリデーションエラー: {e}\n'
                        success = False

        # imagesディレクトリのバリデーション
        if 'images' in directory_structure[root_directory]:
            image_files = directory_structure[root_directory]['images']
            for file_name, file_content in image_files.items():
                # TODO: MIMEタイプチェックをより厳密に行う
                if not (file_name.endswith('.jpeg') or file_name.endswith('.jpg') or file_name.endswith('.png') or file_name.endswith('.svg')):
                    error_msg += f'{file_name} は対応する画像ファイルではありません\n'
                    success = False

        return {'success': success, 'error_msg': error_msg}

    async def _register_images(self, directory_structure: Dict[str, Any], uploaded_by_user_id: int, lesson_id: int) -> Dict[str, int]:
        """画像ファイルを保存し、データベースに登録します。"""
        image_map = {} # {original_file_name: image_id}
        root_directory = list(directory_structure.keys())[0]
        if 'images' in directory_structure[root_directory]:
            for image_name, image_data_str in directory_structure[root_directory]['images'].items():
                # image_data_str は base64 エンコードされた文字列を想定
                # TODO: base64デコードとMIMEタイプ推測
                # 仮のMIMEタイプとファイルサイズ
                mime_type = "application/octet-stream" 
                file_data = image_data_str.encode('utf-8') # 仮のバイナリデータ

                db_image = await self.content_service.upload_image(
                    file_data=file_data,
                    original_file_name=image_name,
                    mime_type=mime_type,
                    uploaded_by_user_id=uploaded_by_user_id,
                    lesson_id=lesson_id # レッスンに紐付け
                )
                image_map[image_name] = db_image.id
        return image_map

    async def _register_flowpages(self, directory_structure: Dict[str, Any], image_map: Dict[str, int], created_by_user_id: int) -> Dict[str, int]:
        """Flowpage (演習問題) をデータベースに登録します。"""
        flowpage_map = {} # {id_in_yml: flowpage_id}
        root_directory = list(directory_structure.keys())[0]
        
        # FlowpageSetsの登録 (flowsディレクトリが存在する場合)
        if 'flows' in directory_structure[root_directory]:
            for flow_file_name, flow_file_content in directory_structure[root_directory]['flows'].items():
                flow_yml_dict = yaml.safe_load(flow_file_content)
                # FlowpageSetsの作成
                flowpage_set_in = flows_schema.FlowpageSetsCreate(
                    title=flow_yml_dict.get("title", flow_file_name.replace(".yml", "")),
                    lesson_id=None # 後で関連付け
                )
                db_flowpage_set = await self.flowpage_sets_service.create_flowpage_set(flowpage_set_in=flowpage_set_in)

                # Flowpage (問題) の登録
                # FlowpageSetsの構造は、page_groupsではなく、直接pagesのリストを持つと仮定
                for page_data in flow_yml_dict.get("pages", []):
                    # コンテンツの処理 (raw_body_content, rendered_body_content)
                    raw_content_body = page_data.get("content", "")
                    # TODO: 内部リンクの解決 (画像、Flowpageなど) を行い rendered_content_body を生成
                    rendered_content_body = raw_content_body # 仮

                    db_raw_content = await self.content_service.create_content(
                        content_in=contents_schema.ContentCreate(content_body=raw_content_body, format_type="yaml_source"),
                        created_by_user_id=created_by_user_id
                    )
                    db_rendered_content = await self.content_service.create_content(
                        content_in=contents_schema.ContentCreate(content_body=rendered_content_body, format_type="html_rendered"),
                        created_by_user_id=created_by_user_id
                    )

                    # Flowpageの作成
                    flowpage_in = flows_schema.FlowpageCreate(
                        page_type=page_data["page_type"],
                        title=page_data.get("title", "無題の演習問題"),
                        raw_body_content_id=db_raw_content.id,
                        rendered_body_content_id=db_rendered_content.id,
                        original_flowpage_id=None, # TODO: 再利用ロジック
                        keywords=page_data.get("keywords"),
                        parent_flowpage_id=page_data.get("parent_flowpage_id"),
                    )
                    db_flowpage = await self.flowpage_service.create_flowpage(
                        flowpage_in=flowpage_in, created_by_user_id=created_by_user_id
                    )
                    flowpage_map[flow_yml_dict.get("id")] = db_flowpage.id # id_in_yml をキーとして保存

                    # FlowpageSetQuestion の関連付け
                    # TODO: display_order, points はどこから来るか？
                    # await self.flowpage_sets_service.add_flowpage_to_set(
                    #     flowpage_set_id=db_flowpage_set.id, 
                    #     flowpage_id=db_flowpage.id, 
                    #     display_order=page_data.get("order", 1), 
                    #     points=page_data.get("points", 1)
                    # )

                    # 問題詳細（解答欄、正答、選択肢など）の登録
                    await self._register_flowpage_details(db_flowpage.id, page_data)
        return flowpage_map

    async def _register_flowpage_details(self, flowpage_id: int, page_data: Dict[str, Any]):
        """Flowpageの詳細（解答欄、正答、選択肢など）を登録します。"""
        page_type = page_data["page_type"]

        if page_type in ["single_text_question", "SingleTextQuestion"]:
            # 単一テキスト問題
            blank_in = flows_schema.BlankCreate(
                flowpage_id=flowpage_id,
                display_order_in_flowpage=1,
                blank_name=f"blank_{{uuid.uuid4().hex[:8]}}"
            )
            db_blank = await self.flowpage_service.create_blank(blank_in=blank_in)
            for ans_data in page_data.get("correct_answer", []):
                correct_answer_in = flows_schema.CorrectAnswerCreate(
                    blank_id=db_blank.id,
                    answer_value=str(ans_data["value"]),
                    value_type=ans_data["type"]
                )
                await self.flowpage_service.create_correct_answer(correct_answer_in=correct_answer_in)

        elif page_type in ["multiple_text_question", "MultipleTextQuestion"]:
            # 複数テキスト問題
            # answer_column の解析と blank の作成
            # TODO: answer_column の形式をスキーマで定義し、バリデーションする
            # 現在は create_week.py のロジックを参考に簡易的に実装
            blank_ids_map = {} # {blank_id_in_yml: db_blank_id}
            answer_column_blanks = re.findall(r'\[\[(.+?)\]\]', page_data.get("answer_column", ""))
            for blank_name_in_yml in answer_column_blanks:
                blank_in = flows_schema.BlankCreate(
                    flowpage_id=flowpage_id,
                    display_order_in_flowpage=1, # TODO: 順序
                    blank_name=blank_name_in_yml
                )
                db_blank = await self.flowpage_service.create_blank(blank_in=blank_in)
                blank_ids_map[blank_name_in_yml] = db_blank.id
            
            # 正答の登録
            for correct_ans_group in page_data.get("correct_answers", []):
                blank_id_from_map = blank_ids_map.get(correct_ans_group["blank_id"])
                if blank_id_from_map:
                    for ans_data in correct_ans_group.get("answers", []):
                        correct_answer_in = flows_schema.CorrectAnswerCreate(
                            blank_id=blank_id_from_map,
                            answer_value=str(ans_data["value"]),
                            value_type=ans_data["type"]
                        )
                        await self.flowpage_service.create_correct_answer(correct_answer_in=correct_answer_in)

        elif page_type in ["descriptive_text_question", "DescriptiveTextQuestion"]:
            # 記述式テキスト問題
            blank_in = flows_schema.BlankCreate(
                flowpage_id=flowpage_id,
                display_order_in_flowpage=1,
                blank_name=f"blank_{{uuid.uuid4().hex[:8]}}"
            )
            db_blank = await self.flowpage_service.create_blank(blank_in=blank_in)
            correct_answer_in = flows_schema.CorrectAnswerCreate(
                blank_id=db_blank.id,
                answer_value=str(page_data["correct_answer"]["value"]),
                value_type=page_data["correct_answer"]["type"]
            )
            await self.flowpage_service.create_correct_answer(correct_answer_in=correct_answer_in)

        elif page_type in ["choice_question", "ChoiceQuestion"]:
            # 選択問題
            # 選択肢の登録
            for choice_data in page_data.get("choices", []):
                # 選択肢のコンテンツを登録
                db_raw_choice_content = await self.content_service.create_content(
                    content_in=contents_schema.ContentCreate(content_body=choice_data["choice_text"], format_type="markdown"),
                    created_by_user_id=created_by_user_id # TODO: created_by_user_id を渡す
                )
                db_rendered_choice_content = await self.content_service.create_content(
                    content_in=contents_schema.ContentCreate(content_body=choice_data["choice_text"], format_type="html_rendered"),
                    created_by_user_id=created_by_user_id # TODO: created_by_user_id を渡す
                )
                choice_in = flows_schema.ChoiceCreate(
                    flowpage_id=flowpage_id,
                    raw_choice_content_id=db_raw_choice_content.id,
                    rendered_choice_content_id=db_rendered_choice_content.id,
                    display_order=choice_data.get("order", 1), # TODO: order はどこから？
                    is_correct_option=choice_data["choice_id"] in page_data.get("correct_choices", [])
                )
                await self.flowpage_service.create_choice(choice_in=choice_in)

            # 正答の登録 (選択肢IDのリストを文字列として保存)
            blank_in = flows_schema.BlankCreate(
                flowpage_id=flowpage_id,
                display_order_in_flowpage=1,
                blank_name=f"blank_{{uuid.uuid4().hex[:8]}}"
            )
            db_blank = await self.flowpage_service.create_blank(blank_in=blank_in)
            correct_answer_in = flows_schema.CorrectAnswerCreate(
                blank_id=db_blank.id,
                answer_value=",".join(map(str, sorted(page_data.get("correct_choices", [])))),
                value_type="string"
            )
            await self.flowpage_service.create_correct_answer(correct_answer_in=correct_answer_in)

        else:
            raise ValueError(f"Unsupported page_type: {page_type}")

    async def _register_lesson_pages(self, directory_structure: Dict[str, Any], image_map: Dict[str, int], flowpage_map: Dict[str, int], created_by_user_id: int, lesson_id: int):
        """LessonPage (教科書コンテンツ) をデータベースに登録します。"""
        root_directory = list(directory_structure.keys())[0]
        if 'blocks' in directory_structure[root_directory]:
            for block_file_name, block_file_content in directory_structure[root_directory]['blocks'].items():
                block_yml_dict = yaml.safe_load(block_file_content)
                
                raw_content_body = block_yml_dict.get("content", "")
                # TODO: 内部リンクの解決 (画像、Flowpageなど) を行い rendered_content_body を生成
                # create_week.py の replace_scripts と同様のロジックが必要
                rendered_content_body = raw_content_body # 仮

                db_raw_content = await self.content_service.create_content(
                    content_in=contents_schema.ContentCreate(content_body=raw_content_body, format_type="yaml_source"),
                    created_by_user_id=created_by_user_id
                )
                db_rendered_content = await self.content_service.create_content(
                    content_in=contents_schema.ContentCreate(content_body=rendered_content_body, format_type="html_rendered"),
                    created_by_user_id=created_by_user_id
                )

                lesson_page_in = lessons_schema.LessonPageCreate(
                    lesson_id=lesson_id,
                    page_number=block_yml_dict.get("page", 1),
                    raw_content_id=db_raw_content.id,
                    rendered_content_id=db_rendered_content.id,
                    title=block_yml_dict.get("title"),
                    # original_content_id は raw_content_id がその役割を果たす
                )
                await self.lesson_repo.create_lesson_page(page_in=lesson_page_in, created_by_user_id=created_by_user_id)

                # TODO: BlockRule の処理 (visibility_start_date_time など)

    def _replace_content_links(self, content_body: str, image_map: Dict[str, int], flowpage_map: Dict[str, int]) -> str:
        """コンテンツ内の内部リンクを解決し、置換します。"""
        # 画像リンクの置換 (image/{image_name}) -> ![contentsimage](http://localhost:8000/get_image/{image_id})
        # TODO: get_image エンドポイントのパスは設定から取得すべき
        for image_name, image_id in image_map.items():
            content_body = re.sub(rf"\(\s*image/{re.escape(image_name)}\s*)", f"![contentsimage](http://localhost:8000/get_image/{image_id})", content_body)

        # Flowpageリンクの置換 (flow/{id_in_yml}) -> (Flow/{flowpage_id})
        # TODO: FlowpageのURLパスは設定から取得すべき
        for id_in_yml, flowpage_id in flowpage_map.items():
            content_body = re.sub(rf"\\\[(.*?)\\\]\s*\(\s*flow/{re.escape(id_in_yml)}\s*)", rf"<div class='box'><p>[\1](Flow/{flowpage_id})</p></div>", content_body)
        
        return content_body