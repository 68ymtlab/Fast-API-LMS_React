"""
Seed users into the database.
Runs after DB is up. Uses SecurityManager.hash_password for password hashing.

Usage:
  docker compose exec backend poetry run python scripts/seed_users.py
  # or from host (backend dir):
  cd backend && poetry run python scripts/seed_users.py
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

from api.core.password import SecurityManager


# m002_add_user のデータを元にした seed（role_id: 1=admin, 2=teacher, 3=student, 4=test）
# パスワードはすべて "password" に統一（開発用。要変更は /api/users/me/password で可能）
SEED_PASSWORD = "password"

USERS = [
    # 管理者 (role_id=1)
    {"id": 1, "username": "68yamtlab", "email": "68ymtlab@admin.com", "role_id": 1},
    {"id": 2, "username": "干場", "email": "c6400996@st.kanazawa-it.ac.jp", "role_id": 1},
    {"id": 3, "username": "荻原", "email": "c1119233@planet.kanazawa-it.ac.jp", "role_id": 1},
    {"id": 4, "username": "貝原", "email": "c1117622@planet.kanazawa-it.ac.jp", "role_id": 1},
    {"id": 13, "username": "髙橋", "email": "c1242627@st.kanazawa-it.ac.jp", "role_id": 1},
    {"id": 14, "username": "岡田", "email": "c1443642@st.kanazawa-it.ac.jp", "role_id": 1},
    # 教師 (role_id=2)
    {"id": 5, "username": "ohno", "email": "ohno@ohno.com", "role_id": 2},
    {"id": 6, "username": "yanagi", "email": "yanagi@yanagi.com", "role_id": 2},
    {"id": 7, "username": "ogasawara", "email": "ogasawara@ogasawara.com", "role_id": 2},
    {"id": 8, "username": "nishioka", "email": "knisi@neptune.kanazawa-it.ac.jp", "role_id": 2},
    {"id": 10, "username": "kodama", "email": "kodaman1999@gmail.com", "role_id": 2},
    # 学生 (role_id=3)
    {"id": 9, "username": "okabayashi", "email": "okabayashi@okabayashi.com", "role_id": 3},
    {"id": 11, "username": "yamamoto", "email": "tyama@neptune.kanazawa-it.ac.jp", "role_id": 3},
    # テスト (role_id=4)
    {"id": 12, "username": "neo", "email": "neo@neo.com", "role_id": 4},
]


async def seed_users():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set. Check backend/.env")
        sys.exit(1)

    engine = create_async_engine(url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    hashed = SecurityManager.hash_password(SEED_PASSWORD)

    async with async_session() as session:
        for u in USERS:
            await session.execute(
                text("""
                    INSERT INTO users (id, username, display_name, email, password_hash, role_id, is_disabled)
                    VALUES (:id, :username, :username, :email, :password_hash, :role_id, false)
                    ON CONFLICT (email) DO NOTHING
                """),
                {
                    "id": u["id"],
                    "username": u["username"],
                    "email": u["email"],
                    "password_hash": hashed,
                    "role_id": u["role_id"],
                },
            )
        await session.commit()

        # シーケンスを更新（次回の INSERT で id が重複しないように）
        await session.execute(
            text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))")
        )
        await session.commit()

        # 既存DB互換: login_days カラムが無い場合は追加
        await session.execute(
            text(
                """
                ALTER TABLE students
                ADD COLUMN IF NOT EXISTS login_days INT DEFAULT 0 NOT NULL
                """
            )
        )
        # 既存DB互換: 学籍番号 / 名列番号カラムを追加
        await session.execute(
            text(
                """
                ALTER TABLE students
                ADD COLUMN IF NOT EXISTS student_number VARCHAR(64)
                """
            )
        )
        await session.execute(
            text(
                """
                ALTER TABLE students
                ADD COLUMN IF NOT EXISTS class_roster_number VARCHAR(64)
                """
            )
        )
        await session.commit()

        # 学生・テストユーザー用の students レコードを作成（role_id: 3=student, 4=test）
        student_user_ids = [u["id"] for u in USERS if u["role_id"] in (3, 4)]
        for user_id in student_user_ids:
            await session.execute(
                text("""
                    INSERT INTO students (user_id, grade, department, class_number, points, login_days)
                    VALUES (:user_id, NULL, NULL, NULL, 0, 0)
                    ON CONFLICT (user_id) DO NOTHING
                """),
                {"user_id": user_id},
            )
        await session.commit()

    await engine.dispose()
    print(f"✅ Seeded {len(USERS)} users. Password for all: {SEED_PASSWORD!r}")


if __name__ == "__main__":
    asyncio.run(seed_users())
