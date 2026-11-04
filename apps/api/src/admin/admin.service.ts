import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bpredict/db";
import {
  DEFAULT_ECONOMY,
  rewardDay,
  type AdminActionRow,
  type AdminAdjustInput,
  type AdminEconomyInput,
  type AdminFreezeInput,
  type AdminLedgerRow,
  type AdminOverview,
  type AdminPaymentRow,
  type AdminProductInput,
  type AdminRoundRow,
  type AdminUserRow,
  type AdminVipInput,
  type Currency,
  type LedgerType,
} from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService, InsufficientFundsError } from "../ledger/ledger.service";
import { EconomyService } from "../economy/economy.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE = 50;
const DEFAULTS = DEFAULT_ECONOMY as unknown as Record<string, unknown>;

/** Day start (UTC+8) of the current reward day as a Date. */
function todayStart(): Date {
  const day = rewardDay(Date.now());
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 8 * 3_600_000);
}

@Injectable()
export class AdminService {
  private readonly log = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly economy: EconomyService,
  ) {}

  // ------------------------------------------------------------------ audit

  private async audit(adminUserId: string, action: string, targetType: string | null, targetId: string | null, payload?: unknown) {
    await this.prisma.adminAction.create({
      data: { adminUserId, action, targetType, targetId, payload: payload === undefined ? Prisma.JsonNull : (payload as Prisma.InputJsonValue) },
    });
    this.log.log(`admin ${adminUserId} ${action} ${targetType ?? ""}:${targetId ?? ""}`);
  }

  async actions(limit = PAGE): Promise<AdminActionRow[]> {
    const rows = await this.prisma.adminAction.findMany({ orderBy: { id: "desc" }, take: limit });
    const admins = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.adminUserId))] } }, select: { id: true, nickname: true } });
    const nick = new Map(admins.map((a) => [a.id, a.nickname]));
    return rows.map((r) => ({
      id: r.id.toString(),
      adminUserId: r.adminUserId,
      adminNickname: nick.get(r.adminUserId) ?? "?",
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------------ overview

  async overview(): Promise<AdminOverview> {
    const since = todayStart();
    const [total, newToday, vip, frozen, activeRow, circ, issued, recovered, rounds, pay, payTotal, pending] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { isVip: true, OR: [{ vipExpiresAt: null }, { vipExpiresAt: { gt: new Date() } }] } }),
      this.prisma.user.count({ where: { frozenAt: { not: null } } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT user_id)::bigint AS n FROM bets WHERE created_at >= ${since}`,
      this.prisma.balance.aggregate({ where: { currency: "COINS" }, _sum: { amount: true } }),
      this.prisma.ledgerEntry.aggregate({ where: { currency: "COINS", amount: { gt: 0n }, type: { notIn: ["PAYOUT", "BET_CANCEL", "REFUND"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.round.aggregate({ where: { status: "SETTLED", settledAt: { gte: since } }, _sum: { fee: true, destroyed: true } }),
      this.prisma.$queryRaw<{ settled: bigint; voided: bigint; staked: bigint }[]>`
        SELECT COUNT(*) FILTER (WHERE status = 'SETTLED')::bigint AS settled,
               COUNT(*) FILTER (WHERE status = 'VOIDED')::bigint AS voided,
               COALESCE(SUM(pool_banker + pool_player) FILTER (WHERE status = 'SETTLED'), 0)::bigint AS staked
          FROM rounds WHERE close_at >= ${since} AND status IN ('SETTLED', 'VOIDED')`,
      this.prisma.payment.aggregate({ where: { status: { in: ["PAID", "PARTIALLY_PAID"] }, paidAt: { gte: since } }, _count: true, _sum: { paidAmount: true } }),
      this.prisma.payment.aggregate({ where: { status: { in: ["PAID", "PARTIALLY_PAID"] } }, _count: true, _sum: { paidAmount: true } }),
      this.prisma.payment.count({ where: { status: "PENDING" } }),
    ]);
    const r = rounds[0];
    return {
      generatedAt: Date.now(),
      users: { total, newToday, activeToday: Number(activeRow[0]?.n ?? 0n), vip, frozen },
      coins: {
        circulating: Number(circ._sum.amount ?? 0n),
        issuedToday: Number(issued._sum.amount ?? 0n),
        recoveredToday: Number(recovered._sum.fee ?? 0n) + Number(recovered._sum.destroyed ?? 0n),
      },
      rounds: { settledToday: Number(r?.settled ?? 0n), voidedToday: Number(r?.voided ?? 0n), stakedToday: Number(r?.staked ?? 0n), feeToday: Number(recovered._sum.fee ?? 0n) },
      payments: {
        paidToday: pay._count,
        usdtToday: Number(pay._sum.paidAmount ?? 0),
        paidTotal: payTotal._count,
        usdtTotal: Number(payTotal._sum.paidAmount ?? 0),
        pending,
      },
    };
  }

  // ------------------------------------------------------------------ economy & products

  async economyParams() {
    const rows = await this.prisma.economyParam.findMany({ orderBy: { key: "asc" } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.keys(DEFAULT_ECONOMY).map((key) => ({
      key,
      value: byKey.get(key)?.value ?? DEFAULTS[key],
      default: DEFAULTS[key],
      updatedAt: byKey.get(key)?.updatedAt.toISOString() ?? null,
    }));
  }

  async setEconomyParam(adminId: string, input: AdminEconomyInput) {
    if (!(input.key in DEFAULT_ECONOMY)) throw new BadRequestException("unknown key");
    const def = DEFAULTS[input.key];
    if (typeof def !== typeof input.value || Array.isArray(def) !== Array.isArray(input.value)) throw new BadRequestException(`value must be ${Array.isArray(def) ? "array" : typeof def}`);
    const before = await this.prisma.economyParam.findUnique({ where: { key: input.key } });
    await this.prisma.economyParam.upsert({
      where: { key: input.key },
      create: { key: input.key, value: input.value as Prisma.InputJsonValue },
      update: { value: input.value as Prisma.InputJsonValue },
    });
    this.economy.invalidate();
    await this.audit(adminId, "ECONOMY_SET", "economy_param", input.key, { before: before?.value ?? null, after: input.value });
    return { ok: true };
  }

  async products() {
    const rows = await this.prisma.product.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] });
    return rows.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      priceUsdt: Number(p.priceUsdt),
      priceStars: p.priceStars,
      coins: Number(p.coins),
      gems: p.gems,
      bonusPct: p.bonusPct,
      vipDays: p.vipDays,
      sortOrder: p.sortOrder,
      enabled: p.enabled,
    }));
  }

  async updateProduct(adminId: string, id: string, input: AdminProductInput) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("product not found");
    await this.prisma.product.update({ where: { id }, data: input });
    await this.audit(adminId, "PRODUCT_UPDATE", "product", id, input);
    return { ok: true };
  }

  // ------------------------------------------------------------------ users

  async searchUsers(q: string, limit = PAGE): Promise<AdminUserRow[]> {
    const term = q.trim();
    const where: Prisma.UserWhereInput = !term
      ? {}
      : UUID_RE.test(term)
        ? { id: term }
        : { OR: [{ nickname: { contains: term, mode: "insensitive" } }, { identities: { some: { OR: [{ email: { contains: term, mode: "insensitive" } }, { providerUid: term }] } } }] };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { identities: { select: { provider: true, email: true, providerUid: true } }, balances: true, stats: true },
    });
    const paid = users.length
      ? await this.prisma.payment.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, _sum: { paidAmount: true } })
      : [];
    const paidBy = new Map(paid.map((p) => [p.userId, Number(p._sum.paidAmount ?? 0)]));
    return users.map((u) => this.toUserRow(u, paidBy.get(u.id) ?? 0));
  }

  async user(id: string): Promise<AdminUserRow> {
    if (!UUID_RE.test(id)) throw new NotFoundException();
    const u = await this.prisma.user.findUnique({ where: { id }, include: { identities: { select: { provider: true, email: true, providerUid: true } }, balances: true, stats: true } });
    if (!u) throw new NotFoundException("user not found");
    const paid = await this.prisma.payment.aggregate({ where: { userId: id, status: { in: ["PAID", "PARTIALLY_PAID"] } }, _sum: { paidAmount: true } });
    return this.toUserRow(u, Number(paid._sum.paidAmount ?? 0));
  }

  private toUserRow(
    u: {
      id: string;
      nickname: string;
      avatarUrl: string | null;
      locale: string;
      isVip: boolean;
      vipExpiresAt: Date | null;
      frozenAt: Date | null;
      createdAt: Date;
      identities: { provider: string; email: string | null; providerUid: string }[];
      balances: { currency: Currency; amount: bigint }[];
      stats: { totalRounds: number; wins: number; currentStreak: number; maxStreak: number; netProfit: bigint } | null;
    },
    paidUsdt: number,
  ): AdminUserRow {
    return {
      id: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      locale: u.locale,
      isVip: u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > new Date()),
      vipExpiresAt: u.vipExpiresAt?.toISOString() ?? null,
      frozenAt: u.frozenAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      identities: u.identities,
      balances: (["COINS", "GEMS"] as const).map((c) => ({ currency: c, amount: Number(u.balances.find((b) => b.currency === c)?.amount ?? 0n) })),
      stats: u.stats ? { totalRounds: u.stats.totalRounds, wins: u.stats.wins, currentStreak: u.stats.currentStreak, maxStreak: u.stats.maxStreak, netProfit: Number(u.stats.netProfit) } : null,
      paidUsdt,
    };
  }

  async userLedger(id: string, limit = PAGE, before?: string): Promise<AdminLedgerRow[]> {
    if (!UUID_RE.test(id)) throw new NotFoundException();
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId: id, ...(before ? { id: { lt: BigInt(before) } } : {}) },
      orderBy: { id: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      type: r.type as LedgerType,
      currency: r.currency,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      refType: r.refType,
      refId: r.refId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Manual credit/debit through the ledger (never a direct balance write). */
  async adjust(adminId: string, userId: string, input: AdminAdjustInput) {
    if (!UUID_RE.test(userId)) throw new NotFoundException();
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException("user not found");
    const key = `admin:${adminId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    try {
      await this.ledger.post({
        userId,
        currency: input.currency,
        amount: input.amount,
        type: "ADMIN_ADJUST",
        refType: "admin",
        refId: adminId,
        idempotencyKey: key,
        meta: { reason: input.reason },
      });
    } catch (e) {
      if (e instanceof InsufficientFundsError) throw new BadRequestException("balance would go negative");
      throw e;
    }
    await this.ledger.publishBalance(userId, input.currency, "admin_adjust");
    await this.audit(adminId, "ADJUST", "user", userId, { ...input, idempotencyKey: key });
    return { ok: true, balance: Number(await this.ledger.balance(userId, input.currency)) };
  }

  async freeze(adminId: string, userId: string, input: AdminFreezeInput) {
    if (!UUID_RE.test(userId)) throw new NotFoundException();
    if (userId === adminId && input.frozen) throw new BadRequestException("cannot freeze yourself");
    const r = await this.prisma.user.updateMany({ where: { id: userId }, data: { frozenAt: input.frozen ? new Date() : null } });
    if (r.count === 0) throw new NotFoundException("user not found");
    await this.audit(adminId, input.frozen ? "FREEZE" : "UNFREEZE", "user", userId, { reason: input.reason });
    return { ok: true };
  }

  /** Grant (or revoke, with negative days) VIP time, extending from max(now, current expiry). */
  async vip(adminId: string, userId: string, input: AdminVipInput) {
    if (!UUID_RE.test(userId)) throw new NotFoundException();
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { vipExpiresAt: true, isVip: true } });
    if (!u) throw new NotFoundException("user not found");
    const now = Date.now();
    const base = Math.max(now, u.vipExpiresAt?.getTime() ?? 0);
    const next = new Date(base + input.days * 86_400_000);
    const active = next.getTime() > now;
    await this.prisma.user.update({ where: { id: userId }, data: { isVip: active, vipExpiresAt: active ? next : new Date(now) } });
    await this.audit(adminId, "VIP_SET", "user", userId, { days: input.days, reason: input.reason, vipExpiresAt: active ? next.toISOString() : null });
    return { ok: true, isVip: active, vipExpiresAt: active ? next.toISOString() : null };
  }

  // ------------------------------------------------------------------ payments & rounds

  async payments(status?: string, limit = PAGE, before?: string): Promise<AdminPaymentRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(before ? { createdAt: { lt: new Date(Number(before)) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { nickname: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      userId: p.userId,
      nickname: p.user.nickname,
      productId: p.productId,
      provider: p.provider,
      status: p.status,
      priceUsdt: Number(p.priceUsdt),
      paidAmount: p.paidAmount == null ? null : Number(p.paidAmount),
      asset: p.asset,
      chain: p.chain,
      creditedCoins: Number(p.creditedCoins),
      creditedGems: p.creditedGems,
      firstCharge: p.firstCharge,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    }));
  }

  async rounds(tableId: string, limit = PAGE, before?: string): Promise<AdminRoundRow[]> {
    const rows = await this.prisma.round.findMany({
      where: { tableId, status: { in: ["SETTLED", "VOIDED"] }, ...(before ? { closeAt: { lt: new Date(Number(before)) } } : {}) },
      orderBy: { closeAt: "desc" },
      take: limit,
    });
    const counts = rows.length
      ? await this.prisma.$queryRaw<{ round_id: string; n: bigint }[]>`
          SELECT round_id, COUNT(DISTINCT user_id)::bigint AS n FROM bets
           WHERE cancelled_at IS NULL AND round_id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}::uuid`))})
           GROUP BY round_id`
      : [];
    const bettors = new Map(counts.map((c) => [c.round_id, Number(c.n)]));
    return rows.map((r) => ({
      id: r.id,
      roundNo: Number(r.roundNo),
      status: r.status,
      lockPrice: r.lockPrice == null ? null : Number(r.lockPrice),
      closePrice: r.closePrice == null ? null : Number(r.closePrice),
      winner: r.winner,
      poolBanker: Number(r.poolBanker),
      poolPlayer: Number(r.poolPlayer),
      fee: Number(r.fee ?? 0n),
      destroyed: Number(r.destroyed ?? 0n),
      bettors: bettors.get(r.id) ?? 0,
      closeAt: r.closeAt.toISOString(),
      voidReason: r.voidReason,
    }));
  }
}
