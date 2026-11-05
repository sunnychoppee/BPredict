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
| admin | http://localhost:3000/admin（登入 email 需在 `ADMIN_EMAILS` 內） |

沒有 Docker 時 api 仍可啟動，`/health` 回 `degraded`，登入等需要資料庫的操作會失敗。

## 常用指令

```bash
pnpm typecheck              # 全部包 tsc
pnpm test                   # vitest
pnpm build                  # 全部包構建
pnpm db:generate            # 重新生成 Prisma Client
pnpm --filter @bpredict/db studio   # Prisma Studio 看資料
```

若本機的 Windows「應用程式控制」政策擋掉 `turbo.exe`（報 `spawn UNKNOWN` / `An Application Control policy has blocked this file`），改用不經 turbo 的等價指令：`pnpm -r --workspace-concurrency=1 typecheck`、`pnpm --filter <pkg> build`。Railway 上的 Linux build 不受影響。

## 目錄

```
apps/web      Next.js 15 — 網頁 + Telegram Mini App 同一套
apps/api      NestJS — 鑑權、帳本、商店、支付回調、排行、管理後台 API
apps/worker   局調度 / 行情 / 結算 / 公告
apps/ws       WebSocket 網關
.railway/     Railway IaC（railway.ts 描述整個 UAT 環境）
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
### 本機驗證一局

```bash
pnpm dev                       # 等 worker 印出 acquired leadership
# /login 底部用暱稱進入 → 選籌碼 → 點 莊/閒
# 整點 :00/:05/:10… 鎖定，再 5 分鐘結算；路紙會出現新格子，牌桌中央彈出結果橫幅
```

## 牌桌 UI 與設計系統（W3 已完成）

- **`packages/ui`**：籌碼（`Chip`/`ChipStack`）、金色按鈕與面板、倒數環、拔河條、大路 / 珠盤 / 統計、走勢圖（lightweight-charts）、WebAudio 音效。以原始碼形式被 `apps/web` 引用（`transpilePackages`），不需另外 build。
- **頁面**：手機底部五頁籤 **牌桌 `/` · 獎勵 `/rewards` · 商店 `/shop` · 排行 `/leaderboard` · 我的 `/me`**；PC 改為頂部導航 + 右側常駐路紙。
- **牌桌**：即時價 + 鎖盤價基準線走勢圖、倒數環（最後 10 秒變紅）、彩池拔河條與即時賠率、點莊/閒下注（籌碼飛入動畫）、`重複` / `加倍` / `撤銷`、結算橫幅與贏家金光、輸贏 toast、音效開關（右上角）。
- **我的**：頭像暱稱、金幣 / 寶石、戰績（`GET /me/stats`）、金幣流水（`GET /me/ledger` 分頁）、登出。
- **新 API**：`GET /economy`（公開經濟參數，前端用來顯示限額 / 籌碼 / 賠率）、`GET /me/stats`。
- **走勢圖資料**：worker 每秒把 tick 寫進 Redis `price:BTCUSDT:ticks`（600 筆），WS / REST `snapshot` 都帶 `ticks`，重新整理不會空白。

SQL 不變量（任何時刻都應成立）：

```sql
select u.nickname, b.amount, (select sum(amount) from ledger_entries l where l.user_id=u.id and l.currency='COINS')
from users u join balances b on b.user_id=u.id and b.currency='COINS';
```

## 每日獎勵、商店與支付（W4 已完成）

- **獎勵 `/rewards`**（`GET /rewards`、`POST /rewards/checkin|supply|relief|vip-daily`）：7 天簽到（斷簽歸零）、定時補給（每 4 h 一次、最多疊 2 次，能量條模型：`charges = floor((now − anchor) / interval)`）、救濟金（餘額 < 500 且簽到 / 補給都領完、每日一次）、VIP 每日金幣。每筆都是固定 idempotency key 的帳本紀錄（`checkin:{user}:{day}` 等），重複點擊不會多發；日界線為 **UTC+8**。
- **商店 `/shop`**（`GET /shop`、`POST /shop/orders`、`GET /shop/orders[/:id]`）：商品由 `products` 表驅動（seed 自 `DEFAULT_ECONOMY`：5 檔金幣包、4 檔寶石、VIP 月卡 30 天；Stars 價 = ceil(USDT × 50)）。首充 ×2（限一次、僅整額金幣包）；VIP 購買把 `users.vip_expires_at` 往後加 30 天並設 `is_vip`。
- **支付渠道**（`apps/api/src/shop/providers/*`，`PaymentProvider` 抽象）：

  | 渠道 | 下單 | 回調 | 啟用條件（缺任一即不在商店顯示） |
  | :--- | :--- | :--- | :--- |
  | NOWPayments（USDT TRC20 / BEP20 / TON） | `POST /v1/invoice`（浮動匯率；先查 `/v1/min-amount`，低於限額直接回可讀錯誤），`order_id` = 我方訂單 id | `POST /webhooks/nowpayments`，`x-nowpayments-sig` = HMAC-SHA512(排序後 JSON)；`finished` 全額入帳、`partially_paid` 按比例入帳、`expired` 關單 | `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` + `API_PUBLIC_URL`；非 production 需 `NOWPAYMENTS_SANDBOX=true`，或 `NOWPAYMENTS_ALLOW_LIVE=true` 臨時放行。已於 2026-11-05 以正式 API 在 UAT 驗證（TRC20 $12、BEP20 $5）；帳號為 Custody 模式，Primary Balance 應設 USDTBSC，否則所有鏈最低 ~11 USD；usdttrc20 本身最低 ~10.8 USDT |
  | Stripe（Checkout） | REST 建 Checkout Session（不用 SDK） | `POST /webhooks/stripe`，`Stripe-Signature` 以 raw body 驗簽（300 s 容忍）；`checkout.session.completed` 入帳、`expired` 關單、`charge.dispute.created` 目前只記警告 | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`；非 production 拒絕 `sk_live_` |
  | Telegram Stars（僅 Mini App 內顯示） | Bot API `createInvoiceLink`（XTR），前端 `Telegram.WebApp.openInvoice` | `POST /webhooks/telegram`，`X-Telegram-Bot-Api-Secret-Token`；`pre_checkout_query` 核對訂單 / 價格後 `answerPreCheckoutQuery`，`successful_payment` 以 `telegram_payment_charge_id` 幂等入帳。api 啟動時自動 `setWebhook` | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` + `API_PUBLIC_URL` |
  | 測試支付（DEV） | 下單即入帳 | — | `APP_ENV !== production`（UAT / 本機用來驗證入帳流程） |

- **入帳幂等**：`payments` 以 `(provider, provider_order_id)` 唯一；`ShopService.settle()` 用條件更新搶 `PENDING → 終態`，帳本 key `payment:{orderId}:coins|gems`。回調重放、兩個 webhook 同時到都只會入帳一次。
- **本機驗證**：商店選「測試支付」買金幣包 → 首充 ×2 到帳、`/me` 流水出現 `PURCHASE`；買 VIP 後 `/rewards` 可領 VIP 每日金幣。`apps/api/src/shop/signatures.test.ts` 覆蓋三家驗簽。

## 排行榜、對局紀錄、公告、管理後台與 i18n（W5 已完成）

- **排行 `/leaderboard`**（`GET /leaderboard?board=profit|winrate|streak&period=day|week|season`，匿名可看、帶 token 會多回 `me`）：資料來自 `user_stats_daily`（結算事務內按 UTC+8 日期彙總：局數 / 勝場 / 下注 / 淨勝 / 當日最長連勝）。日榜 00:00 UTC+8 重置、週榜週一重置、賽季自 `season_start` 起每 `season_days`（28）天一季。淨勝榜只列淨勝 > 0；勝率榜日榜需 ≥ 20 局、週 / 季 ≥ 50 局（`leaderboard_min_rounds*`）；連勝榜需 ≥ 2 連。前 50 名，api 端 20 s 快取；我的名次另算（1 + 比我好的人數）。遷移 `w5_backfill_daily_stats` 會從歷史 `bets` / `round_payouts` 回填舊資料。
- **對局紀錄 `/history`**：牌桌開獎（`GET /tables/:id/rounds`）與我的下注（`GET /me/rounds?limit&before`：每局合併我的注額、派彩（含連勝加成）、淨勝；和局 / 無效顯示退還）。路紙面板與「我的」頁都有入口。
- **公告（牌桌頂部跑馬燈）**：WS `announce` 事件，`kind = big_bet | streak | dragon | leader`。大注（≥ `announce_big_bet` = 50,000）由 api 下注成功後發；連勝里程碑（`streak_bonus` 的 3 / 5 / 10 連）、長龍（≥ `announce_dragon_len` = 8 連同色）與今日淨勝榜首易主由 worker 結算後發。長龍與榜首另外彈 toast；牌桌狀態列顯示自己的當前連勝。
- **個人中心**：`PATCH /me { nickname?, locale? }`（暱稱 2–24 字）；語言切換立即生效並寫回用戶 `locale`；`GET /me` 多回 `isAdmin`。
- **i18n**：`next-intl`（無路由前綴，純客戶端 provider），字典在 `apps/web/messages/{zh-Hant,en}.json`。語言來源：localStorage `bp.locale` → 用戶 profile → 瀏覽器語言（zh* → 繁中，其餘英文）。莊 / 閒 兩個大字與路紙珠子保留中文（百家樂慣例）。
- **管理後台 `/admin`**（取代原規劃的 AdminJS 獨立服務，見 TECH_DESIGN §7.5）：登入 email 在 `ADMIN_EMAILS`（逗號分隔）內的帳號才看得到入口、API `AdminGuard` 每次請求重新核對。功能：總覽（用戶 / 金幣流通 / 今日局數 / 支付）、經濟參數熱更（JSON 值、型別須與預設一致，30 s 內生效）、商品上下架 / 改價、用戶搜尋（暱稱 / email / id）→ 餘額 / 戰績 / 帳本、**手動調整餘額（走帳本 `ADMIN_ADJUST`，不直寫 `balances`）**、凍結 / 解凍、加減 VIP 天數、支付列表（可按狀態篩）、開獎列表、操作稽核（所有寫操作落 `admin_actions`）。本機測試：`.env` 設 `ADMIN_EMAILS=admin@dev.local` 後用開發登入暱稱 `admin`。

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
| `API_PUBLIC_URL` | api | `https://api-uat-123a.up.railway.app`（非機密，支付回調 / Telegram webhook 需要） |
| `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` | api | NOWPayments 已停止提供 Sandbox（2026-11-05 客服確認）。平時 UAT 留空；要做一次性真實 USDT 小額測試時填正式金鑰並設 `NOWPAYMENTS_SANDBOX=false` + `NOWPAYMENTS_ALLOW_LIVE=true`（缺後者 api 會拒絕啟動），測完三個一起清掉。IPN URL `<API_PUBLIC_URL>/webhooks/nowpayments` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | api | Stripe **Test** 模式 `sk_test_…`；Webhook endpoint `<API_PUBLIC_URL>/webhooks/stripe`，事件 `checkout.session.completed`、`checkout.session.expired`、`charge.dispute.created` |
| `TELEGRAM_WEBHOOK_SECRET` | api | 隨機 32+ 字元；api 啟動時會對 `@BacPredict_bot` `setWebhook` |
| `ADMIN_EMAILS` | api | 可進 `/admin` 的登入 email（逗號分隔，小寫）；留空 = 後台關閉 |

沒設定的渠道在商店中不會出現；UAT 永遠只用 sandbox / test 金鑰，api 啟動時若在非 production 偵測到 `sk_live_` 或 `NOWPAYMENTS_SANDBOX=false` 會直接拒絕啟動。

設定方式用**參數形式**：`railway variable set "KEY=value" --service api --skip-deploys`。**不要**在 Windows PowerShell 用 `--stdin`，它會在值前面塞一個 BOM（U+FEFF），Resend / JWT 會因此壞掉。

### 已踩過的坑

- **Turbo 快取吃掉 Prisma Client**：`prisma generate` 的輸出在 `node_modules/.prisma`，不在 turbo `outputs` 裡；Railway 第二次 build 快取命中 `db#build` 後 runtime 就沒有 client。已改成 `generate` 任務 `cache: false` 且 `db#build` 依賴它。
- 其他 `PORT` 由 Railway 注入，api / ws / web 都優先使用。

### 部署後檢查

1. `https://api-uat-123a.up.railway.app/health` 回 `ok`；`https://ws-uat.up.railway.app/health` 回 `{"status":"ok"}`；`railway logs --service worker -d` 看到 `acquired leadership` 與整點 `LOCKED` / `SETTLED`。
2. BotFather → `@BacPredict_bot` → Bot Settings → Menu Button / Mini App URL = `https://web-uat-3b0f.up.railway.app`。
3. 瀏覽器開 web 看到 TEST 水印；Telegram 內開 bot 自動登入。
4. 每次 push `main`，Railway 自動重新部署 4 個服務。**前提**：Railway 的 GitHub App 必須對 `sunnychoppee/BPredict` 有存取權（Railway → Account → GitHub「Configure repo access」→ 勾選此 repo）。若服務 Settings → Source 顯示「Auto deploy unavailable / Could not load branches」，代表 App 尚未授權，push 不會觸發；此時可手動觸發：`railway service source connect --repo sunnychoppee/BPredict --branch main --service <svc>`（會立刻用 main 最新 commit 建置一次）。
