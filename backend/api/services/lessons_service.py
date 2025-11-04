"""
レッスン関連のビジネスロジック

このモジュールでは、レッスンに関連するビジネスルールをカプセル化した
サービスクラスを定義します。
"""
from typing import List, Dict
from api.repositories.lessons_repo import LessonRepository
from api.models import lessons_model
from api.schemas.lessons import FlowpageSetWithQuestions, FlowpageQuestionDetail

class LessonService:
    """レッスン関連のビジネスロジックを担うサービスクラス"""

    def __init__(self, lesson_repo: LessonRepository):
        """コンストラクタ"""
        self.lesson_repo = lesson_repo

    async def get_lesson_item_by_id(self, lesson_item_id: int):
        """
        指定したレッスン項目ID(lesson_item_id)に対応するレッスン項目情報を取得します。
        """
        return await self.lesson_repo.get_lesson_item_by_id(item_id=lesson_item_id)

    async def get_lessons_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> List[lessons_model.CourseLessons]:
        """指定されたコースのレッスン一覧を取得します。"""
        return await self.lesson_repo.list_lessons_by_course_id(course_id=course_id, include_inactive=include_inactive)

    async def get_lesson_items_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> Dict[int, List[lessons_model.LessonItems]]:
        """指定されたコースのすべてのレッスン項目を、レッスンIDをキーとする辞書で取得します。"""
        lessons = await self.lesson_repo.list_lessons_with_items_by_course_id(course_id=course_id, include_inactive=include_inactive)
        items_by_lesson = {lesson.id: lesson.lesson_items for lesson in lessons}
        return items_by_lesson


    async def list_lesson_pages_with_content_body_by_lesson_item_id(self, *, lesson_item_id: int, content_repo):
        """
        指定したレッスン項目ID(lesson_item_id)に紐づく教科書ページ(lesson_pages)を全て取得し、
        各ページのraw_content_id/rendered_content_idに対応するcontent_bodyも含めて返します。
        ContentRepositoryを利用します。
        """
        return await self.lesson_repo.list_lesson_pages_with_content_body_by_lesson_item_id(lesson_item_id=lesson_item_id, content_repo=content_repo)
    
    async def list_flowpage_sets_with_questions_by_lesson_item_id(self, lesson_item_id: int):
        """
        指定したlesson_item_idに紐づく演習セット＋セット内問題一覧を取得します。
        """
        
        raw_results = await self.lesson_repo.list_flowpage_sets_with_questions_by_lesson_item_id(lesson_item_id)
        # Pydanticスキーマで返却
        return [
            FlowpageSetWithQuestions(
                id=fs['id'],
                title=fs['title'],
                lesson_item_id=fs['lesson_item_id'],
                time_limit_seconds=fs['time_limit_seconds'],
                challenge_limit=fs['challenge_limit'],
                questions=[
                    FlowpageQuestionDetail(**q) for q in fs['questions']
                ]
            )
            for fs in raw_results
        ]
