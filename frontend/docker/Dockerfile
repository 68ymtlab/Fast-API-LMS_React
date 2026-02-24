FROM node:24

WORKDIR /app

# 依存関係のコピー（serverディレクトリから）
COPY server/package*.json ./

# 依存関係のインストール
RUN npm install

# アプリケーションコードのコピー（serverディレクトリ全体）
COPY server/ .

# ポート8080を公開
EXPOSE 8080

# 開発サーバーを起動
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]