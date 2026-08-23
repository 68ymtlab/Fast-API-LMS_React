# 本番デプロイ手順書

本番環境（学内サーバー）へのデプロイと、データ（DB・提出ファイル）を守るための運用手順。

> **前提**
> - 本番環境と開発環境（各自の PC）は**別マシン**。この手順は本番サーバー上で実行する。
> - 本番の DB・アップロードは Docker の named volume（`*_postgres-data` / `*_uploads-data`）に保存される。
>   コンテナを作り直してもボリュームは消えない。
> - **`docker compose down -v` と `scripts/reset.sh` は全データを消す。本番では絶対に使わない。**

---

## 1. 初回セットアップ

```bash
# 1) リポジトリを取得
git clone <repo> && cd Fast-API-LMS_React

# 2) .env を3つ用意（example をコピーして本番値を設定）
cp backend/.env.prod.example        backend/.env
cp frontend/server/.env.prod.example frontend/server/.env
cp db/.env.prod.example             db/.env
```

`.env` で最低限やること:

- `db/.env` … `POSTGRES_PASSWORD` を本番値に
- `backend/.env` … `SECRET_KEY`・`DOCS_PASSWORD` を新規生成（[シークレット手順書](runbook-secret-rotation.md) 参照）、
  `DATABASE_URL` のパスワードを `POSTGRES_PASSWORD` と一致させる、`ALLOWED_ORIGINS` を本番URLに、`COOKIE_SECURE`（HTTPS なら True）
- `frontend/server/.env` … `NEXTAUTH_SECRET` を新規生成、`NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_APP_BASE_URL` / `NEXTAUTH_URL` を本番URLに、`INTERNAL_API_BASE_URL=http://backend:8000`

> `NEXT_PUBLIC_*` は**ビルド時にフロントのバンドルへ焼き込まれる**。値を変えたら
> フロントの再ビルド（`deploy.sh` は毎回 `--build` する）が必要。

`CHANGE_ME` が残っていると `deploy.sh` が警告する。すべて本番値に変えること。

---

## 2. 通常のデプロイ（データ保持）

```bash
./scripts/deploy.sh
```

このスクリプトが自動でやること:

1. `.env` 3ファイルの存在確認と `CHANGE_ME` チェック
2. **デプロイ前バックアップ**（DB にデータがある場合のみ）
   - DB: `db/backups/db-<日時>.sql.gz`
   - 提出ファイル・画像: `db/backups/uploads-<日時>.tar.gz`
   - バックアップに失敗したらデプロイを**中止**する
   - 最新 10 世代を残して古いものは自動削除（`KEEP_BACKUPS` で変更可）
3. ネットワーク設定のズレ検知（[4章](#4-ネットワーク設定を変えたとき)）
4. `docker compose ... up --build -d`（**`-v` は使わない**＝データ保持）
5. 起動状態の表示と復元コマンドの案内

初回（DB が空）やボリューム未作成時はバックアップをスキップする。

### オプション

```bash
KEEP_BACKUPS=30 ./scripts/deploy.sh   # バックアップを30世代残す
SKIP_BACKUP=1  ./scripts/deploy.sh    # バックアップを省略（非常時のみ・非推奨）
```

---

## 3. バックアップと復元

### 手動バックアップ（デプロイと無関係にいつでも）

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
. ./db/.env
# DB
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > db/backups/manual-$(date +%Y%m%d-%H%M%S).sql.gz
```

### DB の復元

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
. ./db/.env
gunzip -c db/backups/db-<日時>.sql.gz | $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

> 復元は既存データに**上書き**される。復元前に現在の状態も一度バックアップしておくと安全。
> スキーマから作り直したい場合は、先に空の DB を用意してから流し込む。

### 提出ファイル・画像の復元

```bash
# uploads ボリューム名を確認
docker volume ls | grep uploads-data
# 復元（例）
docker run --rm -v <uploads-volume名>:/data -v "$PWD/db/backups":/backup alpine \
  sh -c "cd /data && tar xzf /backup/uploads-<日時>.tar.gz"
```

---

## 4. ネットワーク設定を変えたとき

`docker-compose.prod.yml` は Docker 内部ネットワークのサブネットを固定している
（学内 Wi-Fi との衝突回避。詳細は [docker-network.md](docker-network.md)）。

Docker は**ネットワーク作成時にしか**この設定を読まない。既存ネットワークがあると
`deploy.sh`（＝`up`）だけでは反映されず、`deploy.sh` が警告を出す。反映するには:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down   # ← -v は絶対に付けない
./scripts/deploy.sh
```

`down`（`-v` なし）はコンテナとネットワークを消すが、named volume は残るのでデータは無事。

---

## 5. ロールバック

```bash
# 1) 直前のコードに戻す
git log --oneline -5
git checkout <戻したいコミット>

# 2) 再デプロイ（デプロイ前バックアップが自動で取られる）
./scripts/deploy.sh

# 3) データも戻す必要があれば 3章の復元手順で該当バックアップを流す
```

---

## 6. トラブルシュート

| 症状 | 対処 |
|---|---|
| `deploy.sh` が「DB が healthy になりませんでした」で止まる | `docker compose ... logs db` を確認。ディスク容量・`db/.env` のパスワード整合を確認 |
| バックアップで中止される | `db/.env` の `POSTGRES_USER`/`POSTGRES_DB` が実DBと一致しているか確認 |
| ログインできない／全員ログアウトされた | `SECRET_KEY` か `NEXTAUTH_SECRET` を変更した後は全員再ログインが必要（仕様）。[シークレット手順書](runbook-secret-rotation.md) |
| フロントが古いURLを叩く | `NEXT_PUBLIC_*` はビルド時に焼き込まれる。`.env` 修正後に `deploy.sh`（再ビルド）を実行 |
| ネットワークに繋がらない | [docker-network.md](docker-network.md) と本書4章 |

> **やってはいけないこと**: 本番で `docker compose down -v` / `scripts/reset.sh` /
> `docker volume rm *_postgres-data` を実行するとデータが消える。
