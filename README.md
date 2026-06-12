# product-releases-api

为 **product-releases-app** 提供：

- 访问统计（页面访问、下载点击）
- **云端许可证 API**（试用验证码、永久激活码、admin fulfill）

桌面端通过独立子域名调用许可证接口（方案 B），**不**走本机 `xiaoxiao-album-api`。

## 运行

```bash
cp .env.example .env
npm install
npm run dev
```

本地 `npm run dev` 默认监听 `http://127.0.0.1:3091`；Docker 容器内 `PORT=3090`。

## 许可证 API（桌面端）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/license/trial/send-code` | body `{ email }` |
| POST | `/api/license/trial/activate` | body `{ email, code, device_id }` |
| POST | `/api/license/pro/redeem` | body `{ email, activation_code, device_id }` |
| POST | `/api/license/admin/session` | body `{ username, password }` → jwtToken（`LICENSE_ADMIN_*`） |
| GET | `/api/license/admin/overview` | **Bearer** 运维页一览 |
| PATCH | `/api/license/admin/recipients/device-limit` | **Bearer** body `{ email, device_limit_override }`（null=默认，0=不限，N=自定义） |
| POST | `/api/license/admin/codes` | **Bearer** 批量生成激活码 |
| POST | `/api/license/admin/fulfill` | **Bearer** 确认到账发码邮件 |

桌面端配置（`xiaoxiao-album-app`）：

```bash
# 默认 https://license.bingbingcloud.com
VITE_LICENSE_API_BASE=https://license.bingbingcloud.com
```

请求示例：`POST https://license.bingbingcloud.com/api/license/trial/send-code`

### 初始化密钥与激活码

```bash
node scripts/license-generate-keys.js   # 输出 LICENSE_* 写入 .env
node scripts/license-generate-codes.js 20
node scripts/license-fulfill.js user@example.com
```

公钥文件：`config/license-public.pem`（嵌入桌面 App 本地验签，后续 M1 Electron 使用）。

## 统计 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/stats/page-view` | 公开；页面访问 +1 |
| POST | `/api/stats/download` | 公开；下载点击 +1 |
| GET | `/api/stats/counts?productKey=` | 需 Bearer；单产品统计 |
| POST | `/api/stats/admin/session` | 统计页管理员登录 |
| GET | `/api/stats/admin/all` | 需 Bearer；全部产品统计 |

## ECS 部署与子域名（license.bingbingcloud.com）

与下载站共用 Docker 栈（API **3090**、前端 **8080**）。

**license 子域**同时承担：Electron 调 `/api/license/*`、运维页 **`/license-admin`**（须账号密码登录）。

完整 nginx 示例见：[`product-releases-app/deploy/nginx-license.bingbingcloud.com.conf.example`](../product-releases-app/deploy/nginx-license.bingbingcloud.com.conf.example)

要点：

| 路径 | 反代 |
|------|------|
| `/api/` | `127.0.0.1:3090` |
| `/license-admin`、`/assets/` | `127.0.0.1:8080` |
| `/` | 302 → `/license-admin` |

建议在 **download.bingbingcloud.com** 增加 `location /license-admin { return 404; }`。

发布：

```bash
cd /home/xiaoxiao/projects/product-releases
git pull
cd product-releases-api
docker compose up -d --build
```

`.env` 中配置 `EMAIL_*`、`LICENSE_*`、`LICENSE_ADMIN_USERNAME/PASSWORD`（**勿**打进桌面安装包）。

## Docker

```bash
docker compose up -d --build
```

- 下载站：`8080`
- API（含 license）：`3090`

## 数据库

SQLite 单文件，默认 `./data/product-releases.db`，可通过 `.env` 的 `DB_PATH` 修改。

首次连接时自动 `CREATE TABLE IF NOT EXISTS`（统计 + 许可证表），无需单独迁移命令。

许可证表时间字段均为 **毫秒时间戳**（`INTEGER`，与 `counters.updated_at` 一致）。若本地已有旧版 ISO 字符串格式的库，请删除 `data/product-releases.db` 后重启服务重建。
