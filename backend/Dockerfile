# python slimのイメージをダウンロード
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
# 上のプロキシはビルド時（pip / poetry）の外向き通信用。実行時の内部通信（tutor / db など）まで
# 学内プロキシに流れないよう、コンテナ間のホスト名は NO_PROXY で直接接続にする。
# （httpx は HTTP_PROXY 環境変数を自動で使うため、無いと backend → tutor が 502 になる）
ENV NO_PROXY=tutor,db,backend,frontend,nginx,localhost,127.0.0.1
ENV no_proxy=tutor,db,backend,frontend,nginx,localhost,127.0.0.1

WORKDIR /src/backend

# pipを使ってpoetryをインストール
RUN pip install poetry

# poetryの定義ファイルをコピー (存在する場合)
COPY pyproject.toml poetry.lock* ./

# poetryでライブラリをインストール (pyproject.tomlが既にある場合)
RUN poetry config virtualenvs.in-project true
RUN if [ -f pyproject.toml ]; then poetry install; fi

COPY . .

# エントリーポイント（本番: --reload なし。ワーカー数は WEB_CONCURRENCY で決まる）
# - uvicorn は --workers を省略すると環境変数 WEB_CONCURRENCY を使う。既定は 4（本番）。
#   環境ごとに変えたいときは backend/.env などで WEB_CONCURRENCY を設定する
#   （ログイン試行制限のカウンタはワーカーごとなので、1 にすると上限が正確になる）
# - 開発（docker-compose.yml）は command で --reload 付きに置き換える（その場合ワーカー数は無視される）
# - シード処理は本番では自動実行しない（docs/ops/runbook-deploy.md の「初回セットアップ」）
ENV WEB_CONCURRENCY=4
CMD ["poetry", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
