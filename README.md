# product-releases-api

为 **product-releases-app** 提供极简访问统计：页面访问次数、下载按钮点击次数（SQLite 持久化）。

## 运行

```bash
cp .env.example .env
npm install
npm run dev
```

本地 `npm run dev` 默认监听 `http://127.0.0.1:3091`（与宿主机上 Docker 映射的 `3090` 错开）；数据库文件默认 `./data/stats.db`。容器内仍由 compose 设置 `PORT=3090`。

## 与 product-releases-app 联调

1. 在本目录启动本服务（`npm run dev`）。
2. 在 `product-releases-app` 执行 `npm run dev`（默认 `http://127.0.0.1:5174`）。前端通过 Vite 将同源 `/api` 代理到 `http://127.0.0.1:3091`（与本地 API 默认端口一致）。
3. 若本机不跑 `npm run dev` API、只使用 Docker 映射在宿主机的 API：在 `product-releases-app` 配置 `VITE_STATS_PROXY_TARGET=http://127.0.0.1:3090`。
4. 若静态站点与 API 不同域部署，构建前端时设置 `VITE_STATS_API_BASE`，并在本服务配置 `STATS_CORS_ORIGINS`。

## HTTP 接口

鉴权方式与 `xiaoxiao-album-api` 一致：`Authorization: Bearer <jwtToken>`；登录接口 `POST /api/auth/session` 返回 `data.jwtToken`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/session` | body `{ username, password }`，成功返回 `jwtToken` |
| GET | `/api/stats` | **需 Bearer**，查询单产品统计（`?productKey=...` 必填） |
| GET | `/api/stats/all` | **需 Bearer**，查询所有产品统计 |
| POST | `/api/stats/page-view` | **公开**，页面访问 +1（body `productKey` 必填） |
| POST | `/api/stats/download` | **公开**，下载点击 +1（body `productKey` 必填） |

成功响应示例：

```json
{
  "status": "success",
  "messageType": "success",
  "message": "ok",
  "data": [
    {
      "productKey": "xiaoxiao-album",
      "pageViews": 10,
      "downloadClicks": 3
    }
  ]
}
```

## 环境变量

见 `.env.example`。生产环境若前端与 API 不同源，请设置 `STATS_CORS_ORIGINS`（逗号分隔的 Origin 列表）。

## 数据库迁移

迁移逻辑在 `src/db/migrations/`；入口为 `src/db/ensureSchema.js`（记录已执行版本于 `schema_migrations` 表）。

手动执行：

```bash
npm run db:migrate
```

## Docker 部署

本目录提供 `docker-compose.yml`（与 API 代码一并提交）。在**仓库根目录**执行：

```bash
docker compose -f product-releases-api/docker-compose.yml up -d --build
```

或在 `product-releases-api` 目录下：

```bash
docker compose up -d --build
```

- 前端访问：`http://127.0.0.1:8080`
- API 直连（宿主机映射）：`http://127.0.0.1:3090`

API 容器启动时会自动执行：

```bash
npm run db:migrate
```

### 构建拉镜像超时（`auth.docker.io` / IPv6 timeout）

多为访问 Docker Hub 失败。在 **Docker Desktop → Settings → Docker Engine** 配置 `registry-mirrors` 与 `dns` 后重启 Docker，再执行 `docker compose build`。

## 目录说明（对齐 xiaoxiao-album-api 习惯）

- `server.js`：入口
- `src/routes`：路由
- `src/controllers`：控制器
- `src/services`：业务逻辑
- `src/db`：SQLite 连接与建表
- `src/middlewares`：统一响应、错误处理
- `src/utils`：async 包装；退出时关库与关 HTTP 在 `server.js` 内处理
