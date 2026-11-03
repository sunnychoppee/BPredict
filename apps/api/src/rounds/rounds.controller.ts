import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { placeBetSchema, type PlaceBetInput } from "@bpredict/shared";
import { RoundsService } from "./rounds.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { RateLimitGuard } from "../common/rate-limit.guard";

@Controller()
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Get("tables/:tableId/state")
  state(@Param("tableId") tableId: string) {
    return this.rounds.snapshot(tableId);
  }

  @Get("tables/:tableId/rounds")
  history(@Param("tableId") tableId: string, @Query("limit") limit?: string, @Query("before") before?: string) {
    return this.rounds.history(tableId, limit ? Number(limit) : 50, before ? Number(before) : undefined);
  }

  @Post("rounds/:roundId/bets")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  place(@Param("roundId") roundId: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(placeBetSchema)) body: PlaceBetInput) {
    return this.rounds.placeBet(roundId, user.id, body.side, body.amount, body.nonce);
  }

  @Delete("rounds/:roundId/bets")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  cancel(@Param("roundId") roundId: string, @CurrentUser() user: AuthUser) {
    return this.rounds.cancelBets(roundId, user.id);
  }

  @Get("rounds/:roundId/bets/me")
  @UseGuards(JwtAuthGuard)
  mine(@Param("roundId") roundId: string, @CurrentUser() user: AuthUser) {
    return this.rounds.myBets(roundId, user.id);
  }
}
