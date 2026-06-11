# product-releases-api 容器镜像；监听 PORT=3090，数据卷持久化 /app/data
FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3090

CMD ["npm", "run", "start"]
