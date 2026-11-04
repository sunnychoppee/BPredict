import { BadRequestException, Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { LEADERBOARD_BOARDS, LEADERBOARD_PERIODS, type LeaderboardBoard, type LeaderboardPeriod } from "@bpredict/shared";
import { LeaderboardService } from "./leaderboard.service";
import { OptionalJwtAuthGuard } from "../auth/jwt.guard";
import type { AuthUser } from "../auth/current-user.decorator";

@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly lb: LeaderboardService) {}

  /** Public; includes the caller's own row when a valid token is supplied. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  view(@Query("board") board = "profit", @Query("period") period = "day", @Req() req: Request & { user?: AuthUser }) {
    if (!LEADERBOARD_BOARDS.includes(board as LeaderboardBoard)) throw new BadRequestException("bad board");
    if (!LEADERBOARD_PERIODS.includes(period as LeaderboardPeriod)) throw new BadRequestException("bad period");
    return this.lb.view(board as LeaderboardBoard, period as LeaderboardPeriod, req.user?.id ?? null);
  }
}
