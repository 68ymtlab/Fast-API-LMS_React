# LMS AI Tutor Service
# build context は ./tutor（docker-compose.yml で指定）
FROM python:3.12-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEEPRAG_USE_VLLM_EMBED=1 \
    TUTOR_CORE_DIR=/app/core \
    TUTOR_STAGE4_DIR=/app/data/stage4 \
    TUTOR_PROD_CFG=/app/config/production_pipeline.json \
    TUTOR_HOST=0.0.0.0 \
    TUTOR_PORT=8765

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r /tmp/requirements.txt

COPY core/ /app/core/
COPY config/ /app/config/
COPY app/ /app/app/

# データ（embeddings.json / knowledge_graph.json / qdrant_data）は実行時に /app/data:ro でマウント
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8765/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
