import { BadRequestException, Body, Controller, Get, NotFoundException, Patch, Query, UseGuards } from "@nestjs/common";
import { updateMeSchema, type MeResponse, type MyRoundView, type UserStatsView } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { isAdminEmail } from "../admin/admin.guard";

const HISTORY_MAX = 100;

@Controller("me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  @Get()
  async me(@CurrentUser() auth: AuthUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.id },
      include: { identities: { select: { provider: true, email: true } } },
    });
    if (!user) throw new NotFoundException();
    const balances = await this.ledger.balances(user.id);
    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        uiMode: user.uiMode,
        isVip: user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date()),
        vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      balances: balances.map((b) => ({ currency: b.currency, amount: Number(b.amount) })),
      identities: user.identities,
      isAdmin: user.identities.some((i) => isAdminEmail(i.email)),
    };
  }

  /** Edit nickname, UI locale and/or UI skin. */
  @Patch()
  async update(@CurrentUser() auth: AuthUser, @Body() body: unknown) {
    const parsed = updateMeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join("; "));
    const u = await this.prisma.user.update({ where: { id: auth.id }, data: parsed.data, select: { nickname: true, locale: true, uiMode: true } });
    return u;
  }

  /** Lifetime play stats (from settlement). Zeros for users who have not played. */
  @Get("stats")
  async stats(@CurrentUser() auth: AuthUser): Promise<UserStatsView> {
    const s = await this.prisma.userStats.findUnique({ where: { userId: auth.id } });
    return {
      totalRounds: s?.totalRounds ?? 0,
      wins: s?.wins ?? 0,
      currentStreak: s?.currentStreak ?? 0,
      maxStreak: s?.maxStreak ?? 0,
      netProfit: Number(s?.netProfit ?? 0n),
    };
  }

  /**
   * My settled / voided rounds, newest first. Cursor = `before` (closeAt epoch ms).
   * Voided rounds show payout = stake (full refund, net 0).
   */
  @Get("rounds")
  async rounds(@CurrentUser() auth: AuthUser, @Query("limit") limitQ?: string, @Query("before") beforeQ?: string): Promise<{ items: MyRoundView[]; nextBefore: number | null }> {
    const limit = Math.min(HISTORY_MAX, Math.max(1, Number(limitQ) || 30));
    const before = beforeQ ? new Date(Number(beforeQ)) : new Date(Date.now() + 86_400_000);
    if (Number.isNaN(before.getTime())) throw new BadRequestException("bad cursor");

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        round_no: bigint;
        table_id: string;
        close_at: Date;
        status: string;
        winner: "BANKER" | "PLAYER" | null;
        lock_price: unknown;
        close_price: unknown;
        stake: bigint;
        has_b: boolean;
        has_p: boolean;
        payout: bigint | null;
        streak_bonus: bigint | null;
      }[]
    >`
      SELECT r.id, r.round_no, r.table_id, r.close_at, r.status, r.winner, r.lock_price, r.close_price,
             SUM(b.amount) AS stake,
             BOOL_OR(b.side = 'BANKER') AS has_b,
             BOOL_OR(b.side = 'PLAYER') AS has_p,
             p.payout, p.streak_bonus
        FROM bets b
        JOIN rounds r ON r.id = b.round_id
        LEFT JOIN round_payouts p ON p.round_id = r.id AND p.user_id = b.user_id
       WHERE b.user_id = ${auth.id}::uuid AND b.cancelled_at IS NULL
         AND r.status IN ('SETTLED', 'VOIDED') AND r.close_at < ${before}
       GROUP BY r.id, p.payout, p.streak_bonus
       ORDER BY r.close_at DESC
       LIMIT ${limit + 1}`;

    const page = rows.slice(0, limit);
    const items: MyRoundView[] = page.map((r) => {
      const stake = Number(r.stake);
      // round_payouts.payout is the base payout; the streak bonus is paid on top of it.
      const payout = r.status === "VOIDED" ? stake : Number(r.payout ?? 0n) + Number(r.streak_bonus ?? 0n);
      return {
        roundId: r.id,
        roundNo: Number(r.round_no),
        tableId: r.table_id,
        closeAt: r.close_at.getTime(),
        winner: r.status === "VOIDED" ? null : r.winner,
        lockPrice: r.lock_price == null ? null : Number(String(r.lock_price)),
        closePrice: r.close_price == null ? null : Number(String(r.close_price)),
        side: r.has_b && r.has_p ? "MIXED" : r.has_b ? "BANKER" : "PLAYER",
        stake,
        payout,
        streakBonus: Number(r.streak_bonus ?? 0n),
        net: payout - stake,
      };
    });
    const nextBefore = rows.length > limit ? page[page.length - 1]!.close_at.getTime() : null;
    return { items, nextBefore };
  }
}
