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
