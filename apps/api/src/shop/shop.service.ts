import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Payment, PaymentStatus, Prisma, Product } from "@bpredict/db";
import { USDT_CHAINS, type CreateOrderInput, type CreateOrderResult, type PaymentView, type ProductView, type ShopView } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { EconomyService } from "../economy/economy.service";
import { isProduction } from "../config/env";
import type { PaymentProviderAdapter } from "./providers/provider";
import { NowPaymentsProvider } from "./providers/nowpayments.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { TelegramStarsProvider } from "./providers/telegram-stars.provider";
import { DevProvider } from "./providers/dev.provider";

/** What a provider webhook tells us about an order. */
export interface SettleInput {
  paymentId: string;
  /** Provider-side id to persist (Stars charge id; otherwise usually already stored). */
  providerOrderId?: string;
  status: "PAID" | "PARTIALLY_PAID" | "EXPIRED" | "FAILED";
  /** Fraction of the price actually received (1 = full). Used for partial USDT payments. */
  ratio?: number;
  paidAmount?: number;
  asset?: string;
  txHash?: string;
  meta?: Record<string, unknown>;
}

const MAX_PENDING_PER_USER = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ShopService {
  private readonly log = new Logger(ShopService.name);
  private readonly providers: PaymentProviderAdapter[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly economy: EconomyService,
    nowpayments: NowPaymentsProvider,
    stripe: StripeProvider,
    stars: TelegramStarsProvider,
    dev: DevProvider,
  ) {
    this.providers = [nowpayments, stripe, stars, dev];
  }

  // ---------- catalogue ----------

  async view(userId: string): Promise<ShopView> {
    const [products, user, rewards, p] = await Promise.all([
      this.prisma.product.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isVip: true, vipExpiresAt: true } }),
      this.prisma.userRewards.findUnique({ where: { userId }, select: { firstChargeAt: true } }),
      this.economy.get(),
    ]);
    const now = Date.now();
    return {
      products: products.map(toProductView),
      channels: this.providers.map((a) => ({ id: a.id, label: a.label, enabled: a.enabled(), note: a.note })),
      usdtChains: USDT_CHAINS,
      firstChargeAvailable: !rewards?.firstChargeAt,
      firstChargeMultiplier: p.first_charge_multiplier,
      isVip: user.isVip && (!user.vipExpiresAt || user.vipExpiresAt.getTime() > now),
      vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
      vipDailyCoins: p.vip_daily_coins,
    };
  }

  // ---------- orders ----------

  async createOrder(userId: string, input: CreateOrderInput): Promise<CreateOrderResult> {
    const adapter = this.providers.find((a) => a.id === input.provider);
    if (!adapter || !adapter.enabled()) throw new BadRequestException("此支付渠道目前不可用");
    if (adapter.id === "DEV" && isProduction) throw new ForbiddenException();

    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.enabled) throw new NotFoundException("商品不存在");
    if (adapter.id === "NOWPAYMENTS" && !input.chain) throw new BadRequestException("請選擇 USDT 網路");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { frozenAt: true } });
    if (user.frozenAt) throw new ForbiddenException("帳號已凍結購買功能");

    const pending = await this.prisma.payment.count({
      where: { userId, status: "PENDING", createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (pending >= MAX_PENDING_PER_USER) throw new BadRequestException("待付款訂單過多，請先完成或稍後再試");

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        productId: product.id,
        provider: adapter.id,
        priceUsdt: product.priceUsdt,
        chain: input.chain ?? null,
        asset: adapter.id === "NOWPAYMENTS" ? "USDT" : adapter.id === "TELEGRAM_STARS" ? "XTR" : "USD",
      },
    });

    let checkout;
    try {
      checkout = await adapter.createCheckout({ payment, product, userId, chain: input.chain });
    } catch (e) {
      this.log.error(`${adapter.id} checkout failed for ${payment.id}: ${(e as Error).message}`);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", meta: { error: (e as Error).message } } });
      throw new BadGatewayException("建立訂單失敗，請稍後再試");
    }

    let updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerOrderId: checkout.providerOrderId,
        payUrl: checkout.payUrl,
        expiresAt: checkout.expiresAt,
        meta: (checkout.meta ?? {}) as Prisma.InputJsonValue,
      },
      include: { product: true },
    });

    if (adapter.id === "DEV") {
      updated = await this.settle({ paymentId: payment.id, status: "PAID", ratio: 1, paidAmount: Number(product.priceUsdt), asset: "TEST" });
    }

    return { payment: toPaymentView(updated), next: checkout.next };
  }

  async getOrder(userId: string, id: string): Promise<PaymentView> {
    if (!UUID_RE.test(id)) throw new NotFoundException();
    const row = await this.prisma.payment.findFirst({ where: { id, userId }, include: { product: true } });
    if (!row) throw new NotFoundException();
    return toPaymentView(await this.lazyExpire(row));
  }

  async listOrders(userId: string, limit = 20): Promise<PaymentView[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId, NOT: { status: "FAILED" } },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: { product: true },
    });
    return rows.map(toPaymentView);
  }

  /** Find a pending order by our id — used by webhooks that echo `order_id` / `payload`. */
  async findById(id: string) {
    if (!UUID_RE.test(id)) return null;
    return this.prisma.payment.findUnique({ where: { id }, include: { product: true } });
  }

  findByProviderOrderId(provider: Payment["provider"], providerOrderId: string) {
    return this.prisma.payment.findUnique({ where: { provider_providerOrderId: { provider, providerOrderId } }, include: { product: true } });
  }

  private async lazyExpire<T extends Payment>(row: T): Promise<T> {
    if (row.status === "PENDING" && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.prisma.payment.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      return { ...row, status: "EXPIRED" as PaymentStatus };
    }
    return row;
  }

  // ---------- settlement (idempotent) ----------

  /**
   * Apply a provider outcome to an order. Safe to call repeatedly: the PENDING → terminal
   * transition is claimed with a conditional update, and ledger posts carry fixed keys.
   */
  async settle(input: SettleInput): Promise<Payment & { product: Product }> {
    const p = await this.economy.get();
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { product: true } });
      if (!payment) throw new NotFoundException("order not found");
      if (payment.status !== "PENDING") return { payment, credited: false };

      const terminal = input.status;
      const ratio = terminal === "PAID" ? 1 : terminal === "PARTIALLY_PAID" ? Math.max(0, Math.min(1, input.ratio ?? 0)) : 0;
      const shouldCredit = ratio > 0;

      // First charge: only a full coin-pack purchase counts, and only once per user.
      let firstCharge = false;
      let coins = 0n;
      let gems = 0;
      let vipDays = 0;
      if (shouldCredit) {
        const product = payment.product;
        if (product.type === "COINS") {
          coins = BigInt(Math.floor(Number(product.coins) * ratio));
          if (ratio >= 1) {
            // Make sure the rewards row exists, then atomically claim the first-charge flag.
            await tx.userRewards.upsert({ where: { userId: payment.userId }, create: { userId: payment.userId }, update: {} });
            const marked = await tx.userRewards.updateMany({
              where: { userId: payment.userId, firstChargeAt: null },
              data: { firstChargeAt: new Date() },
            });
            firstCharge = marked.count === 1;
            if (firstCharge) coins = (coins * BigInt(Math.round(p.first_charge_multiplier * 100))) / 100n;
          }
        } else if (product.type === "GEMS") {
          gems = Math.floor(product.gems * ratio);
        } else if (product.type === "VIP") {
          vipDays = Math.floor(product.vipDays * ratio);
        }
      }

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: terminal,
          providerOrderId: input.providerOrderId ?? payment.providerOrderId,
          paidAt: shouldCredit ? new Date() : null,
          paidAmount: input.paidAmount,
          asset: input.asset ?? payment.asset,
          txHash: input.txHash,
          creditedCoins: coins,
          creditedGems: gems,
          firstCharge,
          meta: { ...((payment.meta as Record<string, unknown> | null) ?? {}), ...(input.meta ?? {}), ratio } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) {
        const again = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { product: true } });
        return { payment: again, credited: false };
      }

      if (coins > 0n) {
        await this.ledger.postIn(tx, {
          userId: payment.userId,
          currency: "COINS",
          amount: coins,
          type: "PURCHASE",
          idempotencyKey: `payment:${payment.id}:coins`,
          refType: "payment",
          refId: payment.id,
          meta: { provider: payment.provider, productId: payment.productId, firstCharge, ratio },
        });
      }
      if (gems > 0) {
        await this.ledger.postIn(tx, {
          userId: payment.userId,
          currency: "GEMS",
          amount: gems,
          type: "PURCHASE",
          idempotencyKey: `payment:${payment.id}:gems`,
          refType: "payment",
          refId: payment.id,
          meta: { provider: payment.provider, productId: payment.productId, ratio },
        });
      }
      if (vipDays > 0) {
        const u = await tx.user.findUniqueOrThrow({ where: { id: payment.userId }, select: { vipExpiresAt: true } });
        const base = Math.max(Date.now(), u.vipExpiresAt?.getTime() ?? 0);
        await tx.user.update({
          where: { id: payment.userId },
          data: { isVip: true, vipExpiresAt: new Date(base + vipDays * 86_400_000) },
        });
      }

      const final = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { product: true } });
      return { payment: final, credited: shouldCredit, coins, gems, vipDays };
    });

    if (result.credited) {
      this.log.log(
        `settled ${result.payment.provider} ${result.payment.id} → ${result.payment.status} coins=${result.coins} gems=${result.gems} vipDays=${result.vipDays}${result.payment.firstCharge ? " (first charge)" : ""}`,
      );
      if ((result.coins ?? 0n) > 0n) await this.ledger.publishBalance(result.payment.userId, "COINS", "purchase");
      if ((result.gems ?? 0) > 0) await this.ledger.publishBalance(result.payment.userId, "GEMS", "purchase");
    }
    return result.payment;
  }
}

export function toProductView(p: Product): ProductView {
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    priceUsdt: Number(p.priceUsdt),
    priceStars: p.priceStars,
    coins: Number(p.coins),
    gems: p.gems,
    bonusPct: p.bonusPct,
    vipDays: p.vipDays,
  };
}

export function toPaymentView(p: Payment & { product: Product }): PaymentView {
  return {
    id: p.id,
    productId: p.productId,
    productName: p.product.name,
    provider: p.provider,
    status: p.status,
    priceUsdt: Number(p.priceUsdt),
    chain: p.chain,
    creditedCoins: Number(p.creditedCoins),
    creditedGems: p.creditedGems,
    firstCharge: p.firstCharge,
    payUrl: p.payUrl,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    expiresAt: p.expiresAt?.toISOString() ?? null,
  };
}
