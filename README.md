# 数理系科目向けの学習支援システム
# Fast-API-LMS_React

![React](https://img.shields.io/badge/Frontend-React-blue)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue)
![Docker](https://img.shields.io/badge/Dev-Docker-informational)

---

## 1. 概要

本プロジェクトは，数理系科目向け学習支援システムです．

金沢工業大学 山本知仁研究室 において 2021年度より継続的に開発されており，
複数の研究テーマを統合する実験基盤として設計されています．

本システムは単なるLMSではなく，
研究・実践・教育実践を横断する研究基盤として位置づけられています．

---

## 2. 現在(2025年度～)の研究テーマ

現在，本基盤では以下の研究テーマを扱っています．

### 1. UIおよびUX設計と学習行動分析
- UIおよびUXが学習意欲に与える影響の検証
- 継続利用行動と関連分析
- 学習ログに基づく行動パターン可視化

### 2. OCRを用いた紙ノートのデジタル化
- 手書き数式認識
- 紙ノートのデジタルノート変換
- 合理的配慮が必要な学生への支援
  
### 3. LMSにおけるLLM活用
- RAG (Retrieval-Augmented Generation) の構築
- 問題難易度の解析・予測
- 問題自動生成機能の実装

### 4. 空間認識支援のための動的可視化教材
- Webブラウザ上で動作する3D可視化エンジンの実装
- 視点回転・拡大縮小を可能とするインタラクティブUI設計
- 数理系問題に対応した図形生成および動的描画機構の構築

---

## 3. 研究の変遷

本プロジェクトは段階的な拡張と再設計を経て発展してきました．

### 2021年度
- 卒業研究：数理系科目の学びを支援するアダプティブラーニングシステム

### 2023年度
- 卒業研究：個別最適化されたLMSにおける学習意欲向上のためのUI開発
- 修士研究：自由なコンテンツデザインを実現するアダプティブラーニングシステムの開発
- 修士研究：受講者レベルを考慮した問題提示を実現するアダプティブラーニングシステムの開発

### 2024年度
- 卒業研究：線形代数向けアダプティブラーニングシステムの構築とUI/UXの改善

### 2025年度
- 卒業研究：動的可視化を用いた数理教育教材の導入
- 修士研究：大学の数理系LMSにおける学習意欲と継続利用を促すUIおよびUXの提案

```
※ IRTベースの適応機能は初期研究段階で実装・検証を行いましたが，
現在はデータ不足・拡張研究を優先しているため，本リポジトリには含まれていません．
```

---

## 4. 技術構成

| 区分 | 技術 |
| ------| ------|
| フロントエンド | React (Next.js) |
| バックエンド | FastAPI |
| データベース | PostgreSQL |
| 認証 | NextAuth (メールアドレス・パスワード認証) |
| 開発環境 | Docker |

---

## 5. 研究成果

本基盤を用いた研究成果：

- 電気・情報関係学会 (JHES) 北陸支部連合大会 2023
- 教育システム情報学会 (JSISE) 全国大会 2024
- ヒューマンインタフェースシンポジウム (HI)  2025

---

## 6. 環境構築手順

### ■ 前提条件
- Git
- Docker
- Docker Compose

### ■ リポジトリの取得

```bash
git clone https://github.com/68ymtlab/Fast-API-LMS_React.git
cd Fast-API-LMS_React
```

### ■ 環境変数の設定

`.env` ファイルは以下のディレクトリで必要です：
- `/backend/`
- `/frontend/server/`
- `/db/` （必要に応じて）

各 `.env` の内容は研究室内ドキュメント（Notion等）を参照してください．
必要に応じて新規作成・修正してください．

### ■ Dockerコンテナの起動

```bash
docker compose up --build -d
```

コンテナが正常に起動したことを確認してください．

### ■ フロントエンド開発サーバーの起動

`frontend` コンテナ内で開発サーバーを起動します．（起動は毎回必要です．）

```bash
docker compose exec frontend bash
```

初回起動時のみ，ライブラリのインストールを行ってください：
```bash
npm install
```

その後，開発サーバーを起動します：
```bash
npm run dev
```

### ■ アクセス
- Frontend: http://localhost:3000/login
- Backend: http://localhost:8000/docs

### ■ コンテナ停止

```bash
docker compose down
```

---

## 7. 環境変数

本システムでは，各サービスごとに `.env` ファイルを使用します．
以下のディレクトリに環境変数の設定が必要です．

- `/backend/`
- `/frontend/server/`
- `/db/` （個別でデータベースを作成する場合）

### ■ `backend/.env`

例：
```
# Database connection string
# 例: postgresql://user:password@localhost:5432/mydb
DATABASE_URL=postgresql://user:password@db:5432/dbname

# JWT / Authentication
SECRET_KEY=your_secret_key_min_32_chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_MINUTES=10080
COOKIE_SECURE=False  # 開発環境では False，本番環境では True

# Swagger / ReDoc Docs Authentication
DOCS_USERNAME=admin
DOCS_PASSWORD=password
```

### ■ `frontend/server/.env`

例：
```
# 開発識別子
NODE_ENV=development

# フロントエンドURL
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000

# API接続先
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
INTERNAL_API_BASE_URL=http://localhost:8000

# デバッグレベル
NEXT_PUBLIC_DEBUG_LEVEL=0

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_min_32_chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

### ■ 注意事項
- `.env` ファイルは **Gitに含めないでください** ．
- 本番環境では `COOKIE_SECURE=True` を推奨します．
- `SECRET_KEY` および `NEXTAUTH_SECRET` は十分に長いランダム文字列を使用してください．

### ■ シークレットキー生成例
- Python
  ```python
  import secrets
  print(secrets.token_hex(32))
  ```
- Bash
  ```bash
  openssl rand -hex 32
  ```

---

## 8. ディレクトリ構成

本リポジトリはシングルリポジトリ構成です．

```
Fast-API-LMS_React/
├── backend/                      # FastAPI バックエンド
│   ├── api/                      # アプリケーション本体
│   │   ├── core/                 # 設定・認証・セキュリティ
│   │   ├── db/                   # DBセッション管理
│   │   ├── models/               # SQLAlchemyモデル
│   │   ├── repositories/         # DBアクセス層
│   │   ├── services/             # ビジネスロジック層
│   │   ├── routers/              # APIルーティング
│   │   └── schemas/              # Pydanticスキーマ
│   ├── alembic/                  # マイグレーション
│   └── pyproject.toml
│
├── frontend/                     # Next.js フロントエンド
│   ├── server/
│   │   ├── src/
│   │   │   ├── app/              # App Router
│   │   │   ├── components/       # UIコンポーネント
│   │   │   ├── lib/              # API / Auth 関連
│   │   │   ├── hooks/
│   │   │   └── types/
│   │   ├── public/               # 静的ファイル
│   │   └── package.json
│   └── docker/
│
├── db/                           # DB関連設定（Supabase等）
├── scripts/                      # 補助スクリプト
├── volumes/                      # 永続化ボリューム
├── docker-compose.yml
└── README.md
```