# バックアップ・復元手順書

本番の DB と提出ファイルを守るための手順。デプロイ手順は [runbook-deploy.md](runbook-deploy.md)。

## 0. コンテナやボリュームを誤って消してしまったとき（最初に読む）

最も起こりやすいデータの消え方は、`docker compose down -v`・`docker volume rm`・`docker system prune --volumes` などの**誤操作**です。
次の3段で備えている（すべて自動テストで確認済み: `scripts/tests/test_disaster_recovery.sh`）。

| 段 | 備え | 防げるもの |
|---|---|---|
| ① 消えにくくする | DB・アップロードのボリュームは **external**（compose の管理外）。リポジトリ直下の `.env` の `COMPOSE_FILE` で、`-f` なしの `docker compose` も本番用の設定を読む（`deploy.sh` が設定） | `docker compose down -v`（`-f` なしでも）。無いときは空のDBを作らず `up` が失敗する |
| ② 消えても残る | **`backup` コンテナ**が、DB を4時間ごと・アップロードを1日ごとに、**ホストの `db/backups/`**（Docker のボリュームの外）へ保存する。起動直後（デプロイのたび）にも取る | `docker volume rm` など、ボリュームそのものを消す操作。コンテナの削除 |
| ③ 消す直前に取る | `reset.sh` / `deploy_new_db_volume.sh` は、確認が取れたら**消す前に自動でバックアップ**を取り、取れなければ消さない（`db/backups/pre-destroy-*`） | 開発用スクリプトを本番で実行してしまった場合 |

> `docker volume rm <ボリューム名>` を**名指しで**実行した場合は、①では防げない。②のバックアップが最後の備えになる。

**守れないもの**: `db/backups/` ごと消える操作（`rm -rf` や、無視されたファイルも消す **`git clean -fdx`**）、サーバーのディスクの故障・サーバーの喪失。
→ `db/backups` を別のディスクへのシンボリックリンクにする（`ln -s /var/backups/lms db/backups`）、別のマシンへコピーする（§3）と、さらに安全。

### 復旧の手順（ボリュームが消えた場合）

```bash
cd /path/to/Fast-API-LMS_React
ls -lt db/backups/periodic-db-*.sql.gz | head -3        # ① 最新のバックアップを確認（無ければ db-*.sql.gz / auto-*.sql.gz / pre-destroy-*.sql.gz も探す）
./scripts/restore_test.sh db/backups/<ファイル>          #    念のため、使い捨てのDBに復元できるか確認（[OK] 復元テスト成功 になること）

# ② 空のボリュームを作り、db だけ起動する（初回の db/init が走り、空のスキーマができる）
docker volume create fast-api-lms_react_postgres-data
docker volume create fast-api-lms_react_uploads-data
docker compose up -d db                                  # .env の COMPOSE_FILE で本番用の設定が読まれる。healthy になるまで待つ

# ③ tutor 用の DB ロールを作る（ダンプは tutor のテーブルの所有者として tutor_app を参照する）
./scripts/setup_tutor_secrets.sh

# ④ DB を復元（既存のスキーマの上から上書きする。エラーが出たら止まる）
. ./db/.env
gunzip -c db/backups/<ファイル> | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

# ⑤ アップロード（提出物・画像）を復元
docker run --rm -v fast-api-lms_react_uploads-data:/data -v "$PWD/db/backups":/backup:ro alpine \
  sh -c "cd /data && tar xzf /backup/<periodic-uploads-....tar.gz>"

# ⑥ 全体を起動し直す
docker compose up -d
```

- 復元できるのは、**そのバックアップを取った時点まで**。DB は最大4時間分（`BACKUP_INTERVAL_HOURS`）、アップロードは最大1日分が失われうる。
- ボリューム名が上と違うときは、`docker compose config | grep -A2 -E "postgres-data:|uploads-data:"` の `name:` を使う。
- 「どのバックアップがあるか」「backup コンテナが取れているか」は `./scripts/inspect_prod.sh` で確認できる。

## 1. 全体像

| 種類 | 取るタイミング | 保存先 | 担当 |
|---|---|---|---|
| **定期バックアップ（自動・常駐）** | DB: 4時間ごと / アップロード: 1日ごと / 起動直後 | **ホストの** `db/backups/periodic-db-*.sql.gz` / `periodic-uploads-*.tar.gz`（DB は直近24個＋30日分は1日1個、アップロードは7個） | `backup` コンテナ（[backup/run.sh](../../backup/run.sh)） |
| 消す直前のバックアップ | `reset.sh` などで消す直前（自動） | `db/backups/pre-destroy-*` | [_guard.sh](../../scripts/_guard.sh) |
| デプロイ前バックアップ | `deploy.sh` 実行のたび（自動） | `db/backups/db-*.sql.gz` / `uploads-*.tar.gz`（10世代） | [deploy.sh](../../scripts/deploy.sh) |
| 定期バックアップ | 毎日（cron） | `db/backups/auto-db-*.sql.gz` / `auto-uploads-*.tar.gz`（14世代） | [backup.sh](../../scripts/backup.sh) |
| 別マシンへの保管 | 毎日（cron） | **別のマシン** | 本書 §3 |
| 復元テスト | 週1回（cron） | 使い捨てコンテナ（終了時に削除） | [restore_test.sh](../../scripts/restore_test.sh) |

**考え方**

- バックアップは「取れている」ことと「復元できる」ことが別物。壊れたファイルや空のDBのバックアップは、取るだけでは気付けない。
  → 復元テストで、実際に復元して中身（テーブル数・users 件数）を確認する。
- 同じサーバーにしかバックアップが無いと、ディスク故障・サーバー喪失で本体と一緒に失う。
  → **別のマシンに置くことが本体**。
- バックアップにはメールアドレス・学習ログなどの個人情報が入る。`backup.sh` は本人だけが読める権限（600）で作る。
  コピー先でも読める人を限定すること。

## 2. 手動バックアップ（デプロイと無関係にいつでも）

```bash
./scripts/backup.sh
ls -lh db/backups/        # auto-db-<日時>.sql.gz ができている
```

## 3. 別のマシンに保管する

### 3.1 どのマシンに置くか

本番サーバーと**別の筐体**で、本番と同時に壊れない場所なら何でもよい。

| 候補 | 向き不向き |
|---|---|
| 研究室の別 PC / 別サーバー（ssh できる） | おすすめ。rsync でそのまま送れる |
| 学内のファイルサーバー / NAS | 可。ssh か、マウントして rsync |
| 本番サーバーに繋いだ外付けディスク | ディスク故障には効くが、設置場所の火災・盗難・サーバー全損には弱い。最低限の保険 |
| クラウドストレージ | 個人情報を含むので、学内の規則を確認してから |

### 3.2 方式 A: 本番から送る（push）— 設定が簡単

`backup.sh` の `BACKUP_REMOTE`（rsync の書式）に送り先を指定する。

**送り先マシン（以下 `backup-host`）で**

```bash
# 専用ユーザーと保存先を作る（rsync と sshd が入っていること）
sudo useradd -m lmsbackup
sudo mkdir -p /srv/lms-backups && sudo chown lmsbackup: /srv/lms-backups && sudo chmod 700 /srv/lms-backups
```

**本番サーバーで**（cron を実行するユーザー＝docker を使えるユーザー）

```bash
# パスフレーズ無しの専用鍵（cron は入力できないため）
ssh-keygen -t ed25519 -f ~/.ssh/lms_backup -N "" -C "lms-backup"
ssh-copy-id -i ~/.ssh/lms_backup.pub lmsbackup@backup-host

# 接続確認（初回は host key の確認が出るので yes）
ssh -i ~/.ssh/lms_backup lmsbackup@backup-host true && echo OK
```

cron では次のように指定する（§4）。

```bash
RSYNC_RSH='ssh -i /home/<ユーザー>/.ssh/lms_backup -o BatchMode=yes' \
BACKUP_REMOTE=lmsbackup@backup-host:/srv/lms-backups/ ./scripts/backup.sh
```

> 注意: 方式 A は、本番サーバーが侵害されると、その鍵で送り先のバックアップも消せてしまう。
> 送り先のバックアップが本番から守られている必要があるなら方式 B を使う。

### 3.3 方式 B: バックアップ側から取りに行く（pull）— より安全

本番は送り先の鍵を持たない。**送り先マシンが**本番へログインして `auto-*` を取る。

**送り先マシンで**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/lms_pull -N "" -C "lms-pull"
# 公開鍵（~/.ssh/lms_pull.pub）を、本番サーバーの運用ユーザーの ~/.ssh/authorized_keys に追記してもらう
# 動作確認
ssh -i ~/.ssh/lms_pull <運用ユーザー>@<本番サーバー> true && echo OK
```

送り先マシンの cron（毎日 03:30）:

```bash
30 3 * * * rsync -a --timeout=120 -e "ssh -i $HOME/.ssh/lms_pull -o BatchMode=yes" --include='auto-*' --exclude='*' \
  <運用ユーザー>@<本番サーバー>:/path/to/Fast-API-LMS_React/db/backups/ /srv/lms-backups/ >> $HOME/lms-pull.log 2>&1
# 送り先側の世代管理（90日より古いものを消す）
0 5 * * 0 find /srv/lms-backups -name 'auto-*' -mtime +90 -delete
```

方式 B では本番側の `BACKUP_REMOTE` は設定しない（ログに WARN が出るが問題ない）。

### 3.4 動作確認（必ずやる）

1. `./scripts/backup.sh` を手動実行し、送り先に `auto-db-*.sql.gz` が届いたか確認する。
2. **送り先に届いたファイルで** `./scripts/restore_test.sh <そのファイル>` を実行し、`[OK] 復元テスト成功` になるか確認する
   （送り先から本番サーバーにコピーして実行するか、送り先に docker があればそこで実行）。

## 4. cron の設定

デプロイ前バックアップだけだと「デプロイしない日のデータ」は守れない。

```bash
# 本番サーバーの運用ユーザーで crontab -e（docker を実行できるユーザー。パスは実際の場所に合わせる）
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * *  cd /path/to/Fast-API-LMS_React && RSYNC_RSH='ssh -i /home/<ユーザー>/.ssh/lms_backup -o BatchMode=yes' BACKUP_REMOTE=lmsbackup@backup-host:/srv/lms-backups/ ./scripts/backup.sh >> db/backups/backup.log 2>&1
30 3 * * 0 cd /path/to/Fast-API-LMS_React && ./scripts/restore_test.sh >> db/backups/restore_test.log 2>&1
```

- cron は失敗しても誰にも通知されない。**週に1回はログに `[ERROR]` が無いか確認する**
  （`grep ERROR db/backups/*.log`）。復元テストが `[OK]` で終わっているかも見る。
- ログは増え続けるので、年に数回 `: > db/backups/backup.log` などで空にするか logrotate を設定する。
- cron を入れる前に、`./scripts/backup.sh` → `./scripts/restore_test.sh` を1回ずつ手動で実行して成功を確認する。

## 5. 復元

**本番を巻き戻す操作。必ずアプリを止めて、復元前の状態をもう一度バックアップしてから行う。**

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
. ./db/.env

# 1) アプリを止めて書き込みを止める（db は動かしたまま）
$COMPOSE stop nginx frontend backend tutor

# 2) 現在の状態をバックアップ（巻き戻しを取り消せるように）
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip > db/backups/before-restore-$(date +%Y%m%d-%H%M%S).sql.gz

# 3) 復元（エラーが出たら止まる）
gunzip -c db/backups/<戻したいバックアップ>.sql.gz | $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

# 4) アプリを再開
$COMPOSE up -d
```

- `--clean --if-exists` 付きで取ったバックアップ（`deploy.sh` / `backup.sh` のもの）は、既存のDBに上書きで流し込める。
  それ以前の古いバックアップや付けずに取ったものは、既存のテーブルがあると 3) が止まる。空のDBに流すこと。
- ダンプには `tutor_app` ロールの定義が含まれない。ロールごと作り直した環境に復元したら
  `./scripts/setup_tutor_secrets.sh` を実行して `tutor_app` の権限を整える。

### 提出ファイル・画像の復元

```bash
docker volume ls | grep uploads-data           # ボリューム名を確認
docker run --rm -v <uploads-volume名>:/data -v "$PWD/db/backups":/backup alpine \
  sh -c "cd /data && tar xzf /backup/<auto-uploads-日時>.tar.gz"
```

## 6. 復元テストの見方

```bash
./scripts/restore_test.sh                       # 最新のバックアップで検証
./scripts/restore_test.sh db/backups/xxx.sql.gz # 指定したファイルで検証
```

| 出力 | 意味 |
|---|---|
| `[OK] 復元テスト成功` | 復元でき、テーブルと users が入っている |
| `[ERROR] 復元に失敗しました` | そのバックアップは使えない。すぐ新しく取り直し、原因を調べる |
| `[ERROR] users が 0 件です` | 空のDBを保存している。DB コンテナ・`db/.env` を確認 |
| `[WARN] 稼働中DBは users N 件` | バックアップ後に登録が増えた（通常）か、減っている（要確認） |
