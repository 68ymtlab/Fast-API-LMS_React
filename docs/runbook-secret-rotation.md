# シークレット・ローテーション手順書

認証や管理機能に使う秘密情報を安全な値に更新する手順。

## なぜ必要か

過去に `.env` 本体が Git にコミットされていた時期があり、**以下の値が Git 履歴から参照できる**。
さらに一部は公開チュートリアルのサンプル値そのままになっている。これらは早急に新しい値へ交換する。

| 変数 | 置き場所 | 問題 | 影響 |
|---|---|---|---|
| `SECRET_KEY` | `backend/.env` | Git 履歴に漏洩＋サンプル値 | JWT を偽造され、任意ユーザー（管理者含む）になりすまし可能 |
| `NEXTAUTH_SECRET` | `frontend/server/.env` | 公開サンプル値そのまま | NextAuth セッションの偽造・復号が可能 |
| `DOCS_PASSWORD` | `backend/.env` | Git 履歴に漏洩 | `/docs`（API仕様）を第三者が閲覧可能 |

> 一度漏れた値は「変える」以外に対処できない。**新しい値に交換すれば、履歴に残る旧値は無価値になる。**
> Git 履歴そのものの消去（`git filter-repo` 等）は破壊的でチーム全員の再クローンが必要なため、
> まず値の交換を最優先で行う。公開リポジトリにする予定がある場合のみ履歴消去も検討する。

---

## 手順（本番サーバーで実行）

### 1. 新しい値を生成

```bash
openssl rand -hex 32      # SECRET_KEY 用
openssl rand -hex 32      # NEXTAUTH_SECRET 用（別の値）
openssl rand -base64 24   # DOCS_PASSWORD 用（記号を避けたいなら -hex 16 でも可）
```

### 2. `.env` を書き換え

```
# backend/.env
SECRET_KEY=<生成した値1>
DOCS_PASSWORD=<生成した値3>

# frontend/server/.env
NEXTAUTH_SECRET=<生成した値2>
```

### 3. コンテナを作り直して反映

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate backend frontend
```

> **`restart` ではダメ。** `docker compose restart` は `env_file` を再読込しないため、
> 古い値のまま起動する。必ず `up -d --force-recreate` を使う（または `down`（-v なし）→`deploy.sh`）。
>
> - `SECRET_KEY` / `DOCS_PASSWORD` … backend の実行時環境変数。再ビルド不要。
> - `NEXTAUTH_SECRET` … frontend の実行時環境変数（`process.env` 参照、バンドルには焼き込まれない）。再ビルド不要。

### 4. 反映確認

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# SECRET_KEY: 通常ログインが成功すること（新しい鍵でトークンが発行される）
#   → ブラウザで実際にログインし直せるか確認するのが確実

# DOCS_PASSWORD: /docs は backend コンテナ内でのみ配信される
#   （nginx の /api/ は prefix を保持するため外部からは到達しない）。
#   backend コンテナから直接叩いて、新パスワードで 200 になることを確認:
$COMPOSE exec -T backend sh -lc \
  'python -c "import urllib.request,base64,os;
u=os.environ[\"DOCS_USERNAME\"]; p=os.environ[\"DOCS_PASSWORD\"];
r=urllib.request.Request(\"http://localhost:8000/docs\");
r.add_header(\"Authorization\",\"Basic \"+base64.b64encode(f\"{u}:{p}\".encode()).decode());
print(urllib.request.urlopen(r).status)"'
# → 200 が表示されれば新しい DOCS_PASSWORD で認証できている
```

---

## 影響と周知

- **全ユーザーが再ログインになる。** `SECRET_KEY` / `NEXTAUTH_SECRET` を変えると、発行済みの
  アクセストークン・セッションがすべて無効になる。これは意図した効果（漏洩トークンの一括失効）でもある。
- 授業中の中断を避けるため、**夜間・休日**に実施する。
- 実施後、利用者には「再度ログインしてください」と周知する。

---

## 今後の再発防止（実装済み）

- `.env` 系は `.gitignore` 済み。**絶対にコミットしない。**
- `deploy.sh` が `CHANGE_ME` の残存を検知して警告する。
- ローカル開発機の `.env` も、漏洩値ではなく各自で生成した値を使う（本番と別値でよい）。
