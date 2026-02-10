"""
Seed courses, course_content_permissions, and course_enrollments.

Usage:
  docker compose exec backend poetry run python api/migration/m005_add_course.py
  # or from host (backend dir):
  cd backend && poetry run python api/migration/m005_add_course.py
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

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from api.models.courses_model import Courses
from api.models import users_model
from api.models import subjects_model
from api.models import lessons_model
from api.models import exercises_model
from api.models import contents_model
from api.models import questions_model
from api.models import adaptive_model
from api.models import enum

COURSES = [
    {
        "subject_id": 1,
        "course_name": "Sample Course1",
        "description": None,
        "session_count": 1,
        "target_audience": None,
        "start_date_time": datetime.datetime(2026, 1, 1,0, 0, 0),
        "end_date_time": datetime.datetime(2027, 4, 1, 0, 0, 0),
        "is_active": True,
        "created_by_user_id": 2,
        "updated_by_user_id": None,
    },
    {
        "subject_id": 2,
        "course_name": "線形代数学-TEST",
        "description": None,
        "session_count": 15,
        "target_audience": None,
        "start_date_time": datetime.datetime(2026, 1, 1, 0, 0, 0),
        "end_date_time": datetime.datetime(2027, 4, 1, 0, 0, 0),
        "is_active": True,
        "created_by_user_id": 2,
        "updated_by_user_id": None,
    },
    {
        "subject_id": 3,
        "course_name": "工学のための数理工Ⅱ-TEST",
        "description": None,
        "session_count": 15,
        "target_audience": None,
        "start_date_time": datetime.datetime(2026, 1, 1, 0, 0, 0),
        "end_date_time": datetime.datetime(2027, 4, 1, 0, 0, 0),
        "is_active": True,
        "created_by_user_id": 2,
        "updated_by_user_id": None,
    },
    {
        "subject_id": 1,
        "course_name": "Sample Course1",
        "description": None,
        "session_count": 1,
        "target_audience": None,
        "start_date_time": datetime.datetime(2026, 1, 1, 0, 0, 0),
        "end_date_time": datetime.datetime(2027, 4, 1, 0, 0, 0),
        "is_active": True,
        "created_by_user_id": 3,
        "updated_by_user_id": None,
    },
]

PERMISSION_TEACHER_USER_ID = 6
PERMISSION_START = datetime.datetime(2026, 1, 1, 0, 0, 0)
PERMISSION_END = datetime.datetime(2027, 1, 1, 0, 0, 0)
PERMISSION_FLAGS = {
    "can_read_content": True,
    "can_update_content": True,
    "can_delete_content": True,
}

ENROLLMENT_USER_IDS = [9, 11, 12]


async def upsert_courses(session: AsyncSession) -> list[Courses]:
    results: list[Courses] = []
    for data in COURSES:
        stmt = select(Courses).where(
            Courses.subject_id == data["subject_id"],
            Courses.course_name == data["course_name"],
            Courses.session_count == data["session_count"],
            Courses.start_date_time == data["start_date_time"],
            Courses.end_date_time == data["end_date_time"],
            Courses.created_by_user_id == data["created_by_user_id"],
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing:
            results.append(existing)
            continue

        course = Courses(**data)
        session.add(course)
        await session.flush()
        await session.refresh(course)
        results.append(course)
    return results


async def add_permissions(session: AsyncSession, courses: list[Courses]) -> None:
    for course in courses:
        await session.execute(
            text(
                """
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
                ON CONFLICT (teacher_user_id, course_id) DO NOTHING
                """
            ),
            {
                "teacher_user_id": PERMISSION_TEACHER_USER_ID,
                "course_id": course.id,
                "start_date_time": PERMISSION_START,
                "end_date_time": PERMISSION_END,
                "can_read_content": PERMISSION_FLAGS["can_read_content"],
                "can_update_content": PERMISSION_FLAGS["can_update_content"],
                "can_delete_content": PERMISSION_FLAGS["can_delete_content"],
                "created_by_user_id": PERMISSION_TEACHER_USER_ID,
            },
        )


async def add_enrollments(session: AsyncSession, courses: list[Courses]) -> None:
    for course in courses:
        for user_id in ENROLLMENT_USER_IDS:
            await session.execute(
                text(
                    """
                    INSERT INTO course_enrollments (user_id, course_id)
                    VALUES (:user_id, :course_id)
                    ON CONFLICT (user_id, course_id) DO NOTHING
                    """
                ),
                {"user_id": user_id, "course_id": course.id},
            )


async def seed_courses() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set. Check backend/.env")
        sys.exit(1)

    engine = create_async_engine(url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        courses = await upsert_courses(session)
        await add_permissions(session, courses)
        await add_enrollments(session, courses)
        await session.commit()

    await engine.dispose()
    print(f"✅ Seeded courses: {len(courses)} / permissions for teacher {PERMISSION_TEACHER_USER_ID} / enrollments for users {ENROLLMENT_USER_IDS}")


if __name__ == "__main__":
    asyncio.run(seed_courses())
