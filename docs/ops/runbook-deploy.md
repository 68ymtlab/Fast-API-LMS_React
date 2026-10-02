# 本番デプロイ手順書

本番環境（学内サーバー）へのデプロイ手順。初めて AI チューターを入れるデプロイは、先に [deploy-checklist.md](deploy-checklist.md) を上から順に実施する。
バックアップと復元は [backup-restore.md](backup-restore.md)。

> **前提**
> - 本番環境と開発環境（各自の PC）は**別マシン**。この手順は本番サーバー上で実行する。
> - 本番の DB・アップロードは Docker の named volume（`*_postgres-data` / `*_uploads-data`）に保存される。
>   コンテナを作り直してもボリュームは消えない。
> - **`docker compose down -v` と `scripts/reset.sh` は全データを消す。本番では絶対に使わない。**

---

## 1. 構成

```
ブラウザ → nginx(:4000) ─┬→ frontend (Next.js :3000)        … /（NextAuth は /api/auth/）
                         └→ backend  (FastAPI :8000)        … /api/*
                                 ├→ db     (PostgreSQL 16)
                                 └→ tutor  (AI チューター :8765, 内部のみ) → 学内 LLM / 埋め込み / リランカー
```

- 本番では db / backend / tutor / frontend のポートはホストに公開しない。公開するのは nginx の 4000 だけ。
- **本番の backend はイメージの中のコードで動く**（ホストの `./backend` は bind mount しない・`--reload` なし・ワーカーは `WEB_CONCURRENCY`、既定 4）。
  コードを変えたら `deploy.sh`（再ビルド）が必要で、`git pull` だけでは本番に反映されない。
  ワーカー数を変えるときは `backend/.env` に `WEB_CONCURRENCY=1` などを書いて `up -d --force-recreate backend`。
- **DB・アップロードのボリュームは external**（compose の管理外）。`docker compose down -v` でも消えず、無いときは空のDBを作らず `up` が失敗する。
  リポジトリ直下の `.env`（git 管理外。`deploy.sh` が作る）の `COMPOSE_FILE` で、`-f` なしの `docker compose` も本番用の設定を読む。
- **`backup` コンテナ**が、DB を4時間ごと・アップロードを1日ごとに、ホストの `db/backups/`（Docker のボリュームの外）へ自動で保存する。
  コンテナ・ボリュームを誤って消しても、データが残る。復旧は [backup-restore.md §0](backup-restore.md#0-コンテナやボリュームを誤って消してしまったとき最初に読む)。
- 本番の構成に開発用の設定が混ざっていないことは、`deploy.sh`（マージ後の設定を確認して中止する）と CI（`scripts/tests/check_prod_compose.py`）が検査する。
- tutor が落ちても LMS 本体は動く（backend は tutor に依存しない）。

## 2. 初回セットアップ

```bash
git clone <repo> && cd Fast-API-LMS_React

# .env を用意（example をコピーして本番値を設定）
cp backend/.env.prod.example         backend/.env
cp frontend/server/.env.prod.example frontend/server/.env
cp db/.env.prod.example              db/.env
cp tutor/.env.example                tutor/.env
```

最低限やること:

- `db/.env` … `POSTGRES_PASSWORD` を本番値に
- `backend/.env` … `SECRET_KEY`・`DOCS_PASSWORD` を新規生成（[シークレット手順書](runbook-secret-rotation.md)）、
  `DATABASE_URL` のパスワードを `POSTGRES_PASSWORD` と一致させる、`ALLOWED_ORIGINS` を本番URLに、`COOKIE_SECURE`（HTTPS なら True）
- `frontend/server/.env` … `NEXTAUTH_SECRET` を新規生成、`NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_APP_BASE_URL` / `NEXTAUTH_URL` を本番URLに、`INTERNAL_API_BASE_URL=http://backend:8000`
- `tutor/.env` … 手順は [AI チューター引き継ぎ](../ai-tutor/ai-tutor-handover.md) の B（`ANTHROPIC_AUTH_TOKEN` 等、`setup_tutor_secrets.sh`、知識ベースの同期）

> URL のポートは nginx の公開ポート（`docker-compose.prod.yml` の `4000`）に合わせる。`.env.prod.example` の `8080` は例。
> `NEXT_PUBLIC_*` は**ビルド時にフロントのバンドルへ焼き込まれる**。値を変えたらフロントの再ビルド（`deploy.sh` は毎回 `--build`）が必要。

`CHANGE_ME` が残っていると `deploy.sh` が警告する。すべて本番値に変えること。

**新規のDB（初回）だけ**、最初のユーザーを手動で投入する（`init` サービスは廃止したので、デプロイでは自動投入されない）:

```bash
./scripts/seed_users.sh            # backend/scripts/seed_users.py を実行。全員のパスワードは "password" なので、必ず変更する
```

既に運用中の本番DBでは実行しない。

## 3. 通常のデプロイ（データ保持）

### 3.1 デプロイ前の確認

```bash
git fetch && git log --oneline HEAD..origin/<ブランチ>     # 取り込む変更を確認
./scripts/schema_diff.sh                                   # 本番DBのスキーマが新コードと合っているか
./scripts/backup.sh                                        # 念のため最新のバックアップを取る
```

`schema_diff.sh` が `[DIFF]` を出したら、`+` の行（新コードにあって本番DBに無いもの）を **デプロイ前に** SQL で適用する。
`db/init/*.sql` は空のDBの初回起動時にしか実行されないため、既存の本番DBには自動では反映されない。

### 3.2 デプロイ

```bash
./scripts/deploy.sh
```

このスクリプトが自動でやること:

1. `.env` 4ファイルの存在確認と `CHANGE_ME` チェック（**残っていたら中止**。コメント行は対象外。`ALLOW_CHANGE_ME=1` で例外）
2. **デプロイ前バックアップ**（DB にテーブルがある場合）
   - DB: `db/backups/db-<日時>.sql.gz`、提出ファイル・画像: `db/backups/uploads-<日時>.tar.gz`（最新 10 世代。`KEEP_BACKUPS` で変更可）
   - バックアップに失敗したらデプロイを**中止**する（DB の状態確認の失敗、ダンプの欠損、圧縮の不整合も含む）
   - 実行中の `lms-db` が使っているボリュームが想定（`<プロジェクト名>_postgres-data`）と違う場合、
     または想定のボリュームが無いのに別名の `*_postgres-data` がある場合も**中止**する
     （そのまま進むと空のDBで作り直され、データが消えたように見えるため）
3. ネットワーク設定のズレ検知（[§5](#5-ネットワーク設定を変えたとき)）
   - リポジトリ直下の `.env` に `COMPOSE_FILE`（本番用の設定）を用意する（無ければ作る。既にあって違う値なら警告するだけで変更しない）
   - 事前に、**docker compose が v2.24 以上**であること、**マージ後の backend に開発用の設定（bind mount・`--reload`）が残っていない**ことを確認し、違えば中止する
4. tutor の前提チェック（`tutor/.env` のトークン・永続化DB、知識ベース）
5. ホストの `db/backups/`（700）を用意し、DB・アップロードの external ボリュームを確認する
   （**初回デプロイだけ** `docker volume create` で作る。DB はあるのにアップロードのボリュームだけ無いときは、消えた可能性があるので中止する）
6. 旧形式の画像（ホストの `backend/static/images/`）があれば、uploads ボリュームの `static/images/` へコピー（`scripts/migrate_legacy_images.sh`。上書きしない・元は消さない・何度実行しても安全。失敗したら中止）
7. `docker compose --env-file frontend/server/.env ... up --build -d --renew-anon-volumes`
   - **`-v`（ボリューム削除）は使わない**＝データ保持。`--renew-anon-volumes` は匿名ボリューム（backend の `.venv`）だけを作り直す
   - `--env-file frontend/server/.env`: frontend の `NEXT_PUBLIC_*` はビルド時にバンドルへ焼き込まれる。`.env` はイメージに入れない構成にしてあるため、
     この指定でビルドに値を渡す。**手動で `docker compose ... up --build` するときも必ず付けること**（付け忘れると frontend のビルドが失敗する）
8. 起動状態の表示、tutor の起動確認、**定期バックアップ（backup コンテナ）が最初のバックアップを取ったか**の確認

`deploy.sh` が `バックアップはスキップ` と表示したら、本当に空のDBか必ず確認する（既存の本番では出ないはず）。

オプション:

```bash
KEEP_BACKUPS=30 ./scripts/deploy.sh    # デプロイ前バックアップを30世代残す
SKIP_BACKUP=1   ./scripts/deploy.sh    # バックアップを省略（非常時のみ・非推奨）
ALLOW_FRESH_DB=1 ./scripts/deploy.sh   # 別名のDBボリュームがあっても、空のDBで新規に始める（通常は使わない）
```

### 3.3 デプロイ後の確認

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps     # 全て healthy / running
```

ブラウザで: ログイン → 既存の自分のデータが見える → 提出物が開ける → AI チューターに1回質問して回答が返る。

## 4. ロールバック

```bash
git log --oneline -5
git checkout <戻したいコミット>
./scripts/deploy.sh               # デプロイ前バックアップが自動で取られる
```

データも戻す必要があれば [backup-restore.md の復元](backup-restore.md#5-復元) を使う。
スキーマを変える SQL を当てた後に戻す場合は、コードだけ戻してもDBは新しいままなので注意（追加した列は残っていて問題ないことが多い）。

## 5. ネットワーク設定を変えたとき

`docker-compose.prod.yml` は Docker 内部ネットワークのサブネットを固定している
（学内 Wi-Fi との衝突回避。詳細は [docker-network.md](docker-network.md)）。

Docker は**ネットワーク作成時にしか**この設定を読まない。既存ネットワークがあると
`deploy.sh`（＝`up`）だけでは反映されず、`deploy.sh` が警告を出す。反映するには:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down   # ← -v は絶対に付けない
./scripts/deploy.sh
```

`down`（`-v` なし）はコンテナとネットワークを消すが、named volume は残るのでデータは無事。

## 6. トラブルシュート

| 症状 | 対処 |
|---|---|
| `deploy.sh` が「DB が healthy になりませんでした」で止まる | `docker compose ... logs db` を確認。ディスク容量・`db/.env` のパスワード整合を確認 |
| `deploy.sh` が「ボリュームが想定と異なります」で止まる | **データを守るための停止**。`docker inspect lms-db` の Mounts と `docker volume ls` を見て、本番データのあるボリュームを特定する。分かるまで進めない |
| バックアップで中止される | `db/.env` の `POSTGRES_USER`/`POSTGRES_DB` が実DBと一致しているか確認 |
| ログインできない／全員ログアウトされた | `SECRET_KEY` か `NEXTAUTH_SECRET` を変更した後は全員再ログインが必要（仕様）。[シークレット手順書](runbook-secret-rotation.md) |
| フロントが古いURLを叩く | `NEXT_PUBLIC_*` はビルド時に焼き込まれる。`.env` 修正後に `deploy.sh`（再ビルド）を実行 |
| チューターが 502「接続できません」になる | backend コンテナの `HTTP_PROXY` が内部通信（tutor 等）に使われていないか。`docker compose exec backend env \| grep -i proxy` で `NO_PROXY=tutor,db,...` があるか確認（`backend/Dockerfile` で設定。変更後は再ビルド） |
| チューターが 503「準備中」になる | 知識ベースの読み込みに数十秒かかる。続く場合は `docker compose ... logs --tail=100 tutor` |
| backend が起動直後に落ちる（`ImportError: ... greenlet` など） | 依存の解決違い。`backend/poetry.lock` がコミットされているか、`pyproject.toml` と合っているか（`poetry check --lock`）確認。ロックの更新は `poetry lock` → CI → デプロイ |
| API が 500（デプロイ直後） | `docker compose ... logs --tail=100 backend`。`column ... does not exist` なら本番DBのスキーマが古い → `./scripts/schema_diff.sh` |
| frontend のビルドが「NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_APP_BASE_URL が空です」で失敗する | `--env-file frontend/server/.env` が付いていない（手動実行時）、または `frontend/server/.env` の値が空。`deploy.sh` を使うか `--env-file` を付ける |
| ログインで「ログイン試行が多すぎます」（429） | §7。同じメール・同じIPで10回連続で失敗すると15分ロックされる。本人が誤入力を重ねた場合は15分待つか、backend を再起動（カウンタはメモリ上）すると解除される |
| コードを変更したのに本番に反映されない | 本番の backend はイメージの中のコードで動く。`./scripts/deploy.sh`（再ビルド）が必要 |
| 画像（教科書のページなど）が表示されない | 旧形式（`./static/...`）の画像が uploads ボリュームに無い可能性。`./scripts/migrate_legacy_images.sh` を実行（`deploy.sh` も自動で実行する）。それでも出なければ `docker compose ... logs backend` で「画像ファイルが見つかりません」の ID を確認 |
| `deploy.sh` が「docker compose が v2.24 以上と確認できません」で止まる | compose を更新する（`docker compose version`）。本番用の設定が `!override` / `!reset` に依存しているため、古い compose では開発用の設定のまま動いてしまう |
| `deploy.sh` が「backend に開発用の設定が残っています」で止まる | `docker-compose.prod.yml` の backend の `volumes: !override` / `command: !reset null` が効いていない。compose のバージョンと該当部分を確認 |
| `docker compose up` が「external volume ... not found」で失敗する | **データを守るための停止**。DB・アップロードのボリュームが無い／名前が違う。`docker volume ls` で確認する。消えたなら [backup-restore.md §0](backup-restore.md#0-コンテナやボリュームを誤って消してしまったとき最初に読む) の復旧手順。初回だけは `deploy.sh` が作る |
| `docker compose ps` で backup が unhealthy | 直近の DB バックアップが古い（取れていない）。`docker compose logs --tail=30 backup`。DB に繋がらない・users が 0 件（空のDBは意図的にバックアップしない）などのメッセージが出る |
| ネットワークに繋がらない | [docker-network.md](docker-network.md) と本書 §5 |

> `scripts/reset.sh` / `reset.bat` / `deploy_new_db_volume.sh` は、実行前に `DELETE` の入力を求める
> （非対話では `CONFIRM_DESTROY=yes` が必要）。それでも本番サーバーでは実行しないこと。
>
> **やってはいけないこと**: 本番で `docker compose down -v` / `scripts/reset.sh` /
> `docker volume rm *_postgres-data` を実行するとデータが消える。

## 7. ログイン試行制限

- 同じ（メールアドレス, クライアントIP）で **10回連続で失敗すると15分間ロック**する（`backend/api/core/login_rate_limit.py`）。成功するとリセットされる。
- クライアントIPは nginx が `X-Forwarded-For` に**実際に見たIP 1個**を入れて渡し（クライアントが付けた偽のヘッダは捨てる）、
  NextAuth（frontend）経由のログインでもそのIPを backend に引き継ぐ。そのため、偽のヘッダでは回避できず、
  別のIPの攻撃者が他人のメールで失敗を重ねても、本人はロックされない。
- **前提**: ユーザーが nginx に直接つながる構成（nginx の手前に別のリバースプロキシは無い）。手前にプロキシを置くと、全員がそのプロキシのIPに見える。
  その場合は nginx に `set_real_ip_from`（そのプロキシのIP）と `real_ip_header X-Forwarded-For` を設定する必要がある。
- カウンタはメモリ上でワーカーごと。backend が複数ワーカー（`--workers 4`）で動くと、実効の上限は最大で4倍（40回）になる。

## 8. 学内の AI サーバー（LLM）が使えないとき（メンテナンス表示）

AI チューターは、学内の AI サーバー（`hinton`。`tutor/.env` の `ANTHROPIC_BASE_URL`）に依存する。
そこに繋がらない・応答しないときは、学生に**「AIチューターは現在メンテナンス中です」**と表示して質問を止め、復旧したら**自動で元に戻る**。LMS の他の機能（教科書・演習・提出）は影響を受けない。

| 状況 | 学生の画面 | tutor の動き |
|---|---|---|
| AI サーバーが落ちている・応答しない（自動検知） | 画面上部に「メンテナンス中」のバナー。入力欄は無効。復旧すると自動で消える | 最初の失敗で質問を打ち切り、以降 30 秒は即座に断る（待たせない）。30 秒ごとに疎通確認し、復旧を自動で検知する |
| 管理者が手動でメンテナンスにした（計画停止） | 同じバナー（管理者が書いた文面） | 疎通確認も質問も止める |
| tutor サービス自体が止まっている・起動中 | 同じバナー | backend が検知（`/api/tutor/health`） |
| 質問の送信が「メンテナンス中」で断られた | バナーが出て、**入力した文章は消えずに入力欄へ戻る** | — |

- **計画停止のとき**（AI サーバーの再起動など）: 管理者で `/t/tutor` →「設定」→「メンテナンス表示」で、スイッチをオンにして、学生に見せる文面（例: `15:00〜16:00 は使えません`）を入れて保存する。**終わったら必ずオフにして保存する。**
  再起動なしで反映され、tutor を再起動しても保持される。API でやるなら `PUT /api/tutor/admin/settings`（`{"maintenance": true, "maintenance_message": "..."}`、管理者のみ）。
- 自動検知の状態は、同じ画面の「AI サーバーの状態」と、`docker compose exec tutor curl -s http://127.0.0.1:8765/health` の `llm` で見られる。
- 調整できる値（`tutor/.env`）: `TUTOR_LLM_CONNECT_TIMEOUT_SEC`（5）、`TUTOR_LLM_READ_TIMEOUT_SEC`（45。応答が止まったとみなすまでの秒数）、
  `TUTOR_LLM_BREAKER_SEC`（30。繋がらないと分かった後、即座に断る秒数）、`TUTOR_LLM_PROBE_TTL_SEC`（30。疎通確認の間隔）、
  `TUTOR_FORCE_MAINTENANCE=1`（起動時から手動のメンテナンスにする）。
- 繋がらないのに学生が使えてしまう・繋がっているのに「メンテナンス中」のままのとき: `docker compose logs --tail=50 tutor` の `[llm] 使えません: ...` に原因（接続拒否・タイムアウト・認証エラー・モデル名の誤り）が出る。
  認証エラー（401/403）やモデル名の誤り（404）も、学生には「メンテナンス中」と表示される（`ANTHROPIC_AUTH_TOKEN` とモデル名を確認）。

