FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3090

CMD ["sh", "-c", "npm run db:migrate && npm run start"]
