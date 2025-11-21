FROM node:22-alpine3.21
WORKDIR /app

# ビルドコンテキストは frontend/ なので、server/package.json を指定
COPY server/package.json server/package-lock.json ./

RUN npm install

# 開発用コマンド
CMD ["npm", "run", "dev"]
