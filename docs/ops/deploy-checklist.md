# デプロイチェックリスト（AI チューター入りの最新版を本番に出す）

**すでに運用中の本番**に、AI チューターを含む最新版を出すときに、人がやること。上から順に。
詳細な手順は [runbook-deploy.md](runbook-deploy.md)、バックアップは [backup-restore.md](backup-restore.md)、
チューター固有の準備は [AI チューター引き継ぎ](../ai-tutor/ai-tutor-handover.md)。

> **原則: 本番のデータは「消えないこと」が最優先。迷ったら止めて、先にバックアップ。**
> 「本番サーバーで」と書いていない項目は開発 PC で行う。

---

## フェーズ 0: 開発 PC（コードを出せる状態にする）

- [ ] 今回の変更（`scripts/`・`docs/`・`backend/Dockerfile`・`.github/` など）を確認してコミットし、PR を作る
- [ ] **`backend/poetry.lock` と `tutor/constraints.txt` を必ずコミットに含める。** これが無いと本番のビルドで依存が最新に解決され直し、
      例えば SQLAlchemy 2.1 が入って **backend が起動しない**（`greenlet` が無い ImportError）。`backend/Dockerfile` を変えると本番でも再解決される
- [ ] CI（`.github/workflows/ci.yml`）が緑になることを PR で確認する（`scripts` / `compose` / `tutor` / `backend` / `frontend` / `e2e` の6ジョブ）
- [ ] PR をレビューして、本番がデプロイに使うブランチにマージする

## フェーズ 1: 本番サーバーの現状を調べる（読むだけ・何も変えない）

### 最初に必ず: 本番の backend の「実際の」構成を確認する

```bash
./scripts/inspect_prod.sh                # 読み取り専用。WARN の内容を確認し、結果を共有する
```

**背景**: これまでの `docker-compose.prod.yml` は、開発用の設定を打ち消せていなかった（compose の `volumes` は「上書き」ではなく「マージ」される）。
そのため**現在の本番の backend は、`--reload`・ホストの `./backend` の bind mount・`.venv` の匿名ボリュームで動いているはず**（`inspect_prod.sh` で確認する）:

- ファイルが変わるとその場で再起動する → **`git pull` した瞬間に、新しいコードが本番に入る**
- `.venv` が匿名ボリュームで、再デプロイしても古いまま → tutor 版のコードが使う `httpx` が `.venv` に無ければ、**`git pull` の直後に backend が起動しなくなる**

**今回のデプロイで、本番用の構成に切り替わる**（修正済み。`deploy.sh` と CI が検査する）。切り替わると変わること:

| 項目 | これまで（開発用の設定のまま） | 切り替え後（本番用） |
|---|---|---|
| コードの出どころ | ホストの `./backend`（bind mount） | イメージの中（ビルドしたもの） |
| コードの反映 | `git pull` だけで反映される | **`deploy.sh`（再ビルド）が必要**。`git pull` だけでは変わらない |
| 起動 | `--reload`（ファイル監視・1プロセス） | `--reload` なし・**ワーカー4**（`WEB_CONCURRENCY`） |
| ライブラリ（`.venv`） | 匿名ボリューム（古いまま残る） | イメージの中（`poetry.lock` どおり） |
| 旧形式の画像（`./static/...`） | ホストの `backend/static/images/` が見える | **`deploy.sh` が uploads ボリュームへ自動コピー**（上書きしない・元は消さない） |
| `backend/.env` | ホストのファイルが見える | イメージに入らない。`env_file` で渡る（動作は変わらない） |

- [ ] `inspect_prod.sh` の「旧形式の画像」の件数を控える（0 件なら移行は不要）
- [ ] **切り替えの瞬間の注意**: 稼働中の backend はまだ旧構成なので、`git pull` した時点で新しいコードが `--reload` で読み込まれる。
      `.venv` に `httpx` が無ければその瞬間から API が止まり、`deploy.sh` が backend を作り直すまで続く（数分）。
      **`git pull` と `deploy.sh` は、授業時間外に続けて実行する**
- [ ] `deploy.sh` は `--renew-anon-volumes` で古い `.venv` の匿名ボリュームを捨てる（DB・アップロードの名前付きボリュームは消えない）

```bash
cd /path/to/Fast-API-LMS_React                  # 本番のリポジトリ

git log -1 --oneline                             # ① 今の本番が動いているコミットを控える（ロールバック先）
docker compose version                           # ② v2.24 以上であること（!reset / !override を使うため）
docker ps --format 'table {{.Names}}\t{{.Status}}'          # ③ 稼働中のコンテナ
docker inspect lms-db --format '{{range .Mounts}}{{.Type}} {{.Name}} -> {{.Destination}}{{println}}{{end}}'
                                                 # ④ DB のボリューム名。fast-api-lms_react_postgres-data であること
docker volume ls                                 # ⑤ *_postgres-data / *_uploads-data が他にもあれば把握する
df -h .                                          # ⑥ ディスクの空き（バックアップと再ビルドに数GB）
```

```bash
docker exec lms-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select version()"'   # ⑦ PostgreSQL 16.x であること
```

- [ ] ⑦ DB が PostgreSQL **16** である（compose は 2026-02-10 以降 `postgres:16-alpine`。別のメジャーバージョンで作ったデータは 16 のコンテナでは起動しない）
- [ ] ① のコミットを手元にメモした
- [ ] ② Compose のバージョンが足りている
- [ ] ④ のボリューム名が `fast-api-lms_react_postgres-data` である（違う場合は **ここで止めて** 原因を調べる。`deploy.sh` も止まる）
- [ ] ⑥ 空きが十分ある

## フェーズ 2: バックアップを取って、復元できると確かめる

```bash
./scripts/backup.sh                              # DB とアップロードを db/backups/auto-* に保存
./scripts/restore_test.sh                        # 使い捨てコンテナに復元して中身を確認 → [OK] 復元テスト成功
```

- [ ] `backup.sh` が成功した（デプロイ後は `backup` コンテナが自動で取るが、デプロイ前に手動でも1つ取っておく）
- [ ] `restore_test.sh` が `[OK] 復元テスト成功` になった（users 件数が妥当）
- [ ] `db/backups/auto-*` を**別のマシンにコピーした**（任意。手動の `scp` / `rsync` でよい。自動化は後回しにしてよい）
  ```bash
  scp db/backups/auto-db-*.sql.gz db/backups/auto-uploads-*.tar.gz <別マシン>:<保存先>/
  ```

## フェーズ 3: 本番 DB のスキーマが新しいコードと合っているか

```bash
./scripts/schema_diff.sh
```

- [ ] `[OK]` なら進む（以前は `init` サービスが `students` の列を毎回補っていたが廃止した。その列も `schema_diff` の対象なので、`[OK]` なら問題ない）
- [ ] `[DIFF]` なら、`+` の行（新コードにあって本番DBに無い列・テーブル・制約）を確認し、**デプロイ前に** 該当する `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` などを本番DBに適用する
      （`db/init/*.sql` は空のDBの初回起動時にしか動かない）。判断に迷う差分は適用せずに相談する

### （参考）public スキーマの履歴

`db/init` の public スキーマ系 SQL の変更は 2026-02-25（`01`・`02-assignments` など）が最後で、2026-04-14 の `05-soft-delete-email-migration.sql` は
スキーマではなく**データの修正**（論理削除済みユーザーのメールを退避して再登録を可能にする）。本番を 2026-02-28 以降に作っていれば、
public スキーマは基本的に今のコードと一致しているはず（`schema_diff.sh` で確かめる）。

- [ ] 論理削除済みユーザーのメールが退避されていないか確認し、必要なら `05` を適用する（何度流しても安全な SQL）:
  ```bash
  docker exec lms-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from users where deleted_at is not null and email not like '"'"'deleted+%@example.invalid'"'"'"'
  # 0 より大きければ:
  docker exec -i lms-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/init/05-soft-delete-email-migration.sql
  ```

## フェーズ 4: AI チューターの準備（本番サーバー）

**tutor のテーブル（`tutor` スキーマ）は、手作業のSQLなしで既存の本番DBに入る。** 流れ:
1. `./scripts/setup_tutor_secrets.sh`（人が1回実行）… DB に専用ロール `tutor_app` と空の `tutor` スキーマを作り、`tutor/.env` の `TUTOR_DATABASE_URL` を設定する
2. `./scripts/deploy.sh` … tutor コンテナが起動時に、`tutor_app` として `CREATE TABLE IF NOT EXISTS ...` で全テーブル・ビューを作る（public スキーマには触らない）

`deploy.sh` は、手順 1 が済んでいない（`TUTOR_DATABASE_URL` / `TUTOR_SERVICE_TOKEN` が空）と中止する。

詳細は [AI チューター引き継ぎ B](../ai-tutor/ai-tutor-handover.md#b-本番に出す前1-回だけ)。

- [ ] **知識ベース**: `tutor/data/stage4/`（`embeddings.json`・`knowledge_graph.json`・`qdrant_data/`）は **git で管理している**ので、`git pull` で揃う（手でコピーする必要はない）。`ls -la tutor/data/stage4/` で3つあることを確認する
- [ ] **`tutor/.env`**: `cp tutor/.env.example tutor/.env` して `ANTHROPIC_AUTH_TOKEN`・`VLLM_MANAGER_TOKEN` などを本番値にする（`CHANGE_ME` を残さない）
- [ ] **学内 LLM に届くか**（本番サーバーから）:
  ```bash
  curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://hinton.kanazawa-it.ac.jp:14000/v1/models   # 応答が返ること（401 でも到達はOK）
  curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://hinton.kanazawa-it.ac.jp:18000/            # 同上
  ```
- [ ] **hinton 側で埋め込み・リランカーが起動している**ことを確認（止まっていると tutor は起動しても回答でエラーになる）
- [ ] **共有シークレットと専用 DB ロール**（DB コンテナが動いている状態で）:
  ```bash
  ./scripts/setup_tutor_secrets.sh
  ```
- [ ] 全ての `.env`（`backend/.env`・`frontend/server/.env`・`db/.env`・`tutor/.env`）に `CHANGE_ME` が残っていない。
      残っていると `deploy.sh` が項目名を表示して**中止する**（確認だけなら `grep -n CHANGE_ME backend/.env frontend/server/.env db/.env tutor/.env`）
- [ ] `frontend/server/.env` の `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_APP_BASE_URL` が本番の URL になっている
      （これらはビルド時にバンドルへ焼き込まれる。`deploy.sh` が `--env-file frontend/server/.env` でビルドに渡す。空だとビルドが失敗する）
- [ ] 学生の質問がチューターの会話ログとして DB に保存されることを、利用者（学生・教員）に伝える必要があるか確認した

## フェーズ 5: デプロイして確認

```bash
git pull                                         # ⚠ backend が --reload の場合、この瞬間に新しいコードが入る（フェーズ 1 参照）。直後に deploy.sh を実行する
./scripts/deploy.sh
```

- [ ] ログに `[OK] DB バックアップ: db/backups/db-....sql.gz` が出た
      （`バックアップはスキップ` と出たら、本番では異常。デプロイを止めて原因を調べる）
- [ ] `./scripts/inspect_prod.sh` で、backend が「`--reload` ではない」「bind mount なし」「`.venv` は匿名ボリュームではない」「httpx / sqlalchemy / greenlet などを import できる」と、すべて OK になっている
- [ ] `ls -lt db/backups/periodic-db-*.sql.gz | head -1` で、**定期バックアップが取れている**（デプロイ直後に backup コンテナが1つ取る。`deploy.sh` の最後にも表示される）
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` で全て healthy（backup も healthy）（以前のデプロイで作られた `init` の停止コンテナが残っていても無害。不要なら `docker rm <コンテナ名>`）
- [ ] **backend が起動している**（`docker compose ... logs --tail=20 backend` に `Application startup complete` が出る。`ImportError` が出ていたら依存の解決違い）
- [ ] **NO_PROXY が効いている**:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend env | grep -i proxy
  # NO_PROXY=tutor,db,backend,frontend,nginx,localhost,127.0.0.1 が含まれること
  ```
- [ ] ブラウザで確認（本番 URL）:
  - [ ] 既存ユーザーでログインでき、既存のコース・成績・提出物が見える
  - [ ] AI チューターに質問すると回答が返る（初回は知識ベース読み込みで数十秒かかることがある）
  - [ ] 教員で `/t/tutor` に質問が表示される
- [ ] 問題があれば [ロールバック](runbook-deploy.md#4-ロールバック)

## フェーズ 6: 運用に乗せる（デプロイ後すぐ）

詳細は [backup-restore.md](backup-restore.md)。

- [ ] **復元できることを確かめる**: `./scripts/restore_test.sh`（最新のバックアップを、使い捨てのDBに復元して中身を確認する）
- [ ] `./scripts/inspect_prod.sh` の「誤ってコンテナ・ボリュームを消しても、データが残る備え」が、すべて OK
- [ ] **週1回**: `./scripts/inspect_prod.sh` と `docker compose ps`（backup が healthy か）を見る。unhealthy ならバックアップが取れていない
- [ ] （任意・後回しでよい）別マシンへの自動コピー（[backup-restore.md §3](backup-restore.md#3-別のマシンに保管する)）。サーバーのディスク故障・喪失への備え。
      それまでの間、`db/backups/` をときどき別のマシンへ手動でコピーするか、`db/backups` を別のディスクへのシンボリックリンクにする
- [ ] 本番サーバーで `docker compose down -v` / `scripts/reset.sh` を実行しないことをチームで共有する

## 余裕ができたら

- スキーマ変更用のマイグレーション運用（alembic など）を決める
- Docker のログローテーションと、簡単な死活監視
- HTTPS（TLS）を導入するか、学内プロキシが担う前提を文書化する
