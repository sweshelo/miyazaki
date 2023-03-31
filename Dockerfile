# ベースイメージを指定
FROM node:latest

# 作業ディレクトリを指定
WORKDIR /app

# アプリケーションの依存関係をインストール
COPY src/package*.json ./
RUN npm install

# ポート番号を指定
EXPOSE 3000

# アプリケーションを起動
CMD [ "npm", "start" ]

