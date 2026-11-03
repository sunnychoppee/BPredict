import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { LedgerService } from "./ledger.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get("balances")
  balances(@CurrentUser() user: AuthUser) {
    return this.ledger.balances(user.id);
  }

  @Get("ledger")
  async history(@CurrentUser() user: AuthUser, @Query("limit") limit?: string, @Query("before") before?: string) {
    const rows = await this.ledger.history(user.id, limit ? Number(limit) : 50, before ? BigInt(before) : undefined);
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }
}
