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
| ws | ws://localhost:3002（`/health`） |
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
apps/worker   局調度 / 行情 / 結算
apps/ws       WebSocket 網關
.railway/     Railway IaC（railway.ts 描述整個 UAT 環境）
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

## 局引擎（W2 已完成）

- **局號** `round_no = floor(epoch/300)`。第 N 局下注期 `[N·300, N·300+300)`，鎖定期緊接 300 秒，所以任何時刻同時有一局「下注中」+ 一局「結算中」。
- **worker**（單一 leader，Redis `scheduler:leader` NX/PX 10 s 鎖，每秒 tick）：
  - 行情：同時連 Binance → OKX → Bybit 三路公共 WS，按優先級選一路寫 `price:BTCUSDT`，主源恢復 30 s 後切回；超過 15 s 無成交視為無價。
  - 鎖定：`lockAt` 取當下價為 `lock_price`；無價寬限 60 s，仍無價則 **VOID 退款**。
  - 結算：`closeAt` 取 `close_price`。漲 → 莊、跌 → 閒、相等 → 和（VOID 退款）。派彩走 `packages/shared/settlement.ts` 的 pari-mutuel 公式，每位贏家一筆 `PAYOUT` 帳本（冪等鍵 `settle:{roundId}:{userId}`），寫 `round_payouts`、`user_stats`，結果 LPUSH 到 `table:{id}:results`。
  - 行情斷線超過 60 s 不再開新局；worker 重啟後自動補建當前局並接續。
- **下注 API**（需登入）：`POST /rounds/:id/bets {side, amount, nonce}`（冪等鍵 `bet:{round}:{user}:{nonce}`）、`DELETE /rounds/:id/bets`（下注期內整局取消退款）、`GET /rounds/:id/bets/me`、`GET /tables/btc-updown/state`、`GET /tables/btc-updown/rounds`。
- **WS**（`apps/ws`）：`ws://host/?table=btc-updown&token=<access>`，連上先收 `hello` + `snapshot`，之後 `round.state` / `pool.update`（250 ms 合併）/ `price.tick` / `round.locked` / `round.settled`；帶 token 另收 `user.balance` / `user.payout`。
- **牌桌頁** `/`：即時價、倒數（以伺服器時間校正）、雙局狀態、賠率與彩池、籌碼下注 / 取消、珠盤路。W3 再做完整視覺。

### 本機驗證一局

```bash
pnpm dev                       # 等 worker 印出 acquired leadership
# /login 底部用暱稱進入 → 選籌碼 → 點 莊/閒
# 整點 :00/:05/:10… 鎖定，再 5 分鐘結算；右側路紙會出現珠子，頂部有輸贏提示
```

SQL 不變量（任何時刻都應成立）：

```sql
select u.nickname, b.amount, (select sum(amount) from ledger_entries l where l.user_id=u.id and l.currency='COINS')
from users u join balances b on b.user_id=u.id and b.currency='COINS';
```

## UAT 部署（Railway，新加坡）

Railway Project `bpredict`、Environment `uat`，整個環境由 **`.railway/railway.ts`（Infrastructure as Code）** 描述：Postgres、Redis、`api` / `ws` / `worker` / `web` 四個 GitHub 服務、build / start / pre-deploy / healthcheck、區域 `sin`、非機密變數。Railway 舊的 `railway.json` config-as-code 已廢棄，新服務不會讀取。

| 服務 | 公網 | UAT URL | 備註 |
| :--- | :--- | :--- | :--- |
| `api` | 是 | `https://api-uat-123a.up.railway.app` | pre-deploy：`pnpm db:deploy && pnpm db:seed` |
| `ws` | 是 | `wss://ws-uat.up.railway.app` | `/health` |
| `web` | 是 | `https://web-uat-3b0f.up.railway.app` | 這個網址填到 BotFather 的 Mini App |
| `worker` | 否 | — | **只能 1 個副本**（leader 鎖只是保險） |
| Postgres / Redis | 否 | — | 服務內以 `${{Postgres.DATABASE_URL}}`、`${{Redis.REDIS_URL}}` 引用 |

### 日常操作

```bash
npm i -g @railway/cli && railway login     # 一次
railway link --project bpredict            # 在倉庫根執行，選 uat
railway config plan                        # 比對 .railway/railway.ts 與 Railway 現況
railway config apply                       # 套用（會再顯示一次 diff 要你確認）
railway logs --service worker -d           # 運行日誌；-b 看 build 日誌
railway deployment list --service api
railway deployment redeploy --service api --yes
```

Windows 上 `railway config plan/apply` 若報「TypeScript SDK requires CLI ≥ 5.42」，是 SDK 用 `execFileSync("railway")` 找不到 `.cmd` 墊片；先 `$env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"` 再用 `& $env:_ config plan` 即可。

### 機密變數（不進 git）

`.railway/railway.ts` 內對機密用 `preserve()`，值只存在 Railway：

| 變數 | 服務 | 來源 |
| :--- | :--- | :--- |
| `JWT_SECRET` | api、**ws（兩邊必須相同）** | 隨機 48 字元，與本機不同 |
| `JWT_REFRESH_SECRET` | api | 隨機 48 字元 |
| `TELEGRAM_BOT_TOKEN` | api | `@BacPredict_bot` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Google Console（已加 `https://api-uat-123a.up.railway.app/auth/google/callback` 到重新導向 URI 才能用 Google 登入） |
| `RESEND_API_KEY` | api | Resend |

設定方式用**參數形式**：`railway variable set "KEY=value" --service api --skip-deploys`。**不要**在 Windows PowerShell 用 `--stdin`，它會在值前面塞一個 BOM（U+FEFF），Resend / JWT 會因此壞掉。

### 已踩過的坑

- **Turbo 快取吃掉 Prisma Client**：`prisma generate` 的輸出在 `node_modules/.prisma`，不在 turbo `outputs` 裡；Railway 第二次 build 快取命中 `db#build` 後 runtime 就沒有 client。已改成 `generate` 任務 `cache: false` 且 `db#build` 依賴它。
- 其他 `PORT` 由 Railway 注入，api / ws / web 都優先使用。

### 部署後檢查

1. `https://api-uat-123a.up.railway.app/health` 回 `ok`；`https://ws-uat.up.railway.app/health` 回 `{"status":"ok"}`；`railway logs --service worker -d` 看到 `acquired leadership` 與整點 `LOCKED` / `SETTLED`。
2. BotFather → `@BacPredict_bot` → Bot Settings → Menu Button / Mini App URL = `https://web-uat-3b0f.up.railway.app`。
3. 瀏覽器開 web 看到 TEST 水印；Telegram 內開 bot 自動登入。
4. 每次 push `main`，Railway 自動重新部署 4 個服務。
