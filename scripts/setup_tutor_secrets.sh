#!/usr/bin/env bash
# AI チューター（tutor サービス）の本番用シークレットを用意する。
#   1) backend ⇄ tutor の共有シークレット TUTOR_SERVICE_TOKEN（tutor/.env と backend/.env の両方に同じ値）
#   2) tutor スキーマ専用の DB ロール `tutor_app`（tutor スキーマだけ読み書き。public には触れない）
#      → tutor/.env の TUTOR_DATABASE_URL をそのロールに切り替える
#
# 使い方（db コンテナが起動している状態で）:
#   ./scripts/setup_tutor_secrets.sh            # 未設定のものだけ生成・設定（冪等）
#   ./scripts/setup_tutor_secrets.sh --rotate   # TUTOR_SERVICE_TOKEN と DB パスワードを再生成
#
# 反映: docker compose up -d backend tutor   （restart では env_file が再読込されないので up -d）
set -euo pipefail
cd "$(dirname "$0")/.."
ROTATE=0; [[ "${1:-}" == "--rotate" ]] && ROTATE=1
TUTOR_ENV=tutor/.env; BACKEND_ENV=backend/.env
[[ -f "$TUTOR_ENV" ]] || cp tutor/.env.example "$TUTOR_ENV"
[[ -f "$BACKEND_ENV" ]] || { echo "backend/.env がありません（backend/.env.example からコピーしてください）" >&2; exit 1; }

set_kv() { # file key value
  local f="$1" k="$2" v="$3"
  if grep -qE "^${k}=" "$f"; then sed -i.bak -E "s|^${k}=.*|${k}=${v}|" "$f" && rm -f "$f.bak"; else printf "\n%s=%s\n" "$k" "$v" >> "$f"; fi
}
get_kv() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- || true; }

# ---- 1) 共有シークレット ----
TOKEN="$(get_kv "$TUTOR_ENV" TUTOR_SERVICE_TOKEN)"
if [[ -z "$TOKEN" || "$ROTATE" -eq 1 ]]; then
  TOKEN="$(openssl rand -hex 32)"
  echo "TUTOR_SERVICE_TOKEN を生成しました"
fi
set_kv "$TUTOR_ENV" TUTOR_SERVICE_TOKEN "$TOKEN"
set_kv "$BACKEND_ENV" TUTOR_SERVICE_TOKEN "$TOKEN"

# ---- 2) DB ロール（tutor スキーマ専用） ----
DBURL="$(get_kv "$BACKEND_ENV" DATABASE_URL)"          # postgresql+asyncpg://postgres:PW@db:5432/lms
DBNAME="${DBURL##*/}"; DBNAME="${DBNAME%%\?*}"
PG_PASS="$(get_kv "$TUTOR_ENV" TUTOR_DB_PASSWORD)"
if [[ -z "$PG_PASS" || "$ROTATE" -eq 1 ]]; then
  PG_PASS="$(openssl rand -hex 24)"
  echo "tutor_app ロールのパスワードを生成しました"
fi
set_kv "$TUTOR_ENV" TUTOR_DB_PASSWORD "$PG_PASS"
# superuser（postgres）で実行。db コンテナ内の psql を使う
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d "$DBNAME" -v pw="$PG_PASS" -v dbname="$DBNAME" <<'SQL'
-- psql 変数は DO ブロック内では展開されないので \gexec で実行する
SELECT format('CREATE ROLE tutor_app LOGIN PASSWORD %L', :'pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tutor_app') \gexec
SELECT format('ALTER ROLE tutor_app WITH LOGIN PASSWORD %L', :'pw') \gexec
CREATE SCHEMA IF NOT EXISTS tutor;
GRANT CONNECT ON DATABASE :"dbname" TO tutor_app;
GRANT USAGE, CREATE ON SCHEMA tutor TO tutor_app;
GRANT ALL ON ALL TABLES IN SCHEMA tutor TO tutor_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tutor TO tutor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tutor GRANT ALL ON TABLES TO tutor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tutor GRANT ALL ON SEQUENCES TO tutor_app;
-- 既存オブジェクトの所有者を tutor_app に（起動時の CREATE OR REPLACE VIEW / ALTER TABLE ADD COLUMN が通るように）
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='tutor' LOOP EXECUTE format('ALTER TABLE tutor.%I OWNER TO tutor_app', r.tablename); END LOOP;
  FOR r IN SELECT viewname  FROM pg_views  WHERE schemaname='tutor' LOOP EXECUTE format('ALTER VIEW tutor.%I OWNER TO tutor_app',  r.viewname);  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='tutor' LOOP EXECUTE format('ALTER SEQUENCE tutor.%I OWNER TO tutor_app', r.sequencename); END LOOP;
END $$;
-- public は一切触らせない（既定の PUBLIC 権限も外す）
REVOKE ALL ON SCHEMA public FROM tutor_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM tutor_app;
SQL
set_kv "$TUTOR_ENV" TUTOR_DATABASE_URL "postgresql://tutor_app:${PG_PASS}@db:5432/${DBNAME}"
echo
echo "設定しました:"
echo "  tutor/.env   : TUTOR_SERVICE_TOKEN, TUTOR_DB_PASSWORD, TUTOR_DATABASE_URL (tutor_app)"
echo "  backend/.env : TUTOR_SERVICE_TOKEN"
echo "反映: docker compose up -d backend tutor"
