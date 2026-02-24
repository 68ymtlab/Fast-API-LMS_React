"""
Seed teacher permissions for existing courses.

このスクリプトは以下の処理を行います:
- add_subject.py / add_course.py で作成済みの科目・コースに対して、
  指定した講師にコースの閲覧・編集・削除権限を付与します。

前提:
  - add_subject.py でsubjectsが作成済みであること
  - add_course.py でcoursesが作成済みであること

Usage:
  docker compose exec backend poetry run python scripts/seed_subjects_with_permissions.py
  # or from host (backend dir):
  cd backend && poetry run python scripts/seed_subjects_with_permissions.py
"""
import asyncio
import os
import sys
from pathlib import Path
import datetime

# backend を path に追加
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker


# ===== 設定 =====

# 権限を付与する対象の科目ID（add_subject.py で作成済み）
TARGET_SUBJECT_IDS = [1, 2, 3]

# 権限を付与する講師のユーザーID（複数可）
TEACHER_USER_IDS = [6, 7, 8]  # yanagi, ogasawara, nishioka

# 権限の有効期限
PERMISSION_START = datetime.datetime(2025, 4, 1, 0, 0, 0)
PERMISSION_END = datetime.datetime(2026, 3, 31, 0, 0, 0)

# 権限フラグ
PERMISSION_FLAGS = {
    "can_read_content": True,
    "can_update_content": True,
    "can_delete_content": True,
}


# ===== スクリプト本体 =====

async def get_courses_by_subject_ids(session: AsyncSession, subject_ids: list[int]) -> list[dict]:
    """指定した科目IDに紐づくコースを取得"""
    result = await session.execute(
        text("""
            SELECT c.id, c.course_name, c.subject_id, s.subject_name
            FROM courses c
            JOIN subjects s ON s.id = c.subject_id
            WHERE c.subject_id = ANY(:subject_ids)
            ORDER BY c.subject_id, c.id
        """),
        {"subject_ids": subject_ids},
    )
    rows = result.fetchall()
    return [
        {
            "id": row[0],
            "course_name": row[1],
            "subject_id": row[2],
            "subject_name": row[3],
        }
        for row in rows
    ]


async def add_permissions(
    session: AsyncSession,
    course_ids: list[int],
    teacher_user_ids: list[int],
) -> int:
    """講師にコースの権限を付与（既存の場合は更新）"""
    count = 0
    for course_id in course_ids:
        for teacher_id in teacher_user_ids:
            await session.execute(
                text("""
                    INSERT INTO course_content_permissions (
                        teacher_user_id,
                        course_id,
                        start_date_time,
                        end_date_time,
                        can_read_content,
                        can_update_content,
                        can_delete_content,
                        created_by_user_id
                    )
                    VALUES (
                        :teacher_user_id,
                        :course_id,
                        :start_date_time,
                        :end_date_time,
                        :can_read_content,
                        :can_update_content,
                        :can_delete_content,
                        :created_by_user_id
                    )
                    ON CONFLICT (teacher_user_id, course_id) DO UPDATE SET
                        can_read_content = EXCLUDED.can_read_content,
                        can_update_content = EXCLUDED.can_update_content,
                        can_delete_content = EXCLUDED.can_delete_content,
                        start_date_time = EXCLUDED.start_date_time,
                        end_date_time = EXCLUDED.end_date_time
                """),
                {
                    "teacher_user_id": teacher_id,
                    "course_id": course_id,
                    "start_date_time": PERMISSION_START,
                    "end_date_time": PERMISSION_END,
                    "can_read_content": PERMISSION_FLAGS["can_read_content"],
                    "can_update_content": PERMISSION_FLAGS["can_update_content"],
                    "can_delete_content": PERMISSION_FLAGS["can_delete_content"],
                    "created_by_user_id": 1,  # 管理者で作成
                },
            )
            count += 1
    return count


async def seed_permissions() -> None:
    """既存コースに対して講師の権限を一括付与"""
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set. Check backend/.env")
        sys.exit(1)

    engine = create_async_engine(url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print(f"🚀 教師権限の付与を開始...")
    print(f"  対象科目 IDs: {TARGET_SUBJECT_IDS}")
    print(f"  教師 IDs: {TEACHER_USER_IDS}")

    async with async_session() as session:
        # 対象科目に紐づくコースを取得
        courses = await get_courses_by_subject_ids(session, TARGET_SUBJECT_IDS)

        if not courses:
            print("\n⚠️ 対象のコースが見つかりませんでした。")
            print("  先に add_subject.py と add_course.py を実行してください。")
            await engine.dispose()
            sys.exit(1)

        print(f"\n📋 対象コース一覧 ({len(courses)} 件):")
        for c in courses:
            print(f"  - [科目: {c['subject_name']}] {c['course_name']} (ID: {c['id']})")

        # 権限を付与
        course_ids = [c["id"] for c in courses]
        count = await add_permissions(session, course_ids, TEACHER_USER_IDS)

        await session.commit()

    await engine.dispose()

    print(f"\n✅ 権限付与完了!")
    print(f"   コース: {len(courses)} 件")
    print(f"   教師: {len(TEACHER_USER_IDS)} 人")
    print(f"   権限レコード: {count} 件 (upsert)")


if __name__ == "__main__":
    asyncio.run(seed_permissions())
