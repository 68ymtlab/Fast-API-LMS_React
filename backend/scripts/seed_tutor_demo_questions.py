"""AI チューターの「類似問題」デモ用に、線形代数の演習問題（numeric 型）を投入する。

  docker compose exec backend poetry run python scripts/seed_tutor_demo_questions.py
  docker compose exec backend poetry run python scripts/seed_tutor_demo_questions.py --remove   # 取り消し

- 既存の questions と同じ形式（content_data = {question, answers, tolerance, hint}）
- 数式の行区切りは LMS の流儀（Markdown を通るので `\\\\` と二重化）で保存する
- タイトルは「線形代数 デモ …」で始める（再実行しても重複しない／--remove で一括削除）
- course_id=3（線形代数）に演習セット「線形代数 演習（AIチューター デモ）」を作り、全問を入れる
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.chdir(Path(__file__).resolve().parent.parent)

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

PREFIX = "線形代数 デモ"
COURSE_ID = int(os.environ.get("DEMO_COURSE_ID", "3"))
SET_TITLE = "線形代数 演習（AIチューター デモ）"

# 各問題に付けるタグ（tags / question_tags）。タイトルの先頭語（単位行列・行列式 …）を単元タグにする
TAGS_COMMON = ["線形代数"]

QUESTIONS = [
    ("単位行列 Q1", "# Q1 $E$ を2次の単位行列、$A=\\begin{pmatrix}1&2\\\\\\\\3&4\\end{pmatrix}$ とする。$AE$ の $(1,2)$ 成分を求めよ。(半角で入力)", 2, "単位行列を掛けても行列は変わらない（$AE=A$）。"),
    ("単位行列 Q2", "# Q2 3次の単位行列 $E_3$ の対角成分の和（トレース）を求めよ。(半角で入力)", 3, "対角成分はすべて 1。"),
    ("行列式 Q1", "# Q1 行列 $\\begin{pmatrix}2&1\\\\\\\\3&4\\end{pmatrix}$ の行列式を求めよ。(半角で入力)", 5, "$ad-bc$ を計算する。"),
    ("行列式 Q2", "# Q2 行列 $\\begin{pmatrix}1&2&0\\\\\\\\0&3&0\\\\\\\\0&0&4\\end{pmatrix}$ の行列式を求めよ。(半角で入力)", 12, "上三角行列の行列式は対角成分の積。"),
    ("逆行列 Q1", "# Q1 行列 $\\begin{pmatrix}2&1\\\\\\\\1&1\\end{pmatrix}$ の逆行列の $(1,1)$ 成分を求めよ。(半角で入力)", 1, "2次の逆行列の公式 $\\frac{1}{ad-bc}\\begin{pmatrix}d&-b\\\\\\\\-c&a\\end{pmatrix}$。"),
    ("固有値 Q1", "# Q1 行列 $\\begin{pmatrix}2&0\\\\\\\\0&3\\end{pmatrix}$ の固有値のうち大きい方を求めよ。(半角で入力)", 3, "対角行列の固有値は対角成分。"),
    ("固有値 Q2", "# Q2 行列 $\\begin{pmatrix}2&1\\\\\\\\1&2\\end{pmatrix}$ の固有値の和を求めよ。(半角で入力)", 4, "固有値の和はトレースに等しい。"),
    ("行列の積 Q1", "# Q1 $\\begin{pmatrix}1&2\\\\\\\\3&4\\end{pmatrix}\\begin{pmatrix}1\\\\\\\\1\\end{pmatrix}$ の第1成分を求めよ。(半角で入力)", 3, "行と列の対応する成分の積の和。"),
    ("内積 Q1", "# Q1 ベクトル $(1,2,3)$ と $(4,5,6)$ の内積を求めよ。(半角で入力)", 32, "$1\\cdot4+2\\cdot5+3\\cdot6$。"),
    ("階数 Q1", "# Q1 行列 $\\begin{pmatrix}1&2\\\\\\\\2&4\\end{pmatrix}$ の階数（rank）を求めよ。(半角で入力)", 1, "2行目は1行目の2倍。"),
    ("転置行列 Q1", "# Q1 行列 $\\begin{pmatrix}1&2\\\\\\\\3&4\\end{pmatrix}$ の転置行列の $(1,2)$ 成分を求めよ。(半角で入力)", 3, "転置は行と列を入れ替える。"),
    ("一次独立 Q1", "# Q1 ベクトル $(1,0)$, $(0,1)$, $(1,1)$ のうち、一次独立なベクトルの最大個数を求めよ。(半角で入力)", 2, "平面の次元は 2。"),
]


async def main(remove: bool) -> None:
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as conn:
        if remove:
            await conn.execute(text("DELETE FROM exercise_sets WHERE title = :t"), {"t": SET_TITLE})
            r = await conn.execute(text("DELETE FROM questions WHERE title LIKE :p"), {"p": PREFIX + "%"})
            # デモ問題にしか付いていないタグも片付ける
            await conn.execute(text("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM question_tags)"))
            print(f"removed {r.rowcount} questions, the demo exercise set, and orphan tags")
            return
        async def tag_id(name: str) -> int:
            slug = name  # 日本語名はそのまま slug に（既存データと同じく一意ならよい）
            row = (await conn.execute(text("SELECT id FROM tags WHERE name = :n"), {"n": name})).first()
            if row:
                return row[0]
            return (await conn.execute(text("INSERT INTO tags (name, slug) VALUES (:n, :s) RETURNING id"), {"n": name, "s": slug})).first()[0]

        ids = []
        for title, q, ans, hint in QUESTIONS:
            full = f"{PREFIX} {title}"
            row = (await conn.execute(text("SELECT id FROM questions WHERE title = :t"), {"t": full})).first()
            if row:
                qid = row[0]
            else:
                cd = {"question": q, "answers": [ans], "tolerance": 0, "hint": hint}
                qid = (await conn.execute(
                    text("INSERT INTO questions (title, question_type, difficulty, content_data, is_active) "
                         "VALUES (:t, 'numeric', 1, CAST(:cd AS jsonb), TRUE) RETURNING id"),
                    {"t": full, "cd": json.dumps(cd, ensure_ascii=False)},
                )).first()[0]
            ids.append(qid)
            unit = title.split(" ")[0]  # 例: 「単位行列 Q1」→「単位行列」
            for tname in TAGS_COMMON + [unit]:
                tid = await tag_id(tname)
                await conn.execute(text("INSERT INTO question_tags (question_id, tag_id) VALUES (:q, :t) ON CONFLICT DO NOTHING"), {"q": qid, "t": tid})
        exists = (await conn.execute(text("SELECT id FROM exercise_sets WHERE title = :t"), {"t": SET_TITLE})).first()
        if exists:
            await conn.execute(text("UPDATE exercise_sets SET question_ids = CAST(:q AS jsonb) WHERE id = :id"),
                               {"q": json.dumps(ids), "id": exists[0]})
        else:
            await conn.execute(
                text("INSERT INTO exercise_sets (title, description, course_id, question_ids) VALUES (:t, :d, :c, CAST(:q AS jsonb))"),
                {"t": SET_TITLE, "d": "AIチューターの「関連する演習問題」デモ用", "c": COURSE_ID, "q": json.dumps(ids)},
            )
        print(f"seeded {len(ids)} questions (ids={ids}) into exercise set '{SET_TITLE}' (course {COURSE_ID})")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(remove="--remove" in sys.argv))
