"""
Seed subjects.

Usage:
  docker compose exec backend poetry run python scripts/add_subject.py
  # or from host (backend dir):
  cd backend && poetry run python scripts/add_subject.py
"""
import asyncio
import os
import sys
from pathlib import Path

# backend を path に追加
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

SEMESTERS = [
    {"name": "後期", "sort_order": 2},
]

SUBJECTS = [
    {
        "id": 1,
        "subject_name": "サンプル",
        "academic_year": 2024,
        "semester_name": "後期",
        "created_by_user_id": 1,
        "is_active": True,
    },
    {
        "id": 2,
        "subject_name": "線形代数学",
        "academic_year": 2024,
        "semester_name": "後期",
        "created_by_user_id": 1,
        "is_active": True,
    },
    {
        "id": 3,
        "subject_name": "工学のための数理工Ⅱ（再履修）",
        "academic_year": 2022,
        "semester_name": "後期",
        "created_by_user_id": 1,
        "is_active": True,
    },
]


async def get_or_create_semester(session: AsyncSession, name: str, sort_order: int | None) -> int:
    result = await session.execute(
        text("SELECT id FROM semesters WHERE name = :name ORDER BY id LIMIT 1"),
        {"name": name},
    )
    row = result.first()
    if row:
        return int(row[0])

    result = await session.execute(
        text(
            """
            INSERT INTO semesters (name, sort_order)
            VALUES (:name, :sort_order)
            RETURNING id
            """
        ),
        {"name": name, "sort_order": sort_order},
    )
    return int(result.scalar_one())


async def upsert_subjects(session: AsyncSession) -> int:
    semester_ids: dict[str, int] = {}
    for s in SEMESTERS:
        semester_ids[s["name"]] = await get_or_create_semester(
            session, s["name"], s.get("sort_order")
        )

    inserted = 0
    for data in SUBJECTS:
        semester_id = semester_ids[data["semester_name"]]
        exists = await session.execute(
            text(
                """
                SELECT id FROM subjects
                WHERE subject_name = :subject_name
                  AND academic_year = :academic_year
                  AND semester_id = :semester_id
                ORDER BY id
                LIMIT 1
                """
            ),
            {
                "subject_name": data["subject_name"],
                "academic_year": data["academic_year"],
                "semester_id": semester_id,
            },
        )
        if exists.first():
            continue

        await session.execute(
            text(
                """
                INSERT INTO subjects (
                    id,
                    subject_name,
                    academic_year,
                    semester_id,
                    is_active,
                    created_by_user_id
                )
                VALUES (
                    :id,
                    :subject_name,
                    :academic_year,
                    :semester_id,
                    :is_active,
                    :created_by_user_id
                )
                """
            ),
            {
                "id": data.get("id"),
                "subject_name": data["subject_name"],
                "academic_year": data["academic_year"],
                "semester_id": semester_id,
                "is_active": data.get("is_active", True),
                "created_by_user_id": data.get("created_by_user_id"),
            },
        )
        inserted += 1

    return inserted


async def seed_subjects() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set. Check backend/.env")
        sys.exit(1)

    engine = create_async_engine(url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        inserted = await upsert_subjects(session)
        await session.commit()

    await engine.dispose()
    print(f"✅ Seeded {inserted} subjects.")


if __name__ == "__main__":
    asyncio.run(seed_subjects())
