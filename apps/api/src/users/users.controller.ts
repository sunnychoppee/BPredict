import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import type { MeResponse, UserStatsView } from "@bpredict/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

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
        isVip: user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date()),
        vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      balances: balances.map((b) => ({ currency: b.currency, amount: Number(b.amount) })),
      identities: user.identities,
    };
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
}
