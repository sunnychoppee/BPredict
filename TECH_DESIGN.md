# 技术方案 v1：「庄闲 · BTC 涨跌预测游戏」

> 版本：v1.7 · 日期：2026-11-04 · 对应产品文档：`PRD_v2.md`（v1.7：补 §7.5 W5 实现备注、§13 后台决策改为自建；v1.6：补 §7.4 W4 实现备注；v1.5：补 §3.5 W3 实现备注；v1.4：§5.5 W2 实现备注、§9.7 Railway 部署方式）
> 状态：UI / UAT / 第三方准备项已于 2026-11-01 确认

---

## 1. 总体架构

```
[Next.js Web / Telegram Mini App]
          │  HTTPS (REST)        │  WSS (实时)
          ▼                      ▼
   [API 服务 (NestJS)]     [WS 网关 (ws + Redis Pub/Sub)]
          │                      ▲
          ▼                      │ publish
   [PostgreSQL]  ◄────►  [Redis]  ◄────  [Worker: 局调度 / 行情 / 结算 / 定时任务]
          ▲                                     ▲
          │ webhooks                            │ WebSocket
   [加密收单 / Stripe / Telegram]          [Binance / OKX / Bybit]
```

- 全栈 TypeScript，pnpm + Turborepo monorepo。
- MVP 以"一个 API 进程 + 一个 Worker 进程 + 一个 WS 网关进程"部署，均可水平扩展；Worker 内的局调度器通过 Redis 锁保证单领导者。
- MVP **不持有任何私钥、不部署任何合约**，加密收款全部由第三方收单服务商托管。

---

## 2. 仓库结构

```
apps/
  web/        Next.js 15（App Router），同时服务网页与 Telegram Mini App
  api/        NestJS：REST、鉴权、账本、商店、支付回调、后台接口
  worker/     局调度、行情采集、结算、排行榜快照、定时任务
  ws/         WebSocket 网关，订阅 Redis 频道向客户端推送
  （运营后台不再独立成 app：W5 起为 api/src/admin 模块 + web/src/app/admin 页，见 §7.5）
packages/
  shared/     类型、zod schema、常量、WS 事件协议、路纸算法、结算算法
  db/         Prisma schema 与迁移
  ui/         设计系统组件（赌场风主题）
  config/     eslint / tsconfig / tailwind preset
```

---

## 3. 前端

### 3.1 技术选型

| 领域 | 选型 |
| :--- | :--- |
| 框架 | Next.js 15 + React 19 + Tailwind CSS |
| 状态 | Zustand（客户端）、TanStack Query（服务端数据） |
| Telegram | `@telegram-apps/sdk-react` |
| 动效 | Framer Motion（筹码飞入 / 堆叠）、CSS |
| 图表 | `lightweight-charts`（BTC 走势）、Canvas（路纸、拔河条） |
| i18n | `next-intl`：繁中 / 英文 / 简中 |
| 音效 | Howler.js，首次交互后解锁音频上下文 |

不引入 Three.js；筹码用带金属边的 2D 渲染。

### 3.2 Telegram Mini App 与网页共用

- 同一套代码，运行时检测 `window.Telegram.WebApp` 判断环境。
- TMA：启动读取 `initData` 交后端校验换 JWT；支付入口走 Stars（W4 起）。强制赌场主题，不跟随 Telegram 浅色；`requestFullscreen()`；`headerColor` / `backgroundColor` = `#0B3D2E`；padding 计入 `safeAreaInset` / `contentSafeAreaInset`。
- 网页：Google / 邮箱登录；支付入口走 USDT 收单 + Stripe（W4 起）。
- **首屏**：两端均直进牌桌（MVP 单桌）。
- **导航**：Mini App 与手机网页为底部 5 Tab（牌桌 / 奖励 / 商店 / 排行 / 我的）；PC 为顶栏 + 牌桌右侧路纸常驻，无底部 Tab。
- 默认语言 `zh-Hant`；`next-intl` 提供 `en` / `zh-Hans`。

### 3.2.1 设计令牌（全赌场风）

| 令牌 | 值 | 用途 |
| :--- | :--- | :--- |
| `--felt` | `#0B3D2E` | 桌面绒布 |
| `--felt-dark` | `#071F18` | 页面底、Tab 栏 |
| `--gold` | `#C9A24D` | 描边、主按钮、金额 |
| `--gold-bright` | `#E8C97A` | 高光 |
| `--banker` | `#B3252D` | 庄 / 涨 |
| `--player` | `#1F4E9A` | 闲 / 跌 |
| `--cream` | `#F4E8C1` | 正文 |
| `--void` | `#8A8A8A` | 作废局 |

- 数字金额用衬线或 tabular-nums 高对比字体；正文无衬线。
- 筹码为带金属边的 2D PNG/SVG，不使用 Three.js。
- UAT 在牌桌角落打半透明 `TEST` 水印，production 去掉。

### 3.2.2 手机牌桌线框（Mini App / 手机网页）

```
┌─────────────────────────────┐
│ Logo   BTC $xx,xxx   金币 钻 │  ← 顶栏，点余额进商店
│        下注中 02:14          │
│ ~~~~ 走势图 / 锁盘价基准线 ~~ │
│ ████ 拔河 庄池 vs 闲池 ████ │
│ ┌────庄 ×1.92──┐┌──闲 ×2.14┐ │
│ │   BANKER     ││  PLAYER  │ │
│ └──────────────┘└──────────┘ │
│ 我的本局：庄 5,000            │
│ ▾ 路纸（大路 / 珠盘，可展开）  │
│ [100][500][1k][5k][10k][50k] │
│ [重复]  [加倍]  [撤销]        │
├─────────────────────────────┤
│ 牌桌  奖励  商店  排行  我的  │  ← 底部 Tab
└─────────────────────────────┘
```

### 3.2.3 PC 牌桌线框

```
┌─ 顶栏：Logo · 金币/钻石 · 奖励 · 商店 · 排行 · 头像 ──────────┐
│  左：牌桌主体（曲线、庄闲、筹码栏）  │  右：大路 + 珠盘 + 统计  │
└────────────────────────────────────┴────────────────────────┘
```

### 3.3 实时客户端

- 原生 WebSocket，自动重连（指数退避）、心跳、服务器时间偏移校准（连接时三次 ping 取中位数）。
- 订阅事件：

| 事件 | 频率 | 内容 |
| :--- | :--- | :--- |
| `round.state` | 状态迁移时 | 当前双局（BETTING / LOCKED）的 id、阶段、截止时间、锁盘价 |
| `pool.update` | 节流 250ms | 庄池 / 闲池 / 即时赔率 |
| `price.tick` | 1s | 最新价、数据源 |
| `round.locked` | 每 5 分钟 | 锁盘价快照 |
| `round.settled` | 每 5 分钟 | 结算价、胜方、派发汇总 |
| `user.balance` | 用户私有 | 金币 / 钻石余额、变动原因 |
| `user.payout` | 用户私有 | 本局派发额、连胜加成 |
| `announce` | 触发时 | 大额下注、连胜、长龙、榜首易主 |

### 3.4 路纸算法

- 大路 / 珠盘路算法放在 `packages/shared`，服务端与客户端共用。
- 客户端拿到结果序列（最近 500 局）本地绘制，新结果增量追加，不重绘整图。
- 大路规则：同色向下延伸，换色换列；遇到下方被占或到底则向右拐（"拐弯龙"），作废局不占格、以灰点标在上一格角落。

### 3.5 实现备注（W3 as-built，2026-11-04）

- **设计系统 `packages/ui`**（以源码形式被 `apps/web` 经 `transpilePackages` 引用，不单独打包）：`Chip`/`ChipStack`（SVG 筹码，金边 + 奶白齿纹，按面额配色）、`GoldButton`/`Panel`/`Card`/`Pill`、`CountdownRing`（最后 10 秒变红脉冲）、`TugOfWar`（庄闲彩池拔河条 + 即时赔率）、`BigRoad`/`BeadRoad`/`RoadStats`、`PriceChart`（lightweight-charts v5，面积图，锁盘价虚线基准，涨红跌蓝）、`SoundEngine`（WebAudio 合成音，无音频文件；首次手势 `unlock()`，静音状态存 `localStorage bp.sound`）。
- 与 §3.4 的差异：路纸算法放在 `packages/ui/src/road.tsx`（纯函数 `buildBigRoad` 可独立测试），服务端目前不需要画路，故未放 `shared`。
- **走势图数据**：worker 每秒把 tick `LPUSH price:{symbol}:ticks`（保留 600 条），ws/api 的 `snapshot` 带 `ticks`，客户端再按 `price.tick` 增量追加，上限 720 条，刷新页面图表不空白。
- **新增 REST**：`GET /economy`（公开经济参数：桌费、种子池、限额、筹码面额、连胜加成、新手礼包），`GET /me/stats`（总局数 / 胜场 / 当前与最长连胜 / 净胜）。
- **页面结构**：`AppShell` = 顶栏（logo · BTC 价 · 金币/钻石 → 商店 · 音效开关）+ 手机底部五页签（牌桌 / 奖励 / 商店 / 排行 / 我的，含 safe-area）+ PC 顶部导航；PC 牌桌右侧 320px 常驻路纸（大路 + 珠盘 + 统计 + 近 14 局），手机路纸在下注区下方可折叠、大路/珠盘切换。
- **牌桌交互**：点庄/闲即以当前筹码下注，筹码从托盘飞向投注区（framer-motion）；`重複`（重下上一局的注）、`加倍`、`撤銷`；结算时弹出结果横幅（庄胜 / 闲胜 / 和局 + 锁盘价 → 结算价 + 本人盈亏 + 连胜），赢家投注区金光脉冲 3 次；最后 3 秒禁止下注，避免打到锁盘边界。
- **音效提示**：选筹 / 下注 / 撤销 / 锁盘 / 倒数最后 5 秒 / 赢 / 输 / 和。
- 奖励、商店、排行三页为 W4/W5 占位页（展示规划条目，带「即將開放」标记）；「我的」页已完成（资料、余额、战绩、金币流水分页、登出）。

---

## 4. 后端（API）

### 4.1 技术选型

- NestJS + Prisma + zod 校验。
- JWT（Access 15 分钟）+ Refresh Token（30 天，数据库存储、可吊销）。

### 4.2 鉴权

| 方式 | 实现 |
| :--- | :--- |
| Telegram | `initData` HMAC-SHA256 校验（以 Bot Token 派生密钥），`auth_date` 过期 5 分钟 |
| Google | OAuth 2.0 + PKCE |
| 邮箱 | 魔法链接（Resend），15 分钟有效、一次性 |

账号绑定表 `auth_identities(provider, provider_uid, user_id)`，同一 provider_uid 唯一。

### 4.3 账本（核心）

- **不可变账本** `ledger_entries`：`user_id, currency, amount(±), type, ref_type, ref_id, balance_after, idempotency_key, created_at`。
- `balances` 表作为余额缓存；任意时刻 `Σ ledger_entries.amount = balances.amount`，可重放校验。
- **所有**金币 / 钻石变动必须经账本服务，禁止任何直接写 `balances` 的代码路径。
- 幂等键示例：
  - 下注 `bet:{round_id}:{user_id}:{client_nonce}`
  - 撤销 `bet_cancel:{bet_id}`
  - 派发 `settle:{round_id}:{user_id}`
  - 退回 `void:{round_id}:{user_id}`
  - 支付 `payment:{provider}:{order_id}`
  - 每日奖励 `daily:{user_id}:{yyyy-mm-dd}:{slot}`
- 数据库唯一约束 `(idempotency_key)` 兜底。

### 4.4 下注流程

```
POST /rounds/:id/bets  { side, amount, nonce }
  事务：
    SELECT round FOR SHARE → 状态必须为 BETTING 且未到 lock_at
    校验余额 ≥ amount、本局累计 ≤ 用户上限
    INSERT bets
    账本写 −amount（type=BET）
    COMMIT
  事务外：
    Redis HINCRBY table:{id}:round:{rid} pool:{side} amount
    PUBLISH table:{id}:pool.update（网关侧节流）
```

撤销仅 BETTING 状态，反向账本条目，Redis 池量回退。

---

## 5. 局引擎（Worker）

### 5.1 状态机

```
SCHEDULED → BETTING → LOCKED → SETTLED
                         └───→ VOIDED（平价 / 数据源不可用）
```

### 5.2 调度

- 局号 `round_no = floor(epoch_seconds / 300)`，按 UTC 5 分钟墙钟对齐；`bet_start_at = round_no × 300`，`lock_at = bet_start_at + 300`，`close_at = lock_at + 300`。
- 调度器每秒 tick；用 Redis `SET scheduler:leader {instance_id} NX PX 10000` 竞选领导者，领导者每 3 秒续期，失效后其他实例 10 秒内接管。
- 每次 tick 检查：是否需创建下一局（提前 10 秒创建为 SCHEDULED，到点转 BETTING）、是否有局到达 `lock_at`、是否有局到达 `close_at`。
- 所有状态迁移先写数据库（带状态前置条件的 `UPDATE ... WHERE status = ?`），成功后再发布事件，保证接管后不重复执行。

### 5.3 行情采集

- 独立协程订阅 Binance `wss://stream.binance.com:9443/ws/btcusdt@trade`。
- 每条成交写 Redis `price:BTCUSDT = {price, source, ts}`；每秒发布 `price.tick`。
- 健康检测：主源 10 秒无更新 → 切 OKX（`wss://ws.okx.com:8443/ws/v5/public`，`trades` 频道）→ 再 10 秒切 Bybit。主源恢复后 30 秒稳定即切回。
- 锁盘 / 结算时读取 Redis 最新价，落库 `rounds.lock_price / close_price / price_source`。
- 数据过期策略：若最新价时间戳距当前 > 15 秒，视为不可用，触发延后结算逻辑（最多 60 秒，仍不可用则 VOIDED）。

### 5.4 结算算法

```ts
function settle(round, bets, params) {
  const { f, S } = params;                       // 桌费率、每边底池
  const B = sum(bets where side == BANKER);
  const P = sum(bets where side == PLAYER);

  if (round.closePrice === round.lockPrice) {
    refundAll(bets);                             // 幂等键 void:{round}:{user}
    return markVoided(round);
  }

  const winner = round.closePrice > round.lockPrice ? BANKER : PLAYER;
  const W = winner === BANKER ? B : P;

  const fee = Math.floor((B + P) * f);
  const distributable = (B + P) - fee + S;       // 底池 S 随胜方一起分配
  const payoutPerUnit = distributable / (W + S); // 胜方每 1 金币获得

  let paidTotal = 0;
  for (const user of winnersGroupedByUser) {
    const base = Math.floor(user.stake * payoutPerUnit);
    const bonus = streakBonus(user, base, fee, params); // 从 fee 支出，封顶
    credit(user, base + bonus, `settle:${round.id}:${user.id}`);
    paidTotal += base + bonus;
  }

  const destroyed = (B + P + S) - paidTotal;     // 桌费 + 底池份额 + 取整差额
  recordRoundResult(round, { B, P, fee, winner, payoutPerUnit, destroyed });
}
```

- 整段在单事务内完成，派发批量写账本；事务失败整体回滚，领导者接管后重跑同样幂等。
- 连胜加成从本局 `fee` 中支出、单局总加成不超过 `fee`，且单人封顶 20,000。
- 结算后：写 `round_results`、更新 Redis 结果序列（`LPUSH table:{id}:results`, `LTRIM 0 499`）、排行榜 sorted set、`user_stats` 连胜计数，发布 `round.settled` 与各用户 `user.payout`。

### 5.5 实现备注（W2 as-built，2026-11-03）

- 代码位置：`apps/worker/src/engine.ts`（调度 + 锁盘 + 结算 + VOID）、`apps/worker/src/price-feed.ts`（三源行情）、`packages/shared/src/settlement.ts`（纯函数 + 单测）。
- 与 §5.2 的差异：不提前 10 秒创建，而是每 tick `upsert` 当前局与下一局（幂等，重启后自动补建）；下注期结束时把 Redis 实时彩池快照进 `rounds.pool_*`，结算时以数据库 `bets` 重算为准。
- 与 §5.3 的差异：三路 WS **常连**，不是故障时才连；切换只改「当前取数源」，因此切换零延迟。Bybit 用 `publicTrade.BTCUSDT`，OKX 用 `trades BTC-USDT`。
- 行情中断 > 60 秒时停止开新局（已开的局按 60 秒宽限 → VOID 退款处理）。
- `round_results` 表未单建，结果直接读 `rounds`（`status in (SETTLED, VOIDED)`）；排行榜 sorted set 留到 W5 排行页一起做。
- 实测：本地跑通 `LOCKED @ 77073.33 → SETTLED PLAYER @ 77036.01`，`ppu = 1.225`，赢家 3000 → 3675，Σledger = balance 对所有用户成立。

---

## 6. 实时网关（WS）

- `ws` 库；按桌（room）维度广播，订阅 Redis 频道 `table:{id}:*` 与 `user:{id}:*`。
- 连接时携带 JWT；用户私有事件只投递给该用户的连接。
- 节流：`pool.update` 合并为 250ms 一次；`price.tick` 1 秒一次。
- 连接上限与心跳：30 秒无 pong 断开；单 IP 连接数上限 20。
- 无状态，水平扩展靠 Redis Pub/Sub。

---

## 7. 支付

### 7.1 统一抽象

```ts
interface PaymentProvider {
  createOrder(input: { userId; sku; chain? }): Promise<{ orderId; payUrl | address; expiresAt }>;
  verifyWebhook(req): boolean;
  parseWebhook(req): { orderId; status; paidAmount; asset; txHash? };
}
```

Webhook 流程：验签 → 查 `payments` 订单 → 状态迁移（PENDING → PAID / UNDERPAID / EXPIRED）→ 账本幂等入账 → 推送 `user.balance`。

### 7.2 渠道

| 渠道 | 实现要点 |
| :--- | :--- |
| USDT 收单 | **NOWPayments**（已确认，备选 Cryptomus）；MVP 开 TRC20 / BEP20 / TON；`POST /v1/payment` 按订单生成地址，IPN 回调以 `x-nowpayments-sig`（HMAC-SHA512）验签；状态 `finished` 入账、`partially_paid` 按比例入账、`expired` 关闭；浮动汇率（固定汇率会使最低额翻倍）；下单前查 `/v1/min-amount`；无 Sandbox，已用正式 API 小额验证 |
| Stripe | Checkout Session；`checkout.session.completed` 入账；`charge.dispute.created` 冻结购买能力 |
| Telegram Stars | Bot API `createInvoiceLink`；处理 `pre_checkout_query`（校验 SKU 与价格）与 `successful_payment`；以 `telegram_payment_charge_id` 幂等 |

### 7.3 商品配置

`products` 表驱动：SKU、类型（coins / gems / vip / pass / skin）、各渠道价格、赠送比例、首充标记、上下架时间。后台热更，不发版。

### 7.4 实现备注（W4 as-built，2026-11-04）

- **模块**：`apps/api/src/rewards`（免费发放）与 `apps/api/src/shop`（商品、订单、渠道适配器、Webhook）。渠道实现 `PaymentProviderAdapter { enabled(); createCheckout(ctx) }`，位于 `shop/providers/*`；可用渠道由环境变量是否齐备决定，`GET /shop` 返回 `channels[].enabled` 供前端渲染。
- **表**：`user_rewards`（签到连击 / 上次签到日 / 补给锚点 / 救济日 / VIP 日领日 / 首充时间）、`products`、`payments`（`(provider, provider_order_id)` 唯一；状态 `PENDING | PAID | PARTIALLY_PAID | EXPIRED | FAILED | REFUNDED`）、`users.vip_expires_at`；`LedgerType` 增加 `VIP_DAILY`。
- **奖励规则**：日界线 UTC+8（`rewardDay()` in `@bpredict/shared`）。签到连击只在"昨天已签"时延续；补给为能量条模型（锚点 + 间隔，领取时锚点前移一格并钳制到 `now − maxStack × interval`，不会超额累积）；救济金 = 余额 < 500 且当日签到已领、补给已空。所有领取在事务内先以条件 `updateMany` 抢占（`count === 1`），再 `postLedgerEntry`，key 形如 `checkin:{user}:{day}` / `supply:{user}:{anchorTs}`。
- **结算 `ShopService.settle()`**：事务内读订单 → 只处理 `PENDING` → 计算入账（`ratio` 1 = 全额，`partially_paid` 按 `actually_paid / pay_amount`；首充仅整额金币包、以 `user_rewards.first_charge_at IS NULL` 的条件更新抢占一次；VIP 从 `max(now, vip_expires_at)` 起加 30 天）→ 条件更新订单到终态 → 账本 `payment:{orderId}:coins|gems` → 事务外推送 `user.balance`。重放 / 并发回调仅入账一次（已用脚本验证 Stripe、NOWPayments finished / partially_paid、Stars 重放）。
- **Webhook 验签**：Nest `rawBody: true`；Stripe 以 `t.rawBody` HMAC-SHA256、300 s 容忍；NOWPayments 以排序键 JSON 的 HMAC-SHA512；Telegram 以 `X-Telegram-Bot-Api-Secret-Token` 常量时间比较。验签失败 403，未配置渠道 503，业务映射异常不抛（记日志、回 200 以免服务商无限重试）。
- **前端**：`/rewards` 7 格签到条 + 补给能量格倒计时 + VIP / 救济卡片；`/shop` 商品卡（首充时显示 ×2 对比价）、渠道选择 sheet（USDT 链、信用卡、Stars 仅 Telegram 内、测试支付仅非 production）、托管收银台以 `?order=<id>&result=` 回跳后轮询订单直至终态；购买记录列表。头部余额在非牌桌页无 WS，购买成功后主动拉 `/me/balances` 刷新。
- **未做 / 后续**：`charge.dispute.created` 仅告警未冻结；赛季通行证、皮肤类商品未上架（W5+）；Bot `/start` 仅回一句欢迎语；NOWPayments 已用正式 API 在 UAT 小额验证通过（见 §9.8）；待办：IPN `payin_hash` 落库到 `payments.tx_hash`；USDT 渠道按 `/v1/min-amount` 隐藏低于限额的档位（TRC20 下 $5 / $9.99 / $10 不可付）；Telegram Stars 真实付款待在 Mini App 内用少量 Stars 验证。

### 7.5 实现备注（W5 as-built，2026-11-04：排行、记录、公告、后台、i18n）

- **表**：`user_stats_daily (user_id, day) PK`（局数 / 胜场 / 下注 / 净胜 / 当日最长连胜），由 worker 在结算事务内与 `user_stats` 同时 upsert；`admin_actions`（管理员 / 动作 / 目标 / payload / 时间）。迁移 `w5_backfill_daily_stats` 以 `bets ⋈ rounds ⟕ round_payouts` 回填历史并用窗口函数重建连胜。
- **排行榜**：没有用 Redis sorted set，直接对 `user_stats_daily` 按区间 `SUM`（`apps/api/src/leaderboard`），top 50 进程内缓存 20 s、按 (board, period, range, minRounds) 分键；"我的名次" 单独查（1 + 严格优于我的人数），`qualified` 与 SQL `HAVING` 条件一致（净胜 > 0 / 局数门槛 / 连胜 ≥ 2）。区间计算在 `@bpredict/shared/leaderboard.ts::periodRange`（日 = UTC+8 日；周 = 周一 00:00 UTC+8；赛季 = `season_start` 起每 `season_days` 天），有单测。规模到万级活跃用户前这条路径足够（索引 `(day)` + 分组），之后再切 Redis。
- **公告**：复用 W2 预留的 WS `announce` 事件，新增 `kind: "leader"`。大注由 api `RoundsService.placeBet` 成功后发（阈值 `announce_big_bet`）；连胜里程碑（`streak_bonus` 的档位）、长龙（读 `table:results` 缓存连续同色 ≥ `announce_dragon_len`，和局不断龙）、今日净胜榜首易主（结算前后各查一次）由 worker 在结算后异步发，失败只记日志不影响结算。前端跑马灯保留最近 20 条，只有长龙 / 榜首弹 toast。
- **运营后台**：**改为 api 内 `admin` 模块 + web `/admin` 页，不再起 AdminJS 独立服务**（见 §13 决策更新）。鉴权 `AdminGuard`：Bearer token 有效且用户任一 identity email ∈ `ADMIN_EMAILS`（每次请求查库，撤权即时生效；列表为空则整个后台 403）。所有写操作先执行再 `admin_actions` 落库；余额调整只能经 `LedgerService.post(type: ADMIN_ADJUST)`，key `admin:{adminId}:{ts}:{rand}`，余额不足时拒绝（账本非负约束）。经济参数写入前校验 JSON 类型与 `DEFAULT_ECONOMY` 一致并 `EconomyService.invalidate()`；worker 侧 30 s 缓存自然过期。
- **i18n**：`next-intl` 仅用客户端 `NextIntlClientProvider`（不走 `[locale]` 路由，Telegram Mini App 的 URL 保持不变），语言状态在 zustand（`apps/web/src/lib/i18n.tsx`），非 React 代码（WS toast）用 `createTranslator` 的 `tr()`。`packages/ui` 组件新增 `labels` 入参以保持无依赖。`LOCALES` 里的 `zh-Hans` 暂映射到繁中字典。
- **未做 / 后续**：排行奖励（前三名宝石 / 头像框）与好友榜；后台的局作废 / 重算、群发公告、导出；admin 操作二次确认与 2FA（上线前配合 Cloudflare Access）。
- **UAT 走查修正（2026-11-05）**：`DELETE /rounds/:id/bets?scope=last` 只退最近一笔，牌桌「撤銷」改为撤最后一笔、新增「清空」撤全部（对齐 PRD §"撤销本局最后一笔 / 锁盘前可撤销全部"）；worker 行情 `tick` 改为不重入 + 捕获异常（三家交易所同时超时时曾因 `active` 被并发 tick 置空而崩溃）；TEST 水印在手机上移到底部 Tab 之上；英文界面补齐图表锁盘标签、支付渠道名、商品名、日期格式。UAT 测试账号用 ssh 进 api 容器直接写 `magic_links` 生成登录链接（不经 Resend）。

---

## 8. 数据模型（核心表）

| 分组 | 表 |
| :--- | :--- |
| 用户 | `users`、`auth_identities`、`refresh_tokens`、`devices` |
| 资产 | `balances`、`ledger_entries` |
| 局 | `tables`、`rounds`（round_no、status、bet_start_at、lock_at、close_at、lock_price、close_price、price_source、pool_banker、pool_player、fee、winner、payout_per_unit、destroyed）、`bets`、`round_payouts` |
| 统计 | `user_stats`（total_rounds、wins、current_streak、max_streak、net_profit）、`leaderboard_snapshots` |
| 支付 | `payments`（provider、order_id、status、asset、chain、amount、credited_coins、tx_hash）、`products`、`subscriptions` |
| 内容 | `skins`、`inventory_items`、`seasons`、`season_tasks`、`user_task_progress` |
| 运营 | `daily_rewards`、`referrals`、`announcements`、`economy_params`、`admin_actions`（审计） |

关键索引：`bets(round_id, user_id)`、`ledger_entries(user_id, created_at)`、`ledger_entries(idempotency_key) UNIQUE`、`rounds(table_id, round_no) UNIQUE`、`payments(provider, order_id) UNIQUE`。

---

## 9. 部署架构

第 1 节是逻辑架构；本节描述上线后的物理部署、用户 / 管理员入口、流量路径与成本。域名占位 `<域名>`，待产品名确定后替换。

### 9.1 部署拓扑

```
                     用户                                   管理员
        ┌──────────────┴──────────────┐                        │
   浏览器 (play.<域名>)        Telegram App                 admin.<域名>
        │                     │ Mini App (WebView)              │ Cloudflare Access
        └──────────┬──────────┘                                │ （指定邮箱 / IP + SSO）
                   ▼                                           ▼
         ┌─────────────────── Cloudflare ───────────────────────┐
         │  DNS · CDN · WAF · WSS 代理 · 国家头（地区限制） · Bot 防护 │
         └──────┬──────────────┬──────────────┬─────────────────┘
                │ HTTPS        │ HTTPS / WSS   │ HTTPS
                ▼              ▼               ▼
   ┌──────────────────── Railway（新加坡区，一个 Project）────────────────────┐
   │                                                                           │
   │  web (Next.js)   api (NestJS)   ws (WebSocket 网关)   admin (AdminJS)     │
   │        └─────────────┬─────────────┘                        │             │
   │                      ▼                                      │             │
   │  worker（局调度 / 行情采集 / 结算 / 定时任务，无 HTTP 入口）     │             │
   │                      │                                      │             │
   │   ───────────── 私有网络（不暴露公网）─────────────────────────│             │
   │           PostgreSQL（Railway 内置）     Redis（Railway 内置）               │
   └───────────────────────────────────────────────────────────────────────────┘
                ▲                        ▲                          ▲
    Webhook 入站│            出站 WebSocket│               出站 API   │
   NOWPayments / Stripe /        Binance / OKX / Bybit        Telegram Bot API
   Telegram Bot（Stars）                                      Resend（邮件）
```

Railway 一个 Project 内建 `staging`、`production` 两个 Environment，各自独立 Postgres / Redis 与环境变量。五个服务从同一 monorepo 按目录分别构建部署。

### 9.2 入口分布

| 角色 | 入口 | URL / 打开方式 | 落到哪个服务 | 登录 | 支付 | 隔离要求 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 玩家 | 网页版 | `https://play.<域名>` | Cloudflare → `web`；数据走 `api`（REST）+ `ws`（实时） | Google / 邮箱魔法链接 | USDT（NOWPayments）+ Stripe | 公开；命中排除地区返回限制页 |
| 玩家 | Telegram Mini App | Telegram Bot（如 `@xxx_bot`）菜单按钮或 `/start` 打开 WebView，URL 指向同一 `web` 服务（如 `https://play.<域名>/tma`） | 同上；运行时检测 Telegram 环境 | `initData` 自动登录 | Telegram Stars（Mini App 内数字商品必须走 Stars） | 与网页版共享同一账号与资产 |
| 管理员 | 运营后台 | `https://admin.<域名>` | Cloudflare Access（指定邮箱 / IP + SSO）→ `admin`（AdminJS） | AdminJS 账号密码 + 2FA | 无 | 独立域名、独立进程；用户侧完全不可达；操作写 `admin_actions` |
| — | 不对外 | 无 | `worker`、Postgres、Redis | — | — | `worker` 无 HTTP；库只走 Railway 私有网络，开发者连库用 Railway CLI 隧道 |

两个玩家入口共用 Postgres 里的同一账号与资产。后台角色再分运营 / 财务 / 超级管理员。Bot 消息与 Stars 回调由 `api` 以 Webhook 接收。

### 9.3 流量路径（典型）

- **下注**：浏览器 / TMA → Cloudflare → `api` → Postgres 写账本 + Redis 更新池量 → Redis Pub/Sub → `ws` → 推送给同桌所有人。
- **每 5 分钟结算**：`worker` 读 Redis 最新价 → 写 Postgres → 发布到 Redis → `ws` 广播结果；用户金币变动走私有频道。
- **USDT 充值**：商店下单 → `api` 调 NOWPayments 创建订单 → 用户转账 → NOWPayments IPN 回调 `api`（验签、幂等入账）→ `ws` 推送余额更新。

### 9.4 云服务清单

| 层 | 服务 | 作用 |
| :--- | :--- | :--- |
| 边缘 | **Cloudflare**（免费 / Pro） | 域名 DNS、CDN、WAF、WSS 代理、地区限制、Cloudflare Access 保护后台 |
| 计算 + 数据 | **Railway**（新加坡区） | `web` / `api` / `worker` / `ws` / `admin` + Postgres + Redis；staging / production |
| 支付 | NOWPayments、Stripe、Telegram Stars | 外部 SaaS，Webhook 回调到 `api` |
| 行情 | Binance / OKX / Bybit 公共 WS | `worker` 主动出站连接，无需账号 |
| 可观测 | Sentry、Axiom / Grafana Cloud、Better Uptime、PostHog | 错误、日志、探活、产品分析 |
| 邮件 | Resend | 魔法链接登录 |
| 代码 / CI | GitHub + GitHub Actions | PR 检查；`main` 自动部署 staging，手动提升 production |

### 9.5 成本

| 项目 | MVP 选型 | 预估月成本 |
| :--- | :--- | ---: |
| 应用托管 | **Railway**（已确认；新加坡区，web / api / worker / ws / admin 五个服务） | $20–60 |
| PostgreSQL | Railway 内置 Postgres（MVP）；流量上来后可迁 Neon | $5–25 |
| Redis | Railway 内置 Redis | $5–10 |
| CDN / WAF / WSS 代理 | Cloudflare | $0–20 |
| 错误监控 | Sentry | $0–26 |
| 日志与指标 | Axiom / Grafana Cloud | $0–25 |
| 探活 | Better Uptime | $0 |
| 产品分析 | PostHog | $0 |
| 邮件 | Resend | $0–20 |
| **合计** | | **$80–200** |

CI/CD：GitHub Actions，PR 跑 lint / typecheck / test；Railway 监听 `main` 自动部署 staging 环境，production 环境手动提升。Railway 内 Postgres / Redis 通过私有网络访问，不暴露公网。

### 9.6 扩展

MVP 全部跑在 Railway 新加坡区。需要扩容时：`api` / `ws` 直接加副本（无状态）；`worker` 加副本后靠 Redis 领导者锁保证只有一个实例在调度；Postgres 压力上来再迁 Neon 或加只读副本。

### 9.7 UAT 环境（2026-11-01 确认）

- **何时部署**：W2 局引擎能跑之后部第一版；W1 只在本地。
- **域名**：不绑自定义域名。使用 Railway 默认 HTTPS（`*.up.railway.app`）。Telegram Mini App 要求 HTTPS，该默认域名足够。
- **环境**：Railway Project 内 Environment 名为 `uat`（对应文档里的 staging）。独立 Postgres / Redis / 环境变量，与日后 `production` 隔离。
- **公开 URL（部署后填入）**：

| 服务 | UAT URL |
| :--- | :--- |
| 玩家网页 / Mini App | `https://web-xxx.up.railway.app` |
| API | `https://api-xxx.up.railway.app` |
| WS | `wss://ws-xxx.up.railway.app` |
| 后台 | `https://admin-xxx.up.railway.app` |

- **访问控制**：玩家端公开但打 `TEST` 水印；AdminJS 自身登录之外再加一层 HTTP Basic 口令。不配 Cloudflare Access（UAT 无自定义域名）。
- **支付**：W1–W3 用后台「补币」测玩法；**W4** 接 Stripe test、NOWPayments sandbox、Telegram Stars。UAT 禁止打生产收款密钥。
- **Telegram**：单独 UAT Bot（如 `@xxx_uat_bot`），Mini App URL 指向 UAT `web`。生产 Bot 另建，禁止共用 Token。
- **OAuth / 邮件回调白名单**须同时包含 `http://localhost:3000` 与 UAT `web` URL。
- **部署方式（W2 起）**：同一仓库建 4 个 Railway 服务，由 `.railway/railway.ts`（Railway IaC）统一描述（Railpack、`pnpm turbo run build --filter=<pkg>...`、pre-deploy 迁移、健康检查、区域 `sin`）；`railway config plan/apply` 套用；Node 版本由根目录 `.node-version` 固定为 22。变量清单与步骤见 `README.md`「UAT 部署」。

### 9.8 第三方账号（W1 起由你开通，密钥只放 Railway Variables / 本地 `.env`，不入库）

| 服务 | 何时要用 | 你需要准备的东西 |
| :--- | :--- | :--- |
| GitHub | W1 | 私有仓库 `sunnychoppee/BPredict`（已建）；GitHub Actions 稍后连 Railway |
| Telegram BotFather | W1 mock 可暂缓，UAT / Mini App 必须 | UAT Bot：**`@BacPredict_bot`**（已建）；Token 在 `.env`；稍后 Mini App 的 HTTPS URL |
| Google Cloud OAuth | 网页登录 | Web 应用客户端 ID + Secret（已建，Testing 模式）；测试用户：`sean.zhang.yi@gmail.com`、`zhang.yi9999@gmail.com`、`seanzhclawd@gmail.com` |
| Resend | 邮箱魔法链接 | API Key；UAT 可用 Resend 测试发件，生产再绑域名 |
| Railway | W2 UAT | 账号 + 信用卡；Project 选新加坡区 |
| NOWPayments | W4 → 上线前 | NOWPayments 已停止 Sandbox 服务（2026-11-05 在线客服确认）。**已于 2026-11-05 用正式 API 在 UAT 端到端验证**（`NOWPAYMENTS_ALLOW_LIVE=true` 临时放行）：TRC20 $12 与 BEP20 $5 两笔真实 USDT，IPN `waiting → sending → finished`、验签、全额入账、账本幂等均正确。关键结论：① 账号是 **Custody** 模式，最低限额由「支付币种 → Primary Balance 币种」决定，Primary Balance 为 USDTTRC20 时所有链最低 ~11 USD；改为 USDTBSC 后 usdtbsc 0.09 / usdtton 0.23 USDT，而 **usdttrc20 本身最低 ~10.8 USDT**（TRON 网络限制）；② `is_fixed_rate` 会让最低额翻倍、费率 1% → 1.5%，已改为浮动汇率；③ 下单前先查 `/v1/min-amount` 并给出可读错误（否则托管收银页空白）。Production 开通时：填 API Key + IPN Secret（IPN URL `<API_PUBLIC_URL>/webhooks/nowpayments`），Custody Primary Balance 设为 USDTBSC |
| Stripe | W4 | **Test** 模式 Secret `sk_test_…` + Webhook 签名密钥（endpoint `https://api-uat-123a.up.railway.app/webhooks/stripe`）；代码已就绪，待填入 Railway 变量 |
| Telegram Stars | W4 | 无需额外申请；Railway 设 `TELEGRAM_WEBHOOK_SECRET` 后 api 自动 `setWebhook`。Stars 测试需 BotFather 开 Test Server 或直接用少量真实 Stars |
| Sentry | W2 起 | 组织 + `web` / `api` / `worker` 三个 DSN（可先一个项目） |

不需要为 UAT 准备：Cloudflare、自定义域名、NOWPayments / Stripe **生产**密钥。行情源 Binance / OKX / Bybit 公共 WS，无需申请账号。

---

## 10. 安全

- 所有资产变动经账本与幂等键；代码审查禁止直接写 `balances`。
- Webhook 全部验签 + 时间戳重放保护。
- 下注接口限速：每用户每秒 5 次；全局按 IP 限速。
- MVP 不持有私钥，加密收款由服务商托管。
- 管理后台独立域名、强制 2FA、全部操作写 `admin_actions`。
- 敏感配置走环境变量 / Secrets，不入库不入仓。
- 地区限制：Cloudflare 国家头 + 服务端二次校验，命中排除清单返回限制页。

---

## 11. 测试策略

| 层级 | 覆盖 |
| :--- | :--- |
| 单元 | 结算算法（作废、单边空池、底池、取整差额、连胜封顶）、账本不变量（Σledger = balance）、路纸算法、initData 校验 |
| 集成 | 局状态机全流程、下注 / 撤销并发、支付 Webhook 幂等与重放、Stars 流程 |
| 负载 | 2,000 并发 WS 连接、每局 5,000 笔下注，验证池量更新 ≤ 250ms、结算推送 ≤ 1s |
| 混沌 | 行情源断流、调度器进程被杀、数据库短暂不可用：验证恢复、不漏局、不重复结算 |

---

## 12. 开发排期（MVP 6–8 周，1–2 名全栈）

| 周 | 内容 |
| :--- | :--- |
| W1 | monorepo、CI、Prisma schema、鉴权（Telegram + Google + 邮箱）、账本与余额服务 |
| W2 | 局引擎（状态机、调度、领导者锁）、行情采集与切换、结算与幂等、WS 网关 |
| W3 | 牌桌 UI（筹码、庄闲、拔河条、倒计时、走势图）、路纸、动效与音效、设计系统 |
| W4 | 每日奖励、商店、USDT 收单 + Stripe + Stars、VIP 订阅 |
| W5 | 连胜、排行榜、个人中心、开奖记录、运营后台基础、i18n |
| W6 | Telegram Mini App 打包与审核、负载与混沌测试、经济参数面板 |
| W7–8 | 封测（邀请 100–200 名目标用户）、数据修正、软上线 |

---

## 13. 决策记录（2026-10-30 已确认）

| 事项 | 决策 | 说明 |
| :--- | :--- | :--- |
| 收单服务商 | **NOWPayments** | 支持 TRC20 / BEP20 / TON，费率约 0.5%，KYB 较轻；备选 Cryptomus。通过 `PaymentProvider` 抽象接入，便于切换 |
| 运营后台 | ~~AdminJS 过渡~~ → **自建轻量后台（2026-11-04 W5 改）** | 直接在 api 加 `admin` 模块、web 加 `/admin` 页：少一个服务与一套登录体系，复用现有 JWT + 账本 + 设计系统；准入靠 `ADMIN_EMAILS`，写操作全部落 `admin_actions`。上线前仍按 §9.2 加 Cloudflare Access 一层 |
| 托管平台 | **Railway（新加坡区）** | 一键部署多服务、内置 Postgres / Redis，贴近目标用户区域 |
| 激励广告 SDK | **MVP 不接入** | 保留入口位，Phase 2 接入（网页版 Applixir / AdSense for Games，TMA 内 Adsgram） |
| UI 落地 | **代码优先** | 无 Figma；令牌与线框见 §3.2 |
| Mini App 首屏 | **直进牌桌** | 底部 5 Tab |
| PC 牌桌 | **右路纸常驻** | 手机无侧栏，路纸下拉 |
| 视觉 / 语言 | **全赌场 / 繁中** | 不跟随 Telegram 主题 |
| UAT | **W2 Railway 默认域名** | TEST 水印；后台 Basic 口令；W4 再接支付沙箱 |

### 13.1 经济参数初始值（与 `PRD_v2.md` 第 7 节一致，存于 `economy_params`）

| 参数 | 值 |
| :--- | :--- |
| `exchange_rate_coins_per_usdt` | 10,000 |
| `exchange_rate_gems_per_usdt` | 100 |
| `fee_rate` | 0.04 |
| `seed_pool_per_side` | 5,000 |
| `min_bet` | 100 |
| `max_bet_per_round_normal` / `_vip` | 200,000 / 1,000,000 |
| `welcome_pack` | 20,000 |
| `daily_checkin[7]` | 2,000 / 2,500 / 3,000 / 3,500 / 4,000 / 5,000 / 8,000 |
| `timed_supply_amount` / `_interval_h` / `_max_stack` | 1,000 / 4 / 2 |
| `relief_amount` / `_threshold` | 2,000 / 500 |
| `referral_reward` / `_rounds_required` / `_max_count` | 5,000 / 20 / 20 |
| `streak_bonus` | 3 连 5%、5 连 10%、10 连 20%；单局封顶 20,000 |
| `first_charge_multiplier` | 2.0（限一次） |
| `coin_packs` | 5/10/30/100/300 USDT → 50k/110k/360k/1.3M/4.2M |
| `vip_monthly_price` / `vip_daily_coins` | 9.99 USDT / 10,000 |
| `season_pass_price` | 4.99 USDT |
