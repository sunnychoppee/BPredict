# BPredict

百家樂節奏的 BTC 漲跌預測遊戲（虛擬金幣，不可提現）。文檔見 `PRD_v2.md`、`TECH_DESIGN.md`。

## 本地開發

需要 Node 20+、pnpm 9、Docker Desktop（Postgres + Redis）。

```bash
pnpm install
cp .env.example .env        # 填入密鑰
docker compose up -d        # Postgres 5432 / Redis 6379
pnpm db:migrate             # 建表（首次會問 migration 名稱，直接 Enter）
pnpm db:seed                # 寫入經濟參數初始值
pnpm dev                    # 同時啟動 web / api / worker / ws
```

| 服務 | 地址 |
| :--- | :--- |
| web | http://localhost:3000 |
| api | http://localhost:3001（`/health`） |
| ws | ws://localhost:3002（W2） |
| admin | http://localhost:3003（W5） |

沒有 Docker 時 api 仍可啟動，`/health` 回 `degraded`，登入等需要資料庫的操作會失敗。

## 常用指令

```bash
pnpm typecheck              # 全部包 tsc
pnpm test                   # vitest
pnpm build                  # 全部包構建
pnpm db:generate            # 重新生成 Prisma Client
pnpm --filter @bpredict/db studio   # Prisma Studio 看資料
```

## 目錄

```
apps/web      Next.js 15 — 網頁 + Telegram Mini App 同一套
apps/api      NestJS — 鑑權、帳本、商店、支付回調
apps/worker   局調度 / 行情 / 結算（W2）
apps/ws       WebSocket 網關（W2）
apps/admin    AdminJS 後台（W5）
packages/shared  型別、zod、常量、經濟參數預設值
packages/db      Prisma schema、遷移、seed
packages/ui      設計系統組件（W3）
```

## 登入方式（W1 已完成）

- **Telegram Mini App**：開啟 `https://t.me/BacPredict_bot` 自動以 `initData` 登入。
- **Google**：`/login` → `GET /auth/google`（PKCE + state cookie）→ 回跳 `/auth/callback`。
- **Email 魔法連結**：`/login` 輸入信箱 → Resend 寄信 → `/auth/magic?token=`。
- **本機開發登入**：`APP_ENV=local` 時 `/login` 底部可直接以暱稱進入，其他環境回 401。

新帳號自動發放新手禮包（`economy_params.welcome_pack`，預設 20,000 金幣），冪等鍵 `welcome:{userId}`。
