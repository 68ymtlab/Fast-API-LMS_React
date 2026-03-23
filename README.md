# Fast-API-LMS_React

React版 LMS（Learning Management System）

## セットアップ

### 1. 環境変数

```bash
# db/.env を作成（db/.env.example をコピー）
cp db/.env.example db/.env
# POSTGRES_PASSWORD を設定

# backend/.env を作成（backend/.env.example をコピー）
cp backend/.env.example backend/.env
# DATABASE_URL のパスワードを db/.env の POSTGRES_PASSWORD に合わせる
```

### 2. 起動

```bash
docker compose up -d
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- DB: localhost:5432 (PostgreSQL)

### 3. 初回ユーザー投入（roles は DB 起動時に自動作成、users は手動）

```bash
docker compose exec backend poetry run python scripts/seed_users.py
```

全ユーザーのパスワードは `password`。ログイン後は要変更。

### 4. DB リセット

```bash
./scripts/reset.sh   # Linux/macOS
scripts\reset.bat    # Windows
```

## 開発環境: フロントエンド起動

`frontend` サービスはシェル起動なので、Next.js 開発サーバーは手動で起動します。

```bash
docker compose exec frontend sh -lc "npm ci"
docker compose exec frontend sh -lc "npm run dev"
```

## users テーブルのシード投入

DB 初期化直後などで `users` が空の場合は、以下を実行してください。

```bash
docker compose exec backend poetry run python scripts/seed_users.py
```

## 本番デプロイ

本番は以下でデプロイします（`docker-compose.yml` + `docker-compose.prod.yml` を使用）。

```bash
./scripts/deploy.sh
```

本番向け `frontend` は `docker-compose.prod.yml` で以下を上書きしています。

- `NODE_ENV=production`
- `NPM_CONFIG_PRODUCTION=true`

開発向け `docker-compose.yml` 側では以下です。

- `NODE_ENV=development`
- `NPM_CONFIG_PRODUCTION=false`

これにより、開発では依存不足（`typescript`/`react-dom/client` など）を防ぎつつ、本番へは開発設定が混入しません。

## トラブルシュート（依存関係エラー）

以下のような症状が出た場合の復旧手順です。

- `Module not found: Can't resolve 'react-dom/client'`
- `It looks like you're trying to use TypeScript...`
- `EvalError: Code generation from strings disallowed for this context`

### 1) コンテナとボリュームをリセット

```bash
docker compose down -v --remove-orphans
docker compose up --build -d
```

### 2) フロントエンド依存関係をクリーン再インストール

```bash
docker compose exec frontend sh -lc "rm -rf /app/.next && npm ci"
```

### 3) 動作確認

```bash
docker compose exec frontend sh -lc "npm run dev"
```

必要に応じて別ターミナルでログ確認:

```bash
docker compose logs -f frontend backend db
```
