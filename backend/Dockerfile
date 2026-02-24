# python slimのイメージをダウンロード
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1

WORKDIR /src/backend

# pipを使ってpoetryをインストール
RUN pip install poetry

# poetryの定義ファイルをコピー (存在する場合)
COPY pyproject.toml poetry.lock* ./

# poetryでライブラリをインストール (pyproject.tomlが既にある場合)
RUN poetry config virtualenvs.in-project true
RUN if [ -f pyproject.toml ]; then poetry install; fi

COPY . .

# エントリーポイントを設定（シェル形式で直接記述）
CMD ["sh", "-c", "echo \"Running database seeds...\" && poetry run python scripts/seed_users.py && poetry run python scripts/add_subject.py && poetry run python scripts/add_course.py && echo \"Starting application...\" && poetry run uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload"]